import type { BoundingBox } from '@aws-sdk/client-rekognition'
import {
  awsBoundingBoxToFaceBox,
  hasMinimumFaceBox,
  scoreFaceForAvatar,
} from './facePortraitCrop'
import {
  PERSON_GROUPING_ALGORITHM_VERSION,
  PERSON_GROUPING_MAX_FACE_MATCHES,
  PERSON_GROUPING_LOW_CONFIDENCE_QUALITY_SCORE,
  PERSON_GROUPING_MERGE_HIGH_CONFIDENCE,
  PERSON_GROUPING_MERGE_MAX_SEARCHES,
  PERSON_GROUPING_MERGE_REPRESENTATIVES,
  PERSON_GROUPING_MERGE_SIMILARITY_THRESHOLD,
  PERSON_GROUPING_MIN_PHOTOS,
  PERSON_GROUPING_MIN_SEED_BBOX_AREA,
  PERSON_GROUPING_MIN_SEED_CONFIDENCE,
  PERSON_GROUPING_SEARCH_BATCH_SIZE,
  SIMILARITY_THRESHOLD,
} from './config'
import { canUseRekognition, searchFaces } from './rekognitionClient'
import {
  findAlbumCollectionByUrlHash,
  getAlbumCollectionById,
  hashAlbumUrl,
  type AlbumCollectionRow,
} from '../supabase/albumCollectionStore'
import {
  createPersonGrouping,
  deletePersonGroupArtifacts,
  findPersonGroupingAccess,
  findPersonGroupingByVersion,
  getPersonGroupById,
  insertPersonGroups,
  isPersonGroupingStoreAvailable,
  listIndexedFacesForGrouping,
  listPersonGroupFaceMembers,
  listPersonGroupImageIds,
  listDisplayPersonGroups,
  listUngroupedFacesForGrouping,
  type ClusterState,
  type ClusterStateFace,
  type ClusteringStatsPayload,
  type IndexedFaceForGrouping,
  type PersonGroupRow,
  type PersonGroupingRow,
  updatePersonGrouping,
  upsertPersonGroupingAccess,
} from '../supabase/personGroupingStore'
import { recordGroupingQualitySnapshot } from '../telemetry/qualityTelemetryService'

export type PersonGroupingErrorCode =
  | 'PERSON_GROUPING_DISABLED'
  | 'PERSON_GROUPING_FORBIDDEN'
  | 'PERSON_GROUPING_NOT_READY'
  | 'PERSON_GROUPING_NO_FACES'
  | 'PERSON_GROUPING_FAILED'
  | 'PERSON_GROUPING_NOT_FOUND'
  | 'AWS_CREDENTIALS_MISSING'
  | 'RECOGNITION_COLLECTION_METADATA_ERROR'

const MESSAGES: Record<PersonGroupingErrorCode, string> = {
  PERSON_GROUPING_DISABLED: 'La agrupación por personas no está habilitada.',
  PERSON_GROUPING_FORBIDDEN: 'No tenés acceso a esta función premium.',
  PERSON_GROUPING_NOT_READY: 'El álbum todavía no terminó de indexarse.',
  PERSON_GROUPING_NO_FACES: 'No hay caras indexadas para agrupar en este álbum.',
  PERSON_GROUPING_FAILED: 'No pudimos agrupar las personas del álbum.',
  PERSON_GROUPING_NOT_FOUND: 'No encontramos ese grupo.',
  AWS_CREDENTIALS_MISSING: 'El reconocimiento facial no está configurado.',
  RECOGNITION_COLLECTION_METADATA_ERROR: 'No pudimos acceder a los datos del álbum.',
}

function fail(code: PersonGroupingErrorCode, message?: string) {
  return { ok: false as const, error: { code, message: message ?? MESSAGES[code] } }
}

export function isPersonGroupingFeatureEnabled(): boolean {
  return process.env.ENABLE_PERSON_GROUPING === 'true'
    || process.env.ENABLE_PERSON_GROUPING === '1'
}

function devGrantMode(): 'off' | 'user_premium' | 'photographer_license' {
  const mode = process.env.PERSON_GROUPING_DEV_GRANT_MODE?.trim()
  if (mode === 'user_premium' || mode === 'photographer_license') return mode
  return 'off'
}

function bboxArea(box: BoundingBox | null): number {
  if (!box?.Width || !box?.Height) return 0
  return box.Width * box.Height
}

