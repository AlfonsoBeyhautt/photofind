import { decodeOneDriveFileRef } from './onedriveFileRef'
import { fetchItemContent, fetchItemThumbnail } from './onedriveApi'

const cache = new Map<string, { buffer: Buffer; contentType: string; expiresAt: number }>()
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 2000

function getCached(key: string): { buffer: Buffer; contentType: string } | null {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return { buffer: entry.buffer, contentType: entry.contentType }
}

function setCache(key: string, buffer: Buffer, contentType: string): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  cache.set(key, { buffer, contentType, expiresAt: Date.now() + CACHE_TTL_MS })
}

export async function fetchOneDriveThumbnail(
  token: string,
  size: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ref = decodeOneDriveFileRef(token)
  if (!ref) return null

  const cacheKey = `thumb:${token}:${size}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const thumb = await fetchItemThumbnail(ref.driveId, ref.itemId, size)
  if (thumb) {
    setCache(cacheKey, thumb.buffer, thumb.contentType)
    return thumb
  }

  const file = await fetchItemContent(ref.driveId, ref.itemId)
  if (!file) return null

  setCache(cacheKey, file.buffer, file.contentType)
  return file
}

export async function fetchOneDriveFile(
  token: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ref = decodeOneDriveFileRef(token)
  if (!ref) return null

  const cacheKey = `file:${token}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const file = await fetchItemContent(ref.driveId, ref.itemId)
  if (!file) return null

  setCache(cacheKey, file.buffer, file.contentType)
  return file
}
