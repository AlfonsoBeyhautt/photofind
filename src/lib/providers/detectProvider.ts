import type { AlbumProvider } from '../../types/provider'

export function detectProviderFromUrl(url: string): AlbumProvider {
  const trimmed = url.trim()
  if (!trimmed) return 'unknown'

  let hostname = ''
  try {
    hostname = new URL(trimmed).hostname.toLowerCase()
  } catch {
    return 'unknown'
  }

  if (hostname.includes('drive.google.com') || hostname.includes('docs.google.com')) {
    return 'google-drive'
  }

  if (hostname.includes('dropbox.com') || hostname.includes('dropboxusercontent.com')) {
    return 'dropbox'
  }

  if (
    hostname.includes('1drv.ms')
    || hostname.includes('onedrive.live.com')
    || hostname.includes('sharepoint.com')
  ) {
    return 'onedrive'
  }

  if (hostname.includes('pixieset.com')) {
    return 'pixieset'
  }

  if (hostname.includes('wetransfer.com') || hostname === 'we.tl' || hostname.endsWith('.we.tl')) {
    return 'wetransfer'
  }

  return 'unknown'
}

export function isProviderSupportedForFetch(provider: AlbumProvider): boolean {
  return (
    provider === 'google-drive'
    || provider === 'dropbox'
    || provider === 'pixieset'
    || provider === 'wetransfer'
  )
}
