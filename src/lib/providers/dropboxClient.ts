import type { FetchAlbumResponse } from '../../types/album'
import { driveError } from '../drive/errors'

/** Fetches album metadata from /api/dropbox/folder */
export async function fetchDropboxFolder(url: string): Promise<FetchAlbumResponse> {
  try {
    const res = await fetch('/api/dropbox/folder', {
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
