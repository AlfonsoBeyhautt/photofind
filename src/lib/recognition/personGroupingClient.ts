import type { PersonGroupPublic, PersonGroupingReadStatus, PersonGroupingStatusPayload } from '../../types/personGrouping'
import { apiGetJson, apiPostJson, isApiTransportError } from '../api/apiFetch'
import { supabase } from '../supabase/client'

const ERROR_MESSAGES: Record<string, string> = {
  PERSON_GROUPING_DISABLED: 'La agrupación por personas no está habilitada.',
  PERSON_GROUPING_FORBIDDEN: 'No tenés acceso a esta función premium.',
  PERSON_GROUPING_NOT_READY: 'El álbum todavía no terminó de indexarse.',
  PERSON_GROUPING_NO_FACES: 'No hay caras indexadas para agrupar en este álbum.',
  PERSON_GROUPING_FAILED: 'No pudimos agrupar las personas del álbum.',
  PERSON_GROUPING_NOT_FOUND: 'No encontramos ese grupo.',
}

export function getPersonGroupingErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? 'Ocurrió un error al agrupar personas.'
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function authPostJson<T>(url: string, body: unknown): Promise<T | { ok: false; error: { code: string; message: string } }> {
  const token = await getAccessToken()
  const data = await apiPostJson<T>(url, body, {
    authToken: token ?? undefined,
    logLabel: url,
  })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: {
        code: data.error.code,
        message: getPersonGroupingErrorMessage(data.error.code, data.error.message),
      },
    }
  }
  return data as T
}

async function authGetJson<T>(url: string): Promise<T | { ok: false; error: { code: string; message: string } }> {
  const token = await getAccessToken()
  const data = await apiGetJson<T>(url, { authToken: token ?? undefined })
  if (isApiTransportError(data)) {
    return {
      ok: false,
      error: {
        code: data.error.code,
        message: getPersonGroupingErrorMessage(data.error.code, data.error.message),
      },
    }
  }
  return data as T
}

export async function ensurePersonGrouping(albumUrl: string): Promise<
  | { ok: true; status: PersonGroupingStatusPayload; needsProcessing: boolean }
  | { ok: false; message: string; code?: string }
> {
  const result = await authPostJson<{
    ok: true
    status: PersonGroupingStatusPayload
    needsProcessing: boolean
  } | { ok: false; error: { code: string; message: string } }>(
    '/api/recognize/person-grouping/ensure',
    { albumUrl },
  )

  if (!result.ok) {
    return { ok: false, message: result.error.message, code: result.error.code }
  }
  return result
}

export async function processPersonGroupingBatch(albumUrl: string): Promise<
  | { ok: true; status: PersonGroupingStatusPayload; done: boolean }
  | { ok: false; message: string; code?: string }
> {
  const result = await authPostJson<{
    ok: true
    status: PersonGroupingStatusPayload
    done: boolean
  } | { ok: false; error: { code: string; message: string } }>(
    '/api/recognize/person-grouping/process',
    { albumUrl },
  )

  if (!result.ok) {
    return { ok: false, message: result.error.message, code: result.error.code }
  }
  return result
}

export async function fetchPersonGroupingStatus(albumUrl: string): Promise<
  | { ok: true; status: PersonGroupingReadStatus }
  | { ok: false; message: string }
> {
  const result = await authGetJson<{
    ok: true
    status: PersonGroupingReadStatus
  } | { ok: false; error: { code: string; message: string } }>(
    `/api/recognize/person-grouping/status?albumUrl=${encodeURIComponent(albumUrl)}`,
  )

  if (!result.ok) {
    return { ok: false, message: result.error.message }
  }
  return result
}

export async function runPersonGroupingPipeline(
  albumUrl: string,
  onProgress?: (status: PersonGroupingStatusPayload) => void,
): Promise<
  | { ok: true; groups: PersonGroupPublic[]; status: PersonGroupingStatusPayload }
  | { ok: false; message: string; code?: string }
> {
  const ensured = await ensurePersonGrouping(albumUrl)
  if (!ensured.ok) return ensured

  onProgress?.(ensured.status)

  if (ensured.status.status === 'ready' && ensured.status.groups) {
    return { ok: true, groups: ensured.status.groups, status: ensured.status }
  }

  if (!ensured.needsProcessing) {
    if (ensured.status.status === 'failed') {
      return { ok: false, message: ensured.status.message, code: 'PERSON_GROUPING_FAILED' }
    }
    return { ok: true, groups: ensured.status.groups ?? [], status: ensured.status }
  }

  let attempts = 0
  const maxAttempts = 500

  while (attempts < maxAttempts) {
    const batch = await processPersonGroupingBatch(albumUrl)
    if (!batch.ok) return batch

    onProgress?.(batch.status)

    if (batch.done && batch.status.status === 'ready') {
      return {
        ok: true,
        groups: batch.status.groups ?? [],
        status: batch.status,
      }
    }

    if (batch.status.status === 'failed') {
      return { ok: false, message: batch.status.message, code: 'PERSON_GROUPING_FAILED' }
    }

    attempts++
    await new Promise((r) => setTimeout(r, 400))
  }

  return { ok: false, message: 'El agrupamiento tardó demasiado. Intentá de nuevo.', code: 'PERSON_GROUPING_FAILED' }
}

export async function fetchPersonGroupDetail(groupId: string): Promise<
  | { ok: true; group: PersonGroupPublic; imageIds: string[] }
  | { ok: false; message: string }
> {
  const result = await authGetJson<{
    ok: true
    group: PersonGroupPublic
    imageIds: string[]
  } | { ok: false; error: { code: string; message: string } }>(
    `/api/recognize/person-group?groupId=${encodeURIComponent(groupId)}`,
  )

  if (!result.ok) {
    return { ok: false, message: result.error.message }
  }
  return result
}
