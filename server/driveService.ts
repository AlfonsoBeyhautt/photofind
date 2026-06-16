import type { AlbumData, AlbumImage, DriveError, FetchAlbumResponse } from '../src/types/album'
import { driveError } from '../src/lib/drive/errors'
import { extractGoogleDriveFolderId } from '../src/lib/drive/parseUrl'
import { buildThumbnailProxyPath } from './imageProxy'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MAX_DEPTH = 4
const PAGE_SIZE = 200
const THUMB_SIZE = 400

interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
}

interface DriveListResponse {
  files?: DriveFile[]
  nextPageToken?: string
}

function imageOriginalUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`
}

function toAlbumImage(file: DriveFile): AlbumImage {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    // Never use thumbnailLink directly in browser — proxied through our backend
    thumbnailUrl: buildThumbnailProxyPath(file.id, THUMB_SIZE),
    originalUrl: imageOriginalUrl(file.id),
    webViewLink: file.webViewLink,
    source: 'google-drive',
    embeddingReady: false,
  }
}

async function driveFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Accept: 'application/json' },
  })

  const data = (await res.json()) as T & { error?: { code: number; message: string } }

  if (!res.ok) {
    const err = (data as { error?: { code: number; message: string } }).error
    throw Object.assign(new Error(err?.message ?? res.statusText), {
      status: res.status,
      driveCode: err?.code,
    })
  }

  return data
}

async function getFolderMeta(folderId: string, apiKey: string) {
  return driveFetch<{ id: string; name: string; mimeType: string }>(
    `/files/${folderId}?fields=id,name,mimeType&supportsAllDrives=true&key=${apiKey}`,
  )
}

async function listFolderContents(folderId: string, apiKey: string, pageToken?: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,webViewLink)')
  const token = pageToken ? `&pageToken=${pageToken}` : ''

  return driveFetch<DriveListResponse>(
    `/files?q=${q}&fields=${fields}&pageSize=${PAGE_SIZE}&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${apiKey}${token}`,
  )
}

async function collectImages(
  folderId: string,
  apiKey: string,
  depth = 0,
): Promise<{ images: AlbumImage[]; totalFiles: number }> {
  const images: AlbumImage[] = []
  const subfolders: string[] = []
  let totalFiles = 0
  let pageToken: string | undefined

  do {
    const page = await listFolderContents(folderId, apiKey, pageToken)
    const files = page.files ?? []
    totalFiles += files.length

    for (const file of files) {
      if (file.mimeType === FOLDER_MIME) {
        if (depth < MAX_DEPTH) subfolders.push(file.id)
      } else if (file.mimeType.startsWith('image/')) {
        images.push(toAlbumImage(file))
      }
    }

    pageToken = page.nextPageToken
  } while (pageToken)

  for (const subId of subfolders) {
    const nested = await collectImages(subId, apiKey, depth + 1)
    images.push(...nested.images)
    totalFiles += nested.totalFiles
  }

  return { images, totalFiles }
}

function mapFetchError(err: unknown): DriveError {
  const status = (err as { status?: number }).status
  const message = err instanceof Error ? err.message : ''

  if (status === 403 || status === 404) {
    return driveError('PRIVATE_FOLDER')
  }

  if (status === 400 || status === 401) {
    return driveError('GOOGLE_DRIVE_API_ERROR', message || undefined)
  }

  if (message.toLowerCase().includes('not found')) {
    return driveError('PRIVATE_FOLDER')
  }

  return driveError('GOOGLE_DRIVE_API_ERROR', message || undefined)
}

export async function fetchGoogleDriveAlbum(
  url: string,
  apiKey: string | undefined,
): Promise<FetchAlbumResponse> {
  console.log('[PhotoFind:Drive] fetch_start', { hasApiKey: Boolean(apiKey) })

  if (!apiKey) {
    console.error('[PhotoFind:Drive] fetch_error', { code: 'API_KEY_MISSING' })
    return { ok: false, error: driveError('API_KEY_MISSING') }
  }

  const folderId = extractGoogleDriveFolderId(url)
  if (!folderId) {
    return { ok: false, error: driveError('INVALID_URL') }
  }

  try {
    const meta = await getFolderMeta(folderId, apiKey)

    if (meta.mimeType !== FOLDER_MIME) {
      return {
        ok: false,
        error: driveError('INVALID_URL', 'El enlace debe apuntar a una carpeta, no a un archivo individual.'),
      }
    }

    const { images, totalFiles } = await collectImages(folderId, apiKey)

    if (totalFiles === 0) {
      return { ok: false, error: driveError('EMPTY_FOLDER') }
    }

    if (images.length === 0) {
      return { ok: false, error: driveError('NO_IMAGES') }
    }

    const album: AlbumData = {
      source: 'google-drive',
      folderId,
      folderName: meta.name,
      images,
      totalImages: images.length,
    }

    console.log('[PhotoFind:Drive] fetch_success', { folderId, images: album.totalImages })
    return { ok: true, album }
  } catch (err) {
    const mapped = mapFetchError(err)
    console.error('[PhotoFind:Drive] fetch_error', { code: mapped.code, message: mapped.message })
    return { ok: false, error: mapped }
  }
}