function rankFacesForAvatar(
  faces: ClusterStateFace[],
  bboxByFace: Map<string, BoundingBox | null | undefined>,
  confidenceByFace: Map<string, number | null | undefined>,
  limit = 12,
): { imageId: string; faceId: string; crop: BoundingBox | null; score: number }[] {
  const ranked = faces
    .map((face) => {
      const bbox = bboxByFace.get(face.faceId)
      const box = awsBoundingBoxToFaceBox(bbox)
      const confidence = confidenceByFace.get(face.faceId) ?? face.confidence ?? 50
      const score = box && hasMinimumFaceBox(box)
        ? scoreFaceForAvatar(box, confidence)
        : (face.confidence ?? 0) * Math.max(face.bboxArea, 0.001) * 0.5
      return {
        imageId: face.imageId,
        faceId: face.faceId,
        crop: bbox ?? null,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)

  const seen = new Set<string>()
  const unique: typeof ranked = []
  for (const item of ranked) {
    const key = `${item.imageId}:${item.faceId}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
    if (unique.length >= limit) break
  }
  return unique
}

function pickBestRepresentativeFace(
  faces: ClusterStateFace[],
  bboxByFace: Map<string, BoundingBox | null | undefined>,
  confidenceByFace: Map<string, number | null | undefined>,
): { imageId: string; faceId: string; crop: BoundingBox | null } {
  const ranked = rankFacesForAvatar(faces, bboxByFace, confidenceByFace)
  if (ranked.length === 0) {
    const fallback = faces[0]
    return {
      imageId: fallback?.imageId ?? '',
      faceId: fallback?.faceId ?? '',
      crop: bboxByFace.get(fallback?.faceId ?? '') ?? null,
    }
  }
  const best = ranked[0]
  return { imageId: best.imageId, faceId: best.faceId, crop: best.crop }
}

function isSeedEligible(face: IndexedFaceForGrouping): boolean {
  const conf = face.confidence ?? 0
  const area = bboxArea(face.bounding_box)
  if (conf < PERSON_GROUPING_MIN_SEED_CONFIDENCE) return false
  if (area < PERSON_GROUPING_MIN_SEED_BBOX_AREA) return false
  const box = awsBoundingBoxToFaceBox(face.bounding_box)
  if (box && !hasMinimumFaceBox(box)) return false
  return true
}

function buildClusterState(faces: IndexedFaceForGrouping[]): ClusterState {
  const sorted = [...faces]
    .map((face) => ({
      faceId: face.face_id,
      imageId: face.image_id,
      imageName: face.image_name ?? face.image_id,
      confidence: face.confidence,
      bboxArea: bboxArea(face.bounding_box),
      parent: face.face_id,
      seedEligible: isSeedEligible(face),
    }))
    .sort((a, b) => {
      const scoreA = (a.confidence ?? 0) * Math.max(a.bboxArea, 0.001)
      const scoreB = (b.confidence ?? 0) * Math.max(b.bboxArea, 0.001)
      return scoreB - scoreA
    })

  const seedQueue = sorted.filter((f) => f.seedEligible).map((f) => f.faceId)
  const facesDiscardedLowQuality = sorted.length - seedQueue.length

  return {
    faces: sorted,
    nextSeedIndex: 0,
    phase: 'clustering',
    seedQueue,
    mergeQueue: [],
    nextMergeIndex: 0,
    representativeFaceIds: [],
    runtimeStats: {
      facesEligibleAsSeeds: seedQueue.length,
      facesDiscardedLowQuality,
      groupsMerged: 0,
      mergeSearchFacesCalls: 0,
    },
  }
}

function getComponents(faces: ClusterStateFace[]): ClusterStateFace[][] {
  const components = new Map<string, ClusterStateFace[]>()
  for (const face of faces) {
    const root = findRoot(faces, face.faceId)
    const list = components.get(root) ?? []
    list.push(face)
    components.set(root, list)
  }
  return [...components.values()]
}

function buildRepresentativeFaceIds(
  components: ClusterStateFace[][],
  bboxByFace: Map<string, BoundingBox | null | undefined>,
  confidenceByFace: Map<string, number | null | undefined>,
): string[] {
  const repIds = new Set<string>()
  for (const comp of components) {
    const ranked = rankFacesForAvatar(comp, bboxByFace, confidenceByFace, PERSON_GROUPING_MERGE_REPRESENTATIVES)
    for (const item of ranked) {
      repIds.add(item.faceId)
    }
  }
  return [...repIds]
}

function beginMergePhase(
  state: ClusterState,
  bboxByFace: Map<string, BoundingBox | null | undefined>,
  confidenceByFace: Map<string, number | null | undefined>,
): void {
  const components = getComponents(state.faces)
  if (!state.runtimeStats) {
    state.runtimeStats = {
      facesEligibleAsSeeds: state.seedQueue?.length ?? 0,
      facesDiscardedLowQuality: 0,
      groupsMerged: 0,
      mergeSearchFacesCalls: 0,
    }
  }
  state.runtimeStats.initialGroupCount = components.length

  const repIds = buildRepresentativeFaceIds(components, bboxByFace, confidenceByFace)
  state.representativeFaceIds = repIds
  state.mergeQueue = repIds.slice(0, PERSON_GROUPING_MERGE_MAX_SEARCHES)
  state.nextMergeIndex = 0
  state.phase = 'merging'
  state.nextSeedIndex = state.seedQueue?.length ?? 0
}

function shouldMergeGroups(
  similarity: number,
  matchedFaceId: string,
  representativeFaceIds: Set<string>,
): boolean {
  if (similarity >= PERSON_GROUPING_MERGE_HIGH_CONFIDENCE) return true
  if (similarity >= PERSON_GROUPING_MERGE_SIMILARITY_THRESHOLD && representativeFaceIds.has(matchedFaceId)) {
    return true
  }
  return false
}

function findRoot(faces: ClusterStateFace[], faceId: string): string {
  let current = faceId
  const visited = new Set<string>()
  while (faces.find((f) => f.faceId === current)?.parent !== current) {
    if (visited.has(current)) break
    visited.add(current)
    const parent = faces.find((f) => f.faceId === current)?.parent
    if (!parent) break
    current = parent
  }
  return current
}

function unionFaces(faces: ClusterStateFace[], a: string, b: string): void {
  const rootA = findRoot(faces, a)
  const rootB = findRoot(faces, b)
  if (rootA === rootB) return
  const faceA = faces.find((f) => f.faceId === rootA)
  const faceB = faces.find((f) => f.faceId === rootB)
  if (!faceA || !faceB) return
  const scoreA = (faceA.confidence ?? 0) * Math.max(faceA.bboxArea, 0.001)
  const scoreB = (faceB.confidence ?? 0) * Math.max(faceB.bboxArea, 0.001)
  if (scoreA >= scoreB) {
    faceB.parent = rootA
  } else {
    faceA.parent = rootB
  }
}

async function resolveAlbumCollection(albumUrl?: string, albumCollectionId?: string): Promise<AlbumCollectionRow | null> {
  if (albumCollectionId) {
    return getAlbumCollectionById(albumCollectionId)
  }
  if (albumUrl?.trim()) {
    return findAlbumCollectionByUrlHash(hashAlbumUrl(albumUrl.trim()))
  }
  return null
}

export async function canAccessPersonGrouping(
  albumCollectionId: string,
  userId: string | null,
): Promise<{ ok: true; mode: 'user_premium' | 'photographer_license' } | { ok: false }> {
  if (!isPersonGroupingFeatureEnabled()) {
    return { ok: false }
  }

  const devMode = devGrantMode()
  if (devMode === 'photographer_license') {
    return { ok: true, mode: 'photographer_license' }
  }

  if (devMode === 'user_premium' && userId) {
    return { ok: true, mode: 'user_premium' }
  }

  const accessRows = await findPersonGroupingAccess(albumCollectionId)
  for (const row of accessRows) {
    if (row.access_mode === 'photographer_license') {
      return { ok: true, mode: 'photographer_license' }
    }
    if (row.access_mode === 'user_premium' && userId && row.granted_to_user_id === userId) {
      return { ok: true, mode: 'user_premium' }
    }
  }

  return { ok: false }
}

async function ensureAccessGrant(
  albumCollectionId: string,
  userId: string | null,
  mode: 'user_premium' | 'photographer_license',
): Promise<void> {
  if (devGrantMode() !== 'off') return

  if (mode === 'user_premium' && userId) {
    await upsertPersonGroupingAccess({
      albumCollectionId,
      accessMode: 'user_premium',
      grantedToUserId: userId,
      grantedByUserId: userId,
    })
  }
}

export interface PersonGroupAvatarCandidate {
  imageId: string
  representativeCrop: BoundingBox | null
}

export interface PersonGroupPublic {
  groupId: string
  personLabel: string
  photoCount: number
  rank: number
  representativeImageId: string
  representativeCrop: BoundingBox | null
  avatarCandidates?: PersonGroupAvatarCandidate[]
  lowConfidence?: boolean
}

export interface UngroupedFacePublic {
  faceId: string
  imageId: string
  representativeCrop: BoundingBox | null
  reason: 'singleton' | 'low_quality' | 'insufficient_photos'
}

export interface PersonGroupingStatusPayload {
  groupingId: string
  status: PersonGroupingRow['status']
  algorithmVersion: string
  progressPercent: number
  searchFacesCalls: number
  totalFaceInstances: number
  totalGroups: number
  visibleGroups: number
  message: string
  groups?: PersonGroupPublic[]
  ungroupedFaces?: UngroupedFacePublic[]
}

function statusMessage(row: PersonGroupingRow): string {
  switch (row.status) {
    case 'pending':
      return 'Preparando agrupación por personas'
    case 'processing':
      return `Agrupando personas (${row.search_faces_calls} búsquedas realizadas)`
    case 'ready':
      return `${row.visible_groups} personas detectadas`
    case 'failed':
      return row.last_error ?? 'La agrupación falló'
    case 'stale':
      return 'La agrupación quedó desactualizada'
    default:
      return 'Procesando álbum'
  }
}

function progressPercent(row: PersonGroupingRow, state: ClusterState | null): number {
  if (row.status === 'ready') return 100
  if (!state || state.faces.length === 0) return 0

  if (state.phase === 'merging') {
    const total = state.mergeQueue?.length ?? 0
    const done = state.nextMergeIndex ?? 0
    if (total === 0) return 95
    return Math.min(99, 70 + Math.round((done / total) * 29))
  }

  const totalSeeds = state.seedQueue?.length ?? state.faces.length
  if (totalSeeds === 0) return 0
  return Math.min(69, Math.round(((state.nextSeedIndex ?? 0) / totalSeeds) * 69))
}

function toPublicGroups(
  groups: PersonGroupRow[],
  avatarCandidatesByGroup?: Map<string, PersonGroupAvatarCandidate[]>,
  lowConfidenceByGroup?: Set<string>,
): PersonGroupPublic[] {
  return groups.map((g) => ({
    groupId: g.id,
    personLabel: `Persona ${g.person_index}`,
    photoCount: g.photo_count,
    rank: g.person_index,
    representativeImageId: g.representative_image_id,
    representativeCrop: g.representative_crop,
    avatarCandidates: avatarCandidatesByGroup?.get(g.id),
    lowConfidence: lowConfidenceByGroup?.has(g.id) ?? false,
  }))
}

async function buildAvatarCandidatesByGroup(
  groupingId: string,
  albumCollectionId: string,
  groups: PersonGroupRow[],
): Promise<Map<string, PersonGroupAvatarCandidate[]>> {
  const members = await listPersonGroupFaceMembers(groupingId)
  if (members.length === 0) return new Map()

  const indexedFaces = await listIndexedFacesForGrouping(albumCollectionId)
  const bboxByFace = new Map(indexedFaces.map((f) => [f.face_id, f.bounding_box]))
  const confidenceByFace = new Map(indexedFaces.map((f) => [f.face_id, f.confidence]))

  const facesByGroup = new Map<string, ClusterStateFace[]>()
  for (const member of members) {
    const bbox = bboxByFace.get(member.faceId)
    const list = facesByGroup.get(member.groupId) ?? []
    list.push({
      faceId: member.faceId,
      imageId: member.imageId,
      imageName: member.imageId,
      confidence: member.similarity ?? confidenceByFace.get(member.faceId) ?? null,
      bboxArea: bbox?.Width && bbox?.Height ? bbox.Width * bbox.Height : 0.01,
      parent: member.faceId,
    })
    facesByGroup.set(member.groupId, list)
  }

  const result = new Map<string, PersonGroupAvatarCandidate[]>()
  for (const group of groups) {
    const faces = facesByGroup.get(group.id) ?? []
    if (faces.length === 0) {
      result.set(group.id, [{
        imageId: group.representative_image_id,
        representativeCrop: group.representative_crop,
      }])
      continue
    }
    const ranked = rankFacesForAvatar(faces, bboxByFace, confidenceByFace, 12)
    result.set(
      group.id,
      ranked.map((item) => ({
        imageId: item.imageId,
        representativeCrop: item.crop,
      })),
    )
  }
  return result
}

async function toPublicGroupsWithAvatars(
  groups: PersonGroupRow[],
  groupingId: string,
  albumCollectionId: string,
): Promise<PersonGroupPublic[]> {
  const candidates = await buildAvatarCandidatesByGroup(groupingId, albumCollectionId, groups)
  const lowConfidence = new Set(
    groups
      .filter((g) => (g.quality_score ?? 0) < PERSON_GROUPING_LOW_CONFIDENCE_QUALITY_SCORE)
      .map((g) => g.id),
  )
  return toPublicGroups(groups, candidates, lowConfidence)
}

function classifyUngroupedReason(
  photoCount: number,
  minPhotos: number,
  qualityScore: number | null,
): UngroupedFacePublic['reason'] {
  if (photoCount < minPhotos) {
    return photoCount <= 1 ? 'singleton' : 'insufficient_photos'
  }
  if ((qualityScore ?? 0) < PERSON_GROUPING_LOW_CONFIDENCE_QUALITY_SCORE) {
    return 'low_quality'
  }
  return 'singleton'
}

async function buildUngroupedFacesPublic(
  groupingId: string,
  albumCollectionId: string,
  minPhotos: number,
): Promise<UngroupedFacePublic[]> {
  const rows = await listUngroupedFacesForGrouping(groupingId, minPhotos)
  if (rows.length === 0) return []

  const indexedFaces = await listIndexedFacesForGrouping(albumCollectionId)
  const bboxByFace = new Map(indexedFaces.map((f) => [f.face_id, f.bounding_box]))

  const seen = new Set<string>()
  const result: UngroupedFacePublic[] = []

  for (const row of rows) {
    const key = `${row.imageId}:${row.faceId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      faceId: row.faceId,
      imageId: row.imageId,
      representativeCrop: bboxByFace.get(row.faceId) ?? null,
      reason: classifyUngroupedReason(row.photoCount, minPhotos, row.qualityScore),
    })
  }

  return result
}

async function enrichStatusWithGroups(
  row: PersonGroupingRow,
  collection: AlbumCollectionRow,
): Promise<PersonGroupingStatusPayload> {
  const minPhotos = row.min_photos_threshold ?? PERSON_GROUPING_MIN_PHOTOS
  const groups = await listDisplayPersonGroups(row.id, minPhotos)
  const publicGroups = await toPublicGroupsWithAvatars(groups, row.id, collection.id)
  const ungroupedFaces = await buildUngroupedFacesPublic(row.id, collection.id, minPhotos)
  return {
    ...toStatusPayload(row),
    groups: publicGroups,
    ungroupedFaces,
    visibleGroups: publicGroups.length,
  }
}

function toStatusPayload(
  row: PersonGroupingRow,
  groups?: PersonGroupRow[],
): PersonGroupingStatusPayload {
  const state = row.cluster_state as ClusterState | null
  return {
    groupingId: row.id,
    status: row.status,
    algorithmVersion: row.algorithm_version,
    progressPercent: progressPercent(row, state),
    searchFacesCalls: row.search_faces_calls,
    totalFaceInstances: row.total_face_instances,
    totalGroups: row.total_groups,
    visibleGroups: row.visible_groups,
    message: statusMessage(row),
    groups: groups ? toPublicGroups(groups) : undefined,
  }
}

async function finalizeGrouping(
  row: PersonGroupingRow,
  collection: AlbumCollectionRow,
  state: ClusterState,
): Promise<PersonGroupingRow | null> {
  const components = getComponents(state.faces)
  const initialGroups = state.runtimeStats?.initialGroupCount ?? components.length
  const groupsMerged = state.runtimeStats?.groupsMerged ?? 0

  const minPhotos = row.min_photos_threshold ?? PERSON_GROUPING_MIN_PHOTOS
  const indexedFaces = await listIndexedFacesForGrouping(collection.id)
  const bboxByFace = new Map(indexedFaces.map((f) => [f.face_id, f.bounding_box]))
  const confidenceByFace = new Map(indexedFaces.map((f) => [f.face_id, f.confidence]))

  const rawGroups = components
    .map((faces) => {
      const imageMap = new Map<string, number>()
      for (const face of faces) {
        const sim = face.confidence ?? 0
        const prev = imageMap.get(face.imageId) ?? 0
        if (sim > prev) imageMap.set(face.imageId, sim)
      }
      const rep = pickBestRepresentativeFace(faces, bboxByFace, confidenceByFace)
      const repCluster = faces.find((f) => f.faceId === rep.faceId)
      const qualityScore = (repCluster?.confidence ?? 0) * Math.max(repCluster?.bboxArea ?? 0.001, 0.001)
      return {
        faces,
        imageMap,
        representative: rep,
        photoCount: imageMap.size,
        qualityScore,
      }
    })
    .sort((a, b) => b.photoCount - a.photoCount)

  await deletePersonGroupArtifacts(row.id)

  let lowConfidenceGroups = 0
  let hiddenByMinPhotos = 0

  const groupsToInsert = rawGroups.map((g, index) => {
    const repFace = g.representative
    const meetsMinPhotos = g.photoCount >= minPhotos
    const hasValidRep = Boolean(repFace.imageId)
    const isLowConfidence = g.qualityScore < PERSON_GROUPING_LOW_CONFIDENCE_QUALITY_SCORE
    const isVisible = meetsMinPhotos && hasValidRep
    if (!meetsMinPhotos) hiddenByMinPhotos += 1
    else if (isLowConfidence) lowConfidenceGroups += 1

    return {
      personIndex: index + 1,
      photoCount: g.photoCount,
      faceInstanceCount: g.faces.length,
      representativeImageId: repFace.imageId || g.faces[0]?.imageId || '',
      representativeCrop: repFace.crop ?? bboxByFace.get(repFace.faceId) ?? null,
      qualityScore: g.qualityScore,
      isVisible,
      faces: g.faces.map((f) => ({
        faceId: f.faceId,
        imageId: f.imageId,
        similarity: f.confidence ?? 0,
      })),
      imageIds: [...g.imageMap.entries()].map(([imageId, bestSimilarity]) => ({
        imageId,
        bestSimilarity,
      })),
    }
  })

  await insertPersonGroups(row.id, collection.id, groupsToInsert)

  const visibleCount = groupsToInsert.filter((g) => g.isVisible).length
  const visiblePhotoTotals = groupsToInsert.filter((g) => g.isVisible)
  const avgPhotosPerVisibleGroup = visibleCount > 0
    ? Math.round((visiblePhotoTotals.reduce((sum, g) => sum + g.photoCount, 0) / visibleCount) * 10) / 10
    : 0

  const clusteringStats: ClusteringStatsPayload = {
    algorithmVersion: PERSON_GROUPING_ALGORITHM_VERSION,
    initialGroups,
    finalGroups: groupsToInsert.length,
    visibleGroups: visibleCount,
    groupsMerged,
    lowConfidenceGroups,
    hiddenByMinPhotos,
    searchFacesCalls: row.search_faces_calls,
    mergeSearchFacesCalls: state.runtimeStats?.mergeSearchFacesCalls ?? 0,
    avgPhotosPerVisibleGroup,
    facesDiscardedLowQuality: state.runtimeStats?.facesDiscardedLowQuality ?? 0,
    facesEligibleAsSeeds: state.runtimeStats?.facesEligibleAsSeeds ?? 0,
  }

  console.log('[PhotoFind:PersonGroups] clustering_complete', clusteringStats)

  const ungroupedFacesCount = groupsToInsert
    .filter((g) => !g.isVisible)
    .reduce((sum, g) => sum + g.faceInstanceCount, 0)

  void recordGroupingQualitySnapshot({
    groupingId: row.id,
    provider: collection.provider,
    ungroupedFacesCount,
    stats: clusteringStats,
  })

  return updatePersonGrouping(row.id, {
    status: 'ready',
    clusterState: null,
    totalGroups: groupsToInsert.length,
    visibleGroups: visibleCount,
    completedAt: new Date().toISOString(),
    clusteringStats,
  })
}

async function processSearchBatch(
  row: PersonGroupingRow,
  collection: AlbumCollectionRow,
): Promise<PersonGroupingRow | null> {
  const state = row.cluster_state as ClusterState | null
  if (!state) return row

  const phase = state.phase ?? 'clustering'
  if (phase === 'merging') {
    return processMergeBatch(row, collection, state)
  }
  return processClusteringBatch(row, collection, state)
}

async function processClusteringBatch(
  row: PersonGroupingRow,
  collection: AlbumCollectionRow,
  state: ClusterState,
): Promise<PersonGroupingRow | null> {
  let searchCalls = row.search_faces_calls
  let seedIndex = state.nextSeedIndex
  let batchSearches = 0
  const faceIdsInCollection = new Set(state.faces.map((f) => f.faceId))
  const seedQueue = state.seedQueue ?? []

  while (seedIndex < seedQueue.length && batchSearches < PERSON_GROUPING_SEARCH_BATCH_SIZE) {
    const seedFaceId = seedQueue[seedIndex]
    seedIndex++

    if (findRoot(state.faces, seedFaceId) !== seedFaceId) {
      continue
    }

    try {
      const matches = await searchFaces(
        collection.collection_id,
        seedFaceId,
        PERSON_GROUPING_MAX_FACE_MATCHES,
        SIMILARITY_THRESHOLD,
      )
      searchCalls++
      batchSearches++
      for (const match of matches) {
        if (faceIdsInCollection.has(match.faceId)) {
          unionFaces(state.faces, seedFaceId, match.faceId)
        }
      }
    } catch (error) {
      console.error('[PhotoFind:PersonGroups] search_faces_failed', error instanceof Error ? error.message : error)
      return updatePersonGrouping(row.id, {
        status: 'failed',
        lastError: 'AWS Rekognition no pudo buscar caras similares.',
        failedAt: new Date().toISOString(),
        clusterState: state,
        searchFacesCalls: searchCalls,
      })
    }
  }

  state.nextSeedIndex = seedIndex
  const clusteringDone = seedIndex >= seedQueue.length

  if (clusteringDone) {
    const indexedFaces = await listIndexedFacesForGrouping(collection.id)
    const bboxByFace = new Map(indexedFaces.map((f) => [f.face_id, f.bounding_box]))
    const confidenceByFace = new Map(indexedFaces.map((f) => [f.face_id, f.confidence]))
    beginMergePhase(state, bboxByFace, confidenceByFace)

    const processing = await updatePersonGrouping(row.id, {
      status: 'processing',
      clusterState: state,
      searchFacesCalls: searchCalls,
    })
    if (!processing) return null

    if ((state.mergeQueue?.length ?? 0) === 0) {
      return finalizeGrouping(processing, collection, state)
    }
    return processing
  }

  return updatePersonGrouping(row.id, {
    status: 'processing',
    clusterState: state,
    searchFacesCalls: searchCalls,
    startedAt: row.started_at ?? new Date().toISOString(),
  })
}

async function processMergeBatch(
  row: PersonGroupingRow,
  collection: AlbumCollectionRow,
  state: ClusterState,
): Promise<PersonGroupingRow | null> {
  let searchCalls = row.search_faces_calls
  let mergeIndex = state.nextMergeIndex ?? 0
  let batchSearches = 0
  const mergeQueue = state.mergeQueue ?? []
  const faceIdsInCollection = new Set(state.faces.map((f) => f.faceId))
  const representativeSet = new Set(state.representativeFaceIds ?? [])
  if (!state.runtimeStats) {
    state.runtimeStats = {
      facesEligibleAsSeeds: state.seedQueue?.length ?? 0,
      facesDiscardedLowQuality: 0,
      groupsMerged: 0,
      mergeSearchFacesCalls: 0,
    }
  }

  while (mergeIndex < mergeQueue.length && batchSearches < PERSON_GROUPING_SEARCH_BATCH_SIZE) {
    const seedFaceId = mergeQueue[mergeIndex]
    mergeIndex++

    const seedRoot = findRoot(state.faces, seedFaceId)
    if (!faceIdsInCollection.has(seedFaceId)) continue

    try {
      const matches = await searchFaces(
        collection.collection_id,
        seedFaceId,
        PERSON_GROUPING_MAX_FACE_MATCHES,
        PERSON_GROUPING_MERGE_SIMILARITY_THRESHOLD,
      )
      searchCalls++
      batchSearches++
      state.runtimeStats.mergeSearchFacesCalls = (state.runtimeStats.mergeSearchFacesCalls ?? 0) + 1

      for (const match of matches) {
        if (!faceIdsInCollection.has(match.faceId)) continue
        const matchRoot = findRoot(state.faces, match.faceId)
        if (matchRoot === seedRoot) continue
        if (!shouldMergeGroups(match.similarity, match.faceId, representativeSet)) continue

        unionFaces(state.faces, seedFaceId, match.faceId)
        state.runtimeStats.groupsMerged = (state.runtimeStats.groupsMerged ?? 0) + 1
        representativeSet.add(match.faceId)
      }
    } catch (error) {
      console.error('[PhotoFind:PersonGroups] merge_search_failed', error instanceof Error ? error.message : error)
      return updatePersonGrouping(row.id, {
        status: 'failed',
        lastError: 'AWS Rekognition no pudo refinar la agrupación.',
        failedAt: new Date().toISOString(),
        clusterState: state,
        searchFacesCalls: searchCalls,
      })
    }
  }

  state.nextMergeIndex = mergeIndex
  state.representativeFaceIds = [...representativeSet]
  const mergeDone = mergeIndex >= mergeQueue.length

  if (mergeDone) {
    const processing = await updatePersonGrouping(row.id, {
      status: 'processing',
      clusterState: state,
      searchFacesCalls: searchCalls,
    })
    if (!processing) return null
    return finalizeGrouping(processing, collection, state)
  }

  return updatePersonGrouping(row.id, {
    status: 'processing',
    clusterState: state,
    searchFacesCalls: searchCalls,
    startedAt: row.started_at ?? new Date().toISOString(),
  })
}

export async function ensurePersonGrouping(input: {
  albumUrl?: string
  albumCollectionId?: string
  userId: string | null
}): Promise<
  | { ok: true; status: PersonGroupingStatusPayload; needsProcessing: boolean }
  | { ok: false; error: { code: PersonGroupingErrorCode; message: string } }
> {
  if (!isPersonGroupingFeatureEnabled()) {
    return fail('PERSON_GROUPING_DISABLED')
  }

  if (!canUseRekognition()) {
    return fail('AWS_CREDENTIALS_MISSING')
  }

  if (!isPersonGroupingStoreAvailable()) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR')
  }

  const collection = await resolveAlbumCollection(input.albumUrl, input.albumCollectionId)
  if (!collection) {
    return fail('RECOGNITION_COLLECTION_METADATA_ERROR', 'No encontramos un álbum indexado para esa URL.')
  }

  if (collection.status !== 'ready') {
    return fail('PERSON_GROUPING_NOT_READY')
  }

  const access = await canAccessPersonGrouping(collection.id, input.userId)
  if (!access.ok) {
    return fail('PERSON_GROUPING_FORBIDDEN')
  }

  await ensureAccessGrant(collection.id, input.userId, access.mode)

  let grouping = await findPersonGroupingByVersion(collection.id, PERSON_GROUPING_ALGORITHM_VERSION)

  if (grouping?.status === 'stale') {
    grouping = null
  }

  if (grouping?.status === 'ready') {
    return {
      ok: true,
      status: await enrichStatusWithGroups(grouping, collection),
      needsProcessing: false,
    }
  }

  if (grouping?.status === 'processing' || grouping?.status === 'pending') {
    return {
      ok: true,
      status: toStatusPayload(grouping),
      needsProcessing: true,
    }
  }

  if (grouping?.status === 'failed') {
    return {
      ok: true,
      status: toStatusPayload(grouping),
      needsProcessing: false,
    }
  }

  const indexedFaces = await listIndexedFacesForGrouping(collection.id)
  if (indexedFaces.length === 0) {
    return fail('PERSON_GROUPING_NO_FACES')
  }

  const clusterState = buildClusterState(indexedFaces)
  grouping = await createPersonGrouping({
    albumCollectionId: collection.id,
    algorithmVersion: PERSON_GROUPING_ALGORITHM_VERSION,
    minPhotosThreshold: PERSON_GROUPING_MIN_PHOTOS,
    clusterState,
    totalFaceInstances: indexedFaces.length,
  })

  if (!grouping) {
    return fail('PERSON_GROUPING_FAILED')
  }

  return {
    ok: true,
    status: toStatusPayload(grouping),
    needsProcessing: true,
  }
}

