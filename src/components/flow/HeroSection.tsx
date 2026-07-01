import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link2, ArrowRight, Cloud, HardDrive, FolderOpen, Send, Crown, ScanFace, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { ErrorBanner } from '../ui/ErrorBanner'
import { useAlbum } from '../../context/AlbumContext'
import { getDriveErrorMessage } from '../../lib/drive/errors'
import { detectProviderFromUrl } from '../../lib/providers/detectProvider'
import { PROVIDERS, type AlbumProvider } from '../../types/provider'
import { isPersonGroupingEnabled } from '../../types/personGrouping'
import { EventCategoryPicker } from './EventCategoryPicker'
import type { EventCategory } from '../../lib/eventCategories'
import { cn } from '../../lib/utils'

export type AlbumFlowMode = 'search' | 'group'

interface HeroSectionProps {
  onAnalyze: (url: string, mode: AlbumFlowMode, eventCategory?: EventCategory | null) => void
}

const PROVIDER_ICONS: Record<AlbumProvider, LucideIcon> = {
  'google-drive': Cloud,
  dropbox: HardDrive,
  onedrive: Cloud,
  pixieset: FolderOpen,
  wetransfer: Send,
  unknown: FolderOpen,
}

function providerPillClass(providerId: AlbumProvider, detected: AlbumProvider, hasUrl: boolean): string {
  const isDetected = hasUrl && detected === providerId && detected !== 'unknown'

  if (isDetected) {
    if (providerId === 'google-drive') {
      return 'bg-accent/15 border-accent/40 text-accent-bright shadow-[0_0_20px_rgba(59,130,246,0.15)]'
    }
    if (providerId === 'dropbox') {
      return 'bg-accent/15 border-accent/40 text-accent-bright shadow-[0_0_20px_rgba(59,130,246,0.15)]'
    }
    if (providerId === 'pixieset' || providerId === 'wetransfer') {
      return 'bg-violet/15 border-violet/35 text-violet-soft shadow-[0_0_20px_rgba(139,92,246,0.12)]'
    }
    return 'bg-surface/80 border-border text-text shadow-[0_0_20px_rgba(255,255,255,0.04)]'
  }

  return 'bg-surface/50 border-border-subtle text-text-muted'
}

