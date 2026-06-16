const ENABLED = process.env.PHOTOFIND_HEIC_DEBUG !== '0'

export interface HeicDebugRecord {
  fileName?: string | null
  mimeType?: string | null
  contentTypeReceived?: string | null
  magicBytesHex?: string
  bytes?: number
  isHeic?: boolean
  conversionAttempted?: boolean
  converterUsed?: 'sharp' | 'heic-convert' | 'heic-convert.all' | 'sips' | 'none'
  conversionSuccess?: boolean
  responseStatus?: number
  responseContentType?: string
  requestUrl?: string
  sharpError?: string
  heicConvertError?: string
  sipsError?: string
  internalError?: string
  directLinkStatus?: number
  expectedBytes?: number | null
  stage?: string
}

export function heicDebugLog(record: HeicDebugRecord): void {
  if (!ENABLED) return
  console.log('[PhotoFind:HEIC]', JSON.stringify(record))
}

export function magicBytesHex(buffer: Buffer, len = 16): string {
  return buffer.subarray(0, Math.min(len, buffer.length)).toString('hex')
}

export function isJpegBuffer(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}
