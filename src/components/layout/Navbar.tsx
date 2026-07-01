import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, User, LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { userAvatarUrl } from '../../lib/auth/authClient'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

export function Navbar() {
  const { isLoggedIn, user, logout } = useAuth()
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-3 sm:py-4 safe-top safe-x"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between glass rounded-2xl px-4 sm:px-6 py-3 gap-3">
        <Link to="/" className="flex items-center gap-2.5 group shrink-0 min-w-0">
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

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isHome && (
            <button
              type="button"
              className="md:hidden touch-target inline-flex items-center justify-center rounded-xl text-text-muted hover:text-text hover:bg-white/5 transition-colors"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          {isLoggedIn && user ? (
            <>
              <Link to="/dashboard" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="min-h-[44px]">
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              </Link>
              <Link to="/dashboard" className="sm:hidden touch-target inline-flex items-center justify-center rounded-xl hover:bg-white/5" aria-label="Dashboard">
                <LayoutDashboard className="w-5 h-5 text-text-muted" />
              </Link>
              <Link to="/perfil">
                <button
                  type="button"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors min-h-[44px]"
                  aria-label="Mi perfil"
                >
                  <img
                    src={userAvatarUrl(user.id)}
                    alt={user.name}
                    className="w-8 h-8 rounded-full ring-2 ring-border"
                  />
                  <span className="hidden sm:inline text-sm font-medium">{user.name.split(' ')[0]}</span>
                </button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] min-w-[44px] px-2.5"
                onClick={() => void logout()}
                aria-label="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="min-h-[44px] px-3 sm:px-4">
                  <span className="sm:hidden">Entrar</span>
                  <span className="hidden sm:inline">Iniciar sesión</span>
                </Button>
              </Link>
              <Link to="/registro">
                <Button variant="primary" size="sm" className="min-h-[44px] px-3 sm:px-4">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Crear cuenta</span>
                  <span className="sm:hidden">Cuenta</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && isHome && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="md:hidden max-w-7xl mx-auto mt-2 glass rounded-2xl p-3 safe-x"
          >
            <div className="flex flex-col">
              <a
                href="#como-funciona"
                className="px-4 py-3 rounded-xl text-sm text-text-muted hover:text-text hover:bg-white/5"
                onClick={() => setMobileOpen(false)}
              >
                Cómo funciona
              </a>
              <a
                href="#premium"
                className={cn('px-4 py-3 rounded-xl text-sm text-text-muted hover:text-text hover:bg-white/5')}
                onClick={() => setMobileOpen(false)}
              >
                Premium
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
