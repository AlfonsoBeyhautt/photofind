const ONEDRIVE_HOSTS = [
  /(^|\.)1drv\.ms$/i,
  /(^|\.)onedrive\.live\.com$/i,
  /sharepoint\.com$/i,
]

const SHAREPOINT_FOLDER_PATH = /\/:f:\//i
const SHAREPOINT_FILE_PATH = /\/:i:\//i
const ONEDRIVE_FOLDER_SHORT = /1drv\.ms\/f\//i

export function isOneDriveUrl(url: string): boolean {
  try {
    const hostname = new URL(url.trim()).hostname
    return ONEDRIVE_HOSTS.some((re) => re.test(hostname))
  } catch {
    return false
  }
}

/** Public shared folder links only (not single-file-only links). */
export function isOneDriveSharedFolderUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!isOneDriveUrl(trimmed)) return false

  if (ONEDRIVE_FOLDER_SHORT.test(trimmed)) return true
  if (SHAREPOINT_FOLDER_PATH.test(trimmed)) return true

  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname.includes('onedrive.live.com')) {
      if (parsed.searchParams.get('ithint')?.includes('folder')) return true
      if (parsed.pathname.includes('/redir') && parsed.searchParams.has('resid')) return true
      if (parsed.searchParams.has('id') && parsed.searchParams.get('ithint') !== 'photo') return true
    }
    if (parsed.hostname.includes('sharepoint.com') && parsed.pathname.includes('/personal/')) {
      return !SHAREPOINT_FILE_PATH.test(trimmed)
    }
  } catch {
    return false
  }

  return false
}

export function normalizeOneDriveShareUrl(url: string): string {
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    for (const key of ['e', 'nav', 'action', 'cid', 're', 'ga']) {
      parsed.searchParams.delete(key)
    }
    return parsed.toString()
  } catch {
    return trimmed
  }
}
