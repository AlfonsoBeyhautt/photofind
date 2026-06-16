/**
 * Pixieset integration (public galleries via HTML + loadphotos API).
 *
 * Research summary (2026):
 * - Public galleries expose collection metadata in HTML via PixiesetClient.init({...}).
 * - Photo lists come from the internal JSON endpoint /client/loadphotos/ (cuk, cid, gs, page).
 * - Collection root URLs (…/album/) are often blocked by Cloudflare (403), but
 *   …/album/?json=1 returns the same init with the full allGalleries list on many albums.
 * - Any accessible gallery page also embeds allGalleries for the whole collection.
 * - No official public API; this uses the same endpoints as the Pixieset web client.
 * - Does NOT use Playwright for public albums.
 *
 * Limitations:
 * - Password-protected galleries require session cookies we do not have → PIXIESET_PASSWORD_REQUIRED.
 * - Pixieset may change HTML/endpoint shape without notice (fragile vs Drive/Dropbox APIs).
 * - Passive Cloudflare JSD scripts appear on normal gallery pages; only real challenge pages block us.
 * - CDN image URLs are hotlinked directly; no proxy yet (may break if Pixieset adds referrer checks).
 * - ?json=1 probe may stop working if Pixieset changes routing or bot protection.
 */

import type { AlbumData, AlbumImage, DriveError, FetchAlbumResponse } from '../src/types/album'
import { driveError } from '../src/lib/drive/errors'
import {
  buildPixiesetCollectionProbeUrl,
  buildPixiesetGalleryPageUrl,
  parsePixiesetUrl,
  type ParsedPixiesetUrl,
} from '../src/lib/pixieset/parseUrl'
import {
  fetchPixiesetCollectionPhotos,
  fetchAllPixiesetPhotos,
  fetchPixiesetHtml,
  listGallerySlugs,
  parsePixiesetInit,
  pickOriginalUrl,
  pickThumbnailUrl,
  type PixiesetGalleryInfo,
  type PixiesetPhoto,
} from './pixiesetApi'
import { pixiesetDebug, pixiesetDebugError } from './pixiesetDebug'

const COMMON_GALLERY_SLUGS = [
  'highlights',
  'gallery',
  'photos',
  'all',
  'wedding',
  'ceremony',
  'reception',
]

function pixiesetErr(code: DriveError['code'], message: string): DriveError {
  return driveError(code, message)
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
  }
  return map[ext ?? ''] ?? 'image/jpeg'
}

function toAlbumImage(photo: PixiesetPhoto): AlbumImage | null {
  const thumbnailUrl = pickThumbnailUrl(photo)
  const originalUrl = pickOriginalUrl(photo)
  if (!thumbnailUrl || !originalUrl) return null

  return {
    id: String(photo.id),
    name: photo.name,
    mimeType: mimeFromName(photo.name),
    thumbnailUrl,
    originalUrl,
    webViewLink: originalUrl,
    source: 'pixieset',
    embeddingReady: false,
  }
}

function buildCollectionCandidates(parsed: ParsedPixiesetUrl): string[] {
  const candidates: string[] = []

  if (!parsed.gallerySlug) {
    candidates.push(buildPixiesetCollectionProbeUrl(parsed))
    candidates.push(buildPixiesetGalleryPageUrl(parsed))
    for (const slug of COMMON_GALLERY_SLUGS) {
      candidates.push(buildPixiesetGalleryPageUrl(parsed, slug))
    }
    return candidates
  }

  candidates.push(buildPixiesetGalleryPageUrl(parsed, parsed.gallerySlug))
  candidates.push(buildPixiesetCollectionProbeUrl(parsed))
  return candidates
}

async function resolveCollectionContext(
  parsed: ParsedPixiesetUrl,
): Promise<
  | { info: PixiesetGalleryInfo; html: string; gallerySlugs: string[]; isFullCollection: boolean }
  | DriveError
