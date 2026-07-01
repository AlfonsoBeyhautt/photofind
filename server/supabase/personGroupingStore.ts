import type { BoundingBox } from '@aws-sdk/client-rekognition'
import { tryGetSupabaseAdmin } from './client'
import { COLLECTION_RETENTION_DAYS } from '../recognize/config'

export type PersonGroupingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'stale'
export type PersonGroupingAccessMode = 'disabled' | 'user_premium' | 'photographer_license'

export interface ClusterStateFace {
  faceId: string
  imageId: string
  imageName: string
  confidence: number | null
  bboxArea: number
  parent: string
  seedEligible?: boolean
}

export interface ClusteringRuntimeStats {
  facesEligibleAsSeeds: number
  facesDiscardedLowQuality: number
  initialGroupCount?: number
  mergeSearchFacesCalls?: number
  groupsMerged?: number
}

export interface ClusterState {
  faces: ClusterStateFace[]
  nextSeedIndex: number
  phase?: 'clustering' | 'merging'
  seedQueue?: string[]
  mergeQueue?: string[]
  nextMergeIndex?: number
  representativeFaceIds?: string[]
  runtimeStats?: ClusteringRuntimeStats
}

export interface ClusteringStatsPayload {
  algorithmVersion: string
  initialGroups: number
  finalGroups: number
  visibleGroups: number
  groupsMerged: number
  lowConfidenceGroups: number
  hiddenByMinPhotos: number
  searchFacesCalls: number
  mergeSearchFacesCalls: number
  avgPhotosPerVisibleGroup: number
  facesDiscardedLowQuality: number
  facesEligibleAsSeeds: number
}

export interface PersonGroupingRow {
  id: string
  album_collection_id: string
  algorithm_version: string
  status: PersonGroupingStatus
  total_face_instances: number
  total_groups: number
  visible_groups: number
  search_faces_calls: number
  min_photos_threshold: number
  min_quality_threshold: number | null
  cluster_state: ClusterState | null
  clustering_stats: ClusteringStatsPayload | null
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  last_error: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface PersonGroupRow {
  id: string
  grouping_id: string
  album_collection_id: string
  person_index: number
  photo_count: number
  face_instance_count: number
  representative_image_id: string
  representative_crop: BoundingBox | null
  quality_score: number | null
  is_visible: boolean
  created_at: string
}

export interface PersonGroupingAccessRow {
  id: string
  album_collection_id: string
  access_mode: PersonGroupingAccessMode
  granted_to_user_id: string | null
  granted_by_user_id: string | null
  event_slug: string | null
  enabled_at: string
  expires_at: string | null
}

export interface IndexedFaceForGrouping {
  face_id: string
  image_id: string
  image_name: string | null
  confidence: number | null
  bounding_box: BoundingBox | null
}

function retentionExpiresAt(): string {
  const ms = COLLECTION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms).toISOString()
}

function isExpired(row: { expires_at: string | null }): boolean {
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= Date.now()
}

export function isPersonGroupingStoreAvailable(): boolean {
  return !('error' in tryGetSupabaseAdmin())
}

export async function listIndexedFacesForGrouping(
  albumCollectionId: string,
): Promise<IndexedFaceForGrouping[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_collection_faces')
    .select('face_id, image_id, image_name, confidence, bounding_box')
    .eq('album_collection_id', albumCollectionId)

  if (error) {
    console.error('[PhotoFind:PersonGroups] list_faces', error.message)
    return []
  }

  return (data ?? []).filter((row) => {
    const faceId = row.face_id as string
    return faceId && !faceId.startsWith('__no_face__')
  }) as IndexedFaceForGrouping[]
}

export async function findPersonGroupingAccess(
  albumCollectionId: string,
): Promise<PersonGroupingAccessRow[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_person_grouping_access')
    .select('*')
    .eq('album_collection_id', albumCollectionId)
    .neq('access_mode', 'disabled')

  if (error) {
    console.error('[PhotoFind:PersonGroups] find_access', error.message)
    return []
  }

  const rows = (data ?? []) as PersonGroupingAccessRow[]
  return rows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
}

