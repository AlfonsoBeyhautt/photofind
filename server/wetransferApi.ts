import type { ParsedWeTransferUrl } from '../src/lib/wetransfer/parseUrl'
import { parseWeTransferUrl } from '../src/lib/wetransfer/parseUrl'
import { heicDebugLog, magicBytesHex } from './heicDebug'
import { wetransferDebug, wetransferDebugError } from './wetransferDebug'

const WETRANSFER_API = 'https://wetransfer.com/api/v4'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i

export interface WeTransferItem {
  id: string
  name: string
  size: number
  item_type: string
  previewable?: boolean
}

export interface WeTransferTransferInfo {
  id: string
  state: string
  display_name?: string
  description?: string
  items: WeTransferItem[]
  password_protected?: boolean
  expires_at?: string
  shortened_url?: string
  security_hash?: string
  message?: string
}

export type WeTransferApiErrorCode =
  | 'WETRANSFER_INVALID_URL'
  | 'WETRANSFER_EXPIRED'
  | 'WETRANSFER_PASSWORD_REQUIRED'
  | 'WETRANSFER_NOT_READY'
  | 'WETRANSFER_FETCH_FAILED'

export class WeTransferApiError extends Error {
  code: WeTransferApiErrorCode
  status?: number

  constructor(code: WeTransferApiErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'WeTransferApiError'
    this.code = code
    this.status = status
  }
}

function apiHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'x-requested-with': 'XMLHttpRequest',
  }
}

export async function resolveWeTransferUrl(url: string): Promise<string> {
  const trimmed = url.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new WeTransferApiError('WETRANSFER_INVALID_URL', 'URL de WeTransfer inválida.')
  }

  if (!/(^|\.)we\.tl$/i.test(parsed.hostname)) {
    return trimmed
  }

  wetransferDebug('resolve_short_link', { url: trimmed })

  const response = await fetch(trimmed, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
  })

  const resolved = response.url
  if (!resolved || resolved === trimmed) {
    throw new WeTransferApiError(
      'WETRANSFER_INVALID_URL',
      'No se pudo resolver el enlace corto de WeTransfer.',
    )
  }

  wetransferDebug('resolved_short_link', { from: trimmed, to: resolved })
  return resolved
}

export async function resolveWeTransferContext(url: string): Promise<ParsedWeTransferUrl> {
  const resolved = await resolveWeTransferUrl(url)
  const parsed = parseWeTransferUrl(resolved)

  if (!parsed) {
    throw new WeTransferApiError('WETRANSFER_INVALID_URL', 'URL de WeTransfer inválida.')
  }

  if (!parsed.transferId || !parsed.securityHash) {
    const reparsed = parseWeTransferUrl(resolved)
    if (!reparsed?.transferId || !reparsed.securityHash) {
      throw new WeTransferApiError(
        'WETRANSFER_INVALID_URL',
        'No se pudo extraer el transfer de WeTransfer. Usá un enlace we.tl o wetransfer.com/downloads.',
      )
    }
    return { ...reparsed, inputUrl: url.trim() }
  }

  return { ...parsed, inputUrl: url.trim() }
}

function buildPrepareBody(ctx: ParsedWeTransferUrl): Record<string, string> {
  const body: Record<string, string> = {
    security_hash: ctx.securityHash,
    intent: 'entire_transfer',
  }
  if (ctx.recipientId) body.recipient_id = ctx.recipientId
  return body
}

function mapPrepareError(status: number, body: unknown): WeTransferApiError {
  const text = JSON.stringify(body ?? '')
  const lower = text.toLowerCase()

  if (status === 404 || lower.includes('not found') || lower.includes('expired')) {
    return new WeTransferApiError(
      'WETRANSFER_EXPIRED',
      'Este enlace de WeTransfer expiró o ya no está disponible.',
      status,
    )
  }

  if (lower.includes('password') || lower.includes('protected')) {
    return new WeTransferApiError(
      'WETRANSFER_PASSWORD_REQUIRED',
      'Este transfer de WeTransfer está protegido con contraseña. PhotoFind no puede acceder sin ella.',
      status,
    )
  }

  return new WeTransferApiError(
    'WETRANSFER_FETCH_FAILED',
    'No se pudo leer el transfer de WeTransfer.',
    status,
  )
}

