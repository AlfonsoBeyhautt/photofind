import { createHash } from 'node:crypto'
import type { BoundingBox } from '@aws-sdk/client-rekognition'
import { tryGetSupabaseAdmin } from './client'
import { COLLECTION_RETENTION_DAYS } from '../recognize/config'

export type AlbumCollectionStatus = 'pending' | 'indexing' | 'ready' | 'failed'

export interface AlbumCollectionRow {
  id: string
  album_fingerprint: string
  provider: string
  album_url_hash: string | null
  folder_id: string | null
  folder_name: string | null
  collection_id: string
  total_images: number
  indexed_images: number
  indexed_faces: number
  status: AlbumCollectionStatus
  event_category: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

export interface AlbumCollectionFaceRow {
  image_id: string
  image_name: string | null
  face_id: string
  external_image_id: string | null
  bounding_box: BoundingBox | null
  confidence: number | null
}

function retentionExpiresAt(): string {
  const ms = COLLECTION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms).toISOString()
}

function isExpired(row: AlbumCollectionRow): boolean {
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= Date.now()
}

export function isAlbumCollectionExpired(row: AlbumCollectionRow): boolean {
  return isExpired(row)
}

export function hashAlbumUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 32)
}

export async function findAlbumCollectionByFingerprint(
  albumFingerprint: string,
): Promise<AlbumCollectionRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_collections')
    .select('*')
    .eq('album_fingerprint', albumFingerprint)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Collections] find_by_fingerprint', error.message)
    return null
  }

  const row = data as AlbumCollectionRow | null
  if (!row) return null
  if (isExpired(row)) return null
  return row
}

export async function findAlbumCollectionRowRaw(
  albumFingerprint: string,
): Promise<AlbumCollectionRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_collections')
    .select('*')
    .eq('album_fingerprint', albumFingerprint)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Collections] find_raw', error.message)
    return null
  }

  return data as AlbumCollectionRow | null
}

export async function renewExpiredAlbumCollection(
  id: string,
  update: {
    collectionId: string
    totalImages: number
    folderName?: string
    albumUrlHash?: string
  },
): Promise<AlbumCollectionRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_collections')
    .update({
      collection_id: update.collectionId,
      total_images: update.totalImages,
      folder_name: update.folderName ?? null,
      album_url_hash: update.albumUrlHash ?? null,
      indexed_images: 0,
      indexed_faces: 0,
      status: 'pending',
      expires_at: retentionExpiresAt(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:Collections] renew_expired', error.message)
    return null
  }

  await admin.client
    .from('album_collection_faces')
    .delete()
    .eq('album_collection_id', id)

  console.log('[PhotoFind:Collections] renewed_expired', { id, collectionId: update.collectionId })
  return data as AlbumCollectionRow
}

export async function updateAlbumCollectionEventCategory(
  id: string,
  eventCategory: string,
): Promise<void> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return

  const normalized = eventCategory.trim()
  if (!normalized) return

  const { error } = await admin.client
    .from('album_collections')
    .update({ event_category: normalized })
    .eq('id', id)

  if (error) {
    console.error('[PhotoFind:Collections] update_event_category', error.message)
  }
}

export async function getEventCategoriesByUrlHashes(
  urlHashes: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (urlHashes.length === 0) return result

  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return result

  const unique = [...new Set(urlHashes.filter(Boolean))]
  const { data, error } = await admin.client
    .from('album_collections')
    .select('album_url_hash, event_category')
    .in('album_url_hash', unique)
    .not('event_category', 'is', null)

  if (error) {
    console.error('[PhotoFind:Collections] get_event_categories', error.message)
    return result
  }

  for (const row of data ?? []) {
    const hash = row.album_url_hash as string | null
    const category = row.event_category as string | null
    if (hash && category) {
      result.set(hash, category)
    }
  }

  return result
}

export interface AlbumCollectionSummary {
  status: string
  indexedImages: number
  totalImages: number
  indexedFaces: number
}

export async function getCollectionSummariesByUrlHashes(
  urlHashes: string[],
): Promise<Map<string, AlbumCollectionSummary>> {
  const result = new Map<string, AlbumCollectionSummary>()
  if (urlHashes.length === 0) return result

  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return result

  const unique = [...new Set(urlHashes.filter(Boolean))]
  const { data, error } = await admin.client
    .from('album_collections')
    .select('album_url_hash, status, indexed_images, total_images, indexed_faces')
    .in('album_url_hash', unique)

  if (error) {
    console.error('[PhotoFind:Collections] get_summaries', error.message)
    return result
  }

  for (const row of data ?? []) {
    const hash = row.album_url_hash as string | null
    if (!hash) continue
    result.set(hash, {
      status: row.status as string,
      indexedImages: row.indexed_images as number,
      totalImages: row.total_images as number,
      indexedFaces: row.indexed_faces as number,
    })
  }

  return result
}

export async function createAlbumCollection(input: {
  albumFingerprint: string
  provider: string
  albumUrlHash?: string
  folderId: string
  folderName?: string
  collectionId: string
  totalImages: number
  eventCategory?: string | null
}): Promise<AlbumCollectionRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const row = {
    album_fingerprint: input.albumFingerprint,
    provider: input.provider,
    album_url_hash: input.albumUrlHash ?? null,
    folder_id: input.folderId,
    folder_name: input.folderName ?? null,
    collection_id: input.collectionId,
    total_images: input.totalImages,
    indexed_images: 0,
    indexed_faces: 0,
    status: 'pending' as const,
    expires_at: retentionExpiresAt(),
    ...(input.eventCategory?.trim() ? { event_category: input.eventCategory.trim() } : {}),
  }

  const { data, error } = await admin.client
    .from('album_collections')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:Collections] create', error.message)
    return null
  }

  console.log('[PhotoFind:Collections] created', {
    collectionId: input.collectionId,
    albumFingerprint: input.albumFingerprint.slice(0, 12),
    totalImages: input.totalImages,
  })

  return data as AlbumCollectionRow
}

