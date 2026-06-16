import type { AlbumImage } from '../../src/types/album'
import { COMPARE_PHASE_MAX_PHOTOS, SIMILARITY_THRESHOLD } from './config'
import { fetchAlbumImageForRekognition } from './albumImageFetcher'
import { canUseRekognition, compareFaces } from './rekognitionClient'
import { getReference } from './referenceStore'

export type CompareSearchErrorCode =
  | 'AWS_CREDENTIALS_MISSING'
  | 'AWS_REKOGNITION_ERROR'
  | 'RECOGNITION_REFERENCE_EXPIRED'
  | 'RECOGNITION_NO_FACES_IN_ALBUM'
  | 'RECOGNITION_INDEXING_FAILED'
  | 'RECOGNITION_SEARCH_FAILED'

export interface CompareAlbumMatch {
  imageId: string
  similarity: number
}

export interface CompareAlbumSuccess {
  ok: true
  matchedImageIds: string[]
  matches: CompareAlbumMatch[]
  analyzedCount: number
  albumTotal: number
  truncated: boolean
  trialModeMessage?: string
  similarityThreshold: number
}

export interface CompareAlbumFailure {
  ok: false
  error: {
    code: CompareSearchErrorCode
    message: string
  }
}

export type CompareAlbumResult = CompareAlbumSuccess | CompareAlbumFailure

const MESSAGES: Record<CompareSearchErrorCode, string> = {
  AWS_CREDENTIALS_MISSING: 'El reconocimiento facial no está configurado en el servidor.',
  AWS_REKOGNITION_ERROR: 'AWS Rekognition no pudo completar la comparación.',
  RECOGNITION_REFERENCE_EXPIRED: 'La referencia expiró. Volvé a subir la foto o sacate otra selfie.',
  RECOGNITION_NO_FACES_IN_ALBUM: 'No encontramos caras en las fotos analizadas del álbum.',
  RECOGNITION_INDEXING_FAILED: 'No pudimos leer algunas fotos del álbum para compararlas.',
  RECOGNITION_SEARCH_FAILED: 'No pudimos buscar coincidencias en el álbum.',
}

function fail(code: CompareSearchErrorCode, message?: string): CompareAlbumFailure {
  return { ok: false, error: { code, message: message ?? MESSAGES[code] } }
}

export interface CompareProgress {
  analyzed: number
  total: number
  matched: number
}

/**
 * Phase 2A: CompareFaces trial — no collections, no cache.
 * Phase 2B will replace this with IndexFaces + SearchFacesByImage.
 */
export async function compareAlbumToReference(
  referenceToken: string,
  images: AlbumImage[],
  onProgress?: (progress: CompareProgress) => void,
): Promise<CompareAlbumResult> {
  if (!canUseRekognition()) {
    return fail('AWS_CREDENTIALS_MISSING')
  }

  const reference = getReference(referenceToken)
  if (!reference) {
    return fail('RECOGNITION_REFERENCE_EXPIRED')
  }

  const albumTotal = images.length
  const toAnalyze = images.slice(0, COMPARE_PHASE_MAX_PHOTOS)
  const truncated = albumTotal > COMPARE_PHASE_MAX_PHOTOS

  const matches: CompareAlbumMatch[] = []
  let fetchFailures = 0
  let facesCompared = 0

  for (let i = 0; i < toAnalyze.length; i++) {
    const image = toAnalyze[i]
    onProgress?.({ analyzed: i, total: toAnalyze.length, matched: matches.length })

    let targetBytes: Buffer | null
    try {
      targetBytes = await fetchAlbumImageForRekognition(image)
    } catch {
      fetchFailures++
      continue
    }

    if (!targetBytes) {
      fetchFailures++
      continue
    }

    try {
      const result = await compareFaces(reference.buffer, targetBytes)
      facesCompared++
      if (result) {
        matches.push({ imageId: image.id, similarity: result.similarity })
      }
    } catch (error) {
      console.error('[PhotoFind:Compare] CompareFaces failed:', image.id, error instanceof Error ? error.message : error)
      return fail('AWS_REKOGNITION_ERROR')
    }
  }

  onProgress?.({ analyzed: toAnalyze.length, total: toAnalyze.length, matched: matches.length })

  if (facesCompared === 0 && fetchFailures === toAnalyze.length && toAnalyze.length > 0) {
    return fail('RECOGNITION_INDEXING_FAILED')
  }

  const matchedImageIds = matches.map((m) => m.imageId)

  return {
    ok: true,
    matchedImageIds,
    matches,
    analyzedCount: toAnalyze.length,
    albumTotal,
    truncated,
    trialModeMessage: truncated
      ? 'Modo prueba: analizamos las primeras 50 fotos.'
      : undefined,
    similarityThreshold: SIMILARITY_THRESHOLD,
  }
}
