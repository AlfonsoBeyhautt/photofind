import type { FetchAlbumResponse } from '../../types/album'
import { postAlbumJson } from '../providers/albumApiFetch'

export async function fetchDriveFolder(url: string): Promise<FetchAlbumResponse> {
  console.log('[PhotoFind:Drive] fetch_start', { urlLength: url.length })
  const result = await postAlbumJson('/api/drive/folder', { url }, { logLabel: 'drive/folder' })
  if (result.ok) {
    console.log('[PhotoFind:Drive] fetch_success', { images: result.album.totalImages })
  } else {
    console.error('[PhotoFind:Drive] fetch_error', result.error)
  }
  return result
}

/**
 * Future facial recognition entry point.
 * Will send reference selfie + album images to backend for matching.
 */
export async function recognizeFaces(
  referenceImage: Blob,
  albumImages: { id: string; originalUrl: string }[],
): Promise<{ matchedIds: string[] }> {
  void referenceImage
  void albumImages
  throw new Error('Facial recognition not implemented yet')
}
