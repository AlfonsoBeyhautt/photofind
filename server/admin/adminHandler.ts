import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAdmin } from './adminAuth'
import { fetchAdminMetrics } from './adminMetricsService'
import { fetchQualityMetrics } from './qualityMetricsService'
import { SupabaseConfigError } from '../supabase/client'
import {
  findAdminByEmail,
  insertAdminUser,
  listAdminUsers,
} from '../supabase/adminUserStore'
import { getSupabaseAdmin } from '../supabase/client'

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export async function handleAdminMetricsRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const user = await requireAdmin(req, res)
  if (!user) return

  try {
    const metrics = await fetchAdminMetrics()
    sendJson(res, 200, { ok: true, metrics })
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      sendJson(res, 503, {
        ok: false,
        error: { code: 'SUPABASE_NOT_CONFIGURED', message: err.message },
      })
      return
    }
    console.error('[PhotoFind:Admin] metrics_error', err instanceof Error ? err.message : err)
    sendJson(res, 500, {
      ok: false,
      error: { code: 'ADMIN_METRICS_FAILED', message: 'No pudimos cargar las métricas.' },
    })
  }
}

export async function handleAdminQualityMetricsRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const user = await requireAdmin(req, res)
  if (!user) return

  try {
    const metrics = await fetchQualityMetrics()
    sendJson(res, 200, { ok: true, metrics })
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      sendJson(res, 503, {
        ok: false,
        error: { code: 'SUPABASE_NOT_CONFIGURED', message: err.message },
      })
      return
    }
    console.error('[PhotoFind:Admin] quality_metrics_error', err instanceof Error ? err.message : err)
    sendJson(res, 500, {
      ok: false,
      error: { code: 'ADMIN_QUALITY_METRICS_FAILED', message: 'No pudimos cargar las métricas de calidad.' },
    })
  }
}

export async function handleAdminListAdminsRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const user = await requireAdmin(req, res)
  if (!user) return

  const admins = await listAdminUsers()
  sendJson(res, 200, {
    ok: true,
    admins: admins.map((a) => ({
      id: a.id,
      userId: a.user_id,
      email: a.email,
      grantedByUserId: a.granted_by_user_id,
      createdAt: a.created_at,
    })),
  })
}

interface AddAdminBody {
  email?: string
}

export async function handleAdminAddAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<void> {
  const user = await requireAdmin(req, res)
  if (!user) return

  let parsed: AddAdminBody
  try {
    parsed = JSON.parse(body) as AddAdminBody
  } catch {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Solicitud inválida.' },
    })
    return
  }

  const email = parsed.email?.trim().toLowerCase()
  if (!email) {
    sendJson(res, 400, {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Indicá un email.' },
    })
    return
  }

  const existing = await findAdminByEmail(email)
  if (existing) {
    sendJson(res, 409, {
      ok: false,
      error: { code: 'ADMIN_EXISTS', message: 'Ese usuario ya es administrador.' },
    })
    return
  }

  const client = getSupabaseAdmin()
  const { data: usersData, error: usersError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (usersError) {
    sendJson(res, 500, {
      ok: false,
      error: { code: 'ADMIN_LOOKUP_FAILED', message: 'No pudimos buscar el usuario.' },
    })
    return
  }

  const match = usersData.users.find((u) => u.email?.toLowerCase() === email)
  if (!match?.id) {
    sendJson(res, 404, {
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: 'No hay cuenta registrada con ese email.' },
    })
    return
  }

  const row = await insertAdminUser({
    userId: match.id,
    email,
    grantedByUserId: user.id,
    notes: 'granted via admin panel',
  })

  if (!row) {
    sendJson(res, 500, {
      ok: false,
      error: { code: 'ADMIN_GRANT_FAILED', message: 'No pudimos autorizar al administrador.' },
    })
    return
  }

  sendJson(res, 201, {
    ok: true,
    admin: {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      createdAt: row.created_at,
    },
  })
}
