import {
  CompareFacesCommand,
  DetectFacesCommand,
  RekognitionClient,
  type FaceDetail,
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
