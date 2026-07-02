import type { FaceBox, ReferenceQualityTier } from '../../src/types/recognition'
import {
  FACIAL_PROFILES_BUCKET,
  facialProfileReferenceStoragePath,
  MAX_FACIAL_PROFILE_REFERENCES,
} from './config'
import { tryGetSupabaseAdmin, SupabaseConfigError } from './client'

export type FacialReferenceType =
  | 'primary'
  | 'frontal'
  | 'left'
  | 'right'
  | 'smile'
  | 'lighting'
  | 'extra'

export type FacialReferenceCaptureMethod = 'upload' | 'camera' | 'video_frame'

export interface FacialProfileReferenceRow {
  id: string
  user_id: string
  reference_type: FacialReferenceType
  storage_path: string
  face_box: FaceBox
  confidence: number
  quality_tier: ReferenceQualityTier
  quality_warning: string | null
  capture_method: FacialReferenceCaptureMethod
  is_primary: boolean
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

export interface FacialProfileReferencePublic {
  id: string
  referenceType: FacialReferenceType
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  captureMethod: FacialReferenceCaptureMethod
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

function requireAdmin() {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) {
    throw new SupabaseConfigError(admin.error)
  }
  return admin.client
}

function isMissingTableError(error: { message?: string; code?: string }): boolean {
  return (
    error.code === 'PGRST205'
    || error.code === '42P01'
    || Boolean(error.message?.includes('does not exist'))
    || Boolean(error.message?.includes('Could not find the table'))
  )
}

export function toReferencePublic(row: FacialProfileReferenceRow): FacialProfileReferencePublic {
  return {
    id: row.id,
    referenceType: row.reference_type,
    confidence: row.confidence,
    qualityTier: row.quality_tier,
    qualityWarning: row.quality_warning ?? undefined,
    captureMethod: row.capture_method,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listActiveFacialProfileReferences(
  userId: string,
): Promise<FacialProfileReferenceRow[]> {
  const supabase = requireAdmin()
  const { data, error } = await supabase
    .from('facial_profile_references')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error)) return []
    console.error('[PhotoFind:Supabase] list_profile_references', error.message)
    throw new Error('PROFILE_REFERENCES_FETCH_FAILED')
  }

  return (data ?? []) as FacialProfileReferenceRow[]
}

export async function getFacialProfileReferenceById(
  userId: string,
  referenceId: string,
): Promise<FacialProfileReferenceRow | null> {
  const supabase = requireAdmin()
  const { data, error } = await supabase
    .from('facial_profile_references')
    .select('*')
    .eq('user_id', userId)
    .eq('id', referenceId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return null
    throw new Error('PROFILE_REFERENCE_FETCH_FAILED')
  }

  return data as FacialProfileReferenceRow | null
}

export async function countActiveFacialProfileReferences(userId: string): Promise<number> {
  const refs = await listActiveFacialProfileReferences(userId)
  return refs.length
}

export async function readFacialProfileReferenceImage(
  storagePath: string,
): Promise<Buffer | null> {
  const supabase = requireAdmin()
  const { data, error } = await supabase.storage
    .from(FACIAL_PROFILES_BUCKET)
    .download(storagePath)

  if (error || !data) {
    console.error('[PhotoFind:Supabase] reference_download', error?.message)
    return null
  }

  return Buffer.from(await data.arrayBuffer())
}

