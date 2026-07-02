import { SIMILARITY_THRESHOLD } from '../recognize/config'
import { hashAlbumUrl } from '../supabase/albumCollectionStore'
import type { ClusteringStatsPayload } from '../supabase/personGroupingStore'
import {
  incrementQualityRunDownloads,
  incrementQualityRunImageFetch,
  insertGroupingQuality,
  patchQualityRun,
  upsertQualityRun,
  type ImageFetchStatsDelta,
} from '../supabase/qualityTelemetryStore'

function avgSimilarity(similarities: number[]): number | null {
  if (similarities.length === 0) return null
  return Math.round((similarities.reduce((a, b) => a + b, 0) / similarities.length) * 10) / 10
}

export function createQualityRunId(): string {
  return crypto.randomUUID()
}

export async function recordSearchRunStarted(input: {
  runId: string
  userId?: string | null
  sessionId?: string | null
  provider?: string | null
  albumUrl?: string | null
  pipelineMode?: string | null
  referenceSource?: string | null
  eventCategory?: string | null
  repeatSearch?: boolean
  retriedReference?: boolean
  msAlbumFetch?: number | null
}): Promise<void> {
  await upsertQualityRun({
    runId: input.runId,
    userId: input.userId,
    sessionId: input.sessionId,
    provider: input.provider,
    albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : null,
    pipelineMode: input.pipelineMode,
    referenceSource: input.referenceSource,
    eventCategory: input.eventCategory,
    outcome: 'started',
    repeatSearch: input.repeatSearch,
    retriedReference: input.retriedReference,
    msAlbumFetch: input.msAlbumFetch,
    similarityThreshold: SIMILARITY_THRESHOLD,
  })
}

export async function recordCollectionSearchOutcome(input: {
  runId?: string | null
  userId?: string | null
  sessionId?: string | null
  provider?: string | null
  albumUrl?: string | null
  collectionReused: boolean
  imagesAnalyzed: number
  facesIndexed?: number | null
  matches: Array<{ similarity: number }>
  msSearch?: number | null
  msIndexing?: number | null
  pipelineMode?: string | null
  referenceSource?: string | null
  eventCategory?: string | null
  failed?: boolean
  fallbackReason?: string | null
  profileMode?: string | null
  referenceCount?: number | null
  multiRefExtraMatches?: number | null
  matchesByReference?: Record<string, number> | null
  awsSearchFacesByImageCalls?: number
}): Promise<void> {
  if (!input.runId) return

  const similarities = input.matches.map((m) => m.similarity)
  const now = new Date().toISOString()

  await upsertQualityRun({
    runId: input.runId,
    userId: input.userId,
    sessionId: input.sessionId,
    provider: input.provider,
    albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : null,
    searchMethod: 'collection',
    similarityThreshold: SIMILARITY_THRESHOLD,
    pipelineMode: input.pipelineMode,
    referenceSource: input.referenceSource,
    collectionReused: input.collectionReused,
    imagesAnalyzed: input.imagesAnalyzed,
    facesIndexed: input.facesIndexed,
    matchesFound: input.matches.length,
    similarityMax: similarities.length > 0 ? Math.max(...similarities) : null,
    similarityAvg: avgSimilarity(similarities),
    msSearch: input.msSearch,
    msIndexing: input.msIndexing,
    awsSearchFacesByImageCalls: input.awsSearchFacesByImageCalls ?? 1,
    eventCategory: input.eventCategory,
    outcome: input.failed ? 'failed' : 'completed',
    fallbackReason: input.fallbackReason,
    completedAt: now,
    profileMode: input.profileMode,
    referenceCount: input.referenceCount,
    multiRefExtraMatches: input.multiRefExtraMatches,
    matchesByReference: input.matchesByReference,
  })
}

export async function recordCompareFallbackOutcome(input: {
  runId?: string | null
  userId?: string | null
  sessionId?: string | null
  provider?: string | null
  albumUrl?: string | null
  imagesAnalyzed: number
  matches: Array<{ similarity: number }>
  compareFacesCalls: number
  fallbackReason?: string | null
  msSearch?: number | null
  referenceSource?: string | null
  eventCategory?: string | null
  failed?: boolean
  imageFetchStats?: ImageFetchStatsDelta | null
}): Promise<void> {
  if (!input.runId) return

  const similarities = input.matches.map((m) => m.similarity)
  const now = new Date().toISOString()

  await upsertQualityRun({
    runId: input.runId,
    userId: input.userId,
    sessionId: input.sessionId,
    provider: input.provider,
    albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : null,
    searchMethod: 'compare-fallback',
    similarityThreshold: SIMILARITY_THRESHOLD,
    referenceSource: input.referenceSource,
    imagesAnalyzed: input.imagesAnalyzed,
    matchesFound: input.matches.length,
    similarityMax: similarities.length > 0 ? Math.max(...similarities) : null,
    similarityAvg: avgSimilarity(similarities),
    awsCompareFacesCalls: input.compareFacesCalls,
    fallbackReason: input.fallbackReason,
    msSearch: input.msSearch,
    eventCategory: input.eventCategory,
    outcome: input.failed ? 'failed' : 'completed',
    completedAt: now,
  })

  if (input.imageFetchStats) {
    await incrementQualityRunImageFetch(input.runId, input.imageFetchStats)
  }
}

export async function recordClientProcessingTiming(input: {
  runId: string
  msPreload?: number | null
  msTotal?: number | null
}): Promise<void> {
  await patchQualityRun(input.runId, {
    msPreload: input.msPreload ?? undefined,
    msTotal: input.msTotal ?? undefined,
  })
}

export async function recordClientDownload(input: {
  runId: string
  count: number
  immediate?: boolean
}): Promise<void> {
  await incrementQualityRunDownloads(input.runId, input.count, input.immediate ?? false)
}

export async function recordClientSelection(input: {
  runId: string
  selectedCount: number
}): Promise<void> {
  await patchQualityRun(input.runId, { imagesSelected: input.selectedCount })
}

export async function recordClientAbandoned(runId: string): Promise<void> {
  await patchQualityRun(runId, { outcome: 'abandoned' })
}

export async function recordGroupingQualitySnapshot(input: {
  groupingId: string
  userId?: string | null
  albumUrl?: string | null
  provider?: string | null
  ungroupedFacesCount?: number
  stats: ClusteringStatsPayload
}): Promise<void> {
  await insertGroupingQuality({
    groupingId: input.groupingId,
    userId: input.userId,
    albumUrlHash: input.albumUrl ? hashAlbumUrl(input.albumUrl) : null,
    provider: input.provider,
    algorithmVersion: input.stats.algorithmVersion,
    initialGroups: input.stats.initialGroups,
    finalGroups: input.stats.finalGroups,
    visibleGroups: input.stats.visibleGroups,
    groupsMerged: input.stats.groupsMerged,
    lowConfidenceGroups: input.stats.lowConfidenceGroups,
    hiddenByMinPhotos: input.stats.hiddenByMinPhotos,
    ungroupedFacesCount: input.ungroupedFacesCount ?? 0,
    searchFacesCalls: input.stats.searchFacesCalls,
    mergeSearchFacesCalls: input.stats.mergeSearchFacesCalls,
  })
}
