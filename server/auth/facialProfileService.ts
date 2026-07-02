import type { ReferenceSource } from '../../src/types/recognition'
import {
  normalizeReferenceBytes,
  selectReferenceFace,
  validateReferenceImage,
} from '../recognize/referenceService'
import {
  deleteFacialProfile,
  getFacialProfile,
  saveFacialProfile,
} from '../supabase/facialProfileStore'
import { countActiveFacialProfileReferences } from '../supabase/facialProfileReferenceStore'
import {
  buildProfileSearchToken,
  removeAllUserFacialReferences,
  syncPrimaryOnProfileSave,
  type ProfileSearchMode,
} from './facialProfileReferenceService'

/**
 * Facial profile storage — Supabase (private Storage + Postgres with RLS).
 *
 * Privacy:
 * - ONE normalized JPEG per user in bucket `facial-profiles` at `{user_id}/profile.jpg`
 * - Metadata in `public.facial_profiles` (face_box, quality, etc.)
 * - Backend uses service role after JWT verification; RLS protects direct client access
 * - Delete profile removes Storage object + DB row; account delete cascades via FK
 */

export interface SaveFacialProfileBody {
  dataBase64?: string
  mimeType?: string
  source?: ReferenceSource
  detectionToken?: string
  faceIndex?: number
}

export async function saveUserFacialProfile(userId: string, body: SaveFacialProfileBody) {
  const { detectionToken, faceIndex, dataBase64, mimeType, source } = body

  if (detectionToken != null && typeof faceIndex === 'number') {
    const selected = await selectReferenceFace(detectionToken, faceIndex)
    if (!selected.ok) {
      return { ok: false as const, error: selected.error }
    }

    const { getReference } = await import('../recognize/referenceStore')
    const temp = getReference(selected.referenceToken)
    if (!temp) {
      return {
        ok: false as const,
        error: { code: 'PROFILE_SAVE_FAILED', message: 'No pudimos guardar el perfil facial.' },
      }
    }

    try {
      const profile = await saveFacialProfile(userId, {
        buffer: temp.buffer,
        source: temp.source,
        faceBox: selected.faceBox,
        confidence: selected.confidence,
        qualityTier: selected.qualityTier,
        qualityWarning: selected.qualityWarning,
      })
      await syncPrimaryOnProfileSave(userId, {
        buffer: temp.buffer,
        source: temp.source,
        faceBox: selected.faceBox,
        confidence: selected.confidence,
        qualityTier: selected.qualityTier,
        qualityWarning: selected.qualityWarning,
      })
      return { ok: true as const, profile }
    } catch (err) {
      const code = err instanceof Error ? err.message : 'PROFILE_SAVE_FAILED'
      return {
        ok: false as const,
        error: {
          code,
          message: code === 'SUPABASE_STORAGE_FAILED'
            ? 'No pudimos guardar la foto en Supabase Storage.'
            : code === 'SUPABASE_PROFILE_METADATA_FAILED'
              ? 'No pudimos guardar los datos del perfil facial.'
              : 'No pudimos guardar el perfil facial.',
        },
      }
    }
  }

  if (!dataBase64 || !source || (source !== 'upload' && source !== 'camera' && source !== 'profile')) {
    return {
      ok: false as const,
      error: { code: 'PROFILE_INVALID_IMAGE', message: 'Falta la imagen de referencia.' },
    }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(dataBase64, 'base64')
    if (buffer.length === 0) throw new Error('empty')
  } catch {
    return {
      ok: false as const,
      error: { code: 'PROFILE_INVALID_IMAGE', message: 'No pudimos leer la imagen.' },
    }
  }

  const validated = await validateReferenceImage(buffer, source)
  if (!validated.ok) {
    return { ok: false as const, error: validated.error }
  }

  if (validated.needsSelection) {
    return {
      ok: true as const,
      needsSelection: true as const,
      detectionToken: validated.detectionToken,
      faces: validated.faces,
      expiresAt: validated.expiresAt,
    }
  }

  let normalized: { buffer: Buffer; contentType: string }
  try {
    normalized = await normalizeReferenceBytes(buffer, mimeType)
  } catch {
    return {
      ok: false as const,
      error: { code: 'IMAGE_NORMALIZATION_FAILED', message: 'No pudimos procesar la imagen.' },
    }
  }

  try {
    const profile = await saveFacialProfile(userId, {
      buffer: normalized.buffer,
      source,
      faceBox: validated.faceBox,
      confidence: validated.confidence,
      qualityTier: validated.qualityTier,
      qualityWarning: validated.qualityWarning,
    })
    await syncPrimaryOnProfileSave(userId, {
      buffer: normalized.buffer,
      source,
      faceBox: validated.faceBox,
      confidence: validated.confidence,
      qualityTier: validated.qualityTier,
      qualityWarning: validated.qualityWarning,
    })
    return { ok: true as const, profile }
  } catch (err) {
    const code = err instanceof Error ? err.message : 'PROFILE_SAVE_FAILED'
    return {
      ok: false as const,
      error: {
        code,
        message: code === 'SUPABASE_STORAGE_FAILED'
          ? 'No pudimos guardar la foto en Supabase Storage.'
          : code === 'SUPABASE_PROFILE_METADATA_FAILED'
            ? 'No pudimos guardar los datos del perfil facial.'
            : 'No pudimos guardar el perfil facial.',
      },
    }
  }
}

export async function getUserFacialProfileMeta(userId: string) {
  const row = await getFacialProfile(userId)
  if (!row) return { hasProfile: false as const }

  const referenceCount = await countActiveFacialProfileReferences(userId)
  const effectiveCount = referenceCount > 0 ? referenceCount : 1

  return {
    hasProfile: true as const,
    faceBox: row.face_box,
    confidence: row.confidence,
    qualityTier: row.quality_tier,
    qualityWarning: row.quality_warning ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    referenceCount: effectiveCount,
    hasAdvancedProfile: effectiveCount >= 2,
  }
}

export async function removeUserFacialProfile(userId: string): Promise<boolean> {
  await removeAllUserFacialReferences(userId)
  return deleteFacialProfile(userId)
}

/** Fresh short-lived referenceToken for album search (15 min TTL in referenceStore). */
export async function useFacialProfileForSearch(userId: string, mode: ProfileSearchMode = 'auto') {
  return buildProfileSearchToken(userId, mode)
}
