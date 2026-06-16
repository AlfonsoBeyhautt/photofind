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
  createdAt: string
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

export interface SearchHistoryItem {
  id: string
  albumName: string
  albumUrl: string
  provider: string
  eventCategory: string
  photosFound: number
  totalPhotos: number | null
  createdAt: string
}

export interface ProcessedAlbumItem {
  albumName: string
  albumUrl: string
  provider: string
  totalPhotos: number | null
  lastSearchedAt: string
  searchCount: number
}

export interface DashboardData {
  ok: true
  user: AuthUser
  facialProfile: FacialProfileState
  recentSearches: SearchHistoryItem[]
  processedAlbums: ProcessedAlbumItem[]
}

export interface RecordSearchBody {
  albumName: string
  albumUrl: string
  provider: string
  eventCategory: string
  photosFound: number
  totalPhotos?: number | null
}
