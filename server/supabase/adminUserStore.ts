import { tryGetSupabaseAdmin } from './client'

export interface AdminUserRow {
  id: string
  user_id: string
  email: string
  granted_by_user_id: string | null
  notes: string | null
  created_at: string
}

function requireAdminClient() {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null
  return admin.client
}

export function isAdminStoreAvailable(): boolean {
  return requireAdminClient() != null
}

export async function findAdminByUserId(userId: string): Promise<AdminUserRow | null> {
  const client = requireAdminClient()
  if (!client) return null

  const { data, error } = await client
    .from('admin_users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') {
      console.error('[PhotoFind:Admin] admin_users table missing — run migration 007')
      return null
    }
    console.error('[PhotoFind:Admin] find_by_user', error.message)
    return null
  }

  return data as AdminUserRow | null
}

export async function findAdminByEmail(email: string): Promise<AdminUserRow | null> {
  const client = requireAdminClient()
  if (!client) return null

  const normalized = email.trim().toLowerCase()
  const { data, error } = await client
    .from('admin_users')
    .select('*')
    .ilike('email', normalized)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Admin] find_by_email', error.message)
    return null
  }

  return data as AdminUserRow | null
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const client = requireAdminClient()
  if (!client) return []

  const { data, error } = await client
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[PhotoFind:Admin] list_admins', error.message)
    return []
  }

  return (data ?? []) as AdminUserRow[]
}

export async function countAdminUsers(): Promise<number> {
  const client = requireAdminClient()
  if (!client) return 0

  const { count, error } = await client
    .from('admin_users')
    .select('*', { count: 'exact', head: true })

  if (error) return 0
  return count ?? 0
}

export async function insertAdminUser(input: {
  userId: string
  email: string
  grantedByUserId?: string | null
  notes?: string | null
}): Promise<AdminUserRow | null> {
  const client = requireAdminClient()
  if (!client) return null

  const { data, error } = await client
    .from('admin_users')
    .insert({
      user_id: input.userId,
      email: input.email.trim().toLowerCase(),
      granted_by_user_id: input.grantedByUserId ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:Admin] insert_admin', error.message)
    return null
  }

  return data as AdminUserRow
}

/** If admin_users is empty, grant bootstrap email from env (one-time). */
export async function ensureBootstrapAdmin(): Promise<void> {
  const bootstrapEmail = process.env.PHOTOFIND_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!bootstrapEmail) return

  const count = await countAdminUsers()
  if (count > 0) return

  const client = requireAdminClient()
  if (!client) return

  const { data: usersData, error: usersError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (usersError) {
    console.error('[PhotoFind:Admin] bootstrap_list_users', usersError.message)
    return
  }

  const match = usersData.users.find((u) => u.email?.toLowerCase() === bootstrapEmail)
  if (!match?.id || !match.email) {
    console.warn('[PhotoFind:Admin] bootstrap_email_not_found', { email: bootstrapEmail })
    return
  }

  const row = await insertAdminUser({
    userId: match.id,
    email: match.email,
    notes: 'bootstrap via PHOTOFIND_BOOTSTRAP_ADMIN_EMAIL',
  })

  if (row) {
    console.log('[PhotoFind:Admin] bootstrap_admin_created', { email: match.email })
  }
}
