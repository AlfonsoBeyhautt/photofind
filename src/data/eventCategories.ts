/** Organisational event labels — never used by recognition pipelines. */

export type EventCategory =
  | 'boda'
  | 'cumpleanos'
  | 'graduacion'
  | 'corporativo'
  | 'fiesta'
  | 'deportivo'
  | 'viaje'
  | 'familiar'
  | 'otro'

export interface EventCategoryInfo {
  id: EventCategory
  label: string
  emoji: string
}

export const EVENT_CATEGORIES: EventCategoryInfo[] = [
  { id: 'boda', label: 'Boda', emoji: '💍' },
  { id: 'cumpleanos', label: 'Cumpleaños', emoji: '🎂' },
  { id: 'graduacion', label: 'Graduación', emoji: '🎓' },
  { id: 'corporativo', label: 'Evento corporativo', emoji: '💼' },
  { id: 'fiesta', label: 'Fiesta', emoji: '🎉' },
  { id: 'deportivo', label: 'Deportivo', emoji: '🏃' },
  { id: 'viaje', label: 'Viaje', emoji: '✈️' },
  { id: 'familiar', label: 'Familiar', emoji: '👨‍👩‍👧' },
  { id: 'otro', label: 'Otro', emoji: '📷' },
]

export function eventCategoryLabel(categoryId: string | null | undefined): string | null {
  if (!categoryId?.trim()) return null
  return EVENT_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId
}

export function isEventCategory(value: string): value is EventCategory {
  return EVENT_CATEGORIES.some((c) => c.id === value)
}
