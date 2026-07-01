export interface AdminMetrics {
  generatedAt: string
  users: {
    totalRegistered: number
    newLast7Days: number
    newLast30Days: number
    activeLast30Days: number | null
    activeNote: string | null
    profilesWithFacialData: number
    topBySearches: Array<{ userId: string; searchCount: number }>
    recentRegistrations: Array<{ id: string; email: string; createdAt: string }>
  }
  searches: {
    totalLogged: number
    withMatches: number
    withoutMatches: number
    anonymousNote: string
    recent: Array<{
      id: string
      userId: string
      albumName: string
      provider: string
      photosFound: number
      createdAt: string
    }>
  }
  albums: {
    totalCollections: number
    byStatus: Record<string, number>
    inProcess: number
    failed: number
    ready: number
    reusedAlbums: number | null
    reusedNote: string | null
    totalIndexedImages: number
    totalIndexedFaces: number
    faceRowsInDb: number | null
  }
  providers: {
    searchesByProvider: Record<string, number>
    albumsByProvider: Record<string, number>
  }
  jobs: {
    total: number
    active: number
    completed: number
    failed: number
    cancelled: number
    avgProcessingSeconds: number | null
    activeJobs: Array<{
      id: string
      status: string
      provider: string
      processedImages: number
      totalImages: number
      startedAt: string | null
      lastError: string | null
    }>
  }
  personGroupings: {
    total: number
    byStatus: Record<string, number>
    totalSearchFacesCalls: number
    totalGroups: number
  }
  costEstimates: {
    currency: 'USD'
    disclaimer: string
    totalEstimatedUsd: number
    lines: Array<{
      label: string
      quantity: number
      unitLabel: string
      unitCostUsd: number
      estimatedUsd: number
      available: boolean
      note?: string
    }>
  }
  errors: Array<{
    source: 'album_job' | 'album_collection' | 'person_grouping'
    id: string
    message: string
    at: string
    context?: string
  }>
  admins: Array<{
    id: string
    userId: string
    email: string
    createdAt: string
  }>
}

export interface AdminMetricsResponse {
  ok: true
  metrics: AdminMetrics
}

export interface AdminErrorResponse {
  ok: false
  error: { code: string; message: string }
}
