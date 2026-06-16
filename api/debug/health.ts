import type { IncomingMessage, ServerResponse } from 'node:http'
import { logStartupConfig } from '../server/config/serverHealth.js'
import { handleHealthRequest } from '../server/debug/healthHandler.js'

logStartupConfig()

function parseDeep(url: string | undefined): boolean {
  if (!url) return false
  try {
    const q = new URL(url, 'http://localhost').searchParams.get('deep')
    return q === '1' || q === 'true'
  } catch {
    return false
  }
}

/** Standalone health check — does not load Express/sharp/rekognition. */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleHealthRequest(req, res, { deep: parseDeep(req.url) })
}
