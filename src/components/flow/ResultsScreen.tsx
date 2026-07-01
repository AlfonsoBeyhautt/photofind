import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Download, CheckSquare, Square, RotateCcw,
  Sparkles, Calendar, Tag, FolderOpen, ScanFace, AlertTriangle,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { PremiumSection } from './PremiumSection'
import { PhotoGallery } from '../gallery/PhotoGallery'
import { PhotoLightbox } from '../gallery/PhotoLightbox'
import { EVENT_CATEGORIES, type EventCategory } from '../../data/mock'
import type { AlbumData, AlbumImage } from '../../types/album'
import type { RecognitionSearchResult } from '../../types/recognition'
import { getProviderMeta } from '../../types/provider'
import { getDownloadUrl } from '../../lib/images/imageUrls'
import { cn } from '../../lib/utils'

interface ResultsScreenProps {
  album: AlbumData
  category: EventCategory
  searchResult: RecognitionSearchResult
  qualityWarning?: string
  onRestart: () => void
}

export function ResultsScreen({
  album,
  category,
  searchResult,
  qualityWarning,
  onRestart,
}: ResultsScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const categoryInfo = EVENT_CATEGORIES.find((c) => c.id === category)
  const providerLabel = getProviderMeta(album.source)?.label ?? album.source

  const images = useMemo(() => {
    const ids = new Set(searchResult.matchedImageIds)
    return album.images.filter((img) => ids.has(img.id))
  }, [album.images, searchResult.matchedImageIds])

  const matchCount = images.length
  const analyzedCount = searchResult.analyzedCount
  const hasMatches = matchCount > 0

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === images.length) setSelected(new Set())
    else setSelected(new Set(images.map((img) => img.id)))
  }

  const openImage = (img: AlbumImage) => {
    const index = images.findIndex((item) => item.id === img.id)
    if (index >= 0) setLightboxIndex(index)
  }

  const downloadImages = (ids: string[]) => {
    const toDownload = images.filter((img) => ids.includes(img.id))
    for (const img of toDownload.slice(0, 5)) {
      const link = document.createElement('a')
      link.href = getDownloadUrl(img)
      link.download = img.name
      link.rel = 'noopener'
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
    if (toDownload.length > 5) {
      alert(`Se inició la descarga de las primeras 5 de ${toDownload.length} imágenes. La descarga masiva estará disponible pronto.`)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen min-h-dvh"
    >
      <div className="px-4 sm:px-6 page-top pb-24 lg:pb-8 safe-bottom max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          <motion.aside
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:w-80 shrink-0 order-1 lg:order-2"
          >
            <div className="glass rounded-2xl p-5 sm:p-6 lg:sticky lg:top-28 space-y-6">
              <div>
                <h3 className="font-display font-semibold text-lg mb-4">Resumen</h3>
                <div className="space-y-4">
                  <StatRow icon={Sparkles} label="Coincidencias" value={String(matchCount)} accent />
                  <StatRow icon={ScanFace} label="Fotos analizadas" value={String(analyzedCount)} />
                  <StatRow icon={FolderOpen} label="Carpeta" value={album.folderName} />
                  <StatRow icon={Tag} label="Evento" value={categoryInfo?.label ?? '—'} />
                  <StatRow icon={Calendar} label="Fuente" value={providerLabel} />
                </div>
              </div>

              {hasMatches && (
                <div className="border-t border-border-subtle pt-6">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-200/90">
                    Mostrando solo las fotos donde aparecés vos (umbral de similitud 85%).
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={onRestart}>
                <RotateCcw className="w-4 h-4" />
                Nueva búsqueda
              </Button>
            </div>
          </motion.aside>

          <div className="flex-1 min-w-0 order-2 lg:order-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 sm:mb-8"
            >
              <Badge variant={hasMatches ? 'success' : 'default'} className="mb-4">
                <ScanFace className="w-3 h-3 mr-1" />
                {hasMatches ? 'Coincidencias encontradas' : 'Sin coincidencias'}
              </Badge>
              <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold mb-3 leading-tight">
                {hasMatches ? (
                  <>
                    Encontramos{' '}
                    <span className="gradient-text">{matchCount}</span>
                    {' '}foto{matchCount !== 1 ? 's' : ''} tuya{matchCount !== 1 ? 's' : ''} de{' '}
                    <span className="text-text-muted">{analyzedCount}</span> analizadas
                  </>
                ) : (
                  'No encontramos fotos tuyas'
                )}
              </h2>
              <p className="text-text-muted text-sm sm:text-base">
                {hasMatches ? (
                  <>
                    Carpeta <strong className="text-text">{album.folderName}</strong> — {providerLabel}
                  </>
                ) : (
                  'No encontramos fotos claras tuyas en este álbum. Probá con otra referencia más frontal o con mejor luz.'
                )}
              </p>
              {searchResult.trialModeMessage && (
                <p className="text-sm text-amber-300/90 mt-2">{searchResult.trialModeMessage}</p>
              )}
              {searchResult.collectionReused && searchResult.searchMethod === 'collection' && (
                <p className="text-sm text-emerald-300/80 mt-2">
                  Reutilizamos el análisis previo de este álbum.
                </p>
              )}
              {qualityWarning && (
                <p className="text-sm text-amber-200/80 mt-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  La referencia no era ideal, por eso algunas fotos podrían no aparecer.
                </p>
              )}
            </motion.div>

            {hasMatches ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => downloadImages(images.map((i) => i.id))}
                  >
                    <Download className="w-4 h-4" />
                    Descargar todas
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={selected.size === 0}
                    onClick={() => downloadImages([...selected])}
                  >
                    <Download className="w-4 h-4" />
                    Seleccionadas {selected.size > 0 && `(${selected.size})`}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full sm:col-span-2"
                    onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}
                  >
                    {selectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    {selectMode ? 'Cancelar selección' : 'Seleccionar fotos'}
                  </Button>
                  {selectMode && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-sm text-accent-bright hover:underline py-2 sm:col-span-2 text-left"
                    >
                      {selected.size === images.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                  )}
                </div>

                <PhotoGallery
                  images={images}
                  selectMode={selectMode}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onOpenImage={openImage}
                />
              </>
            ) : (
              <div className="glass rounded-2xl p-8 sm:p-12 text-center border border-border">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet/10 border border-violet/20 flex items-center justify-center">
                  <ScanFace className="w-8 h-8 text-violet-soft" />
                </div>
                <p className="text-text-muted max-w-md mx-auto text-sm sm:text-base">
                  No encontramos fotos claras tuyas en las {analyzedCount} fotos que analizamos.
                  Probá con otra referencia más frontal o con mejor luz.
                </p>
                <Button variant="outline" className="mt-6 w-full sm:w-auto" onClick={onRestart}>
                  <RotateCcw className="w-4 h-4" />
                  Nueva búsqueda
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {hasMatches && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-4 safe-bottom safe-x border-t border-border-subtle bg-bg/95 backdrop-blur-md">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => downloadImages(images.map((i) => i.id))}
          >
            <Download className="w-4 h-4" />
            Descargar {matchCount} foto{matchCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}

      <PremiumSection />

      {lightboxIndex !== null && hasMatches && (
        <PhotoLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </motion.div>
  )
}

function StatRow({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
        <Icon className={cn('w-4 h-4', accent ? 'text-accent-bright' : 'text-text-muted')} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-dim">{label}</p>
        <p className={cn('font-semibold truncate', accent && 'text-accent-bright')}>{value}</p>
      </div>
    </div>
  )
}
