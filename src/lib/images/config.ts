/** Max concurrent thumbnail requests during full-album preload */
export const IMAGE_LOAD_CONCURRENCY = 6

export const THUMBNAIL_SIZE = 400

export function getThumbnailUrl(fileId: string, size = THUMBNAIL_SIZE): string {
  return `/api/drive/thumbnail/${fileId}?sz=${size}`
}
