export interface ParsedPixiesetUrl {
  origin: string
  host: string
  collectionKey: string
  gallerySlug: string | null
  inputUrl: string
}

const PIXIESET_HOST = /pixieset\.com$/i

export function isPixiesetUrl(url: string): boolean {
  try {
    return PIXIESET_HOST.test(new URL(url.trim()).hostname)
  } catch {
    return false
  }
}

/**
 * Pixieset URL shapes (beta):
 * - https://photographer.pixieset.com/collection-key/
 * - https://photographer.pixieset.com/collection-key/gallery-slug/
 */
export function parsePixiesetUrl(url: string): ParsedPixiesetUrl | null {
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    if (!PIXIESET_HOST.test(parsed.hostname)) return null

    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length === 0) return null

    const collectionKey = segments[0]
    const gallerySlug = segments.length >= 2 ? segments[1] : null

    return {
      origin: parsed.origin,
      host: parsed.hostname,
      collectionKey,
      gallerySlug,
      inputUrl: trimmed,
    }
  } catch {
    return null
  }
}

export function buildPixiesetGalleryPageUrl(
  parsed: ParsedPixiesetUrl,
  gallerySlug?: string | null,
): string {
  const slug = gallerySlug ?? parsed.gallerySlug
  if (slug) {
    return `${parsed.origin}/${parsed.collectionKey}/${slug}/`
  }
  return `${parsed.origin}/${parsed.collectionKey}/`
}

/** Collection root with ?json=1 bypasses Cloudflare on many albums and exposes allGalleries in init. */
export function buildPixiesetCollectionProbeUrl(parsed: ParsedPixiesetUrl): string {
  return `${parsed.origin}/${parsed.collectionKey}/?json=1`
}
