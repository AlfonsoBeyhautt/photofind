import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error no declaration file
import heicConvert from 'heic-convert'
import { heicDebugLog, isJpegBuffer, magicBytesHex } from './heicDebug'

async function getSharp() {
  const mod = await import('sharp')
  return mod.default
}

const HEIC_MIME = new Set(['image/heic', 'image/heif'])
const HEIC_EXT = /\.(heic|heif)$/i

type HeicConvertFn = (opts: {
  buffer: ArrayBuffer
  format: 'JPEG'
  quality: number
}) => Promise<ArrayBuffer>

type HeicConvertAllFn = (opts: {
  buffer: ArrayBuffer
  format: 'JPEG'
}) => Promise<Array<{ convert: () => Promise<ArrayBuffer> }>>

const heicConvertOne = heicConvert as HeicConvertFn
const heicConvertAll = (heicConvert as { all?: HeicConvertAllFn }).all
const execFileAsync = promisify(execFile)

export type ContainerFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown'

export function detectContainerFormat(buffer: Buffer): ContainerFormat {
  if (isJpegBuffer(buffer)) return 'jpeg'
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png'
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  if (isHeicBuffer(buffer)) return 'heic'
  return 'unknown'
}

export function isHeicImage(contentType: string, fileName?: string, buffer?: Buffer): boolean {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (HEIC_MIME.has(mime)) return true
  if (fileName && HEIC_EXT.test(fileName)) return true
  if (buffer && isHeicBuffer(buffer)) return true
  return false
}

export function isHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false

  const head = buffer.subarray(0, Math.min(64, buffer.length))
  const ascii = head.toString('ascii')

  if (!ascii.includes('ftyp')) return false
  return /(heic|heix|hevc|hevx|mif1|msf1|MiHE|MiHA|MiHB)/i.test(ascii)
}

export interface DisplayImageOptions {
  maxWidth?: number
  quality?: number
  fileName?: string
  forceJpeg?: boolean
  requestUrl?: string
}

export class DisplayImageError extends Error {
  debug?: Record<string, unknown>

  constructor(message: string, debug?: Record<string, unknown>) {
    super(message)
    this.name = 'DisplayImageError'
    this.debug = debug
  }
}

/**
 * Browsers cannot render HEIC in <img>. Transcode to JPEG for gallery/lightbox.
 * Original bytes are preserved for ?download=1 responses.
 */
export async function toDisplayImage(
  buffer: Buffer,
  contentType: string,
  options: DisplayImageOptions = {},
): Promise<{ buffer: Buffer; contentType: string }> {
  const container = detectContainerFormat(buffer)
  const heic = isHeicImage(contentType, options.fileName, buffer)
  const shouldTranscode = options.forceJpeg || heic

  heicDebugLog({
    stage: 'display_start',
    fileName: options.fileName ?? null,
    mimeType: contentType,
    contentTypeReceived: contentType,
    magicBytesHex: magicBytesHex(buffer),
    bytes: buffer.length,
    isHeic: heic,
    conversionAttempted: shouldTranscode,
    requestUrl: options.requestUrl,
  })

  if (!shouldTranscode) {
    return { buffer, contentType }
  }

  const quality = options.quality ?? 88

  if (container === 'jpeg' && !heic) {
    const jpeg = await resizeToJpeg(buffer, quality, options.maxWidth)
    heicDebugLog({
      stage: 'display_done',
      fileName: options.fileName ?? null,
      converterUsed: 'sharp',
      conversionSuccess: true,
      responseContentType: 'image/jpeg',
      bytes: jpeg.length,
    })
    return { buffer: jpeg, contentType: 'image/jpeg' }
  }

  if (heic || container === 'heic') {
    const jpeg = await convertHeicToJpeg(buffer, quality, options.maxWidth, options.fileName, options.requestUrl)
    return { buffer: jpeg, contentType: 'image/jpeg' }
  }

  try {
    const jpeg = await resizeToJpeg(buffer, quality, options.maxWidth)
    if (!isJpegBuffer(jpeg)) {
      throw new Error('Sharp output is not a valid JPEG')
    }
    return { buffer: jpeg, contentType: 'image/jpeg' }
  } catch (error) {
    const sharpError = error instanceof Error ? error.message : String(error)
    heicDebugLog({
      stage: 'display_failed',
      fileName: options.fileName ?? null,
      converterUsed: 'sharp',
      conversionSuccess: false,
      sharpError,
      internalError: sharpError,
    })
    throw new DisplayImageError('No se pudo convertir la imagen para visualización.', { sharpError })
  }
}

