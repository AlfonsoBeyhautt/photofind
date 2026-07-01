import { useNavigate } from 'react-router-dom'
import { Eye, RefreshCw, Search, Trash2, Users, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import type { DashboardAlbumContext, ProcessedAlbumItem, SearchHistoryItem } from '../../types/auth'
import { deleteAlbumSearchHistory, deleteSearchHistory } from '../../lib/auth/authClient'
import type { DashboardStartSearchState, DashboardViewResultsState } from '../../lib/dashboard/dashboardNavigation'
import { isPersonGroupingEnabled } from '../../types/personGrouping'

function canViewStoredResults(search: SearchHistoryItem): boolean {
  return Boolean(search.matchedImageIds && search.matchedImageIds.length > 0)
}

export function RecentSearchActions({
  search,
  onDeleted,
}: {
  search: SearchHistoryItem
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const hasStoredResults = canViewStoredResults(search)

  const startSearch = () => {
    const state: DashboardStartSearchState = {
      albumUrl: search.albumUrl,
      eventCategory: search.eventCategory,
      mode: 'search',
    }
    navigate('/', { state: { startSearch: state } })
  }

  const viewResults = () => {
    if (!search.matchedImageIds?.length) return
    const state: DashboardViewResultsState = {
      albumUrl: search.albumUrl,
      eventCategory: search.eventCategory,
      matchedImageIds: search.matchedImageIds,
      analyzedCount: search.analyzedCount ?? undefined,
      searchMethod: search.searchMethod ?? undefined,
    }
    navigate('/', { state: { viewResults: state } })
  }

  const handleDelete = async () => {
    const result = await deleteSearchHistory(search.id)
    if (result.ok) onDeleted()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {hasStoredResults ? (
        <Button variant="outline" size="sm" onClick={viewResults}>
          <Eye className="w-3.5 h-3.5" />
          Ver resultados
        </Button>
      ) : (
        <span className="text-[11px] text-text-dim">Sin resultados guardados</span>
      )}
      <Button variant="ghost" size="sm" onClick={startSearch}>
        <RefreshCw className="w-3.5 h-3.5" />
        Buscar de nuevo
      </Button>
      <button
        type="button"
        onClick={() => void handleDelete()}
        className="ml-auto touch-target inline-flex items-center justify-center rounded-lg p-2 text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
        aria-label="Eliminar búsqueda"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ProcessedAlbumActions({
  album,
  context,
  onDeleted,
}: {
  album: ProcessedAlbumItem
  context?: DashboardAlbumContext
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const collectionReady = context?.collectionStatus === 'ready'
  const hasActiveJob = Boolean(context?.activeJobId && ['pending', 'processing', 'retrying'].includes(context.activeJobStatus ?? ''))
  const hasStoredResults = Boolean(album.latestMatchedImageIds && album.latestMatchedImageIds.length > 0)

  const startSearch = () => {
    const state: DashboardStartSearchState = {
      albumUrl: album.albumUrl,
      eventCategory: album.eventCategory,
      mode: 'search',
    }
    navigate('/', { state: { startSearch: state } })
  }

  const viewResults = () => {
    if (!album.latestMatchedImageIds?.length) return
    const state: DashboardViewResultsState = {
      albumUrl: album.albumUrl,
      eventCategory: album.eventCategory,
      matchedImageIds: album.latestMatchedImageIds,
    }
    navigate('/', { state: { viewResults: state } })
  }

  const viewPersons = () => {
    navigate(`/personas?albumUrl=${encodeURIComponent(album.albumUrl)}`)
  }

  const handleDelete = async () => {
    const result = await deleteAlbumSearchHistory(album.albumUrl)
    if (result.ok) onDeleted()
  }

  return (
    <div className="flex flex-col gap-2 mt-3">
      {context && context.collectionStatus !== 'none' && (
        <p className="text-[11px] text-text-dim">
          {collectionReady
            ? `Indexado: ${context.indexedImages.toLocaleString('es-AR')}/${context.totalImages.toLocaleString('es-AR')} fotos · ${context.indexedFaces.toLocaleString('es-AR')} caras`
            : context.collectionStatus === 'failed'
              ? 'La indexación falló — podés reintentar'
              : hasActiveJob
                ? 'Procesamiento en curso'
                : `Estado: ${context.collectionStatus}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {hasStoredResults && (
          <Button variant="outline" size="sm" onClick={viewResults}>
            <Eye className="w-3.5 h-3.5" />
            Ver resultados
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={startSearch} disabled={hasActiveJob}>
          {hasActiveJob ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Nueva búsqueda
        </Button>
        {isPersonGroupingEnabled() && collectionReady && (
          <Button variant="ghost" size="sm" onClick={viewPersons}>
            <Users className="w-3.5 h-3.5" />
            Ver personas
          </Button>
        )}
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="ml-auto touch-target inline-flex items-center justify-center rounded-lg p-2 text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Eliminar del historial"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
