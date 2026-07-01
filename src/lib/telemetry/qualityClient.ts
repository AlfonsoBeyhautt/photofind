import { getOrCreateSessionId } from '../recognition/sessionId'

export function createQualityRunId(): string {
  return crypto.randomUUID()
}

export interface QualityTelemetryContext {
  runId: string
  sessionId: string
  provider?: string
  albumUrl?: string
  referenceSource?: string
  pipelineMode?: string
  eventCategory?: string | null
  repeatSearch?: boolean
  retriedReference?: boolean
  userId?: string | null
}

let pendingRepeatSearch = false

export function markNextSearchAsRepeat(): void {
  pendingRepeatSearch = true
}

export function consumeRepeatSearchFlag(): boolean {
  const value = pendingRepeatSearch
  pendingRepeatSearch = false
  return value
}

export function buildQualityTelemetryPayload(
  ctx: QualityTelemetryContext | null | undefined,
): Record<string, unknown> | undefined {
  if (!ctx) return undefined
  return {
    runId: ctx.runId,
    sessionId: ctx.sessionId,
    provider: ctx.provider,
    albumUrl: ctx.albumUrl,
    referenceSource: ctx.referenceSource,
    pipelineMode: ctx.pipelineMode,
    eventCategory: ctx.eventCategory ?? undefined,
    userId: ctx.userId ?? undefined,
  }
}

async function sendQualityEvent(body: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/telemetry/quality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // fire-and-forget
  }
}

export async function recordQualityRunStarted(input: {
  runId: string
  provider?: string
  albumUrl?: string
  referenceSource?: string
  pipelineMode?: string
  eventCategory?: string | null
  repeatSearch?: boolean
  retriedReference?: boolean
  msAlbumFetch?: number
}): Promise<void> {
  await sendQualityEvent({
    type: 'run_started',
    runId: input.runId,
    sessionId: getOrCreateSessionId(),
    provider: input.provider,
    albumUrl: input.albumUrl,
    referenceSource: input.referenceSource,
    pipelineMode: input.pipelineMode,
    eventCategory: input.eventCategory ?? undefined,
    repeatSearch: input.repeatSearch ?? false,
    retriedReference: input.retriedReference ?? false,
    msAlbumFetch: input.msAlbumFetch,
  })
}

export async function recordQualityProcessingTiming(input: {
  runId: string
  msPreload?: number
  msTotal?: number
}): Promise<void> {
  await sendQualityEvent({
    type: 'processing_timing',
    runId: input.runId,
    msPreload: input.msPreload,
    msTotal: input.msTotal,
  })
}

export async function recordQualityDownload(input: {
  runId: string
  count: number
  immediate?: boolean
}): Promise<void> {
  await sendQualityEvent({
    type: 'download',
    runId: input.runId,
    downloadCount: input.count,
    immediateDownload: input.immediate ?? false,
  })
}

export async function recordQualitySelection(input: {
  runId: string
  selectedCount: number
}): Promise<void> {
  await sendQualityEvent({
    type: 'selection',
    runId: input.runId,
    selectedCount: input.selectedCount,
  })
}

export async function recordQualityAbandoned(runId: string): Promise<void> {
  await sendQualityEvent({ type: 'abandoned', runId })
}

export async function recordQualityCompareOutcome(input: {
  runId: string
  provider?: string
  albumUrl?: string
  referenceSource?: string
  eventCategory?: string | null
  imagesAnalyzed: number
  matches: Array<{ similarity: number }>
  compareFacesCalls: number
  msSearch?: number
  fallbackReason?: string
  failed?: boolean
}): Promise<void> {
  await sendQualityEvent({
    type: 'compare_outcome',
    runId: input.runId,
    sessionId: getOrCreateSessionId(),
    provider: input.provider,
    albumUrl: input.albumUrl,
    referenceSource: input.referenceSource,
    eventCategory: input.eventCategory ?? undefined,
    imagesAnalyzed: input.imagesAnalyzed,
    matches: input.matches,
    compareFacesCalls: input.compareFacesCalls,
    msSearch: input.msSearch,
    fallbackReason: input.fallbackReason,
    failed: input.failed ?? false,
  })
}
