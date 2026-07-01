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
export const PERSON_GROUPING_ALGORITHM_VERSION = 'searchfaces-unionfind-v2'

/** Minimum distinct photos per visible group in UI. */
export const PERSON_GROUPING_MIN_PHOTOS = 2

/** SearchFaces calls per lazy processing batch. */
export const PERSON_GROUPING_SEARCH_BATCH_SIZE = 8

/** Max faces returned per SearchFaces call. */
export const PERSON_GROUPING_MAX_FACE_MATCHES = 4096

/** Min detection confidence to use a face as clustering seed. */
export const PERSON_GROUPING_MIN_SEED_CONFIDENCE = 65

/** Min bbox area (fraction of frame) for clustering seeds. */
export const PERSON_GROUPING_MIN_SEED_BBOX_AREA = 0.0008

/** Representatives per group used in the merge pass. */
export const PERSON_GROUPING_MERGE_REPRESENTATIVES = 3

/** Max SearchFaces calls in merge pass (cost cap). */
export const PERSON_GROUPING_MERGE_MAX_SEARCHES = 48

/** Merge pass: minimum similarity to consider linking groups. */
export const PERSON_GROUPING_MERGE_SIMILARITY_THRESHOLD = 82

/** Merge pass: auto-merge on a single strong match. */
export const PERSON_GROUPING_MERGE_HIGH_CONFIDENCE = 88

/** Below this quality_score (confidence × bboxArea) a visible group is labeled low-confidence. */
export const PERSON_GROUPING_LOW_CONFIDENCE_QUALITY_SCORE = 1.5

/** Warn in UI when album exceeds this size (async pipeline later). */
export const LARGE_ALBUM_WARNING_PHOTOS = 500

/**
 * Face quality thresholds live in faceQuality.ts (tiered high / medium / low).
 * Guided multi-pose profiles: see FUTURE.md
 */
