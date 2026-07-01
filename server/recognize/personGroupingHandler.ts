import type { IncomingMessage, ServerResponse } from 'node:http'
import { getAuthenticatedUser } from '../auth/supabaseAuth'
import {
  ensurePersonGrouping,
  getPersonGroupDetail,
  getPersonGroupingStatusReadOnly,
  listPersonGroupsForAlbum,
  processPersonGroupingBatch,
} from './personGroupingService'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function resolveUserId(req: IncomingMessage): Promise<string | null> {
  try {
    const user = await getAuthenticatedUser(req)
    return user?.id ?? null
  } catch {
    return null
  }
}

interface AlbumRefBody {
  albumUrl?: string
  albumCollectionId?: string
}

export async function handlePersonGroupingEnsureRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: AlbumRefBody = {}
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as AlbumRefBody
    } catch {
      sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
      return
    }
  }

  const userId = await resolveUserId(req)
  const result = await ensurePersonGrouping({
    albumUrl: body.albumUrl,
    albumCollectionId: body.albumCollectionId,
    userId,
  })

  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handlePersonGroupingProcessRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: AlbumRefBody = {}
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as AlbumRefBody
    } catch {
      sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
      return
    }
  }

  const userId = await resolveUserId(req)
  const result = await processPersonGroupingBatch({
    albumUrl: body.albumUrl,
    albumCollectionId: body.albumCollectionId,
    userId,
  })

  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handlePersonGroupingStatusRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost')
  const albumUrl = url.searchParams.get('albumUrl') ?? undefined
  const albumCollectionId = url.searchParams.get('albumCollectionId') ?? undefined

  const userId = await resolveUserId(req)
  const result = await getPersonGroupingStatusReadOnly({ albumUrl, albumCollectionId, userId })
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handlePersonGroupsListRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost')
  const albumUrl = url.searchParams.get('albumUrl') ?? undefined
  const albumCollectionId = url.searchParams.get('albumCollectionId') ?? undefined

  const userId = await resolveUserId(req)
  const result = await listPersonGroupsForAlbum({ albumUrl, albumCollectionId, userId })
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handlePersonGroupDetailRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost')
  const groupId = url.searchParams.get('groupId') ?? undefined
  if (!groupId) {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Falta groupId.' } })
    return
  }

  const userId = await resolveUserId(req)
  const result = await getPersonGroupDetail({ groupId, userId })
  sendJson(res, result.ok ? 200 : 404, result)
}
