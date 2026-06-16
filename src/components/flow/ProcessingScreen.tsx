import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Brain, Image, Zap, Loader2, FolderOpen, AlertTriangle, X, ScanFace } from 'lucide-react'
import { Progress } from '../ui/Progress'
import { Badge } from '../ui/Badge'
import { ErrorBanner } from '../ui/ErrorBanner'
import { Button } from '../ui/Button'
import { useAlbum } from '../../context/AlbumContext'
import { getDriveErrorMessage } from '../../lib/drive/errors'
import { preloadAllThumbnails } from '../../lib/images/loadQueue'
import { getGalleryThumbnailUrl } from '../../lib/images/imageUrls'
import { compareAlbumToReference } from '../../lib/recognition/searchClient'
import { ProviderComingSoon } from './ProviderComingSoon'
import { detectProviderFromUrl } from '../../lib/providers/detectProvider'
import {
  buildProcessingKey,
  markProcessingComplete,
  markProcessingFailed,
  resetProcessingKey,
  shouldStartProcessing,
} from '../../lib/processing/processingRunGuard'
import { getProviderMeta } from '../../types/provider'
import type { AlbumData, DriveError } from '../../types/album'
import type { AlbumProvider } from '../../types/provider'
import type { RecognitionSearchResult } from '../../types/recognition'

interface ProcessingScreenProps {
  albumUrl: string
  referenceToken: string
  qualityWarning?: string
  onComplete: (result: RecognitionSearchResult) => void
  onError: () => void
}

const ACTIVE_PROVIDERS = new Set<AlbumProvider>(['google-drive', 'dropbox', 'pixieset', 'wetransfer'])

export function ProcessingScreen({
  albumUrl,
  referenceToken,
  qualityWarning,
  onComplete,
  onError,
}: ProcessingScreenProps) {
  const provider = detectProviderFromUrl(albumUrl)
  const { fetchAlbum, error, setThumbnailsReady } = useAlbum()

  if (!ACTIVE_PROVIDERS.has(provider)) {
    return <ProviderComingSoon provider={provider} onBack={onError} />
  }

  return (
    <AlbumProcessingScreen
      albumUrl={albumUrl}
      provider={provider as 'google-drive' | 'dropbox' | 'pixieset' | 'wetransfer'}
      referenceToken={referenceToken}
      qualityWarning={qualityWarning}
      onComplete={onComplete}
      onError={onError}
      fetchAlbum={fetchAlbum}
      error={error}
      setThumbnailsReady={setThumbnailsReady}
    />
  )
}

interface AlbumProcessingScreenProps {
  albumUrl: string
  provider: 'google-drive' | 'dropbox' | 'pixieset' | 'wetransfer'
  referenceToken: string
  qualityWarning?: string
  onComplete: (result: RecognitionSearchResult) => void
  onError: () => void
  fetchAlbum: (url: string) => Promise<{ album: AlbumData | null; error: DriveError | null }>
  error: DriveError | null
  setThumbnailsReady: (ready: boolean) => void
}

type Phase = 'fetching' | 'preloading' | 'comparing' | 'ready' | 'error'

const PROVIDER_FETCH_ERROR: Record<AlbumProcessingScreenProps['provider'], string> = {
  'google-drive': 'No pudimos leer el álbum de Google Drive.',
  dropbox: 'No pudimos leer el álbum de Dropbox.',
  pixieset: 'No pudimos leer la galería de Pixieset.',
  wetransfer: 'No pudimos leer el transfer de WeTransfer.',
}

