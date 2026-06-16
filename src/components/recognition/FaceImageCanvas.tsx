import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  computeContainLayout,
  faceBoxRectStyle,
  faceBoxToRect,
  type ContainLayout,
} from '../../lib/recognition/faceBoxLayout'
import type { DetectedFace, FaceBox } from '../../types/recognition'

interface FaceImageCanvasProps {
  src: string
  alt: string
  faces?: DetectedFace[]
  /** Single box for validated preview */
  faceBox?: FaceBox
  highlightedIndex?: number | null
  selectedIndex?: number | null
  onFaceClick?: (faceIndex: number) => void
  maxHeight?: number
  className?: string
  interactive?: boolean
}

export function FaceImageCanvas({
  src,
  alt,
  faces = [],
  faceBox,
  highlightedIndex = null,
  selectedIndex = null,
  onFaceClick,
  maxHeight = 220,
  className,
  interactive = false,
}: FaceImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [layout, setLayout] = useState<ContainLayout | null>(null)
  const [imgReady, setImgReady] = useState(false)

  const measure = useCallback(() => {
    const container = containerRef.current
    const img = imgRef.current
    if (!container || !img || !img.naturalWidth) return

    const next = computeContainLayout(
      container.clientWidth,
      container.clientHeight,
      img.naturalWidth,
      img.naturalHeight,
    )
    setLayout(next)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => measure())
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    setImgReady(false)
    setLayout(null)
  }, [src])

  const boxes = faceBox
    ? [{ index: 0, faceBox, confidence: 0 }]
    : faces

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full bg-bg-elevated/80 rounded-lg overflow-hidden flex items-center justify-center',
        className,
      )}
      style={{ height: maxHeight }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full w-auto h-auto object-contain select-none"
        onLoad={() => {
          setImgReady(true)
          measure()
        }}
      />

      {imgReady && layout && boxes.map((face) => {
        const isHighlight = highlightedIndex === face.index || selectedIndex === face.index
        const isSelected = selectedIndex === face.index
        const rect = faceBoxToRect(face.faceBox, layout)
        const style = faceBoxRectStyle(rect)

        if (interactive && onFaceClick) {
          return (
            <button
              key={face.index}
              type="button"
              onClick={() => onFaceClick(face.index)}
              className={cn(
                'absolute border-2 rounded-sm transition-all duration-150',
                isSelected
                  ? 'border-accent bg-accent/15 shadow-[0_0_0_2px_rgba(59,130,246,0.35)] z-10'
                  : isHighlight
                    ? 'border-amber-400/90 bg-amber-400/10 z-[5]'
                    : 'border-amber-500/70 bg-amber-500/5 hover:border-amber-400 hover:bg-amber-400/15',
              )}
              style={style}
              aria-label={`Seleccionar persona ${face.index + 1}`}
            />
          )
        }

        return (
          <div
            key={face.index}
            className={cn(
              'absolute border-2 rounded-sm pointer-events-none',
              isSelected || faceBox
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]'
                : 'border-emerald-400/80',
            )}
            style={style}
          />
        )
      })}

      {!imgReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated/60">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      )}
    </div>
  )
}
