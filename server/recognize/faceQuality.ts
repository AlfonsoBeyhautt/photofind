/**
 * Reference face quality assessment for Phase 1.
 *
 * Distinguishes:
 * - detected: face found by DetectFaces (listing / selection UI)
 * - high / medium / low: suitability as a search reference
 *
 * Design note: the reference should be clearer than typical album targets (group shots,
 * small faces, uneven light). Medium tier accepts casual photos that are still usable;
 * low tier blocks faces that would likely fail SearchFaces matching.
 *
 * @see FUTURE.md — guided multi-pose profile capture (multiple references per person)
 */

import type { FaceDetail } from './rekognitionClient'

export type ReferenceQualityTier = 'high' | 'medium' | 'low'

export type ReferenceQualityIssue =
  | 'low_confidence'
  | 'too_small'
  | 'too_blurry'
  | 'too_dark'
  | 'too_bright'
  | 'profile_pose'
  | 'occluded'
  | 'eyes_closed'

export interface FaceQualityAssessment {
  tier: ReferenceQualityTier
  /** Primary issue when tier is low (for user messaging). */
  primaryIssue?: ReferenceQualityIssue
  issues: ReferenceQualityIssue[]
  /** Shown when tier is medium — user can continue. */
  warning?: string
  /** Shown when tier is low — blocks continue. */
  blockReason?: string
  metrics: {
    confidence: number
    areaRatio: number
    sharpness: number | null
    brightness: number | null
    yaw: number | null
    pitch: number | null
  }
}

/** Minimum DetectFaces confidence to list a face in the multi-face selector. */
export const DETECTION_LIST_MIN_CONFIDENCE = 50

/** --- Hard block thresholds (low tier) --- */
const BLOCK = {
  confidence: 72,
  areaRatio: 0.006,
  sharpness: 10,
  brightnessMin: 15,
  brightnessMax: 98,
  yaw: 52,
  pitch: 48,
  roll: 55,
  occlusionConfidence: 82,
  eyesClosedConfidence: 82,
} as const

/** --- High tier thresholds (all should pass) --- */
const HIGH = {
  confidence: 94,
  areaRatio: 0.012,
  sharpness: 32,
  brightnessMin: 28,
  brightnessMax: 92,
  yaw: 22,
  pitch: 28,
  roll: 28,
  occlusionConfidence: 55,
  eyesClosedConfidence: 55,
} as const

/** --- Medium tier soft warnings (pass but advise user) --- */
const MEDIUM_WARN = {
  areaRatio: 0.010,
  sharpness: 22,
  brightnessMin: 24,
  yaw: 32,
  pitch: 36,
} as const

const ISSUE_MESSAGES: Record<ReferenceQualityIssue, string> = {
  low_confidence: 'No pudimos confirmar que sea una cara clara.',
  too_small: 'La cara está demasiado lejos en la foto.',
  too_blurry: 'La imagen está demasiado borrosa.',
  too_dark: 'La cara está muy oscura.',
  too_bright: 'La cara está demasiado iluminada o quemada.',
  profile_pose: 'La persona está demasiado de perfil.',
  occluded: 'La cara está parcialmente tapada.',
  eyes_closed: 'Los ojos aparecen cerrados en la foto.',
}

const GENERAL_BLOCK = 'Esta foto no sirve como referencia. Probá con una más frontal, con mejor luz y la cara más cerca.'

const MEDIUM_WARNING =
  'Esta referencia puede encontrar menos fotos. Para mejores resultados, usá una foto más frontal y con mejor luz.'

function faceAreaRatio(face: FaceDetail): number {
  const box = face.BoundingBox
  if (!box?.Width || !box?.Height) return 0
  return box.Width * box.Height
}

function abs(n: number | undefined): number {
  return Math.abs(n ?? 0)
}

function isOccluded(face: FaceDetail): boolean {
  const o = face.FaceOccluded
  return Boolean(o?.Value && (o.Confidence ?? 0) >= BLOCK.occlusionConfidence)
}

function areEyesClosed(face: FaceDetail): boolean {
  const e = face.EyesOpen
  return Boolean(e?.Value === false && (e.Confidence ?? 0) >= BLOCK.eyesClosedConfidence)
}

function collectBlockIssues(face: FaceDetail): ReferenceQualityIssue[] {
  const issues: ReferenceQualityIssue[] = []
  const confidence = face.Confidence ?? 0
  const area = faceAreaRatio(face)
  const sharpness = face.Quality?.Sharpness ?? null
  const brightness = face.Quality?.Brightness ?? null
  const yaw = abs(face.Pose?.Yaw)
  const pitch = abs(face.Pose?.Pitch)
  const roll = abs(face.Pose?.Roll)

  if (confidence < BLOCK.confidence) issues.push('low_confidence')
  if (area < BLOCK.areaRatio) issues.push('too_small')
  if (sharpness !== null && sharpness < BLOCK.sharpness) issues.push('too_blurry')
  if (brightness !== null && brightness < BLOCK.brightnessMin) issues.push('too_dark')
  if (brightness !== null && brightness > BLOCK.brightnessMax) issues.push('too_bright')
  if (yaw > BLOCK.yaw || pitch > BLOCK.pitch || roll > BLOCK.roll) issues.push('profile_pose')
  if (isOccluded(face)) issues.push('occluded')
  if (areEyesClosed(face)) issues.push('eyes_closed')

  return issues
}

