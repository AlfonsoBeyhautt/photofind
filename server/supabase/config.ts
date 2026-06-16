export function isSupabaseUrlConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim())
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

export function tryGetSupabaseUrl(): string | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  return url || null
}

export function tryGetSupabaseServiceRoleKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return key || null
}

export function getSupabaseUrl(): string {
  const url = tryGetSupabaseUrl()
  if (!url) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL')
  }
  return url
}

export function getSupabaseServiceRoleKey(): string {
  const key = tryGetSupabaseServiceRoleKey()
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (backend only)')
  }
  return key
}

export const FACIAL_PROFILES_BUCKET = 'facial-profiles'

export function facialProfileStoragePath(userId: string): string {
  return `${userId}/profile.jpg`
}
