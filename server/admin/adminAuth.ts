import type { IncomingMessage, ServerResponse } from 'node:http'
import { getAuthenticatedUser } from '../auth/supabaseAuth'
import type { PublicUser } from '../auth/types'
import { SupabaseConfigError } from '../supabase/client'
import { ensureBootstrapAdmin, findAdminByUserId } from '../supabase/adminUserStore'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/** Generic denial — does not reveal that /admin exists. */
export function denyAdminAccess(res: ServerResponse): void {
  sendJson(res, 404, {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'No encontrado.' },
  })
}

export async function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<PublicUser | null> {
  let user: PublicUser | null
  try {
    user = await getAuthenticatedUser(req)
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

  if (!user) {
    sendJson(res, 401, {
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'Tenés que iniciar sesión.' },
    })
    return null
  }

  await ensureBootstrapAdmin()

  const adminRow = await findAdminByUserId(user.id)
  if (!adminRow) {
    denyAdminAccess(res)
    return null
  }

  return user
}
