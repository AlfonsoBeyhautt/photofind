import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchOneDriveFile, fetchOneDriveThumbnail } from './onedriveImageProxy'
import { parseImageDeliveryQuery, sendImagePayload } from './imageDelivery'

export async function handleOneDriveThumbnailRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
  requestUrl: string,
): Promise<void> {
  const query = parseImageDeliveryQuery(requestUrl)
  const size = query.maxWidth ?? 400
  const result = await fetchOneDriveThumbnail(token, size)

  if (!result) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Thumbnail not found' }))
    return
  }

  await sendImagePayload(
    res,
    { buffer: result.buffer, contentType: result.contentType },
    query,
    { defaultMaxWidth: size },
  )
}

export async function handleOneDriveFileRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
  requestUrl: string,
): Promise<void> {
  const query = parseImageDeliveryQuery(requestUrl)
  const result = await fetchOneDriveFile(token)

  if (!result) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'File not found' }))
    return
  }

  await sendImagePayload(
    res,
    { buffer: result.buffer, contentType: result.contentType },
    query,
    { defaultMaxWidth: query.maxWidth ?? 2400 },
  )
}

export function parseOneDriveThumbnailPath(url: string): { token: string } | null {
  const match = url.match(/^\/api\/onedrive\/thumbnail\/([^/?]+)/)
  if (!match?.[1]) return null
  return { token: match[1] }
}

export function parseOneDriveFilePath(url: string): { token: string } | null {
  const match = url.match(/^\/api\/onedrive\/file\/([^/?]+)/)
  if (!match?.[1]) return null
  return { token: match[1] }
}
