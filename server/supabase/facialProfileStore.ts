import type { FaceBox, ReferenceQualityTier, ReferenceSource } from '../../src/types/recognition'
import {
  FACIAL_PROFILES_BUCKET,
  facialProfileStoragePath,
} from './config'
import { getSupabaseAdmin } from './client'

export interface FacialProfileMeta {
  hasProfile: true
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  source: ReferenceSource
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
    updatedAt: row.updated_at,
  }
}

export async function getFacialProfile(userId: string): Promise<FacialProfileRow | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('facial_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:Supabase] getFacialProfile:', error.message)
    throw new Error('PROFILE_FETCH_FAILED')
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
  const supabase = getSupabaseAdmin()
  const storagePath = facialProfileStoragePath(userId)

  const { error: uploadError } = await supabase.storage
    .from(FACIAL_PROFILES_BUCKET)
    .upload(storagePath, data.buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (uploadError) {
    console.error('[PhotoFind:Supabase] upload:', uploadError.message)
    throw new Error('PROFILE_SAVE_FAILED')
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
    console.error('[PhotoFind:Supabase] upsert:', dbError?.message)
    throw new Error('PROFILE_SAVE_FAILED')
  }

  return rowToMeta(saved as FacialProfileRow)
}

export async function deleteFacialProfile(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
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

  const supabase = getSupabaseAdmin()
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