function collectMediumWarnings(face: FaceDetail): ReferenceQualityIssue[] {
  const warnings: ReferenceQualityIssue[] = []
  const area = faceAreaRatio(face)
  const sharpness = face.Quality?.Sharpness ?? null
  const brightness = face.Quality?.Brightness ?? null
  const yaw = abs(face.Pose?.Yaw)
  const pitch = abs(face.Pose?.Pitch)

  if (area < MEDIUM_WARN.areaRatio) warnings.push('too_small')
  if (sharpness !== null && sharpness < MEDIUM_WARN.sharpness) warnings.push('too_blurry')
  if (brightness !== null && brightness < MEDIUM_WARN.brightnessMin) warnings.push('too_dark')
  if (yaw > MEDIUM_WARN.yaw || pitch > MEDIUM_WARN.pitch) warnings.push('profile_pose')

  const o = face.FaceOccluded
  if (o?.Value && (o.Confidence ?? 0) >= HIGH.occlusionConfidence) warnings.push('occluded')

  const e = face.EyesOpen
  if (e?.Value === false && (e.Confidence ?? 0) >= HIGH.eyesClosedConfidence) warnings.push('eyes_closed')

  return warnings
}

function passesHighTier(face: FaceDetail): boolean {
  const confidence = face.Confidence ?? 0
  const area = faceAreaRatio(face)
  const sharpness = face.Quality?.Sharpness ?? null
  const brightness = face.Quality?.Brightness ?? null
  const yaw = abs(face.Pose?.Yaw)
  const pitch = abs(face.Pose?.Pitch)
  const roll = abs(face.Pose?.Roll)

  if (confidence < HIGH.confidence) return false
  if (area < HIGH.areaRatio) return false
  if (sharpness !== null && sharpness < HIGH.sharpness) return false
  if (brightness !== null && (brightness < HIGH.brightnessMin || brightness > HIGH.brightnessMax)) return false
  if (yaw > HIGH.yaw || pitch > HIGH.pitch || roll > HIGH.roll) return false

  const o = face.FaceOccluded
  if (o?.Value && (o.Confidence ?? 0) >= HIGH.occlusionConfidence) return false

  const e = face.EyesOpen
  if (e?.Value === false && (e.Confidence ?? 0) >= HIGH.eyesClosedConfidence) return false

  return true
}

/** Priority order for picking the most helpful rejection message. */
const ISSUE_PRIORITY: ReferenceQualityIssue[] = [
  'too_small',
  'too_blurry',
  'too_dark',
  'profile_pose',
  'occluded',
  'eyes_closed',
  'too_bright',
  'low_confidence',
]

export function messageForIssue(issue: ReferenceQualityIssue): string {
  return ISSUE_MESSAGES[issue]
}

export function pickPrimaryIssue(issues: ReferenceQualityIssue[]): ReferenceQualityIssue | undefined {
  for (const issue of ISSUE_PRIORITY) {
    if (issues.includes(issue)) return issue
  }
  return issues[0]
}

export function assessReferenceFaceQuality(face: FaceDetail): FaceQualityAssessment {
  const blockIssues = collectBlockIssues(face)
  const metrics = {
    confidence: face.Confidence ?? 0,
    areaRatio: faceAreaRatio(face),
    sharpness: face.Quality?.Sharpness ?? null,
    brightness: face.Quality?.Brightness ?? null,
    yaw: face.Pose?.Yaw ?? null,
    pitch: face.Pose?.Pitch ?? null,
  }

  if (blockIssues.length > 0) {
    const primaryIssue = pickPrimaryIssue(blockIssues)!
    return {
      tier: 'low',
      primaryIssue,
      issues: blockIssues,
      blockReason: ISSUE_MESSAGES[primaryIssue] ?? GENERAL_BLOCK,
      metrics,
    }
  }

  if (passesHighTier(face)) {
    return { tier: 'high', issues: [], metrics }
  }

  const warnIssues = collectMediumWarnings(face)
  const warning = warnIssues.length > 0
    ? `${MEDIUM_WARNING} ${warnIssues.slice(0, 2).map(messageForIssue).join(' ')}`.trim()
    : MEDIUM_WARNING

  return {
    tier: 'medium',
    issues: warnIssues,
    warning,
    metrics,
  }
}

export function isDetectableFace(face: FaceDetail): boolean {
  return (face.Confidence ?? 0) >= DETECTION_LIST_MIN_CONFIDENCE
}
