import type { AlbumData, AlbumImage } from '../../types/album'
import type { RecognitionSearchResult } from '../../types/recognition'
import {
  buildQualityTelemetryPayload,
  recordQualityCompareOutcome,
  type QualityTelemetryContext,
} from '../telemetry/qualityClient'

const COMPARE_BATCH_SIZE = 5
const COMPARE_PHASE_MAX_PHOTOS = 50
const INDEX_BATCH_SIZE = 10

const SEARCH_MESSAGES: Record<string, string> = {
  AWS_CREDENTIALS_MISSING: 'El reconocimiento facial no est? configurado en el servidor.',
  AWS_REKOGNITION_ERROR: 'AWS Rekognition no pudo completar la comparaci?n.',
  RECOGNITION_REFERENCE_EXPIRED: 'La referencia expir?. Volv? a subir la foto o sacate otra selfie.',
  RECOGNITION_NO_FACES_IN_ALBUM: 'No encontramos caras en las fotos analizadas del ?lbum.',
  RECOGNITION_INDEXING_FAILED: 'No pudimos leer algunas fotos del ?lbum para compararlas.',
  RECOGNITION_SEARCH_FAILED: 'No pudimos buscar coincidencias en el ?lbum.',
  RECOGNITION_COLLECTION_METADATA_ERROR: 'No pudimos guardar el an?lisis del ?lbum.',
}

export function getRecognitionSearchErrorMessage(code: string, fallback?: string): string {
  return SEARCH_MESSAGES[code] ?? fallback ?? SEARCH_MESSAGES.RECOGNITION_SEARCH_FAILED
}

export interface SearchProgressUpdate {
  phase: 'checking' | 'indexing' | 'searching'
  message: string
  current?: number
  total?: number
  matched?: number
  collectionReused?: boolean
}

interface CompareAlbumApiSuccess {
  ok: true
  matchedImageIds: string[]
  matches: { imageId: string; similarity: number }[]
  analyzedCount: number
  albumTotal: number
  truncated: boolean
  trialModeMessage?: string
  similarityThreshold: number
}

interface CompareAlbumApiFailure {
  ok: false
  error: { code: string; message: string }
}

interface PrepareCollectionApiSuccess {
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

interface PrepareCollectionApiFailure {
  ok: false
  error: { code: string; message: string; fallbackAvailable?: boolean }
}

interface IndexBatchApiSuccess {
  ok: true
  indexedImages: number
  indexedFaces: number
  batchFaces: number
  status: 'indexing' | 'ready'
}

interface IndexBatchApiFailure {
  ok: false
  error: { code: string; message: string; fallbackAvailable?: boolean }
}

interface SearchCollectionApiSuccess {
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

interface SearchCollectionApiFailure {
  ok: false
  error: { code: string; message: string; fallbackAvailable?: boolean }
}

async function compareBatch(
  referenceToken: string,
  images: AlbumImage[],
): Promise<CompareAlbumApiSuccess | CompareAlbumApiFailure> {
  const res = await fetch('/api/recognize/compare-album', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenceToken, images }),
  })
  return (await res.json()) as CompareAlbumApiSuccess | CompareAlbumApiFailure
}

