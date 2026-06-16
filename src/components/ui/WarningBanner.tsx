import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface WarningBannerProps {
  message: string
  className?: string
}

export function WarningBanner({ message, className }: WarningBannerProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl',
        'bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm',
        className,
      )}
      role="status"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  )
}
