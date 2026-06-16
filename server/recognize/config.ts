/** AWS Rekognition region (user decision). */
export const REKOGNITION_REGION = 'us-east-1'

/** Similarity threshold for SearchFaces (Phase 2+). */
export const SIMILARITY_THRESHOLD = 85

/** Rekognition collection TTL (Phase 2+). */
export const COLLECTION_RETENTION_DAYS = 30

/** Async jobs + polling from this album size (Phase 2+). */
export const ASYNC_JOB_MIN_PHOTOS = 500

/** Reference selfie TTL in memory store. */
export const REFERENCE_TTL_MS = 15 * 60 * 1000

/** Max reference image dimension sent to Rekognition. */
export const REFERENCE_MAX_DIMENSION = 1920

/** Phase 2A: max album photos to compare per run (trial mode). */
export const COMPARE_PHASE_MAX_PHOTOS = 50

/**
 * Face quality thresholds live in faceQuality.ts (tiered high / medium / low).
 * Guided multi-pose profiles: see FUTURE.md
 * Phase 2B: collections, IndexFaces, SearchFacesByImage — see FUTURE.md
 */
