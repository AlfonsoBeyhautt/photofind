import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Progress } from '../ui/Progress'
import { providerLabel } from '../../lib/auth/authClient'
import {
  activeJobActionLabel,
  activeJobActionNeedsRetry,
  activeJobStatusLabel,
  activeJobStatusVariant,
  type ResumableAlbumJob,
} from '../../lib/recognition/activeAlbumJobs'
import type { ActiveAlbumJobStatus } from '../../types/auth'

interface ActiveAlbumJobsSectionProps {
  jobs: ResumableAlbumJob[]
  polling?: boolean
  onDismiss: (jobId: string) => Promise<{ ok: true } | { ok: false; message: string }>
}

export function ActiveAlbumJobsSection({ jobs, polling, onDismiss }: ActiveAlbumJobsSectionProps) {
  const navigate = useNavigate()
  const [dismissError, setDismissError] = useState<string | null>(null)

  if (jobs.length === 0) return null

  const handleAction = (job: ResumableAlbumJob) => {
    navigate('/', {
      state: {
        resumeAlbumJob: {
          albumUrl: job.albumUrl,
          referenceToken: job.referenceToken,
          retry: activeJobActionNeedsRetry(job.status),
        },
      },
    })
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="mb-8"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display font-semibold text-xl flex items-center gap-2">
          <RefreshCw className={`w-5 h-5 text-accent-bright ${polling ? 'animate-spin' : ''}`} />
          Análisis en curso
        </h2>
        {polling && (
          <span className="text-xs text-text-dim flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Actualizando
          </span>
        )}
      </div>

      {dismissError && (
        <p className="text-sm text-amber-300 mb-3">{dismissError}</p>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <ActiveAlbumJobCard
            key={job.jobId}
            job={job}
            onAction={() => handleAction(job)}
            onDismiss={async () => {
              setDismissError(null)
              const inProgress = isInProgress(job.status)
              const confirmed = window.confirm(
                inProgress
                  ? '¿Cancelar este análisis? Ya no aparecerá en tu dashboard.'
                  : '¿Eliminar este análisis de la lista?',
              )
              if (!confirmed) return

              const result = await onDismiss(job.jobId)
              if (!result.ok) {
                setDismissError(result.message)
              }
            }}
          />
        ))}
      </div>
    </motion.section>
  )
}

function ActiveAlbumJobCard({
  job,
  onAction,
  onDismiss,
}: {
  job: ResumableAlbumJob
  onAction: () => void
  onDismiss: () => Promise<void>
}) {
  const inProgress = isInProgress(job.status)
  const showProgress = inProgress || job.status === 'ready'
  const [dismissing, setDismissing] = useState(false)

  const handleDismiss = async () => {
    setDismissing(true)
    try {
      await onDismiss()
    } finally {
      setDismissing(false)
    }
  }

  return (
    <div className="glass rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="font-medium truncate">{job.albumName ?? 'Álbum en proceso'}</p>
            <Badge variant={activeJobStatusVariant(job.status)}>
              {activeJobStatusLabel(job.status)}
            </Badge>
          </div>

          <p className="text-sm text-text-muted mb-2">{job.message}</p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim mb-3">
            <span>{providerLabel(job.provider)}</span>
            {showProgress && (
              <>
                <span>·</span>
                <span className="font-mono">
                  {job.indexedImages.toLocaleString()} / {job.totalImages.toLocaleString()} fotos
                </span>
                <span>·</span>
                <span className="font-mono text-accent-bright">{job.progressPercent}%</span>
              </>
            )}
            {job.failedImages > 0 && (
              <>
                <span>·</span>
                <span>{job.failedImages} con error</span>
              </>
            )}
          </div>

          {showProgress && (
            <Progress value={job.progressPercent} className="h-2" />
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
          <Button
            size="md"
            variant={job.status === 'failed' ? 'outline' : 'primary'}
            className="w-full sm:w-auto"
            onClick={onAction}
          >
            {activeJobActionLabel(job.status)}
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="w-full sm:w-auto text-text-muted hover:text-red-300"
            disabled={dismissing}
            onClick={() => void handleDismiss()}
            aria-label="Eliminar análisis"
          >
            {dismissing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  )
}

function isInProgress(status: ActiveAlbumJobStatus): boolean {
  return status === 'pending' || status === 'processing' || status === 'retrying'
}
