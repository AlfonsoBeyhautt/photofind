import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchWeTransferFile, fetchWeTransferThumbnail } from './wetransferImageProxy'
import { decodeWeTransferFileRef } from './wetransferFileRef'
import { parseImageDeliveryQuery, sendImagePayload } from './imageDelivery'
import { heicDebugLog } from './heicDebug'

export async function handleWeTransferThumbnailRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
  requestUrl: string,
): Promise<void> {
  const query = parseImageDeliveryQuery(requestUrl)
  const size = query.maxWidth ?? 400
  const result = await fetchWeTransferThumbnail(token, size)

  if (!result) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Thumbnail not found' }))
    return
  }

  await sendImagePayload(
    res,
    {
      buffer: result.buffer,
      contentType: result.contentType,
      fileName: decodeWeTransferFileRef(token)?.fileName,
    },
    query,
    { defaultMaxWidth: size, requestUrl },
  )
}

export async function handleWeTransferFileRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
  requestUrl: string,
): Promise<void> {
  const ref = decodeWeTransferFileRef(token)
  if (!ref) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Invalid file reference' }))
    return
  }

  const query = parseImageDeliveryQuery(requestUrl)

  heicDebugLog({
    stage: 'wetransfer_request',
    fileName: ref.fileName ?? null,
    requestUrl,
    isHeic: /\.heic$/i.test(ref.fileName ?? ''),
    conversionAttempted: query.forceJpeg,
  })

  const result = await fetchWeTransferFile(token)

  if (!result) {
    heicDebugLog({
      stage: 'wetransfer_not_found',
      fileName: ref.fileName ?? null,
      requestUrl,
      responseStatus: 404,
    })
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'File not found' }))
    return
  }

  await sendImagePayload(
    res,
    {
      buffer: result.buffer,
      contentType: result.contentType,
      fileName: ref.fileName,
    },
    query,
    { defaultMaxWidth: query.maxWidth ?? 2400, requestUrl },
  )
}

export function parseWeTransferThumbnailPath(url: string): { token: string } | null {
  const match = url.match(/^\/api\/wetransfer\/thumbnail\/([^/?]+)/)
  if (!match?.[1]) return null
  return { token: match[1] }
}

export function parseWeTransferFilePath(url: string): { token: string } | null {
  const match = url.match(/^\/api\/wetransfer\/file\/([^/?]+)/)
  if (!match?.[1]) return null
  return { token: match[1] }
}
