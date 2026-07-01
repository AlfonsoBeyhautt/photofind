import type { IncomingMessage, ServerResponse } from 'node:http'
import { getConfigStatus } from '../config/serverHealth'
import { getAuthenticatedUser } from './supabaseAuth'
import type { PublicUser } from './types'
import { getFacialProfileMeta, deleteFacialProfile } from '../supabase/facialProfileStore'
import { SupabaseConfigError } from '../supabase/client'
import {
  buildProcessedAlbums,
  deleteSearchHistoryEntry,
  deleteSearchHistoryForAlbum,
  listRecentSearches,
  recordSearch,
  type DashboardAlbumContext,
} from '../supabase/searchHistoryStore'
import { getCollectionSummariesByUrlHashes, getEventCategoriesByUrlHashes, hashAlbumUrl } from '../supabase/albumCollectionStore'
import { findActiveJobsByUrlHashesForUser, listResumableJobsForUser } from '../supabase/albumProcessingJobStore'
import { cancelAlbumJobForUser } from '../recognize/albumJobService'
import { getOperatorAccessForUser } from '../admin/operatorAccess'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function logAuthMeError(err: unknown, stage: string): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  console.error('[PhotoFind:Server] auth_me_error', { stage, message, stack })
}

async function requireUser(req: IncomingMessage, res: ServerResponse): Promise<PublicUser | null> {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      sendJson(res, 401, {
        ok: false,
        error: { code: 'AUTH_REQUIRED', message: 'Tenés que iniciar sesión.' },
      })
      return null
    }
    return user
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      sendJson(res, 503, {
        ok: false,
        error: { code: 'SUPABASE_NOT_CONFIGURED', message: err.message },
      })
      return null
    }
    throw err
  }
}

/** Returns Supabase user + facial profile metadata (validates JWT). */
export async function handleMeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = getConfigStatus()
  console.log('[PhotoFind:Server] auth_me_start', {
    hasAuthHeader: Boolean(req.headers.authorization?.startsWith('Bearer ')),
    supabaseUrlConfigured: config.supabaseUrlConfigured,
    supabaseServiceRoleConfigured: config.supabaseServiceRoleConfigured,
  })

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      sendJson(res, 200, { ok: true, user: null, facialProfile: { hasProfile: false } })
      return
    }

    const facialProfile = await getFacialProfileMeta(user.id)
    const operatorAccess = await getOperatorAccessForUser(user.id)
    sendJson(res, 200, { ok: true, user, facialProfile, ...operatorAccess })
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      logAuthMeError(err, 'supabase_config')
      sendJson(res, 503, {
        ok: false,
        error: { code: 'SUPABASE_NOT_CONFIGURED', message: err.message },
      })
      return
    }
    logAuthMeError(err, 'unhandled')
    sendJson(res, 500, {
      ok: false,
      error: {
        code: 'AUTH_ME_FAILED',
        message: err instanceof Error ? err.message : 'Error interno en /api/auth/me',
      },
    })
  }
}

export async function handleGetFacialProfileRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return
  try {
    const facialProfile = await getFacialProfileMeta(user.id)
    sendJson(res, 200, { ok: true, facialProfile })
  } catch (err) {
    logAuthMeError(err, 'facial_profile_get')
    sendJson(res, 500, {
      ok: false,
      error: { code: 'PROFILE_FETCH_FAILED', message: err instanceof Error ? err.message : 'Error al leer perfil' },
    })
  }
}

export async function handleSaveFacialProfileRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  let body: import('./facialProfileService').SaveFacialProfileBody
  try {
    body = JSON.parse(rawBody) as import('./facialProfileService').SaveFacialProfileBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
    return
  }

  const { saveUserFacialProfile } = await import('./facialProfileService')
  const result = await saveUserFacialProfile(user.id, body)
  if (!result.ok) {
    sendJson(res, 400, result)
    return
  }

  if ('needsSelection' in result && result.needsSelection) {
    sendJson(res, 200, result)
    return
  }

  sendJson(res, 200, result)
}

export async function handleDeleteFacialProfileRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  try {
    await deleteFacialProfile(user.id)
    sendJson(res, 200, { ok: true, facialProfile: { hasProfile: false } })
  } catch (err) {
    logAuthMeError(err, 'facial_profile_delete')
    sendJson(res, 500, {
      ok: false,
      error: { code: 'PROFILE_DELETE_FAILED', message: err instanceof Error ? err.message : 'Error al borrar perfil' },
    })
  }
}

export async function handleUseFacialProfileRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  const { useFacialProfileForSearch } = await import('./facialProfileService')
  const result = await useFacialProfileForSearch(user.id)
  sendJson(res, result.ok ? 200 : 404, result)
}

interface RecordSearchBody {
  albumName?: string
  albumUrl?: string
  provider?: string
  eventCategory?: string
  photosFound?: number
  totalPhotos?: number | null
  matchedImageIds?: string[]
  analyzedCount?: number
  searchMethod?: string | null
}

