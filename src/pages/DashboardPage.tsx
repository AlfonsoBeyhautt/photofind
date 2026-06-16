import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, FolderOpen, Clock, ArrowRight, Plus, Image,
} from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { SEARCH_HISTORY, RECENT_ALBUMS } from '../data/mock'
import { useAuth } from '../context/AuthContext'

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="relative min-h-screen">
      <GlowOrbs />
      <Navbar />

      <div className="relative z-10 px-6 pt-28 pb-16 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
            Hola, {user?.name.split(' ')[0] ?? 'Usuario'} 👋
          </h1>
          <p className="text-text-muted">Tus búsquedas y álbumes recientes</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6 mb-10 glow-blue"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-lg mb-1">Nueva búsqueda</h2>
              <p className="text-sm text-text-muted">Pegá un enlace y encontrá tus fotos al instante</p>
            </div>
            <Link to="/">
              <Button size="lg">
                <Plus className="w-4 h-4" />
                Buscar fotos
              </Button>
            </Link>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-xl flex items-center gap-2">
                <Search className="w-5 h-5 text-accent-bright" />
                Búsquedas recientes
              </h2>
            </div>
            <div className="space-y-3">
              {SEARCH_HISTORY.map((search, i) => (
                <motion.div
                  key={search.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="glass rounded-xl p-4 flex items-center gap-4 hover:border-accent/20 transition-colors group cursor-pointer"
                >
                  <img
                    src={`https://picsum.photos/seed/${search.thumbnailSeed}/80/80`}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover ring-1 ring-border"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate group-hover:text-accent-bright transition-colors">
                      {search.albumName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="default">{search.eventType}</Badge>
                      <span className="text-xs text-text-dim flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {search.date}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-accent-bright">{search.photosFound}</p>
                    <p className="text-xs text-text-dim">fotos</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-xl flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-violet-soft" />
                Álbumes procesados
              </h2>
            </div>
            <div className="space-y-3">
              {RECENT_ALBUMS.map((album, i) => (
                <motion.div
                  key={album.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className="glass rounded-xl p-4 flex items-center gap-4 hover:border-violet/20 transition-colors group cursor-pointer"
                >
                  <img
                    src={`https://picsum.photos/seed/${album.coverSeed}/80/80`}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover ring-1 ring-border"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{album.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-text-dim">
                      <span>{album.source}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        {album.totalPhotos.toLocaleString()} fotos
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-text-muted">{album.processedAt}</p>
                    <ArrowRight className="w-4 h-4 text-text-dim mt-1 ml-auto group-hover:text-accent-bright transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  )
}
