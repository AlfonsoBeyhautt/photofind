const base = 'https://josevilla.pixieset.com'
const endpoints = [
  '/lilyandjonathan/',
  '/client/loadcollection/?cuk=lilyandjonathan',
  '/client/loadgalleries/?cuk=lilyandjonathan&cid=3301757',
]

for (const ep of endpoints) {
  const res = await fetch(base + ep, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json, text/html',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: base + '/',
    },
  })
  const ct = res.headers.get('content-type') || ''
  const text = (await res.text()).slice(0, 300)
  console.log(ep, res.status, ct.split(';')[0], text.replace(/\s+/g, ' '))
}

const html = await (await fetch(base + '/lilyandjonathan/highlights/', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
})).text()

const cid = html.match(/collectionId['"]?:\s*(\d+)/)?.[1]
const cuk = html.match(/collectionUrlKey['"]?:\s*['"]([^'"]+)/)?.[1]
const currentGallery = html.match(/currentGallery['"]?:\s*['"]([^'"]+)/)?.[1]
const isPassword = html.match(/isPasswordProtected['"]?:\s*(true|false)/)?.[1]
const passwordForm = html.includes('password-protected') || html.includes('gallery-password')
console.log('extracted', { cid, cuk, currentGallery, isPassword, passwordForm })