export function HeroSection({ onAnalyze }: HeroSectionProps) {
  const { validateUrl } = useAlbum()
  const [url, setUrl] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flowMode, setFlowMode] = useState<AlbumFlowMode>('search')
  const [eventCategory, setEventCategory] = useState<EventCategory | null>(null)
  const premiumEnabled = isPersonGroupingEnabled()

  const detectedProvider = useMemo(() => detectProviderFromUrl(url), [url])
  const hasUrl = url.trim().length > 0
  const activeMeta = hasUrl && detectedProvider !== 'unknown'
    ? PROVIDERS.find((p) => p.id === detectedProvider)
    : null

  const placeholder = activeMeta?.placeholder ?? 'https://drive.google.com/drive/folders/...'

  const handleUrlChange = (value: string) => {
    setUrl(value)
    setError(null)
  }

  const handleSubmit = () => {
    const validationError = validateUrl(url)
    if (validationError) {
      setError(getDriveErrorMessage(validationError))
      return
    }
    setError(null)
    onAnalyze(url.trim(), flowMode, eventCategory)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center min-h-screen min-h-dvh px-4 sm:px-6 page-top pb-16 safe-bottom"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-violet/10 text-violet-soft border-violet/20">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-soft animate-pulse mr-1.5" />
          {activeMeta ? `${activeMeta.label} detectado` : 'Múltiples fuentes de álbum'}
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="font-display text-3xl sm:text-5xl md:text-7xl font-bold text-center max-w-4xl leading-[1.1] tracking-tight mb-6 px-2"
      >
        Encontrá tus fotos{' '}
        <span className="gradient-text">en segundos</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-base sm:text-lg md:text-xl text-text-muted text-center max-w-2xl mb-10 sm:mb-12 leading-relaxed px-2"
      >
        Pegá un enlace público de tu álbum. Detectamos automáticamente Google Drive, Dropbox, Pixieset o WeTransfer.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
        className={`w-full max-w-3xl glass rounded-2xl p-2 transition-all duration-300 ${
          focused ? 'glow-blue ring-1 ring-accent/30' : ''
        } ${error ? 'ring-1 ring-red-500/30' : ''}`}
      >
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 flex items-center gap-3 px-4 py-3">
            <Link2 className="w-5 h-5 text-text-dim shrink-0" />
            <input
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-text placeholder:text-text-dim focus:outline-none text-base"
            />
          </div>
          <Button size="lg" onClick={handleSubmit} className="shrink-0 w-full md:w-auto">
            {premiumEnabled && flowMode === 'group' ? (
              <>
                Agrupar personas
                <Users className="w-4 h-4" />
              </>
            ) : (
              <>
                Analizar álbum
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
        {error && <ErrorBanner message={error} className="mt-2 mx-1" />}
        {hasUrl && detectedProvider === 'unknown' && !error && (
          <p className="text-xs text-text-dim mt-2 mx-4">
            No pudimos identificar el origen del enlace.
          </p>
        )}
        {hasUrl && !error && (
          <EventCategoryPicker value={eventCategory} onChange={setEventCategory} />
        )}
        {premiumEnabled && hasUrl && !error && (
          <div className="mt-3 mx-1 p-3 rounded-xl bg-violet/5 border border-violet/15">
            <p className="text-xs text-text-muted mb-2 px-1">¿Qué querés hacer con este álbum?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFlowMode('search')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                  flowMode === 'search'
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-border bg-bg-elevated hover:border-border-subtle',
                )}
              >
                <ScanFace className="w-5 h-5 text-accent-bright shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Buscar mis fotos</p>
                  <p className="text-xs text-text-muted mt-0.5">Selfie + coincidencias (flujo actual)</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFlowMode('group')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                  flowMode === 'group'
                    ? 'border-violet/40 bg-violet/10'
                    : 'border-border bg-bg-elevated hover:border-border-subtle',
                )}
              >
                <Crown className="w-5 h-5 text-violet-soft shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Agrupar todas las personas</p>
                  <p className="text-xs text-text-muted mt-0.5">Premium — detectar cada persona del álbum</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap items-center justify-center gap-4 mt-8"
      >
        {PROVIDERS.map((source, i) => {
          const Icon = PROVIDER_ICONS[source.id]
          const isDetected = hasUrl && detectedProvider === source.id

          return (
            <motion.div
              key={source.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.1 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition-all duration-300 ${providerPillClass(source.id, detectedProvider, hasUrl)}`}
            >
              <Icon className="w-4 h-4" />
              {source.label}
              <span className={`text-[10px] uppercase tracking-wider ${isDetected ? 'opacity-90' : 'opacity-50'}`}>
                {source.statusLabel}
              </span>
            </motion.div>
          )
        })}
      </motion.div>

      <motion.div
        id="como-funciona"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 max-w-4xl w-full"
      >
        {[
          { step: '01', title: 'Pegá el enlace', desc: 'Carpeta pública de Drive, Dropbox, Pixieset o WeTransfer' },
          { step: '02', title: premiumEnabled ? 'Elegí el modo' : 'Elegí tu referencia', desc: premiumEnabled ? 'Buscá tus fotos o agrupá todas las personas (Premium)' : 'Subí fotos, sacate una selfie o usá tu perfil' },
          { step: '03', title: 'Recibí tus fotos', desc: premiumEnabled ? 'Coincidencias o grupos por persona listos para descargar' : 'Descargá todas las coincidencias en segundos' },
        ].map((item, i) => (
          <motion.div
            key={item.step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.15 }}
            className="glass rounded-2xl p-6 hover:border-accent/20 transition-colors group"
          >
            <span className="text-xs font-mono text-accent-bright">{item.step}</span>
            <h3 className="font-display font-semibold text-lg mt-2 mb-2 group-hover:text-accent-bright transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-text-muted">{item.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
