import type { ActiveAlbumJobItem, ActiveAlbumJobStatus } from '../../types/auth'
import { getActiveAlbumJob, type StoredAlbumJob } from './albumJobStorage'
import type { AlbumJobProgressUpdate } from './albumJobClient'

export interface ResumableAlbumJob extends ActiveAlbumJobItem {
  albumUrl: string
  referenceToken: string
}

export interface ResumeAlbumJobState {
  albumUrl: string
  referenceToken: string
  retry?: boolean
}

export function matchResumableAlbumJobs(apiJobs: ActiveAlbumJobItem[]): ResumableAlbumJob[] {
  const stored = getActiveAlbumJob()
  if (!stored) return []

  return apiJobs
    .filter((job) => job.jobId === stored.jobId)
    .map((job) => enrichJobWithStorage(job, stored))
}

export function enrichJobWithStorage(
  job: ActiveAlbumJobItem,
  stored: StoredAlbumJob,
): ResumableAlbumJob {
  return {
    ...job,
    albumUrl: stored.albumUrl,
    referenceToken: stored.referenceToken,
    albumName: job.albumName ?? stored.albumName ?? 'Álbum en proceso',
    provider: job.provider || stored.provider || 'unknown',
    totalImages: job.totalImages || stored.totalImages,
  }
}

export function jobFromStatusPayload(
  status: {
    status: string
    message: string
    totalImages: number
    indexedImages: number
    failedImages: number
    progressPercent: number
  },
  job: ResumableAlbumJob,
): ResumableAlbumJob {
  const jobStatus = status.status as ActiveAlbumJobStatus
  return {
    ...job,
    status: jobStatus,
    message: status.message,
    totalImages: status.totalImages,
    indexedImages: status.indexedImages,
    failedImages: status.failedImages,
    progressPercent: status.progressPercent,
    updatedAt: new Date().toISOString(),
  }
}

export function jobProgressFromPoll(
  update: AlbumJobProgressUpdate,
  job: ResumableAlbumJob,
): ResumableAlbumJob {
  const status = (update.jobStatus ?? job.status) as ActiveAlbumJobStatus
  const indexedImages = typeof update.current === 'number' ? update.current : job.indexedImages
  const totalImages = typeof update.total === 'number' ? update.total : job.totalImages
  const progressPercent = typeof update.progressPercent === 'number'
    ? update.progressPercent
    : (totalImages > 0 ? Math.min(100, Math.round((indexedImages / totalImages) * 100)) : job.progressPercent)

  return {
    ...job,
    status,
    message: update.message ?? job.message,
    indexedImages,
    totalImages,
    progressPercent,
    failedImages: update.failedImages ?? job.failedImages,
    updatedAt: new Date().toISOString(),
  }
}

export function activeJobStatusLabel(status: ActiveAlbumJobStatus): string {
  switch (status) {
    case 'pending':
      return 'Preparando'
    case 'processing':
    case 'retrying':
      return 'En curso'
    case 'ready':
      return 'Listo'
    case 'failed':
      return 'Falló'
    default:
      return 'En curso'
  }
}

export function activeJobStatusVariant(
  status: ActiveAlbumJobStatus,
): 'accent' | 'success' | 'amber' | 'default' {
  if (status === 'ready') return 'success'
  if (status === 'failed') return 'amber'
  if (status === 'pending' || status === 'processing' || status === 'retrying') return 'accent'
  return 'default'
}

export function activeJobActionLabel(status: ActiveAlbumJobStatus): string {
  if (status === 'ready') return 'Ver resultados'
  if (status === 'failed') return 'Reintentar'
  return 'Continuar'
}

export function activeJobActionNeedsRetry(status: ActiveAlbumJobStatus): boolean {
  return status === 'failed'
}
