import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReferenceSource } from '../../src/types/recognition'
import { selectReferenceFace, validateReferenceImage } from './referenceService'

interface ValidateReferenceBody {
  dataBase64?: string
  mimeType?: string
  source?: ReferenceSource
}

interface SelectReferenceFaceBody {
  detectionToken?: string
  faceIndex?: number
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export async function handleValidateReferenceRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: ValidateReferenceBody
  try {
    body = JSON.parse(rawBody) as ValidateReferenceBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'REFERENCE_INVALID_IMAGE', message: 'Solicitud inválida.' },
    })
    return
  }

  const { dataBase64, source } = body
  if (!dataBase64 || !source || (source !== 'upload' && source !== 'camera' && source !== 'profile')) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'REFERENCE_INVALID_IMAGE', message: 'Falta la imagen de referencia.' },
    })
    return
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(dataBase64, 'base64')
    if (buffer.length === 0) throw new Error('empty')
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'REFERENCE_INVALID_IMAGE', message: 'No pudimos leer la imagen.' },
    })
    return
  }

  const result = await validateReferenceImage(buffer, source)
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handleSelectReferenceFaceRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: SelectReferenceFaceBody
  try {
    body = JSON.parse(rawBody) as SelectReferenceFaceBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'REFERENCE_INVALID_IMAGE', message: 'Solicitud inválida.' },
    })
    return
  }

  const { detectionToken, faceIndex } = body
  if (!detectionToken || typeof faceIndex !== 'number' || !Number.isInteger(faceIndex) || faceIndex < 0) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'REFERENCE_FACE_NOT_FOUND', message: 'Falta la cara seleccionada.' },
    })
    return
  }

  const result = await selectReferenceFace(detectionToken, faceIndex)
  sendJson(res, result.ok ? 200 : 400, result)
}
