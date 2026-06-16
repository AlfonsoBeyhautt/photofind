import type { FaceBox, ReferenceQualityTier, ReferenceSource } from './recognition'

export interface AuthUser {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface FacialProfileMeta {
  hasProfile: true
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  source: ReferenceSource
  updatedAt: string
}

export type FacialProfileState =
  | { hasProfile: false }
  | FacialProfileMeta

export interface AuthMeResponse {
  ok: true
  user: AuthUser | null
  facialProfile: FacialProfileState
}

export interface AuthSuccessResponse {
  ok: true
  user: AuthUser
  facialProfile: FacialProfileState
}

export interface AuthErrorResponse {
  ok: false
  error: { code: string; message: string }
}

export type AuthResponse = AuthSuccessResponse | AuthErrorResponse

export interface UseFacialProfileSuccess {
  ok: true
  referenceToken: string
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  expiresAt: string
}

export type UseFacialProfileResponse = UseFacialProfileSuccess | AuthErrorResponse
