import type { AlbumData, AlbumImage } from '../../types/album'
import type { RecognitionSearchResult } from '../../types/recognition'
import { clearActiveAlbumJob, getActiveAlbumJob, saveActiveAlbumJob } from './albumJobStorage'
import { compareAlbumToReference, getRecognitionSearchErrorMessage, indexAlbumWithCollection, searchAlbumWithCollection, type SearchProgressUpdate } from './searchClient'
import { getOrCreateSessionId } from './sessionId'

/** Must match server ASYNC_JOB_MIN_PHOTOS */
export const ASYNC_JOB_MIN_PHOTOS = 500
const INDEX_BATCH_SIZE = 10
const JOB_POLL_MS = 800

export interface AlbumJobProgressUpdate extends SearchProgressUpdate {
  asyncMode?: boolean
  jobId?: string | null
  progressPercent?: number
  canLeaveScreen?: boolean
  failedImages?: number
  jobStatus?: string
}

interface JobStartSuccess {
  ok: true
  mode: 'sync' | 'async' | 'collection_ready'
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
  status: string
  largeAlbumWarning?: string
}

interface JobStartFailure {
  ok: false
  error: { code: string; message: string; fallbackAvailable?: boolean }
}

interface JobStatusPayload {
  jobId: string
  status: string
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

interface JobProcessSuccess {
  ok: true
  status: JobStatusPayload
  batchProcessed: number
  batchFailed: number
  done: boolean
}

interface JobSearchSuccess {
  ok: true
  matchedImageIds: string[]
  matches: { imageId: string; similarity: number }[]
  analyzedCount: number
  albumTotal: number
  truncated: boolean
  similarityThreshold: number
  collectionReused: boolean
  searchMethod: 'collection'
  largeAlbumWarning?: string
}

async function startAlbumJob(
  album: AlbumData,
  albumUrl: string,
  userId?: string | null,
  retry = false,
  eventCategory?: string | null,
): Promise<JobStartSuccess | JobStartFailure> {
  const res = await fetch('/api/recognize/album-job-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: album.source,
      folderId: album.folderId,
      folderName: album.folderName,
      albumUrl,
      eventCategory: eventCategory ?? undefined,
      images: album.images.map((img) => ({ id: img.id, name: img.name })),
      sessionId: getOrCreateSessionId(),
      userId: userId ?? undefined,
      retry,
    }),
  })
  return (await res.json()) as JobStartSuccess | JobStartFailure
}

async function fetchJobStatus(jobId: string): Promise<{ ok: true; status: JobStatusPayload } | JobStartFailure> {
  const sessionId = getOrCreateSessionId()
  const res = await fetch(
    `/api/recognize/album-job-status?jobId=${encodeURIComponent(jobId)}&sessionId=${encodeURIComponent(sessionId)}`,
  )
  return (await res.json()) as { ok: true; status: JobStatusPayload } | JobStartFailure
}

async function processJobBatch(jobId: string, images: AlbumImage[]): Promise<JobProcessSuccess | JobStartFailure> {
  const res = await fetch('/api/recognize/album-job-process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, images }),
  })
  return (await res.json()) as JobProcessSuccess | JobStartFailure
}

