/**
 * Server-side thumbnail proxy for Google Drive images.
 * Browser cannot reliably load thumbnailLink URLs or hundreds of concurrent Drive requests.
 */

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_ENTRIES = 2000

interface CacheEntry {
  buffer: Buffer
  contentType: string
  expires: number
}

const thumbCache = new Map<string, CacheEntry>()

function cacheGet(key: string): CacheEntry | null {
  const entry = thumbCache.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    thumbCache.delete(key)
    return null
  }
  return entry
}

function cacheSet(key: string, buffer: Buffer, contentType: string) {
  if (thumbCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = thumbCache.keys().next().value
    if (oldest) thumbCache.delete(oldest)
  }
  thumbCache.set(key, { buffer, contentType, expires: Date.now() + CACHE_TTL_MS })
}

function isImageResponse(contentType: string, size: number): boolean {
  return contentType.startsWith('image/') && size > 200
}

export async function fetchDriveThumbnail(
  fileId: string,
  apiKey: string | undefined,
  size: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cacheKey = `${fileId}-w${size}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    return { buffer: cached.buffer, contentType: cached.contentType }
  }

  const sources: string[] = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`,
  ]

  for (const url of sources) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) continue

      const contentType = res.headers.get('content-type') ?? 'image/jpeg'
      const buffer = Buffer.from(await res.arrayBuffer())
      if (!isImageResponse(contentType, buffer.length)) continue

      cacheSet(cacheKey, buffer, contentType)
      return { buffer, contentType }
    } catch {
      continue
    }
  }

  if (apiKey) {
    try {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink&supportsAllDrives=true&key=${apiKey}`,
      )
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { thumbnailLink?: string }
        if (meta.thumbnailLink) {
          const thumbUrl = meta.thumbnailLink.replace(/=s\d+$/, `=w${size}`)
          const thumbRes = await fetch(thumbUrl, { redirect: 'follow' })
          if (thumbRes.ok) {
            const contentType = thumbRes.headers.get('content-type') ?? 'image/jpeg'
            const buffer = Buffer.from(await thumbRes.arrayBuffer())
            if (isImageResponse(contentType, buffer.length)) {
              cacheSet(cacheKey, buffer, contentType)
              return { buffer, contentType }
            }
          }
        }
      }
    } catch {
      // fall through
    }
  }

  return null
}

export function buildThumbnailProxyPath(fileId: string, size = 400): string {
  return `/api/drive/thumbnail/${fileId}?sz=${size}`
}