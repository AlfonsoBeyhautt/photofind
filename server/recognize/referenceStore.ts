import { randomBytes } from 'node:crypto'
import type { DetectedFace, FaceBox, ReferenceQualityTier, ReferenceSource } from '../../src/types/recognition'
import type { FaceDetail } from './rekognitionClient'
import { REFERENCE_TTL_MS } from './config'

export interface StoredReference {
  token: string
  buffer: Buffer
  contentType: string
  source: ReferenceSource
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  createdAt: number
  expiresAt: number
}

export interface PendingDetection {
  token: string
  buffer: Buffer
  contentType: string
  source: ReferenceSource
  faces: DetectedFace[]
  /** Raw Rekognition details aligned by face index — avoids re-detect on select. */
  rawFaces: FaceDetail[]
  createdAt: number
  expiresAt: number
}

const store = new Map<string, StoredReference>()
const pendingStore = new Map<string, PendingDetection>()

export interface ReferenceSearchInput {
  buffer: Buffer
  referenceId?: string
  referenceType?: string
}

interface StoredReferenceBundle {
  token: string
  references: ReferenceSearchInput[]
  primaryIndex: number
  source: ReferenceSource
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
  createdAt: number
  expiresAt: number
}

const bundleStore = new Map<string, StoredReferenceBundle>()

function purgeExpired(): void {
  const now = Date.now()
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) store.delete(token)
  }
  for (const [token, entry] of pendingStore) {
    if (entry.expiresAt <= now) pendingStore.delete(token)
  }
  for (const [token, entry] of bundleStore) {
    if (entry.expiresAt <= now) bundleStore.delete(token)
  }
}

export function createReferenceToken(): string {
  return `rt_${randomBytes(16).toString('base64url')}`
}

export function createBundleToken(): string {
  return `rbt_${randomBytes(16).toString('base64url')}`
}

export function saveReferenceBundle(input: {
  references: ReferenceSearchInput[]
  primaryIndex?: number
  source: ReferenceSource
  faceBox: FaceBox
  confidence: number
  qualityTier: ReferenceQualityTier
  qualityWarning?: string
}): StoredReferenceBundle {
  purgeExpired()
  const now = Date.now()
  const primaryIndex = input.primaryIndex ?? 0
  const stored: StoredReferenceBundle = {
    token: createBundleToken(),
    references: input.references,
    primaryIndex,
    source: input.source,
    faceBox: input.faceBox,
    confidence: input.confidence,
    qualityTier: input.qualityTier,
    qualityWarning: input.qualityWarning,
    createdAt: now,
    expiresAt: now + REFERENCE_TTL_MS,
  }
  bundleStore.set(stored.token, stored)
  return stored
}

export function getReferenceBundle(token: string): StoredReferenceBundle | null {
  purgeExpired()
  const entry = bundleStore.get(token)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    bundleStore.delete(token)
    return null
  }
  return entry
}

/** Resolve token to one or more search buffers (single ref or advanced bundle). */
export function getReferencesForSearch(token: string): ReferenceSearchInput[] {
  const bundle = getReferenceBundle(token)
  if (bundle) return bundle.references

  const single = getReference(token)
  if (single) {
    return [{ buffer: single.buffer }]
  }

  return []
}

/** Metadata for bundle or single reference token (for client compatibility). */
export function getReferenceMeta(token: string): Pick<
  StoredReference,
  'faceBox' | 'confidence' | 'qualityTier' | 'qualityWarning' | 'source' | 'expiresAt'
> | null {
  const bundle = getReferenceBundle(token)
  if (bundle) {
    return {
      faceBox: bundle.faceBox,
      confidence: bundle.confidence,
      qualityTier: bundle.qualityTier,
      qualityWarning: bundle.qualityWarning,
      source: bundle.source,
      expiresAt: bundle.expiresAt,
    }
  }
  const single = getReference(token)
  if (!single) return null
  return {
    faceBox: single.faceBox,
    confidence: single.confidence,
    qualityTier: single.qualityTier,
    qualityWarning: single.qualityWarning,
    source: single.source,
    expiresAt: single.expiresAt,
  }
}

export function createDetectionToken(): string {
  return `dt_${randomBytes(16).toString('base64url')}`
}

export function saveReference(
  entry: Omit<StoredReference, 'token' | 'createdAt' | 'expiresAt'> & { token?: string },
): StoredReference {
  purgeExpired()
  const now = Date.now()
  const stored: StoredReference = {
    token: entry.token ?? createReferenceToken(),
    buffer: entry.buffer,
    contentType: entry.contentType,
    source: entry.source,
    faceBox: entry.faceBox,
    confidence: entry.confidence,
    qualityTier: entry.qualityTier,
    qualityWarning: entry.qualityWarning,
    createdAt: now,
    expiresAt: now + REFERENCE_TTL_MS,
  }
  store.set(stored.token, stored)
  return stored
}

export function savePendingDetection(
  entry: Omit<PendingDetection, 'token' | 'createdAt' | 'expiresAt'> & { token?: string },
): PendingDetection {
  purgeExpired()
  const now = Date.now()
  const stored: PendingDetection = {
    token: entry.token ?? createDetectionToken(),
    buffer: entry.buffer,
    contentType: entry.contentType,
    source: entry.source,
    faces: entry.faces,
    rawFaces: entry.rawFaces,
    createdAt: now,
    expiresAt: now + REFERENCE_TTL_MS,
  }
  pendingStore.set(stored.token, stored)
  return stored
}

export function getReference(token: string): StoredReference | null {
  purgeExpired()
  const entry = store.get(token)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    store.delete(token)
    return null
  }
  return entry
}

export function getPendingDetection(token: string): PendingDetection | null {
  purgeExpired()
  const entry = pendingStore.get(token)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    pendingStore.delete(token)
    return null
  }
  return entry
}

export function deleteReference(token: string): void {
  store.delete(token)
}

export function deletePendingDetection(token: string): void {
  pendingStore.delete(token)
}

/** Test helper */
export function clearReferenceStore(): void {
  store.clear()
  pendingStore.clear()
  bundleStore.clear()
}

/** @deprecated Use saveReferenceBundle for multi-reference profiles */
export function saveReferenceSet(_profileId: string, _references: StoredReference[]): void {
  throw new Error('Use saveReferenceBundle instead')
}
