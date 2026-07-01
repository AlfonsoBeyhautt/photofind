import type { AlbumImage } from '../../src/types/album'
import { computeAlbumFingerprint } from './albumFingerprint'
import { collectionIdForAlbum } from './collectionStore'
import { fetchAlbumImageForRekognition } from './albumImageFetcher'
import {
  ASYNC_JOB_MIN_PHOTOS,
  INDEX_BATCH_SIZE,
  SIMILARITY_THRESHOLD,
} from './config'
import {
  canUseRekognition,
  createCollection,
  describeCollection,
  indexFaces,
  searchFacesByImage,
} from './rekognitionClient'
import { getReference } from './referenceStore'
import {
  countDistinctIndexedImages,
  countIndexedFaces,
  createAlbumCollection,
  findAlbumCollectionByFingerprint,
  findAlbumCollectionRowRaw,
  getAlbumCollectionById,
  getIndexedImageIds,
  hashAlbumUrl,
  isAlbumCollectionExpired,
  isAlbumCollectionStoreAvailable,
  mapFaceIdsToImages,
  renewExpiredAlbumCollection,
  saveIndexedFaces,
  saveNoFaceMarker,
  touchAlbumCollectionExpiry,
  updateAlbumCollectionProgress,
  type AlbumCollectionRow,
} from '../supabase/albumCollectionStore'

export type CollectionSearchErrorCode =
  | 'AWS_CREDENTIALS_MISSING'
  | 'AWS_REKOGNITION_ERROR'
  | 'RECOGNITION_REFERENCE_EXPIRED'
  | 'RECOGNITION_NO_FACES_IN_ALBUM'
  | 'RECOGNITION_INDEXING_FAILED'
  | 'RECOGNITION_SEARCH_FAILED'
  | 'RECOGNITION_COLLECTION_METADATA_ERROR'

export interface CollectionAlbumMatch {
  imageId: string
  similarity: number
}

export interface CollectionSearchSuccess {
  ok: true
  matchedImageIds: string[]
  matches: CollectionAlbumMatch[]
  analyzedCount: number
  albumTotal: number
  truncated: boolean
  similarityThreshold: number
  collectionReused: boolean
  searchMethod: 'collection'
  largeAlbumWarning?: string
}

export interface CollectionSearchFailure {
  ok: false
  error: {
    code: CollectionSearchErrorCode
    message: string
    fallbackAvailable?: boolean
  }
}

export type CollectionSearchResult = CollectionSearchSuccess | CollectionSearchFailure

export interface PrepareCollectionSuccess {
  ok: true
  albumFingerprint: string
  collectionId: string
  albumCollectionId: string
  reused: boolean
  status: 'ready' | 'pending' | 'indexing'
  indexedImages: number
  indexedFaces: number
  totalImages: number
  pendingImageIds: string[]
  largeAlbumWarning?: string
}

export interface PrepareCollectionFailure {
  ok: false
  error: {
    code: CollectionSearchErrorCode
    message: string
    fallbackAvailable?: boolean
  }
}

export type PrepareCollectionResult = PrepareCollectionSuccess | PrepareCollectionFailure

export interface IndexBatchSuccess {
  ok: true
  indexedImages: number
  indexedFaces: number
  batchFaces: number
  processedImages: number
  failedImages: number
  status: 'indexing' | 'ready'
}

export interface IndexBatchFailure {
  ok: false
  error: {
    code: CollectionSearchErrorCode
    message: string
    fallbackAvailable?: boolean
  }
}

export type IndexBatchResult = IndexBatchSuccess | IndexBatchFailure

const MESSAGES: Record<CollectionSearchErrorCode, string> = {
  AWS_CREDENTIALS_MISSING: 'El reconocimiento facial no está configurado en el servidor.',
  AWS_REKOGNITION_ERROR: 'AWS Rekognition no pudo completar la operación.',
  RECOGNITION_REFERENCE_EXPIRED: 'La referencia expiró. Volvé a subir la foto o sacate otra selfie.',
  RECOGNITION_NO_FACES_IN_ALBUM: 'No encontramos caras en las fotos analizadas del álbum.',
  RECOGNITION_INDEXING_FAILED: 'No pudimos indexar algunas fotos del álbum.',
  RECOGNITION_SEARCH_FAILED: 'No pudimos buscar coincidencias en el álbum.',
  RECOGNITION_COLLECTION_METADATA_ERROR: 'No pudimos guardar el análisis del álbum.',
}

function fail(
  code: CollectionSearchErrorCode,
  message?: string,
  fallbackAvailable = true,
): CollectionSearchFailure {
  return {
    ok: false,
    error: {
      code,
      message: message ?? MESSAGES[code],
      fallbackAvailable,
    },
  }
}

function largeAlbumWarning(totalImages: number): string | undefined {
  if (totalImages >= ASYNC_JOB_MIN_PHOTOS) {
    return `Este álbum tiene ${totalImages.toLocaleString()} fotos. El análisis puede tardar varios minutos.`
  }
  return undefined
}

