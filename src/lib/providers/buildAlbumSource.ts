import type { AlbumSourceInput } from '../../types/provider'
import { extractGoogleDriveFolderId } from '../drive/parseUrl'
import { extractDropboxSharedKey } from '../dropbox/parseUrl'

export function buildAlbumSource(url: string, provider: AlbumSourceInput['provider']): AlbumSourceInput {
  const source: AlbumSourceInput = { provider, url: url.trim() }

  if (provider === 'google-drive') {
    const folderId = extractGoogleDriveFolderId(url)
    if (folderId) source.folderId = folderId
  }

  if (provider === 'dropbox') {
    const folderKey = extractDropboxSharedKey(url)
    if (folderKey) source.folderId = folderKey
  }

  return source
}
