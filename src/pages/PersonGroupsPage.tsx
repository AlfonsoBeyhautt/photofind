import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, ChevronRight, Crown, Download, CheckSquare, Square,
  Loader2, Users, AlertTriangle, RotateCcw,
} from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { ErrorBanner } from '../components/ui/ErrorBanner'
import { PhotoGallery } from '../components/gallery/PhotoGallery'
import { PhotoLightbox } from '../components/gallery/PhotoLightbox'
import { PersonFaceAvatar, representativeCropToFaceBox } from '../components/recognition/PersonFaceAvatar'
import { useAlbum } from '../context/AlbumContext'
import { useAuth } from '../context/AuthContext'
import { getDownloadUrl } from '../lib/images/imageUrls'
import { runPersonGroupingPipeline, fetchPersonGroupDetail } from '../lib/recognition/personGroupingClient'
import { isPersonGroupingEnabled, type PersonGroupPublic, type PersonGroupingStatusPayload } from '../types/personGrouping'
import type { AlbumImage } from '../types/album'
import { cn } from '../lib/utils'

type View = 'grid' | 'group'

export function PersonGroupsPage() {
  const [searchParams] = useSearchParams()
  const albumUrl = searchParams.get('albumUrl')?.trim() ?? ''
  const { isLoggedIn } = useAuth()
  const { album, fetchAlbum, isLoading: albumLoading } = useAlbum()

  const [view, setView] = useState<View>('grid')
  const [groups, setGroups] = useState<PersonGroupPublic[]>([])
  const [status, setStatus] = useState<PersonGroupingStatusPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<PersonGroupPublic | null>(null)
  const [groupImageIds, setGroupImageIds] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const featureEnabled = isPersonGroupingEnabled()

  const loadGrouping = useCallback(async () => {
    if (!albumUrl || !featureEnabled) return
    setLoading(true)
    setError(null)

    const result = await runPersonGroupingPipeline(albumUrl, setStatus)
    setLoading(false)

    if (!result.ok) {
      setError(result.message)
      return
    }

    setGroups(result.groups)
    setStatus(result.status)
  }, [albumUrl, featureEnabled])

  useEffect(() => {
    if (!albumUrl) return
    void fetchAlbum(albumUrl)
  }, [albumUrl, fetchAlbum])

  useEffect(() => {
    if (!albumUrl || !featureEnabled) {
      setLoading(false)
      return
    }
    void loadGrouping()
  }, [albumUrl, featureEnabled, loadGrouping])

  const groupImages = useMemo(() => {
    if (!album || groupImageIds.length === 0) return []
    const ids = new Set(groupImageIds)
    return album.images.filter((img) => ids.has(img.id))
  }, [album, groupImageIds])

  const openGroup = async (group: PersonGroupPublic) => {
    setSelectedGroup(group)
    setView('group')
    setSelected(new Set())
    setSelectMode(false)
    setLightboxIndex(null)

    const detail = await fetchPersonGroupDetail(group.groupId)
    if (detail.ok) {
      setGroupImageIds(detail.imageIds)
    } else {
      setError(detail.message)
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === groupImages.length) setSelected(new Set())
    else setSelected(new Set(groupImages.map((img) => img.id)))
  }

  const downloadImages = (ids: string[]) => {
    const toDownload = groupImages.filter((img) => ids.includes(img.id))
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
      alert(`Se inició la descarga de las primeras 5 de ${toDownload.length} imágenes.`)
    }
  }

  if (!featureEnabled) {
    return (
      <PersonGroupsShell>
        <div className="glass rounded-2xl p-8 text-center max-w-lg mx-auto">
          <Crown className="w-10 h-10 text-violet-soft mx-auto mb-4" />
          <p className="text-text-muted">La agrupación por personas no está habilitada en este entorno.</p>
        </div>
      </PersonGroupsShell>
    )
  }

  if (!albumUrl) {
    return (
      <PersonGroupsShell>
        <div className="glass rounded-2xl p-8 text-center max-w-lg mx-auto">
          <p className="text-text-muted mb-4">Falta el enlace del álbum.</p>
          <Link to="/dashboard"><Button variant="outline">Ir al dashboard</Button></Link>
        </div>
      </PersonGroupsShell>
    )
  }

  return (
    <PersonGroupsShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="violet">
                <Crown className="w-3 h-3 mr-1" />
                Premium
              </Badge>
              <Badge variant="accent">
                <Users className="w-3 h-3 mr-1" />
                Personas
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              {view === 'group' && selectedGroup
                ? selectedGroup.personLabel
                : 'Personas en el álbum'}
            </h1>
            {album?.folderName && (
              <p className="text-text-muted text-sm mt-1 truncate">{album.folderName}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {view === 'group' ? (
              <Button variant="outline" onClick={() => { setView('grid'); setSelectedGroup(null) }}>
                <ArrowLeft className="w-4 h-4" />
                Todas las personas
              </Button>
            ) : (
              <Link to="/dashboard">
                <Button variant="outline">
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadGrouping()}>
              <RotateCcw className="w-4 h-4" />
              Reintentar
            </Button>
          </div>
        )}

        {!isLoggedIn && import.meta.env.VITE_PERSON_GROUPING_DEV_GRANT_MODE !== 'photographer_license' && (
          <div className="glass rounded-2xl p-6 mb-6 border border-amber-500/20">
            <p className="text-sm text-amber-200">
              Iniciá sesión para acceder a la agrupación premium individual de este álbum.
            </p>
            <Link to="/login" className="inline-block mt-3">
              <Button size="sm">Iniciar sesión</Button>
            </Link>
          </div>
        )}

        {(loading || status?.status === 'pending' || status?.status === 'processing') && (
          <div className="glass rounded-2xl p-6 sm:p-8 mb-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-accent-bright mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold mb-2">Agrupando personas</h2>
            <p className="text-text-muted text-sm mb-4">{status?.message ?? 'Preparando análisis…'}</p>
            <Progress value={status?.progressPercent ?? 5} className="h-2 max-w-md mx-auto mb-2" />
            <p className="text-xs text-text-dim font-mono">
              {status?.searchFacesCalls ?? 0} búsquedas · {status?.progressPercent ?? 0}%
            </p>
          </div>
        )}

        {albumLoading && !album && (
          <p className="text-center text-text-muted py-8">Cargando álbum…</p>
        )}

        {view === 'grid' && !loading && status?.status === 'ready' && groups.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="font-medium mb-1">No encontramos grupos visibles</p>
            <p className="text-sm text-text-muted">
              Puede que las personas detectadas tengan muy pocas fotos o baja calidad.
            </p>
          </div>
        )}

        {view === 'grid' && groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group, i) => (
              <PersonGroupCard
                key={group.groupId}
                group={group}
                albumImages={album?.images ?? []}
                index={i}
                onOpen={() => void openGroup(group)}
              />
            ))}
          </div>
        )}

        {view === 'group' && selectedGroup && album && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <p className="text-text-muted text-sm">
                {groupImages.length} foto{groupImages.length !== 1 ? 's' : ''} de {selectedGroup.personLabel}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectMode((v) => !v)
                    if (selectMode) setSelected(new Set())
                  }}
                >
                  {selectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  {selectMode ? 'Cancelar selección' : 'Seleccionar'}
                </Button>
                {selectMode && (
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selected.size === groupImages.length ? 'Ninguna' : 'Todas'}
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={selectMode ? selected.size === 0 : groupImages.length === 0}
                  onClick={() => downloadImages(selectMode ? [...selected] : groupImages.map((i) => i.id))}
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </Button>
              </div>
            </div>

            {groupImages.length > 0 ? (
              <PhotoGallery
                images={groupImages}
                selectMode={selectMode}
                selected={selected}
                onToggleSelect={toggleSelect}
                onOpenImage={(img) => {
                  const index = groupImages.findIndex((item) => item.id === img.id)
                  if (index >= 0) setLightboxIndex(index)
                }}
              />
            ) : (
              <p className="text-text-muted text-center py-12">Cargando fotos del grupo…</p>
            )}

            {lightboxIndex !== null && (
              <PhotoLightbox
                images={groupImages}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}
          </div>
        )}
      </div>
    </PersonGroupsShell>
  )
}

function PersonGroupsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen min-h-dvh">
      <GlowOrbs />
      <Navbar />
      <div className="relative z-10 px-4 sm:px-6 page-top pb-16 safe-bottom">
        {children}
      </div>
    </div>
  )
}

function PersonGroupCard({
  group,
  albumImages,
  index,
  onOpen,
}: {
  group: PersonGroupPublic
  albumImages: AlbumImage[]
  index: number
  onOpen: () => void
}) {
  const repImage = albumImages.find((img) => img.id === group.representativeImageId)
  const avatarCandidates = (group.avatarCandidates ?? []).map((candidate) => ({
    image: albumImages.find((img) => img.id === candidate.imageId),
    crop: candidate.representativeCrop,
  }))

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4) }}
      onClick={onOpen}
      className={cn(
        'glass rounded-xl p-4 text-left w-full border border-border hover:border-violet/40',
        'hover:bg-violet/5 transition-all flex items-center gap-4',
      )}
    >
      <PersonFaceAvatar
        image={repImage}
        faceBox={representativeCropToFaceBox(group.representativeCrop)}
        candidates={avatarCandidates}
        size={64}
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{group.personLabel}</p>
        <p className="text-sm text-text-muted">{group.photoCount.toLocaleString()} fotos</p>
      </div>
      <ChevronRight className="w-5 h-5 text-text-dim shrink-0" />
    </motion.button>
  )
}
