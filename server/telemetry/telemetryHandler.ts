import type { IncomingMessage, ServerResponse } from 'node:http'
import { getAuthenticatedUser } from '../auth/supabaseAuth'
import {
  recordClientAbandoned,
  recordClientDownload,
  recordClientProcessingTiming,
  recordClientSelection,
  recordCompareFallbackOutcome,
  recordSearchRunStarted,
} from './qualityTelemetryService'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

type TelemetryEventType =
  | 'run_started'
  | 'processing_timing'
  | 'download'
  | 'selection'
  | 'abandoned'
  | 'compare_outcome'

interface TelemetryBody {
  type?: TelemetryEventType
  runId?: string
  sessionId?: string
  provider?: string
  albumUrl?: string
  pipelineMode?: string
  referenceSource?: string
  eventCategory?: string
  repeatSearch?: boolean
  retriedReference?: boolean
  msAlbumFetch?: number
  msPreload?: number
  msTotal?: number
  downloadCount?: number
  immediateDownload?: boolean
  selectedCount?: number
  imagesAnalyzed?: number
  matches?: Array<{ similarity: number }>
  compareFacesCalls?: number
  msSearch?: number
  fallbackReason?: string
  failed?: boolean
}

export async function handleQualityTelemetryRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
): Promise<void> {
  let body: TelemetryBody
  try {
    body = JSON.parse(rawBody) as TelemetryBody
  } catch {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' } })
    return
  }

  const runId = body.runId?.trim()
  const type = body.type
  if (!runId || !type) {
    sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Faltan datos.' } })
    return
  }

  let userId: string | null = null
  try {
    const user = await getAuthenticatedUser(req)
    userId = user?.id ?? null
  } catch {
    userId = null
  }

  try {
    switch (type) {
      case 'run_started':
        await recordSearchRunStarted({
          runId,
          userId,
          sessionId: body.sessionId,
          provider: body.provider,
          albumUrl: body.albumUrl,
          pipelineMode: body.pipelineMode,
          referenceSource: body.referenceSource,
          eventCategory: body.eventCategory,
          repeatSearch: body.repeatSearch,
          retriedReference: body.retriedReference,
          msAlbumFetch: body.msAlbumFetch,
        })
        break
      case 'processing_timing':
        await recordClientProcessingTiming({
          runId,
          msPreload: body.msPreload,
          msTotal: body.msTotal,
        })
        break
      case 'download':
        await recordClientDownload({
          runId,
          count: body.downloadCount ?? 1,
          immediate: body.immediateDownload,
        })
        break
      case 'selection':
        await recordClientSelection({
          runId,
          selectedCount: body.selectedCount ?? 0,
        })
        break
      case 'abandoned':
        await recordClientAbandoned(runId)
        break
      case 'compare_outcome':
        await recordCompareFallbackOutcome({
          runId,
          userId,
          sessionId: body.sessionId,
          provider: body.provider,
          albumUrl: body.albumUrl,
          imagesAnalyzed: body.imagesAnalyzed ?? 0,
          matches: body.matches ?? [],
          compareFacesCalls: body.compareFacesCalls ?? 0,
          fallbackReason: body.fallbackReason,
          msSearch: body.msSearch,
          referenceSource: body.referenceSource,
          eventCategory: body.eventCategory,
          failed: body.failed,
        })
        break
      default:
        sendJson(res, 400, { ok: false, error: { code: 'INVALID_REQUEST', message: 'Tipo desconocido.' } })
        return
    }
  } catch (err) {
    console.error('[PhotoFind:Telemetry] handler_error', err instanceof Error ? err.message : err)
    sendJson(res, 500, { ok: false, error: { code: 'TELEMETRY_FAILED', message: 'No pudimos registrar la telemetría.' } })
    return
  }

  sendJson(res, 200, { ok: true })
}
