export type ReferenceSource = 'upload' | 'camera' | 'profile'

export type ReferenceQualityTier = 'high' | 'medium' | 'low'

export type ReferenceErrorCode =
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
  | 'API_ROUTE_NOT_FOUND'
  | 'API_INVALID_RESPONSE'
  | 'NETWORK_ERROR'

export interface FaceBox {
  left: number
  top: number
  width: number
  height: number
}

export interface DetectedFace {
  index: number
  faceBox: FaceBox
  confidence: number
  /** Estimated suitability as search reference (server-side). */
  qualityTier?: ReferenceQualityTier
}

export interface ReferenceImagePayload {
  dataBase64: string
  mimeType: string
  source: ReferenceSource
  width?: number
  height?: number
}

export interface ValidateReferenceSuccess {
  ok: true
  needsSelection?: false
  referenceToken: string
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  expiresAt: string
  previewDataUrl?: string
}

export interface ValidateReferenceNeedsSelection {
  ok: true
  needsSelection: true
  detectionToken: string
  faces: DetectedFace[]
  expiresAt: string
}

export interface ValidateReferenceFailure {
  ok: false
  error: {
    code: ReferenceErrorCode
    message: string
  }
}

export type ValidateReferenceResponse =
  | ValidateReferenceSuccess
  | ValidateReferenceNeedsSelection
  | ValidateReferenceFailure

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
    code: ReferenceErrorCode
    message: string
  }
}

export type SelectReferenceFaceResponse = SelectReferenceFaceSuccess | SelectReferenceFaceFailure

export function isNeedsSelection(
  result: ValidateReferenceResponse,
): result is ValidateReferenceNeedsSelection {
  return result.ok && 'needsSelection' in result && result.needsSelection === true
}

export function isReferenceValidated(
  result: ValidateReferenceResponse,
): result is ValidateReferenceSuccess {
  return result.ok && !('needsSelection' in result && result.needsSelection)
}

/** True when reference is accepted but user should see a quality advisory. */
export function hasQualityWarning(
  result: ValidateReferenceSuccess | SelectReferenceFaceSuccess,
): boolean {
  return result.qualityTier === 'medium' && Boolean(result.qualityWarning)
}

export type RecognitionSearchErrorCode =
  | 'AWS_CREDENTIALS_MISSING'
  | 'AWS_REKOGNITION_ERROR'
  | 'RECOGNITION_REFERENCE_EXPIRED'
  | 'RECOGNITION_NO_FACES_IN_ALBUM'
  | 'RECOGNITION_INDEXING_FAILED'
  | 'RECOGNITION_SEARCH_FAILED'
  | 'RECOGNITION_COLLECTION_METADATA_ERROR'

export type RecognitionSearchMethod = 'collection' | 'compare-fallback'

export interface RecognitionSearchResult {
  matchedImageIds: string[]
  analyzedCount: number
  albumTotal: number
  truncated: boolean
  trialModeMessage?: string
  similarities?: Record<string, number>
  collectionReused?: boolean
  searchMethod?: RecognitionSearchMethod
  largeAlbumWarning?: string
  asyncJobId?: string
}
