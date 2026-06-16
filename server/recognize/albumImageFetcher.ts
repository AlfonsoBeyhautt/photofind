import type { AlbumImage } from '../../src/types/album'
import { toDisplayImage } from '../displayImage'
import { getGoogleDriveApiKey } from '../env'
import { fetchDropboxFile } from '../dropboxImageProxy'
import { fetchDriveThumbnail } from '../imageProxy'
import { fetchWeTransferFile } from '../wetransferImageProxy'

const REKOGNITION_IMAGE_MAX = 1200

function extractProxyToken(url: string, pattern: RegExp): string | null {
  const match = url.match(pattern)
  return match?.[1] ?? null
}

async function toRekognitionJpeg(
  buffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<Buffer | null> {
  try {
    const display = await toDisplayImage(buffer, contentType, {
      fileName,
      forceJpeg: true,
      maxWidth: REKOGNITION_IMAGE_MAX,
    })
    return display.buffer
  } catch {
    return null
  }
}

/**
 * Provider-agnostic image fetch for Rekognition.
 * Always returns JPEG bytes suitable for IndexFaces (HEIC converted server-side).
 */
export async function fetchAlbumImageForRekognition(image: AlbumImage): Promise<Buffer | null> {
  let buffer: Buffer | null = null
  let contentType = image.mimeType
  const fileName = image.name

  switch (image.source) {
    case 'google-drive': {
      const result = await fetchDriveThumbnail(image.id, getGoogleDriveApiKey(), REKOGNITION_IMAGE_MAX)
      if (!result) return null
      buffer = result.buffer
      contentType = result.contentType
      break
    }
    case 'dropbox': {
      const token = extractProxyToken(image.originalUrl, /\/api\/dropbox\/file\/([^/?]+)/)
        ?? extractProxyToken(image.thumbnailUrl, /\/api\/dropbox\/thumbnail\/([^/?]+)/)
      if (!token) return null
      const result = await fetchDropboxFile(token)
      if (!result) return null
      buffer = result.buffer
      contentType = result.contentType
      break
    }
    case 'wetransfer': {
      const token = extractProxyToken(image.originalUrl, /\/api\/wetransfer\/file\/([^/?]+)/)
        ?? extractProxyToken(image.thumbnailUrl, /\/api\/wetransfer\/thumbnail\/([^/?]+)/)
      if (!token) return null
      const result = await fetchWeTransferFile(token)
      if (!result) return null
      buffer = result.buffer
      contentType = result.contentType
      break
    }
    case 'pixieset': {
      try {
        const res = await fetch(image.originalUrl, { redirect: 'follow' })
        if (!res.ok) return null
        buffer = Buffer.from(await res.arrayBuffer())
        contentType = res.headers.get('content-type') ?? image.mimeType
      } catch {
        return null
      }
      break
    }
    default:
      return null
  }

  if (!buffer) return null
  return toRekognitionJpeg(buffer, contentType, fileName)
}
