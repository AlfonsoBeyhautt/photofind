export interface QualityTelemetryInput {
  runId?: string
  sessionId?: string
  userId?: string
  provider?: string
  albumUrl?: string
  pipelineMode?: string
  referenceSource?: string
  eventCategory?: string
  msIndexing?: number
  fallbackReason?: string
}
