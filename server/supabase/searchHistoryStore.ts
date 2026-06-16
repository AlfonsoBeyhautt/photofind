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
  event_category: string
  photos_found: number
  total_photos: number | null
  created_at: string
}

export interface SearchHistoryItem {
  id: string
  albumName: string
  albumUrl: string
  provider: string
  eventCategory: string
  photosFound: number
  totalPhotos: number | null
  createdAt: string
}

export interface ProcessedAlbumItem {
  albumName: string
  albumUrl: string
  provider: string
  totalPhotos: number | null
  lastSearchedAt: string
  searchCount: number
}

function rowToItem(row: SearchHistoryRow): SearchHistoryItem {
  return {
    id: row.id,
    albumName: row.album_name,
    albumUrl: row.album_url,
    provider: row.provider,
    eventCategory: row.event_category,
    photosFound: row.photos_found,
    totalPhotos: row.total_photos,
    createdAt: row.created_at,
  }
}

export async function recordSearch(
  userId: string,
  data: {
    albumName: string
    albumUrl: string
    provider: string
    eventCategory: string
    photosFound: number
    totalPhotos?: number | null
  },
): Promise<SearchHistoryItem> {
  const supabase = requireAdmin()
  const { data: row, error } = await supabase
    .from('search_history')
    .insert({
      user_id: userId,
      album_name: data.albumName,
      album_url: data.albumUrl,
      provider: data.provider,
      event_category: data.eventCategory,
      photos_found: data.photosFound,
      total_photos: data.totalPhotos ?? null,
    })
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
      })
      continue
    }
    existing.searchCount += 1
    if (search.totalPhotos != null) {
      existing.totalPhotos = search.totalPhotos
    }
  }

  return Array.from(byUrl.values()).sort(
    (a, b) => new Date(b.lastSearchedAt).getTime() - new Date(a.lastSearchedAt).getTime(),
  )
}
