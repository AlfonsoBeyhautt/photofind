const FOLDER_PATTERNS = [
  /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/,
  /drive\.google\.com\/(?:open|folderview)\?[^#]*id=([a-zA-Z0-9_-]+)/,
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
]

export function isGoogleDriveUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com'
  } catch {
    return false
  }
}

export function extractGoogleDriveFolderId(url: string): string | null {
  const trimmed = url.trim()

  for (const pattern of FOLDER_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }

  try {
    const parsed = new URL(trimmed)
    const id = parsed.searchParams.get('id')
    if (id) return id
  } catch {
    return null
  }

  return null
}