export async function upsertPersonGroupingAccess(input: {
  albumCollectionId: string
  accessMode: PersonGroupingAccessMode
  grantedToUserId?: string | null
  grantedByUserId?: string | null
  eventSlug?: string | null
}): Promise<PersonGroupingAccessRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  if (input.accessMode === 'user_premium' && input.grantedToUserId) {
    const { data: existing } = await admin.client
      .from('album_person_grouping_access')
      .select('id')
      .eq('album_collection_id', input.albumCollectionId)
      .eq('access_mode', 'user_premium')
      .eq('granted_to_user_id', input.grantedToUserId)
      .maybeSingle()

    if (existing) {
      const { data, error } = await admin.client
        .from('album_person_grouping_access')
        .update({
          granted_by_user_id: input.grantedByUserId ?? input.grantedToUserId,
          expires_at: retentionExpiresAt(),
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) return null
      return data as PersonGroupingAccessRow
    }

    const { data, error } = await admin.client
      .from('album_person_grouping_access')
      .insert({
        album_collection_id: input.albumCollectionId,
        access_mode: input.accessMode,
        granted_to_user_id: input.grantedToUserId,
        granted_by_user_id: input.grantedByUserId ?? input.grantedToUserId,
        event_slug: input.eventSlug ?? null,
        expires_at: retentionExpiresAt(),
      })
      .select('*')
      .single()

    if (error) {
      console.error('[PhotoFind:PersonGroups] insert_access_premium', error.message)
      return null
    }
    return data as PersonGroupingAccessRow
  }

  if (input.accessMode === 'photographer_license') {
    const { data: existing } = await admin.client
      .from('album_person_grouping_access')
      .select('id')
      .eq('album_collection_id', input.albumCollectionId)
      .eq('access_mode', 'photographer_license')
      .maybeSingle()

    if (existing) {
      const { data, error } = await admin.client
        .from('album_person_grouping_access')
        .update({
          granted_by_user_id: input.grantedByUserId ?? null,
          event_slug: input.eventSlug ?? null,
          expires_at: retentionExpiresAt(),
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) return null
      return data as PersonGroupingAccessRow
    }

    const { data, error } = await admin.client
      .from('album_person_grouping_access')
      .insert({
        album_collection_id: input.albumCollectionId,
        access_mode: input.accessMode,
        granted_to_user_id: null,
        granted_by_user_id: input.grantedByUserId ?? null,
        event_slug: input.eventSlug ?? null,
        expires_at: retentionExpiresAt(),
      })
      .select('*')
      .single()

    if (error) {
      console.error('[PhotoFind:PersonGroups] insert_access_license', error.message)
      return null
    }
    return data as PersonGroupingAccessRow
  }

  return null
}

export async function findPersonGroupingByVersion(
  albumCollectionId: string,
  algorithmVersion: string,
): Promise<PersonGroupingRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_person_groupings')
    .select('*')
    .eq('album_collection_id', albumCollectionId)
    .eq('algorithm_version', algorithmVersion)
    .maybeSingle()

  if (error) {
    console.error('[PhotoFind:PersonGroups] find_grouping', error.message)
    return null
  }

  const row = data as PersonGroupingRow | null
  if (!row || isExpired(row)) return null
  return row
}

export async function createPersonGrouping(input: {
  albumCollectionId: string
  algorithmVersion: string
  minPhotosThreshold: number
  clusterState: ClusterState
  totalFaceInstances: number
}): Promise<PersonGroupingRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_person_groupings')
    .insert({
      album_collection_id: input.albumCollectionId,
      algorithm_version: input.algorithmVersion,
      status: 'pending',
      total_face_instances: input.totalFaceInstances,
      min_photos_threshold: input.minPhotosThreshold,
      cluster_state: input.clusterState,
      expires_at: retentionExpiresAt(),
    })
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:PersonGroups] create_grouping', error.message)
    return null
  }

  return data as PersonGroupingRow
}

