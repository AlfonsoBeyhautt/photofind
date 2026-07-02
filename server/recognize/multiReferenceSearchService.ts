import { runPoolMap } from '../lib/asyncPool'
import { SIMILARITY_THRESHOLD } from './config'
import { searchFacesByImage } from './rekognitionClient'
import type { ReferenceSearchInput } from './referenceStore'
import { mapFaceIdsToImages } from '../supabase/albumCollectionStore'

export interface CollectionAlbumMatch {
  imageId: string
  similarity: number
}

export interface MultiReferenceSearchStats {
  referenceCount: number
  profileMode: 'single' | 'advanced'
  matchesByReference: Record<string, number>
  primaryOnlyMatches: number
  extraMatchesFromMulti: number
}

const MULTI_REF_SEARCH_CONCURRENCY = 3

export async function searchCollectionWithReferences(input: {
  collectionId: string
  albumCollectionId: string
  references: ReferenceSearchInput[]
}): Promise<{ matches: CollectionAlbumMatch[]; stats: MultiReferenceSearchStats }> {
  const refs = input.references
  const referenceCount = refs.length
  const profileMode = referenceCount > 1 ? 'advanced' : 'single'
  const primaryRefId = refs[0]?.referenceId ?? 'primary'

  const imageBest = new Map<string, { similarity: number; refId?: string }>()
  const matchesByReference: Record<string, number> = {}

  await runPoolMap(refs, MULTI_REF_SEARCH_CONCURRENCY, async (ref) => {
    const faceMatches = await searchFacesByImage(input.collectionId, ref.buffer)
    const faceIds = faceMatches
      .map((m) => m.faceId)
      .filter((id) => !id.startsWith('__no_face__'))

    const faceIdMap = await mapFaceIdsToImages(input.albumCollectionId, faceIds)
    const refKey = ref.referenceId ?? ref.referenceType ?? 'unknown'
    let refMatchCount = 0

    for (const match of faceMatches) {
      const mapped = faceIdMap.get(match.faceId)
      if (!mapped) continue
      if (match.similarity < SIMILARITY_THRESHOLD) continue

      refMatchCount++
      const prev = imageBest.get(mapped.imageId)
      if (!prev || match.similarity > prev.similarity) {
        imageBest.set(mapped.imageId, {
          similarity: match.similarity,
          refId: ref.referenceId ?? refKey,
        })
      }
    }

    if (refMatchCount > 0) {
      matchesByReference[refKey] = refMatchCount
    }

    return refKey
  })

  const primaryImageIds = new Set<string>()
  const allImageIds = new Set<string>()

  for (const [imageId, meta] of imageBest.entries()) {
    allImageIds.add(imageId)
    if (meta.refId === primaryRefId || meta.refId === refs[0]?.referenceId) {
      primaryImageIds.add(imageId)
    }
  }

  let extraMatchesFromMulti = 0
  for (const imageId of allImageIds) {
    if (!primaryImageIds.has(imageId)) {
      extraMatchesFromMulti++
    }
  }

  const matches: CollectionAlbumMatch[] = [...imageBest.entries()].map(([imageId, meta]) => ({
    imageId,
    similarity: meta.similarity,
  }))

  matches.sort((a, b) => b.similarity - a.similarity)

  return {
    matches,
    stats: {
      referenceCount,
      profileMode,
      matchesByReference,
      primaryOnlyMatches: primaryImageIds.size,
      extraMatchesFromMulti,
    },
  }
}
