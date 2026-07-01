/**
 * Simple worker-pool concurrency limiter.
 * Each worker pulls the next index until all items are processed.
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return

  const limit = Math.max(1, Math.min(concurrency, items.length))
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()))
}

export async function runPoolMap<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  await runPool(items, concurrency, async (item, index) => {
    results[index] = await worker(item, index)
  })
  return results
}
