import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, FolderOpen, Loader2, Users, Sparkles } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { fetchPersonGroupingStatus } from '../../lib/recognition/personGroupingClient'
import { providerLabel } from '../../lib/auth/authClient'
import { eventCategoryLabel } from '../../data/eventCategories'
import type { ProcessedAlbumItem } from '../../types/auth'
import type { PersonGroupingReadStatus } from '../../types/personGrouping'

interface PremiumPersonGroupingSectionProps {
  albums: ProcessedAlbumItem[]
}

function groupingStatusLabel(status: PersonGroupingReadStatus): string {
  if (!status.collectionReady) return 'Indexando álbum'
  if (!status.hasAccess) return 'Requiere Premium'
  if (status.groupingStatus === 'none') return 'Sin agrupar'
  if (status.groupingStatus === 'ready') {
    return status.visibleGroups > 0
      ? `${status.visibleGroups} persona${status.visibleGroups !== 1 ? 's' : ''}`
      : 'Listo'
  }
  if (status.groupingStatus === 'processing' || status.groupingStatus === 'pending') {
    return `Generando (${status.progressPercent}%)`
  }
  if (status.groupingStatus === 'failed') return 'Error al agrupar'
  return status.message
}

function groupingBadgeVariant(status: PersonGroupingReadStatus): 'default' | 'accent' | 'violet' {
  if (status.groupingStatus === 'ready') return 'accent'
  if (status.groupingStatus === 'processing' || status.groupingStatus === 'pending') return 'violet'
  return 'default'
}

export function PremiumPersonGroupingSection({ albums }: PremiumPersonGroupingSectionProps) {
  const [statusByUrl, setStatusByUrl] = useState<Record<string, PersonGroupingReadStatus>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (albums.length === 0) {
      setLoading(false)
      setStatusByUrl({})
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      const entries = await Promise.all(
        albums.map(async (album) => {
          const result = await fetchPersonGroupingStatus(album.albumUrl)
          return [album.albumUrl, result.ok ? result.status : null] as const
        }),
      )

      if (cancelled) return

      const next: Record<string, PersonGroupingReadStatus> = {}
      for (const [url, status] of entries) {
        if (status) next[url] = status
      }
      setStatusByUrl(next)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [albums])

  return (
    <motion.section
      id="premium-personas"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="mb-8 scroll-mt-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-semibold text-xl flex items-center gap-2">
            <Crown className="w-5 h-5 text-violet-soft" />
            Premium: Álbumes agrupados por personas
          </h2>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Detectá y agrupá automáticamente a cada persona del álbum. Elegí un álbum ya procesado para ver o generar la agrupación.
          </p>
        </div>
        <Badge variant="violet" className="self-start shrink-0">
          <Sparkles className="w-3 h-3 mr-1" />
          Función Premium
        </Badge>
      </div>

      {albums.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center border border-dashed border-violet/20">
          <Users className="w-8 h-8 mx-auto text-violet-soft mb-3" />
          <p className="font-medium text-sm mb-1">Todavía no tenés álbumes listos</p>
          <p className="text-xs text-text-muted mb-4">
            Primero cargá y analizá un álbum desde el inicio. Después podés agrupar todas las personas acá.
          </p>
          <Link to="/">
            <Button size="sm" variant="outline">Cargar un álbum</Button>
          </Link>
        </div>
      ) : loading ? (
        <div className="glass rounded-xl p-8 flex items-center justify-center text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando álbumes premium…
        </div>
      ) : (
        <div className="space-y-3">
          {albums.map((album) => {
            const status = statusByUrl[album.albumUrl]
            const personasUrl = `/personas?albumUrl=${encodeURIComponent(album.albumUrl)}`
            const canView = status?.collectionReady && status.hasAccess
            const needsGrouping = canView && (status.groupingStatus === 'none' || status.groupingStatus === 'failed')
            const isGenerating = status?.groupingStatus === 'processing' || status?.groupingStatus === 'pending'
            const isReady = status?.groupingStatus === 'ready'

            return (
              <div
                key={album.albumUrl}
                className="glass rounded-xl p-4 border border-violet/10 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="w-14 h-14 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-6 h-6 text-violet-soft" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{album.albumName}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-dim">
                    <span>{providerLabel(album.provider)}</span>
                    {album.eventCategory && (
                      <>
                        <span>·</span>
                        <Badge variant="default" className="text-[10px] py-0">
                          {eventCategoryLabel(album.eventCategory)}
                        </Badge>
                      </>
                    )}
                    {album.totalPhotos != null && (
                      <>
                        <span>·</span>
                        <span>{album.totalPhotos.toLocaleString()} fotos</span>
                      </>
                    )}
                    {status && (
                      <>
                        <span>·</span>
                        <Badge variant={groupingBadgeVariant(status)} className="text-[10px] py-0">
                          {groupingStatusLabel(status)}
                        </Badge>
                      </>
                    )}
                  </div>
                  {status && !status.hasAccess && status.collectionReady && (
                    <p className="text-xs text-amber-200/90 mt-1">Iniciá sesión o activá Premium para usar esta función.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {canView && needsGrouping && (
                    <Link to={personasUrl}>
                      <Button size="sm" variant="primary">
                        <Users className="w-3.5 h-3.5" />
                        Generar agrupación
                      </Button>
                    </Link>
                  )}
                  {canView && (isReady || isGenerating) && (
                    <Link to={personasUrl}>
                      <Button size="sm" variant={isReady ? 'primary' : 'outline'}>
                        <Users className="w-3.5 h-3.5" />
                        {isGenerating ? 'Ver progreso' : 'Ver personas'}
                      </Button>
                    </Link>
                  )}
                  {!status?.collectionReady && (
                    <Link to={personasUrl}>
                      <Button size="sm" variant="outline" disabled>
                        Indexando…
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.section>
  )
}
