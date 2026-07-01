import type {
  AuthMeResponse,
  DashboardData,
  FacialProfileMeta,
  FacialProfileState,
  RecordSearchBody,
  UseFacialProfileResponse,
} from '../../types/auth'
import type { DetectedFace, ReferenceSource } from '../../types/recognition'
import { apiGetJson, apiPostJson, isApiTransportError } from '../api/apiFetch'
import { getReferenceErrorMessage } from '../../lib/recognition/referenceClient'
import { isSupabaseConfigured, supabase } from '../supabase/client'
import type { AuthUser } from '../../types/auth'

const AUTH_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email o contraseña incorrectos.',
  EMAIL_IN_USE: 'Ya existe una cuenta con ese email.',
  WEAK_PASSWORD: 'La contraseña debe tener al menos 8 caracteres.',
  AUTH_REQUIRED: 'Tenés que iniciar sesión.',
  AUTH_TOKEN_MISSING: 'Tenés que iniciar sesión.',
  PROFILE_NOT_FOUND: 'Todavía no creaste tu perfil facial.',
  INVALID_REQUEST: 'Completá todos los campos.',
  AUTH_FAILED: 'No pudimos completar la solicitud.',
  SUPABASE_NOT_CONFIGURED: 'Supabase no está configurado. Revisá las variables de entorno.',
  SUPABASE_STORAGE_FAILED: 'No pudimos guardar la foto en Supabase Storage.',
  SUPABASE_PROFILE_METADATA_FAILED: 'No pudimos guardar los datos del perfil facial.',
  PROFILE_SAVE_FAILED: 'No pudimos guardar el perfil facial.',
  IMAGE_NORMALIZATION_FAILED: 'No pudimos procesar la imagen en el servidor.',
}

function devMessage(code: string, fallback: string): string {
  return import.meta.env.DEV ? `${code}: ${fallback}` : fallback
}

export function getAuthErrorMessage(code: string, fallback?: string): string {
  return AUTH_MESSAGES[code] ?? getReferenceErrorMessage(code, fallback) ?? fallback ?? 'Ocurrió un error. Intentá de nuevo.'
}

function mapSupabaseUser(user: {
  id: string
  email?: string
  created_at: string
  user_metadata?: Record<string, unknown>
}): AuthUser {
  const name = typeof user.user_metadata?.name === 'string'
    ? user.user_metadata.name.trim()
    : ''
  return {
    id: user.id,
    name: name || user.email?.split('@')[0] || 'Usuario',
    email: user.email ?? '',
    createdAt: user.created_at,
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function authGetJson<T>(url: string): Promise<T | { ok: false; error: { code: string; message: string } }> {
  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: { code: 'AUTH_TOKEN_MISSING', message: getAuthErrorMessage('AUTH_TOKEN_MISSING') } }
  }

  const data = await apiGetJson<T>(url, { authToken: token })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: {
        code: data.error.code,
        message: devMessage(data.error.code, data.error.message),
      },
    }
  }
  return data as T
}

async function authPostJson<T>(
  url: string,
  body?: unknown,
  init?: { method?: string },
): Promise<T | { ok: false; error: { code: string; message: string } }> {
  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: { code: 'AUTH_TOKEN_MISSING', message: getAuthErrorMessage('AUTH_TOKEN_MISSING') } }
  }

  const data = await apiPostJson<T>(url, body ?? {}, {
    authToken: token,
    logLabel: url,
    method: init?.method ?? 'POST',
  })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: {
        code: data.error.code,
        message: devMessage(data.error.code, data.error.message),
      },
    }
  }
  return data as T
}

async function authDeleteJson<T>(url: string): Promise<T | { ok: false; error: { code: string; message: string } }> {
  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: { code: 'AUTH_TOKEN_MISSING', message: getAuthErrorMessage('AUTH_TOKEN_MISSING') } }
  }

  const data = await apiGetJson<T>(url, { authToken: token, method: 'DELETE' })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: {
        code: data.error.code,
        message: devMessage(data.error.code, data.error.message),
      },
    }
  }
  return data as T
}

