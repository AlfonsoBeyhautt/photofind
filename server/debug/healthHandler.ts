import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getConfigStatus,
  testAwsInit,
  testSharpLoad,
  testSupabaseInit,
  type ServerHealthStatus,
} from '../config/serverHealth'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

export async function handleHealthRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  options?: { deep?: boolean },
): Promise<void> {
  const base = getConfigStatus()
  const body: ServerHealthStatus = { ...base }

  if (options?.deep) {
    const supabase = await testSupabaseInit()
    body.supabaseInitOk = supabase.ok
    if (!supabase.ok) body.supabaseInitError = supabase.error

    const aws = await testAwsInit()
    body.awsInitOk = aws.ok
    if (!aws.ok) body.awsInitError = aws.error

    const sharp = await testSharpLoad()
    body.sharpLoadOk = sharp.ok
    if (!sharp.ok) body.sharpLoadError = sharp.error
  }

  sendJson(res, 200, body)
}
