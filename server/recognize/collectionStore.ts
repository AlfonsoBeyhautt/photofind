import { COLLECTION_RETENTION_DAYS } from './config'

export interface IndexedAlbumState {
  collectionId: string
  albumFingerprint: string
  source: string
  folderId: string
  /** Image keys (id:name) successfully indexed in Rekognition. */
  indexedImageKeys: Set<string>
  createdAt: number
  expiresAt: number
}

const store = new Map<string, IndexedAlbumState>()

function retentionMs(): number {
  return COLLECTION_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

function purgeExpired(): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
}

/** AWS-safe collection id tied to album identity + content fingerprint. */
export function collectionIdForAlbum(
  source: string,
  folderId: string,
  albumFingerprint: string,
): string {
  const fpShort = albumFingerprint.slice(0, 12)
  const safe = `${source}_${folderId}_${fpShort}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 200)
  return `pf_${safe}`
}

export function getIndexedAlbum(collectionId: string): IndexedAlbumState | null {
  purgeExpired()
  const entry = store.get(collectionId)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    store.delete(collectionId)
    return null
  }
  return entry
}

export function upsertIndexedAlbum(
  collectionId: string,
  data: Omit<IndexedAlbumState, 'createdAt' | 'expiresAt' | 'indexedImageKeys'> & {
    indexedImageKeys?: Set<string>
  },
): IndexedAlbumState {
  purgeExpired()
  const existing = store.get(collectionId)
  const now = Date.now()
  const entry: IndexedAlbumState = {
    collectionId,
    albumFingerprint: data.albumFingerprint,
    source: data.source,
    folderId: data.folderId,
    indexedImageKeys: data.indexedImageKeys ?? existing?.indexedImageKeys ?? new Set(),
    createdAt: existing?.createdAt ?? now,
    expiresAt: now + retentionMs(),
  }
  store.set(collectionId, entry)
  return entry
}

export function markImageIndexed(collectionId: string, imageKey: string): void {
  const entry = store.get(collectionId)
  if (!entry) return
  entry.indexedImageKeys.add(imageKey)
  entry.expiresAt = Date.now() + retentionMs()
}

export function resetIndexedAlbum(collectionId: string): void {
  store.delete(collectionId)
}

/** Future: cron to DeleteCollection on AWS for expired entries — see FUTURE.md */
export function listExpiredCollectionIds(): string[] {
  purgeExpired()
  return []
}

/** Test helper */
export function clearCollectionStore(): void {
  store.clear()
}
