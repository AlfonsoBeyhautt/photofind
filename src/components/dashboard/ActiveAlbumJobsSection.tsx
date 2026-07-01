import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, RefreshCw } from 'lucide-react'
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
}

export function ActiveAlbumJobsSection({ jobs, polling }: ActiveAlbumJobsSectionProps) {
  const navigate = useNavigate()

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

      <div className="space-y-3">
        {jobs.map((job) => (
          <ActiveAlbumJobCard key={job.jobId} job={job} onAction={() => handleAction(job)} />
        ))}
      </div>
    </motion.section>
  )
}

function ActiveAlbumJobCard({
  job,
  onAction,
}: {
  job: ResumableAlbumJob
  onAction: () => void
}) {
  const inProgress = isInProgress(job.status)
  const showProgress = inProgress || job.status === 'ready'

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

        <Button
          size="md"
          variant={job.status === 'failed' ? 'outline' : 'primary'}
          className="w-full sm:w-auto shrink-0"
          onClick={onAction}
        >
          {activeJobActionLabel(job.status)}
        </Button>
      </div>
    </div>
  )
}

function isInProgress(status: ActiveAlbumJobStatus): boolean {
  return status === 'pending' || status === 'processing' || status === 'retrying'
}
