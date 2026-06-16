/**
 * Verifies Pixieset root album URLs discover all child galleries and photos.
 * Run: node scripts/verify-pixieset-fix.mjs
 */

const ROOT_URLS = [
  {
    url: 'https://josevilla.pixieset.com/lilyandjonathan/',
    expectedMinPhotos: 140,
    expectedGalleries: 1,
  },
  {
    url: 'https://philliptatton.pixieset.com/carmeandmike/',
    expectedMinPhotos: 1000,
    expectedGalleries: 3,
  },
]

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

function keyPattern(key) {
  return `(?:${key}|'${key}'|"${key}")`
}

function extractInitBlock(html) {
  const marker = 'PixiesetClient.init('
  const start = html.indexOf(marker)
  if (start === -1) return null
  const open = html.indexOf('{', start)
  let depth = 0, inSingle = false, inDouble = false, escaped = false
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (!inDouble && ch === "'") { inSingle = !inSingle; continue }
    if (!inSingle && ch === '"') { inDouble = !inDouble; continue }
    if (inSingle || inDouble) continue
    if (ch === '{') depth += 1
    else if (ch === '}') { depth -= 1; if (depth === 0) return html.slice(open, i + 1) }
  }
  return null
}

function extractGalleries(block) {
  const match = block.match(
    new RegExp(`${keyPattern('allGalleries')}\\s*:\\s*(\\[(?:[^\\[\\]]|\\[[^\\]]*\\])*\\])`),
  )
  if (!match) return []
  const galleries = []
  for (const item of match[1].matchAll(/\{[^}]+\}/g)) {
    const rank = item[0].match(new RegExp(`${keyPattern('rank')}\\s*:\\s*(\\d+)`))?.[1]
    const slug = item[0].match(new RegExp(`${keyPattern('slug')}\\s*:\\s*'((?:\\\\'|[^'])*)'`))?.[1]
    if (rank !== undefined && slug) galleries.push({ rank: Number(rank), slug })
  }
  return galleries.sort((a, b) => a.rank - b.rank)
}

function parseInit(html) {
  const block = extractInitBlock(html)
  if (!block) return null
  const collectionId = Number(block.match(new RegExp(`${keyPattern('collectionId')}\\s*:\\s*(\\d+)`))?.[1])
  const collectionUrlKey = block.match(new RegExp(`${keyPattern('collectionUrlKey')}\\s*:\\s*'((?:\\\\'|[^'])*)'`))?.[1]
  const collectionName = block.match(new RegExp(`${keyPattern('collectionName')}\\s*:\\s*'((?:\\\\'|[^'])*)'`))?.[1]
  if (!collectionId || !collectionUrlKey) return null
  return {
    collectionId,
    collectionUrlKey,
    collectionName: collectionName ?? collectionUrlKey,
    allGalleries: extractGalleries(block),
  }
}

async function fetchGalleryPhotos(origin, info, gallerySlug) {
  let page = 1
  const photos = []
  while (page <= 100) {
    const params = new URLSearchParams({
      cuk: info.collectionUrlKey,
      cid: String(info.collectionId),
      gs: gallerySlug,
      fk: '',
      page: String(page),
    })
    const endpoint = `${origin}/client/loadphotos/?${params}`
    const res = await fetch(endpoint, {
      headers: {
        ...XHR_HEADERS,
        Referer: `${origin}/${info.collectionUrlKey}/${gallerySlug}/`,
      },
    })
    const data = JSON.parse(await res.text())
    if (data.status !== 'success') {
      throw new Error(`${gallerySlug}: ${data.content ?? data.status}`)
    }
    photos.push(...JSON.parse(data.content ?? '[]'))
    if (data.isLastPage) break
    page += 1
  }
  return photos
}

async function probeRootAlbum({ url, expectedMinPhotos, expectedGalleries }) {
  console.log(`\n=== ${url} ===`)

  const plain = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' })
  const plainHtml = await plain.text()
  console.log('plain root:', {
    status: plain.status,
    hasInit: Boolean(extractInitBlock(plainHtml)),
    title: plainHtml.match(/<title[^>]*>([^<]+)/i)?.[1]?.slice(0, 40),
  })

  const probeUrl = url.includes('?') ? `${url}&json=1` : `${url}?json=1`
  const probe = await fetch(probeUrl, { headers: BROWSER_HEADERS, redirect: 'follow' })
  const probeHtml = await probe.text()
  const info = parseInit(probeHtml)
  const gallerySlugs = info?.allGalleries.map((g) => g.slug) ?? []

  console.log('json=1 probe:', {
    status: probe.status,
    hasInit: Boolean(extractInitBlock(probeHtml)),
    collectionName: info?.collectionName,
    galleries: gallerySlugs,
  })

  if (!info || gallerySlugs.length === 0) {
    console.log('FAIL: could not discover galleries')
    return false
  }

  const origin = new URL(url).origin
  const seen = new Set()
  let total = 0
  for (const slug of gallerySlugs) {
    const photos = await fetchGalleryPhotos(origin, info, slug)
    let added = 0
    for (const photo of photos) {
      if (seen.has(photo.id)) continue
      seen.add(photo.id)
      added += 1
    }
    total += added
    console.log(`  ${slug}: ${added} photos`)
  }

  console.log(`TOTAL: ${total} photos from ${gallerySlugs.length} galleries`)
  const ok =
    gallerySlugs.length >= expectedGalleries
    && total >= expectedMinPhotos
  console.log(ok ? 'PASS' : 'FAIL')
  return ok
}

let passed = 0
for (const caseDef of ROOT_URLS) {
  if (await probeRootAlbum(caseDef)) passed += 1
}

console.log(`\n${passed}/${ROOT_URLS.length} root albums OK`)
process.exit(passed === ROOT_URLS.length ? 0 : 1)