export async function processPersonGroupingBatch(input: {
  albumUrl?: string
  albumCollectionId?: string
  userId: string | null
}): Promise<
  | { ok: true; status: PersonGroupingStatusPayload; done: boolean }
  | { ok: false; error: { code: PersonGroupingErrorCode; message: string } }
> {
  const ensured = await ensurePersonGrouping(input)
  if (!ensured.ok) return ensured

  if (!ensured.needsProcessing) {
    return { ok: true, status: ensured.status, done: ensured.status.status === 'ready' }
  }

  const collection = await resolveAlbumCollection(input.albumUrl, input.albumCollectionId)
  if (!collection) return fail('RECOGNITION_COLLECTION_METADATA_ERROR')

  const grouping = await findPersonGroupingByVersion(collection.id, PERSON_GROUPING_ALGORITHM_VERSION)
  if (!grouping) return fail('PERSON_GROUPING_FAILED')

  if (grouping.status === 'ready') {
    return { ok: true, status: await enrichStatusWithGroups(grouping, collection), done: true }
  }

  if (grouping.status === 'failed') {
    return { ok: true, status: toStatusPayload(grouping), done: false }
  }

  const updated = await processSearchBatch(grouping, collection)
  if (!updated) return fail('PERSON_GROUPING_FAILED')

  if (updated.status === 'ready') {
    return {
      ok: true,
      status: await enrichStatusWithGroups(updated, collection),
      done: true,
    }
  }

  return {
    ok: true,
    status: toStatusPayload(updated),
    done: false,
  }
}

