import type { AlbumImage } from '../../types/album'
import type { RecognitionSearchResult } from '../../types/recognition'

const COMPARE_BATCH_SIZE = 5
const COMPARE_PHASE_MAX_PHOTOS = 50

const SEARCH_MESSAGES: Record<string, string> = {
  AWS_CREDENTIALS_MISSING: 'El reconocimiento facial no está configurado en el servidor.',
  AWS_REKOGNITION_ERROR: 'AWS Rekognition no pudo completar la comparación.',
  RECOGNITION_REFERENCE_EXPIRED: 'La referencia expiró. Volvé a subir la foto o sacate otra selfie.',
  RECOGNITION_NO_FACES_IN_ALBUM: 'No encontramos caras en las fotos analizadas del álbum.',
  RECOGNITION_INDEXING_FAILED: 'No pudimos leer algunas fotos del álbum para compararlas.',
  RECOGNITION_SEARCH_FAILED: 'No pudimos buscar coincidencias en el álbum.',
}

export function getRecognitionSearchErrorMessage(code: string, fallback?: string): string {
  return SEARCH_MESSAGES[code] ?? fallback ?? SEARCH_MESSAGES.RECOGNITION_SEARCH_FAILED
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

export interface CompareProgressUpdate {
  compared: number
  total: number
  matched: number
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

/**
 * Phase 2A: batched CompareFaces calls for progress UI.
 * Phase 2B will use a single async search job with IndexFaces + SearchFacesByImage.
 */
export async function compareAlbumToReference(
  referenceToken: string,
  images: AlbumImage[],
  onProgress?: (update: CompareProgressUpdate) => void,
): Promise<{ ok: true; result: RecognitionSearchResult } | { ok: false; message: string }> {
  const albumTotal = images.length
  const toAnalyze = images.slice(0, COMPARE_PHASE_MAX_PHOTOS)
  const truncated = albumTotal > COMPARE_PHASE_MAX_PHOTOS

  const allMatches = new Map<string, number>()
  let compared = 0

  for (let i = 0; i < toAnalyze.length; i += COMPARE_BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + COMPARE_BATCH_SIZE)
    const response = await compareBatch(referenceToken, batch)

    if (!response.ok) {
      return {
        ok: false,
        message: getRecognitionSearchErrorMessage(response.error.code, response.error.message),
      }
    }

    for (const match of response.matches) {
      const prev = allMatches.get(match.imageId) ?? 0
      if (match.similarity > prev) {
        allMatches.set(match.imageId, match.similarity)
      }
    }

    compared = Math.min(i + batch.length, toAnalyze.length)
    onProgress?.({
      compared,
      total: toAnalyze.length,
      matched: allMatches.size,
    })
  }

  const matchedImageIds = [...allMatches.keys()]

  return {
    ok: true,
    result: {
      matchedImageIds,
      analyzedCount: toAnalyze.length,
      albumTotal,
      truncated,
      trialModeMessage: truncated ? 'Modo prueba: analizamos las primeras 50 fotos.' : undefined,
      similarities: Object.fromEntries(allMatches),
    },
  }
}
