import { EVENT_CATEGORIES, type EventCategory } from '../../lib/eventCategories'
import { cn } from '../../lib/utils'

interface EventCategoryPickerProps {
  value: EventCategory | null
  onChange: (value: EventCategory | null) => void
  className?: string
}

export function EventCategoryPicker({ value, onChange, className }: EventCategoryPickerProps) {
  return (
    <div className={cn('mt-3 mx-1 p-3 rounded-xl bg-surface/40 border border-border-subtle', className)}>
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <p className="text-xs text-text-muted">Categoría del evento (opcional)</p>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-text-dim hover:text-text transition-colors"
          >
            Quitar
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(value === cat.id ? null : cat.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs transition-all',
              value === cat.id
                ? 'border-accent/40 bg-accent/10 text-accent-bright'
                : 'border-border bg-bg-elevated text-text-muted hover:border-border-subtle',
            )}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
