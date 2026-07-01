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

/** Phase 2A fallback: max album photos to compare per run. */
export const COMPARE_PHASE_MAX_PHOTOS = 50

/** Images per IndexFaces request batch (keeps Vercel under 60s). */
export const INDEX_BATCH_SIZE = 10

/** Person grouping: algorithm version (invalidate cache on change). */
export const PERSON_GROUPING_ALGORITHM_VERSION = 'searchfaces-unionfind-v1'

/** Minimum distinct photos per visible group in UI. */
export const PERSON_GROUPING_MIN_PHOTOS = 2

/** SearchFaces calls per lazy processing batch. */
export const PERSON_GROUPING_SEARCH_BATCH_SIZE = 8

/** Max faces returned per SearchFaces call. */
export const PERSON_GROUPING_MAX_FACE_MATCHES = 4096

/** Warn in UI when album exceeds this size (async pipeline later). */
export const LARGE_ALBUM_WARNING_PHOTOS = 500

/**
 * Face quality thresholds live in faceQuality.ts (tiered high / medium / low).
 * Guided multi-pose profiles: see FUTURE.md
 */
