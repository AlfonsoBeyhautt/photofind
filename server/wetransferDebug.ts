const DEBUG = process.env.PHOTOFIND_WETRANSFER_DEBUG !== '0'

export function wetransferDebug(event: string, data: Record<string, unknown>): void {
  if (!DEBUG) return
  console.log(`[PhotoFind:WeTransfer] ${event}`, data)
}

export function wetransferDebugError(event: string, data: Record<string, unknown>): void {
  if (!DEBUG) return
  console.log(`[PhotoFind:WeTransfer] ${event}`, data)
}
