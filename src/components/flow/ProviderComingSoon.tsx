import { motion } from 'framer-motion'
import { ArrowLeft, Cloud, HardDrive, FolderOpen, Sparkles, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AlbumProvider } from '../../types/provider'
import { getProviderMeta } from '../../types/provider'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

interface ProviderComingSoonProps {
  provider: AlbumProvider
  onBack: () => void
}

const ICONS: Record<AlbumProvider, LucideIcon> = {
  'google-drive': Cloud,
  dropbox: HardDrive,
  onedrive: Cloud,
  pixieset: FolderOpen,
  wetransfer: FolderOpen,
  unknown: FolderOpen,
}

const MESSAGES: Record<Exclude<AlbumProvider, 'google-drive' | 'unknown'>, {
  title: string
  description: string
  badge: string
}> = {
  dropbox: {
    title: 'Dropbox preparado',
    description:
      'Dropbox está preparado para integración. Próximo paso: conectar API.',
    badge: 'Preparado',
  },
  onedrive: {
    title: 'OneDrive limitado',
    description:
      'OneDrive requiere configuración con Microsoft Graph/Azure. Por ahora solo soportamos Google Drive, Dropbox, Pixieset y WeTransfer.',
    badge: 'Próximamente',
  },
  pixieset: {
    title: 'Pixieset activo',
    description:
      'Pixieset está disponible. Pegá un enlace público de tu galería para buscar tus fotos.',
    badge: 'Activo',
  },
  wetransfer: {
    title: 'WeTransfer activo',
    description:
      'WeTransfer está disponible. Pegá un enlace público de tu transfer para buscar tus fotos.',
    badge: 'Activo',
  },
}

export function ProviderComingSoon({ provider, onBack }: ProviderComingSoonProps) {
  const meta = getProviderMeta(provider)
  const Icon = ICONS[provider] ?? FolderOpen
  const content = provider !== 'unknown' && provider !== 'google-drive'
    ? MESSAGES[provider]
    : {
        title: 'Proveedor no disponible',
        description: 'No pudimos procesar este enlace todavía.',
        badge: 'Próximamente',
      }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center min-h-screen px-6 pt-24 pb-16"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="glass rounded-3xl p-10 md:p-14 max-w-xl w-full text-center glow-violet"
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Icon className="w-10 h-10 text-accent-bright" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-surface border border-border-subtle flex items-center justify-center">
              {provider === 'dropbox' ? (
                <Wrench className="w-4 h-4 text-amber-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-violet-soft" />
              )}
            </div>
          </div>
        </div>

        <Badge variant={provider === 'dropbox' ? 'amber' : 'violet'} className="mb-4">
          {content.badge}
        </Badge>

        <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
          {content.title}
        </h2>

        <p className="text-text-muted leading-relaxed mb-2">
          {content.description}
        </p>

        {meta && (
          <p className="text-sm text-text-dim font-mono truncate max-w-full mb-8">
            {meta.label}
          </p>
        )}

        <Button variant="secondary" onClick={onBack} className="w-full md:w-auto">
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </Button>
      </motion.div>
    </motion.div>
  )
}