/** Phase 2A fallback: batched CompareFaces (limited to 50 photos). */
export async function compareAlbumToReference(
  referenceToken: string,
  images: AlbumImage[],
  onProgress?: (update: { compared: number; total: number; matched: number }) => void,
  qualityContext?: QualityTelemetryContext,
): Promise<{ ok: true; result: RecognitionSearchResult } | { ok: false; message: string }> {
  const albumTotal = images.length
  const toAnalyze = images.slice(0, COMPARE_PHASE_MAX_PHOTOS)
  const truncated = albumTotal > COMPARE_PHASE_MAX_PHOTOS

  const allMatches = new Map<string, number>()
  const searchStarted = Date.now()
  let compareFacesCalls = 0

  for (let i = 0; i < toAnalyze.length; i += COMPARE_BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + COMPARE_BATCH_SIZE)
    const response = await compareBatch(referenceToken, batch)

    if (!response.ok) {
      if (qualityContext) {
        void recordQualityCompareOutcome({
          runId: qualityContext.runId,
          provider: qualityContext.provider,
          albumUrl: qualityContext.albumUrl,
          referenceSource: qualityContext.referenceSource,
          eventCategory: qualityContext.eventCategory,
          imagesAnalyzed: Math.min(i + batch.length, toAnalyze.length),
          matches: [...allMatches.entries()].map(([, similarity]) => ({ similarity })),
          compareFacesCalls,
          msSearch: Date.now() - searchStarted,
          fallbackReason: response.error.code,
          failed: true,
        })
      }
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(response.error.code, response.error.message),
      }
    }

    compareFacesCalls += batch.length
    for (const match of response.matches) {
      const prev = allMatches.get(match.imageId) ?? 0
      if (match.similarity > prev) {
        allMatches.set(match.imageId, match.similarity)
      }
    }

    const compared = Math.min(i + batch.length, toAnalyze.length)
    onProgress?.({
      compared,
      total: toAnalyze.length,
      matched: allMatches.size,
    })
  }

  if (qualityContext) {
    void recordQualityCompareOutcome({
      runId: qualityContext.runId,
      provider: qualityContext.provider,
      albumUrl: qualityContext.albumUrl,
      referenceSource: qualityContext.referenceSource,
      eventCategory: qualityContext.eventCategory,
      imagesAnalyzed: toAnalyze.length,
      matches: [...allMatches.entries()].map(([, similarity]) => ({ similarity })),
      compareFacesCalls,
      msSearch: Date.now() - searchStarted,
      fallbackReason: 'collection_fallback',
    })
  }

  return {
    ok: true,
    result: {
      matchedImageIds: [...allMatches.keys()],
      analyzedCount: toAnalyze.length,
      albumTotal,
      truncated,
      trialModeMessage: truncated ? 'Modo respaldo: analizamos las primeras 50 fotos.' : undefined,
      similarities: Object.fromEntries(allMatches),
      searchMethod: 'compare-fallback',
    },
  }
}

function toSearchResult(
  data: SearchCollectionApiSuccess,
  largeAlbumWarning?: string,
): RecognitionSearchResult {
  const similarities: Record<string, number> = {}
  for (const match of data.matches) {
    similarities[match.imageId] = match.similarity
  }

  return {
    matchedImageIds: data.matchedImageIds,
    analyzedCount: data.analyzedCount,
    albumTotal: data.albumTotal,
    truncated: data.truncated,
    similarities,
    collectionReused: data.collectionReused,
    searchMethod: 'collection',
    largeAlbumWarning: largeAlbumWarning ?? data.largeAlbumWarning,
  }
}

/**
 * Phase 2B: Collections + SearchFacesByImage with CompareFaces fallback.
 */
