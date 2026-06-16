/** Prevents duplicate album processing runs for the same search session. */
const activeKeys = new Set<string>()
const completedKeys = new Set<string>()

export function buildProcessingKey(provider: string, albumUrl: string, referenceToken: string): string {
  return `${provider}|${albumUrl.trim()}|${referenceToken}`
}

export function shouldStartProcessing(key: string): boolean {
  if (activeKeys.has(key) || completedKeys.has(key)) {
    return false
  }
  activeKeys.add(key)
  return true
}

export function markProcessingComplete(key: string): void {
  activeKeys.delete(key)
  completedKeys.add(key)
}

export function markProcessingFailed(key: string): void {
  activeKeys.delete(key)
}

export function resetProcessingKey(key: string): void {
  activeKeys.delete(key)
  completedKeys.delete(key)
}

export function resetAllProcessingRuns(): void {
  activeKeys.clear()
  completedKeys.clear()
}

export function isProcessingActive(key: string): boolean {
  return activeKeys.has(key)
}
