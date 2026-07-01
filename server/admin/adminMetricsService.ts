import { getSupabaseAdmin } from '../supabase/client'
import { buildCostEstimates } from './adminCostEstimates'

const MS_DAY = 24 * 60 * 60 * 1000

export interface AdminMetricsPayload {
  generatedAt: string
  users: {
    totalRegistered: number
    newLast7Days: number
    newLast30Days: number
    activeLast30Days: number | null
    activeNote: string | null
    profilesWithFacialData: number
    topBySearches: Array<{ userId: string; searchCount: number }>
    recentRegistrations: Array<{ id: string; email: string; createdAt: string }>
  }
  searches: {
    totalLogged: number
    withMatches: number
    withoutMatches: number
    anonymousNote: string
    recent: Array<{
      id: string
      userId: string
      albumName: string
      provider: string
      photosFound: number
      createdAt: string
    }>
  }
  albums: {
    totalCollections: number
    byStatus: Record<string, number>
    inProcess: number
    failed: number
    ready: number
    reusedAlbums: number | null
    reusedNote: string | null
    totalIndexedImages: number
    totalIndexedFaces: number
    faceRowsInDb: number | null
  }
  providers: {
    searchesByProvider: Record<string, number>
    albumsByProvider: Record<string, number>
  }
  jobs: {
    total: number
    active: number
    completed: number
    failed: number
    cancelled: number
    avgProcessingSeconds: number | null
    activeJobs: Array<{
      id: string
      status: string
      provider: string
      processedImages: number
      totalImages: number
      startedAt: string | null
      lastError: string | null
    }>
  }
  personGroupings: {
    total: number
    byStatus: Record<string, number>
    totalSearchFacesCalls: number
    totalGroups: number
  }
  costEstimates: ReturnType<typeof buildCostEstimates>
  errors: Array<{
    source: 'album_job' | 'album_collection' | 'person_grouping'
    id: string
    message: string
    at: string
    context?: string
  }>
  admins: Array<{
    id: string
    userId: string
    email: string
    createdAt: string
  }>
}

async function countTable(table: string): Promise<number> {
  const client = getSupabaseAdmin()
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) {
    console.error(`[PhotoFind:Admin] count_${table}`, error.message)
    return 0
  }
  return count ?? 0
}

async function listAuthUsers(): Promise<Array<{ id: string; email: string; created_at: string }>> {
  const client = getSupabaseAdmin()
  const users: Array<{ id: string; email: string; created_at: string }> = []
  let page = 1

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.error('[PhotoFind:Admin] list_auth_users', error.message)
      break
    }
    for (const u of data.users) {
      if (u.id && u.email) {
        users.push({ id: u.id, email: u.email, created_at: u.created_at })
      }
    }
    if (data.users.length < 1000) break
    page += 1
  }

  return users
}

