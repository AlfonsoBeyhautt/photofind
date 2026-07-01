import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

/** Acceso discreto al panel de operaciones — solo si el backend lo autorizó. */
export function OperatorAccessCard({ className }: { className?: string }) {
  const { operatorAccess } = useAuth()
  if (!operatorAccess) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Link
        to="/admin"
        className="glass rounded-xl px-4 py-3 flex items-center justify-between gap-3 border border-border/40 text-sm text-text-muted hover:text-text hover:border-border/70 transition-colors min-h-[44px]"
      >
        <span className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 shrink-0" />
          Operaciones
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
      </Link>
    </motion.div>
  )
}

/** Variante compacta para la página de perfil. */
export function OperatorAccessButton() {
  const { operatorAccess } = useAuth()
  if (!operatorAccess) return null

  return (
    <Link to="/admin" className="w-full sm:w-auto">
      <button
        type="button"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-text-muted hover:text-text hover:bg-white/5 border border-transparent hover:border-border/50 transition-colors min-h-[44px]"
      >
        <BarChart3 className="w-4 h-4" />
        Operaciones
      </button>
    </Link>
  )
}
