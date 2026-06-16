import type { IncomingMessage, ServerResponse } from 'node:http'
import { getConfigStatus } from '../config/serverHealth'
import type { ReferenceSource } from '../../src/types/recognition'
import { canUseRekognition } from './rekognitionClient'

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

function logValidateError(err: unknown, stage: string): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  console.error('[PhotoFind:Server] validate_reference_error', { stage, message, stack })
}

export async function handleValidateReferenceRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  const config = getConfigStatus()
  console.log('[PhotoFind:Server] validate_reference_start', {
    bodyBytes: rawBody.length,
    supabaseUrlConfigured: config.supabaseUrlConfigured,
    awsAccessKeyConfigured: config.awsAccessKeyConfigured,
    awsSecretConfigured: config.awsSecretConfigured,
    awsRegionConfigured: config.awsRegionConfigured,
    rekognitionConfigured: canUseRekognition(),
  })

  try {
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

    console.log('[PhotoFind:Server] validate_reference_image', {
      source,
      decodedBytes: buffer.length,
    })

    const { validateReferenceImage } = await import('./referenceService')
    const result = await validateReferenceImage(buffer, source)

    console.log('[PhotoFind:Server] validate_reference_result', {
      ok: result.ok,
      code: result.ok ? undefined : result.error.code,
    })
    sendJson(res, result.ok ? 200 : 400, result)
  } catch (err) {
    logValidateError(err, 'unhandled')
    sendJson(res, 500, {
      ok: false,
      error: {
        code: 'REFERENCE_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : 'Error interno en validate-reference',
      },
    })
  }
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

  const { selectReferenceFace } = await import('./referenceService')
  const result = await selectReferenceFace(detectionToken, faceIndex)
  sendJson(res, result.ok ? 200 : 400, result)
}