export async function updatePersonGrouping(
  groupingId: string,
  update: Partial<{
    status: PersonGroupingStatus
    clusterState: ClusterState | null
    searchFacesCalls: number
    totalGroups: number
    visibleGroups: number
    lastError: string | null
    startedAt: string
    completedAt: string
    failedAt: string
    clusteringStats: ClusteringStatsPayload | null
  }>,
): Promise<PersonGroupingRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const patch: Record<string, unknown> = { expires_at: retentionExpiresAt() }
  if (update.status !== undefined) patch.status = update.status
  if (update.clusterState !== undefined) patch.cluster_state = update.clusterState
  if (update.searchFacesCalls !== undefined) patch.search_faces_calls = update.searchFacesCalls
  if (update.totalGroups !== undefined) patch.total_groups = update.totalGroups
  if (update.visibleGroups !== undefined) patch.visible_groups = update.visibleGroups
  if (update.lastError !== undefined) patch.last_error = update.lastError
  if (update.startedAt !== undefined) patch.started_at = update.startedAt
  if (update.completedAt !== undefined) patch.completed_at = update.completedAt
  if (update.failedAt !== undefined) patch.failed_at = update.failedAt
  if (update.clusteringStats !== undefined) patch.clustering_stats = update.clusteringStats

  const { data, error } = await admin.client
    .from('album_person_groupings')
    .update(patch)
    .eq('id', groupingId)
    .select('*')
    .single()

  if (error) {
    console.error('[PhotoFind:PersonGroups] update_grouping', error.message)
    return null
  }

  return data as PersonGroupingRow
}

export async function markPersonGroupingStale(
  albumCollectionId: string,
): Promise<void> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return

  await admin.client
    .from('album_person_groupings')
    .update({ status: 'stale' })
    .eq('album_collection_id', albumCollectionId)
    .in('status', ['pending', 'processing', 'ready', 'failed'])
}

export async function deletePersonGroupArtifacts(groupingId: string): Promise<void> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return

  const { data: groups } = await admin.client
    .from('album_person_groups')
    .select('id')
    .eq('grouping_id', groupingId)

  const groupIds = (groups ?? []).map((g) => g.id as string)
  if (groupIds.length > 0) {
    await admin.client.from('album_person_group_images').delete().in('group_id', groupIds)
    await admin.client.from('album_person_group_faces').delete().eq('grouping_id', groupingId)
    await admin.client.from('album_person_groups').delete().eq('grouping_id', groupingId)
  }
}

export async function insertPersonGroups(
  groupingId: string,
  albumCollectionId: string,
  groups: {
    personIndex: number
    photoCount: number
    faceInstanceCount: number
    representativeImageId: string
    representativeCrop: BoundingBox | null
    qualityScore: number
    isVisible: boolean
    faces: { faceId: string; imageId: string; similarity: number }[]
    imageIds: { imageId: string; bestSimilarity: number }[]
  }[],
): Promise<PersonGroupRow[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const inserted: PersonGroupRow[] = []

  for (const group of groups) {
    const { data: groupRow, error: groupError } = await admin.client
      .from('album_person_groups')
      .insert({
        grouping_id: groupingId,
        album_collection_id: albumCollectionId,
        person_index: group.personIndex,
        photo_count: group.photoCount,
        face_instance_count: group.faceInstanceCount,
        representative_image_id: group.representativeImageId,
        representative_crop: group.representativeCrop,
        quality_score: group.qualityScore,
        is_visible: group.isVisible,
      })
      .select('*')
      .single()

    if (groupError || !groupRow) {
      console.error('[PhotoFind:PersonGroups] insert_group', groupError?.message)
      continue
    }

    const groupId = (groupRow as PersonGroupRow).id
    inserted.push(groupRow as PersonGroupRow)

    if (group.faces.length > 0) {
      await admin.client.from('album_person_group_faces').insert(
        group.faces.map((f) => ({
          grouping_id: groupingId,
          group_id: groupId,
          face_id: f.faceId,
          image_id: f.imageId,
          similarity: f.similarity,
        })),
      )
    }

    if (group.imageIds.length > 0) {
      await admin.client.from('album_person_group_images').insert(
        group.imageIds.map((img) => ({
          group_id: groupId,
          image_id: img.imageId,
          best_similarity: img.bestSimilarity,
        })),
      )
    }
  }

  return inserted
}

