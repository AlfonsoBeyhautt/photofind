import { cn } from '../../lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'accent' | 'success' | 'violet' | 'amber'
  className?: string
}

const variants = {
  default: 'bg-surface text-text-muted border-border',
  accent: 'bg-accent/10 text-accent-bright border-accent/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  violet: 'bg-violet/10 text-violet-soft border-violet/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