async function searchJobCollection(input: {
  jobId?: string | null
  referenceToken: string
  albumCollectionId: string
  collectionId: string
  albumTotal: number
  collectionReused: boolean
}): Promise<JobSearchSuccess | JobStartFailure> {
  const res = await fetch('/api/recognize/album-job-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await res.json()) as JobSearchSuccess | JobStartFailure
}

function emitJobProgress(
  status: JobStatusPayload,
  onProgress?: (update: AlbumJobProgressUpdate) => void,
  phase: AlbumJobProgressUpdate['phase'] = 'indexing',
): void {
  onProgress?.({
    phase,
    message: status.message,
    current: status.indexedImages,
    total: status.totalImages,
    collectionReused: status.collectionReused,
    asyncMode: true,
    jobId: status.jobId,
    progressPercent: status.progressPercent,
    canLeaveScreen: true,
    failedImages: status.failedImages,
    jobStatus: status.status,
  })
}

function buildSearchResult(
  search: JobSearchSuccess,
  start: JobStartSuccess,
): RecognitionSearchResult {
  return {
    matchedImageIds: search.matchedImageIds,
    analyzedCount: search.analyzedCount,
    albumTotal: search.albumTotal,
    truncated: search.truncated,
    similarities: Object.fromEntries(search.matches.map((m) => [m.imageId, m.similarity])),
    collectionReused: search.collectionReused,
    searchMethod: 'collection',
    largeAlbumWarning: start.largeAlbumWarning ?? search.largeAlbumWarning,
    asyncJobId: start.jobId ?? undefined,
  }
}

async function runAsyncJobLoop(
  jobId: string,
  album: AlbumData,
  albumUrl: string,
  referenceToken: string | null,
  start: JobStartSuccess,
  onProgress?: (update: AlbumJobProgressUpdate) => void,
  shouldAbort?: () => boolean,
  options?: { persistJob?: boolean },
): Promise<{ ok: true } | { ok: false; message: string; canRetry?: boolean }> {
  if (options?.persistJob !== false && referenceToken) {
    saveActiveAlbumJob({
    jobId,
    albumUrl,
    albumName: album.folderName,
    provider: album.source,
    albumFingerprint: start.albumFingerprint,
    referenceToken,
    albumCollectionId: start.albumCollectionId,
    collectionId: start.collectionId,
    totalImages: start.totalImages,
    collectionReused: start.collectionReused,
      updatedAt: new Date().toISOString(),
    })
  }

  onProgress?.({
    phase: 'indexing',
    message: 'Analizando álbum en segundo plano',
    current: start.indexedImages,
    total: start.totalImages,
    asyncMode: true,
    jobId,
    canLeaveScreen: true,
  })

  const pendingIds = new Set(start.pendingImageIds)
  let consecutiveFailures = 0

  while (pendingIds.size > 0) {
    if (shouldAbort?.()) {
      return { ok: false, message: 'Análisis cancelado.' }
    }

    const batch = album.images.filter((img) => pendingIds.has(img.id)).slice(0, INDEX_BATCH_SIZE)
    if (batch.length === 0) break

    const processedSoFar = start.totalImages - pendingIds.size
    onProgress?.({
      phase: 'indexing',
      message: `Indexando caras ${processedSoFar}/${start.totalImages}`,
      current: processedSoFar,
      total: start.totalImages,
      asyncMode: true,
      jobId,
      canLeaveScreen: true,
      progressPercent: Math.round((processedSoFar / start.totalImages) * 100),
    })

    const processResult = await processJobBatch(jobId, batch)

    if (!processResult.ok) {
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(processResult.error.code, processResult.error.message),
        canRetry: true,
      }
    }

    emitJobProgress(processResult.status, onProgress)

    if (processResult.status.status === 'failed') {
      return { ok: false, message: processResult.status.message, canRetry: true }
    }

    for (const img of batch) {
      pendingIds.delete(img.id)
    }

    if (processResult.done || processResult.status.status === 'ready') {
      break
    }

    if (processResult.batchProcessed === 0 && processResult.batchFailed > 0) {
      consecutiveFailures++
      if (consecutiveFailures >= 3) {
        return {
          ok: false,
          message: 'Varios lotes fallaron seguidos. Podés reintentar el análisis.',
          canRetry: true,
        }
      }
    } else {
      consecutiveFailures = 0
    }

    await new Promise((r) => setTimeout(r, JOB_POLL_MS))
  }

  const finalStatus = await fetchJobStatus(jobId)
  if (finalStatus.ok) {
    emitJobProgress(finalStatus.status, onProgress, finalStatus.status.status === 'ready' ? 'searching' : 'indexing')
    if (finalStatus.status.status === 'failed') {
      return { ok: false, message: finalStatus.status.message, canRetry: true }
    }
  }

  return { ok: true }
}

