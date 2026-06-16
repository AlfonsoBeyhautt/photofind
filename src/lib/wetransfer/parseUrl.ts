export interface ParsedWeTransferUrl {
  transferId: string
  securityHash: string
  recipientId: string | null
  inputUrl: string
}

const WETRANSFER_HOST = /(^|\.)wetransfer\.com$/i
const WE_TL_HOST = /(^|\.)we\.tl$/i

const SHORT_PATH = /^\/[a-zA-Z0-9_-]+\/?$/
const DOWNLOADS_MEDIUM = /^\/downloads\/[0-9a-zA-Z]{10,}\/[0-9a-zA-Z]{4,}\/?$/
const DOWNLOADS_FULL = /^\/downloads\/[0-9a-zA-Z]{10,}\/[0-9a-zA-Z]{10,}\/[0-9a-zA-Z]{4,}\/?$/

export function isWeTransferUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return WETRANSFER_HOST.test(parsed.hostname) || WE_TL_HOST.test(parsed.hostname)
  } catch {
    return false
  }
}

/** True when URL shape is valid (short links resolved server-side). */
export function isWeTransferDownloadUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!isWeTransferUrl(trimmed)) return false

  try {
    const parsed = new URL(trimmed)
    if (WE_TL_HOST.test(parsed.hostname)) {
      return SHORT_PATH.test(parsed.pathname)
    }

    return (
      DOWNLOADS_MEDIUM.test(parsed.pathname)
      || DOWNLOADS_FULL.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

export function parseWeTransferUrl(url: string): ParsedWeTransferUrl | null {
  const trimmed = url.trim()
  if (!isWeTransferUrl(trimmed)) return null

  try {
    const parsed = new URL(trimmed)

    if (WE_TL_HOST.test(parsed.hostname)) {
      const slug = parsed.pathname.split('/').filter(Boolean)[0]
      if (!slug) return null
      return {
        transferId: '',
        securityHash: '',
        recipientId: null,
        inputUrl: trimmed,
      }
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments[0] !== 'downloads' || segments.length < 3) return null

    if (segments.length === 3) {
      return {
        transferId: segments[1],
        securityHash: segments[2],
        recipientId: null,
        inputUrl: trimmed,
      }
    }

    if (segments.length >= 4) {
      return {
        transferId: segments[1],
        recipientId: segments[2],
        securityHash: segments[3],
        inputUrl: trimmed,
      }
    }

    return null
  } catch {
    return null
  }
}
