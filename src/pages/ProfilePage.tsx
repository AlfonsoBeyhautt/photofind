import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, LogOut, LayoutDashboard } from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { FacialProfileSection } from '../components/account/FacialProfileSection'
import { useAuth } from '../context/AuthContext'
import { formatMemberSince, userAvatarUrl } from '../lib/auth/authClient'

export function ProfilePage() {
  const { user, logout } = useAuth()

  return (
    <div className="relative min-h-screen">
      <GlowOrbs />
      <Navbar />

      <div className="relative z-10 px-4 sm:px-6 page-top pb-16 safe-bottom max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 sm:p-8 mb-8 glow-blue"
        >
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <img
              src={user ? userAvatarUrl(user.id) : ''}
              alt={user?.name}
              className="w-28 h-28 rounded-full ring-4 ring-accent/20"
            />
            <div className="text-center sm:text-left flex-1">
              <h1 className="font-display text-2xl md:text-3xl font-bold mb-1">
                {user?.name}
              </h1>
              <p className="text-text-muted mb-3">{user?.email}</p>
              {user?.createdAt && (
                <Badge variant="accent">
                  <Calendar className="w-3 h-3 mr-1" />
                  Miembro desde {formatMemberSince(user.createdAt)}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <Link to="/dashboard" className="w-full sm:w-auto">
                <Button variant="outline" size="md" className="w-full sm:w-auto">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
              <Link to="/" className="w-full sm:w-auto">
                <Button variant="primary" size="md" className="w-full sm:w-auto">Nueva búsqueda</Button>
              </Link>
              <Button variant="ghost" size="md" className="w-full sm:w-auto" onClick={() => void logout()}>
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <FacialProfileSection />
        </motion.div>
      </div>
    </div>
  )
}
