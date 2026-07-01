import type { AlbumImage } from '../../src/types/album'
import {
  ASYNC_JOB_MIN_PHOTOS,
  INDEX_BATCH_SIZE,
} from './config'
import {
  indexAlbumBatch,
  prepareAlbumCollection,
  searchAlbumCollection,
  type CollectionSearchResult,
} from './collectionSearchService'
import {
  createAlbumProcessingJob,
  findActiveJobByFingerprint,
  findFailedJobByFingerprint,
  getAlbumProcessingJobById,
  isAlbumJobStoreAvailable,
  jobStatusMessage,
  resetFailedJobForRetry,
  updateAlbumProcessingJob,
  cancelAlbumProcessingJobForUser,
  type AlbumProcessingJobRow,
} from '../supabase/albumProcessingJobStore'
import {
  getAlbumCollectionById,
  getIndexedImageIds,
  hashAlbumUrl,
} from '../supabase/albumCollectionStore'

export type AlbumJobErrorCode =
  | 'AWS_CREDENTIALS_MISSING'
  | 'AWS_REKOGNITION_ERROR'
  | 'RECOGNITION_REFERENCE_EXPIRED'
  | 'RECOGNITION_INDEXING_FAILED'
  | 'RECOGNITION_SEARCH_FAILED'
  | 'RECOGNITION_COLLECTION_METADATA_ERROR'
  | 'ALBUM_JOB_NOT_FOUND'
  | 'ALBUM_JOB_FAILED'

const MESSAGES: Record<AlbumJobErrorCode, string> = {
  AWS_CREDENTIALS_MISSING: 'El reconocimiento facial no está configurado en el servidor.',
  AWS_REKOGNITION_ERROR: 'AWS Rekognition no pudo completar la operación.',
  RECOGNITION_REFERENCE_EXPIRED: 'La referencia expiró. Volvé a subir la foto o sacate otra selfie.',
  RECOGNITION_INDEXING_FAILED: 'No pudimos indexar algunas fotos del álbum.',
  RECOGNITION_SEARCH_FAILED: 'No pudimos buscar coincidencias en el álbum.',
  RECOGNITION_COLLECTION_METADATA_ERROR: 'No pudimos guardar el análisis del álbum.',
  ALBUM_JOB_NOT_FOUND: 'No encontramos el trabajo de análisis.',
  ALBUM_JOB_FAILED: 'El análisis del álbum falló.',
}

function fail(code: AlbumJobErrorCode, message?: string, fallbackAvailable = true) {
  return {
    ok: false as const,
    error: {
      code,
      message: message ?? MESSAGES[code],
      fallbackAvailable,
    },
  }
}

export interface AlbumJobStatusPayload {
  jobId: string
  status: AlbumProcessingJobRow['status']
  message: string
  totalImages: number
  processedImages: number
  indexedImages: number
  indexedFaces: number
  failedImages: number
  currentBatch: number
  totalBatches: number
  collectionReused: boolean
  albumCollectionId: string
  collectionId: string
  albumFingerprint: string
  progressPercent: number
}

function toStatusPayload(
  job: AlbumProcessingJobRow,
  collectionId: string,
  collectionReused: boolean,
): AlbumJobStatusPayload {
  const progressPercent = job.total_images > 0
    ? Math.min(100, Math.round((job.indexed_images / job.total_images) * 100))
    : 0

  return {
    jobId: job.id,
    status: job.status,
    message: jobStatusMessage(job),
    totalImages: job.total_images,
    processedImages: job.processed_images,
    indexedImages: job.indexed_images,
    indexedFaces: job.indexed_faces,
    failedImages: job.failed_images,
    currentBatch: job.current_batch,
    totalBatches: job.total_batches,
    collectionReused,
    albumCollectionId: job.album_collection_id,
    collectionId,
    albumFingerprint: job.album_fingerprint,
    progressPercent,
  }
}

export type AlbumJobStartMode = 'sync' | 'async' | 'collection_ready'

export interface AlbumJobStartSuccess {
  ok: true
  mode: AlbumJobStartMode
  jobId: string | null
  reusedJob: boolean
  collectionReused: boolean
  albumFingerprint: string
  albumCollectionId: string
  collectionId: string
  totalImages: number
  indexedImages: number
  indexedFaces: number
  pendingImageIds: string[]
  status: AlbumJobStatusPayload['status'] | 'indexing'
  largeAlbumWarning?: string
}

