import { IMAGE_LOAD_CONCURRENCY } from './config'

export interface PreloadProgress {
  loaded: number
  failed: number
  completed: number
  total: number
}

class ImageLoadQueue {
  private readonly loadedUrls = new Set<string>()
  private readonly failedUrls = new Set<string>()
  private readonly inFlight = new Map<string, Promise<boolean>>()

  isLoaded(url: string): boolean {
    return this.loadedUrls.has(url)
  }

  isFailed(url: string): boolean {
    return this.failedUrls.has(url)
  }

  reset(): void {
    this.loadedUrls.clear()
    this.failedUrls.clear()
    this.inFlight.clear()
  }

  clearFailed(url: string): void {
    this.failedUrls.delete(url)
  }

  getStats(urls: string[]): PreloadProgress {
    let loaded = 0
    let failed = 0
    for (const url of urls) {
      if (this.loadedUrls.has(url)) loaded++
      else if (this.failedUrls.has(url)) failed++
    }
    return { loaded, failed, completed: loaded + failed, total: urls.length }
  }

  /** Load a single thumbnail. Deduplicates in-flight requests. */
  loadUrl(url: string): Promise<boolean> {
    if (this.loadedUrls.has(url)) return Promise.resolve(true)
    if (this.failedUrls.has(url)) return Promise.resolve(false)

    const existing = this.inFlight.get(url)
    if (existing) return existing

    const promise = new Promise<boolean>((resolve) => {
      const img = new Image()
      img.decoding = 'async'

      const finish = (ok: boolean) => {
        img.onload = null
        img.onerror = null
        if (ok) {
          this.loadedUrls.add(url)
          this.failedUrls.delete(url)
        } else {
          this.failedUrls.add(url)
        }
        resolve(ok)
      }

      img.onload = () => finish(true)
      img.onerror = () => finish(false)
      img.src = url
    })

    this.inFlight.set(url, promise)
    promise.finally(() => this.inFlight.delete(url))
    return promise
  }

  /**
   * Preload ALL album thumbnails with controlled concurrency.
   * Resolves when every URL has been attempted (success or failure).
   */
  async preloadAllThumbnails(
    urls: string[],
    onProgress?: (progress: PreloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreloadProgress> {
    const total = urls.length
    let loaded = 0
    let failed = 0
    let nextIndex = 0

    const report = () => {
      onProgress?.({ loaded, failed, completed: loaded + failed, total })
    }

    const worker = async () => {
      while (nextIndex < total) {
        if (signal?.aborted) return

        const index = nextIndex++
        const url = urls[index]
        const ok = await this.loadUrl(url)

        if (signal?.aborted) return

        if (ok) loaded++
        else failed++
        report()
      }
    }

    const poolSize = Math.min(IMAGE_LOAD_CONCURRENCY, total)
    await Promise.all(Array.from({ length: poolSize }, () => worker()))

    const result = { loaded, failed, completed: loaded + failed, total }
    report()
    return result
  }
}

export const imageLoadQueue = new ImageLoadQueue()

export function resetImageCache(): void {
  imageLoadQueue.reset()
}

export function preloadAllThumbnails(
  urls: string[],
  onProgress?: (progress: PreloadProgress) => void,
  signal?: AbortSignal,
): Promise<PreloadProgress> {
  return imageLoadQueue.preloadAllThumbnails(urls, onProgress, signal)
}
