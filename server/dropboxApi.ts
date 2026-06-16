import { getDropboxAccessToken } from './env'
import { dropboxDebug, dropboxDebugError } from './dropboxDebug'

const RPC_BASE = 'https://api.dropboxapi.com/2'
const CONTENT_BASE = 'https://content.dropboxapi.com/2'

export interface DropboxApiError {
  error_summary?: string
  error?: DropboxApiErrorBody
}

type DropboxApiErrorBody = {
  '.tag'?: string
  path?: { '.tag'?: string }
  required_scope?: string
  [key: string]: unknown
}

export interface DropboxContentResult {
  ok: boolean
  buffer?: Buffer
  contentType?: string
  status: number
  endpoint: string
  errorSummary?: string
  tag?: string
  rawBody?: string
}

export class DropboxRequestError extends Error {
  status: number
  tag: string
  errorSummary: string
  rawBody: string
  endpoint: string

  constructor(
    endpoint: string,
    status: number,
    errorSummary: string,
    tag: string,
    rawBody: string,
  ) {
    super(errorSummary || `Dropbox API error (${status})`)
    this.name = 'DropboxRequestError'
    this.endpoint = endpoint
    this.status = status
    this.errorSummary = errorSummary
    this.tag = tag
    this.rawBody = rawBody
  }
}

export interface DropboxFileEntry {
  '.tag': 'file'
  id: string
  name: string
  path_lower: string
  path_display?: string
  size?: number
}

export interface DropboxFolderEntry {
  '.tag': 'folder'
  id: string
  name: string
  path_lower: string
  path_display?: string
}

export type DropboxListEntry = DropboxFileEntry | DropboxFolderEntry

export interface DropboxListResult {
  entries: DropboxListEntry[]
  cursor?: string
  has_more: boolean
}

export interface DropboxSharedLinkMetadata {
  '.tag': 'folder' | 'file'
  name: string
  url?: string
}

export function extractDropboxErrorTag(err: DropboxApiError): string {
  const body = err.error
  if (!body) {
    return err.error_summary?.split('/')[0]?.trim() || 'unknown'
  }

  const tag = body['.tag']
  if (tag === 'path' && body.path?.['.tag']) {
    return `path/${body.path['.tag']}`
  }
  if (tag === 'missing_scope' || tag === 'insufficient_scope') {
    return tag
  }

  return tag || err.error_summary?.split('/')[0]?.trim() || 'unknown'
}

