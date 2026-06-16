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

function purgeExpired(): void {
  const now = Date.now()
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) store.delete(token)
  }
  for (const [token, entry] of pendingStore) {
    if (entry.expiresAt <= now) pendingStore.delete(token)
  }
}

export function createReferenceToken(): string {
  return `rt_${randomBytes(16).toString('base64url')}`
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
}

/** Future: multiple references per guided profile — see FUTURE.md */
export function saveReferenceSet(_profileId: string, _references: StoredReference[]): void {
  throw new Error('Not implemented — guided facial profile (FUTURE.md)')
}
