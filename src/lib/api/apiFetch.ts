export interface ApiErrorResult {
  ok: false
  error: {
    code: string
    message: string
    status: number
  }
}

function isDev(): boolean {
  return import.meta.env.DEV
}

function logReference(event: string, data?: Record<string, unknown>): void {
  if (isDev()) {
    console.log(`[PhotoFind:Reference] ${event}`, data ?? '')
  }
}

function previewBody(text: string, max = 240): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export async function apiPostJson<T>(
  url: string,
  body: unknown,
  init?: RequestInit & { authToken?: string | null; logLabel?: string },
): Promise<T | ApiErrorResult> {
  const label = init?.logLabel ?? url
  const payload = JSON.stringify(body)
  logReference('validate_request_start', { url: label, payloadBytes: payload.length })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.authToken ? { Authorization: `Bearer ${init.authToken}` } : {}),
        ...init?.headers,
      },
      body: payload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PhotoFind:Reference] network_error', { url: label, message })
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: isDev() ? `NETWORK_ERROR: ${message}` : 'No pudimos conectar con el servidor.',
        status: 0,
      },
    }
  }

  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  logReference('validate_response', {
    url: label,
    status: res.status,
    contentType,
    bodyPreview: previewBody(text),
  })

  if (!contentType.includes('application/json')) {
    const code = res.status === 404 ? 'API_ROUTE_NOT_FOUND' : 'API_INVALID_RESPONSE'
    const hint = res.status === 404
      ? 'El endpoint /api no está disponible. En Vercel, verificá vercel.json y api/index.ts.'
      : `Respuesta no JSON (HTTP ${res.status}).`
    console.error('[PhotoFind:Reference] invalid_response', { url: label, status: res.status, code, bodyPreview: previewBody(text) })
    return {
      ok: false,
      error: {
        code,
        message: isDev() ? `${code}: ${hint}` : 'El servidor no respondió correctamente. Probá de nuevo en unos minutos.',
        status: res.status,
      },
    }
  }

  try {
    return JSON.parse(text) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PhotoFind:Reference] json_parse_error', { url: label, message, bodyPreview: previewBody(text) })
    return {
      ok: false,
      error: {
        code: 'API_INVALID_RESPONSE',
        message: isDev() ? `API_INVALID_RESPONSE: ${message}` : 'Respuesta inválida del servidor.',
        status: res.status,
      },
    }
  }
}

export async function apiGetJson<T>(
  url: string,
  init?: RequestInit & { authToken?: string | null },
): Promise<T | ApiErrorResult> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.authToken ? { Authorization: `Bearer ${init.authToken}` } : {}),
        ...init?.headers,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: 'NETWORK_ERROR', message, status: 0 },
    }
  }

  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      error: {
        code: res.status === 404 ? 'API_ROUTE_NOT_FOUND' : 'API_INVALID_RESPONSE',
        message: previewBody(text),
        status: res.status,
      },
    }
  }

  return JSON.parse(text) as T
}

export function logCapture(event: string, data?: Record<string, unknown>): void {
  if (isDev()) {
    console.log(`[PhotoFind:Reference] ${event}`, data ?? '')
  }
}

export function captureErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'CAMERA_NOT_READY') return 'CAPTURE_FAILED: la cámara no estaba lista (videoWidth/Height = 0).'
    if (err.message === 'CAPTURE_FAILED') return 'CAPTURE_FAILED: no se pudo generar el JPEG desde el canvas.'
    if (err.message === 'CANVAS_FAILED') return 'CAPTURE_FAILED: no se pudo crear el canvas.'
    return `CAPTURE_FAILED: ${err.message}`
  }
  return 'CAPTURE_FAILED: error desconocido.'
}

/** Transport-layer failure from apiPostJson/apiGetJson (not a backend business error). */
export function isApiTransportError(data: unknown): data is ApiErrorResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as ApiErrorResult).ok === false &&
    typeof (data as ApiErrorResult).error?.status === 'number'
  )
}
