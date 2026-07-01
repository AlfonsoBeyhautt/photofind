import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AlbumImage } from '../../src/types/album'
import type { QualityTelemetryInput } from '../telemetry/qualityTelemetryTypes'
import {
  getAlbumJobStatus,
  processAlbumJobBatch,
  searchAlbumJob,
  startAlbumProcessingJob,
} from './albumJobService'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

interface JobStartBody {
  source?: string
  folderId?: string
  folderName?: string
  albumUrl?: string
  eventCategory?: string
  images?: Pick<AlbumImage, 'id' | 'name'>[]
  sessionId?: string
  userId?: string
  retry?: boolean
}

interface JobProcessBody {
  jobId?: string
  images?: AlbumImage[]
  qualityRunId?: string
}

interface JobSearchBody {
  jobId?: string
  referenceToken?: string
  albumCollectionId?: string
  collectionId?: string
  albumTotal?: number
  collectionReused?: boolean
  qualityTelemetry?: QualityTelemetryInput
}

export async function handleAlbumJobStartRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: JobStartBody
  try {
    body = JSON.parse(rawBody) as JobStartBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'ALBUM_JOB_FAILED', message: 'Solicitud inválida.' } })
    return
  }

  const { source, folderId, folderName, albumUrl, eventCategory, images, sessionId, userId, retry } = body
  if (!source || !folderId || !Array.isArray(images) || images.length === 0) {
    sendJson(res, 400, { ok: false, error: { code: 'ALBUM_JOB_FAILED', message: 'Faltan datos del álbum.' } })
    return
  }

  const result = await startAlbumProcessingJob({
    source,
    folderId,
    folderName,
    albumUrl,
    eventCategory,
    images,
    sessionId,
    userId,
    retry,
  })
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handleAlbumJobStatusRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost')
  const jobId = url.searchParams.get('jobId') ?? undefined
  const albumFingerprint = url.searchParams.get('albumFingerprint') ?? undefined
  const sessionId = url.searchParams.get('sessionId') ?? undefined

  if (!jobId && !albumFingerprint) {
    sendJson(res, 400, { ok: false, error: { code: 'ALBUM_JOB_NOT_FOUND', message: 'Falta jobId o albumFingerprint.' } })
    return
  }

  const result = await getAlbumJobStatus({ jobId, albumFingerprint, sessionId })
  sendJson(res, result.ok ? 200 : 404, result)
}

export async function handleAlbumJobProcessRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: JobProcessBody
  try {
    body = JSON.parse(rawBody) as JobProcessBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'ALBUM_JOB_FAILED', message: 'Solicitud inválida.' } })
    return
  }

  const { jobId, images, qualityRunId } = body
  if (!jobId || !Array.isArray(images) || images.length === 0) {
    sendJson(res, 400, { ok: false, error: { code: 'ALBUM_JOB_FAILED', message: 'Faltan datos del job.' } })
    return
  }

  const result = await processAlbumJobBatch({ jobId, images, qualityRunId })
  sendJson(res, result.ok ? 200 : 400, result)
}

export async function handleAlbumJobSearchRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: JobSearchBody
  try {
    body = JSON.parse(rawBody) as JobSearchBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Solicitud inválida.' } })
    return
  }

  const { jobId, referenceToken, albumCollectionId, collectionId, albumTotal, collectionReused, qualityTelemetry } = body
  if (!referenceToken || !albumCollectionId || !collectionId || typeof albumTotal !== 'number') {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'Falta la referencia o la colección.' },
    })
    return
  }

  const result = await searchAlbumJob({
    jobId,
    referenceToken,
    albumCollectionId,
    collectionId,
    albumTotal,
    collectionReused: collectionReused ?? false,
    qualityTelemetry,
  })
  sendJson(res, result.ok ? 200 : 400, result)
}
