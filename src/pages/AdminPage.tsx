import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, Search, FolderOpen, Cloud, Cpu, DollarSign, AlertTriangle,
  Shield, RefreshCw, Loader2, UserPlus, BarChart3,
} from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { ErrorBanner } from '../components/ui/ErrorBanner'
import type { AdminMetrics, QualityMetrics } from '../types/admin'
import {
  addAdminByEmail,
  errorSourceLabel,
  fetchAdminMetrics,
  fetchQualityMetrics,
  formatAdminDate,
  providerAdminLabel,
} from '../lib/admin/adminClient'

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="glass rounded-2xl p-5 border border-border/50">
      <p className="text-sm text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-display font-bold">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-2">{sub}</p>}
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-display font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ProviderGrid({ searches, albums }: { searches: Record<string, number>; albums: Record<string, number> }) {
  const providers = new Set([...Object.keys(searches), ...Object.keys(albums)])
  if (providers.size === 0) {
    return <p className="text-sm text-text-muted">Sin datos de proveedores todavía.</p>
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[...providers].sort().map((p) => (
        <div key={p} className="glass rounded-xl p-4 border border-border/40 text-sm">
          <p className="font-medium mb-2">{providerAdminLabel(p)}</p>
          <p className="text-text-muted">Búsquedas: <span className="text-text">{searches[p] ?? 0}</span></p>
          <p className="text-text-muted">Álbumes: <span className="text-text">{albums[p] ?? 0}</span></p>
        </div>
      ))}
    </div>
  )
}

