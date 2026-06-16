const DEBUG = process.env.PHOTOFIND_PIXIESET_DEBUG !== '0'

export function pixiesetDebug(event: string, data: Record<string, unknown>): void {
  if (!DEBUG) return
  console.log(`[PhotoFind:Pixieset] ${event}`, data)
}

export function pixiesetDebugError(event: string, data: Record<string, unknown>): void {
  if (!DEBUG) return
  console.log(`[PhotoFind:Pixieset] ${event}`, data)
}
