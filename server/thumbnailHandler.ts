import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchDriveThumbnail } from './imageProxy'
import { getGoogleDriveApiKey } from './env'
import { parseImageDeliveryQuery, sendImagePayload } from './imageDelivery'

export async function handleThumbnailRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  fileId: string,
  requestUrl: string,
): Promise<void> {
  const query = parseImageDeliveryQuery(requestUrl)
  const size = query.maxWidth ?? 400
  const apiKey = getGoogleDriveApiKey()

  const result = await fetchDriveThumbnail(fileId, apiKey, size)

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

export function parseThumbnailPath(url: string): { fileId: string } | null {
  const match = url.match(/^\/api\/drive\/thumbnail\/([^/?]+)/)
  if (!match?.[1]) return null
  return { fileId: match[1] }
}
