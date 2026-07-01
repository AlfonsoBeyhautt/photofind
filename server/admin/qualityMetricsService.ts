import { SIMILARITY_THRESHOLD } from '../recognize/config'
import { listGroupingQuality, listQualityRuns } from '../supabase/qualityTelemetryStore'

export interface QualityMetricsPayload {
  generatedAt: string
  configuredThreshold: number
  runs: {
    total: number
    completed: number
    failed: number
    abandoned: number
    zeroResults: number
    withDownloads: number
    immediateDownloads: number
    repeatSearches: number
    retriedReference: number
    avgMatchesFound: number
    avgDownloads: number
    avgSimilarityMax: number | null
    collectionReused: number
    compareFallback: number
    collectionSearch: number
    avgMsTotal: number | null
    avgMsSearch: number | null
  }
  byProvider: Array<{
    provider: string
    runs: number
    avgMatches: number
    avgMsTotal: number | null
    zeroResults: number
    withDownloads: number
  }>
  grouping: {
    totalSnapshots: number
    avgVisibleGroups: number
    avgGroupsMerged: number
    avgUngroupedFaces: number
    avgLowConfidenceGroups: number
    recent: Array<{
      createdAt: string
      provider: string | null
      visibleGroups: number | null
      groupsMerged: number | null
      ungroupedFacesCount: number
    }>
  }
  recentRuns: Array<{
    runId: string
    provider: string | null
    searchMethod: string | null
    matchesFound: number
    imagesDownloaded: number
    outcome: string
    similarityThreshold: number
    collectionReused: boolean | null
    createdAt: string
  }>
  imageFetch: {
    runsWithData: number
    avgMsFetch: number | null
    avgImagesPerSecond: number | null
    avgConcurrency: number | null
    totalRequests: number
    totalFailures: number
    totalRetries: number
    byProvider: Array<{
      provider: string
      runs: number
      avgMsFetch: number | null
      avgImagesPerSecond: number | null
      totalFailures: number
    }>
  }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

export async function fetchQualityMetrics(): Promise<QualityMetricsPayload> {
  const [runs, grouping] = await Promise.all([
    listQualityRuns(1000),
    listGroupingQuality(200),
  ])

  const completed = runs.filter((r) => r.outcome === 'completed')
  const failed = runs.filter((r) => r.outcome === 'failed')
  const abandoned = runs.filter((r) => r.outcome === 'abandoned')
  const zeroResults = completed.filter((r) => r.matches_found === 0)
  const withDownloads = runs.filter((r) => r.images_downloaded > 0)
  const immediateDownloads = runs.filter((r) => r.downloaded_immediately)
  const repeatSearches = runs.filter((r) => r.repeat_search)
  const retriedReference = runs.filter((r) => r.retried_reference)
  const collectionReused = runs.filter((r) => r.collection_reused === true)
  const compareFallback = runs.filter((r) => r.search_method === 'compare-fallback')
  const collectionSearch = runs.filter((r) => r.search_method === 'collection')

  const providerMap = new Map<string, typeof runs>()
  for (const run of runs) {
    const key = run.provider || 'unknown'
    const list = providerMap.get(key) ?? []
    list.push(run)
    providerMap.set(key, list)
  }

  const byProvider = [...providerMap.entries()].map(([provider, list]) => ({
    provider,
    runs: list.length,
    avgMatches: avg(list.map((r) => r.matches_found)) ?? 0,
    avgMsTotal: avg(list.map((r) => r.ms_total).filter((n): n is number => n != null)),
    zeroResults: list.filter((r) => r.outcome === 'completed' && r.matches_found === 0).length,
    withDownloads: list.filter((r) => r.images_downloaded > 0).length,
  })).sort((a, b) => b.runs - a.runs)

  const runsWithFetch = runs.filter((r) => (r.ms_image_fetch ?? 0) > 0 || r.image_fetch_requests > 0)
  const imagesPerSecond = runsWithFetch
    .map((r) => {
      const ms = r.ms_image_fetch ?? 0
      const reqs = r.image_fetch_requests ?? 0
      if (ms <= 0 || reqs <= 0) return null
      return reqs / (ms / 1000)
    })
    .filter((n): n is number => n != null)

  const fetchProviderMap = new Map<string, typeof runsWithFetch>()
  for (const run of runsWithFetch) {
    const key = run.provider || 'unknown'
    const list = fetchProviderMap.get(key) ?? []
    list.push(run)
    fetchProviderMap.set(key, list)
  }

  const imageFetchByProvider = [...fetchProviderMap.entries()].map(([provider, list]) => {
    const providerIps = list
      .map((r) => {
        const ms = r.ms_image_fetch ?? 0
        const reqs = r.image_fetch_requests ?? 0
        if (ms <= 0 || reqs <= 0) return null
        return reqs / (ms / 1000)
      })
      .filter((n): n is number => n != null)

    return {
      provider,
      runs: list.length,
      avgMsFetch: avg(list.map((r) => r.ms_image_fetch).filter((n): n is number => n != null && n > 0)),
      avgImagesPerSecond: avg(providerIps),
      totalFailures: list.reduce((sum, r) => sum + (r.image_fetch_failures ?? 0), 0),
    }
  }).sort((a, b) => b.runs - a.runs)

  return {
    generatedAt: new Date().toISOString(),
    configuredThreshold: SIMILARITY_THRESHOLD,
    runs: {
      total: runs.length,
      completed: completed.length,
      failed: failed.length,
      abandoned: abandoned.length,
      zeroResults: zeroResults.length,
      withDownloads: withDownloads.length,
      immediateDownloads: immediateDownloads.length,
      repeatSearches: repeatSearches.length,
      retriedReference: retriedReference.length,
      avgMatchesFound: avg(completed.map((r) => r.matches_found)) ?? 0,
      avgDownloads: avg(runs.map((r) => r.images_downloaded)) ?? 0,
      avgSimilarityMax: avg(completed.map((r) => r.similarity_max).filter((n): n is number => n != null)),
      collectionReused: collectionReused.length,
      compareFallback: compareFallback.length,
      collectionSearch: collectionSearch.length,
      avgMsTotal: avg(runs.map((r) => r.ms_total).filter((n): n is number => n != null)),
      avgMsSearch: avg(runs.map((r) => r.ms_search).filter((n): n is number => n != null)),
    },
    byProvider,
    grouping: {
      totalSnapshots: grouping.length,
      avgVisibleGroups: avg(grouping.map((g) => g.visible_groups).filter((n): n is number => n != null)) ?? 0,
      avgGroupsMerged: avg(grouping.map((g) => g.groups_merged).filter((n): n is number => n != null)) ?? 0,
      avgUngroupedFaces: avg(grouping.map((g) => g.ungrouped_faces_count)) ?? 0,
      avgLowConfidenceGroups: avg(grouping.map((g) => g.low_confidence_groups).filter((n): n is number => n != null)) ?? 0,
      recent: grouping.slice(0, 15).map((g) => ({
        createdAt: g.created_at,
        provider: g.provider,
        visibleGroups: g.visible_groups,
        groupsMerged: g.groups_merged,
        ungroupedFacesCount: g.ungrouped_faces_count,
      })),
    },
    recentRuns: runs.slice(0, 20).map((r) => ({
      runId: r.run_id,
      provider: r.provider,
      searchMethod: r.search_method,
      matchesFound: r.matches_found,
      imagesDownloaded: r.images_downloaded,
      outcome: r.outcome,
      similarityThreshold: r.similarity_threshold,
      collectionReused: r.collection_reused,
      createdAt: r.created_at,
    })),
    imageFetch: {
      runsWithData: runsWithFetch.length,
      avgMsFetch: avg(runsWithFetch.map((r) => r.ms_image_fetch).filter((n): n is number => n != null && n > 0)),
      avgImagesPerSecond: avg(imagesPerSecond),
      avgConcurrency: avg(
        runsWithFetch
          .map((r) => r.image_fetch_concurrency)
          .filter((n): n is number => n != null && n > 0),
      ),
      totalRequests: runsWithFetch.reduce((sum, r) => sum + (r.image_fetch_requests ?? 0), 0),
      totalFailures: runsWithFetch.reduce((sum, r) => sum + (r.image_fetch_failures ?? 0), 0),
      totalRetries: runsWithFetch.reduce((sum, r) => sum + (r.image_fetch_retries ?? 0), 0),
      byProvider: imageFetchByProvider,
    },
  }
}
