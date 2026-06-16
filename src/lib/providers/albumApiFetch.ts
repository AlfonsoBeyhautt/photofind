import type { DriveErrorCode, FetchAlbumResponse } from '../../types/album'
import { driveError } from '../drive/errors'

const DEFAULT_TIMEOUT_MS = 90_000

function devDetail(code: string, detail: string): string | undefined {
  return import.meta.env.DEV ? `${code}: ${detail}` : undefined
}

export async function postAlbumJson(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; logLabel?: string },
): Promise<FetchAlbumResponse> {
  const label = options?.logLabel ?? path
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  console.log('[PhotoFind:Album] fetch_start', { label, timeoutMs })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await res.text()
    const contentType = res.headers.get('content-type') ?? ''

    if (!contentType.includes('application/json')) {
      const code: DriveErrorCode = res.status === 404 ? 'API_ROUTE_FAILED' : 'INVALID_JSON_RESPONSE'
      console.error('[PhotoFind:Album] fetch_error', { label, code, status: res.status, bodyPreview: text.slice(0, 160) })
      return {
        ok: false,
        error: driveError(
          code,
          devDetail(code, `HTTP ${res.status}`) ?? 'El servidor no respondió correctamente al leer el álbum.',
        ),
      }
    }

    let data: FetchAlbumResponse
    try {
      data = JSON.parse(text) as FetchAlbumResponse
    } catch (parseErr) {
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr)
      console.error('[PhotoFind:Album] fetch_error', { label, code: 'INVALID_JSON_RESPONSE', message })
      return {
        ok: false,
        error: driveError(
          'INVALID_JSON_RESPONSE',
          devDetail('INVALID_JSON_RESPONSE', message) ?? 'Respuesta inválida del servidor.',
        ),
      }
    }

    if (data.ok) {
      console.log('[PhotoFind:Album] fetch_done', { label, images: data.album.totalImages })
      return data
    }

    console.error('[PhotoFind:Album] fetch_error', { label, error: data.error })
    return data
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const code: DriveErrorCode = isAbort ? 'TIMEOUT' : 'UNKNOWN_ERROR'
    const message = isAbort
      ? (devDetail('TIMEOUT', 'La solicitud superó el tiempo máximo.') ?? 'La lectura del álbum tardó demasiado. Intentá de nuevo.')
      : devDetail('UNKNOWN_ERROR', err instanceof Error ? err.message : String(err))
    console.error('[PhotoFind:Album] fetch_error', { label, code, err })
    return { ok: false, error: driveError(code, message) }
  } finally {
    clearTimeout(timer)
  }
}
