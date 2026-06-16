import type { AlbumProvider } from './provider'

export type AlbumSource = AlbumProvider

export type DriveErrorCode =
  | 'INVALID_URL'
  | 'PRIVATE_FOLDER'
  | 'EMPTY_FOLDER'
  | 'NO_IMAGES'
  | 'API_KEY_MISSING'
  | 'UNKNOWN_ERROR'
  | 'PROVIDER_NOT_READY'
  | 'DROPBOX_TOKEN_INVALID'
  | 'DROPBOX_PERMISSION_MISSING'
  | 'DROPBOX_INVALID_SHARED_LINK'
  | 'PRIVATE_OR_INACCESSIBLE_FOLDER'
  | 'PIXIESET_PASSWORD_REQUIRED'
  | 'PIXIESET_UNSUPPORTED_GALLERY'
  | 'PIXIESET_BLOCKED'
  | 'PIXIESET_NO_IMAGES_FOUND'
  | 'PIXIESET_FETCH_FAILED'
  | 'ONEDRIVE_INVALID_URL'
  | 'ONEDRIVE_PRIVATE_OR_INACCESSIBLE'
  | 'ONEDRIVE_EMPTY_FOLDER'
  | 'ONEDRIVE_NO_IMAGES'
  | 'ONEDRIVE_PROVIDER_ERROR'
  | 'WETRANSFER_INVALID_URL'
  | 'WETRANSFER_EXPIRED'
  | 'WETRANSFER_PASSWORD_REQUIRED'
  | 'WETRANSFER_NO_IMAGES'
  | 'WETRANSFER_NOT_READY'
  | 'WETRANSFER_FETCH_FAILED'
  | 'API_ROUTE_FAILED'
  | 'TIMEOUT'
  | 'INVALID_JSON_RESPONSE'
  | 'GOOGLE_DRIVE_API_ERROR'

export interface AlbumImage {
  id: string
  name: string
  mimeType: string
  thumbnailUrl: string
  originalUrl: string
  webViewLink?: string
  source: AlbumProvider
  /**
   * Facial recognition pipeline: set to true once embeddings are computed.
   * Future flow: POST selfie + images[] → /api/recognize → filter by match score.
   */
  embeddingReady: boolean
}

export interface AlbumData {
  source: AlbumSource
  folderId: string
  folderName: string
  images: AlbumImage[]
  totalImages: number
}

export interface DriveError {
  code: DriveErrorCode
  message: string
}

export interface FetchAlbumSuccess {
  ok: true
  album: AlbumData
}

export interface FetchAlbumFailure {
  ok: false
  error: DriveError
}

export type FetchAlbumResponse = FetchAlbumSuccess | FetchAlbumFailure
