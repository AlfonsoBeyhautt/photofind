import type { FaceBox, ReferenceQualityTier, ReferenceSource } from '../../src/types/recognition'
import {
  FACIAL_PROFILES_BUCKET,
  facialProfileStoragePath,
} from './config'
import { tryGetSupabaseAdmin, SupabaseConfigError } from './client'

function logTableError(
  table: string,
  context: string,
  error: { message?: string; code?: string; details?: string; hint?: string },
): void {
  console.error(`[PhotoFind:Supabase] ${context}`, {
    table,
    code: error.code,
    message: error.message,
    hint: error.hint,
    details: error.details,
  })
}

function isMissingTableError(error: { message?: string; code?: string }): boolean {
  return (
    error.code === 'PGRST205'
    || error.code === '42P01'
    || Boolean(error.message?.includes('does not exist'))
    || Boolean(error.message?.includes('Could not find the table'))
  )
}

function requireAdmin() {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) {
    console.error('[PhotoFind:Server] supabase_init_error', admin.error)
    throw new SupabaseConfigError(admin.error)
  }
  return admin.client
}

export interface FacialProfileMeta {
  hasProfile: true
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  source: ReferenceSource
  createdAt: string
  updatedAt: string
}

interface FacialProfileRow {
  id: string
  user_id: string
  storage_path: string
  face_box: FaceBox
  confidence: number
  quality_tier: ReferenceQualityTier
  quality_warning: string | null
  source: ReferenceSource
  created_at: string
  updated_at: string
}

function rowToMeta(row: FacialProfileRow): FacialProfileMeta {
  return {
    hasProfile: true,
    faceBox: row.face_box,
    confidence: row.confidence,
    qualityTier: row.quality_tier,
    qualityWarning: row.quality_warning ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getFacialProfile(userId: string): Promise<FacialProfileRow | null> {
  const supabase = requireAdmin()
  const { data, error } = await supabase
    .from('facial_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logTableError('facial_profiles', 'getFacialProfile', error)
    if (isMissingTableError(error)) {
      throw new Error('TABLE_FACIAL_PROFILES_MISSING')
    }
    throw new Error(`PROFILE_FETCH_FAILED: ${error.message}`)
  }
  return data as FacialProfileRow | null
}

export async function getFacialProfileMeta(userId: string): Promise<FacialProfileMeta | { hasProfile: false }> {
  const row = await getFacialProfile(userId)
  if (!row) return { hasProfile: false }
  return rowToMeta(row)
}

export async function saveFacialProfile(
  userId: string,
  data: {
    buffer: Buffer
    source: ReferenceSource
    faceBox: FaceBox
    confidence: number
    qualityTier: ReferenceQualityTier
    qualityWarning?: string
  },
): Promise<FacialProfileMeta> {
  const supabase = requireAdmin()
  const storagePath = facialProfileStoragePath(userId)

  console.log('[PhotoFind:Supabase] profile_upload_start', { userId, storagePath, bytes: data.buffer.length })

  const { error: uploadError } = await supabase.storage
    .from(FACIAL_PROFILES_BUCKET)
    .upload(storagePath, data.buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (uploadError) {
    console.error('[PhotoFind:Supabase] profile_upload_error', uploadError.message)
    throw new Error('SUPABASE_STORAGE_FAILED')
  }

  const row = {
    user_id: userId,
    storage_path: storagePath,
    face_box: data.faceBox,
    confidence: data.confidence,
    quality_tier: data.qualityTier,
    quality_warning: data.qualityWarning ?? null,
    source: data.source,
  }

  const { data: saved, error: dbError } = await supabase
    .from('facial_profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (dbError || !saved) {
    logTableError('facial_profiles', 'profile_metadata_error', dbError ?? { message: 'no row returned' })
    if (dbError && isMissingTableError(dbError)) {
      throw new Error('TABLE_FACIAL_PROFILES_MISSING')
    }
    throw new Error('SUPABASE_PROFILE_METADATA_FAILED')
  }

  return rowToMeta(saved as FacialProfileRow)
}

export async function deleteFacialProfile(userId: string): Promise<boolean> {
  const supabase = requireAdmin()
  const existing = await getFacialProfile(userId)
  if (!existing) return false

  const { error: storageError } = await supabase.storage
    .from(FACIAL_PROFILES_BUCKET)
    .remove([existing.storage_path])

  if (storageError) {
    console.error('[PhotoFind:Supabase] storage delete:', storageError.message)
  }

  const { error: dbError } = await supabase
    .from('facial_profiles')
    .delete()
    .eq('user_id', userId)

  if (dbError) {
    console.error('[PhotoFind:Supabase] db delete:', dbError.message)
    throw new Error('PROFILE_DELETE_FAILED')
  }

  return true
}

export async function readFacialProfileImage(userId: string): Promise<Buffer | null> {
  const profile = await getFacialProfile(userId)
  if (!profile) return null

  const supabase = requireAdmin()
  const { data, error } = await supabase.storage
    .from(FACIAL_PROFILES_BUCKET)
    .download(profile.storage_path)

  if (error || !data) {
    console.error('[PhotoFind:Supabase] download:', error?.message)
    return null
  }

  return Buffer.from(await data.arrayBuffer())
}

export { rowToMeta as toFacialProfileMeta }
