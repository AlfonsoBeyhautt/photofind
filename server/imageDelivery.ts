import type { ServerResponse } from 'node:http'
import { DisplayImageError, isHeicImage, toDisplayImage } from './displayImage'
import { heicDebugLog } from './heicDebug'

export interface RawImagePayload {
  buffer: Buffer
  contentType: string
  fileName?: string
}

export interface ImageDeliveryQuery {
  download?: boolean
  forceJpeg?: boolean
  maxWidth?: number
}

export function parseImageDeliveryQuery(url: string): ImageDeliveryQuery {
  const parsed = new URL(url, 'http://localhost')
  return {
    download: parsed.searchParams.get('download') === '1',
    forceJpeg: parsed.searchParams.get('fmt') === 'jpeg',
    maxWidth: parsed.searchParams.has('sz')
      ? Math.min(Math.max(Number(parsed.searchParams.get('sz')) || 400, 100), 2400)
      : undefined,
  }
}

export async function sendImagePayload(
  res: ServerResponse,
  payload: RawImagePayload,
  query: ImageDeliveryQuery,
  options?: { defaultMaxWidth?: number; requestUrl?: string },
): Promise<void> {
  const heic = isHeicImage(payload.contentType, payload.fileName, payload.buffer)

  if (query.download) {
    res.statusCode = 200
    res.setHeader('Content-Type', payload.contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    if (payload.fileName) {
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(payload.fileName)}"`)
    }
    heicDebugLog({
      stage: 'download',
      fileName: payload.fileName ?? null,
      responseStatus: 200,
      responseContentType: payload.contentType,
      requestUrl: options?.requestUrl,
      isHeic: heic,
      conversionAttempted: false,
    })
    res.end(payload.buffer)
    return
  }

  try {
    const display = await toDisplayImage(payload.buffer, payload.contentType, {
      fileName: payload.fileName,
      forceJpeg: query.forceJpeg,
      maxWidth: query.maxWidth ?? options?.defaultMaxWidth,
      requestUrl: options?.requestUrl,
    })

    if (
      display.contentType !== 'image/jpeg'
      && (query.forceJpeg || heic)
    ) {
      heicDebugLog({
        stage: 'response_rejected',
        fileName: payload.fileName ?? null,
        requestUrl: options?.requestUrl,
        responseStatus: 422,
        responseContentType: 'application/json',
        conversionSuccess: false,
        internalError: 'Output is not JPEG after conversion',
      })
      res.statusCode = 422
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: 'Image is not displayable in the browser',
        code: 'HEIC_PREVIEW_UNAVAILABLE',
      }))
      return
    }

    heicDebugLog({
      stage: 'response_ok',
      fileName: payload.fileName ?? null,
      requestUrl: options?.requestUrl,
      responseStatus: 200,
      responseContentType: display.contentType,
      conversionSuccess: true,
      bytes: display.buffer.length,
    })

    res.statusCode = 200
    res.setHeader('Content-Type', display.contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    res.end(display.buffer)
  } catch (error) {
    if (error instanceof DisplayImageError) {
      heicDebugLog({
        stage: 'response_error',
        fileName: payload.fileName ?? null,
        requestUrl: options?.requestUrl,
        responseStatus: 422,
        responseContentType: 'application/json',
        conversionSuccess: false,
        internalError: error.message,
        ...(error.debug ?? {}),
      })
      res.statusCode = 422
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: error.message,
        code: 'HEIC_PREVIEW_UNAVAILABLE',
        ...(error.debug ? { debug: error.debug } : {}),
      }))
      return
    }
    throw error
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, '_')
}
