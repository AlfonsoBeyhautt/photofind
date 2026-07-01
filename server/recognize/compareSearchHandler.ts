import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AlbumImage } from '../../src/types/album'
import { compareAlbumToReference } from './compareSearchService'

import type { QualityTelemetryInput } from '../telemetry/qualityTelemetryTypes'

interface CompareAlbumBody {
  referenceToken?: string
  images?: AlbumImage[]
  qualityTelemetry?: QualityTelemetryInput
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export async function handleCompareAlbumRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: CompareAlbumBody
  try {
    body = JSON.parse(rawBody) as CompareAlbumBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Solicitud inválida.' },
    })
    return
  }

  const { referenceToken, images, qualityTelemetry } = body
  if (!referenceToken || !Array.isArray(images) || images.length === 0) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Falta la referencia o las imágenes del álbum.' },
    })
    return
  }

  const result = await compareAlbumToReference(referenceToken, images, undefined, qualityTelemetry)
  sendJson(res, result.ok ? 200 : 400, result)
}
