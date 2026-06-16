import sharp from 'sharp'
import type { DetectedFace, FaceBox, ReferenceQualityTier, ReferenceSource } from '../../src/types/recognition'
import { REFERENCE_MAX_DIMENSION } from './config'
import {
  assessReferenceFaceQuality,
  isDetectableFace,
} from './faceQuality'
import { canUseRekognition, detectFaces, type FaceDetail } from './rekognitionClient'
import {
  deletePendingDetection,
  getPendingDetection,
  savePendingDetection,
  saveReference,
} from './referenceStore'

const MAX_INPUT_BYTES = 15 * 1024 * 1024

export type ReferenceValidationErrorCode =
  | 'REFERENCE_NO_FACE'
  | 'REFERENCE_MULTIPLE_FACES'
  | 'REFERENCE_LOW_QUALITY'
  | 'REFERENCE_INVALID_IMAGE'
  | 'REFERENCE_TOO_LARGE'
  | 'REKOGNITION_UNAVAILABLE'
  | 'AWS_CREDENTIALS_MISSING'
  | 'AWS_REKOGNITION_FAILED'
  | 'IMAGE_NORMALIZATION_FAILED'
  | 'REFERENCE_VALIDATION_FAILED'
  | 'REFERENCE_DETECTION_EXPIRED'
  | 'REFERENCE_FACE_NOT_FOUND'

export interface ReferenceValidationSuccess {
  ok: true
  needsSelection?: false
  referenceToken: string
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  expiresAt: string
}

export interface ReferenceValidationNeedsSelection {
  ok: true
  needsSelection: true
  detectionToken: string
  faces: DetectedFace[]
  expiresAt: string
}

export interface ReferenceValidationFailure {
  ok: false
  error: {
    code: ReferenceValidationErrorCode
    message: string
  }
}

export type ReferenceValidationResult =
  | ReferenceValidationSuccess
  | ReferenceValidationNeedsSelection
  | ReferenceValidationFailure

export interface SelectReferenceFaceSuccess {
  ok: true
  referenceToken: string
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  expiresAt: string
}

export interface SelectReferenceFaceFailure {
  ok: false
  error: {
    code: ReferenceValidationErrorCode
    message: string
  }
}

export type SelectReferenceFaceResult = SelectReferenceFaceSuccess | SelectReferenceFaceFailure

const MESSAGES: Record<ReferenceValidationErrorCode, string> = {
  REFERENCE_NO_FACE: 'No pudimos detectar una cara clara. Probá con otra foto más frontal.',
  REFERENCE_MULTIPLE_FACES: 'Elegí la persona que querés encontrar.',
  REFERENCE_LOW_QUALITY: 'Esta foto no sirve como referencia. Probá con otra más frontal y con mejor luz.',
  REFERENCE_INVALID_IMAGE: 'No pudimos leer la imagen de referencia. Usá JPG, PNG o HEIC.',
  REFERENCE_TOO_LARGE: 'La imagen es demasiado grande. Usá una foto de hasta 15 MB.',
  REKOGNITION_UNAVAILABLE: 'El servicio de reconocimiento facial no está configurado.',
  AWS_CREDENTIALS_MISSING: 'AWS Rekognition no está configurado en el servidor.',
  AWS_REKOGNITION_FAILED: 'AWS Rekognition no pudo analizar la imagen.',
  IMAGE_NORMALIZATION_FAILED: 'No pudimos procesar la imagen en el servidor.',
  REFERENCE_VALIDATION_FAILED: 'No pudimos validar la foto de referencia.',
  REFERENCE_DETECTION_EXPIRED: 'La detección expiró. Volvé a subir la foto.',
  REFERENCE_FACE_NOT_FOUND: 'No encontramos la cara seleccionada.',
}

function fail(code: ReferenceValidationErrorCode, message?: string): ReferenceValidationFailure {
  return { ok: false, error: { code, message: message ?? MESSAGES[code] } }
}

function selectFail(code: ReferenceValidationErrorCode, message?: string): SelectReferenceFaceFailure {
  return { ok: false, error: { code, message: message ?? MESSAGES[code] } }
}

function toFaceBox(face: FaceDetail): FaceBox {
  const box = face.BoundingBox ?? { Left: 0, Top: 0, Width: 0, Height: 0 }
  return {
    left: box.Left ?? 0,
    top: box.Top ?? 0,
    width: box.Width ?? 0,
    height: box.Height ?? 0,
  }
}

function toDetectedFaces(faces: FaceDetail[]): DetectedFace[] {
  return faces
    .map((face, index) => {
      const assessment = assessReferenceFaceQuality(face)
      return {
        index,
        faceBox: toFaceBox(face),
        confidence: face.Confidence ?? 0,
        qualityTier: assessment.tier,
      }
    })
    .filter((face) => isDetectableFace(faces[face.index]))
}

