import type { IncomingMessage } from 'node:http'
import type { User } from '@supabase/supabase-js'
import { tryGetSupabaseAdmin, SupabaseConfigError } from '../supabase/client'
import type { PublicUser } from './types'

function getBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7).trim()
  return token || null
}

export function toPublicUser(user: User): PublicUser {
  const meta = user.user_metadata as { name?: string } | undefined
  return {
    id: user.id,
    name: meta?.name?.trim() || user.email?.split('@')[0] || 'Usuario',
    email: user.email ?? '',
    createdAt: user.created_at,
  }
}

/** Verifies Supabase JWT from Authorization: Bearer <access_token> */
export async function getAuthenticatedUser(req: IncomingMessage): Promise<PublicUser | null> {
  const token = getBearerToken(req)
  if (!token) return null

  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) {
    console.error('[PhotoFind:Server] auth_getUser_config_error', admin.error)
    throw new SupabaseConfigError(admin.error)
  }

  const { data: { user }, error } = await admin.client.auth.getUser(token)
  if (error) {
    console.error('[PhotoFind:Server] auth_getUser_error', { message: error.message, status: error.status })
    return null
  }
  if (!user) return null
  return toPublicUser(user)
}

export function getAccessToken(req: IncomingMessage): string | null {
  return getBearerToken(req)
}