function AlbumProcessingScreen({
  albumUrl,
  provider,
  referenceToken,
  onComplete,
  onError,
  fetchAlbum,
  error,
  setThumbnailsReady,
}: AlbumProcessingScreenProps) {
  const providerMeta = getProviderMeta(provider)
  const processingKey = buildProcessingKey(provider, albumUrl, referenceToken)

  const [progress, setProgress] = useState(0)
  const [imageCount, setImageCount] = useState(0)
  const [preloadLoaded, setPreloadLoaded] = useState(0)
  const [preloadFailed, setPreloadFailed] = useState(0)
  const [preloadCompleted, setPreloadCompleted] = useState(0)
  const [preloadTotal, setPreloadTotal] = useState(0)
  const [compareDone, setCompareDone] = useState(0)
  const [compareTotal, setCompareTotal] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [fetchedAlbum, setFetchedAlbum] = useState<AlbumData | null>(null)
  const [phase, setPhase] = useState<Phase>('fetching')
  const [statusLine, setStatusLine] = useState('Leyendo álbum...')
  const [trialWarning, setTrialWarning] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fetchAlbumRef = useRef(fetchAlbum)
  const onCompleteRef = useRef(onComplete)
  const setThumbnailsReadyRef = useRef(setThumbnailsReady)
  const errorRef = useRef(error)

  fetchAlbumRef.current = fetchAlbum
  onCompleteRef.current = onComplete
  setThumbnailsReadyRef.current = setThumbnailsReady
  errorRef.current = error

  const handleCancel = () => {
    abortRef.current?.abort()
    resetProcessingKey(processingKey)
    onError()
  }

  useEffect(() => {
    console.log('[PhotoFind:Processing] effect_start', { processingKey })

    if (!shouldStartProcessing(processingKey)) {
      console.log('[PhotoFind:Processing] effect_skipped_duplicate', { processingKey })
      return
    }

    const abort = new AbortController()
    abortRef.current = abort
    let cancelled = false

    intervalRef.current = setInterval(() => {
      setProgress((p) => (p < 25 ? Math.min(p + 1, 25) : p))
    }, 350)

    async function run() {
      setPhase('fetching')
      setProgress(5)
      setStatusLine('Leyendo álbum...')
      setImageCount(0)
      setPreloadLoaded(0)
      setPreloadFailed(0)
      setPreloadCompleted(0)
      setPreloadTotal(0)
      setCompareDone(0)
      setCompareTotal(0)
      setMatchCount(0)
      setFetchedAlbum(null)
      setLocalError(null)
      setTrialWarning(null)
      setThumbnailsReadyRef.current(false)

      try {
        const { album, error: fetchError } = await fetchAlbumRef.current(albumUrl)
        if (cancelled || abort.signal.aborted) return

        if (!album) {
          const err = fetchError ?? errorRef.current
          const technical = err ? `${err.code}: ${err.message}` : 'UNKNOWN'
          setLocalError(import.meta.env.DEV ? technical : (err?.message ?? PROVIDER_FETCH_ERROR[provider]))
          setPhase('error')
          markProcessingFailed(processingKey)
          return
        }

        setFetchedAlbum(album)
        setImageCount(album.totalImages)
        if (album.totalImages > 50) {
          setTrialWarning('Modo prueba: analizaremos las primeras 50 fotos.')
        }
        setProgress(28)
        setPhase('preloading')
        setStatusLine('Preparando miniaturas...')

        const thumbnailUrls = album.images.map((img) => getGalleryThumbnailUrl(img))
        setPreloadTotal(thumbnailUrls.length)

        const result = await preloadAllThumbnails(
          thumbnailUrls,
          ({ loaded, failed, completed, total }) => {
            if (cancelled || abort.signal.aborted) return
            setPreloadLoaded(loaded)
            setPreloadFailed(failed)
            setPreloadCompleted(completed)
            setPreloadTotal(total)
            const pct = 28 + (completed / total) * 32
            setProgress(pct)
          },
          abort.signal,
        )

        if (cancelled || abort.signal.aborted) return

        if (result.loaded === 0) {
          setLocalError('No pudimos cargar ninguna miniatura. Verificá la conexión e intentá de nuevo.')
          setPhase('error')
          markProcessingFailed(processingKey)
          return
        }

        setThumbnailsReadyRef.current(true)
        setProgress(62)
        setPhase('comparing')
        setStatusLine('Validando referencia...')
        await new Promise((r) => setTimeout(r, 400))
        if (cancelled || abort.signal.aborted) return

        setStatusLine('Buscando coincidencias...')
        const compareResult = await compareAlbumToReference(
          referenceToken,
          album.images,
          ({ compared, total, matched }) => {
            if (cancelled || abort.signal.aborted) return
            setCompareDone(compared)
            setCompareTotal(total)
            setMatchCount(matched)
            setStatusLine(`Comparando fotos ${compared}/${total}`)
            const pct = 62 + (compared / total) * 36
            setProgress(pct)
          },
        )

        if (cancelled || abort.signal.aborted) return

        if (!compareResult.ok) {
          setLocalError(compareResult.message)
          setPhase('error')
          markProcessingFailed(processingKey)
          return
        }

        setMatchCount(compareResult.result.matchedImageIds.length)
        setProgress(100)
        setPhase('ready')
        setStatusLine('Preparando resultados...')
        markProcessingComplete(processingKey)
        setTimeout(() => onCompleteRef.current(compareResult.result), 400)
      } catch (err) {
        if (cancelled || abort.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        console.error('[PhotoFind:Processing] fetch_album_error', { message })
        setLocalError(import.meta.env.DEV ? message : PROVIDER_FETCH_ERROR[provider])
        setPhase('error')
        markProcessingFailed(processingKey)
      } finally {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      abort.abort()
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [albumUrl, referenceToken])

  if (phase === 'error') {
    const friendly = PROVIDER_FETCH_ERROR[provider]
    const technical = localError ?? (error ? `${error.code}: ${error.message}` : null)
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex items-center justify-center px-6 pt-24 pb-16"
      >
        <div className="w-full max-w-lg">
          <div className="glass rounded-2xl p-8 text-center glow-blue">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">No pudimos completar el análisis</h2>
            <ErrorBanner message={friendly} className="mb-3 text-left" />
            {technical && (
              <p className={`text-left text-xs font-mono mb-6 ${import.meta.env.DEV ? 'text-amber-200/80' : 'text-text-muted'}`}>
                {import.meta.env.DEV ? technical : getDriveErrorMessage(error ?? { code: 'UNKNOWN_ERROR', message: technical })}
              </p>
            )}
            {!technical && error && (
              <p className="text-sm text-text-muted mb-6 text-left">{getDriveErrorMessage(error)}</p>
            )}
            <Button variant="primary" className="w-full" onClick={onError}>
              Volver al inicio
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  const isLargeAlbum = imageCount > 50

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-16"
    >
      <div className="w-full max-w-3xl">
        <div className="text-center mb-12">
          <motion.div
            animate={{ rotate: phase !== 'ready' ? 360 : 0 }}
            transition={{ duration: 2, repeat: phase !== 'ready' ? Infinity : 0, ease: 'linear' }}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent/20 to-violet/20 border border-accent/30 flex items-center justify-center glow-blue"
          >
            {phase === 'comparing' ? (
              <ScanFace className="w-10 h-10 text-accent-bright" />
            ) : phase !== 'ready' ? (
              <Loader2 className="w-10 h-10 text-accent-bright" />
            ) : (
              <Brain className="w-10 h-10 text-accent-bright" />
            )}
          </motion.div>

          <Badge variant="accent" className="mb-4">
            <Zap className="w-3 h-3 mr-1" />
            {providerMeta?.label ?? provider}
          </Badge>

          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            {phase === 'comparing'
              ? 'Buscando coincidencias...'
              : phase === 'preloading'
                ? 'Preparando galería...'
                : imageCount > 0
                  ? `${imageCount.toLocaleString()} fotos en el álbum`
                  : 'Leyendo tu álbum...'}
          </h2>

          <p className="text-text-muted">{statusLine}</p>

          {trialWarning && (
            <p className="text-sm text-amber-300/90 mt-3 max-w-md mx-auto">{trialWarning}</p>
          )}

          {phase === 'preloading' && preloadTotal > 0 && (
            <p className="text-sm text-accent-bright mt-4 font-mono">
              Cargando miniaturas {preloadCompleted}/{preloadTotal}
              {preloadFailed > 0 && (
                <span className="text-text-dim"> · {preloadFailed} con error</span>
              )}
            </p>
          )}

          {phase === 'comparing' && compareTotal > 0 && (
            <p className="text-sm text-accent-bright mt-4 font-mono">
              Comparando fotos {compareDone}/{compareTotal}
              {matchCount > 0 && (
                <span className="text-emerald-400"> · {matchCount} coincidencia{matchCount !== 1 ? 's' : ''}</span>
              )}
            </p>
          )}

          {isLargeAlbum && phase !== 'comparing' && (
            <p className="text-sm text-text-dim mt-2 max-w-md mx-auto">
              Este álbum tiene muchas fotos. El análisis puede tardar varios minutos.
            </p>
          )}
        </div>

        <div className="glass rounded-2xl p-8 mb-8">
          <div className="flex justify-between text-sm mb-3">
            <span className="text-text-muted">Progreso</span>
            <span className="font-mono text-accent-bright">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} showGlow className="h-3 mb-8" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-bg-elevated rounded-xl p-4 border border-border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <Image className="w-4 h-4 text-accent-bright" />
                <span className="text-xs text-text-muted">En el álbum</span>
              </div>
              <p className="font-display text-2xl font-bold text-accent-bright">
                {imageCount.toLocaleString()}
              </p>
            </div>

            <div className="bg-bg-elevated rounded-xl p-4 border border-border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <ScanFace className="w-4 h-4 text-violet-soft" />
                <span className="text-xs text-text-muted">
                  {phase === 'comparing' ? 'Comparadas' : 'Cargadas'}
                </span>
              </div>
              <p className="font-display text-2xl font-bold text-violet-soft">
                {phase === 'comparing'
                  ? compareDone.toLocaleString()
                  : preloadLoaded.toLocaleString()}
              </p>
            </div>

            <div className="bg-bg-elevated rounded-xl p-4 border border-border-subtle">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-4 h-4 text-text-muted" />
                <span className="text-xs text-text-muted">Coincidencias</span>
              </div>
              <p className="font-display text-2xl font-bold text-emerald-400">
                {matchCount.toLocaleString()}
              </p>
            </div>
          </div>

          {fetchedAlbum && (
            <div className="mt-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/5 border border-accent/20">
              <FolderOpen className="w-5 h-5 text-accent-bright shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{fetchedAlbum.folderName}</p>
                <p className="text-xs text-text-muted">
                  {fetchedAlbum.totalImages} imágenes desde {providerMeta?.label ?? provider}
                </p>
              </div>
            </div>
          )}
        </div>

        {(phase === 'preloading' || phase === 'comparing') && (
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4" />
              Cancelar y volver
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
