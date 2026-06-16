import {
  fetchWeTransferDirectUrl,
  getWeTransferFileDirectLink,
  isImageBuffer,
  WeTransferApiError,
} from './wetransferApi'
import { decodeWeTransferFileRef } from './wetransferFileRef'
import { wetransferDebug, wetransferDebugError } from './wetransferDebug'

const CACHE_TTL_MS = 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 2000

interface CacheEntry {
  buffer: Buffer
  contentType: string
  expires: number
}

const thumbCache = new Map<string, CacheEntry>()
const fileCache = new Map<string, CacheEntry>()

function cacheGet(store: Map<string, CacheEntry>, key: string): CacheEntry | null {
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    store.delete(key)
    return null
  }
  return entry
}

function cacheSet(store: Map<string, CacheEntry>, key: string, buffer: Buffer, contentType: string) {
  if (store.size >= MAX_CACHE_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest) store.delete(oldest)
  }
  store.set(key, { buffer, contentType, expires: Date.now() + CACHE_TTL_MS })
}

async function resolveDirectLink(token: string): Promise<string | null> {
  const ref = decodeWeTransferFileRef(token)
  if (!ref) return null

  try {
    const directLink = await getWeTransferFileDirectLink(
      {
        transferId: ref.transferId,
        securityHash: ref.securityHash,
        recipientId: ref.recipientId ?? null,
        inputUrl: '',
      },
      ref.fileId,
    )
    return directLink
  } catch (error) {
    wetransferDebugError('resolve_direct_link_failed', {
      token: token.slice(0, 12),
      fileName: ref.fileName ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function fetchWeTransferFile(
  token: string,
): Promise<{ buffer: Buffer; contentType: string; fileName?: string } | null> {
  const ref = decodeWeTransferFileRef(token)
  const cached = cacheGet(fileCache, token)
  if (cached) {
    return { buffer: cached.buffer, contentType: cached.contentType, fileName: ref?.fileName }
  }

  const directLink = await resolveDirectLink(token)
  if (!directLink) return null

  wetransferDebug('fetch_file', {
    token: token.slice(0, 12),
    fileName: ref?.fileName ?? null,
  })

  const result = await fetchWeTransferDirectUrl(directLink, { fileName: ref?.fileName })
  if (!result || !isImageBuffer(result.buffer, result.contentType)) {
    wetransferDebugError('fetch_file_not_image', {
      fileName: ref?.fileName ?? null,
      contentType: result?.contentType ?? null,
      bytes: result?.buffer.length ?? 0,
    })
    return null
  }

  cacheSet(fileCache, token, result.buffer, result.contentType)
  return { ...result, fileName: ref?.fileName }
}

export async function fetchWeTransferThumbnail(
  token: string,
  _size: number,
): Promise<{ buffer: Buffer; contentType: string; fileName?: string } | null> {
  const cached = cacheGet(thumbCache, token)
  const ref = decodeWeTransferFileRef(token)
  if (cached) {
    return { buffer: cached.buffer, contentType: cached.contentType, fileName: ref?.fileName }
  }

  const result = await fetchWeTransferFile(token)
  if (!result) return null

  cacheSet(thumbCache, token, result.buffer, result.contentType)
  return result
}

export { WeTransferApiError }