export async function handleRecordSearchRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  let body: RecordSearchBody
  try {
    body = JSON.parse(rawBody) as RecordSearchBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
    return
  }

  const albumName = body.albumName?.trim()
  const albumUrl = body.albumUrl?.trim()
  const provider = body.provider?.trim()
  const eventCategory = body.eventCategory?.trim()

  if (!albumName || !albumUrl || !provider || typeof body.photosFound !== 'number') {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Faltan datos de la búsqueda.' } })
    return
  }

  try {
    const item = await recordSearch(user.id, {
      albumName,
      albumUrl,
      provider,
      eventCategory: eventCategory || null,
      photosFound: body.photosFound,
      totalPhotos: body.totalPhotos,
      matchedImageIds: Array.isArray(body.matchedImageIds) ? body.matchedImageIds : undefined,
      analyzedCount: typeof body.analyzedCount === 'number' ? body.analyzedCount : undefined,
      searchMethod: body.searchMethod ?? null,
    })
    sendJson(res, 201, { ok: true, search: item })
  } catch (err) {
    console.error('[PhotoFind:Server] search_history_record_error', err instanceof Error ? err.message : err)
    sendJson(res, 500, { ok: false, error: { code: 'SEARCH_RECORD_FAILED', message: 'No pudimos guardar la búsqueda.' } })
  }
}

export async function handleDashboardRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  try {
    const facialProfile = await getFacialProfileMeta(user.id)
    const recentSearches = await listRecentSearches(user.id, 20)
    let processedAlbums = buildProcessedAlbums(recentSearches)
    const categoryByHash = await getEventCategoriesByUrlHashes(
      processedAlbums.map((album) => hashAlbumUrl(album.albumUrl)),
    )
    processedAlbums = processedAlbums.map((album) => {
      const fromCollection = categoryByHash.get(hashAlbumUrl(album.albumUrl)) ?? null
      return {
        ...album,
        eventCategory: fromCollection ?? album.eventCategory,
      }
    })
    const activeAlbumJobs = await listResumableJobsForUser(user.id)
    const operatorAccess = await getOperatorAccessForUser(user.id)

    const albumUrls = [
      ...new Set([
        ...processedAlbums.map((a) => a.albumUrl),
        ...recentSearches.map((s) => s.albumUrl),
      ]),
    ]
    const hashToUrl = new Map(albumUrls.map((url) => [hashAlbumUrl(url), url]))
    const urlHashes = [...hashToUrl.keys()]
    const [collectionSummaries, activeJobsByHash] = await Promise.all([
      getCollectionSummariesByUrlHashes(urlHashes),
      findActiveJobsByUrlHashesForUser(user.id, urlHashes),
    ])

    const albumContexts: Record<string, DashboardAlbumContext> = {}
    for (const [hash, summary] of collectionSummaries) {
      const url = hashToUrl.get(hash)
      if (!url) continue
      const activeJob = activeJobsByHash.get(hash)
      albumContexts[url] = {
        collectionStatus: (summary.status as DashboardAlbumContext['collectionStatus']) ?? 'none',
        indexedImages: summary.indexedImages,
        totalImages: summary.totalImages,
        indexedFaces: summary.indexedFaces,
        activeJobId: activeJob?.jobId ?? null,
        activeJobStatus: activeJob?.status ?? null,
      }
    }
    for (const [hash, activeJob] of activeJobsByHash) {
      const url = hashToUrl.get(hash)
      if (!url || albumContexts[url]) continue
      albumContexts[url] = {
        collectionStatus: 'processing',
        indexedImages: 0,
        totalImages: 0,
        indexedFaces: 0,
        activeJobId: activeJob.jobId,
        activeJobStatus: activeJob.status,
      }
    }

    sendJson(res, 200, {
      ok: true,
      user,
      facialProfile,
      recentSearches,
      processedAlbums,
      activeAlbumJobs,
      albumContexts,
      ...operatorAccess,
    })
  } catch (err) {
    console.error('[PhotoFind:Server] dashboard_error', err instanceof Error ? err.message : err)
    sendJson(res, 500, { ok: false, error: { code: 'DASHBOARD_FETCH_FAILED', message: 'No pudimos cargar el dashboard.' } })
  }
}

export async function handleDeleteSearchHistoryRequest(
  req: IncomingMessage,
  res: ServerResponse,
  searchId: string,
): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  const id = searchId.trim()
  if (!id) {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Falta el identificador.' } })
    return
  }

  const deleted = await deleteSearchHistoryEntry(user.id, id)
  if (!deleted) {
    sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'No encontramos esa búsqueda.' } })
    return
  }
  sendJson(res, 200, { ok: true })
}

export async function handleDeleteAlbumSearchHistoryRequest(
  req: IncomingMessage,
  res: ServerResponse,
  albumUrl: string,
): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  const url = albumUrl.trim()
  if (!url) {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Falta la URL del álbum.' } })
    return
  }

  const deletedCount = await deleteSearchHistoryForAlbum(user.id, url)
  sendJson(res, 200, { ok: true, deletedCount })
}

export async function handleCancelActiveAlbumJobRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  let body: { jobId?: string }
  try {
    body = JSON.parse(rawBody) as { jobId?: string }
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
    return
  }

  const jobId = body.jobId?.trim()
  if (!jobId) {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Falta el identificador del análisis.' } })
    return
  }

  try {
    const result = await cancelAlbumJobForUser(jobId, user.id)
    sendJson(res, result.ok ? 200 : 404, result)
  } catch (err) {
    console.error('[PhotoFind:Server] cancel_active_album_job_error', err instanceof Error ? err.message : err)
    sendJson(res, 500, { ok: false, error: { code: 'ALBUM_JOB_FAILED', message: 'No pudimos cancelar el análisis.' } })
  }
}
