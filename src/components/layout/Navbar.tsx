import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, User, LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { userAvatarUrl } from '../../lib/auth/authClient'
import { Button } from '../ui/Button'

export function Navbar() {
  const { isLoggedIn, user, logout } = useAuth()
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between glass rounded-2xl px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-violet flex items-center justify-center shadow-lg shadow-accent/20 group-hover:shadow-accent/30 transition-shadow">
            <Sparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">PhotoFind</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {isHome && (
            <>
              <a href="#como-funciona" className="text-sm text-text-muted hover:text-text transition-colors">
                Cómo funciona
              </a>
              <a href="#premium" className="text-sm text-text-muted hover:text-text transition-colors">
                Premium
              </a>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLoggedIn && user ? (
            <>
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              </Link>
              <Link to="/perfil">
                <button className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-white/5 transition-colors">
                  <img
                    src={userAvatarUrl(user.id)}
                    alt={user.name}
                    className="w-8 h-8 rounded-full ring-2 ring-border"
                  />
                  <span className="hidden sm:inline text-sm font-medium">{user.name.split(' ')[0]}</span>
                </button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Iniciar sesión
                </Button>
              </Link>
              <Link to="/registro">
                <Button variant="primary" size="sm">
                  <User className="w-4 h-4" />
                  Crear cuenta
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  )
}
