import { useMemo, useState } from 'react'
import { Download, ImageIcon } from 'lucide-react'
import { imageLoadQueue } from '../../lib/images/loadQueue'
import { getDownloadUrl, getGalleryThumbnailUrl, isHeicImage } from '../../lib/images/imageUrls'
import { cn } from '../../lib/utils'
import type { AlbumImage } from '../../types/album'

interface DriveImageProps {
  image: AlbumImage
  className?: string
}

export function DriveImage({ image, className }: DriveImageProps) {
  const thumbUrl = useMemo(() => getGalleryThumbnailUrl(image), [image])
  const [failed, setFailed] = useState(() => imageLoadQueue.isFailed(thumbUrl))
  const heic = isHeicImage(image)

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.href = getDownloadUrl(image)
    link.download = image.name
    link.rel = 'noopener'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  if (failed && heic) {
    return (
      <div className={cn('relative w-full h-full bg-bg-elevated flex flex-col items-center justify-center gap-2 p-2 text-center', className)}>
        <ImageIcon className="w-6 h-6 text-text-dim" />
        <p className="text-[10px] leading-tight text-text-muted px-1">
          Vista previa no disponible para este HEIC
        </p>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1 text-[10px] text-accent-bright hover:underline"
        >
          <Download className="w-3 h-3" />
          Descargar original
        </button>
      </div>
    )
  }

  if (failed) {
    return (
      <div className={cn('relative w-full h-full bg-bg-elevated flex flex-col items-center justify-center gap-2 p-2', className)}>
        <ImageIcon className="w-6 h-6 text-text-dim" />
        <p className="text-[10px] text-text-muted">Vista previa no disponible</p>
      </div>
    )
  }

  return (
    <img
      src={thumbUrl}
      alt={image.name}
      className={cn('w-full h-full object-cover', className)}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
