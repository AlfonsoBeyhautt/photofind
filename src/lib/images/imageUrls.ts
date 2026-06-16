import type { AlbumImage } from '../../types/album'

const HEIC_MIME = new Set(['image/heic', 'image/heif'])
const HEIC_EXT = /\.(heic|heif)$/i

export function isHeicImage(image: AlbumImage): boolean {
  const mime = image.mimeType.toLowerCase()
  if (HEIC_MIME.has(mime)) return true
  return HEIC_EXT.test(image.name)
}

function appendQuery(url: string, key: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${key}=${value}`
}

function isProxiedUrl(url: string): boolean {
  return url.startsWith('/api/')
}

/**
 * Whether the backend must transcode to JPEG for browser display.
 * WeTransfer often serves HEIC as application/octet-stream without a reliable client mimeType.
 */
export function needsDisplayJpeg(image: AlbumImage): boolean {
  if (isHeicImage(image)) return true

  const mime = image.mimeType.toLowerCase()
  if (mime === 'application/octet-stream') return true

  // WeTransfer files are proxied and frequently mislabeled — always request JPEG for display.
  if (image.source === 'wetransfer' && isProxiedUrl(image.thumbnailUrl)) return true

  return false
}

function withDisplayFormat(url: string, image: AlbumImage): string {
  if (needsDisplayJpeg(image)) {
    return appendQuery(url, 'fmt', 'jpeg')
  }
  return url
}

/** Thumbnail URL safe for <img> (HEIC → JPEG via backend). */
export function getGalleryThumbnailUrl(image: AlbumImage): string {
  return withDisplayFormat(image.thumbnailUrl, image)
}

/** Full-size URL for in-app lightbox (never the raw HEIC original). */
export function getLightboxDisplayUrl(image: AlbumImage): string {
  if (image.source === 'google-drive') {
    const largeThumb = image.thumbnailUrl.replace(/sz=\d+/, 'sz=1600')
    return withDisplayFormat(largeThumb, image)
  }

  if (isProxiedUrl(image.originalUrl)) {
    const url = appendQuery(image.originalUrl, 'sz', '2400')
    return withDisplayFormat(url, image)
  }

  return withDisplayFormat(image.originalUrl, image)
}

/** Original file for explicit download (preserves HEIC when applicable). */
export function getDownloadUrl(image: AlbumImage): string {
  if (isProxiedUrl(image.originalUrl)) {
    return appendQuery(image.originalUrl, 'download', '1')
  }
  return image.originalUrl
}
