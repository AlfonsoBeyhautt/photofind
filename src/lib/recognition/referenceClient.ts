import type {
  ReferenceSource,
  SelectReferenceFaceResponse,
  ValidateReferenceResponse,
  ReferenceErrorCode,
} from '../../types/recognition'
import { apiPostJson, isApiTransportError, logCapture } from '../api/apiFetch'

const REFERENCE_MESSAGES: Record<string, string> = {
  REFERENCE_NO_FACE: 'No pudimos detectar una cara clara. Probá con otra foto más frontal.',
  REFERENCE_MULTIPLE_FACES: 'Elegí la persona que querés encontrar.',
  REFERENCE_LOW_QUALITY: 'Esta foto no sirve como referencia. Probá con otra más frontal y con mejor luz.',
  REFERENCE_INVALID_IMAGE: 'No pudimos leer la imagen de referencia.',
  REFERENCE_TOO_LARGE: 'La imagen es demasiado grande.',
  REKOGNITION_UNAVAILABLE: 'El reconocimiento facial no está disponible en el servidor.',
  REFERENCE_VALIDATION_FAILED: 'No pudimos validar la foto de referencia.',
  REFERENCE_DETECTION_EXPIRED: 'La detección expiró. Volvé a subir la foto.',
  REFERENCE_FACE_NOT_FOUND: 'No encontramos la cara seleccionada.',
  API_ROUTE_NOT_FOUND: 'El servidor de reconocimiento no está disponible. Si estás en producción, verificá el deploy de /api en Vercel.',
  API_INVALID_RESPONSE: 'El servidor respondió de forma inesperada.',
  NETWORK_ERROR: 'No pudimos conectar con el servidor.',
  AWS_CREDENTIALS_MISSING: 'AWS Rekognition no está configurado en el servidor.',
  AWS_REKOGNITION_FAILED: 'AWS Rekognition falló al analizar la imagen.',
  IMAGE_NORMALIZATION_FAILED: 'No pudimos procesar la imagen en el servidor.',
}

export function getReferenceErrorMessage(code: string, fallback?: string): string {
  return REFERENCE_MESSAGES[code] ?? fallback ?? 'No pudimos validar la foto de referencia.'
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Camera capture is already JPEG from canvas. */
export async function blobToBase64(blob: Blob): Promise<string> {
  logCapture('blob_created', { size: blob.size, type: blob.type || 'image/jpeg' })
  return fileToBase64(new File([blob], 'reference.jpg', { type: blob.type || 'image/jpeg' }))
}

export async function validateReferenceImage(
  dataBase64: string,
  mimeType: string,
  source: ReferenceSource,
): Promise<ValidateReferenceResponse> {
  const data = await apiPostJson<ValidateReferenceResponse>(
    '/api/recognize/validate-reference',
    { dataBase64, mimeType, source },
    { logLabel: 'validate-reference' },
  )

  if (isApiTransportError(data)) {
    const code = data.error.code as ReferenceErrorCode
    return {
      ok: false,
      error: {
        code,
        message: getReferenceErrorMessage(data.error.code, data.error.message),
      },
    }
  }

  const result = data
  if (!result.ok && !result.error) {
    return {
      ok: false,
      error: { code: 'REFERENCE_VALIDATION_FAILED', message: getReferenceErrorMessage('REFERENCE_VALIDATION_FAILED') },
    }
  }
  return result
}

export async function selectReferenceFace(
  detectionToken: string,
  faceIndex: number,
): Promise<SelectReferenceFaceResponse> {
  const data = await apiPostJson<SelectReferenceFaceResponse>(
    '/api/recognize/select-reference-face',
    { detectionToken, faceIndex },
    { logLabel: 'select-reference-face' },
  )

  if (isApiTransportError(data)) {
    const code = data.error.code as ReferenceErrorCode
    return {
      ok: false,
      error: {
        code,
        message: getReferenceErrorMessage(data.error.code, data.error.message),
      },
    }
  }

  const result = data
  if (!result.ok && !result.error) {
    return {
      ok: false,
      error: { code: 'REFERENCE_VALIDATION_FAILED', message: getReferenceErrorMessage('REFERENCE_VALIDATION_FAILED') },
    }
  }
  return result
}
