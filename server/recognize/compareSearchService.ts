import type { AlbumImage } from '../../src/types/album'
import { COMPARE_PHASE_MAX_PHOTOS, SIMILARITY_THRESHOLD } from './config'
import {
  createImageFetchStats,
  resolveFetchConcurrency,
  runParallelImageWork,
} from './parallelImageFetch'
import { canUseRekognition, compareFaces } from './rekognitionClient'
import { getReference } from './referenceStore'
import type { QualityTelemetryInput } from '../telemetry/qualityTelemetryTypes'
import { recordCompareFallbackOutcome } from '../telemetry/qualityTelemetryService'

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
  qualityTelemetry?: QualityTelemetryInput,
): Promise<CompareAlbumResult> {
  if (!canUseRekognition()) {
    void recordCompareFallbackOutcome({
      runId: qualityTelemetry?.runId,
      userId: qualityTelemetry?.userId,
      sessionId: qualityTelemetry?.sessionId,
      provider: qualityTelemetry?.provider,
      albumUrl: qualityTelemetry?.albumUrl,
      imagesAnalyzed: 0,
      matches: [],
      compareFacesCalls: 0,
      referenceSource: qualityTelemetry?.referenceSource,
      eventCategory: qualityTelemetry?.eventCategory,
      failed: true,
      fallbackReason: 'AWS_CREDENTIALS_MISSING',
    })
    return fail('AWS_CREDENTIALS_MISSING')
  }

  const reference = getReference(referenceToken)
  if (!reference) {
    void recordCompareFallbackOutcome({
      runId: qualityTelemetry?.runId,
      userId: qualityTelemetry?.userId,
      sessionId: qualityTelemetry?.sessionId,
      provider: qualityTelemetry?.provider,
      albumUrl: qualityTelemetry?.albumUrl,
      imagesAnalyzed: 0,
      matches: [],
      compareFacesCalls: 0,
      referenceSource: qualityTelemetry?.referenceSource,
      eventCategory: qualityTelemetry?.eventCategory,
      failed: true,
      fallbackReason: 'RECOGNITION_REFERENCE_EXPIRED',
    })
    return fail('RECOGNITION_REFERENCE_EXPIRED')
  }

  const albumTotal = images.length
  const toAnalyze = images.slice(0, COMPARE_PHASE_MAX_PHOTOS)
  const truncated = albumTotal > COMPARE_PHASE_MAX_PHOTOS

  const matches: CompareAlbumMatch[] = []
  let fetchFailures = 0
  let facesCompared = 0
  const searchStarted = Date.now()
  const fetchStats = createImageFetchStats(resolveFetchConcurrency(toAnalyze))

  type CompareWorkResult =
    | { kind: 'match'; imageId: string; similarity: number }
    | { kind: 'no_match' }
    | { kind: 'aws_failed' }

  const workResults = await runParallelImageWork<CompareWorkResult>(
    toAnalyze,
    async (image, targetBytes) => {
      try {
        const result = await compareFaces(reference.buffer, targetBytes)
        if (result) {
          return { kind: 'match', imageId: image.id, similarity: result.similarity }
        }
        return { kind: 'no_match' }
      } catch (error) {
        console.error('[PhotoFind:Compare] CompareFaces failed:', image.id, error instanceof Error ? error.message : error)
        return { kind: 'aws_failed' }
      }
    },
    {
      stats: fetchStats,
      onItemComplete: (completed, total) => {
        onProgress?.({ analyzed: completed, total, matched: matches.length })
      },
    },
  )

  let awsFailed = false
  for (const result of workResults) {
    if (!result) {
      fetchFailures++
      continue
    }
    if (result.kind === 'aws_failed') {
      awsFailed = true
      continue
    }
    facesCompared++
    if (result.kind === 'match') {
      matches.push({ imageId: result.imageId, similarity: result.similarity })
    }
  }

  onProgress?.({ analyzed: toAnalyze.length, total: toAnalyze.length, matched: matches.length })

  if (awsFailed) {
    void recordCompareFallbackOutcome({
      runId: qualityTelemetry?.runId,
      userId: qualityTelemetry?.userId,
      sessionId: qualityTelemetry?.sessionId,
      provider: qualityTelemetry?.provider,
      albumUrl: qualityTelemetry?.albumUrl,
      imagesAnalyzed: facesCompared,
      matches,
      compareFacesCalls: facesCompared,
      msSearch: Date.now() - searchStarted,
      referenceSource: qualityTelemetry?.referenceSource,
      eventCategory: qualityTelemetry?.eventCategory,
      failed: true,
      fallbackReason: 'AWS_REKOGNITION_ERROR',
      imageFetchStats: fetchStats,
    })
    return fail('AWS_REKOGNITION_ERROR')
  }

  if (facesCompared === 0 && fetchFailures === toAnalyze.length && toAnalyze.length > 0) {
    void recordCompareFallbackOutcome({
      runId: qualityTelemetry?.runId,
      userId: qualityTelemetry?.userId,
      sessionId: qualityTelemetry?.sessionId,
      provider: qualityTelemetry?.provider,
      albumUrl: qualityTelemetry?.albumUrl,
      imagesAnalyzed: 0,
      matches: [],
      compareFacesCalls: 0,
      msSearch: Date.now() - searchStarted,
      referenceSource: qualityTelemetry?.referenceSource,
      eventCategory: qualityTelemetry?.eventCategory,
      failed: true,
      fallbackReason: 'RECOGNITION_INDEXING_FAILED',
      imageFetchStats: fetchStats,
    })
    return fail('RECOGNITION_INDEXING_FAILED')
  }

  const matchedImageIds = matches.map((m) => m.imageId)

  void recordCompareFallbackOutcome({
    runId: qualityTelemetry?.runId,
    userId: qualityTelemetry?.userId,
    sessionId: qualityTelemetry?.sessionId,
    provider: qualityTelemetry?.provider,
    albumUrl: qualityTelemetry?.albumUrl,
    imagesAnalyzed: toAnalyze.length,
    matches,
    compareFacesCalls: facesCompared,
    msSearch: Date.now() - searchStarted,
    referenceSource: qualityTelemetry?.referenceSource,
    eventCategory: qualityTelemetry?.eventCategory,
    fallbackReason: qualityTelemetry?.fallbackReason,
    imageFetchStats: fetchStats,
  })

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
