import type { FetchAlbumResponse } from '../../types/album'
import { driveError } from '../drive/errors'

/** Fetches album metadata from /api/wetransfer/folder. */
export async function fetchWeTransferFolder(url: string): Promise<FetchAlbumResponse> {
  try {
    const res = await fetch('/api/wetransfer/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const data = (await res.json()) as FetchAlbumResponse

    if (!data.ok && !data.error) {
      return { ok: false, error: driveError('WETRANSFER_FETCH_FAILED') }
    }

    return data
  } catch {
    return { ok: false, error: driveError('WETRANSFER_FETCH_FAILED') }
  }
}
