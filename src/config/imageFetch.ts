import type { AlbumProvider } from '../types/provider'

/** Default parallel image fetch workers (server Rekognition + client thumbnails). */
export const IMAGE_FETCH_DEFAULT_CONCURRENCY = 6

/** Per-provider concurrency caps (rate limits / observed stability). */
export const IMAGE_FETCH_CONCURRENCY_BY_PROVIDER: Record<AlbumProvider, number> = {
  'google-drive': 6,
  dropbox: 6,
  pixieset: 4,
  wetransfer: 4,
  onedrive: 4,
  unknown: 4,
}

/** Max retry attempts after the first try (2 = up to 3 total attempts). */
export const IMAGE_FETCH_MAX_RETRIES = 2

/** Per-image fetch timeout in milliseconds. */
export const IMAGE_FETCH_TIMEOUT_MS = 30_000

/** Backoff between retries in milliseconds. */
export const IMAGE_FETCH_RETRY_DELAY_MS = 400

export function getImageFetchConcurrency(provider: AlbumProvider | string | undefined): number {
  if (!provider) return IMAGE_FETCH_DEFAULT_CONCURRENCY
  const key = provider as AlbumProvider
  return IMAGE_FETCH_CONCURRENCY_BY_PROVIDER[key] ?? IMAGE_FETCH_DEFAULT_CONCURRENCY
}
