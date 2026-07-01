import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, FolderOpen, Clock, Plus, User, Mail, Calendar, Loader2, AlertCircle,
} from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { ErrorBanner } from '../components/ui/ErrorBanner'
import { FacialProfileSection } from '../components/account/FacialProfileSection'
import { ActiveAlbumJobsSection } from '../components/dashboard/ActiveAlbumJobsSection'
import { useAuth } from '../context/AuthContext'
import {
  fetchDashboard,
  formatMemberSince,
  formatRelativeTime,
  formatSearchDate,
  providerLabel,
  userAvatarUrl,
} from '../lib/auth/authClient'
import {
  jobFromStatusPayload,
  jobProgressFromPoll,
  matchResumableAlbumJobs,
  type ResumableAlbumJob,
} from '../lib/recognition/activeAlbumJobs'
import { clearActiveAlbumJob, pollAlbumJobStatus } from '../lib/recognition/albumJobClient'
import type { ProcessedAlbumItem, SearchHistoryItem } from '../types/auth'
import { EVENT_CATEGORIES } from '../data/mock'

function eventLabel(categoryId: string): string {
  return EVENT_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId
}

export function DashboardPage() {
  const { user, facialProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([])
  const [processedAlbums, setProcessedAlbums] = useState<ProcessedAlbumItem[]>([])
  const [activeAlbumJobs, setActiveAlbumJobs] = useState<ResumableAlbumJob[]>([])
  const [pollingJobs, setPollingJobs] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const data = await fetchDashboard()
      if (cancelled) return
      if (!data.ok) {
        setError(data.error.message)
        setLoading(false)
        return
      }
      setRecentSearches(data.recentSearches)
      setProcessedAlbums(data.processedAlbums)
      setActiveAlbumJobs(matchResumableAlbumJobs(data.activeAlbumJobs ?? []))
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [facialProfile])

  useEffect(() => {
    if (activeAlbumJobs.length === 0) return

    const inProgress = activeAlbumJobs.some((job) =>
      job.status === 'pending' || job.status === 'processing' || job.status === 'retrying',
    )
    if (!inProgress) return

    let cancelled = false

    const poll = async () => {
      const jobId = activeAlbumJobs[0]?.jobId
      if (!jobId) return

      setPollingJobs(true)
      const result = await pollAlbumJobStatus(jobId, (update) => {
        if (cancelled) return
        setActiveAlbumJobs((current) => {
          const job = current.find((item) => item.jobId === jobId)
          if (!job) return current
          return [jobProgressFromPoll(update, job)]
        })
      })
      setPollingJobs(false)

      if (cancelled) return

      if (!result.ok) {
        clearActiveAlbumJob()
        setActiveAlbumJobs([])
        return
      }

      setActiveAlbumJobs((current) => {
        const job = current.find((item) => item.jobId === jobId)
        if (!job) return current
        return [jobFromStatusPayload(result.status, job)]
      })
    }

    void poll()
    const interval = setInterval(() => { void poll() }, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeAlbumJobs.length, activeAlbumJobs[0]?.jobId, activeAlbumJobs[0]?.status])

  return (
    <div className="relative min-h-screen">
      <GlowOrbs />
      <Navbar />

      <div className="relative z-10 px-4 sm:px-6 page-top pb-16 safe-bottom max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            Hola, {user?.name.split(' ')[0] ?? 'Usuario'} 👋
          </h1>
          <p className="text-text-muted">Tu cuenta y actividad en PhotoFind</p>
        </motion.div>

        {error && (
          <div className="mb-6">
            <ErrorBanner message={error} />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-6 mb-8"
        >
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <img
              src={user ? userAvatarUrl(user.id) : ''}
              alt={user?.name}
              className="w-16 h-16 rounded-full ring-2 ring-accent/20 shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="font-display font-semibold text-lg">{user?.name}</p>
              <p className="text-sm text-text-muted flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                {user?.email}
              </p>
              {user?.createdAt && (
                <p className="text-xs text-text-dim flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Miembro desde {formatMemberSince(user.createdAt)}
                </p>
              )}
            </div>
            <Link to="/" className="w-full sm:w-auto shrink-0">
              <Button size="lg" className="w-full sm:w-auto">
                <Plus className="w-4 h-4" />
                Nueva búsqueda
              </Button>
            </Link>
          </div>
        </motion.div>

        <ActiveAlbumJobsSection jobs={activeAlbumJobs} polling={pollingJobs} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <FacialProfileSection compact />
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Cargando historial…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="font-display font-semibold text-xl flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-accent-bright" />
                Búsquedas recientes
              </h2>
              {recentSearches.length === 0 ? (
                <EmptyHistory
                  title="Todavía no tenés búsquedas guardadas"
                  description="Cuando completes una búsqueda estando logueado, aparecerá acá."
                />
              ) : (
                <div className="space-y-3">
                  {recentSearches.map((search) => (
                    <div
                      key={search.id}
                      className="glass rounded-xl p-4 flex items-center gap-4"
                    >
                      <div className="w-14 h-14 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                        <Search className="w-6 h-6 text-accent-bright" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{search.albumName}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge variant="default">{eventLabel(search.eventCategory)}</Badge>
                          <span className="text-xs text-text-dim">{providerLabel(search.provider)}</span>
                          <span className="text-xs text-text-dim flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(search.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-display font-bold text-accent-bright">{search.photosFound}</p>
                        <p className="text-xs text-text-dim">fotos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="font-display font-semibold text-xl flex items-center gap-2 mb-4">
                <FolderOpen className="w-5 h-5 text-violet-soft" />
                Álbumes procesados
              </h2>
              {processedAlbums.length === 0 ? (
                <EmptyHistory
                  title="Todavía no procesaste álbumes"
                  description="Cada álbum que analices quedará listado acá con su proveedor y fecha."
                />
              ) : (
                <div className="space-y-3">
                  {processedAlbums.map((album) => (
                    <div
                      key={album.albumUrl}
                      className="glass rounded-xl p-4 flex items-center gap-4"
                    >
                      <div className="w-14 h-14 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0">
                        <FolderOpen className="w-6 h-6 text-violet-soft" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{album.albumName}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-dim">
                          <span>{providerLabel(album.provider)}</span>
                          {album.totalPhotos != null && (
                            <>
                              <span>·</span>
                              <span>{album.totalPhotos.toLocaleString()} fotos en álbum</span>
                            </>
                          )}
                          {album.searchCount > 1 && (
                            <>
                              <span>·</span>
                              <span>{album.searchCount} búsquedas</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 text-xs text-text-muted">
                        {formatSearchDate(album.lastSearchedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-10 flex flex-wrap gap-3"
        >
          <Link to="/perfil">
            <Button variant="outline" size="sm">
              <User className="w-4 h-4" />
              Mi cuenta
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}

function EmptyHistory({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass rounded-xl p-8 text-center border border-dashed border-border">
      <AlertCircle className="w-8 h-8 mx-auto text-text-dim mb-3" />
      <p className="font-medium text-sm mb-1">{title}</p>
      <p className="text-xs text-text-muted">{description}</p>
    </div>
  )
}