async function convertHeicToJpeg(
  buffer: Buffer,
  quality: number,
  maxWidth: number | undefined,
  fileName: string | undefined,
  requestUrl: string | undefined,
): Promise<Buffer> {
  const arrayBuffer = copyToArrayBuffer(buffer)
  const errors: Record<string, string> = {}

  const attempts: Array<{
    name: HeicDebugRecordConverter
    run: () => Promise<Buffer>
  }> = [
    { name: 'heic-convert', run: () => runHeicConvertOne(arrayBuffer, quality) },
    { name: 'heic-convert.all', run: () => runHeicConvertAll(arrayBuffer) },
  ]

  if (process.platform === 'darwin') {
    attempts.push({ name: 'sips', run: () => runSips(buffer) })
  }

  attempts.push({
    name: 'sharp',
    run: async () => {
      const sharp = await getSharp()
      const out = await sharp(buffer, { failOn: 'none' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      if (!isJpegBuffer(out)) throw new Error('Sharp did not produce JPEG from HEIC')
      return out
    },
  })

  for (const attempt of attempts) {
    try {
      let jpeg = await attempt.run()
      if (!isJpegBuffer(jpeg) || jpeg.length < 128) {
        throw new Error(`${attempt.name} produced invalid JPEG (${jpeg.length} bytes)`)
      }

      if (maxWidth) {
        jpeg = await resizeToJpeg(jpeg, quality, maxWidth)
      }

      heicDebugLog({
        stage: 'display_done',
        fileName: fileName ?? null,
        requestUrl,
        converterUsed: attempt.name,
        conversionSuccess: true,
        responseContentType: 'image/jpeg',
        bytes: jpeg.length,
        magicBytesHex: magicBytesHex(jpeg),
      })

      return jpeg
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt.name === 'sharp') errors.sharpError = message
      else if (attempt.name === 'sips') errors.sipsError = message
      else errors.heicConvertError = message

      heicDebugLog({
        stage: 'converter_failed',
        fileName: fileName ?? null,
        requestUrl,
        converterUsed: attempt.name,
        conversionSuccess: false,
        internalError: message,
        ...errors,
      })
    }
  }

  heicDebugLog({
    stage: 'display_failed',
    fileName: fileName ?? null,
    requestUrl,
    conversionAttempted: true,
    conversionSuccess: false,
    ...errors,
    internalError: 'All HEIC converters failed',
  })

  throw new DisplayImageError('No se pudo convertir la imagen HEIC para visualización.', errors)
}

type HeicDebugRecordConverter = 'sharp' | 'heic-convert' | 'heic-convert.all' | 'sips'

async function runHeicConvertOne(arrayBuffer: ArrayBuffer, quality: number): Promise<Buffer> {
  const output = await heicConvertOne({
    buffer: arrayBuffer,
    format: 'JPEG',
    quality: quality / 100,
  })
  return Buffer.from(output)
}

async function runHeicConvertAll(arrayBuffer: ArrayBuffer): Promise<Buffer> {
  if (!heicConvertAll) throw new Error('heic-convert.all unavailable')

  const images = await heicConvertAll({
    buffer: arrayBuffer,
    format: 'JPEG',
  })

  if (!images.length) throw new Error('heic-convert.all returned no images')

  let lastError = 'No image converted'
  for (const image of images) {
    try {
      const output = await image.convert()
      const buf = Buffer.from(output)
      if (isJpegBuffer(buf) && buf.length >= 128) return buf
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  throw new Error(lastError)
}

async function runSips(buffer: Buffer): Promise<Buffer> {
  const id = randomUUID()
  const input = join(tmpdir(), `photofind-${id}.heic`)
  const output = join(tmpdir(), `photofind-${id}.jpg`)

  try {
    await writeFile(input, buffer)
    await execFileAsync('/usr/bin/sips', ['-s', 'format', 'jpeg', input, '--out', output])
    const jpeg = await readFile(output)
    if (!isJpegBuffer(jpeg)) throw new Error('sips did not produce valid JPEG')
    return jpeg
  } finally {
    await unlink(input).catch(() => {})
    await unlink(output).catch(() => {})
  }
}

async function resizeToJpeg(buffer: Buffer, quality: number, maxWidth?: number): Promise<Buffer> {
  const sharp = await getSharp()
  let pipeline = sharp(buffer, { failOn: 'none' })
  if (maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true })
  }
  const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
  return Buffer.from(out)
}

function copyToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength)
  copy.set(buffer)
  return copy.buffer
}