export function AdminPage() {
  const [access, setAccess] = useState<'loading' | 'denied' | 'ready'>('loading')
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [adminActionMsg, setAdminActionMsg] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null)
    if (silent) setRefreshing(true)
    const [metricsRes, qualityRes] = await Promise.all([
      fetchAdminMetrics(),
      fetchQualityMetrics(),
    ])
    if (silent) setRefreshing(false)
    if (!metricsRes.ok) {
      if (metricsRes.error.code === 'AUTH_REQUIRED') {
        setAccess('denied')
        return
      }
      if (metricsRes.error.code === 'NOT_FOUND') {
        setAccess('denied')
        return
      }
      setError(metricsRes.error.message)
      setAccess('ready')
      return
    }
    setMetrics(metricsRes.metrics)
    if (qualityRes.ok) {
      setQualityMetrics(qualityRes.metrics)
    }
    setAccess('ready')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminActionMsg(null)
    const res = await addAdminByEmail(newAdminEmail.trim())
    if (!res.ok) {
      setAdminActionMsg(res.error.message)
      return
    }
    setNewAdminEmail('')
    setAdminActionMsg(`Administrador agregado: ${res.admin.email}`)
    void load(true)
  }

  if (access === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted">
        Cargando…
      </div>
    )
  }

  if (access === 'denied') {
    return <Navigate to="/dashboard" replace />
  }

  const m = metrics

  return (
    <div className="min-h-screen bg-bg text-text relative overflow-hidden">
      <GlowOrbs />
      <Navbar />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 safe-x">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-accent" />
              <span className="text-sm text-text-muted">Operaciones</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">Admin Panel</h1>
            {m && (
              <p className="text-sm text-text-muted mt-1">
                Actualizado: {formatAdminDate(m.generatedAt)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Actualizar
            </Button>
            <Link to="/dashboard">
              <Button variant="secondary" size="sm">Dashboard</Button>
            </Link>
          </div>
        </div>

        {error && <ErrorBanner message={error} className="mb-6" />}

        {!m ? (
          <p className="text-text-muted">No hay métricas disponibles.</p>
        ) : (
          <div className="space-y-10">
            <Section title="Usuarios" icon={Users}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label="Registrados" value={m.users.totalRegistered} />
                <MetricCard label="Nuevos (7 días)" value={m.users.newLast7Days} />
                <MetricCard label="Nuevos (30 días)" value={m.users.newLast30Days} />
                <MetricCard
                  label="Activos (30 días)"
                  value={m.users.activeLast30Days ?? '—'}
                  sub={m.users.activeNote ?? undefined}
                />
              </div>
              <div className="grid lg:grid-cols-2 gap-4 mt-4">
                <div className="glass rounded-2xl p-5 border border-border/50">
                  <p className="text-sm font-medium mb-3">Registros recientes</p>
                  {m.users.recentRegistrations.length === 0 ? (
                    <p className="text-sm text-text-muted">Sin registros.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {m.users.recentRegistrations.map((u) => (
                        <li key={u.id} className="flex justify-between gap-2">
                          <span className="truncate">{u.email}</span>
                          <span className="text-text-muted shrink-0">{formatAdminDate(u.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="glass rounded-2xl p-5 border border-border/50">
                  <p className="text-sm font-medium mb-3">Top búsquedas por usuario</p>
                  <p className="text-xs text-text-muted mb-2">Perfiles faciales: {m.users.profilesWithFacialData}</p>
                  {m.users.topBySearches.length === 0 ? (
                    <p className="text-sm text-text-muted">Sin búsquedas registradas.</p>
                  ) : (
                    <ul className="space-y-2 text-sm font-mono text-xs">
                      {m.users.topBySearches.map((u) => (
                        <li key={u.userId} className="flex justify-between">
                          <span className="truncate">{u.userId.slice(0, 8)}…</span>
                          <span>{u.searchCount}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Búsquedas" icon={Search}>
              <div className="grid sm:grid-cols-3 gap-3">
                <MetricCard label="Total (con cuenta)" value={m.searches.totalLogged} sub={m.searches.anonymousNote} />
                <MetricCard label="Con coincidencias" value={m.searches.withMatches} />
                <MetricCard label="Sin coincidencias" value={m.searches.withoutMatches} />
              </div>
              <div className="glass rounded-2xl p-5 border border-border/50 mt-4 overflow-x-auto">
                <p className="text-sm font-medium mb-3">Recientes</p>
                {m.searches.recent.length === 0 ? (
                  <p className="text-sm text-text-muted">Sin búsquedas.</p>
                ) : (
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-border/50">
                        <th className="pb-2 pr-3">Álbum</th>
                        <th className="pb-2 pr-3">Proveedor</th>
                        <th className="pb-2 pr-3">Fotos</th>
                        <th className="pb-2">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.searches.recent.map((s) => (
                        <tr key={s.id} className="border-b border-border/30 last:border-0">
                          <td className="py-2 pr-3 max-w-[200px] truncate">{s.albumName}</td>
                          <td className="py-2 pr-3">{providerAdminLabel(s.provider)}</td>
                          <td className="py-2 pr-3">{s.photosFound}</td>
                          <td className="py-2 text-text-muted">{formatAdminDate(s.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Section>

            {qualityMetrics && (
              <Section title="Calidad del reconocimiento" icon={BarChart3}>
                <p className="text-xs text-text-muted">
                  Umbral configurado: {qualityMetrics.configuredThreshold}% · Telemetría desde migración 009
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                  <MetricCard label="Ejecuciones" value={qualityMetrics.runs.total} />
                  <MetricCard label="Completadas" value={qualityMetrics.runs.completed} />
                  <MetricCard label="Abandonadas" value={qualityMetrics.runs.abandoned} />
                  <MetricCard label="Cero resultados" value={qualityMetrics.runs.zeroResults} />
                  <MetricCard label="Prom. coincidencias" value={qualityMetrics.runs.avgMatchesFound} />
                  <MetricCard label="Prom. descargas" value={qualityMetrics.runs.avgDownloads} />
                  <MetricCard label="Descarga inmediata" value={qualityMetrics.runs.immediateDownloads} />
                  <MetricCard label="Búsquedas repetidas" value={qualityMetrics.runs.repeatSearches} />
                  <MetricCard
                    label="Prom. similitud máx."
                    value={qualityMetrics.runs.avgSimilarityMax ?? '—'}
                  />
                  <MetricCard
                    label="Prom. tiempo total"
                    value={qualityMetrics.runs.avgMsTotal != null ? `${Math.round(qualityMetrics.runs.avgMsTotal / 1000)}s` : '—'}
                  />
                  <MetricCard label="Collection search" value={qualityMetrics.runs.collectionSearch} />
                  <MetricCard label="Compare fallback" value={qualityMetrics.runs.compareFallback} />
                </div>

                {qualityMetrics.byProvider.length > 0 && (
                  <div className="glass rounded-2xl p-5 border border-border/50 mt-4 overflow-x-auto">
                    <p className="text-sm font-medium mb-3">Por proveedor</p>
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="text-left text-text-muted border-b border-border/50">
                          <th className="pb-2 pr-3">Proveedor</th>
                          <th className="pb-2 pr-3">Runs</th>
                          <th className="pb-2 pr-3">Prom. matches</th>
                          <th className="pb-2 pr-3">Cero result.</th>
                          <th className="pb-2">Con descarga</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityMetrics.byProvider.map((row) => (
                          <tr key={row.provider} className="border-b border-border/30 last:border-0">
                            <td className="py-2 pr-3">{providerAdminLabel(row.provider)}</td>
                            <td className="py-2 pr-3">{row.runs}</td>
                            <td className="py-2 pr-3">{row.avgMatches}</td>
                            <td className="py-2 pr-3">{row.zeroResults}</td>
                            <td className="py-2">{row.withDownloads}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid lg:grid-cols-2 gap-4 mt-4">
                  <div className="glass rounded-2xl p-5 border border-border/50">
                    <p className="text-sm font-medium mb-3">Agrupación Premium</p>
                    <p className="text-sm text-text-muted">
                      Snapshots: {qualityMetrics.grouping.totalSnapshots}
                    </p>
                    <p className="text-sm text-text-muted">
                      Prom. grupos visibles: {qualityMetrics.grouping.avgVisibleGroups}
                    </p>
                    <p className="text-sm text-text-muted">
                      Prom. fusionados: {qualityMetrics.grouping.avgGroupsMerged}
                    </p>
                    <p className="text-sm text-text-muted">
                      Prom. sin agrupar: {qualityMetrics.grouping.avgUngroupedFaces}
                    </p>
                    <p className="text-sm text-text-muted">
                      Prom. baja confianza: {qualityMetrics.grouping.avgLowConfidenceGroups}
                    </p>
                  </div>
                  <div className="glass rounded-2xl p-5 border border-border/50 overflow-x-auto">
                    <p className="text-sm font-medium mb-3">Runs recientes</p>
                    {qualityMetrics.recentRuns.length === 0 ? (
                      <p className="text-sm text-text-muted">Sin telemetría todavía.</p>
                    ) : (
                      <table className="w-full text-sm min-w-[480px]">
                        <thead>
                          <tr className="text-left text-text-muted border-b border-border/50">
                            <th className="pb-2 pr-3">Método</th>
                            <th className="pb-2 pr-3">Matches</th>
                            <th className="pb-2 pr-3">Desc.</th>
                            <th className="pb-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qualityMetrics.recentRuns.map((run) => (
                            <tr key={run.runId} className="border-b border-border/30 last:border-0">
                              <td className="py-2 pr-3 text-xs">{run.searchMethod ?? '—'}</td>
                              <td className="py-2 pr-3">{run.matchesFound}</td>
                              <td className="py-2 pr-3">{run.imagesDownloaded}</td>
                              <td className="py-2 text-xs text-text-muted">{run.outcome}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </Section>
            )}

            <Section title="Álbumes" icon={FolderOpen}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label="Colecciones" value={m.albums.totalCollections} />
                <MetricCard label="Listos" value={m.albums.ready} />
                <MetricCard label="En proceso" value={m.albums.inProcess} />
                <MetricCard label="Fallidos" value={m.albums.failed} />
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                <MetricCard label="Imágenes indexadas" value={m.albums.totalIndexedImages.toLocaleString('es-AR')} />
                <MetricCard label="Caras indexadas" value={m.albums.totalIndexedFaces.toLocaleString('es-AR')} />
                <MetricCard
                  label="Reutilizados"
                  value={m.albums.reusedAlbums ?? '—'}
                  sub={m.albums.reusedNote ?? undefined}
                />
              </div>
              {m.albums.faceRowsInDb != null && (
                <p className="text-xs text-text-muted mt-2">
                  Filas en album_collection_faces: {m.albums.faceRowsInDb.toLocaleString('es-AR')}
                </p>
              )}
            </Section>

            <Section title="Proveedores" icon={Cloud}>
              <ProviderGrid searches={m.providers.searchesByProvider} albums={m.providers.albumsByProvider} />
            </Section>

            <Section title="Jobs y performance" icon={Cpu}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <MetricCard label="Total jobs" value={m.jobs.total} />
                <MetricCard label="Activos" value={m.jobs.active} />
                <MetricCard label="Completados" value={m.jobs.completed} />
                <MetricCard label="Fallidos" value={m.jobs.failed} />
                <MetricCard
                  label="Tiempo prom."
                  value={m.jobs.avgProcessingSeconds != null ? `${m.jobs.avgProcessingSeconds}s` : '—'}
                  sub="Jobs completados con started_at y completed_at"
                />
              </div>
              {m.jobs.activeJobs.length > 0 && (
                <div className="glass rounded-2xl p-5 border border-border/50 mt-4">
                  <p className="text-sm font-medium mb-3">Jobs activos</p>
                  <ul className="space-y-2 text-sm">
                    {m.jobs.activeJobs.map((j) => (
                      <li key={j.id} className="flex flex-wrap items-center gap-2 justify-between">
                        <span className="font-mono text-xs">{j.id.slice(0, 8)}…</span>
                        <Badge variant="default">{j.status}</Badge>
                        <span>{providerAdminLabel(j.provider)}</span>
                        <span className="text-text-muted">{j.processedImages}/{j.totalImages} imgs</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="glass rounded-2xl p-5 border border-border/50 mt-4">
                <p className="text-sm font-medium mb-2">Agrupaciones por persona</p>
                <p className="text-sm text-text-muted">
                  Total: {m.personGroupings.total} · SearchFaces: {m.personGroupings.totalSearchFacesCalls} · Grupos: {m.personGroupings.totalGroups}
                </p>
              </div>
            </Section>

            <Section title="Costos estimados (AWS)" icon={DollarSign}>
              <p className="text-xs text-text-muted">{m.costEstimates.disclaimer}</p>
              <div className="glass rounded-2xl p-5 border border-border/50 mt-2">
                <p className="text-2xl font-display font-bold mb-4">
                  ~${m.costEstimates.totalEstimatedUsd.toFixed(2)} {m.costEstimates.currency}
                </p>
                <ul className="space-y-3 text-sm">
                  {m.costEstimates.lines.map((line) => (
                    <li key={line.label} className="border-b border-border/30 pb-2 last:border-0">
                      <div className="flex justify-between gap-2">
                        <span>{line.label}</span>
                        <span className={line.available ? '' : 'text-text-muted'}>
                          {line.available
                            ? `~$${line.estimatedUsd.toFixed(2)}`
                            : 'No disponible'}
                        </span>
                      </div>
                      {line.available && (
                        <p className="text-xs text-text-muted mt-0.5">
                          {line.quantity.toLocaleString('es-AR')} {line.unitLabel} × ${line.unitCostUsd}
                        </p>
                      )}
                      {line.note && <p className="text-xs text-text-muted mt-0.5">{line.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            <Section title="Errores recientes" icon={AlertTriangle}>
              {m.errors.length === 0 ? (
                <p className="text-sm text-text-muted">Sin errores recientes en jobs, colecciones o agrupaciones.</p>
              ) : (
                <ul className="space-y-2">
                  {m.errors.map((err) => (
                    <motion.li
                      key={`${err.source}-${err.id}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass rounded-xl p-4 border border-red-500/20 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="default">{errorSourceLabel(err.source)}</Badge>
                        <span className="text-xs text-text-muted">{formatAdminDate(err.at)}</span>
                      </div>
                      <p className="text-text-muted break-words">{err.message}</p>
                    </motion.li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Administradores" icon={Shield}>
              <div className="glass rounded-2xl p-5 border border-border/50">
                <ul className="space-y-2 text-sm mb-4">
                  {m.admins.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{a.email}</span>
                      <span className="text-text-muted text-xs">{formatAdminDate(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
                <form onSubmit={(e) => void handleAddAdmin(e)} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="email@ejemplo.com"
                    className="flex-1 rounded-xl bg-bg/80 border border-border px-3 py-2 text-sm min-h-[44px]"
                    autoComplete="off"
                  />
                  <Button type="submit" size="sm" className="min-h-[44px]">
                    <UserPlus className="w-4 h-4" />
                    Agregar admin
                  </Button>
                </form>
                {adminActionMsg && (
                  <p className="text-xs text-text-muted mt-2">{adminActionMsg}</p>
                )}
              </div>
            </Section>
          </div>
        )}
      </main>
    </div>
  )
}
