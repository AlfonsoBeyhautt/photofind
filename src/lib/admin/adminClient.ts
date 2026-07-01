import type { AdminErrorResponse, AdminMetrics, AdminMetricsResponse } from '../../types/admin'
import { apiGetJson, apiPostJson, isApiTransportError } from '../api/apiFetch'
import { supabase } from '../supabase/client'

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function adminGetJson<T>(url: string): Promise<T | AdminErrorResponse> {
  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Tenés que iniciar sesión.' } }
  }

  const data = await apiGetJson<T>(url, { authToken: token })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: { code: data.error.code, message: data.error.message },
    }
  }
  return data as T
}

async function adminPostJson<T>(url: string, body: unknown): Promise<T | AdminErrorResponse> {
  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Tenés que iniciar sesión.' } }
  }

  const data = await apiPostJson<T>(url, body, { authToken: token })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: { code: data.error.code, message: data.error.message },
    }
  }
  return data as T
}

export async function fetchAdminMetrics(): Promise<AdminMetricsResponse | AdminErrorResponse> {
  return adminGetJson<AdminMetricsResponse>('/api/admin/metrics')
}

export async function addAdminByEmail(email: string): Promise<
  | { ok: true; admin: { id: string; userId: string; email: string; createdAt: string } }
  | AdminErrorResponse
> {
  return adminPostJson('/api/admin/admins', { email })
}

export function formatAdminDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function providerAdminLabel(provider: string): string {
  const map: Record<string, string> = {
    'google-drive': 'Google Drive',
    dropbox: 'Dropbox',
    pixieset: 'Pixieset',
    wetransfer: 'WeTransfer',
    onedrive: 'OneDrive',
  }
  return map[provider] ?? provider
}

export function errorSourceLabel(source: AdminMetrics['errors'][number]['source']): string {
  const map = {
    album_job: 'Job de álbum',
    album_collection: 'Colección',
    person_grouping: 'Agrupación',
  }
  return map[source]
}
