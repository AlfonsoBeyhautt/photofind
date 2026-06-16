import type { FetchAlbumResponse } from '../../types/album'
import { driveError } from '../drive/errors'

/** Fetches album metadata from /api/pixieset/folder. */
export async function fetchPixiesetFolder(url: string): Promise<FetchAlbumResponse> {
  try {
    const res = await fetch('/api/pixieset/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const data = (await res.json()) as FetchAlbumResponse

    if (!data.ok && !data.error) {
      return { ok: false, error: driveError('PIXIESET_FETCH_FAILED') }
    }

    return data
  } catch {
    return { ok: false, error: driveError('PIXIESET_FETCH_FAILED') }
  }
}
