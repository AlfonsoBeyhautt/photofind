import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AlbumData, DriveError } from '../types/album'
import type { AlbumProvider } from '../types/provider'
import { detectProviderFromUrl } from '../lib/providers/detectProvider'
import { buildAlbumSource } from '../lib/providers/buildAlbumSource'
import { fetchAlbumByProvider } from '../lib/providers/fetchAlbumByProvider'
import { isGoogleDriveUrl, extractGoogleDriveFolderId } from '../lib/drive/parseUrl'
import { isDropboxSharedFolderUrl } from '../lib/dropbox/parseUrl'
import { isPixiesetUrl, parsePixiesetUrl } from '../lib/pixieset/parseUrl'
import { isWeTransferUrl } from '../lib/wetransfer/parseUrl'
import { driveError } from '../lib/drive/errors'
import { resetImageCache } from '../lib/images/loadQueue'

const FETCHABLE_PROVIDERS = new Set<AlbumProvider>(['google-drive', 'dropbox', 'pixieset', 'wetransfer'])

interface AlbumContextType {
  albumUrl: string
  provider: AlbumProvider
  album: AlbumData | null
  error: DriveError | null
  isLoading: boolean
  thumbnailsReady: boolean
  setAlbumUrl: (url: string) => void
  setThumbnailsReady: (ready: boolean) => void
  validateUrl: (url: string) => DriveError | null
  fetchAlbum: (url?: string) => Promise<{ album: AlbumData | null; error: DriveError | null }>
  resetAlbum: () => void
}

const AlbumContext = createContext<AlbumContextType | null>(null)

export function AlbumProvider({ children }: { children: ReactNode }) {
  const [albumUrl, setAlbumUrlState] = useState('')
  const [provider, setProvider] = useState<AlbumProvider>('unknown')
  const [album, setAlbum] = useState<AlbumData | null>(null)
  const [error, setError] = useState<DriveError | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [thumbnailsReady, setThumbnailsReady] = useState(false)

  const setAlbumUrl = useCallback((url: string) => {
    setAlbumUrlState(url)
    setProvider(detectProviderFromUrl(url))
  }, [])

  const validateUrl = useCallback((url: string): DriveError | null => {
    const trimmed = url.trim()
    if (!trimmed) {
      return driveError('INVALID_URL', 'Pegá un enlace de carpeta de álbum.')
    }

    const detected = detectProviderFromUrl(trimmed)
    if (detected === 'unknown') {
      return driveError('INVALID_URL', 'No pudimos identificar el origen del enlace.')
    }

    if (detected === 'google-drive') {
      if (!isGoogleDriveUrl(trimmed)) {
        return driveError('INVALID_URL', 'El enlace no parece ser una carpeta válida de Google Drive.')
      }
      if (!extractGoogleDriveFolderId(trimmed)) {
        return driveError('INVALID_URL', 'No pudimos extraer el ID de la carpeta. Verificá el enlace.')
      }
    }

    if (detected === 'dropbox' && !isDropboxSharedFolderUrl(trimmed)) {
      return driveError(
        'DROPBOX_INVALID_SHARED_LINK',
        'El enlace debe ser una carpeta pública compartida de Dropbox.',
      )
    }

    if (detected === 'pixieset' && !isPixiesetUrl(trimmed)) {
      return driveError(
        'PIXIESET_UNSUPPORTED_GALLERY',
        'El enlace debe ser una galería pública de Pixieset.',
      )
    }

    if (detected === 'pixieset' && !parsePixiesetUrl(trimmed)) {
      return driveError(
        'PIXIESET_UNSUPPORTED_GALLERY',
        'No pudimos interpretar el link de Pixieset.',
      )
    }

    if (detected === 'wetransfer' && !isWeTransferUrl(trimmed)) {
      return driveError(
        'WETRANSFER_INVALID_URL',
        'El enlace debe ser un transfer público de WeTransfer (we.tl o wetransfer.com/downloads).',
      )
    }

    return null
  }, [])

  const fetchAlbum = useCallback(async (url?: string): Promise<{ album: AlbumData | null; error: DriveError | null }> => {
    const targetUrl = url ?? albumUrl
    const detected = detectProviderFromUrl(targetUrl)
    console.log('[PhotoFind:Processing] fetch_album_start', { provider: detected, urlLength: targetUrl.length })

    const validationError = validateUrl(targetUrl)
    if (validationError) {
      console.error('[PhotoFind:Processing] fetch_album_error', { stage: 'validation', code: validationError.code })
      setError(validationError)
      setAlbum(null)
      return { album: null, error: validationError }
    }

    if (!FETCHABLE_PROVIDERS.has(detected)) {
      const notReady = driveError('PROVIDER_NOT_READY')
      setError(notReady)
      setAlbum(null)
      return { album: null, error: notReady }
    }

    setIsLoading(true)
    setError(null)

    try {
      const source = buildAlbumSource(targetUrl, detected)
      console.log('[PhotoFind:Album] provider_detected', { provider: source.provider })
      const result = await fetchAlbumByProvider(source)
      if (result.ok) {
        setAlbum(result.album)
        setAlbumUrlState(targetUrl)
        setProvider(detected)
        console.log('[PhotoFind:Processing] fetch_album_done', { images: result.album.totalImages })
        return { album: result.album, error: null }
      }
      console.error('[PhotoFind:Processing] fetch_album_error', result.error)
      setError(result.error)
      setAlbum(null)
      return { album: null, error: result.error }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[PhotoFind:Processing] fetch_album_error', { stage: 'exception', message })
      const fetchError = driveError('UNKNOWN_ERROR', import.meta.env.DEV ? message : undefined)
      setError(fetchError)
      setAlbum(null)
      return { album: null, error: fetchError }
    } finally {
      setIsLoading(false)
    }
  }, [albumUrl, validateUrl])

  const resetAlbum = useCallback(() => {
    setAlbumUrlState('')
    setProvider('unknown')
    setAlbum(null)
    setError(null)
    setIsLoading(false)
    setThumbnailsReady(false)
    resetImageCache()
  }, [])

  return (
    <AlbumContext.Provider
      value={{
        albumUrl,
        provider,
        album,
        error,
        isLoading,
        thumbnailsReady,
        setAlbumUrl,
        setThumbnailsReady,
        validateUrl,
        fetchAlbum,
        resetAlbum,
      }}
    >
      {children}
    </AlbumContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAlbum() {
  const ctx = useContext(AlbumContext)
  if (!ctx) throw new Error('useAlbum must be used within AlbumProvider')
  return ctx
}
