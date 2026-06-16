/** Vercel health — zero imports from /server (standalone serverless function). */

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function readQuery(
  req: { query?: Record<string, string | string[] | undefined>; url?: string },
  key: string,
): string | undefined {
  const direct = req.query?.[key]
  if (typeof direct === 'string') return direct
  if (Array.isArray(direct)) return direct[0]
  if (req.url) {
    try {
      return new URL(req.url, 'http://localhost').searchParams.get(key) ?? undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function logStartup(): void {
  console.log('[Startup] SUPABASE_URL present=%s', envPresent('SUPABASE_URL'))
  console.log('[Startup] VITE_SUPABASE_URL present=%s', envPresent('VITE_SUPABASE_URL'))
  console.log('[Startup] SUPABASE_SERVICE_ROLE_KEY present=%s', envPresent('SUPABASE_SERVICE_ROLE_KEY'))
  console.log('[Startup] AWS_ACCESS_KEY_ID present=%s', envPresent('AWS_ACCESS_KEY_ID'))
  console.log('[Startup] AWS_SECRET_ACCESS_KEY present=%s', envPresent('AWS_SECRET_ACCESS_KEY'))
  console.log('[Startup] AWS_REGION present=%s', envPresent('AWS_REGION'))
}

type VercelRes = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => { json: (body: unknown) => void }
}

export default async function handler(
  req: { query?: Record<string, string | string[] | undefined>; url?: string },
  res: VercelRes,
): Promise<void> {
  logStartup()

  const deep = readQuery(req, 'deep') === '1' || readQuery(req, 'deep') === 'true'

  const body: Record<string, unknown> = {
    ok: true,
    runtime: 'vercel',
    timestamp: new Date().toISOString(),
    supabaseUrlConfigured: envPresent('SUPABASE_URL') || envPresent('VITE_SUPABASE_URL'),
    supabaseServiceRoleConfigured: envPresent('SUPABASE_SERVICE_ROLE_KEY'),
    awsAccessKeyConfigured: envPresent('AWS_ACCESS_KEY_ID'),
    awsSecretConfigured: envPresent('AWS_SECRET_ACCESS_KEY'),
    awsRegionConfigured: envPresent('AWS_REGION'),
  }

  if (deep) {
    try {
      const sharp = (await import('sharp')).default
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).jpeg().toBuffer()
      body.sharpLoadOk = true
      console.log('[PhotoFind:Server] sharp_load_ok')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      body.sharpLoadOk = false
      body.sharpLoadError = message
      console.error('[PhotoFind:Server] sharp_load_error', message)
    }
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json(body)
}
