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
  /** Solo presente cuando el backend confirma administrador autorizado. */
  operatorAccess?: true
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
  eventCategory: string | null
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
  eventCategory: string | null
}

export type ActiveAlbumJobStatus = 'pending' | 'processing' | 'retrying' | 'ready' | 'failed'

export interface ActiveAlbumJobItem {
  jobId: string
  status: ActiveAlbumJobStatus
  message: string
  totalImages: number
  indexedImages: number
  failedImages: number
  progressPercent: number
  provider: string
  albumName: string | null
  albumFingerprint: string
  updatedAt: string
}

export interface DashboardData {
  ok: true
  user: AuthUser
  facialProfile: FacialProfileState
  recentSearches: SearchHistoryItem[]
  processedAlbums: ProcessedAlbumItem[]
  activeAlbumJobs: ActiveAlbumJobItem[]
  /** Solo presente cuando el backend confirma administrador autorizado. */
  operatorAccess?: true
}

export interface RecordSearchBody {
  albumName: string
  albumUrl: string
  provider: string
  eventCategory?: string | null
  photosFound: number
  totalPhotos?: number | null
}
