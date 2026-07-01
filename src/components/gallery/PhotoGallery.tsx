import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { DriveImage } from './DriveImage'
import { cn } from '../../lib/utils'
import type { AlbumImage } from '../../types/album'

interface PhotoGalleryProps {
  images: AlbumImage[]
  selectMode: boolean
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onOpenImage: (image: AlbumImage) => void
}

export function PhotoGallery({
  images,
  selectMode,
  selected,
  onToggleSelect,
  onOpenImage,
}: PhotoGalleryProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
      {images.map((img, i) => (
        <motion.div
          key={img.id}
          initial={i < 24 ? { opacity: 0, scale: 0.98 } : false}
          animate={i < 24 ? { opacity: 1, scale: 1 } : undefined}
          transition={i < 24 ? { delay: Math.min(i * 0.02, 0.4) } : undefined}
          className={cn(
            'group relative aspect-square rounded-xl overflow-hidden cursor-pointer',
            'ring-1 ring-border-subtle hover:ring-accent/40 active:ring-accent/40 transition-all',
            selected.has(img.id) && 'ring-2 ring-accent',
          )}
          onClick={() => selectMode ? onToggleSelect(img.id) : onOpenImage(img)}
        >
          <DriveImage image={img} />

          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none" />

          {selectMode && (
            <div
              className={cn(
                'absolute top-2 right-2 w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all z-10',
                selected.has(img.id)
                  ? 'bg-accent border-accent'
                  : 'border-white/60 bg-black/30',
              )}
            >
              {selected.has(img.id) && <Check className="w-4 h-4 text-white" />}
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            <span className="text-xs px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white truncate block max-w-full">
              {img.name}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