export interface PersonGroupingReadStatusPayload {
  collectionReady: boolean
  hasAccess: boolean
  groupingStatus: PersonGroupingRow['status'] | 'none'
  progressPercent: number
  visibleGroups: number
  message: string
}

/** Read-only status for dashboard — does not create or start grouping jobs. */
export async function getPersonGroupingStatusReadOnly(input: {
  albumUrl?: string
  albumCollectionId?: string
  userId: string | null
}): Promise<
  | { ok: true; status: PersonGroupingReadStatusPayload }
  | { ok: false; error: { code: PersonGroupingErrorCode; message: string } }
> {
  if (!isPersonGroupingFeatureEnabled()) {
    return fail('PERSON_GROUPING_DISABLED')
  }

  const collection = await resolveAlbumCollection(input.albumUrl, input.albumCollectionId)
  if (!collection) {
    return {
      ok: true,
      status: {
        collectionReady: false,
        hasAccess: false,
        groupingStatus: 'none',
        progressPercent: 0,
        visibleGroups: 0,
        message: 'El álbum todavía no fue indexado.',
      },
    }
  }

  const collectionReady = collection.status === 'ready'
  const access = await canAccessPersonGrouping(collection.id, input.userId)

  if (!collectionReady) {
    return {
      ok: true,
      status: {
        collectionReady: false,
        hasAccess: access.ok,
        groupingStatus: 'none',
        progressPercent: 0,
        visibleGroups: 0,
        message: 'El álbum se está indexando.',
      },
    }
  }

  if (!access.ok) {
    return {
      ok: true,
      status: {
        collectionReady: true,
        hasAccess: false,
        groupingStatus: 'none',
        progressPercent: 0,
        visibleGroups: 0,
        message: 'Necesitás acceso Premium para agrupar personas.',
      },
    }
  }

  const grouping = await findPersonGroupingByVersion(collection.id, PERSON_GROUPING_ALGORITHM_VERSION)

  if (!grouping || grouping.status === 'stale') {
    return {
      ok: true,
      status: {
        collectionReady: true,
        hasAccess: true,
        groupingStatus: 'none',
        progressPercent: 0,
        visibleGroups: 0,
        message: 'Todavía no generaste la agrupación por personas.',
      },
    }
  }

  const state = grouping.cluster_state as ClusterState | null
  return {
    ok: true,
    status: {
      collectionReady: true,
      hasAccess: true,
      groupingStatus: grouping.status,
      progressPercent: progressPercent(grouping, state),
      visibleGroups: grouping.visible_groups,
      message: statusMessage(grouping),
    },
  }
}

