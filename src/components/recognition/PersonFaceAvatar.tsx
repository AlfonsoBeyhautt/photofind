import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { AlbumImage } from '../../types/album'
import type { FaceBox } from '../../types/recognition'
import {
  awsBoundingBoxToFaceBox,
  facePortraitCrop,
  hasMinimumFaceBox,
} from '../../lib/recognition/facePortraitCrop'
import { getGalleryThumbnailUrl } from '../../lib/images/imageUrls'
import { cn } from '../../lib/utils'

export { awsBoundingBoxToFaceBox as representativeCropToFaceBox }

export interface FaceAvatarCandidate {
  image?: AlbumImage | null
  faceBox?: FaceBox | null
  crop?: { Width?: number; Height?: number; Left?: number; Top?: number } | null
}

interface PersonFaceAvatarProps {
  image?: AlbumImage | null
  faceBox?: FaceBox | null
  candidates?: FaceAvatarCandidate[]
  size?: number
  className?: string
}

function resolveCandidateBox(candidate: FaceAvatarCandidate): FaceBox | null {
  if (candidate.faceBox && hasMinimumFaceBox(candidate.faceBox)) {
    return candidate.faceBox
  }
  return awsBoundingBoxToFaceBox(candidate.crop)
}

export function PersonFaceAvatar({
  image,
  faceBox,
  candidates,
  size = 64,
  className,
}: PersonFaceAvatarProps) {
  const display = useMemo(() => {
    const list: FaceAvatarCandidate[] = candidates?.length
      ? candidates
      : [{ image, faceBox, crop: null }]

    for (const candidate of list) {
      if (!candidate.image) continue
      const box = resolveCandidateBox(candidate)
      if (!box) continue
      const crop = facePortraitCrop(box)
      if (crop) {
        return {
          thumbUrl: getGalleryThumbnailUrl(candidate.image),
          crop,
          mode: 'portrait' as const,
        }
      }
    }

    const withImage = list.find((c) => c.image)
    if (withImage?.image) {
      return {
        thumbUrl: getGalleryThumbnailUrl(withImage.image),
        crop: null,
        mode: 'cover' as const,
      }
    }

    return null
  }, [candidates, image, faceBox])

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden bg-bg-elevated shrink-0 ring-2 ring-violet/30 relative',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {display?.mode === 'portrait' && display.crop ? (
        <img
          src={display.thumbUrl}
          alt=""
          className="absolute max-w-none object-cover"
          decoding="async"
          style={{
            width: `${100 / display.crop.width}%`,
            height: `${100 / display.crop.height}%`,
            left: `${-display.crop.left / display.crop.width * 100}%`,
            top: `${-display.crop.top / display.crop.height * 100}%`,
          }}
        />
      ) : display?.mode === 'cover' ? (
        <img
          src={display.thumbUrl}
          alt=""
          className="w-full h-full object-cover object-center"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-dim">
          <Users className="w-6 h-6" />
        </div>
      )}
    </div>
  )
}
