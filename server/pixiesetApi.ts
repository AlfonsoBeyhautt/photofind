import { pixiesetDebug } from './pixiesetDebug'

export interface PixiesetGalleryInfo {
  collectionId: number
  collectionUrlKey: string
  collectionName: string
  currentGallery: string
  allGalleries: { rank: number; slug: string }[]
  isPasswordProtected: boolean
}

export interface PixiesetPhoto {
  id: number
  idhash: string
  name: string
  pathThumb?: string
  pathSmall?: string
  pathMedium?: string
  pathLarge?: string
  pathXlarge?: string
  pathXxlarge?: string
  gallerySlug?: string
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const XHR_HEADERS = {
  ...BROWSER_HEADERS,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
}

function decodeJsEscapes(value: string): string {
  return value.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
}

function extractInitBlock(html: string): string | null {
  const marker = 'PixiesetClient.init('
  const start = html.indexOf(marker)
  if (start === -1) return null

  const open = html.indexOf('{', start)
  if (open === -1) return null

  let depth = 0
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = open; i < html.length; i += 1) {
    const ch = html[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    if (!inDouble && ch === "'") {
      inSingle = !inSingle
      continue
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      continue
    }

    if (inSingle || inDouble) continue

    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return html.slice(open, i + 1)
    }
  }

  return null
}

function keyPattern(key: string): string {
  return `(?:${key}|'${key}'|"${key}")`
}

function extractNumber(block: string, key: string): number | null {
  const match = block.match(new RegExp(`${keyPattern(key)}\\s*:\\s*(\\d+)`))
  return match ? Number(match[1]) : null
}

function extractString(block: string, key: string): string | null {
  const match =
    block.match(new RegExp(`${keyPattern(key)}\\s*:\\s*'((?:\\\\'|[^'])*)'`))
    ?? block.match(new RegExp(`${keyPattern(key)}\\s*:\\s*"((?:\\\\"|[^"])*)"`))
  if (!match) return null
  return decodeJsEscapes(match[1].replace(/\\'/g, "'").replace(/\\"/g, '"'))
}

function extractBoolean(block: string, key: string): boolean | null {
  const match = block.match(new RegExp(`${keyPattern(key)}\\s*:\\s*(true|false)`))
  if (!match) return null
  return match[1] === 'true'
}