export interface AlbumJobStartFailure {
  ok: false
  error: {
    code: AlbumJobErrorCode
    message: string
    fallbackAvailable?: boolean
  }
}

export type AlbumJobStartResult = AlbumJobStartSuccess | AlbumJobStartFailure

export async function startAlbumProcessingJob(input: {
  source: string
  folderId: string
  folderName?: string
  albumUrl?: string
  images: Pick<AlbumImage, 'id' | 'name'>[]
  sessionId?: string | null
  userId?: string | null
  retry?: boolean
  eventCategory?: string | null
}): Promise<AlbumJobStartResult> {
  if (!isAlbumJobStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const prepare = await prepareAlbumCollection({
    source: input.source,
    folderId: input.folderId,
    folderName: input.folderName,
    albumUrl: input.albumUrl,
    images: input.images,
    eventCategory: input.eventCategory,
  })

  if (!prepare.ok) {
    return {
      ok: false,
      error: {
        code: prepare.error.code as AlbumJobErrorCode,
        message: prepare.error.message,
        fallbackAvailable: prepare.error.fallbackAvailable,
      },
    }
  }

  if (prepare.reused && prepare.status === 'ready') {
    console.log('[PhotoFind:Jobs] collection_ready_skip_job', {
      albumFingerprint: prepare.albumFingerprint.slice(0, 12),
    })

    return {
      ok: true,
      mode: 'collection_ready',
      jobId: null,
      reusedJob: false,
      collectionReused: true,
      albumFingerprint: prepare.albumFingerprint,
      albumCollectionId: prepare.albumCollectionId,
      collectionId: prepare.collectionId,
      totalImages: prepare.totalImages,
      indexedImages: prepare.indexedImages,
      indexedFaces: prepare.indexedFaces,
      pendingImageIds: [],
      status: 'ready',
      largeAlbumWarning: prepare.largeAlbumWarning,
    }
  }

  if (prepare.totalImages < ASYNC_JOB_MIN_PHOTOS) {
    return {
      ok: true,
      mode: 'sync',
      jobId: null,
      reusedJob: false,
      collectionReused: prepare.reused,
      albumFingerprint: prepare.albumFingerprint,
      albumCollectionId: prepare.albumCollectionId,
      collectionId: prepare.collectionId,
      totalImages: prepare.totalImages,
      indexedImages: prepare.indexedImages,
      indexedFaces: prepare.indexedFaces,
      pendingImageIds: prepare.pendingImageIds,
      status: prepare.status,
      largeAlbumWarning: prepare.largeAlbumWarning,
    }
  }

  const pendingCount = prepare.pendingImageIds.length
  if (pendingCount === 0 && prepare.status === 'ready') {
    return {
      ok: true,
      mode: 'collection_ready',
      jobId: null,
      reusedJob: false,
      collectionReused: prepare.reused,
      albumFingerprint: prepare.albumFingerprint,
      albumCollectionId: prepare.albumCollectionId,
      collectionId: prepare.collectionId,
      totalImages: prepare.totalImages,
      indexedImages: prepare.indexedImages,
      indexedFaces: prepare.indexedFaces,
      pendingImageIds: [],
      status: 'ready',
      largeAlbumWarning: prepare.largeAlbumWarning,
    }
  }

  let existingJob = await findActiveJobByFingerprint(prepare.albumFingerprint)
  if (!existingJob && input.retry) {
    const failedJob = await findFailedJobByFingerprint(prepare.albumFingerprint)
    if (failedJob) {
      existingJob = await resetFailedJobForRetry(failedJob.id)
      if (existingJob) {
        console.log('[PhotoFind:Jobs] retry_failed_job', { jobId: existingJob.id })
      }
    }
  }

  if (existingJob) {
    const collection = await getAlbumCollectionById(existingJob.album_collection_id)
    console.log('[PhotoFind:Jobs] reused_active_job', { jobId: existingJob.id })

    return {
      ok: true,
      mode: 'async',
      jobId: existingJob.id,
      reusedJob: true,
      collectionReused: prepare.reused,
      albumFingerprint: prepare.albumFingerprint,
      albumCollectionId: prepare.albumCollectionId,
      collectionId: collection?.collection_id ?? prepare.collectionId,
      totalImages: prepare.totalImages,
      indexedImages: existingJob.indexed_images,
      indexedFaces: existingJob.indexed_faces,
      pendingImageIds: prepare.pendingImageIds,
      status: existingJob.status,
      largeAlbumWarning: prepare.largeAlbumWarning,
    }
  }

  const totalBatches = Math.max(1, Math.ceil(pendingCount / INDEX_BATCH_SIZE))
  const job = await createAlbumProcessingJob({
    albumCollectionId: prepare.albumCollectionId,
    albumFingerprint: prepare.albumFingerprint,
    provider: input.source,
    albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : undefined,
    userId: input.userId,
    sessionId: input.sessionId,
    totalImages: prepare.totalImages,
    totalBatches,
  })

  if (!job) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  return {
    ok: true,
    mode: 'async',
    jobId: job.id,
    reusedJob: false,
    collectionReused: false,
    albumFingerprint: prepare.albumFingerprint,
    albumCollectionId: prepare.albumCollectionId,
    collectionId: prepare.collectionId,
    totalImages: prepare.totalImages,
    indexedImages: prepare.indexedImages,
    indexedFaces: prepare.indexedFaces,
    pendingImageIds: prepare.pendingImageIds,
    status: job.status,
    largeAlbumWarning: prepare.largeAlbumWarning,
  }
}

export async function getAlbumJobStatus(input: {
  jobId?: string
  albumFingerprint?: string
  sessionId?: string
}): Promise<{ ok: true; status: AlbumJobStatusPayload } | AlbumJobStartFailure> {
  if (!isAlbumJobStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  let job: AlbumProcessingJobRow | null = null
  if (input.jobId) {
    job = await getAlbumProcessingJobById(input.jobId)
  } else if (input.albumFingerprint) {
    job = await findActiveJobByFingerprint(input.albumFingerprint)
      ?? await findFailedJobByFingerprint(input.albumFingerprint)
  }

  if (!job) {
    return fail('ALBUM_JOB_NOT_FOUND', undefined, false)
  }

  if (input.sessionId && job.session_id && job.session_id !== input.sessionId) {
    return fail('ALBUM_JOB_NOT_FOUND', undefined, false)
  }

  const collection = await getAlbumCollectionById(job.album_collection_id)
  if (!collection) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const indexedIds = await getIndexedImageIds(job.album_collection_id)
  const syncedJob = await updateAlbumProcessingJob(job.id, {
    indexedImages: indexedIds.size,
    indexedFaces: collection.indexed_faces,
    status: indexedIds.size >= job.total_images ? 'ready' : job.status,
  }) ?? job

  return {
    ok: true,
    status: toStatusPayload(
      syncedJob,
      collection.collection_id,
      collection.status === 'ready' && indexedIds.size >= job.total_images,
    ),
  }
}

export interface AlbumJobProcessSuccess {
  ok: true
  status: AlbumJobStatusPayload
  batchProcessed: number
  batchFailed: number
  done: boolean
}

export type AlbumJobProcessResult = AlbumJobProcessSuccess | AlbumJobStartFailure

export async function processAlbumJobBatch(input: {
  jobId: string
  images: AlbumImage[]
  qualityRunId?: string | null
}): Promise<AlbumJobProcessResult> {
  const startedAt = Date.now()

  if (!isAlbumJobStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const job = await getAlbumProcessingJobById(input.jobId)
  if (!job) {
    return fail('ALBUM_JOB_NOT_FOUND', undefined, false)
  }

  if (job.status === 'ready') {
    const collection = await getAlbumCollectionById(job.album_collection_id)
    return {
      ok: true,
      status: toStatusPayload(job, collection?.collection_id ?? '', true),
      batchProcessed: 0,
      batchFailed: 0,
      done: true,
    }
  }

  if (job.status === 'failed' || job.status === 'cancelled') {
    return fail('ALBUM_JOB_FAILED', job.last_error ?? undefined, true)
  }

  const collection = await getAlbumCollectionById(job.album_collection_id)
  if (!collection) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const indexedBefore = await getIndexedImageIds(job.album_collection_id)
  if (indexedBefore.size >= job.total_images) {
    const readyJob = await updateAlbumProcessingJob(job.id, {
      status: 'ready',
      indexedImages: indexedBefore.size,
      indexedFaces: collection.indexed_faces,
      completedAt: new Date().toISOString(),
    }) ?? job

    return {
      ok: true,
      status: toStatusPayload(readyJob, collection.collection_id, false),
      batchProcessed: 0,
      batchFailed: 0,
      done: true,
    }
  }

  await updateAlbumProcessingJob(job.id, {
    status: job.status === 'pending' ? 'processing' : job.status,
    startedAt: job.started_at ?? new Date().toISOString(),
  })

  const batchResult = await indexAlbumBatch({
    albumCollectionId: job.album_collection_id,
    collectionId: collection.collection_id,
    images: input.images,
    continueOnError: true,
    qualityRunId: input.qualityRunId,
  })

  if (!batchResult.ok) {
    await updateAlbumProcessingJob(job.id, {
      status: 'failed',
      lastError: batchResult.error.message,
      failedAt: new Date().toISOString(),
    })

    console.error('[PhotoFind:Jobs] batch_failed', {
      jobId: job.id,
      error: batchResult.error.code,
      durationMs: Date.now() - startedAt,
    })

    return fail(batchResult.error.code as AlbumJobErrorCode, batchResult.error.message, true)
  }

  const indexedAfter = batchResult.indexedImages
  const done = indexedAfter >= job.total_images || batchResult.status === 'ready'
  const nextBatch = job.current_batch + 1

  const updatedJob = await updateAlbumProcessingJob(job.id, {
    status: done ? 'ready' : 'processing',
    processedImages: job.processed_images + batchResult.processedImages,
    indexedImages: batchResult.indexedImages,
    indexedFaces: batchResult.indexedFaces,
    failedImages: job.failed_images + batchResult.failedImages,
    currentBatch: nextBatch,
    completedAt: done ? new Date().toISOString() : undefined,
  }) ?? job

  console.log('[PhotoFind:Jobs] batch_processed', {
    jobId: job.id,
    batch: nextBatch,
    batchProcessed: batchResult.processedImages,
    batchFailed: batchResult.failedImages,
    indexedImages: batchResult.indexedImages,
    indexedFaces: batchResult.indexedFaces,
    done,
    durationMs: Date.now() - startedAt,
  })

  return {
    ok: true,
    status: toStatusPayload(updatedJob, collection.collection_id, false),
    batchProcessed: batchResult.processedImages,
    batchFailed: batchResult.failedImages,
    done,
  }
}

export async function searchAlbumJob(input: {
  jobId?: string
  referenceToken: string
  albumCollectionId: string
  collectionId: string
  albumTotal: number
  collectionReused: boolean
  qualityTelemetry?: import('../telemetry/qualityTelemetryTypes').QualityTelemetryInput
}): Promise<CollectionSearchResult> {
  if (input.jobId) {
    const job = await getAlbumProcessingJobById(input.jobId)
    if (job && job.status !== 'ready') {
      const indexedIds = await getIndexedImageIds(job.album_collection_id)
      if (indexedIds.size < job.total_images) {
        return {
          ok: false,
          error: {
            code: 'RECOGNITION_INDEXING_FAILED',
            message: 'El análisis del álbum todavía no terminó.',
            fallbackAvailable: false,
          },
        }
      }
    }
  }

  return searchAlbumCollection({
    referenceToken: input.referenceToken,
    albumCollectionId: input.albumCollectionId,
    collectionId: input.collectionId,
    albumTotal: input.albumTotal,
    collectionReused: input.collectionReused,
    qualityTelemetry: input.qualityTelemetry,
  })
}

export { ASYNC_JOB_MIN_PHOTOS }

export async function cancelAlbumJobForUser(
  jobId: string,
  userId: string,
): Promise<{ ok: true } | AlbumJobStartFailure> {
  if (!isAlbumJobStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const cancelled = await cancelAlbumProcessingJobForUser(jobId, userId)
  if (!cancelled) {
    return fail('ALBUM_JOB_NOT_FOUND', 'No encontramos ese análisis o no podés cancelarlo.', false)
  }

  return { ok: true }
}