async function ensureAwsCollection(collectionId: string): Promise<boolean> {
  try {
    const existing = await describeCollection(collectionId)
    if (!existing) {
      await createCollection(collectionId)
    }
    return true
  } catch (error) {
    console.error('[PhotoFind:Collections] ensure_aws_collection', error instanceof Error ? error.message : error)
    return false
  }
}

export async function prepareAlbumCollection(input: {
  source: string
  folderId: string
  folderName?: string
  albumUrl?: string
  images: Pick<AlbumImage, 'id' | 'name'>[]
}): Promise<PrepareCollectionResult> {
  if (!canUseRekognition()) {
    return fail('AWS_CREDENTIALS_MISSING')
  }

  if (!isAlbumCollectionStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR', 'Supabase no está configurado para colecciones.')
  }

  const albumFingerprint = computeAlbumFingerprint(input.source, input.folderId, input.images)
  const collectionId = collectionIdForAlbum(input.source, input.folderId, albumFingerprint)
  const totalImages = input.images.length
  const warning = largeAlbumWarning(totalImages)

  const existing = await findAlbumCollectionByFingerprint(albumFingerprint)
  if (existing && existing.status === 'ready') {
    const indexedIds = await getIndexedImageIds(existing.id)
    const allIndexed = indexedIds.size >= totalImages

    if (allIndexed) {
      await touchAlbumCollectionExpiry(existing.id)

      console.log('[PhotoFind:Collections] reused', {
        collectionId,
        indexedImages: indexedIds.size,
        indexedFaces: existing.indexed_faces,
        totalImages,
      })

      return {
        ok: true,
        albumFingerprint,
        collectionId,
        albumCollectionId: existing.id,
        reused: true,
        status: 'ready',
        indexedImages: indexedIds.size,
        indexedFaces: existing.indexed_faces,
        totalImages,
        pendingImageIds: [],
        largeAlbumWarning: warning,
      }
    }
  }

  const awsReady = await ensureAwsCollection(collectionId)
  if (!awsReady) {
    return fail('AWS_REKOGNITION_ERROR')
  }

  let row: AlbumCollectionRow | null = existing

  if (!row) {
    const expiredRow = await findAlbumCollectionRowRaw(albumFingerprint)
    if (expiredRow && isAlbumCollectionExpired(expiredRow)) {
      row = await renewExpiredAlbumCollection(expiredRow.id, {
        collectionId,
        totalImages,
        folderName: input.folderName,
        albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : undefined,
      })
    }
  }

  if (!row) {
    row = await createAlbumCollection({
      albumFingerprint,
      provider: input.source,
      albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : undefined,
      folderId: input.folderId,
      folderName: input.folderName,
      collectionId,
      totalImages,
    })
  }

  if (!row) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const indexedIds = await getIndexedImageIds(row.id)
  const pendingImageIds = input.images
    .filter((img) => !indexedIds.has(img.id))
    .map((img) => img.id)

  console.log('[PhotoFind:Collections] prepare_new', {
    collectionId,
    totalImages,
    pendingImages: pendingImageIds.length,
    reused: false,
  })

  if (pendingImageIds.length === 0 && indexedIds.size > 0) {
    await updateAlbumCollectionProgress(row.id, {
      indexedImages: indexedIds.size,
      indexedFaces: await countIndexedFaces(row.id),
      status: 'ready',
    })

    return {
      ok: true,
      albumFingerprint,
      collectionId,
      albumCollectionId: row.id,
      reused: false,
      status: 'ready',
      indexedImages: indexedIds.size,
      indexedFaces: row.indexed_faces,
      totalImages,
      pendingImageIds: [],
      largeAlbumWarning: warning,
    }
  }

  await updateAlbumCollectionProgress(row.id, {
    indexedImages: indexedIds.size,
    indexedFaces: await countIndexedFaces(row.id),
    status: 'indexing',
  })

  return {
    ok: true,
    albumFingerprint,
    collectionId,
    albumCollectionId: row.id,
    reused: false,
    status: pendingImageIds.length === 0 ? 'ready' : 'indexing',
    indexedImages: indexedIds.size,
    indexedFaces: row.indexed_faces,
    totalImages,
    pendingImageIds,
    largeAlbumWarning: warning,
  }
}