export async function runAlbumSearchPipeline(
  referenceToken: string,
  album: AlbumData,
  albumUrl: string,
  options?: {
    userId?: string | null
    eventCategory?: string | null
    onProgress?: (update: AlbumJobProgressUpdate) => void
    shouldAbort?: () => boolean
    retry?: boolean
  },
): Promise<{ ok: true; result: RecognitionSearchResult } | { ok: false; message: string; canRetry?: boolean }> {
  const onProgress = options?.onProgress

  onProgress?.({
    phase: 'checking',
    message: 'Revisando si este álbum ya fue analizado',
    total: album.totalImages,
  })

  let start: JobStartSuccess | JobStartFailure
  try {
    start = await startAlbumJob(album, albumUrl, options?.userId, options?.retry, options?.eventCategory)
  } catch {
    if (album.totalImages >= ASYNC_JOB_MIN_PHOTOS) {
      return { ok: false, message: 'No pudimos iniciar el análisis del álbum.', canRetry: true }
    }
    return compareAlbumToReference(referenceToken, album.images, (u) => {
      onProgress?.({
        phase: 'searching',
        message: `Comparando fotos ${u.compared}/${u.total} (respaldo)`,
        current: u.compared,
        total: u.total,
        matched: u.matched,
      })
    })
  }

  if (!start.ok) {
    if (start.error.fallbackAvailable !== false && album.totalImages < ASYNC_JOB_MIN_PHOTOS) {
      return compareAlbumToReference(referenceToken, album.images)
    }
    return {
      ok: false,
      message: getRecognitionSearchErrorMessage(start.error.code, start.error.message),
      canRetry: true,
    }
  }

  if (start.mode === 'sync') {
    return searchAlbumWithCollection(referenceToken, album, albumUrl, onProgress, options?.eventCategory)
  }

  if (start.mode === 'collection_ready') {
    onProgress?.({
      phase: 'checking',
      message: 'Usando análisis previo del álbum',
      collectionReused: true,
      current: start.indexedImages,
      total: start.totalImages,
    })
  } else if (start.mode === 'async' && start.jobId) {
    const loopResult = await runAsyncJobLoop(
      start.jobId,
      album,
      albumUrl,
      referenceToken,
      start,
      onProgress,
      options?.shouldAbort,
    )

    if (!loopResult.ok) {
      return loopResult
    }

    onProgress?.({
      phase: 'searching',
      message: 'Análisis listo',
      asyncMode: true,
      jobId: start.jobId,
      canLeaveScreen: true,
    })
  }

  onProgress?.({
    phase: 'searching',
    message: 'Buscando coincidencias',
    current: start.indexedImages,
    total: start.totalImages,
    collectionReused: start.collectionReused,
  })

  let search: JobSearchSuccess | JobStartFailure
  try {
    search = await searchJobCollection({
      jobId: start.jobId,
      referenceToken,
      albumCollectionId: start.albumCollectionId,
      collectionId: start.collectionId,
      albumTotal: album.totalImages,
      collectionReused: start.collectionReused,
    })
  } catch {
    if (album.totalImages >= ASYNC_JOB_MIN_PHOTOS) {
      return { ok: false, message: 'No pudimos buscar coincidencias. Reintentá en unos minutos.', canRetry: true }
    }
    return compareAlbumToReference(referenceToken, album.images)
  }

  if (!search.ok) {
    if (search.error.code === 'RECOGNITION_REFERENCE_EXPIRED') {
      return { ok: false, message: search.error.message, canRetry: false }
    }
    if (album.totalImages >= ASYNC_JOB_MIN_PHOTOS) {
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(search.error.code, search.error.message),
        canRetry: true,
      }
    }
    return compareAlbumToReference(referenceToken, album.images)
  }

  clearActiveAlbumJob()

  onProgress?.({
    phase: 'searching',
    message: 'Preparando resultados',
    matched: search.matchedImageIds.length,
  })

  return { ok: true, result: buildSearchResult(search, start) }
}

export async function pollAlbumJobStatus(
  jobId: string,
  onProgress?: (update: AlbumJobProgressUpdate) => void,
): Promise<{ ok: true; status: JobStatusPayload } | { ok: false; message: string }> {
  const result = await fetchJobStatus(jobId)
  if (!result.ok) {
    return { ok: false, message: getRecognitionSearchErrorMessage(result.error.code, result.error.message) }
  }
  emitJobProgress(result.status, onProgress)
  return { ok: true, status: result.status }
}

