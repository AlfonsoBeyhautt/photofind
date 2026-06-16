import type { FetchAlbumResponse } from '../../types/album'
import type { AlbumSourceInput } from '../../types/provider'
import { fetchDriveFolder } from '../drive/client'
import { fetchDropboxFolder } from './dropboxClient'
import { fetchPixiesetFolder } from './pixiesetClient'
import { fetchWeTransferFolder } from './wetransferClient'

export async function fetchAlbumByProvider(source: AlbumSourceInput): Promise<FetchAlbumResponse> {
  switch (source.provider) {
    case 'google-drive':
      return fetchDriveFolder(source.url)

    case 'dropbox':
      return fetchDropboxFolder(source.url)

    case 'pixieset':
      return fetchPixiesetFolder(source.url)

    case 'wetransfer':
      return fetchWeTransferFolder(source.url)

    default:
      return providerNotReady('unknown', 'No pudimos identificar el origen del enlace.')
  }
}

function providerNotReady(
  _provider: AlbumSourceInput['provider'],
  message: string,
): FetchAlbumResponse {
  return {
    ok: false,
    error: { code: 'PROVIDER_NOT_READY', message },
  }
}