export async function indexAlbumBatch(input: {
  albumCollectionId: string
  collectionId: string
  images: AlbumImage[]
  continueOnError?: boolean
}): Promise<IndexBatchResult> {
  if (!canUseRekognition()) {
    return fail('AWS_CREDENTIALS_MISSING')
  }

  if (!isAlbumCollectionStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  let batchFaces = 0
  let batchIndexedImages = 0
  let batchProcessedImages = 0
  let batchFailedImages = 0
  let batchAwsFailures = 0

  for (const image of input.images.slice(0, INDEX_BATCH_SIZE)) {
    let imageBytes: Buffer | null
    try {
      imageBytes = await fetchAlbumImageForRekognition(image)
    } catch {
      batchFailedImages++
      batchProcessedImages++
      continue
    }

    if (!imageBytes) {
      batchFailedImages++
      batchProcessedImages++
      continue
    }

    try {
      const faces = await indexFaces(input.collectionId, imageBytes, image.id)
      batchProcessedImages++

      if (faces.length === 0) {
        await saveNoFaceMarker(input.albumCollectionId, image.id, image.name)
        batchIndexedImages++
        continue
      }

      const saved = await saveIndexedFaces(
        input.albumCollectionId,
        image.id,
        image.name,
        faces.map((face) => ({
          image_id: image.id,
          image_name: image.name,
          face_id: face.faceId,
          external_image_id: face.externalImageId ?? image.id,
          bounding_box: face.boundingBox ?? null,
          confidence: face.confidence ?? null,
        })),
      )

      batchFaces += saved
      batchIndexedImages++
    } catch (error) {
      console.error('[PhotoFind:Collections] index_faces_failed', image.id, error instanceof Error ? error.message : error)
      batchProcessedImages++
      batchFailedImages++
      batchAwsFailures++

      if (!input.continueOnError) {
        return fail('AWS_REKOGNITION_ERROR')
      }
    }
  }

  const indexedImages = await countDistinctIndexedImages(input.albumCollectionId)
  const indexedFaces = await countIndexedFaces(input.albumCollectionId)
  const collectionRow = await getAlbumCollectionById(input.albumCollectionId)
  const totalImages = collectionRow?.total_images ?? indexedImages
  const status = indexedImages >= totalImages ? 'ready' : 'indexing'

  await updateAlbumCollectionProgress(input.albumCollectionId, {
    indexedImages,
    indexedFaces,
    status,
  })

  console.log('[PhotoFind:Collections] index_batch', {
    collectionId: input.collectionId,
    batchIndexedImages,
    batchProcessedImages,
    batchFailedImages,
    batchFaces,
    indexedImages,
    indexedFaces,
    status,
    continueOnError: input.continueOnError ?? false,
  })

  if (
    batchIndexedImages === 0
    && batchFailedImages === input.images.length
    && input.images.length > 0
    && !input.continueOnError
  ) {
    return fail('RECOGNITION_INDEXING_FAILED')
  }

  if (
    batchIndexedImages === 0
    && batchAwsFailures === input.images.length
    && input.images.length > 0
    && input.continueOnError
  ) {
    return fail('AWS_REKOGNITION_ERROR')
  }

  return {
    ok: true,
    indexedImages,
    indexedFaces,
    batchFaces,
    processedImages: batchProcessedImages,
    failedImages: batchFailedImages,
    status,
  }
}

export async function searchAlbumCollection(input: {
  referenceToken: string
  albumCollectionId: string
  collectionId: string
  albumTotal: number
  collectionReused: boolean
}): Promise<CollectionSearchResult> {
  if (!canUseRekognition()) {
    return fail('AWS_CREDENTIALS_MISSING')
  }

  const reference = getReference(input.referenceToken)
  if (!reference) {
    return fail('RECOGNITION_REFERENCE_EXPIRED', undefined, false)
  }

  if (!isAlbumCollectionStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  let faceMatches: { faceId: string; similarity: number }[]
  try {
    faceMatches = await searchFacesByImage(input.collectionId, reference.buffer)
  } catch (error) {
    console.error('[PhotoFind:Collections] search_failed', error instanceof Error ? error.message : error)
    return fail('AWS_REKOGNITION_ERROR')
  }

  const faceIds = faceMatches
    .map((m) => m.faceId)
    .filter((id) => !id.startsWith('__no_face__'))

  const faceIdMap = await mapFaceIdsToImages(
    input.albumCollectionId,
    faceIds,
  )

  const imageBest = new Map<string, number>()
  for (const match of faceMatches) {
    const mapped = faceIdMap.get(match.faceId)
    if (!mapped) continue
    const prev = imageBest.get(mapped.imageId) ?? 0
    if (match.similarity > prev) {
      imageBest.set(mapped.imageId, match.similarity)
    }
  }

  const matches: CollectionAlbumMatch[] = [...imageBest.entries()].map(([imageId, similarity]) => ({
    imageId,
    similarity,
  }))

  const indexedImages = await countDistinctIndexedImages(input.albumCollectionId)

  console.log('[PhotoFind:Collections] search_complete', {
    collectionId: input.collectionId,
    reused: input.collectionReused,
    searches: 1,
    faceMatches: faceMatches.length,
    imageMatches: matches.length,
    indexedImages,
  })

  return {
    ok: true,
    matchedImageIds: matches.map((m) => m.imageId),
    matches,
    analyzedCount: indexedImages,
    albumTotal: input.albumTotal,
    truncated: false,
    similarityThreshold: SIMILARITY_THRESHOLD,
    collectionReused: input.collectionReused,
    searchMethod: 'collection',
  }
}
