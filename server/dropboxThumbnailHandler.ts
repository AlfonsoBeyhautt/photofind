import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchDropboxFile, fetchDropboxThumbnail } from './dropboxImageProxy'
import { decodeDropboxFileRef } from './dropboxFileRef'
import { parseImageDeliveryQuery, sendImagePayload } from './imageDelivery'

function fileNameFromRef(token: string): string | undefined {
  const ref = decodeDropboxFileRef(token)
  if (!ref) return undefined
  const parts = ref.path.split('/')
  return parts[parts.length - 1] || undefined
}

export async function handleDropboxThumbnailRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
  requestUrl: string,
): Promise<void> {
  const query = parseImageDeliveryQuery(requestUrl)
  const size = query.maxWidth ?? 400
  const result = await fetchDropboxThumbnail(token, size)

  if (!result) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Thumbnail not found' }))
    return
  }

  await sendImagePayload(
    res,
    { buffer: result.buffer, contentType: result.contentType, fileName: fileNameFromRef(token) },
    query,
    { defaultMaxWidth: size },
  )
}

export async function handleDropboxFileRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
  requestUrl: string,
): Promise<void> {
  const query = parseImageDeliveryQuery(requestUrl)
  const result = await fetchDropboxFile(token)

  if (!result) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'File not found' }))
    return
  }

  await sendImagePayload(
    res,
    { buffer: result.buffer, contentType: result.contentType, fileName: fileNameFromRef(token) },
    query,
    { defaultMaxWidth: query.maxWidth ?? 2400 },
  )
}

export function parseDropboxThumbnailPath(url: string): { token: string } | null {
  const match = url.match(/^\/api\/dropbox\/thumbnail\/([^/?]+)/)
  if (!match?.[1]) return null
  return { token: match[1] }
}

export function parseDropboxFilePath(url: string): { token: string } | null {
  const match = url.match(/^\/api\/dropbox\/file\/([^/?]+)/)
  if (!match?.[1]) return null
  return { token: match[1] }
}