export async function saveFacialProfileReference(
  userId: string,
  input: {
    buffer: Buffer
    referenceType: FacialReferenceType
    faceBox: FaceBox
    confidence: number
    qualityTier: ReferenceQualityTier
    qualityWarning?: string
    captureMethod: FacialReferenceCaptureMethod
    isPrimary?: boolean
  },
): Promise<FacialProfileReferenceRow> {
  const activeCount = await countActiveFacialProfileReferences(userId)
  if (activeCount >= MAX_FACIAL_PROFILE_REFERENCES) {
    throw new Error('PROFILE_REFERENCES_LIMIT')
  }

  const supabase = requireAdmin()
  const referenceId = crypto.randomUUID()
  const storagePath = facialProfileReferenceStoragePath(userId, referenceId)
  const makePrimary = input.isPrimary ?? false

  const { error: uploadError } = await supabase.storage
    .from(FACIAL_PROFILES_BUCKET)
    .upload(storagePath, input.buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (uploadError) {
    throw new Error('SUPABASE_STORAGE_FAILED')
  }

  if (makePrimary) {
    await supabase
      .from('facial_profile_references')
      .update({ is_primary: false })
      .eq('user_id', userId)
      .eq('status', 'active')
  }

  const { data, error } = await supabase
    .from('facial_profile_references')
    .insert({
      id: referenceId,
      user_id: userId,
      reference_type: input.referenceType,
      storage_path: storagePath,
      face_box: input.faceBox,
      confidence: input.confidence,
      quality_tier: input.qualityTier,
      quality_warning: input.qualityWarning ?? null,
      capture_method: input.captureMethod,
      is_primary: makePrimary,
      status: 'active',
    })
    .select('*')
    .single()

  if (error || !data) {
    if (isMissingTableError(error ?? {})) {
      throw new Error('TABLE_FACIAL_PROFILE_REFERENCES_MISSING')
    }
    throw new Error('PROFILE_REFERENCE_SAVE_FAILED')
  }

  return data as FacialProfileReferenceRow
}

export async function deleteFacialProfileReference(
  userId: string,
  referenceId: string,
): Promise<boolean> {
  const row = await getFacialProfileReferenceById(userId, referenceId)
  if (!row) return false

  const supabase = requireAdmin()

  await supabase.storage.from(FACIAL_PROFILES_BUCKET).remove([row.storage_path])

  const { error } = await supabase
    .from('facial_profile_references')
    .delete()
    .eq('user_id', userId)
    .eq('id', referenceId)

  if (error) {
    throw new Error('PROFILE_REFERENCE_DELETE_FAILED')
  }

  if (row.is_primary) {
    const remaining = await listActiveFacialProfileReferences(userId)
    if (remaining.length > 0) {
      await supabase
        .from('facial_profile_references')
        .update({ is_primary: true, reference_type: 'primary' })
        .eq('id', remaining[0].id)
    }
  }

  return true
}

export async function deleteAllFacialProfileReferences(userId: string): Promise<void> {
  const refs = await listActiveFacialProfileReferences(userId)
  if (refs.length === 0) return

  const supabase = requireAdmin()
  const paths = refs.map((r) => r.storage_path)

  if (paths.length > 0) {
    await supabase.storage.from(FACIAL_PROFILES_BUCKET).remove(paths)
  }

  await supabase
    .from('facial_profile_references')
    .delete()
    .eq('user_id', userId)
}

export async function syncPrimaryReferenceFromLegacyProfile(
  userId: string,
  input: {
    buffer: Buffer
    faceBox: FaceBox
    confidence: number
    qualityTier: ReferenceQualityTier
    qualityWarning?: string
    captureMethod: FacialReferenceCaptureMethod
  },
): Promise<FacialProfileReferenceRow | null> {
  const existing = await listActiveFacialProfileReferences(userId)
  const primary = existing.find((r) => r.is_primary)
  if (primary) {
    const supabase = requireAdmin()
    await supabase.storage
      .from(FACIAL_PROFILES_BUCKET)
      .upload(primary.storage_path, input.buffer, { contentType: 'image/jpeg', upsert: true })
    const { data } = await supabase
      .from('facial_profile_references')
      .update({
        face_box: input.faceBox,
        confidence: input.confidence,
        quality_tier: input.qualityTier,
        quality_warning: input.qualityWarning ?? null,
        capture_method: input.captureMethod,
      })
      .eq('id', primary.id)
      .select('*')
      .single()
    return data as FacialProfileReferenceRow | null
  }

  return saveFacialProfileReference(userId, {
    ...input,
    referenceType: 'primary',
    isPrimary: true,
  })
}

export async function ensureLegacyProfileMigrated(
  userId: string,
  legacy: {
    buffer: Buffer
    faceBox: FaceBox
    confidence: number
    qualityTier: ReferenceQualityTier
    qualityWarning?: string
    captureMethod: FacialReferenceCaptureMethod
  },
): Promise<FacialProfileReferenceRow[]> {
  const existing = await listActiveFacialProfileReferences(userId)
  if (existing.length > 0) return existing

  await syncPrimaryReferenceFromLegacyProfile(userId, legacy)
  return listActiveFacialProfileReferences(userId)
}
