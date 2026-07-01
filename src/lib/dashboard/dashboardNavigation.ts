import type { EventCategory } from '../eventCategories'

export interface DashboardStartSearchState {
  albumUrl: string
  eventCategory?: EventCategory | string | null
  mode?: 'search' | 'group'
}

export interface DashboardViewResultsState {
  albumUrl: string
  eventCategory?: EventCategory | string | null
  matchedImageIds: string[]
  analyzedCount?: number
  searchMethod?: string
}