export async function touchAlbumCollectionExpiry(id: string): Promise<void> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return

  await admin.client
    .from('album_collections')
    .update({ expires_at: retentionExpiresAt() })
    .eq('id', id)
}

export async function updateAlbumCollectionProgress(
  id: string,
  update: {
    indexedImages: number
    indexedFaces: number
    status: AlbumCollectionStatus
  },
): Promise<void> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return

  const { error } = await admin.client
    .from('album_collections')
    .update({
      indexed_images: update.indexedImages,
      indexed_faces: update.indexedFaces,
      status: update.status,
      expires_at: retentionExpiresAt(),
    })
    .eq('id', id)

  if (error) {
    console.error('[PhotoFind:Collections] update_progress', error.message)
  }
}

export async function getIndexedImageIds(albumCollectionId: string): Promise<Set<string>> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return new Set()

  const { data, error } = await admin.client
    .from('album_collection_faces')
    .select('image_id')
    .eq('album_collection_id', albumCollectionId)

  if (error) {
    console.error('[PhotoFind:Collections] get_indexed_images', error.message)
    return new Set()
  }

  return new Set((data ?? []).map((row) => row.image_id as string))
}

export async function saveNoFaceMarker(
  albumCollectionId: string,
  imageId: string,
  imageName: string,
): Promise<void> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return

  const faceId = `__no_face__${imageId}`.slice(0, 255)
  const { error } = await admin.client
    .from('album_collection_faces')
    .upsert({
      album_collection_id: albumCollectionId,
      image_id: imageId,
      image_name: imageName,
      face_id: faceId,
      external_image_id: imageId,
      bounding_box: null,
      confidence: null,
    }, { onConflict: 'album_collection_id,face_id' })

  if (error) {
    console.error('[PhotoFind:Collections] save_no_face_marker', error.message)
  }
}

export async function saveIndexedFaces(
  albumCollectionId: string,
  imageId: string,
  imageName: string,
  faces: AlbumCollectionFaceRow[],
): Promise<number> {
  if (faces.length === 0) return 0

  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return 0

  const rows = faces.map((face) => ({
    album_collection_id: albumCollectionId,
    image_id: imageId,
    image_name: imageName,
    face_id: face.face_id,
    external_image_id: face.external_image_id,
    bounding_box: face.bounding_box,
    confidence: face.confidence,
  }))

  const { error } = await admin.client
    .from('album_collection_faces')
    .upsert(rows, { onConflict: 'album_collection_id,face_id' })

  if (error) {
    console.error('[PhotoFind:Collections] save_faces', error.message)
    return 0
  }

  return faces.length
}

export async function mapFaceIdsToImages(
  albumCollectionId: string,
  faceIds: string[],
): Promise<Map<string, { imageId: string; similarity: number }>> {
  const result = new Map<string, { imageId: string; similarity: number }>()
  if (faceIds.length === 0) return result

  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return result

  const { data, error } = await admin.client
    .from('album_collection_faces')
    .select('face_id, image_id')
    .eq('album_collection_id', albumCollectionId)
    .in('face_id', faceIds)

  if (error) {
    console.error('[PhotoFind:Collections] map_faces', error.message)
    return result
  }

  return new Map(
    (data ?? []).map((row) => [row.face_id as string, { imageId: row.image_id as string, similarity: 0 }]),
  )
}

export async function countDistinctIndexedImages(albumCollectionId: string): Promise<number> {
  const ids = await getIndexedImageIds(albumCollectionId)
  return ids.size
}

export async function countIndexedFaces(albumCollectionId: string): Promise<number> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return 0

  const { count, error } = await admin.client
    .from('album_collection_faces')
    .select('*', { count: 'exact', head: true })
    .eq('album_collection_id', albumCollectionId)

  if (error) {
    console.error('[PhotoFind:Collections] count_faces', error.message)
    return 0
  }

  return count ?? 0
}

export async function getAlbumCollectionById(id: string): Promise<AlbumCollectionRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_collections')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Collections] get_by_id', error.message)
    return null
  }

  return data as AlbumCollectionRow | null
}

export async function findAlbumCollectionByUrlHash(
  albumUrlHash: string,
): Promise<AlbumCollectionRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_collections')
    .select('*')
    .eq('album_url_hash', albumUrlHash)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Collections] find_by_url_hash', error.message)
    return null
  }

  const row = data as AlbumCollectionRow | null
  if (!row || isExpired(row)) return null
  return row
}

export function isAlbumCollectionStoreAvailable(): boolean {
  return !('error' in tryGetSupabaseAdmin())
}

export async function listExpiredCollectionRows(): Promise<AlbumCollectionRow[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const now = new Date().toISOString()
  const { data, error } = await admin.client
    .from('album_collections')
    .select('*')
    .lt('expires_at', now)

  if (error) {
    console.error('[PhotoFind:Collections] list_expired', error.message)
    return []
  }

  return (data ?? []) as AlbumCollectionRow[]
}
