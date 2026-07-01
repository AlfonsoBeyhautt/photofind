import { EVENT_CATEGORIES, eventCategoryLabel, type EventCategory, type EventCategoryInfo } from '../lib/eventCategories'

export type { EventCategory, EventCategoryInfo }
export { EVENT_CATEGORIES, eventCategoryLabel }

export interface DetectedPerson {
  id: string
  name: string
  photoCount: number
  avatarSeed: number
  confidence: number
}

export const DETECTED_PEOPLE: DetectedPerson[] = [
  { id: 'p1', name: 'Persona A', photoCount: 143, avatarSeed: 12, confidence: 98 },
  { id: 'p2', name: 'Persona B', photoCount: 92, avatarSeed: 34, confidence: 95 },
  { id: 'p3', name: 'Persona C', photoCount: 57, avatarSeed: 56, confidence: 91 },
  { id: 'p4', name: 'Persona D', photoCount: 41, avatarSeed: 78, confidence: 88 },
  { id: 'p5', name: 'Persona E', photoCount: 28, avatarSeed: 90, confidence: 85 },
]

export interface SearchHistory {
  id: string
  albumName: string
  eventType: string
  photosFound: number
  date: string
  thumbnailSeed: number
}

export const SEARCH_HISTORY: SearchHistory[] = [
  { id: 's1', albumName: 'Casamiento Martín & Laura', eventType: 'Casamiento', photosFound: 87, date: '8 Jun 2026', thumbnailSeed: 101 },
  { id: 's2', albumName: 'Fiesta de fin de año', eventType: 'Fiesta', photosFound: 124, date: '2 Jun 2026', thumbnailSeed: 202 },
  { id: 's3', albumName: 'Torneo regional 2026', eventType: 'Fútbol', photosFound: 56, date: '28 May 2026', thumbnailSeed: 303 },
  { id: 's4', albumName: 'Viaje Bariloche', eventType: 'Viaje', photosFound: 203, date: '15 May 2026', thumbnailSeed: 404 },
]

export interface RecentAlbum {
  id: string
  name: string
  source: string
  totalPhotos: number
  processedAt: string
  coverSeed: number
}

export const RECENT_ALBUMS: RecentAlbum[] = [
  { id: 'a1', name: 'Casamiento Martín & Laura', source: 'Pixieset', totalPhotos: 2843, processedAt: 'Hace 2 días', coverSeed: 501 },
  { id: 'a2', name: 'Fiesta de fin de año', source: 'Google Drive', totalPhotos: 1520, processedAt: 'Hace 5 días', coverSeed: 502 },
  { id: 'a3', name: 'Graduación 2026', source: 'Dropbox', totalPhotos: 890, processedAt: 'Hace 1 semana', coverSeed: 503 },
]

export function generatePhotoUrls(count: number, seed = 1): string[] {
  return Array.from({ length: count }, (_, i) =>
    `https://picsum.photos/seed/${seed + i * 7}/600/600`
  )
}

export const MOCK_USER = {
  name: 'Alfonso Beyhaut',
  email: 'alfonso@email.com',
  avatarSeed: 42,
  memberSince: 'Marzo 2026',
  stats: {
    totalSearches: 24,
    photosFound: 1847,
    albumsProcessed: 12,
    avgConfidence: 94,
  },
}

export const PROCESSING_STATS = {
  totalPhotos: 2843,
  analyzed: 1892,
  facesDetected: 347,
  matchesFound: 87,
}
