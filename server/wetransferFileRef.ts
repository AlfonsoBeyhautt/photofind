export interface WeTransferFileRef {
  transferId: string
  securityHash: string
  fileId: string
  fileName?: string
  recipientId?: string
}

export function encodeWeTransferFileRef(ref: WeTransferFileRef): string {
  const payload: Record<string, string> = {
    t: ref.transferId,
    h: ref.securityHash,
    f: ref.fileId,
  }
  if (ref.recipientId) payload.r = ref.recipientId
  if (ref.fileName) payload.n = ref.fileName
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeWeTransferFileRef(token: string): WeTransferFileRef | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      t?: string
      h?: string
      f?: string
      r?: string
      n?: string
    }
    if (!parsed.t || !parsed.h || !parsed.f) return null
    return {
      transferId: parsed.t,
      securityHash: parsed.h,
      fileId: parsed.f,
      recipientId: parsed.r,
      fileName: parsed.n,
    }
  } catch {
    return null
  }
}

export function buildWeTransferImagePath(
  transferId: string,
  securityHash: string,
  fileId: string,
  recipientId?: string | null,
  fileName?: string,
): string {
  const token = encodeWeTransferFileRef({
    transferId,
    securityHash,
    fileId,
    recipientId: recipientId ?? undefined,
    fileName,
  })
  return `/api/wetransfer/file/${token}`
}