async function dropboxContentRequest(
  endpoint: string,
  apiArg: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<DropboxContentResult> {
  const token = getDropboxAccessToken()
  if (!token) {
    return {
      ok: false,
      status: 401,
      endpoint,
      errorSummary: 'Dropbox access token missing',
      tag: 'missing_token',
    }
  }

  const res = await fetch(`${CONTENT_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify(apiArg),
      ...extraHeaders,
    },
  })

  if (!res.ok) {
    const rawBody = await res.text()
    let parsed: DropboxApiError = {}
    try {
      parsed = JSON.parse(rawBody) as DropboxApiError
    } catch {
      parsed = { error_summary: rawBody.slice(0, 200) }
    }

    const tag = extractDropboxErrorTag(parsed)
    dropboxDebugError('content_api_error', {
      endpoint,
      status: res.status,
      errorSummary: parsed.error_summary ?? res.statusText,
      tag,
      rawBody,
      request: apiArg,
    })

    return {
      ok: false,
      status: res.status,
      endpoint,
      errorSummary: parsed.error_summary ?? res.statusText,
      tag,
      rawBody,
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'

  return {
    ok: true,
    status: res.status,
    endpoint,
    buffer,
    contentType,
  }
}

export async function dropboxRpc<T>(endpoint: string, body: unknown): Promise<T> {
  const token = getDropboxAccessToken()
  if (!token) {
    throw new DropboxRequestError(
      endpoint,
      401,
      'Dropbox access token missing',
      'missing_token',
      '',
    )
  }

  const res = await fetch(`${RPC_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const rawBody = await res.text()

  if (!res.ok) {
    let parsed: DropboxApiError = {}
    try {
      parsed = JSON.parse(rawBody) as DropboxApiError
    } catch {
      parsed = { error_summary: rawBody.slice(0, 200) }
    }

    const tag = extractDropboxErrorTag(parsed)
    throw new DropboxRequestError(
      endpoint,
      res.status,
      parsed.error_summary ?? res.statusText,
      tag,
      rawBody,
    )
  }

  return JSON.parse(rawBody) as T
}

export async function getSharedLinkMetadata(sharedUrl: string): Promise<DropboxSharedLinkMetadata> {
  return dropboxRpc<DropboxSharedLinkMetadata>('sharing/get_shared_link_metadata', { url: sharedUrl })
}

export async function listFolderViaSharedLink(
  sharedUrl: string,
  path = '',
  cursor?: string,
): Promise<DropboxListResult> {
  if (cursor) {
    return dropboxRpc<DropboxListResult>('files/list_folder/continue', { cursor })
  }

  return dropboxRpc<DropboxListResult>('files/list_folder', {
    path,
    shared_link: { url: sharedUrl },
    include_mounted_folders: false,
    include_non_downloadable_files: false,
    recursive: false,
  })
}

/**
 * Thumbnail via file id — no Dropbox-API-Path-Root (shared_link tag is invalid).
 * Tested: works for PNG and HEIC on public shared folders.
 */
export async function fetchThumbnailByFileId(
  fileId: string,
  size: string,
  debugContext?: { fileName?: string; sharedRelativePath?: string },
): Promise<DropboxContentResult> {
  const endpoint = 'files/get_thumbnail_v2'
  const apiArg = {
    resource: { '.tag': 'path', path: fileId },
    format: 'jpeg',
    size,
    mode: 'bestfit',
  }

  dropboxDebug('thumbnail_request', {
    endpoint,
    fileId,
    fileName: debugContext?.fileName,
    sharedRelativePath: debugContext?.sharedRelativePath,
    thumbnailSize: size,
    usesPathRoot: false,
    request: apiArg,
  })

  const result = await dropboxContentRequest(endpoint, apiArg)

  if (result.ok) {
    dropboxDebug('thumbnail_success', {
      fileId,
      fileName: debugContext?.fileName,
      bytes: result.buffer?.length,
      contentType: result.contentType,
    })
  }

  return result
}

export async function fetchSharedLinkFile(
  sharedUrl: string,
  sharedRelativePath: string,
  debugContext?: { fileId?: string; fileName?: string },
): Promise<DropboxContentResult> {
  const endpoint = 'sharing/get_shared_link_file'
  const apiArg = { url: sharedUrl, path: sharedRelativePath }

  dropboxDebug('file_request', {
    endpoint,
    fileId: debugContext?.fileId,
    fileName: debugContext?.fileName,
    sharedRelativePath,
    request: apiArg,
  })

  const result = await dropboxContentRequest(endpoint, apiArg)

  if (result.ok) {
    dropboxDebug('file_success', {
      fileId: debugContext?.fileId,
      fileName: debugContext?.fileName,
      bytes: result.buffer?.length,
      contentType: result.contentType,
    })
  }

  return result
}

export function thumbnailSizeFor(requested: number): string {
  if (requested <= 128) return 'w128h128'
  if (requested <= 256) return 'w256h256'
  if (requested <= 480) return 'w480h320'
  return 'w640h480'
}

export function normalizeDropboxContentType(
  contentType: string,
  fileName: string,
  preferJpeg = false,
): string {
  if (contentType.startsWith('image/')) return contentType

  const ext = fileName.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  }

  if (ext && map[ext]) return map[ext]
  return preferJpeg ? 'image/jpeg' : contentType
}

export function isImageBuffer(buffer: Buffer, fileName: string): boolean {
  if (buffer.length < 100) return false

  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext && /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(fileName)) return true

  // JPEG magic
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true
  // PNG magic
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return true

  return false
}
