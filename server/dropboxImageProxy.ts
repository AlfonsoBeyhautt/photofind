import {
  fetchSharedLinkFile,
  fetchThumbnailByFileId,
  isImageBuffer,
  normalizeDropboxContentType,
  thumbnailSizeFor,
} from './dropboxApi'
import { decodeDropboxFileRef } from './dropboxFileRef'
import { dropboxDebug, dropboxDebugError } from './dropboxDebug'

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

function fileNameFromPath(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || 'image'
}

export async function fetchDropboxThumbnail(
  token: string,
  size: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ref = decodeDropboxFileRef(token)
  if (!ref) {
    dropboxDebugError('thumbnail_decode_failed', { tokenPreview: token.slice(0, 24) })
    return null
  }

  const fileName = fileNameFromPath(ref.path)
  const cacheKey = `${token}-w${size}`
  const cached = cacheGet(thumbCache, cacheKey)
  if (cached) {
    dropboxDebug('thumbnail_cache_hit', { fileId: ref.fileId, fileName, sharedRelativePath: ref.path })
    return { buffer: cached.buffer, contentType: cached.contentType }
  }

  dropboxDebug('thumbnail_fetch_start', {
    fileId: ref.fileId ?? null,
    fileName,
    sharedRelativePath: ref.path,
    hasFileId: Boolean(ref.fileId),
    requestedSize: size,
  })

  const thumbSize = thumbnailSizeFor(size)

  if (ref.fileId) {
    const thumb = await fetchThumbnailByFileId(ref.fileId, thumbSize, {
      fileName,
      sharedRelativePath: ref.path,
    })

    if (thumb.ok && thumb.buffer && thumb.buffer.length >= 100) {
      const contentType = normalizeDropboxContentType(thumb.contentType ?? '', fileName, true)
      cacheSet(thumbCache, cacheKey, thumb.buffer, contentType)
      return { buffer: thumb.buffer, contentType }
    }

    dropboxDebug('thumbnail_by_id_failed', {
      fileId: ref.fileId,
      fileName,
      status: thumb.status,
      errorSummary: thumb.errorSummary,
      tag: thumb.tag,
      willTryFileFallback: true,
    })
  } else {
    dropboxDebug('thumbnail_no_file_id', {
      fileName,
      sharedRelativePath: ref.path,
      willTryFileFallback: true,
    })
  }

  dropboxDebug('thumbnail_fallback_to_file', {
    fileId: ref.fileId,
    fileName,
    sharedRelativePath: ref.path,
  })

  const file = await fetchSharedLinkFile(ref.sharedUrl, ref.path, {
    fileId: ref.fileId,
    fileName,
  })

  if (!file.ok || !file.buffer) {
    dropboxDebugError('thumbnail_fallback_failed', {
      fileId: ref.fileId,
      fileName,
      sharedRelativePath: ref.path,
      status: file.status,
      errorSummary: file.errorSummary,
      tag: file.tag,
    })
    return null
  }

  if (!isImageBuffer(file.buffer, fileName)) {
    dropboxDebugError('thumbnail_fallback_not_image', {
      fileId: ref.fileId,
      fileName,
      bytes: file.buffer.length,
      contentType: file.contentType,
    })
    return null
  }

  const contentType = normalizeDropboxContentType(file.contentType ?? '', fileName)
  dropboxDebug('thumbnail_fallback_success', {
    fileId: ref.fileId,
    fileName,
    bytes: file.buffer.length,
    contentType,
  })

  cacheSet(thumbCache, cacheKey, file.buffer, contentType)
  return { buffer: file.buffer, contentType }
}

export async function fetchDropboxFile(
  token: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ref = decodeDropboxFileRef(token)
  if (!ref) return null

  const fileName = fileNameFromPath(ref.path)
  const cached = cacheGet(fileCache, token)
  if (cached) return { buffer: cached.buffer, contentType: cached.contentType }

  const file = await fetchSharedLinkFile(ref.sharedUrl, ref.path, {
    fileId: ref.fileId,
    fileName,
  })

  if (!file.ok || !file.buffer) return null

  const contentType = normalizeDropboxContentType(file.contentType ?? '', fileName)
  cacheSet(fileCache, token, file.buffer, contentType)
  return { buffer: file.buffer, contentType }
}
