/** Max concurrent thumbnail requests during full-album preload */
export { IMAGE_FETCH_DEFAULT_CONCURRENCY as IMAGE_LOAD_CONCURRENCY } from '../../config/imageFetch'

export const THUMBNAIL_SIZE = 400

export function getThumbnailUrl(fileId: string, size = THUMBNAIL_SIZE): string {
  return `/api/drive/thumbnail/${fileId}?sz=${size}`
}
