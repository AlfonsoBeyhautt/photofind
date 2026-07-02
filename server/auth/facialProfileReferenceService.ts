import type { ReferenceSource } from '../../src/types/recognition'
import {
  normalizeReferenceBytes,
  selectReferenceFace,
  validateReferenceImage,
} from '../recognize/referenceService'
import {
  deleteAllFacialProfileReferences,
  deleteFacialProfileReference,
  ensureLegacyProfileMigrated,
  listActiveFacialProfileReferences,
  readFacialProfileReferenceImage,
  saveFacialProfileReference,
  syncPrimaryReferenceFromLegacyProfile,
  toReferencePublic,
  type FacialProfileReferencePublic,
  type FacialReferenceCaptureMethod,
  type FacialReferenceType,
} from '../supabase/facialProfileReferenceStore'
import {
  deleteFacialProfile,
  getFacialProfile,
  readFacialProfileImage,
  saveFacialProfile,
} from '../supabase/facialProfileStore'
import { saveReference, saveReferenceBundle } from '../recognize/referenceStore'
import type { SaveFacialProfileBody } from './facialProfileService'

export interface SaveFacialProfileReferenceBody {
  dataBase64?: string
  mimeType?: string
  source?: ReferenceSource
  detectionToken?: string
  faceIndex?: number
  referenceType?: FacialReferenceType
}

function captureMethodFromSource(source: ReferenceSource): FacialReferenceCaptureMethod {
  if (source === 'camera') return 'camera'
  return 'upload'
}

async function validatedReferenceToBuffer(
  body: SaveFacialProfileReferenceBody,
): Promise<
  | { ok: true; buffer: Buffer; faceBox: import('../../src/types/recognition').FaceBox; confidence: number; qualityTier: import('../../src/types/recognition').ReferenceQualityTier; qualityWarning?: string; source: ReferenceSource }
  | { ok: false; error: { code: string; message: string } }
  | { ok: true; needsSelection: true; detectionToken: string; faces: import('../../src/types/recognition').DetectedFace[]; expiresAt: string }
> {
  const { detectionToken, faceIndex, dataBase64, mimeType, source } = body

  if (detectionToken != null && typeof faceIndex === 'number') {
    const selected = await selectReferenceFace(detectionToken, faceIndex)
    if (!selected.ok) return { ok: false, error: selected.error }

    const { getReference } = await import('../recognize/referenceStore')
    const temp = getReference(selected.referenceToken)
    if (!temp) {
      return { ok: false, error: { code: 'PROFILE_SAVE_FAILED', message: 'No pudimos guardar la referencia.' } }
    }

    return {
      ok: true,
      buffer: temp.buffer,
      faceBox: selected.faceBox,
      confidence: selected.confidence,
      qualityTier: selected.qualityTier,
      qualityWarning: selected.qualityWarning,
      source: temp.source,
    }
  }

  if (!dataBase64 || !source || (source !== 'upload' && source !== 'camera' && source !== 'profile')) {
    return { ok: false, error: { code: 'PROFILE_INVALID_IMAGE', message: 'Falta la imagen de referencia.' } }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(dataBase64, 'base64')
    if (buffer.length === 0) throw new Error('empty')
  } catch {
    return { ok: false, error: { code: 'PROFILE_INVALID_IMAGE', message: 'No pudimos leer la imagen.' } }
  }

  const validated = await validateReferenceImage(buffer, source)
  if (!validated.ok) return { ok: false, error: validated.error }

  if (validated.needsSelection) {
    return {
      ok: true,
      needsSelection: true,
      detectionToken: validated.detectionToken,
      faces: validated.faces,
      expiresAt: validated.expiresAt,
    }
  }

  const normalized = await normalizeReferenceBytes(buffer, mimeType)
  return {
    ok: true,
    buffer: normalized.buffer,
    faceBox: validated.faceBox,
    confidence: validated.confidence,
    qualityTier: validated.qualityTier,
    qualityWarning: validated.qualityWarning,
    source,
  }
}

export async function listUserFacialProfileReferences(
  userId: string,
): Promise<{ references: FacialProfileReferencePublic[]; hasAdvancedProfile: boolean }> {
  const row = await getFacialProfile(userId)
  if (row) {
    const buffer = await readFacialProfileImage(userId)
    if (buffer) {
      await ensureLegacyProfileMigrated(userId, {
        buffer,
        faceBox: row.face_box,
        confidence: row.confidence,
        qualityTier: row.quality_tier,
        qualityWarning: row.quality_warning ?? undefined,
        captureMethod: captureMethodFromSource(row.source),
      })
    }
  }

  const refs = await listActiveFacialProfileReferences(userId)
  return {
    references: refs.map(toReferencePublic),
    hasAdvancedProfile: refs.length >= 2,
  }
}

export async function addUserFacialProfileReference(
  userId: string,
  body: SaveFacialProfileReferenceBody,
) {
  const profile = await getFacialProfile(userId)
  if (!profile) {
    return {
      ok: false as const,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Primero creá tu perfil facial básico.' },
    }
  }

  const validated = await validatedReferenceToBuffer(body)
  if (!validated.ok) {
    return validated
  }
  if ('needsSelection' in validated && validated.needsSelection) {
    return validated
  }

  const ready = validated as Extract<typeof validated, { buffer: Buffer }>
  const referenceType = body.referenceType ?? 'extra'
  const refs = await listActiveFacialProfileReferences(userId)
  const isPrimary = refs.length === 0

  try {
    const row = await saveFacialProfileReference(userId, {
      buffer: ready.buffer,
      referenceType: isPrimary ? 'primary' : referenceType,
      faceBox: ready.faceBox,
      confidence: ready.confidence,
      qualityTier: ready.qualityTier,
      qualityWarning: ready.qualityWarning,
      captureMethod: captureMethodFromSource(ready.source),
      isPrimary,
    })

    return { ok: true as const, reference: toReferencePublic(row) }
  } catch (err) {
    const code = err instanceof Error ? err.message : 'PROFILE_REFERENCE_SAVE_FAILED'
    const message = code === 'PROFILE_REFERENCES_LIMIT'
      ? 'Ya tenés el máximo de referencias guardadas. Borrá una para agregar otra.'
      : 'No pudimos guardar la referencia.'
    return { ok: false as const, error: { code, message } }
  }
}