export async function searchAlbumWithCollection(
  referenceToken: string,
  album: AlbumData,
  albumUrl: string,
  onProgress?: (update: SearchProgressUpdate) => void,
  eventCategory?: string | null,
  qualityContext?: QualityTelemetryContext,
): Promise<{ ok: true; result: RecognitionSearchResult } | { ok: false; message: string }> {
  onProgress?.({
    phase: 'checking',
    message: 'Revisando colecci?n...',
    total: album.totalImages,
  })

  let prepare: PrepareCollectionApiSuccess | PrepareCollectionApiFailure
  try {
    const res = await fetch('/api/recognize/collection-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: album.source,
        folderId: album.folderId,
        folderName: album.folderName,
        albumUrl,
        eventCategory: eventCategory ?? undefined,
        images: album.images.map((img) => ({ id: img.id, name: img.name })),
      }),
    })
    prepare = (await res.json()) as PrepareCollectionApiSuccess | PrepareCollectionApiFailure
  } catch {
    return compareAlbumToReference(referenceToken, album.images, (u) => {
      onProgress?.({
        phase: 'searching',
        message: `Comparando fotos ${u.compared}/${u.total}`,
        current: u.compared,
        total: u.total,
        matched: u.matched,
      })
    }, qualityContext)
  }

  if (!prepare.ok) {
    if (prepare.error.fallbackAvailable !== false) {
      console.warn('[PhotoFind:Search] collection_prepare_failed, falling back', prepare.error.code)
      const fallback = await compareAlbumToReference(referenceToken, album.images, (u) => {
        onProgress?.({
          phase: 'searching',
          message: `Comparando fotos ${u.compared}/${u.total} (respaldo)`,
          current: u.compared,
          total: u.total,
          matched: u.matched,
        })
      }, qualityContext)
      if (fallback.ok) {
        fallback.result.largeAlbumWarning = prepare.error.message
      }
      return fallback
    }
    return {
      ok: false,
      message: getRecognitionSearchErrorMessage(prepare.error.code, prepare.error.message),
    }
  }

  const largeAlbumWarning = prepare.largeAlbumWarning

  if (prepare.reused) {
    onProgress?.({
      phase: 'checking',
      message: 'Usando an?lisis previo del ?lbum',
      current: prepare.indexedImages,
      total: prepare.totalImages,
      collectionReused: true,
    })
  } else if (prepare.pendingImageIds.length > 0) {
    onProgress?.({
      phase: 'indexing',
      message: 'Analizando ?lbum por primera vez',
      current: prepare.indexedImages,
      total: prepare.totalImages,
    })
  }

  const pendingSet = new Set(prepare.pendingImageIds)
  const imagesToIndex = album.images.filter((img) => pendingSet.has(img.id))

  let indexedImages = prepare.indexedImages
  let indexedFaces = prepare.indexedFaces
  const indexStarted = imagesToIndex.length > 0 ? Date.now() : null

  for (let i = 0; i < imagesToIndex.length; i += INDEX_BATCH_SIZE) {
    const batch = imagesToIndex.slice(i, i + INDEX_BATCH_SIZE)

    onProgress?.({
      phase: 'indexing',
      message: `Indexando caras ${indexedImages}/${prepare.totalImages}`,
      current: indexedImages,
      total: prepare.totalImages,
    })

    let indexResult: IndexBatchApiSuccess | IndexBatchApiFailure
    try {
      const res = await fetch('/api/recognize/collection-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumCollectionId: prepare.albumCollectionId,
          collectionId: prepare.collectionId,
          images: batch,
          qualityRunId: qualityContext?.runId,
        }),
      })
      indexResult = (await res.json()) as IndexBatchApiSuccess | IndexBatchApiFailure
    } catch {
      console.warn('[PhotoFind:Search] collection_index_network_error, falling back')
      return compareAlbumToReference(referenceToken, album.images, undefined, qualityContext)
    }

    if (!indexResult.ok) {
      if (indexResult.error.fallbackAvailable !== false) {
        console.warn('[PhotoFind:Search] collection_index_failed, falling back', indexResult.error.code)
        return compareAlbumToReference(referenceToken, album.images, undefined, qualityContext)
      }
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(indexResult.error.code, indexResult.error.message),
      }
    }

    indexedImages = indexResult.indexedImages
    indexedFaces = indexResult.indexedFaces

    onProgress?.({
      phase: 'indexing',
      message: `Indexando caras ${indexedImages}/${prepare.totalImages}`,
      current: indexedImages,
      total: prepare.totalImages,
    })
  }

  onProgress?.({
    phase: 'searching',
    message: 'Buscando coincidencias',
    current: indexedImages,
    total: prepare.totalImages,
    collectionReused: prepare.reused,
  })

  const msIndexing = indexStarted != null ? Date.now() - indexStarted : undefined
  const telemetryPayload = buildQualityTelemetryPayload(qualityContext)

  let search: SearchCollectionApiSuccess | SearchCollectionApiFailure
  try {
    const res = await fetch('/api/recognize/collection-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceToken,
        albumCollectionId: prepare.albumCollectionId,
        collectionId: prepare.collectionId,
        albumTotal: album.totalImages,
        collectionReused: prepare.reused,
        qualityTelemetry: telemetryPayload
          ? { ...telemetryPayload, msIndexing, pipelineMode: qualityContext?.pipelineMode ?? 'sync' }
          : undefined,
      }),
    })
    search = (await res.json()) as SearchCollectionApiSuccess | SearchCollectionApiFailure
  } catch {
    console.warn('[PhotoFind:Search] collection_search_network_error, falling back')
    return compareAlbumToReference(referenceToken, album.images, undefined, qualityContext)
  }

  if (!search.ok) {
    if (search.error.fallbackAvailable !== false) {
      console.warn('[PhotoFind:Search] collection_search_failed, falling back', search.error.code)
      return compareAlbumToReference(referenceToken, album.images, undefined, qualityContext)
    }
    return {
      ok: false,
      message: getRecognitionSearchErrorMessage(search.error.code, search.error.message),
    }
  }

  console.log('[PhotoFind:Search] collection_complete', {
    reused: prepare.reused,
    indexedImages,
    indexedFaces,
    matches: search.matchedImageIds.length,
  })

  return {
    ok: true,
    result: toSearchResult(search, largeAlbumWarning),
  }
}

