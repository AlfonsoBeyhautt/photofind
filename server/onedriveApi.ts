import {
  getMicrosoftGraphAccessToken,
  getMicrosoftGraphClientCredentials,
} from './env'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const CONSUMER_BASE = 'https://api.onedrive.com/v1.0'

export interface OneDriveDriveItem {
  id: string
  name: string
  size?: number
  file?: { mimeType?: string }
  folder?: { childCount?: number }
  parentReference?: { driveId?: string; id?: string; path?: string }
  webUrl?: string
  '@microsoft.graph.downloadUrl'?: string
}

export interface OneDriveListResult {
  value: OneDriveDriveItem[]
  '@odata.nextLink'?: string
}

export class OneDriveRequestError extends Error {
  tag: string
  status: number
  endpoint: string
  rawBody: string

  constructor(
    message: string,
    tag: string,
    status: number,
    endpoint: string,
    rawBody = '',
  ) {
    super(message)
    this.name = 'OneDriveRequestError'
    this.tag = tag
    this.status = status
    this.endpoint = endpoint
    this.rawBody = rawBody
  }
}

let cachedAppToken: { token: string; expiresAt: number } | null = null

export function encodeSharingUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
  return `u!${base64}`
}

export async function resolveOneDriveShareUrl(url: string): Promise<string> {
  let current = url.trim()
  const seen = new Set<string>()

  for (let i = 0; i < 10; i += 1) {
    if (seen.has(current)) break
    seen.add(current)

    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) break
      current = new URL(location, current).toString()
      continue
    }

    break
  }

  return current
}

async function fetchAppAccessToken(): Promise<string> {
  const creds = getMicrosoftGraphClientCredentials()
  if (!creds) {
    throw new OneDriveRequestError(
      'Microsoft Graph credentials not configured',
      'missing_token',
      0,
      'oauth/token',
    )
  }

  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60_000) {
    return cachedAppToken.token
  }

  const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  const text = await res.text()
  let data: { access_token?: string; expires_in?: number; error?: string } = {}
  try {
    data = JSON.parse(text) as typeof data
  } catch {
    throw new OneDriveRequestError('Invalid token response', 'token_parse_error', res.status, tokenUrl, text)
  }

  if (!res.ok || !data.access_token) {
    throw new OneDriveRequestError(
      data.error ?? 'Failed to obtain Graph token',
      'token_error',
      res.status,
      tokenUrl,
      text,
    )
  }

  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }

  return data.access_token
}

export async function getGraphToken(): Promise<string | null> {
  const staticToken = getMicrosoftGraphAccessToken()
  if (staticToken) return staticToken

  try {
    return await fetchAppAccessToken()
  } catch (err) {
    if (err instanceof OneDriveRequestError && err.tag === 'missing_token') {
      return null
    }
    throw err
  }
}

async function graphFetch<T>(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getGraphToken()
  if (!token) {
    throw new OneDriveRequestError(
      'Microsoft Graph token not configured',
      'missing_token',
      0,
      path,
    )
  }

  const endpoint = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`
  const res = await fetch(endpoint, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Prefer: 'redeemSharingLinkIfNecessary',
      ...options.headers,
    },
  })

  const text = await res.text()
  if (!res.ok) {
    let tag = 'graph_error'
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string } }
      tag = parsed.error?.code ?? tag
    } catch {
      // ignore
    }
    throw new OneDriveRequestError(
      `Graph API error (${res.status})`,
      tag,
      res.status,
      endpoint,
      text,
    )
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new OneDriveRequestError('Invalid JSON from Graph', 'parse_error', res.status, endpoint, text)
  }
}

async function consumerFetch<T>(path: string): Promise<T> {
  const endpoint = path.startsWith('http') ? path : `${CONSUMER_BASE}${path}`
  const res = await fetch(endpoint, { headers: { Accept: 'application/json' } })
  const text = await res.text()

  if (!res.ok) {
    let tag = 'consumer_error'
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string } }
      tag = parsed.error?.code ?? tag
    } catch {
      // ignore
    }
    throw new OneDriveRequestError(
      `OneDrive consumer API error (${res.status})`,
      tag,
      res.status,
      endpoint,
      text,
    )
  }

  return JSON.parse(text) as T
}

export async function getSharedRootItem(shareUrl: string): Promise<OneDriveDriveItem> {
  const shareId = encodeSharingUrl(shareUrl)

  try {
    return await graphFetch<OneDriveDriveItem>(`/shares/${shareId}/driveItem`)
  } catch (err) {
    if (!(err instanceof OneDriveRequestError)) throw err
    if (err.tag !== 'missing_token' && err.status !== 401) throw err
  }

  const consumer = await consumerFetch<{ folder?: object; file?: object; id: string; name: string }>(
    `/shares/${shareId}/root`,
  )
  return consumer as OneDriveDriveItem
}

export async function listDriveChildren(
  driveId: string,
  itemId: string,
): Promise<OneDriveDriveItem[]> {
  const items: OneDriveDriveItem[] = []
  let next: string | undefined = `/drives/${driveId}/items/${itemId}/children?$top=200`

  while (next) {
    const page: OneDriveListResult = await graphFetch<OneDriveListResult>(next)
    items.push(...page.value)
    next = page['@odata.nextLink']
  }

  return items
}

export async function listSharedChildren(shareUrl: string): Promise<OneDriveDriveItem[]> {
  const shareId = encodeSharingUrl(shareUrl)
  const items: OneDriveDriveItem[] = []
  let next: string | undefined = `/shares/${shareId}/driveItem/children?$top=200`

  try {
    while (next) {
      const page: OneDriveListResult = await graphFetch<OneDriveListResult>(next)
      items.push(...page.value)
      next = page['@odata.nextLink']
    }
    return items
  } catch (err) {
    if (!(err instanceof OneDriveRequestError)) throw err
    if (err.tag === 'missing_token' || err.status === 401) {
      const page = await consumerFetch<{ value: OneDriveDriveItem[] }>(
        `/shares/${shareId}/root/children`,
      )
      return page.value ?? []
    }
    throw err
  }
}

export async function fetchItemThumbnail(
  driveId: string,
  itemId: string,
  size: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const token = await getGraphToken()
  if (!token) return null

  const pick =
    size >= 500 ? 'large' : size >= 250 ? 'medium' : 'small'

  const endpoint = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/thumbnails/0/${pick}/content`
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) return null

  const buffer = Buffer.from(await res.arrayBuffer())
  return {
    buffer,
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  }
}

export async function fetchItemContent(
  driveId: string,
  itemId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const token = await getGraphToken()
  if (!token) return null

  const meta = await graphFetch<OneDriveDriveItem>(`/drives/${driveId}/items/${itemId}`)
  const downloadUrl = meta['@microsoft.graph.downloadUrl']
  if (!downloadUrl) return null

  const res = await fetch(downloadUrl)
  if (!res.ok) return null

  const buffer = Buffer.from(await res.arrayBuffer())
  return {
    buffer,
    contentType: res.headers.get('content-type') ?? meta.file?.mimeType ?? 'application/octet-stream',
  }
}
