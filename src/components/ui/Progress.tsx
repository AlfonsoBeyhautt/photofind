import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface ProgressProps {
  value: number
  className?: string
  showGlow?: boolean
}

export function Progress({ value, className, showGlow = false }: ProgressProps) {
  return (
    <div className={cn('h-2 rounded-full bg-surface overflow-hidden', className)}>
      <motion.div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-accent to-violet',
          showGlow && 'shadow-[0_0_20px_rgba(59,130,246,0.5)]'
        )}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value)}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
}