/**
 * Index album faces into a Collection without running SearchFacesByImage.
 * Used by the Premium person-grouping flow.
 */
export async function indexAlbumWithCollection(
  album: AlbumData,
  albumUrl: string,
  onProgress?: (update: SearchProgressUpdate) => void,
  eventCategory?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  onProgress?.({
    phase: 'checking',
    message: 'Revisando colecci?n?',
    total: album.totalImages,
  })

  let prepare: PrepareCollectionApiSuccess | PrepareCollectionApiFailure
  try {
    const res = await fetch('/api/recognize/collection-prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: album.source,
        folderId: album.folderId,
        folderName: album.folderName,
        albumUrl,
        eventCategory: eventCategory ?? undefined,
        images: album.images.map((img) => ({ id: img.id, name: img.name })),
      }),
    })
    prepare = (await res.json()) as PrepareCollectionApiSuccess | PrepareCollectionApiFailure
  } catch {
    return { ok: false, message: 'No pudimos preparar el ?lbum para indexaci?n.' }
  }

  if (!prepare.ok) {
    return {
      ok: false,
      message: getRecognitionSearchErrorMessage(prepare.error.code, prepare.error.message),
    }
  }

  if (prepare.reused) {
    onProgress?.({
      phase: 'checking',
      message: 'Usando an?lisis previo del ?lbum',
      current: prepare.indexedImages,
      total: prepare.totalImages,
      collectionReused: true,
    })
  } else if (prepare.pendingImageIds.length > 0) {
    onProgress?.({
      phase: 'indexing',
      message: 'Analizando ?lbum por primera vez',
      current: prepare.indexedImages,
      total: prepare.totalImages,
    })
  }

  const pendingSet = new Set(prepare.pendingImageIds)
  const imagesToIndex = album.images.filter((img) => pendingSet.has(img.id))

  let indexedImages = prepare.indexedImages

  for (let i = 0; i < imagesToIndex.length; i += INDEX_BATCH_SIZE) {
    const batch = imagesToIndex.slice(i, i + INDEX_BATCH_SIZE)

    onProgress?.({
      phase: 'indexing',
      message: `Indexando caras ${indexedImages}/${prepare.totalImages}`,
      current: indexedImages,
      total: prepare.totalImages,
    })

    let indexResult: IndexBatchApiSuccess | IndexBatchApiFailure
    try {
      const res = await fetch('/api/recognize/collection-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumCollectionId: prepare.albumCollectionId,
          collectionId: prepare.collectionId,
          images: batch,
        }),
      })
      indexResult = (await res.json()) as IndexBatchApiSuccess | IndexBatchApiFailure
    } catch {
      return { ok: false, message: 'No pudimos indexar las fotos del ?lbum.' }
    }

    if (!indexResult.ok) {
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(indexResult.error.code, indexResult.error.message),
      }
    }

    indexedImages = indexResult.indexedImages

    onProgress?.({
      phase: 'indexing',
      message: `Indexando caras ${indexedImages}/${prepare.totalImages}`,
      current: indexedImages,
      total: prepare.totalImages,
    })
  }

  onProgress?.({
    phase: 'checking',
    message: '?lbum listo para agrupar personas',
    current: indexedImages,
    total: prepare.totalImages,
    collectionReused: prepare.reused,
  })

  return { ok: true }
}
