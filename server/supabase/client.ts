import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { tryGetSupabaseServiceRoleKey, tryGetSupabaseUrl } from './config'

let adminClient: SupabaseClient | null = null
let lastInitError: string | null = null

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseConfigError'
  }
}

/** Returns client or a safe error string — never throws. */
export function tryGetSupabaseAdmin(): { client: SupabaseClient } | { error: string } {
  if (adminClient) return { client: adminClient }

  const url = tryGetSupabaseUrl()
  if (!url) {
    lastInitError = 'Missing SUPABASE_URL or VITE_SUPABASE_URL'
    return { error: lastInitError }
  }

  const key = tryGetSupabaseServiceRoleKey()
  if (!key) {
    lastInitError = 'Missing SUPABASE_SERVICE_ROLE_KEY'
    return { error: lastInitError }
  }

  try {
    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    lastInitError = null
    console.log('[PhotoFind:Server] supabase_init_ok')
    return { client: adminClient }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastInitError = message
    console.error('[PhotoFind:Server] supabase_init_error', message)
    return { error: message }
  }
}

/** Service-role client — bypasses RLS. Throws SupabaseConfigError if misconfigured. */
export function getSupabaseAdmin(): SupabaseClient {
  const result = tryGetSupabaseAdmin()
  if ('error' in result) {
    throw new SupabaseConfigError(result.error)
  }
  return result.client
}

export function getLastSupabaseInitError(): string | null {
  return lastInitError
}
