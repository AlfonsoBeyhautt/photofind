import type { FetchAlbumResponse } from '../../types/album'
import { driveError } from '../drive/errors'

/** Fetches album metadata from /api/onedrive/folder. */
export async function fetchOneDriveFolder(url: string): Promise<FetchAlbumResponse> {
  try {
    const res = await fetch('/api/onedrive/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const data = (await res.json()) as FetchAlbumResponse
    if (data.ok || data.error) return data

    return { ok: false, error: driveError('ONEDRIVE_PROVIDER_ERROR') }
  } catch {
    return { ok: false, error: driveError('ONEDRIVE_PROVIDER_ERROR') }
  }
}
