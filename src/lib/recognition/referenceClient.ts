import type {
  ReferenceSource,
  SelectReferenceFaceResponse,
  ValidateReferenceResponse,
} from '../../types/recognition'

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
  return fileToBase64(new File([blob], 'reference.jpg', { type: blob.type || 'image/jpeg' }))
}

export async function validateReferenceImage(
  dataBase64: string,
  mimeType: string,
  source: ReferenceSource,
): Promise<ValidateReferenceResponse> {
  try {
    const res = await fetch('/api/recognize/validate-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataBase64, mimeType, source }),
    })

    const data = (await res.json()) as ValidateReferenceResponse
    if (!data.ok && !data.error) {
      return {
        ok: false,
        error: { code: 'REFERENCE_VALIDATION_FAILED', message: getReferenceErrorMessage('REFERENCE_VALIDATION_FAILED') },
      }
    }
    return data
  } catch {
    return {
      ok: false,
      error: { code: 'REFERENCE_VALIDATION_FAILED', message: getReferenceErrorMessage('REFERENCE_VALIDATION_FAILED') },
    }
  }
}

export async function selectReferenceFace(
  detectionToken: string,
  faceIndex: number,
): Promise<SelectReferenceFaceResponse> {
  try {
    const res = await fetch('/api/recognize/select-reference-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detectionToken, faceIndex }),
    })

    const data = (await res.json()) as SelectReferenceFaceResponse
    if (!data.ok && !data.error) {
      return {
        ok: false,
        error: { code: 'REFERENCE_VALIDATION_FAILED', message: getReferenceErrorMessage('REFERENCE_VALIDATION_FAILED') },
      }
    }
    return data
  } catch {
    return {
      ok: false,
      error: { code: 'REFERENCE_VALIDATION_FAILED', message: getReferenceErrorMessage('REFERENCE_VALIDATION_FAILED') },
    }
  }
}
