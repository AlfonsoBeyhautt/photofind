import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { GlowOrbs } from '../effects/GlowOrbs'
import { ParticleBackground } from '../effects/ParticleBackground'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen min-h-dvh overflow-y-auto safe-x safe-bottom">
      <GlowOrbs />
      <ParticleBackground />

      <div className="relative z-10 flex min-h-screen min-h-dvh items-start sm:items-center justify-center px-4 sm:px-6 py-8 sm:py-24 page-top">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-md my-auto"
        >
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-6 sm:mb-8 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-violet flex items-center justify-center shadow-lg shadow-accent/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">PhotoFind</span>
          </Link>

          <div className="glass rounded-2xl p-5 sm:p-8 glow-blue">
            <h1 className="font-display text-2xl font-bold mb-2">{title}</h1>
            <p className="text-text-muted text-sm mb-6 sm:mb-8">{subtitle}</p>
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