export async function fetchMe(): Promise<AuthMeResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    return { ok: true, user: null, facialProfile: { hasProfile: false } }
  }

  try {
    const data = await authGetJson<AuthMeResponse>('/api/auth/me')
    if ('error' in data && data.ok === false) {
      return {
        ok: true,
        user: mapSupabaseUser(session.user),
        facialProfile: { hasProfile: false },
      }
    }
    if (data.user) return data
    return {
      ok: true,
      user: mapSupabaseUser(session.user),
      facialProfile: data.facialProfile ?? { hasProfile: false },
    }
  } catch {
    return {
      ok: true,
      user: mapSupabaseUser(session.user),
      facialProfile: { hasProfile: false },
    }
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: { code: string; message: string } }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: { code: 'SUPABASE_NOT_CONFIGURED', message: AUTH_MESSAGES.SUPABASE_NOT_CONFIGURED } }
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() } },
  })

  if (error) {
    const code = error.message.toLowerCase().includes('already') ? 'EMAIL_IN_USE' : 'AUTH_FAILED'
    return { ok: false, error: { code, message: error.message } }
  }

  if (!data.user) {
    return { ok: false, error: { code: 'AUTH_FAILED', message: 'No pudimos crear la cuenta.' } }
  }

  if (!data.session) {
    return {
      ok: false,
      error: {
        code: 'EMAIL_CONFIRMATION_REQUIRED',
        message: 'Revisá tu email para confirmar la cuenta antes de iniciar sesión.',
      },
    }
  }

  return { ok: true, user: mapSupabaseUser(data.user) }
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: { code: string; message: string } }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: { code: 'SUPABASE_NOT_CONFIGURED', message: AUTH_MESSAGES.SUPABASE_NOT_CONFIGURED } }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error || !data.user) {
    return {
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: AUTH_MESSAGES.INVALID_CREDENTIALS },
    }
  }

  return { ok: true, user: mapSupabaseUser(data.user) }
}

export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut()
}

export async function deleteFacialProfile(): Promise<{ ok: boolean; facialProfile: FacialProfileState } | { ok: false; error: { code: string; message: string } }> {
  return authDeleteJson('/api/auth/facial-profile')
}

export async function useFacialProfile(): Promise<UseFacialProfileResponse | { ok: false; error: { code: string; message: string } }> {
  return authPostJson<UseFacialProfileResponse>('/api/auth/facial-profile/use')
}

export type SaveFacialProfileResponse =
  | { ok: true; profile: FacialProfileMeta }
  | { ok: true; needsSelection: true; detectionToken: string; faces: DetectedFace[]; expiresAt: string }
  | { ok: false; error: { code: string; message: string } }

export async function saveFacialProfileFromImage(
  dataBase64: string,
  mimeType: string,
  source: ReferenceSource,
): Promise<SaveFacialProfileResponse> {
  return authPostJson<SaveFacialProfileResponse>('/api/auth/facial-profile', {
    dataBase64,
    mimeType,
    source,
  }) as Promise<SaveFacialProfileResponse>
}

export async function saveFacialProfileFromSelection(
  detectionToken: string,
  faceIndex: number,
): Promise<SaveFacialProfileResponse> {
  return authPostJson<SaveFacialProfileResponse>('/api/auth/facial-profile', {
    detectionToken,
    faceIndex,
  }) as Promise<SaveFacialProfileResponse>
}

export async function fetchDashboard(): Promise<DashboardData | { ok: false; error: { code: string; message: string } }> {
  return authGetJson('/api/auth/dashboard')
}

export async function cancelActiveAlbumJob(
  jobId: string,
): Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }> {
  return authPostJson<{ ok: true }>('/api/auth/active-album-job/cancel', { jobId })
}

export async function recordSearch(data: RecordSearchBody): Promise<void> {
  try {
    await authPostJson('/api/auth/search-history', data)
  } catch {
    console.warn('[PhotoFind] No se pudo guardar la búsqueda en el historial.')
  }
}

export async function deleteSearchHistory(
  searchId: string,
): Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }> {
  return authDeleteJson(`/api/auth/search-history/${encodeURIComponent(searchId)}`)
}

export async function deleteAlbumSearchHistory(
  albumUrl: string,
): Promise<{ ok: true; deletedCount?: number } | { ok: false; error: { code: string; message: string } }> {
  return authDeleteJson(`/api/auth/search-history/album?albumUrl=${encodeURIComponent(albumUrl)}`)
}

export function formatSearchDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Hace un momento'
    if (minutes < 60) return `Hace ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Hace ${hours} h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `Hace ${days} día${days === 1 ? '' : 's'}`
    return formatSearchDate(iso)
  } catch {
    return iso
  }
}

export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    'google-drive': 'Google Drive',
    dropbox: 'Dropbox',
    pixieset: 'Pixieset',
    wetransfer: 'WeTransfer',
  }
  return labels[provider] ?? provider
}

export function userAvatarUrl(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return `https://i.pravatar.cc/80?u=photofind-${hash}`
}

export function formatMemberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

export { mapSupabaseUser, supabase }
