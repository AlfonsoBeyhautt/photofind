import type { FetchAlbumResponse } from '../../types/album'
import { driveError } from './errors'

export async function fetchDriveFolder(url: string): Promise<FetchAlbumResponse> {
  try {
    const res = await fetch('/api/drive/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const data = (await res.json()) as FetchAlbumResponse

    if (!data.ok && !data.error) {
      return { ok: false, error: driveError('UNKNOWN_ERROR') }
    }

    return data
  } catch {
    return { ok: false, error: driveError('UNKNOWN_ERROR') }
  }
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
