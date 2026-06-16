import type { IncomingMessage, ServerResponse } from 'node:http'
import { getAuthenticatedUser } from './supabaseAuth'
import type { PublicUser } from './types'
import {
  getUserFacialProfileMeta,
  removeUserFacialProfile,
  saveUserFacialProfile,
  useFacialProfileForSearch,
  type SaveFacialProfileBody,
} from './facialProfileService'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function requireUser(req: IncomingMessage, res: ServerResponse): Promise<PublicUser | null> {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'Tenés que iniciar sesión.' },
    })
    return null
  }
  return user
}

/** Returns Supabase user + facial profile metadata (validates JWT). */
export async function handleMeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    sendJson(res, 200, { ok: true, user: null, facialProfile: { hasProfile: false } })
    return
  }

  const facialProfile = await getUserFacialProfileMeta(user.id)
  sendJson(res, 200, { ok: true, user, facialProfile })
}

export async function handleGetFacialProfileRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return
  const facialProfile = await getUserFacialProfileMeta(user.id)
  sendJson(res, 200, { ok: true, facialProfile })
}

export async function handleSaveFacialProfileRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  let body: SaveFacialProfileBody
  try {
    body = JSON.parse(rawBody) as SaveFacialProfileBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
    return
  }

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

  await removeUserFacialProfile(user.id)
  sendJson(res, 200, { ok: true, facialProfile: { hasProfile: false } })
}

export async function handleUseFacialProfileRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res)
  if (!user) return

  const result = await useFacialProfileForSearch(user.id)
  sendJson(res, result.ok ? 200 : 404, result)
}