function finalizeReference(
  normalized: { buffer: Buffer; contentType: string },
  source: ReferenceSource,
  face: FaceDetail,
  faceBox: FaceBox,
  confidence: number,
): ReferenceValidationSuccess | ReferenceValidationFailure {
  const assessment = assessReferenceFaceQuality(face)

  if (process.env.PHOTOFIND_QUALITY_DEBUG === '1') {
    console.log('[PhotoFind:Quality] reference', { tier: assessment.tier, metrics: assessment.metrics, issues: assessment.issues })
  }

  if (assessment.tier === 'low') {
    return fail('REFERENCE_LOW_QUALITY', assessment.blockReason ?? MESSAGES.REFERENCE_LOW_QUALITY)
  }

  const stored = saveReference({
    buffer: normalized.buffer,
    contentType: normalized.contentType,
    source,
    faceBox,
    confidence,
    qualityTier: assessment.tier,
    qualityWarning: assessment.tier === 'medium' ? assessment.warning : undefined,
  })

  return {
    ok: true,
    referenceToken: stored.token,
    faceBox,
    confidence,
    qualityTier: assessment.tier,
    qualityWarning: stored.qualityWarning,
    expiresAt: new Date(stored.expiresAt).toISOString(),
  }
}

export async function normalizeReferenceBytes(
  input: Buffer,
  mimeType?: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  try {
    const pipeline = sharp(input, { failOn: 'none' }).rotate()
    const meta = await pipeline.metadata()
    const resizeNeeded = (meta.width ?? 0) > REFERENCE_MAX_DIMENSION || (meta.height ?? 0) > REFERENCE_MAX_DIMENSION

    let out = pipeline
    if (resizeNeeded) {
      out = out.resize({
        width: REFERENCE_MAX_DIMENSION,
        height: REFERENCE_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    const buffer = await out.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    void mimeType
    return { buffer, contentType: 'image/jpeg' }
  } catch (err) {
    console.error('[PhotoFind:Backend] image_normalization_failed', err instanceof Error ? err.message : err)
    throw new Error('IMAGE_NORMALIZATION_FAILED')
  }
}

export async function validateReferenceImage(
  input: Buffer,
  source: ReferenceSource,
): Promise<ReferenceValidationResult> {
  if (input.length > MAX_INPUT_BYTES) {
    return fail('REFERENCE_TOO_LARGE')
  }

  if (!canUseRekognition()) {
    console.error('[PhotoFind:Backend] aws_credentials_missing')
    return fail('AWS_CREDENTIALS_MISSING')
  }

  let normalized: { buffer: Buffer; contentType: string }
  try {
    normalized = await normalizeReferenceBytes(input)
    console.log('[PhotoFind:Backend] image_normalized', { bytes: normalized.buffer.length })
  } catch {
    return fail('IMAGE_NORMALIZATION_FAILED')
  }

  let faces: FaceDetail[]
  try {
    console.log('[PhotoFind:Backend] aws_detectfaces_start')
    faces = await detectFaces(normalized.buffer)
    console.log('[PhotoFind:Backend] aws_detectfaces_ok', { faceCount: faces.length })
  } catch (error) {
    console.error('[PhotoFind:Backend] aws_detectfaces_error', error instanceof Error ? error.message : error)
    return fail('AWS_REKOGNITION_FAILED')
  }

  const detectedFaces = toDetectedFaces(faces)

  if (detectedFaces.length === 0) {
    return fail('REFERENCE_NO_FACE')
  }

  if (detectedFaces.length === 1) {
    const face = faces[detectedFaces[0].index]
    return finalizeReference(
      normalized,
      source,
      face,
      detectedFaces[0].faceBox,
      detectedFaces[0].confidence,
    )
  }

  const pending = savePendingDetection({
    buffer: normalized.buffer,
    contentType: normalized.contentType,
    source,
    faces: detectedFaces,
    rawFaces: faces,
  })

  return {
    ok: true,
    needsSelection: true,
    detectionToken: pending.token,
    faces: detectedFaces,
    expiresAt: new Date(pending.expiresAt).toISOString(),
  }
}

export async function selectReferenceFace(
  detectionToken: string,
  faceIndex: number,
): Promise<SelectReferenceFaceResult> {
  const pending = getPendingDetection(detectionToken)
  if (!pending) {
    return selectFail('REFERENCE_DETECTION_EXPIRED')
  }

  const selected = pending.faces.find((face) => face.index === faceIndex)
  if (!selected) {
    return selectFail('REFERENCE_FACE_NOT_FOUND')
  }

  const face = pending.rawFaces[faceIndex]
  if (!face) {
    return selectFail('REFERENCE_FACE_NOT_FOUND')
  }

  const assessment = assessReferenceFaceQuality(face)
  if (process.env.PHOTOFIND_QUALITY_DEBUG === '1') {
    console.log('[PhotoFind:Quality] select', { faceIndex, tier: assessment.tier, metrics: assessment.metrics, issues: assessment.issues })
  }
  if (assessment.tier === 'low') {
    return selectFail('REFERENCE_LOW_QUALITY', assessment.blockReason ?? MESSAGES.REFERENCE_LOW_QUALITY)
  }

  const stored = saveReference({
    buffer: pending.buffer,
    contentType: pending.contentType,
    source: pending.source,
    faceBox: selected.faceBox,
    confidence: selected.confidence,
    qualityTier: assessment.tier,
    qualityWarning: assessment.tier === 'medium' ? assessment.warning : undefined,
  })

  deletePendingDetection(detectionToken)

  return {
    ok: true,
    referenceToken: stored.token,
    faceBox: selected.faceBox,
    confidence: selected.confidence,
    qualityTier: assessment.tier,
    qualityWarning: stored.qualityWarning,
    expiresAt: new Date(stored.expiresAt).toISOString(),
  }
}
