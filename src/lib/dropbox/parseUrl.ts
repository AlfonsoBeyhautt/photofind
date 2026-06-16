const FOLDER_PATTERNS = [
  /dropbox\.com\/sh\//i,
  /dropbox\.com\/scl\/fo\//i,
]

const FILE_ONLY_PATTERNS = [
  /dropbox\.com\/s\/[^/]+$/i,
  /dropbox\.com\/scl\/fi\//i,
]

export function isDropboxUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase()
    return host.includes('dropbox.com') || host.includes('dropboxusercontent.com')
  } catch {
    return false
  }
}

/** True when URL looks like a shared folder link (not a single-file link). */
export function isDropboxSharedFolderUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!isDropboxUrl(trimmed)) return false
  if (FILE_ONLY_PATTERNS.some((p) => p.test(trimmed))) return false
  return FOLDER_PATTERNS.some((p) => p.test(trimmed))
}

/** Normalize shared link for Dropbox API — preserve rlkey and all params except dl/raw. */
export function normalizeDropboxSharedUrl(url: string): string {
  let out = url.trim()

  out = out.replace(/([?&])dl=\d*&?/gi, '$1')
  out = out.replace(/([?&])raw=\d*&?/gi, '$1')
  out = out.replace(/[?&]$/, '')
  out = out.replace(/\?&/, '?')

  return out
}

export function hasDropboxRlkey(url: string): boolean {
  try {
    return new URL(url.trim()).searchParams.has('rlkey')
  } catch {
    return /[?&]rlkey=/i.test(url)
  }
}

export function extractDropboxSharedKey(url: string): string | null {
  const trimmed = url.trim()
  const scl = trimmed.match(/dropbox\.com\/scl\/fo\/([a-zA-Z0-9_-]+)/i)
  if (scl?.[1]) return scl[1]

  const sh = trimmed.match(/dropbox\.com\/sh\/([a-zA-Z0-9_-]+)/i)
  if (sh?.[1]) return sh[1]

  return null
}