export async function prepareWeTransferDownload(ctx: ParsedWeTransferUrl): Promise<WeTransferTransferInfo> {
  const transferId = ctx.transferId
  const endpoint = `${WETRANSFER_API}/transfers/${transferId}/prepare-download`

  wetransferDebug('prepare_download', { transferId, recipientId: ctx.recipientId ?? null })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(buildPrepareBody(ctx)),
  })

  let payload: WeTransferTransferInfo | { error?: string; message?: string } | null = null
  try {
    payload = await response.json() as WeTransferTransferInfo
  } catch {
    payload = null
  }

  if (!response.ok) {
    wetransferDebugError('prepare_download_failed', {
      status: response.status,
      transferId,
      body: payload,
    })
    throw mapPrepareError(response.status, payload)
  }

  if (!payload || !('id' in payload)) {
    throw new WeTransferApiError('WETRANSFER_FETCH_FAILED', 'Respuesta inválida de WeTransfer.')
  }

  if (payload.password_protected) {
    throw new WeTransferApiError(
      'WETRANSFER_PASSWORD_REQUIRED',
      'Este transfer de WeTransfer está protegido con contraseña. PhotoFind no puede acceder sin ella.',
    )
  }

  if (payload.state && payload.state !== 'downloadable') {
    throw new WeTransferApiError(
      'WETRANSFER_NOT_READY',
      `El transfer aún no está listo para descargar (estado: ${payload.state}).`,
    )
  }

  wetransferDebug('prepare_download_ok', {
    transferId: payload.id,
    state: payload.state,
    itemCount: payload.items?.length ?? 0,
  })

  return payload
}

export function filterWeTransferImageItems(items: WeTransferItem[]): WeTransferItem[] {
  return items.filter((item) => {
    if (item.item_type === 'file' || item.item_type === 'image') {
      return IMAGE_EXT.test(item.name) || item.previewable === true
    }
    return false
  })
}

export async function getWeTransferFileDirectLink(
  ctx: ParsedWeTransferUrl,
  fileId: string,
): Promise<string> {
  const endpoint = `${WETRANSFER_API}/transfers/${ctx.transferId}/download`
  const body: Record<string, unknown> = {
    security_hash: ctx.securityHash,
    intent: 'single_file',
    file_ids: [fileId],
  }
  if (ctx.recipientId) body.recipient_id = ctx.recipientId

  wetransferDebug('single_file_download', { transferId: ctx.transferId, fileId })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })

  let payload: { direct_link?: string; error?: string } | null = null
  try {
    payload = await response.json() as { direct_link?: string }
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.direct_link) {
    wetransferDebugError('single_file_failed', {
      status: response.status,
      fileId,
      body: payload,
    })
    throw new WeTransferApiError(
      'WETRANSFER_FETCH_FAILED',
      'No se pudo obtener el enlace de descarga del archivo.',
      response.status,
    )
  }

  return payload.direct_link
}

export async function fetchWeTransferDirectUrl(
  url: string,
  meta?: { fileName?: string },
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  })

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  const expectedBytes = Number(response.headers.get('content-length')) || null
  const buffer = Buffer.from(await response.arrayBuffer())

  const looksLikeHtml = (
    contentType.includes('text/html')
    || contentType.includes('text/plain')
    || buffer.subarray(0, 15).toString('ascii').toLowerCase().includes('<!doctype')
    || buffer.subarray(0, 5).toString('ascii').toLowerCase().startsWith('<html')
  )

  heicDebugLog({
    stage: 'wetransfer_download',
    fileName: meta?.fileName ?? null,
    contentTypeReceived: contentType,
    magicBytesHex: magicBytesHex(buffer),
    bytes: buffer.length,
    expectedBytes,
    directLinkStatus: response.status,
    isHeic: isHeicBuffer(buffer),
    internalError: looksLikeHtml ? 'Response looks like HTML (expired or invalid direct_link)' : undefined,
  })

  if (!response.ok || looksLikeHtml || buffer.length < 128) {
    return null
  }

  if (expectedBytes && buffer.length < expectedBytes * 0.95) {
    heicDebugLog({
      stage: 'wetransfer_download_incomplete',
      fileName: meta?.fileName ?? null,
      bytes: buffer.length,
      expectedBytes,
      internalError: 'Downloaded bytes smaller than Content-Length',
    })
    return null
  }

  return { buffer, contentType }
}

function isHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  const head = buffer.subarray(0, Math.min(64, buffer.length)).toString('ascii')
  return head.includes('ftyp') && /(heic|heix|hevc|hevx|mif1|msf1)/i.test(head)
}

export function isImageBuffer(buffer: Buffer, contentType: string): boolean {
  if (contentType.startsWith('image/')) return true
  if (isHeicBuffer(buffer)) return true
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return true
  return false
}
