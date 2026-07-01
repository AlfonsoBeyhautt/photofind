import { tryGetSupabaseAdmin } from './client'

export type QualityRunOutcome = 'started' | 'completed' | 'failed' | 'abandoned'

export interface QualityRunRow {
  id: string
  run_id: string
  user_id: string | null
  session_id: string | null
  provider: string | null
  album_url_hash: string | null
  search_method: string | null
  similarity_threshold: number
  pipeline_mode: string | null
  reference_source: string | null
  collection_reused: boolean | null
  images_analyzed: number | null
  faces_indexed: number | null
  matches_found: number
  images_downloaded: number
  images_selected: number
  similarity_max: number | null
  similarity_avg: number | null
  fallback_reason: string | null
  outcome: QualityRunOutcome
  retried_reference: boolean
  repeat_search: boolean
  downloaded_immediately: boolean
  ms_album_fetch: number | null
  ms_indexing: number | null
  ms_search: number | null
  ms_preload: number | null
  ms_total: number | null
  ms_image_fetch: number | null
  image_fetch_concurrency: number | null
  image_fetch_requests: number
  image_fetch_failures: number
  image_fetch_retries: number
  aws_compare_faces_calls: number
  aws_search_faces_by_image_calls: number
  event_category: string | null
  created_at: string
  completed_at: string | null
  first_download_at: string | null
}

export interface GroupingQualityRow {
  id: string
  grouping_id: string | null
  user_id: string | null
  album_url_hash: string | null
  provider: string | null
  algorithm_version: string | null
  initial_groups: number | null
  final_groups: number | null
  visible_groups: number | null
  groups_merged: number | null
  low_confidence_groups: number | null
  hidden_by_min_photos: number | null
  ungrouped_faces_count: number
  search_faces_calls: number | null
  merge_search_faces_calls: number | null
  created_at: string
}

function client() {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null
  return admin.client
}

export function isQualityTelemetryAvailable(): boolean {
  return client() != null
}

export async function upsertQualityRun(input: {
  runId: string
  userId?: string | null
  sessionId?: string | null
  provider?: string | null
  albumUrlHash?: string | null
  searchMethod?: string | null
  similarityThreshold?: number
  pipelineMode?: string | null
  referenceSource?: string | null
  collectionReused?: boolean | null
  imagesAnalyzed?: number | null
  facesIndexed?: number | null
  matchesFound?: number
  similarityMax?: number | null
  similarityAvg?: number | null
  fallbackReason?: string | null
  outcome?: QualityRunOutcome
  msAlbumFetch?: number | null
  msIndexing?: number | null
  msSearch?: number | null
  msPreload?: number | null
  msTotal?: number | null
  awsCompareFacesCalls?: number
  awsSearchFacesByImageCalls?: number
  eventCategory?: string | null
  completedAt?: string | null
  repeatSearch?: boolean
  retriedReference?: boolean
}): Promise<void> {
  const db = client()
  if (!db) return

  const row: Record<string, unknown> = {
    run_id: input.runId,
    user_id: input.userId ?? null,
    session_id: input.sessionId ?? null,
    provider: input.provider ?? null,
    album_url_hash: input.albumUrlHash ?? null,
    search_method: input.searchMethod ?? null,
    similarity_threshold: input.similarityThreshold ?? 85,
    pipeline_mode: input.pipelineMode ?? null,
    reference_source: input.referenceSource ?? null,
    collection_reused: input.collectionReused ?? null,
    images_analyzed: input.imagesAnalyzed ?? null,
    faces_indexed: input.facesIndexed ?? null,
    matches_found: input.matchesFound ?? 0,
    similarity_max: input.similarityMax ?? null,
    similarity_avg: input.similarityAvg ?? null,
    fallback_reason: input.fallbackReason ?? null,
    outcome: input.outcome ?? 'started',
    ms_album_fetch: input.msAlbumFetch ?? null,
    ms_indexing: input.msIndexing ?? null,
    ms_search: input.msSearch ?? null,
    ms_preload: input.msPreload ?? null,
    ms_total: input.msTotal ?? null,
    aws_compare_faces_calls: input.awsCompareFacesCalls ?? 0,
    aws_search_faces_by_image_calls: input.awsSearchFacesByImageCalls ?? 0,
    event_category: input.eventCategory ?? null,
    completed_at: input.completedAt ?? null,
    repeat_search: input.repeatSearch ?? false,
    retried_reference: input.retriedReference ?? false,
  }

  const { error } = await db
    .from('recognition_quality_runs')
    .upsert(row, { onConflict: 'run_id' })

  if (error) {
    console.error('[PhotoFind:Telemetry] upsert_run', error.message)
  }
}

