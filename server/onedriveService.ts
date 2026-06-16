import type { AlbumData, AlbumImage, DriveError, FetchAlbumResponse } from '../src/types/album'
import { driveError } from '../src/lib/drive/errors'
import {
  isOneDriveSharedFolderUrl,
  normalizeOneDriveShareUrl,
} from '../src/lib/onedrive/parseUrl'
import {
  getGraphToken,
  getSharedRootItem,
  listDriveChildren,
  listSharedChildren,
  OneDriveRequestError,
  resolveOneDriveShareUrl,
  type OneDriveDriveItem,
} from './onedriveApi'
import { buildOneDriveFilePath, buildOneDriveThumbnailPath } from './onedriveFileRef'

const MAX_DEPTH = 4
const THUMB_SIZE = 400
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i

function isImageFile(name: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  return IMAGE_EXT.test(name)
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
  return map[ext ?? ''] ?? 'image/jpeg'
}

function getDriveId(item: OneDriveDriveItem, fallback?: string): string | null {
  return item.parentReference?.driveId ?? fallback ?? null
}

async function resolveDriveId(
  shareUrl: string,
  root: OneDriveDriveItem,
): Promise<string | null> {
  const fromRoot = getDriveId(root)
  if (fromRoot) return fromRoot

  const sharedChildren = await listSharedChildren(shareUrl).catch(() => [])
  return sharedChildren[0]?.parentReference?.driveId ?? null
}

function toAlbumImage(
  shareUrl: string,
  item: OneDriveDriveItem,
  driveId: string,
): AlbumImage | null {
  if (!item.id || !item.name) return null

  return {
    id: item.id,
    name: item.name,
    mimeType: mimeFromName(item.name),
    thumbnailUrl: buildOneDriveThumbnailPath(shareUrl, driveId, item.id, THUMB_SIZE),
    originalUrl: buildOneDriveFilePath(shareUrl, driveId, item.id),
    webViewLink: item.webUrl,
    source: 'onedrive',
    embeddingReady: false,
  }
}

async function collectImages(
  shareUrl: string,
  driveId: string,
  folderItemId: string,
  depth: number,
): Promise<{ images: AlbumImage[]; totalEntries: number }> {
  const images: AlbumImage[] = []
  const subfolders: OneDriveDriveItem[] = []
  let totalEntries = 0

  const children = await listDriveChildren(driveId, folderItemId)
  totalEntries += children.length

  for (const child of children) {
    if (child.folder) {
      if (depth < MAX_DEPTH) subfolders.push(child)
    } else if (isImageFile(child.name, child.file?.mimeType)) {
      const image = toAlbumImage(shareUrl, child, driveId)
      if (image) images.push(image)
    }
  }

  for (const folder of subfolders) {
    const childDriveId = getDriveId(folder, driveId)
    if (!childDriveId || !folder.id) continue
    const nested = await collectImages(shareUrl, childDriveId, folder.id, depth + 1)
    images.push(...nested.images)
    totalEntries += nested.totalEntries
  }

  return { images, totalEntries }
}

function mapOneDriveError(err: unknown): DriveError {
  if (err instanceof OneDriveRequestError) {
    const tag = err.tag

    if (tag === 'missing_token') {
      return driveError(
        'ONEDRIVE_PROVIDER_ERROR',
        'Falta configurar Microsoft Graph en el servidor (MICROSOFT_GRAPH_ACCESS_TOKEN o credenciales de app).',
      )
    }

    if (
      tag === 'InvalidAuthenticationToken'
      || tag === 'token_error'
      || tag === 'invalid_client'
      || tag === 'unauthorized_client'
      || err.status === 401
    ) {
      return driveError(
        'ONEDRIVE_PROVIDER_ERROR',
        'El token de Microsoft Graph es inválido o expiró. Verificá la configuración del servidor.',
      )
    }

    if (
      tag === 'itemNotFound'
      || tag === 'resourceNotFound'
      || tag === 'sharingLinkInvalid'
      || tag === 'sharingLinkNotFound'
    ) {
      return driveError(
        'ONEDRIVE_PRIVATE_OR_INACCESSIBLE',
        'No pudimos acceder a esta carpeta de OneDrive. Verificá que el enlace sea público y esté completo.',
      )
    }

    if (tag === 'invalidRequest' || tag === 'badRequest' || err.status === 400) {
      return driveError(
        'ONEDRIVE_INVALID_URL',
        'El enlace de OneDrive parece incompleto o mal formado. Copiá la URL completa desde el navegador.',
      )
    }

    if (err.status === 403) {
      return driveError(
        'ONEDRIVE_PRIVATE_OR_INACCESSIBLE',
        'OneDrive no permitió leer esta carpeta compartida. Verificá que cualquier persona con el enlace pueda verla.',
      )
    }

    return driveError(
      'ONEDRIVE_PROVIDER_ERROR',
      `OneDrive API: ${tag || err.message}`,
    )
  }

  return driveError('ONEDRIVE_PROVIDER_ERROR')
}

export async function fetchOneDriveAlbum(url: string): Promise<FetchAlbumResponse> {
  if (!isOneDriveSharedFolderUrl(url)) {
    return {
      ok: false,
      error: driveError(
        'ONEDRIVE_INVALID_URL',
        'El enlace debe ser una carpeta pública compartida de OneDrive o SharePoint.',
      ),
    }
  }

  const token = await getGraphToken()
  if (!token) {
    return {
      ok: false,
      error: driveError(
        'ONEDRIVE_PROVIDER_ERROR',
        'Falta configurar Microsoft Graph en el servidor. Agregá MICROSOFT_GRAPH_ACCESS_TOKEN o credenciales de app en .env.',
      ),
    }
  }

  try {
    const resolvedUrl = await resolveOneDriveShareUrl(normalizeOneDriveShareUrl(url))
    const root = await getSharedRootItem(resolvedUrl)

    if (!root.folder) {
      return {
        ok: false,
        error: driveError(
          'ONEDRIVE_INVALID_URL',
          'El enlace debe apuntar a una carpeta compartida, no a un archivo individual.',
        ),
      }
    }

    const driveId = await resolveDriveId(resolvedUrl, root)
    if (!driveId || !root.id) {
      return {
        ok: false,
        error: driveError(
          'ONEDRIVE_PROVIDER_ERROR',
          'No pudimos identificar la carpeta compartida en OneDrive.',
        ),
      }
    }

    const { images, totalEntries } = await collectImages(resolvedUrl, driveId, root.id, 0)

    if (totalEntries === 0) {
      return { ok: false, error: driveError('ONEDRIVE_EMPTY_FOLDER') }
    }

    if (images.length === 0) {
      return { ok: false, error: driveError('ONEDRIVE_NO_IMAGES') }
    }

    const album: AlbumData = {
      source: 'onedrive',
      folderId: root.id,
      folderName: root.name,
      images,
      totalImages: images.length,
    }

    return { ok: true, album }
  } catch (err) {
    return { ok: false, error: mapOneDriveError(err) }
  }
}