export async function removeUserFacialProfileReference(userId: string, referenceId: string) {
  const refs = await listActiveFacialProfileReferences(userId)
  if (refs.length <= 1) {
    return {
      ok: false as const,
      error: {
        code: 'PROFILE_REFERENCE_LAST',
        message: 'No podés borrar tu única referencia. Usá "Reemplazar" en el perfil básico.',
      },
    }
  }

  const deleted = await deleteFacialProfileReference(userId, referenceId)
  if (!deleted) {
    return { ok: false as const, error: { code: 'PROFILE_REFERENCE_NOT_FOUND', message: 'No encontramos esa referencia.' } }
  }

  const updated = await listUserFacialProfileReferences(userId)
  return { ok: true as const, ...updated }
}

export async function syncPrimaryOnProfileSave(
  userId: string,
  data: Parameters<typeof saveFacialProfile>[1],
) {
  try {
    await syncPrimaryReferenceFromLegacyProfile(userId, {
      buffer: data.buffer,
      faceBox: data.faceBox,
      confidence: data.confidence,
      qualityTier: data.qualityTier,
      qualityWarning: data.qualityWarning,
      captureMethod: captureMethodFromSource(data.source),
    })
  } catch (err) {
    console.warn('[PhotoFind:Profile] primary_reference_sync_failed', err instanceof Error ? err.message : err)
  }
}

export async function removeAllUserFacialReferences(userId: string) {
  await deleteAllFacialProfileReferences(userId)
}

export type ProfileSearchMode = 'single' | 'advanced' | 'auto'

export async function buildProfileSearchToken(
  userId: string,
  mode: ProfileSearchMode = 'auto',
) {
  const row = await getFacialProfile(userId)
  if (!row) {
    return {
      ok: false as const,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Todavía no creaste tu perfil facial.' },
    }
  }

  const legacyBuffer = await readFacialProfileImage(userId)
  if (!legacyBuffer) {
    await deleteFacialProfile(userId)
    return {
      ok: false as const,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Tu perfil facial ya no está disponible.' },
    }
  }

  const refs = await ensureLegacyProfileMigrated(userId, {
    buffer: legacyBuffer,
    faceBox: row.face_box,
    confidence: row.confidence,
    qualityTier: row.quality_tier,
    qualityWarning: row.quality_warning ?? undefined,
    captureMethod: captureMethodFromSource(row.source),
  })

  const primary = refs.find((r) => r.is_primary) ?? refs[0]
  const useAdvanced = mode === 'advanced' || (mode === 'auto' && refs.length >= 2)

  if (!useAdvanced || refs.length <= 1) {
    const stored = saveReference({
      buffer: legacyBuffer,
      contentType: 'image/jpeg',
      source: 'profile',
      faceBox: row.face_box,
      confidence: row.confidence,
      qualityTier: row.quality_tier,
      qualityWarning: row.quality_warning ?? undefined,
    })

    return {
      ok: true as const,
      mode: 'single' as const,
      referenceToken: stored.token,
      referenceCount: 1,
      faceBox: stored.faceBox,
      confidence: stored.confidence,
      qualityTier: stored.qualityTier,
      qualityWarning: stored.qualityWarning,
      expiresAt: new Date(stored.expiresAt).toISOString(),
    }
  }

  const searchInputs = []
  for (const ref of refs) {
    const buffer = await readFacialProfileReferenceImage(ref.storage_path)
    if (!buffer) continue
    searchInputs.push({
      buffer,
      referenceId: ref.id,
      referenceType: ref.reference_type,
    })
  }

  if (searchInputs.length <= 1) {
    const stored = saveReference({
      buffer: legacyBuffer,
      contentType: 'image/jpeg',
      source: 'profile',
      faceBox: row.face_box,
      confidence: row.confidence,
      qualityTier: row.quality_tier,
      qualityWarning: row.quality_warning ?? undefined,
    })
    return {
      ok: true as const,
      mode: 'single' as const,
      referenceToken: stored.token,
      referenceCount: 1,
      faceBox: stored.faceBox,
      confidence: stored.confidence,
      qualityTier: stored.qualityTier,
      qualityWarning: stored.qualityWarning,
      expiresAt: new Date(stored.expiresAt).toISOString(),
    }
  }

  const primaryIndex = Math.max(0, refs.findIndex((r) => r.id === primary?.id))
  const bundle = saveReferenceBundle({
    references: searchInputs,
    primaryIndex,
    source: 'profile',
    faceBox: primary.face_box,
    confidence: primary.confidence,
    qualityTier: primary.quality_tier,
    qualityWarning: primary.quality_warning ?? undefined,
  })

  return {
    ok: true as const,
    mode: 'advanced' as const,
    referenceToken: bundle.token,
    referenceCount: searchInputs.length,
    faceBox: bundle.faceBox,
    confidence: bundle.confidence,
    qualityTier: bundle.qualityTier,
    qualityWarning: bundle.qualityWarning,
    expiresAt: new Date(bundle.expiresAt).toISOString(),
  }
}

export { type SaveFacialProfileBody }
