import { tryGetSupabaseAdmin, SupabaseConfigError } from './client'

function logTableError(
  table: string,
  context: string,
  error: { message?: string; code?: string; details?: string; hint?: string },
): void {
  console.error(`[PhotoFind:Supabase] ${context}`, {
    table,
    code: error.code,
    message: error.message,
    hint: error.hint,
    details: error.details,
  })
}

function isMissingTableError(error: { message?: string; code?: string }): boolean {
  return (
    error.code === 'PGRST205'
    || error.code === '42P01'
    || Boolean(error.message?.includes('does not exist'))
    || Boolean(error.message?.includes('Could not find the table'))
  )
}

function requireAdmin() {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) {
    console.error('[PhotoFind:Server] supabase_init_error', admin.error)
    throw new SupabaseConfigError(admin.error)
  }
  return admin.client
}

export interface SearchHistoryRow {
  id: string
  user_id: string
  album_name: string
  album_url: string
  provider: string
  event_category: string | null
  photos_found: number
  total_photos: number | null
  matched_image_ids: string[] | null
  analyzed_count: number | null
  search_method: string | null
  created_at: string
}

export interface SearchHistoryItem {
  id: string
  albumName: string
  albumUrl: string
  provider: string
  eventCategory: string | null
  photosFound: number
  totalPhotos: number | null
  matchedImageIds: string[] | null
  analyzedCount: number | null
  searchMethod: string | null
  createdAt: string
}

export interface ProcessedAlbumItem {
  albumName: string
  albumUrl: string
  provider: string
  totalPhotos: number | null
  lastSearchedAt: string
  searchCount: number
  eventCategory: string | null
  latestSearchId: string | null
  latestMatchedImageIds: string[] | null
}

export interface DashboardAlbumContext {
  collectionStatus: 'none' | 'pending' | 'processing' | 'ready' | 'failed'
  indexedImages: number
  totalImages: number
  indexedFaces: number
  activeJobId: string | null
  activeJobStatus: string | null
}

function rowToItem(row: SearchHistoryRow): SearchHistoryItem {
  const matchedIds = row.matched_image_ids
  return {
    id: row.id,
    albumName: row.album_name,
    albumUrl: row.album_url,
    provider: row.provider,
    eventCategory: row.event_category || null,
    photosFound: row.photos_found,
    totalPhotos: row.total_photos,
    matchedImageIds: Array.isArray(matchedIds) ? matchedIds : null,
    analyzedCount: row.analyzed_count,
    searchMethod: row.search_method,
    createdAt: row.created_at,
  }
}

export async function recordSearch(
  userId: string,
  data: {
    albumName: string
    albumUrl: string
    provider: string
    eventCategory?: string | null
    photosFound: number
    totalPhotos?: number | null
    matchedImageIds?: string[]
    analyzedCount?: number
    searchMethod?: string | null
  },
): Promise<SearchHistoryItem> {
  const supabase = requireAdmin()
  const insert: Record<string, unknown> = {
    user_id: userId,
    album_name: data.albumName,
    album_url: data.albumUrl,
    provider: data.provider,
    event_category: data.eventCategory?.trim() || null,
    photos_found: data.photosFound,
    total_photos: data.totalPhotos ?? null,
  }

  if (data.matchedImageIds && data.matchedImageIds.length > 0) {
    insert.matched_image_ids = data.matchedImageIds
  }
  if (typeof data.analyzedCount === 'number') {
    insert.analyzed_count = data.analyzedCount
  }
  if (data.searchMethod) {
    insert.search_method = data.searchMethod
  }

  const { data: row, error } = await supabase
    .from('search_history')
    .insert(insert)
    .select('*')
    .single()

  if (error || !row) {
    logTableError('search_history', 'recordSearch', error ?? { message: 'no row returned' })
    if (error && isMissingTableError(error)) {
      throw new Error('TABLE_SEARCH_HISTORY_MISSING')
    }
    throw new Error('SEARCH_RECORD_FAILED')
  }

  return rowToItem(row as SearchHistoryRow)
}

export async function listRecentSearches(userId: string, limit = 20): Promise<SearchHistoryItem[]> {
  const supabase = requireAdmin()
  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    logTableError('search_history', 'listRecentSearches', error)
    if (isMissingTableError(error)) {
      throw new Error('TABLE_SEARCH_HISTORY_MISSING')
    }
    throw new Error('SEARCH_FETCH_FAILED')
  }

  return (data as SearchHistoryRow[]).map(rowToItem)
}

export async function deleteSearchHistoryEntry(
  userId: string,
  searchId: string,
): Promise<boolean> {
  const supabase = requireAdmin()
  const { error, count } = await supabase
    .from('search_history')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('id', searchId)

  if (error) {
    logTableError('search_history', 'deleteSearchHistoryEntry', error)
    return false
  }
  return (count ?? 0) > 0
}

export async function deleteSearchHistoryForAlbum(
  userId: string,
  albumUrl: string,
): Promise<number> {
  const supabase = requireAdmin()
  const { error, count } = await supabase
    .from('search_history')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('album_url', albumUrl.trim())

  if (error) {
    logTableError('search_history', 'deleteSearchHistoryForAlbum', error)
    return 0
  }
  return count ?? 0
}

export function buildProcessedAlbums(searches: SearchHistoryItem[]): ProcessedAlbumItem[] {
  const byUrl = new Map<string, ProcessedAlbumItem>()

  for (const search of searches) {
    const existing = byUrl.get(search.albumUrl)
    if (!existing) {
      byUrl.set(search.albumUrl, {
        albumName: search.albumName,
        albumUrl: search.albumUrl,
        provider: search.provider,
        totalPhotos: search.totalPhotos,
        lastSearchedAt: search.createdAt,
        searchCount: 1,
        eventCategory: search.eventCategory,
        latestSearchId: search.id,
        latestMatchedImageIds: search.matchedImageIds,
      })
      continue
    }
    existing.searchCount += 1
    if (search.totalPhotos != null) {
      existing.totalPhotos = search.totalPhotos
    }
    if (search.eventCategory && !existing.eventCategory) {
      existing.eventCategory = search.eventCategory
    }
  }

  return Array.from(byUrl.values()).sort(
    (a, b) => new Date(b.lastSearchedAt).getTime() - new Date(a.lastSearchedAt).getTime(),
  )
}