export async function resumeStoredAlbumJob(
  albumUrl: string,
  referenceToken: string,
  album: AlbumData,
  onProgress?: (update: AlbumJobProgressUpdate) => void,
  shouldAbort?: () => boolean,
): Promise<{ ok: true; result: RecognitionSearchResult } | { ok: false; message: string; canRetry?: boolean } | null> {
  const stored = getActiveAlbumJob(albumUrl)
  if (!stored || stored.referenceToken !== referenceToken) return null

  const statusRes = await fetchJobStatus(stored.jobId)
  if (!statusRes.ok) {
    clearActiveAlbumJob()
    return null
  }

  if (statusRes.status.status === 'ready') {
    onProgress?.({
      phase: 'searching',
      message: 'Análisis listo. Buscando coincidencias...',
      asyncMode: true,
      jobId: stored.jobId,
      canLeaveScreen: true,
    })

    const search = await searchJobCollection({
      jobId: stored.jobId,
      referenceToken,
      albumCollectionId: stored.albumCollectionId,
      collectionId: stored.collectionId,
      albumTotal: stored.totalImages,
      collectionReused: stored.collectionReused,
    })

    if (!search.ok) {
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(search.error.code, search.error.message),
        canRetry: search.error.code !== 'RECOGNITION_REFERENCE_EXPIRED',
      }
    }

    clearActiveAlbumJob()
    return {
      ok: true,
      result: {
        matchedImageIds: search.matchedImageIds,
        analyzedCount: search.analyzedCount,
        albumTotal: search.albumTotal,
        truncated: search.truncated,
        similarities: Object.fromEntries(search.matches.map((m) => [m.imageId, m.similarity])),
        collectionReused: search.collectionReused,
        searchMethod: 'collection',
        asyncJobId: stored.jobId,
      },
    }
  }

  if (statusRes.status.status === 'failed') {
    return { ok: false, message: statusRes.status.message, canRetry: true }
  }

  const restart = await startAlbumJob(album, albumUrl)
  if (!restart.ok || restart.mode !== 'async' || !restart.jobId) {
    return null
  }

  const loopResult = await runAsyncJobLoop(
    restart.jobId,
    album,
    albumUrl,
    referenceToken,
    restart,
    onProgress,
    shouldAbort,
  )

  if (!loopResult.ok) return loopResult

  return runAlbumSearchPipeline(referenceToken, album, albumUrl, { onProgress, shouldAbort })
}

/** Index album Collection without SearchFacesByImage — for Premium person grouping. */
export async function runAlbumIndexOnlyPipeline(
  album: AlbumData,
  albumUrl: string,
  options?: {
    userId?: string | null
    eventCategory?: string | null
    onProgress?: (update: AlbumJobProgressUpdate) => void
    shouldAbort?: () => boolean
    retry?: boolean
  },
): Promise<{ ok: true } | { ok: false; message: string; canRetry?: boolean }> {
  const onProgress = options?.onProgress

  onProgress?.({
    phase: 'checking',
    message: 'Revisando si este álbum ya fue analizado',
    total: album.totalImages,
  })

  let start: JobStartSuccess | JobStartFailure
  try {
    start = await startAlbumJob(album, albumUrl, options?.userId, options?.retry, options?.eventCategory)
  } catch {
    if (album.totalImages >= ASYNC_JOB_MIN_PHOTOS) {
      return { ok: false, message: 'No pudimos iniciar el análisis del álbum.', canRetry: true }
    }
    return indexAlbumWithCollection(album, albumUrl, onProgress, options?.eventCategory)
  }

  if (!start.ok) {
    if (album.totalImages < ASYNC_JOB_MIN_PHOTOS) {
      return indexAlbumWithCollection(album, albumUrl, onProgress, options?.eventCategory)
    }
    return {
      ok: false,
      message: getRecognitionSearchErrorMessage(start.error.code, start.error.message),
      canRetry: true,
    }
  }

  if (start.mode === 'collection_ready') {
    onProgress?.({
      phase: 'checking',
      message: 'Usando análisis previo del álbum',
      collectionReused: true,
      current: start.indexedImages,
      total: start.totalImages,
    })
    return { ok: true }
  }

  if (start.mode === 'sync') {
    return indexAlbumWithCollection(album, albumUrl, onProgress, options?.eventCategory)
  }

  if (start.mode === 'async' && start.jobId) {
    onProgress?.({
      phase: 'indexing',
      message: 'Analizando álbum en segundo plano',
      current: start.indexedImages,
      total: start.totalImages,
      asyncMode: true,
      jobId: start.jobId,
      canLeaveScreen: true,
    })

    return runAsyncJobLoop(
      start.jobId,
      album,
      albumUrl,
      null,
      start,
      onProgress,
      options?.shouldAbort,
      { persistJob: false },
    )
  }

  return { ok: true }
}

export { clearActiveAlbumJob, getActiveAlbumJob }
