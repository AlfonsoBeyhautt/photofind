import {
  CompareFacesCommand,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DescribeCollectionCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  RekognitionClient,
  ResourceAlreadyExistsException,
  ResourceNotFoundException,
  SearchFacesByImageCommand,
  SearchFacesCommand,
  type FaceDetail,
  type BoundingBox,
} from '@aws-sdk/client-rekognition'
import { getAwsCredentials } from '../env'
import { REKOGNITION_REGION, SIMILARITY_THRESHOLD } from './config'

let client: RekognitionClient | null = null

function getClient(): RekognitionClient {
  if (!client) {
    const credentials = getAwsCredentials()
    client = new RekognitionClient({
      region: REKOGNITION_REGION,
      ...(credentials ? { credentials } : {}),
    })
  }
  return client
}

export async function compareFaces(
  sourceBytes: Buffer,
  targetBytes: Buffer,
): Promise<{ similarity: number } | null> {
  const response = await getClient().send(new CompareFacesCommand({
    SourceImage: { Bytes: sourceBytes },
    TargetImage: { Bytes: targetBytes },
    SimilarityThreshold: SIMILARITY_THRESHOLD,
    QualityFilter: 'AUTO',
  }))

  const best = response.FaceMatches?.[0]
  if (!best?.Similarity || best.Similarity < SIMILARITY_THRESHOLD) {
    return null
  }

  return { similarity: best.Similarity }
}

export async function detectFaces(imageBytes: Buffer): Promise<FaceDetail[]> {
  const response = await getClient().send(new DetectFacesCommand({
    Image: { Bytes: imageBytes },
    Attributes: ['ALL'],
  }))
  return response.FaceDetails ?? []
}

export async function createCollection(collectionId: string): Promise<void> {
  try {
    await getClient().send(new CreateCollectionCommand({ CollectionId: collectionId }))
  } catch (error) {
    if (error instanceof ResourceAlreadyExistsException) return
    throw error
  }
}

export async function describeCollection(
  collectionId: string,
): Promise<{ faceCount: number; userCount: number } | null> {
  try {
    const response = await getClient().send(new DescribeCollectionCommand({
      CollectionId: collectionId,
    }))
    return {
      faceCount: response.FaceCount ?? 0,
      userCount: response.UserCount ?? 0,
    }
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return null
    throw error
  }
}

export interface IndexedFaceRecord {
  faceId: string
  externalImageId?: string
  boundingBox?: BoundingBox
  confidence?: number
}

export async function indexFaces(
  collectionId: string,
  imageBytes: Buffer,
  externalImageId: string,
): Promise<IndexedFaceRecord[]> {
  const safeExternalId = externalImageId.slice(0, 255)
  const response = await getClient().send(new IndexFacesCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageBytes },
    ExternalImageId: safeExternalId,
    DetectionAttributes: ['DEFAULT'],
    MaxFaces: 20,
    QualityFilter: 'AUTO',
  }))

  return (response.FaceRecords ?? []).map((record) => ({
    faceId: record.Face?.FaceId ?? '',
    externalImageId: record.Face?.ExternalImageId ?? safeExternalId,
    boundingBox: record.FaceDetail?.BoundingBox,
    confidence: record.FaceDetail?.Confidence,
  })).filter((face) => face.faceId.length > 0)
}

export interface SearchFaceMatch {
  faceId: string
  similarity: number
}

export async function searchFacesByImage(
  collectionId: string,
  imageBytes: Buffer,
): Promise<SearchFaceMatch[]> {
  const response = await getClient().send(new SearchFacesByImageCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageBytes },
    FaceMatchThreshold: SIMILARITY_THRESHOLD,
    MaxFaces: 100,
  }))

  return (response.FaceMatches ?? [])
    .filter((match) => match.Face?.FaceId && (match.Similarity ?? 0) >= SIMILARITY_THRESHOLD)
    .map((match) => ({
      faceId: match.Face!.FaceId!,
      similarity: match.Similarity ?? 0,
    }))
}

export async function searchFaces(
  collectionId: string,
  faceId: string,
  maxFaces = 4096,
): Promise<SearchFaceMatch[]> {
  const response = await getClient().send(new SearchFacesCommand({
    CollectionId: collectionId,
    FaceId: faceId,
    FaceMatchThreshold: SIMILARITY_THRESHOLD,
    MaxFaces: maxFaces,
  }))

  return (response.FaceMatches ?? [])
    .filter((match) => match.Face?.FaceId && (match.Similarity ?? 0) >= SIMILARITY_THRESHOLD)
    .map((match) => ({
      faceId: match.Face!.FaceId!,
      similarity: match.Similarity ?? 0,
    }))
}

export async function deleteCollection(collectionId: string): Promise<void> {
  try {
    await getClient().send(new DeleteCollectionCommand({ CollectionId: collectionId }))
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return
    throw error
  }
}

export function isRekognitionConfigured(): boolean {
  const creds = getAwsCredentials()
  if (creds?.accessKeyId && creds?.secretAccessKey) return true
  if (process.env.AWS_PROFILE) return true
  if (process.env.AWS_EXECUTION_ENV) return true
  if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) return true
  return false
}

export function canUseRekognition(): boolean {
  return isRekognitionConfigured()
}

export type { FaceDetail }