function extractGalleries(block: string): { rank: number; slug: string }[] {
  const match = block.match(
    new RegExp(`${keyPattern('allGalleries')}\\s*:\\s*(\\[(?:[^\\[\\]]|\\[[^\\]]*\\])*\\])`),
  )
  if (!match) return []

  const galleries: { rank: number; slug: string }[] = []
  for (const item of match[1].matchAll(/\{[^}]+\}/g)) {
    const rank = item[0].match(new RegExp(`${keyPattern('rank')}\\s*:\\s*(\\d+)`))?.[1]
    const slug = item[0].match(new RegExp(`${keyPattern('slug')}\\s*:\\s*'((?:\\\\'|[^'])*)'`))?.[1]
    if (rank !== undefined && slug) {
      galleries.push({ rank: Number(rank), slug: slug.replace(/\\'/g, "'") })
    }
  }

  return galleries.sort((a, b) => a.rank - b.rank)
}

/** Fallback when allGalleries is missing: gallery nav links in page HTML. */
export function extractGallerySlugsFromNav(html: string, collectionKey: string): string[] {
  const pattern = new RegExp(`/${collectionKey}/([a-zA-Z0-9_-]+)/`, 'g')
  const slugs = [...html.matchAll(pattern)].map((m) => m[1])
  return [...new Set(slugs)].filter((slug) => slug !== 'store' && slug !== 'download')
}

export function parsePixiesetInit(html: string): PixiesetGalleryInfo | null {
  const block = extractInitBlock(html)
  if (!block) return null

  const collectionId = extractNumber(block, 'collectionId')
  const collectionUrlKey = extractString(block, 'collectionUrlKey')
  const collectionName = extractString(block, 'collectionName')
  const currentGallery = extractString(block, 'currentGallery')

  if (!collectionId || !collectionUrlKey || !currentGallery) return null

  return {
    collectionId,
    collectionUrlKey,
    collectionName: collectionName ?? collectionUrlKey,
    currentGallery,
    allGalleries: extractGalleries(block),
    isPasswordProtected:
      extractBoolean(block, 'isPasswordProtected') === true
      || html.includes('id="gallery-password"')
      || html.includes('password-protected-gallery'),
  }
}

export function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  if (!match) return null
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * Detect a real Cloudflare challenge page, not the passive JSD script tag
 * (`/cdn-cgi/challenge-platform/...`) present on many normal Pixieset galleries.
 */
export function detectCloudflareBlock(html: string, status = 200): boolean {
  const title = extractPageTitle(html)?.toLowerCase() ?? ''
  const hasInit = Boolean(extractInitBlock(html))

  if (hasInit) return false

  if (title.includes('just a moment') || title.includes('attention required')) {
    return true
  }

  if (html.includes('cf-browser-verification') && html.length < 20_000) {
    return true
  }

  if ((status === 403 || status === 503) && html.length < 20_000) {
    return true
  }

  return false
}

export async function fetchPixiesetHtml(pageUrl: string): Promise<{
  ok: boolean
  status: number
  contentType: string | null
  title: string | null
  html: string
  blocked: boolean
  hasInit: boolean
}> {
  pixiesetDebug('fetch_html', { pageUrl })

  const res = await fetch(pageUrl, { headers: BROWSER_HEADERS, redirect: 'follow' })
  const html = await res.text()
  const contentType = res.headers.get('content-type')
  const title = extractPageTitle(html)
  const hasInit = Boolean(extractInitBlock(html))
  const blocked = detectCloudflareBlock(html, res.status)

  const logPayload: Record<string, unknown> = {
    pageUrl,
    status: res.status,
    contentType,
    title,
    htmlLength: html.length,
    blocked,
    hasInit,
  }

  if (!hasInit || blocked) {
    logPayload.htmlPreview = html.slice(0, 500).replace(/\s+/g, ' ')
  }

  pixiesetDebug('fetch_html_result', logPayload)

  return {
    ok: res.ok,
    status: res.status,
    contentType,
    title,
    html,
    blocked,
    hasInit,
  }
}

export interface LoadPhotosResult {
  ok: boolean
  photos: PixiesetPhoto[]
  isLastPage: boolean
  status: string
  rawError?: string
}

export async function fetchPixiesetPhotosPage(
  origin: string,
  collectionKey: string,
  collectionId: number,
  gallerySlug: string,
  page: number,
  referer: string,
): Promise<LoadPhotosResult> {
  const params = new URLSearchParams({
    cuk: collectionKey,
    cid: String(collectionId),
    gs: gallerySlug,
    fk: '',
    page: String(page),
  })

  const endpoint = `${origin}/client/loadphotos/?${params}`
  pixiesetDebug('loadphotos_request', { endpoint, page, gallerySlug, collectionId })

  const res = await fetch(endpoint, {
    headers: { ...XHR_HEADERS, Referer: referer },
  })

  const text = await res.text()
  const contentType = res.headers.get('content-type')
  let data: { status?: string; content?: string; isLastPage?: boolean } = {}

  try {
    data = JSON.parse(text) as typeof data
  } catch {
    pixiesetDebug('loadphotos_invalid_json', {
      endpoint,
      httpStatus: res.status,
      contentType,
      bodyPreview: text.slice(0, 500).replace(/\s+/g, ' '),
    })
    return { ok: false, photos: [], isLastPage: true, status: 'parse_error', rawError: text.slice(0, 200) }
  }

  if (data.status !== 'success') {
    pixiesetDebug('loadphotos_error_status', {
      endpoint,
      httpStatus: res.status,
      contentType,
      apiStatus: data.status,
      bodyPreview: text.slice(0, 500).replace(/\s+/g, ' '),
      page,
    })
    return {
      ok: false,
      photos: [],
      isLastPage: true,
      status: data.status ?? 'error',
      rawError: data.content,
    }
  }

  let photos: PixiesetPhoto[] = []
  try {
    photos = JSON.parse(data.content ?? '[]') as PixiesetPhoto[]
  } catch {
    return { ok: false, photos: [], isLastPage: true, status: 'content_parse_error', rawError: data.content }
  }

  pixiesetDebug('loadphotos_page_ok', {
    page,
    photoCount: photos.length,
    isLastPage: Boolean(data.isLastPage),
  })

  return {
    ok: true,
    photos,
    isLastPage: Boolean(data.isLastPage),
    status: 'success',
  }
}

export function listGallerySlugs(
  info: PixiesetGalleryInfo,
  html: string,
  collectionKey: string,
  requestedSlug: string | null,
): string[] {
  if (requestedSlug) return [requestedSlug]

  const fromInit = info.allGalleries.map((g) => g.slug).filter(Boolean)
  if (fromInit.length > 0) return fromInit

  const fromNav = extractGallerySlugsFromNav(html, collectionKey)
  if (fromNav.length > 0) return fromNav

  return [info.currentGallery]
}

export async function fetchAllPixiesetPhotos(
  origin: string,
  collectionKey: string,
  collectionId: number,
  gallerySlug: string,
  referer: string,
  maxPages = 100,
): Promise<{ photos: PixiesetPhoto[]; error?: string }> {
  const photos: PixiesetPhoto[] = []
  let page = 1

  while (page <= maxPages) {
    const result = await fetchPixiesetPhotosPage(
      origin,
      collectionKey,
      collectionId,
      gallerySlug,
      page,
      referer,
    )

    if (!result.ok) {
      return { photos, error: result.rawError ?? result.status }
    }

    photos.push(...result.photos)

    if (result.isLastPage || result.photos.length === 0) break
    page += 1
  }

  return { photos }
}

export async function fetchPixiesetCollectionPhotos(
  origin: string,
  collectionKey: string,
  collectionId: number,
  gallerySlugs: string[],
  buildReferer: (gallerySlug: string) => string,
): Promise<{ photos: PixiesetPhoto[]; error?: string; galleryStats: { slug: string; count: number }[] }> {
  const photos: PixiesetPhoto[] = []
  const seen = new Set<number>()
  const galleryStats: { slug: string; count: number }[] = []
  let firstError: string | undefined

  for (const gallerySlug of gallerySlugs) {
    const { photos: galleryPhotos, error } = await fetchAllPixiesetPhotos(
      origin,
      collectionKey,
      collectionId,
      gallerySlug,
      buildReferer(gallerySlug),
    )

    if (error) {
      firstError ??= error
      pixiesetDebug('collection_gallery_fetch_failed', { gallerySlug, error })
      continue
    }

    let added = 0
    for (const photo of galleryPhotos) {
      if (seen.has(photo.id)) continue
      seen.add(photo.id)
      photos.push(photo)
      added += 1
    }

    galleryStats.push({ slug: gallerySlug, count: added })
    pixiesetDebug('collection_gallery_fetched', {
      gallerySlug,
      rawPhotos: galleryPhotos.length,
      added,
    })
  }

  if (photos.length === 0 && firstError) {
    return { photos, error: firstError, galleryStats }
  }

  return { photos, galleryStats }
}

/** Pixieset CDN paths are protocol-relative: //images.pixieset.com/... */
export function normalizePixiesetCdnUrl(path: string | undefined): string | null {
  if (!path) return null
  if (path.startsWith('https://') || path.startsWith('http://')) return path
  if (path.startsWith('//')) return `https:${path}`
  if (path.startsWith('/')) return `https://images.pixieset.com${path}`
  return `https://${path}`
}

export function pickThumbnailUrl(photo: PixiesetPhoto): string | null {
  return (
    normalizePixiesetCdnUrl(photo.pathMedium)
    ?? normalizePixiesetCdnUrl(photo.pathSmall)
    ?? normalizePixiesetCdnUrl(photo.pathThumb)
    ?? normalizePixiesetCdnUrl(photo.pathLarge)
  )
}

export function pickOriginalUrl(photo: PixiesetPhoto): string | null {
  return (
    normalizePixiesetCdnUrl(photo.pathLarge)
    ?? normalizePixiesetCdnUrl(photo.pathXlarge)
    ?? normalizePixiesetCdnUrl(photo.pathXxlarge)
    ?? pickThumbnailUrl(photo)
  )
}
