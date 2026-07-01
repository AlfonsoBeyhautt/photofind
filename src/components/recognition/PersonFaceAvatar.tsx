import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { AlbumImage } from '../../types/album'
import type { FaceBox } from '../../types/recognition'
import { faceThumbnailCrop } from '../../lib/recognition/faceBoxLayout'
import { getGalleryThumbnailUrl } from '../../lib/images/imageUrls'
import { cn } from '../../lib/utils'

export function representativeCropToFaceBox(
  crop: { Width?: number; Height?: number; Left?: number; Top?: number } | null | undefined,
): FaceBox | null {
  if (
    crop?.Left == null
    || crop.Top == null
    || crop.Width == null
    || crop.Height == null
    || crop.Width <= 0
    || crop.Height <= 0
  ) {
    return null
  }
  return {
    left: crop.Left,
    top: crop.Top,
    width: crop.Width,
    height: crop.Height,
  }
}

interface PersonFaceAvatarProps {
  image?: AlbumImage | null
  faceBox?: FaceBox | null
  size?: number
  className?: string
}

export function PersonFaceAvatar({
  image,
  faceBox,
  size = 64,
  className,
}: PersonFaceAvatarProps) {
  const thumbUrl = useMemo(() => (image ? getGalleryThumbnailUrl(image) : null), [image])
  const crop = faceBox ? faceThumbnailCrop(faceBox) : null

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden bg-bg-elevated shrink-0 ring-2 ring-violet/30 relative',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {thumbUrl && crop ? (
        <img
          src={thumbUrl}
          alt=""
          className="absolute max-w-none object-cover"
          decoding="async"
          style={{
            width: `${100 / crop.width}%`,
            height: `${100 / crop.height}%`,
            left: `${-crop.left / crop.width * 100}%`,
            top: `${-crop.top / crop.height * 100}%`,
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-dim">
          <Users className="w-6 h-6" />
        </div>
      )}
    </div>
  )
}
