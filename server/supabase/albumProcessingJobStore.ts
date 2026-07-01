import { tryGetSupabaseAdmin } from './client'
import { COLLECTION_RETENTION_DAYS } from '../recognize/config'

export type AlbumJobStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'retrying'

export interface AlbumProcessingJobRow {
  id: string
  album_collection_id: string
  album_fingerprint: string
  provider: string
  album_url_hash: string | null
  user_id: string | null
  session_id: string | null
  status: AlbumJobStatus
  total_images: number
  processed_images: number
  indexed_images: number
  indexed_faces: number
  failed_images: number
  current_batch: number
  total_batches: number
  last_error: string | null
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

const ACTIVE_STATUSES: AlbumJobStatus[] = ['pending', 'processing', 'retrying']

function retentionExpiresAt(): string {
  const ms = COLLECTION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms).toISOString()
}

function isExpired(row: AlbumProcessingJobRow): boolean {
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= Date.now()
}

export function isAlbumJobStoreAvailable(): boolean {
  return !('error' in tryGetSupabaseAdmin())
}

export async function findActiveJobByFingerprint(
  albumFingerprint: string,
): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .select('*')
    .eq('album_fingerprint', albumFingerprint)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Jobs] find_active', error.message)
    return null
  }

  const row = data as AlbumProcessingJobRow | null
  if (!row || isExpired(row)) return null
  return row
}

export async function findFailedJobByFingerprint(
  albumFingerprint: string,
): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .select('*')
    .eq('album_fingerprint', albumFingerprint)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Jobs] find_failed', error.message)
    return null
  }

  const row = data as AlbumProcessingJobRow | null
  if (!row || isExpired(row)) return null
  return row
}

export async function getAlbumProcessingJobById(
  jobId: string,
): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Jobs] get_by_id', error.message)
    return null
  }

  const row = data as AlbumProcessingJobRow | null
  if (!row || isExpired(row)) return null
  return row
}

export async function createAlbumProcessingJob(input: {
  albumCollectionId: string
  albumFingerprint: string
  provider: string
  albumUrlHash?: string
  userId?: string | null
  sessionId?: string | null
  totalImages: number
  totalBatches: number
}): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const row = {
    album_collection_id: input.albumCollectionId,
    album_fingerprint: input.albumFingerprint,
    provider: input.provider,
    album_url_hash: input.albumUrlHash ?? null,
    user_id: input.userId ?? null,
    session_id: input.sessionId ?? null,
    status: 'pending' as const,
    total_images: input.totalImages,
    processed_images: 0,
    indexed_images: 0,
    indexed_faces: 0,
    failed_images: 0,
    current_batch: 0,
    total_batches: input.totalBatches,
    expires_at: retentionExpiresAt(),
  }

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:Jobs] create', error.message)
    return null
  }

  console.log('[PhotoFind:Jobs] created', {
    jobId: (data as AlbumProcessingJobRow).id,
    albumFingerprint: input.albumFingerprint.slice(0, 12),
    totalImages: input.totalImages,
    totalBatches: input.totalBatches,
  })

  return data as AlbumProcessingJobRow
}

export async function resetFailedJobForRetry(jobId: string): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .update({
      status: 'retrying',
      last_error: null,
      failed_at: null,
      expires_at: retentionExpiresAt(),
    })
    .eq('id', jobId)
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:Jobs] reset_retry', error.message)
    return null
  }

  return data as AlbumProcessingJobRow
}

export async function updateAlbumProcessingJob(
  jobId: string,
  update: Partial<{
    status: AlbumJobStatus
    processedImages: number
    indexedImages: number
    indexedFaces: number
    failedImages: number
    currentBatch: number
    lastError: string | null
    startedAt: string
    completedAt: string
    failedAt: string
  }>,
): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const patch: Record<string, unknown> = { expires_at: retentionExpiresAt() }
  if (update.status !== undefined) patch.status = update.status
  if (update.processedImages !== undefined) patch.processed_images = update.processedImages
  if (update.indexedImages !== undefined) patch.indexed_images = update.indexedImages
  if (update.indexedFaces !== undefined) patch.indexed_faces = update.indexedFaces
  if (update.failedImages !== undefined) patch.failed_images = update.failedImages
  if (update.currentBatch !== undefined) patch.current_batch = update.currentBatch
  if (update.lastError !== undefined) patch.last_error = update.lastError
  if (update.startedAt !== undefined) patch.started_at = update.startedAt
  if (update.completedAt !== undefined) patch.completed_at = update.completedAt
  if (update.failedAt !== undefined) patch.failed_at = update.failedAt

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:Jobs] update', error.message)
    return null
  }

  return data as AlbumProcessingJobRow
}

export function jobStatusMessage(job: AlbumProcessingJobRow): string {
  switch (job.status) {
    case 'pending':
      return 'Preparando álbum'
    case 'processing':
    case 'retrying':
      return `Indexando caras ${job.indexed_images}/${job.total_images}`
    case 'ready':
      return 'Análisis listo'
    case 'failed':
      return job.last_error ?? 'El análisis falló'
    case 'cancelled':
      return 'Análisis cancelado'
    default:
      return 'Procesando álbum'
  }
}

export interface ResumableAlbumJobSummary {
  jobId: string
  status: AlbumJobStatus
  message: string
  totalImages: number
  indexedImages: number
  failedImages: number
  progressPercent: number
  provider: string
  albumName: string | null
  albumFingerprint: string
  updatedAt: string
}

const RESUMABLE_STATUSES: AlbumJobStatus[] = ['pending', 'processing', 'retrying', 'ready', 'failed']

export async function listResumableJobsForUser(
  userId: string,
): Promise<ResumableAlbumJobSummary[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .select('*, album_collections(folder_name, provider)')
    .eq('user_id', userId)
    .in('status', RESUMABLE_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[PhotoFind:Jobs] list_resumable', error.message)
    return []
  }

  const rows = (data ?? []) as (AlbumProcessingJobRow & {
    album_collections: { folder_name: string | null; provider: string | null } | null
  })[]

  return rows
    .filter((row) => !isExpired(row))
    .map((row) => {
      const progressPercent = row.total_images > 0
        ? Math.min(100, Math.round((row.indexed_images / row.total_images) * 100))
        : 0

      return {
        jobId: row.id,
        status: row.status,
        message: jobStatusMessage(row),
        totalImages: row.total_images,
        indexedImages: row.indexed_images,
        failedImages: row.failed_images,
        progressPercent,
        provider: row.album_collections?.provider ?? row.provider,
        albumName: row.album_collections?.folder_name ?? null,
        albumFingerprint: row.album_fingerprint,
        updatedAt: row.updated_at,
      }
    })
}

export async function cancelAlbumProcessingJobForUser(
  jobId: string,
  userId: string,
): Promise<AlbumProcessingJobRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const existing = await getAlbumProcessingJobById(jobId)
  if (!existing || existing.user_id !== userId) return null
  if (existing.status === 'cancelled') return existing

  const { data, error } = await admin.client
    .from('album_processing_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Jobs] cancel', error.message)
    return null
  }

  const row = data as AlbumProcessingJobRow | null
  if (row) {
    console.log('[PhotoFind:Jobs] cancelled', { jobId: row.id, userId })
  }
  return row
}
