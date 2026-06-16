import type { AlbumData, AlbumImage, DriveError, FetchAlbumResponse } from '../src/types/album'
import { driveError } from '../src/lib/drive/errors'
import {
  isDropboxSharedFolderUrl,
  normalizeDropboxSharedUrl,
  extractDropboxSharedKey,
  hasDropboxRlkey,
} from '../src/lib/dropbox/parseUrl'
import {
  DropboxRequestError,
  getSharedLinkMetadata,
  listFolderViaSharedLink,
  type DropboxFileEntry,
  type DropboxListEntry,
} from './dropboxApi'
import { buildDropboxFilePath, buildDropboxThumbnailPath } from './dropboxFileRef'
import { dropboxDebug, dropboxDebugError } from './dropboxDebug'
import { getDropboxAccessToken } from './env'

const MAX_DEPTH = 4
const THUMB_SIZE = 400

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i

function isImageFile(name: string): boolean {
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

function toAlbumImage(
  sharedUrl: string,
  file: DropboxFileEntry,
  sharedRelativePath: string,
): AlbumImage {
  return {
    id: file.id,
    name: file.name,
    mimeType: mimeFromName(file.name),
    thumbnailUrl: buildDropboxThumbnailPath(sharedUrl, sharedRelativePath, file.id, THUMB_SIZE),
    originalUrl: buildDropboxFilePath(sharedUrl, sharedRelativePath, file.id),
    source: 'dropbox',
    embeddingReady: false,
  }
}

/** Join path segments relative to shared link root for list_folder API. */
function joinSharedListPath(parentListPath: string, entryName: string): string {
  if (!parentListPath) return `/${entryName}`
  return `${parentListPath}/${entryName}`
}

/** Build file path relative to shared link root for get_shared_link_file. */
function buildSharedRelativePath(listPath: string, fileName: string): string {
  if (!listPath) return `/${fileName}`
  return `${listPath}/${fileName}`
}

async function listAllEntries(sharedUrl: string, listPath: string): Promise<DropboxListEntry[]> {
  const entries: DropboxListEntry[] = []
  let cursor: string | undefined

  do {
    const endpoint = cursor ? 'files/list_folder/continue' : 'files/list_folder'
    dropboxDebug('list_folder_request', { endpoint, listPath: listPath || '/', hasCursor: Boolean(cursor) })

    const page = await listFolderViaSharedLink(sharedUrl, listPath, cursor)
    entries.push(...page.entries)
    cursor = page.has_more ? page.cursor : undefined

    dropboxDebug('list_folder_page', {
      endpoint,
      listPath: listPath || '/',
      pageEntries: page.entries.length,
      totalSoFar: entries.length,
      hasMore: page.has_more,
    })
  } while (cursor)

  return entries
}

async function collectImages(
  sharedUrl: string,
  listPath: string,
  depth: number,
): Promise<{ images: AlbumImage[]; totalFiles: number }> {
  const images: AlbumImage[] = []
  const subfolderPaths: string[] = []
  let totalFiles = 0

  const entries = await listAllEntries(sharedUrl, listPath)
  totalFiles += entries.length

  for (const entry of entries) {
    if (entry['.tag'] === 'folder') {
      if (depth < MAX_DEPTH) {
        subfolderPaths.push(joinSharedListPath(listPath, entry.name))
      }
    } else if (entry['.tag'] === 'file' && isImageFile(entry.name)) {
      const sharedRelativePath = buildSharedRelativePath(listPath, entry.name)
      dropboxDebug('image_found', {
        fileId: entry.id,
        fileName: entry.name,
        pathLower: entry.path_lower,
        sharedRelativePath,
        hasId: Boolean(entry.id),
      })
      images.push(toAlbumImage(sharedUrl, entry, sharedRelativePath))
    }
  }

  for (const subPath of subfolderPaths) {
    const nested = await collectImages(sharedUrl, subPath, depth + 1)
    images.push(...nested.images)
    totalFiles += nested.totalFiles
  }

  return { images, totalFiles }
}

function mapDropboxError(err: unknown): DriveError {
  if (err instanceof DropboxRequestError) {
    dropboxDebugError('api_error', {
      endpoint: err.endpoint,
      status: err.status,
      errorSummary: err.errorSummary,
      tag: err.tag,
      rawBody: err.rawBody,
    })

    const tag = err.tag

    if (tag === 'missing_token') {
      return driveError(
        'API_KEY_MISSING',
        'Falta configurar DROPBOX_ACCESS_TOKEN en el servidor.',
      )
    }

    if (
      tag === 'invalid_access_token'
      || tag === 'expired_access_token'
      || tag === 'invalid_oauth_token'
      || (err.status === 401 && !tag.startsWith('shared_link'))
    ) {
      return driveError(
        'DROPBOX_TOKEN_INVALID',
        'El token de Dropbox es inválido o expiró. Regenerá DROPBOX_ACCESS_TOKEN en la consola de Dropbox y reiniciá el servidor.',
      )
    }

    if (tag === 'missing_scope' || tag === 'insufficient_scope') {
      return driveError(
        'DROPBOX_PERMISSION_MISSING',
        'El token de Dropbox no tiene permisos suficientes. Activá sharing.read y files.metadata.read, regenerá el token y reiniciá el servidor.',
      )
    }

    if (
      tag === 'invalid_url'
      || tag === 'malformed_url'
      || tag === 'invalid_arg'
      || (err.status === 404 && err.rawBody.includes('<!DOCTYPE html>'))
    ) {
      return driveError(
        'DROPBOX_INVALID_SHARED_LINK',
        'El enlace de Dropbox parece incompleto o mal formado. Copiá la URL completa desde el navegador, incluyendo rlkey si aparece.',
      )
    }

    if (
      tag === 'shared_link_access_denied'
      || tag === 'shared_link_not_found'
      || tag === 'path/not_found'
    ) {
      return driveError(
        'PRIVATE_OR_INACCESSIBLE_FOLDER',
        'Dropbox no permitió acceder a esta carpeta compartida. Verificá que el enlace sea público y esté completo.',
      )
    }

    return driveError(
      'UNKNOWN_ERROR',
      `Dropbox API (${err.endpoint}): ${err.errorSummary || err.message}`,
    )
  }

  dropboxDebugError('unexpected_error', { message: err instanceof Error ? err.message : String(err) })
  return driveError('UNKNOWN_ERROR')
}

export async function fetchDropboxAlbum(url: string): Promise<FetchAlbumResponse> {
  dropboxDebug('fetch_start', { receivedUrl: url })

  if (!getDropboxAccessToken()) {
    return {
      ok: false,
      error: driveError(
        'API_KEY_MISSING',
        'Falta configurar DROPBOX_ACCESS_TOKEN en el servidor.',
      ),
    }
  }

  if (!isDropboxSharedFolderUrl(url)) {
    return {
      ok: false,
      error: driveError(
        'DROPBOX_INVALID_SHARED_LINK',
        'El enlace debe ser una carpeta pública compartida de Dropbox (formato /sh/ o /scl/fo/).',
      ),
    }
  }

  const sharedUrl = normalizeDropboxSharedUrl(url)
  const folderKey = extractDropboxSharedKey(url)

  dropboxDebug('fetch_parsed', {
    receivedUrl: url,
    normalizedUrl: sharedUrl,
    folderKey,
    hasRlkey: hasDropboxRlkey(url),
    normalizedHasRlkey: hasDropboxRlkey(sharedUrl),
  })

  if (/dropbox\.com\/scl\/fo\//i.test(url) && !hasDropboxRlkey(sharedUrl)) {
    dropboxDebug('rlkey_missing_warning', {
      message: 'scl/fo link without rlkey — proceeding, API may still work',
    })
  }

  try {
    dropboxDebug('metadata_request', { endpoint: 'sharing/get_shared_link_metadata' })
    const meta = await getSharedLinkMetadata(sharedUrl)

    dropboxDebug('metadata_success', { tag: meta['.tag'], name: meta.name })

    if (meta['.tag'] !== 'folder') {
      return {
        ok: false,
        error: driveError(
          'DROPBOX_INVALID_SHARED_LINK',
          'El enlace debe apuntar a una carpeta compartida, no a un archivo individual.',
        ),
      }
    }

    const { images, totalFiles } = await collectImages(sharedUrl, '', 0)

    dropboxDebug('collect_success', {
      totalEntries: totalFiles,
      imageCount: images.length,
      folderName: meta.name,
    })

    if (totalFiles === 0) {
      return { ok: false, error: driveError('EMPTY_FOLDER') }
    }

    if (images.length === 0) {
      return { ok: false, error: driveError('NO_IMAGES') }
    }

    const album: AlbumData = {
      source: 'dropbox',
      folderId: folderKey ?? sharedUrl,
      folderName: meta.name,
      images,
      totalImages: images.length,
    }

    return { ok: true, album }
  } catch (err) {
    return { ok: false, error: mapDropboxError(err) }
  }
}