export async function patchQualityRun(
  runId: string,
  patch: Partial<{
    imagesDownloaded: number
    imagesSelected: number
    downloadedImmediately: boolean
    firstDownloadAt: string
    outcome: QualityRunOutcome
    retriedReference: boolean
    repeatSearch: boolean
    msTotal: number
    msPreload: number
  }>,
): Promise<void> {
  const db = client()
  if (!db) return

  const row: Record<string, unknown> = {}
  if (patch.imagesDownloaded != null) row.images_downloaded = patch.imagesDownloaded
  if (patch.imagesSelected != null) row.images_selected = patch.imagesSelected
  if (patch.downloadedImmediately != null) row.downloaded_immediately = patch.downloadedImmediately
  if (patch.firstDownloadAt != null) row.first_download_at = patch.firstDownloadAt
  if (patch.outcome != null) row.outcome = patch.outcome
  if (patch.retriedReference != null) row.retried_reference = patch.retriedReference
  if (patch.repeatSearch != null) row.repeat_search = patch.repeatSearch
  if (patch.msTotal != null) row.ms_total = patch.msTotal
  if (patch.msPreload != null) row.ms_preload = patch.msPreload

  if (Object.keys(row).length === 0) return

  const { error } = await db
    .from('recognition_quality_runs')
    .update(row)
    .eq('run_id', runId)

  if (error) {
    console.error('[PhotoFind:Telemetry] patch_run', error.message)
  }
}

export async function incrementQualityRunDownloads(
  runId: string,
  count: number,
  immediate: boolean,
): Promise<void> {
  const db = client()
  if (!db) return

  const { data } = await db
    .from('recognition_quality_runs')
    .select('images_downloaded, first_download_at, completed_at, created_at')
    .eq('run_id', runId)
    .maybeSingle()

  const prev = (data?.images_downloaded as number) ?? 0
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    images_downloaded: prev + count,
  }

  if (!data?.first_download_at) {
    patch.first_download_at = now
    if (immediate && data?.completed_at) {
      const completed = new Date(data.completed_at as string).getTime()
      const created = new Date(data.created_at as string).getTime()
      if (completed - created < 120_000) {
        patch.downloaded_immediately = true
      }
    }
  }

  const { error } = await db
    .from('recognition_quality_runs')
    .update(patch)
    .eq('run_id', runId)

  if (error) {
    console.error('[PhotoFind:Telemetry] increment_downloads', error.message)
  }
}

export interface ImageFetchStatsDelta {
  msTotal: number
  requests: number
  failures: number
  retries: number
  concurrency: number
}

export async function incrementQualityRunImageFetch(
  runId: string,
  delta: ImageFetchStatsDelta,
): Promise<void> {
  const db = client()
  if (!db) return

  const { data } = await db
    .from('recognition_quality_runs')
    .select('ms_image_fetch, image_fetch_requests, image_fetch_failures, image_fetch_retries')
    .eq('run_id', runId)
    .maybeSingle()

  const patch: Record<string, unknown> = {
    ms_image_fetch: ((data?.ms_image_fetch as number) ?? 0) + delta.msTotal,
    image_fetch_requests: ((data?.image_fetch_requests as number) ?? 0) + delta.requests,
    image_fetch_failures: ((data?.image_fetch_failures as number) ?? 0) + delta.failures,
    image_fetch_retries: ((data?.image_fetch_retries as number) ?? 0) + delta.retries,
    image_fetch_concurrency: delta.concurrency,
  }

  const { error } = await db
    .from('recognition_quality_runs')
    .update(patch)
    .eq('run_id', runId)

  if (error) {
    console.error('[PhotoFind:Telemetry] increment_image_fetch', error.message)
  }
}

export async function insertGroupingQuality(input: {
  groupingId?: string | null
  userId?: string | null
  albumUrlHash?: string | null
  provider?: string | null
  algorithmVersion?: string | null
  initialGroups?: number
  finalGroups?: number
  visibleGroups?: number
  groupsMerged?: number
  lowConfidenceGroups?: number
  hiddenByMinPhotos?: number
  ungroupedFacesCount?: number
  searchFacesCalls?: number
  mergeSearchFacesCalls?: number
}): Promise<void> {
  const db = client()
  if (!db) return

  const { error } = await db.from('recognition_grouping_quality').insert({
    grouping_id: input.groupingId ?? null,
    user_id: input.userId ?? null,
    album_url_hash: input.albumUrlHash ?? null,
    provider: input.provider ?? null,
    algorithm_version: input.algorithmVersion ?? null,
    initial_groups: input.initialGroups ?? null,
    final_groups: input.finalGroups ?? null,
    visible_groups: input.visibleGroups ?? null,
    groups_merged: input.groupsMerged ?? null,
    low_confidence_groups: input.lowConfidenceGroups ?? null,
    hidden_by_min_photos: input.hiddenByMinPhotos ?? null,
    ungrouped_faces_count: input.ungroupedFacesCount ?? 0,
    search_faces_calls: input.searchFacesCalls ?? null,
    merge_search_faces_calls: input.mergeSearchFacesCalls ?? null,
  })

  if (error) {
    console.error('[PhotoFind:Telemetry] insert_grouping', error.message)
  }
}

export async function listQualityRuns(limit = 500): Promise<QualityRunRow[]> {
  const db = client()
  if (!db) return []

  const { data, error } = await db
    .from('recognition_quality_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[PhotoFind:Telemetry] list_runs', error.message)
    return []
  }

  return (data ?? []) as QualityRunRow[]
}

export async function listGroupingQuality(limit = 200): Promise<GroupingQualityRow[]> {
  const db = client()
  if (!db) return []

  const { data, error } = await db
    .from('recognition_grouping_quality')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[PhotoFind:Telemetry] list_grouping', error.message)
    return []
  }

  return (data ?? []) as GroupingQualityRow[]
}
