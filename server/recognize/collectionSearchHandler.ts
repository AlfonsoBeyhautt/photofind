import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AlbumImage } from '../../src/types/album'
import {
  indexAlbumBatch,
  prepareAlbumCollection,
  searchAlbumCollection,
} from './collectionSearchService'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

interface PrepareCollectionBody {
  source?: string
  folderId?: string
  folderName?: string
  albumUrl?: string
  eventCategory?: string
  images?: Pick<AlbumImage, 'id' | 'name'>[]
}

interface IndexBatchBody {
  albumCollectionId?: string
  collectionId?: string
  images?: AlbumImage[]
}

interface SearchCollectionBody {
  referenceToken?: string
  albumCollectionId?: string
  collectionId?: string
  albumTotal?: number
  collectionReused?: boolean
}

export async function handlePrepareCollectionRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: PrepareCollectionBody
  try {
    body = JSON.parse(rawBody) as PrepareCollectionBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Solicitud inválida.' },
    })
    return
  }

  const { source, folderId, folderName, albumUrl, eventCategory, images } = body
  if (!source || !folderId || !Array.isArray(images) || images.length === 0) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Faltan datos del álbum.' },
    })
    return
  }

  const result = await prepareAlbumCollection({
    source,
    folderId,
    folderName,
    albumUrl,
    eventCategory,
    images,
  })
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handleIndexAlbumBatchRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: IndexBatchBody
  try {
    body = JSON.parse(rawBody) as IndexBatchBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_INDEXING_FAILED', message: 'Solicitud inválida.' },
    })
    return
  }

  const { albumCollectionId, collectionId, images } = body
  if (!albumCollectionId || !collectionId || !Array.isArray(images) || images.length === 0) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_INDEXING_FAILED', message: 'Faltan datos para indexar.' },
    })
    return
  }

  const result = await indexAlbumBatch({ albumCollectionId, collectionId, images })
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handleSearchCollectionRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: SearchCollectionBody
  try {
    body = JSON.parse(rawBody) as SearchCollectionBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Solicitud inválida.' },
    })
    return
  }

  const { referenceToken, albumCollectionId, collectionId, albumTotal, collectionReused } = body
  if (!referenceToken || !albumCollectionId || !collectionId || typeof albumTotal !== 'number') {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Falta la referencia o la colección.' },
    })
    return
  }

  const result = await searchAlbumCollection({
    referenceToken,
    albumCollectionId,
    collectionId,
    albumTotal,
    collectionReused: collectionReused ?? false,
  })
  sendJson(res, result.ok ? 200 : 400, result)
}
