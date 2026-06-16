export interface DropboxFileRef {
  sharedUrl: string
  /** Path relative to the shared link root, e.g. "/photo.png" or "/PRUEBA2/photo.png" */
  path: string
  fileId?: string
}

export function encodeDropboxFileRef(
  sharedUrl: string,
  path: string,
  fileId?: string,
): string {
  const payload: { u: string; p: string; i?: string } = { u: sharedUrl, p: path }
  if (fileId) payload.i = fileId
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeDropboxFileRef(token: string): DropboxFileRef | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      u?: string
      p?: string
      i?: string
    }
    if (!parsed.u || parsed.p === undefined) return null
    return { sharedUrl: parsed.u, path: parsed.p, fileId: parsed.i }
  } catch {
    return null
  }
}

export function buildDropboxThumbnailPath(
  sharedUrl: string,
  sharedRelativePath: string,
  fileId: string,
  size = 400,
): string {
  const token = encodeDropboxFileRef(sharedUrl, sharedRelativePath, fileId)
  return `/api/dropbox/thumbnail/${token}?sz=${size}`
}

export function buildDropboxFilePath(
  sharedUrl: string,
  sharedRelativePath: string,
  fileId: string,
): string {
  const token = encodeDropboxFileRef(sharedUrl, sharedRelativePath, fileId)
  return `/api/dropbox/file/${token}`
}
