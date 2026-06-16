import { AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ErrorBannerProps {
  message: string
  className?: string
}

export function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl',
        'bg-red-500/10 border border-red-500/20 text-red-300 text-sm',
        className
      )}
      role="alert"
    >
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  )
}
