import type { AlbumImage } from '../../src/types/album'
import {
  getImageFetchConcurrency,
  IMAGE_FETCH_MAX_RETRIES,
  IMAGE_FETCH_RETRY_DELAY_MS,
  IMAGE_FETCH_TIMEOUT_MS,
} from '../../src/config/imageFetch'
import { runPoolMap } from '../lib/asyncPool'
import { fetchAlbumImageForRekognition } from './albumImageFetcher'

export interface ImageFetchStats {
  msTotal: number
  requests: number
  failures: number
  retries: number
  concurrency: number
}

export function createImageFetchStats(concurrency: number): ImageFetchStats {
  return {
    msTotal: 0,
    requests: 0,
    failures: 0,
    retries: 0,
    concurrency,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('IMAGE_FETCH_TIMEOUT')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Fetch a single album image with timeout + retries.
 * Mutates `stats` when provided.
 */
export async function fetchAlbumImageWithRetry(
  image: AlbumImage,
  stats?: ImageFetchStats,
): Promise<Buffer | null> {
  const maxAttempts = IMAGE_FETCH_MAX_RETRIES + 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      if (stats) stats.retries++
      await sleep(IMAGE_FETCH_RETRY_DELAY_MS * attempt)
    }

    if (stats) stats.requests++

    try {
      const buffer = await withTimeout(
        fetchAlbumImageForRekognition(image),
        IMAGE_FETCH_TIMEOUT_MS,
      )
      if (buffer) return buffer
    } catch (err) {
      console.warn('[PhotoFind:ImageFetch] attempt_failed', {
        imageId: image.id,
        attempt: attempt + 1,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (stats) stats.failures++
  return null
}

export function resolveFetchConcurrency(images: readonly AlbumImage[]): number {
  const provider = images[0]?.source
  return getImageFetchConcurrency(provider)
}

/**
 * Run a per-image task with controlled parallel fetch+process workers.
 * Each worker fetches one image (with retries), runs `process`, then releases the buffer.
 */
export async function runParallelImageWork<T>(
  images: readonly AlbumImage[],
  process: (image: AlbumImage, imageBytes: Buffer) => Promise<T>,
  options?: {
    concurrency?: number
    stats?: ImageFetchStats
    onItemComplete?: (completed: number, total: number) => void
  },
): Promise<Array<T | null>> {
  const concurrency = options?.concurrency ?? resolveFetchConcurrency(images)
  const stats = options?.stats
  if (stats) stats.concurrency = concurrency

  const total = images.length
  let completed = 0
  const fetchStarted = Date.now()

  const results = await runPoolMap(images, concurrency, async (image) => {
    const imageBytes = await fetchAlbumImageWithRetry(image, stats)
    if (!imageBytes) {
      completed++
      options?.onItemComplete?.(completed, total)
      return null
    }

    try {
      const result = await process(image, imageBytes)
      return result
    } finally {
      completed++
      options?.onItemComplete?.(completed, total)
    }
  })

  if (stats) {
    stats.msTotal += Date.now() - fetchStarted
  }

  return results
}
