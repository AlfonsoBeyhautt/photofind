import { ensureBootstrapAdmin, findAdminByUserId } from '../supabase/adminUserStore'

/** Campo opcional en respuestas auth — solo presente para administradores autorizados. */
export async function getOperatorAccessForUser(
  userId: string,
): Promise<{ operatorAccess: true } | Record<string, never>> {
  await ensureBootstrapAdmin()
  const row = await findAdminByUserId(userId)
  return row ? { operatorAccess: true } : {}
}