export async function listPersonGroupsForAlbum(input: {
  albumUrl?: string
  albumCollectionId?: string
  userId: string | null
}): Promise<
  | { ok: true; groups: PersonGroupPublic[]; status: PersonGroupingStatusPayload }
  | { ok: false; error: { code: PersonGroupingErrorCode; message: string } }
> {
  const ensured = await ensurePersonGrouping(input)
  if (!ensured.ok) return ensured

  if (ensured.status.status !== 'ready') {
    return { ok: true, groups: [], status: ensured.status }
  }

  return {
    ok: true,
    groups: ensured.status.groups ?? [],
    status: ensured.status,
  }
}

export async function getPersonGroupDetail(input: {
  groupId: string
  userId: string | null
}): Promise<
  | { ok: true; group: PersonGroupPublic; imageIds: string[] }
  | { ok: false; error: { code: PersonGroupingErrorCode; message: string } }
> {
  const group = await getPersonGroupById(input.groupId)
  if (!group) {
    return fail('PERSON_GROUPING_NOT_FOUND')
  }

  const grouping = await findPersonGroupingByVersion(group.album_collection_id, PERSON_GROUPING_ALGORITHM_VERSION)
  const minPhotos = grouping?.min_photos_threshold ?? PERSON_GROUPING_MIN_PHOTOS
  if (group.photo_count < minPhotos) {
    return fail('PERSON_GROUPING_NOT_FOUND')
  }

  const access = await canAccessPersonGrouping(group.album_collection_id, input.userId)
  if (!access.ok) {
    return fail('PERSON_GROUPING_FORBIDDEN')
  }

  const imageIds = await listPersonGroupImageIds(group.id)
  const [publicGroup] = await toPublicGroupsWithAvatars([group], group.grouping_id, group.album_collection_id)
  return {
    ok: true,
    group: publicGroup,
    imageIds,
  }
}

export { PERSON_GROUPING_ALGORITHM_VERSION }