function groupCount<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of items) {
    const key = keyFn(item) || 'unknown'
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

export async function fetchAdminMetrics(): Promise<AdminMetricsPayload> {
  const client = getSupabaseAdmin()
  const now = Date.now()
  const cutoff7 = new Date(now - 7 * MS_DAY).toISOString()
  const cutoff30 = new Date(now - 30 * MS_DAY).toISOString()

  const [
    authUsers,
    searchRows,
    collectionRows,
    jobRows,
    groupingRows,
    faceRowCount,
    facialProfileCount,
    recentSearches,
    activeJobRows,
    failedJobRows,
    failedCollections,
    failedGroupings,
    adminRows,
  ] = await Promise.all([
    listAuthUsers(),
    client.from('search_history').select('user_id, provider, photos_found'),
    client.from('album_collections').select('id, provider, status, indexed_images, indexed_faces, updated_at, created_at'),
    client.from('album_processing_jobs').select('id, status, provider, album_fingerprint, processed_images, total_images, started_at, completed_at, failed_at, last_error, created_at'),
    client.from('album_person_groupings').select('id, status, search_faces_calls, total_groups, last_error, failed_at'),
    countTable('album_collection_faces'),
    countTable('facial_profiles'),
    client
      .from('search_history')
      .select('id, user_id, album_name, provider, photos_found, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    client
      .from('album_processing_jobs')
      .select('id, status, provider, processed_images, total_images, started_at, last_error')
      .in('status', ['pending', 'processing', 'retrying'])
      .order('created_at', { ascending: false })
      .limit(15),
    client
      .from('album_processing_jobs')
      .select('id, last_error, failed_at, provider')
      .eq('status', 'failed')
      .not('last_error', 'is', null)
      .order('failed_at', { ascending: false })
      .limit(15),
    client
      .from('album_collections')
      .select('id, folder_name, status, updated_at')
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(10),
    client
      .from('album_person_groupings')
      .select('id, last_error, failed_at')
      .eq('status', 'failed')
      .not('last_error', 'is', null)
      .order('failed_at', { ascending: false })
      .limit(10),
    client.from('admin_users').select('id, user_id, email, created_at').order('created_at', { ascending: true }),
  ])

  const searches = searchRows.data ?? []
  const collections = collectionRows.data ?? []
  const jobs = jobRows.data ?? []
  const groupings = groupingRows.data ?? []

  const newLast7Days = authUsers.filter((u) => u.created_at >= cutoff7).length
  const newLast30Days = authUsers.filter((u) => u.created_at >= cutoff30).length

  const recentRegistrations = [...authUsers]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map((u) => ({ id: u.id, email: u.email, createdAt: u.created_at }))

  const searchUserCounts = groupCount(searches, (s) => s.user_id as string)
  const topBySearches = Object.entries(searchUserCounts)
    .map(([userId, searchCount]) => ({ userId, searchCount }))
    .sort((a, b) => b.searchCount - a.searchCount)
    .slice(0, 10)

  const activeUserIds = new Set<string>()
  const { data: activeSearchUsers } = await client
    .from('search_history')
    .select('user_id')
    .gte('created_at', cutoff30)
  for (const row of activeSearchUsers ?? []) {
    if (row.user_id) activeUserIds.add(row.user_id as string)
  }

  const withMatches = searches.filter((s) => (s.photos_found as number) > 0).length
  const withoutMatches = searches.length - withMatches

  const collectionByStatus = groupCount(collections, (c) => c.status as string)
  const totalIndexedImages = collections.reduce((sum, c) => sum + (c.indexed_images as number ?? 0), 0)
  const totalIndexedFaces = collections.reduce((sum, c) => sum + (c.indexed_faces as number ?? 0), 0)

  const fingerprintCounts = groupCount(jobs, (j) => j.album_fingerprint as string)
  const reusedAlbums = Object.values(fingerprintCounts).filter((n) => n > 1).length

  const jobByStatus = groupCount(jobs, (j) => j.status as string)
  const completedJobs = jobs.filter((j) => j.status === 'ready' && j.started_at && j.completed_at)
  let avgProcessingSeconds: number | null = null
  if (completedJobs.length > 0) {
    const totalMs = completedJobs.reduce((sum, j) => {
      const start = new Date(j.started_at as string).getTime()
      const end = new Date(j.completed_at as string).getTime()
      return sum + Math.max(0, end - start)
    }, 0)
    avgProcessingSeconds = Math.round(totalMs / completedJobs.length / 1000)
  }

  const groupingByStatus = groupCount(groupings, (g) => g.status as string)
  const totalSearchFacesCalls = groupings.reduce((sum, g) => sum + (g.search_faces_calls as number ?? 0), 0)
  const totalGroups = groupings.reduce((sum, g) => sum + (g.total_groups as number ?? 0), 0)

  const errors: AdminMetricsPayload['errors'] = []

  for (const row of failedJobRows.data ?? []) {
    errors.push({
      source: 'album_job',
      id: row.id as string,
      message: row.last_error as string,
      at: (row.failed_at as string) ?? new Date().toISOString(),
      context: row.provider as string,
    })
  }
  for (const row of failedCollections.data ?? []) {
    errors.push({
      source: 'album_collection',
      id: row.id as string,
      message: `Colección en estado failed${row.folder_name ? `: ${row.folder_name as string}` : ''}`,
      at: row.updated_at as string,
      context: row.folder_name as string | undefined,
    })
  }
  for (const row of failedGroupings.data ?? []) {
    errors.push({
      source: 'person_grouping',
      id: row.id as string,
      message: row.last_error as string,
      at: (row.failed_at as string) ?? new Date().toISOString(),
    })
  }

  errors.sort((a, b) => b.at.localeCompare(a.at))

  const costEstimates = buildCostEstimates({
    totalIndexedFaces,
    totalIndexedImages,
    loggedSearches: searches.length,
    personGroupingSearchFacesCalls: totalSearchFacesCalls,
    compareFacesFallbackCount: null,
  })

  return {
    generatedAt: new Date().toISOString(),
    users: {
      totalRegistered: authUsers.length,
      newLast7Days,
      newLast30Days,
      activeLast30Days: activeUserIds.size,
      activeNote: 'Usuarios con al menos una búsqueda en search_history en los últimos 30 días.',
      profilesWithFacialData: facialProfileCount,
      topBySearches,
      recentRegistrations,
    },
    searches: {
      totalLogged: searches.length,
      withMatches,
      withoutMatches,
      anonymousNote: 'Las búsquedas sin cuenta no se persisten en Supabase.',
      recent: (recentSearches.data ?? []).map((r) => ({
        id: r.id as string,
        userId: r.user_id as string,
        albumName: r.album_name as string,
        provider: r.provider as string,
        photosFound: r.photos_found as number,
        createdAt: r.created_at as string,
      })),
    },
    albums: {
      totalCollections: collections.length,
      byStatus: collectionByStatus,
      inProcess: (collectionByStatus.processing ?? 0) + (collectionByStatus.pending ?? 0),
      failed: collectionByStatus.failed ?? 0,
      ready: collectionByStatus.ready ?? 0,
      reusedAlbums,
      reusedNote: 'Álbumes con más de un job de procesamiento (mismo fingerprint).',
      totalIndexedImages,
      totalIndexedFaces,
      faceRowsInDb: faceRowCount > 0 ? faceRowCount : null,
    },
    providers: {
      searchesByProvider: groupCount(searches, (s) => s.provider as string),
      albumsByProvider: groupCount(collections, (c) => c.provider as string),
    },
    jobs: {
      total: jobs.length,
      active: (jobByStatus.pending ?? 0) + (jobByStatus.processing ?? 0) + (jobByStatus.retrying ?? 0),
      completed: jobByStatus.ready ?? 0,
      failed: jobByStatus.failed ?? 0,
      cancelled: jobByStatus.cancelled ?? 0,
      avgProcessingSeconds,
      activeJobs: (activeJobRows.data ?? []).map((j) => ({
        id: j.id as string,
        status: j.status as string,
        provider: j.provider as string,
        processedImages: j.processed_images as number,
        totalImages: j.total_images as number,
        startedAt: j.started_at as string | null,
        lastError: j.last_error as string | null,
      })),
    },
    personGroupings: {
      total: groupings.length,
      byStatus: groupingByStatus,
      totalSearchFacesCalls,
      totalGroups,
    },
    costEstimates,
    errors: errors.slice(0, 25),
    admins: (adminRows.data ?? []).map((a) => ({
      id: a.id as string,
      userId: a.user_id as string,
      email: a.email as string,
      createdAt: a.created_at as string,
    })),
  }
}
