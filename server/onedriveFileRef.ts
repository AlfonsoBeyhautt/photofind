export interface OneDriveFileRef {
  shareUrl: string
  driveId: string
  itemId: string
}

export function encodeOneDriveFileRef(
  shareUrl: string,
  driveId: string,
  itemId: string,
): string {
  const payload = { s: shareUrl, d: driveId, i: itemId }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeOneDriveFileRef(token: string): OneDriveFileRef | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      s?: string
      d?: string
      i?: string
    }
    if (!parsed.s || !parsed.d || !parsed.i) return null
    return { shareUrl: parsed.s, driveId: parsed.d, itemId: parsed.i }
  } catch {
    return null
  }
}

export function buildOneDriveThumbnailPath(
  shareUrl: string,
  driveId: string,
  itemId: string,
  size = 400,
): string {
  const token = encodeOneDriveFileRef(shareUrl, driveId, itemId)
  return `/api/onedrive/thumbnail/${token}?sz=${size}`
}

export function buildOneDriveFilePath(
  shareUrl: string,
  driveId: string,
  itemId: string,
): string {
  const token = encodeOneDriveFileRef(shareUrl, driveId, itemId)
  return `/api/onedrive/file/${token}`
}