export async function listPersonGroupFaceMembers(
  groupingId: string,
): Promise<{ groupId: string; faceId: string; imageId: string; similarity: number | null }[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_person_group_faces')
    .select('group_id, face_id, image_id, similarity')
    .eq('grouping_id', groupingId)

  if (error) {
    console.error('[PhotoFind:PersonGroups] list_group_faces', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    groupId: row.group_id as string,
    faceId: row.face_id as string,
    imageId: row.image_id as string,
    similarity: row.similarity as number | null,
  }))
}

export async function listDisplayPersonGroups(
  groupingId: string,
  minPhotos: number,
): Promise<PersonGroupRow[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_person_groups')
    .select('*')
    .eq('grouping_id', groupingId)
    .gte('photo_count', minPhotos)
    .order('person_index', { ascending: true })

  if (error) {
    console.error('[PhotoFind:PersonGroups] list_display_groups', error.message)
    return []
  }

  return (data ?? []).filter((row) => Boolean((row as PersonGroupRow).representative_image_id)) as PersonGroupRow[]
}

export async function listUngroupedFacesForGrouping(
  groupingId: string,
  minPhotos: number,
): Promise<Array<{
  faceId: string
  imageId: string
  photoCount: number
  qualityScore: number | null
}>> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data: hiddenGroups, error: groupsError } = await admin.client
    .from('album_person_groups')
    .select('id, photo_count, quality_score')
    .eq('grouping_id', groupingId)
    .lt('photo_count', minPhotos)

  if (groupsError) {
    console.error('[PhotoFind:PersonGroups] list_ungrouped_groups', groupsError.message)
    return []
  }

  const groupIds = (hiddenGroups ?? []).map((g) => g.id as string)
  if (groupIds.length === 0) return []

  const qualityByGroup = new Map(
    (hiddenGroups ?? []).map((g) => [g.id as string, {
      photoCount: g.photo_count as number,
      qualityScore: g.quality_score as number | null,
    }]),
  )

  const { data: faces, error: facesError } = await admin.client
    .from('album_person_group_faces')
    .select('group_id, face_id, image_id')
    .eq('grouping_id', groupingId)
    .in('group_id', groupIds)

  if (facesError) {
    console.error('[PhotoFind:PersonGroups] list_ungrouped_faces', facesError.message)
    return []
  }

  return (faces ?? []).map((row) => {
    const meta = qualityByGroup.get(row.group_id as string)
    return {
      faceId: row.face_id as string,
      imageId: row.image_id as string,
      photoCount: meta?.photoCount ?? 1,
      qualityScore: meta?.qualityScore ?? null,
    }
  })
}

export async function listVisiblePersonGroups(
  groupingId: string,
): Promise<PersonGroupRow[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_person_groups')
    .select('*')
    .eq('grouping_id', groupingId)
    .eq('is_visible', true)
    .order('person_index', { ascending: true })

  if (error) {
    console.error('[PhotoFind:PersonGroups] list_groups', error.message)
    return []
  }

  return (data ?? []) as PersonGroupRow[]
}

export async function getPersonGroupById(groupId: string): Promise<PersonGroupRow | null> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return null

  const { data, error } = await admin.client
    .from('album_person_groups')
    .select('*')
    .eq('id', groupId)
    .maybeSingle()

  if (error) return null
  return data as PersonGroupRow | null
}

export async function listPersonGroupImageIds(groupId: string): Promise<string[]> {
  const admin = tryGetSupabaseAdmin()
  if ('error' in admin) return []

  const { data, error } = await admin.client
    .from('album_person_group_images')
    .select('image_id')
    .eq('group_id', groupId)

  if (error) return []
  return (data ?? []).map((row) => row.image_id as string)
}
