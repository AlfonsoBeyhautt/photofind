import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, Loader2, ImageOff,
} from 'lucide-react'
import type { AlbumImage } from '../../types/album'
import { getDownloadUrl, getLightboxDisplayUrl, isHeicImage } from '../../lib/images/imageUrls'
import { cn } from '../../lib/utils'

interface PhotoLightboxProps {
  images: AlbumImage[]
  initialIndex: number
  onClose: () => void
}

export function PhotoLightbox({ images, initialIndex, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const current = images[index]
  const displayUrl = useMemo(() => getLightboxDisplayUrl(current), [current])
  const heic = isHeicImage(current)

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info('[PhotoFind:Lightbox] display URL', {
        name: current?.name,
        url: displayUrl,
        hasFmtJpeg: displayUrl.includes('fmt=jpeg'),
      })
    }
  }, [current?.name, displayUrl])

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1))
    setZoom(1)
    setLoading(true)
    setLoadError(false)
  }, [images.length])

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0))
    setZoom(1)
    setLoading(true)
    setLoadError(false)
  }, [images.length])

  useEffect(() => {
    setIndex(initialIndex)
    setZoom(1)
    setLoading(true)
    setLoadError(false)
  }, [initialIndex])

  useEffect(() => {
    document.body.classList.add('lightbox-open')

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }

    window.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.classList.remove('lightbox-open')
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, goPrev, goNext])

  const downloadCurrent = () => {
    const link = document.createElement('a')
    link.href = getDownloadUrl(current)
    link.download = current.name
    link.rel = 'noopener'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  if (!current) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black flex flex-col isolate"
        role="dialog"
        aria-modal="true"
        aria-label={`Visor de fotos: ${current.name}`}
      >
        <header
          className="flex items-center justify-between gap-3 px-4 py-3 md:px-6 shrink-0 border-b border-white/10 bg-black/80 backdrop-blur-md safe-top"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-sm text-white/90 font-mono truncate">
            Foto {index + 1} de {images.length}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <LightboxButton
              label="Alejar"
              onClick={() => setZoom((z) => Math.max(z - 0.25, 1))}
              disabled={zoom <= 1}
            >
              <ZoomOut className="w-5 h-5" />
            </LightboxButton>
            <LightboxButton
              label="Acercar"
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              disabled={zoom >= 3}
            >
              <ZoomIn className="w-5 h-5" />
            </LightboxButton>
            <LightboxButton label="Descargar" onClick={downloadCurrent}>
              <Download className="w-5 h-5" />
            </LightboxButton>
            <LightboxButton label="Cerrar" onClick={onClose}>
              <X className="w-5 h-5" />
            </LightboxButton>
          </div>
        </header>

        <div
          className="relative flex-1 flex items-center justify-center px-12 md:px-20 overflow-hidden min-h-0"
          onClick={onClose}
        >
          <NavButton direction="prev" onClick={goPrev} />

          <div
            className="relative w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {loading && !loadError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white/50 animate-spin" />
              </div>
            )}

            {loadError ? (
              <div className="flex flex-col items-center gap-4 text-white/80 px-6 text-center max-w-md">
                <ImageOff className="w-12 h-12 text-white/50" />
                <p className="text-sm">
                  {heic
                    ? 'Vista previa no disponible para este HEIC.'
                    : 'No se pudo cargar la imagen para visualización.'}
                </p>
                <p className="text-xs text-white/40 font-mono truncate max-w-full">{current.name}</p>
                <button
                  type="button"
                  onClick={downloadCurrent}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar original
                </button>
              </div>
            ) : (
              <motion.img
                key={current.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: loading ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                src={displayUrl}
                alt={current.name}
                className="max-h-full max-w-full object-contain select-none transition-transform duration-200"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                onLoad={() => {
                  setLoading(false)
                  setLoadError(false)
                }}
                onError={() => {
                  setLoading(false)
                  setLoadError(true)
                }}
                draggable={false}
              />
            )}
          </div>

          <NavButton direction="next" onClick={goNext} />
        </div>

        <footer className="text-center text-xs text-white/50 px-6 py-3 truncate shrink-0 border-t border-white/10 bg-black/80">
          {current.name}
        </footer>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

function LightboxButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

function NavButton({
  direction,
  onClick,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight

  return (
    <button
      type="button"
      aria-label={direction === 'prev' ? 'Foto anterior' : 'Foto siguiente'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 z-10 p-2 md:p-3 rounded-full',
        'bg-black/50 hover:bg-black/70 text-white/90 hover:text-white transition-colors',
        direction === 'prev' ? 'left-2 md:left-4' : 'right-2 md:right-4',
      )}
    >
      <Icon className="w-6 h-6 md:w-8 md:h-8" />
    </button>
  )
}
