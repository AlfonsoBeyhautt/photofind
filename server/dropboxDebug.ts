const DEBUG = process.env.PHOTOFIND_DROPBOX_DEBUG !== '0'

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const rlkey = parsed.searchParams.get('rlkey')
    return JSON.stringify({
      host: parsed.host,
      pathname: parsed.pathname,
      hasRlkey: Boolean(rlkey),
      rlkeyLength: rlkey?.length ?? 0,
      queryKeys: [...parsed.searchParams.keys()],
    })
  } catch {
    return `"${url.slice(0, 80)}..."`
  }
}

export function dropboxDebug(event: string, data: Record<string, unknown>): void {
  if (!DEBUG) return

  const safe = { ...data }
  if (typeof safe.sharedUrl === 'string') safe.sharedUrl = redactUrl(safe.sharedUrl)
  if (typeof safe.receivedUrl === 'string') safe.receivedUrl = redactUrl(safe.receivedUrl)
  if (typeof safe.normalizedUrl === 'string') safe.normalizedUrl = redactUrl(safe.normalizedUrl)

  console.log(`[PhotoFind:Dropbox] ${event}`, safe)
}

export function dropboxDebugError(
  event: string,
  data: Record<string, unknown> & {
    endpoint?: string
    status?: number
    errorSummary?: string
    tag?: string
    rawBody?: string
  },
): void {
  if (!DEBUG) return

  const { rawBody, ...rest } = data
  dropboxDebug(event, {
    ...rest,
    rawBodyPreview: typeof rawBody === 'string' ? rawBody.slice(0, 500) : undefined,
  })
}
