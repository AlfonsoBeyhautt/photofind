const STORAGE_KEY = 'photofind_active_album_job'

export interface StoredAlbumJob {
  jobId: string
  albumUrl: string
  albumName?: string
  provider?: string
  albumFingerprint: string
  referenceToken: string
  albumCollectionId: string
  collectionId: string
  totalImages: number
  collectionReused: boolean
  updatedAt: string
}

export function saveActiveAlbumJob(job: StoredAlbumJob): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...job, updatedAt: new Date().toISOString() }))
  } catch {
    // ignore quota errors
  }
}

export function getActiveAlbumJob(albumUrl?: string): StoredAlbumJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const job = JSON.parse(raw) as StoredAlbumJob
    if (albumUrl && job.albumUrl !== albumUrl) return null
    return job
  } catch {
    return null
  }
}

export function clearActiveAlbumJob(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