> {
  const candidates = buildCollectionCandidates(parsed)
  const tried = new Set<string>()
  let lastStatus = 0
  let lastBlocked = false

  for (const pageUrl of candidates) {
    if (tried.has(pageUrl)) continue
    tried.add(pageUrl)

    const { html, blocked, status, hasInit, title, contentType } = await fetchPixiesetHtml(pageUrl)
    lastStatus = status
    lastBlocked = blocked

    pixiesetDebug('resolve_collection_candidate', {
      pageUrl,
      status,
      contentType,
      title,
      blocked,
      hasInit,
    })

    if (blocked && !hasInit) continue

    const info = parsePixiesetInit(html)
    if (!info) continue

    if (info.isPasswordProtected) {
      return pixiesetErr(
        'PIXIESET_PASSWORD_REQUIRED',
        'Esta galería de Pixieset requiere contraseña. PhotoFind solo soporta galerías públicas sin contraseña.',
      )
    }

    const gallerySlugs = listGallerySlugs(info, html, parsed.collectionKey, parsed.gallerySlug)
    if (gallerySlugs.length === 0) {
      return pixiesetErr(
        'PIXIESET_UNSUPPORTED_GALLERY',
        'No pudimos identificar galerías dentro de este álbum de Pixieset.',
      )
    }

    pixiesetDebug('resolve_collection_ok', {
      collectionId: info.collectionId,
      collectionName: info.collectionName,
      gallerySlugs,
      isFullCollection: !parsed.gallerySlug,
      sourceUrl: pageUrl,
    })

    return {
      info,
      html,
      gallerySlugs,
      isFullCollection: !parsed.gallerySlug,
    }
  }

  pixiesetDebugError('resolve_collection_failed', {
    inputUrl: parsed.inputUrl,
    candidates: [...tried],
    lastStatus,
    lastBlocked,
  })

  if (lastBlocked || lastStatus === 403 || lastStatus === 401) {
    return pixiesetErr(
      'PIXIESET_BLOCKED',
      'Pixieset bloquea el acceso automático en algunas galerías. Por ahora no podemos analizar este enlace directamente.',
    )
  }

  return pixiesetErr(
    'PIXIESET_UNSUPPORTED_GALLERY',
    'No pudimos leer este álbum de Pixieset. Verificá que el enlace sea público y esté bien copiado.',
  )
}

function mapLoadPhotosError(error: string): DriveError {
  const lower = error.toLowerCase()
  if (lower.includes('password') || lower.includes('expired session')) {
    return pixiesetErr(
      'PIXIESET_PASSWORD_REQUIRED',
      'Esta galería de Pixieset requiere contraseña o sesión válida.',
    )
  }

  return pixiesetErr('PIXIESET_FETCH_FAILED', `Pixieset no devolvió fotos: ${error}`)
}

export async function fetchPixiesetAlbum(url: string): Promise<FetchAlbumResponse> {
  pixiesetDebug('fetch_start', { inputUrl: url })

  const parsed = parsePixiesetUrl(url)
  if (!parsed) {
    return {
      ok: false,
      error: pixiesetErr(
        'PIXIESET_UNSUPPORTED_GALLERY',
        'El enlace no parece ser una galería válida de Pixieset.',
      ),
    }
  }

  pixiesetDebug('fetch_parsed', {
    host: parsed.host,
    collectionKey: parsed.collectionKey,
    gallerySlug: parsed.gallerySlug,
    mode: parsed.gallerySlug ? 'single_gallery' : 'full_collection',
  })

  const resolved = await resolveCollectionContext(parsed)
  if ('code' in resolved) {
    return { ok: false, error: resolved }
  }

  const { info, gallerySlugs, isFullCollection } = resolved

  let photos: PixiesetPhoto[] = []
  let fetchError: string | undefined

  if (isFullCollection) {
    const result = await fetchPixiesetCollectionPhotos(
      parsed.origin,
      info.collectionUrlKey,
      info.collectionId,
      gallerySlugs,
      (gallerySlug) => buildPixiesetGalleryPageUrl(parsed, gallerySlug),
    )
    photos = result.photos
    fetchError = result.error

    pixiesetDebug('fetch_collection_complete', {
      galleries: result.galleryStats,
      totalPhotos: photos.length,
    })
  } else {
    const gallerySlug = gallerySlugs[0]
    const result = await fetchAllPixiesetPhotos(
      parsed.origin,
      info.collectionUrlKey,
      info.collectionId,
      gallerySlug,
      buildPixiesetGalleryPageUrl(parsed, gallerySlug),
    )
    photos = result.photos
    fetchError = result.error
  }

  if (fetchError && photos.length === 0) {
    return { ok: false, error: mapLoadPhotosError(fetchError) }
  }

  const images = photos
    .map(toAlbumImage)
    .filter((img): img is AlbumImage => img !== null)

  pixiesetDebug('fetch_complete', {
    rawPhotos: photos.length,
    images: images.length,
    gallerySlugs,
    isFullCollection,
  })

  if (photos.length === 0 || images.length === 0) {
    return {
      ok: false,
      error: pixiesetErr(
        'PIXIESET_NO_IMAGES_FOUND',
        'No encontramos imágenes públicas en esta galería de Pixieset.',
      ),
    }
  }

  const album: AlbumData = {
    source: 'pixieset',
    folderId: String(info.collectionId),
    folderName: isFullCollection
      ? info.collectionName
      : `${info.collectionName} — ${gallerySlugs[0]}`,
    images,
    totalImages: images.length,
  }

  return { ok: true, album }
}
