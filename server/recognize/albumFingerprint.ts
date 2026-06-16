import { createHash } from 'node:crypto'
import type { AlbumImage } from '../../src/types/album'

export function computeAlbumFingerprint(
  source: string,
  folderId: string,
  images: Pick<AlbumImage, 'id' | 'name'>[],
): string {
  const imageKeys = images
    .map((img) => `${img.id}:${img.name}`)
    .sort()
    .join('|')
  return createHash('sha256')
    .update(`${source}:${folderId}:${imageKeys}`)
    .digest('hex')
}

export function imageKey(image: Pick<AlbumImage, 'id' | 'name'>): string {
  return `${image.id}:${image.name}`
}
