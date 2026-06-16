import type { AlbumData, AlbumImage, DriveError, FetchAlbumResponse } from '../src/types/album'
import { driveError } from '../src/lib/drive/errors'
import { isWeTransferUrl } from '../src/lib/wetransfer/parseUrl'
import {
  filterWeTransferImageItems,
  prepareWeTransferDownload,
  resolveWeTransferContext,
  WeTransferApiError,
} from './wetransferApi'
import { buildWeTransferImagePath } from './wetransferFileRef'
import { wetransferDebug, wetransferDebugError } from './wetransferDebug'

function wetransferErr(code: DriveError['code'], message: string): DriveError {
  return driveError(code, message)
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  }
  return map[ext ?? ''] ?? 'application/octet-stream'
}

function mapError(error: unknown): FetchAlbumResponse {
  if (error instanceof WeTransferApiError) {
    const code = error.code as DriveError['code']
    return { ok: false, error: wetransferErr(code, error.message) }
  }

  wetransferDebugError('album_unexpected_error', {
    error: error instanceof Error ? error.message : String(error),
  })

  return {
    ok: false,
    error: wetransferErr('WETRANSFER_FETCH_FAILED', 'No se pudo leer el transfer de WeTransfer.'),
  }
}

function buildAlbumTitle(info: { display_name?: string; message?: string }, transferId: string): string {
  const name = info.display_name?.trim() || info.message?.trim()
  if (name) return name
  return `WeTransfer ${transferId.slice(0, 8)}`
}

export async function fetchWeTransferAlbum(url: string): Promise<FetchAlbumResponse> {
  if (!isWeTransferUrl(url)) {
    return {
      ok: false,
      error: wetransferErr(
        'WETRANSFER_INVALID_URL',
        'Pegá un enlace we.tl o wetransfer.com/downloads válido.',
      ),
    }
  }

  try {
    wetransferDebug('fetch_album_start', { url: url.slice(0, 80) })

    const ctx = await resolveWeTransferContext(url)
    const info = await prepareWeTransferDownload(ctx)
    const imageItems = filterWeTransferImageItems(info.items ?? [])

    if (imageItems.length === 0) {
      return {
        ok: false,
        error: wetransferErr(
          'WETRANSFER_NO_IMAGES',
          'Este transfer no contiene imágenes compatibles.',
        ),
      }
    }

    const images: AlbumImage[] = imageItems.map((item) => {
      const path = buildWeTransferImagePath(
        ctx.transferId,
        ctx.securityHash,
        item.id,
        ctx.recipientId,
        item.name,
      )

      return {
        id: item.id,
        name: item.name,
        mimeType: mimeFromName(item.name),
        thumbnailUrl: path,
        originalUrl: path,
        source: 'wetransfer',
        embeddingReady: false,
      }
    })

    wetransferDebug('fetch_album_ok', {
      transferId: ctx.transferId,
      imageCount: images.length,
    })

    const album: AlbumData = {
      source: 'wetransfer',
      folderId: ctx.transferId,
      folderName: buildAlbumTitle(info, ctx.transferId),
      images,
      totalImages: images.length,
    }

    return { ok: true, album }
  } catch (error) {
    return mapError(error)
  }
}
