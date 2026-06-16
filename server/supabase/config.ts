export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!url) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL')
  }
  return url
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (backend only)')
  }
  return key
}

export const FACIAL_PROFILES_BUCKET = 'facial-profiles'

export function facialProfileStoragePath(userId: string): string {
  return `${userId}/profile.jpg`
}
