export type PersonGroupingJobStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'stale'

export interface PersonGroupAvatarCandidate {
  imageId: string
  representativeCrop: {
    Width?: number
    Height?: number
    Left?: number
    Top?: number
  } | null
}

export interface PersonGroupPublic {
  groupId: string
  personLabel: string
  photoCount: number
  rank: number
  representativeImageId: string
  representativeCrop: {
    Width?: number
    Height?: number
    Left?: number
    Top?: number
  } | null
  avatarCandidates?: PersonGroupAvatarCandidate[]
  lowConfidence?: boolean
}

export interface UngroupedFacePublic {
  faceId: string
  imageId: string
  representativeCrop: {
    Width?: number
    Height?: number
    Left?: number
    Top?: number
  } | null
  reason: 'singleton' | 'low_quality' | 'insufficient_photos'
}

export interface PersonGroupingStatusPayload {
  groupingId: string
  status: PersonGroupingJobStatus
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

export function isPersonGroupingEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_PERSON_GROUPING === 'true'
    || import.meta.env.VITE_ENABLE_PERSON_GROUPING === '1'
}

export type PersonGroupingReadStatus = {
  collectionReady: boolean
  hasAccess: boolean
  groupingStatus: PersonGroupingJobStatus | 'none'
  progressPercent: number
  visibleGroups: number
  message: string
}
