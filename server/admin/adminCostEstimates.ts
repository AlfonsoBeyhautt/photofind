/**
 * Estimaciones aproximadas de costo AWS Rekognition (us-east-1, referencia 2024).
 * Solo para monitoreo interno — no son facturación real.
 */
const USD_PER_INDEXED_FACE = 0.001
const USD_PER_SEARCH_FACES_BY_IMAGE = 0.001
const USD_PER_SEARCH_FACES = 0.001
const USD_PER_COMPARE_FACES = 0.001

export interface CostEstimateLine {
  label: string
  quantity: number
  unitLabel: string
  unitCostUsd: number
  estimatedUsd: number
  available: boolean
  note?: string
}

export interface CostEstimatesPayload {
  currency: 'USD'
  disclaimer: string
  totalEstimatedUsd: number
  lines: CostEstimateLine[]
}

export function buildCostEstimates(input: {
  totalIndexedFaces: number
  totalIndexedImages: number
  loggedSearches: number
  personGroupingSearchFacesCalls: number
  compareFacesFallbackCount: number | null
}): CostEstimatesPayload {
  const lines: CostEstimateLine[] = [
    {
      label: 'IndexFaces (caras indexadas)',
      quantity: input.totalIndexedFaces,
      unitLabel: 'caras',
      unitCostUsd: USD_PER_INDEXED_FACE,
      estimatedUsd: input.totalIndexedFaces * USD_PER_INDEXED_FACE,
      available: true,
      note: 'Basado en album_collection_faces / indexed_faces acumulado.',
    },
    {
      label: 'SearchFacesByImage (búsquedas con cuenta)',
      quantity: input.loggedSearches,
      unitLabel: 'búsquedas',
      unitCostUsd: USD_PER_SEARCH_FACES_BY_IMAGE,
      estimatedUsd: input.loggedSearches * USD_PER_SEARCH_FACES_BY_IMAGE,
      available: true,
      note: 'Solo búsquedas guardadas en search_history (usuarios logueados).',
    },
    {
      label: 'SearchFaces (agrupación por personas)',
      quantity: input.personGroupingSearchFacesCalls,
      unitLabel: 'llamadas',
      unitCostUsd: USD_PER_SEARCH_FACES,
      estimatedUsd: input.personGroupingSearchFacesCalls * USD_PER_SEARCH_FACES,
      available: true,
      note: 'Suma de search_faces_calls en album_person_groupings.',
    },
    {
      label: 'CompareFaces (fallback)',
      quantity: input.compareFacesFallbackCount ?? 0,
      unitLabel: 'comparaciones',
      unitCostUsd: USD_PER_COMPARE_FACES,
      estimatedUsd: (input.compareFacesFallbackCount ?? 0) * USD_PER_COMPARE_FACES,
      available: input.compareFacesFallbackCount != null,
      note: input.compareFacesFallbackCount == null
        ? 'No disponible — el fallback no se persiste en Supabase.'
        : undefined,
    },
  ]

  const totalEstimatedUsd = lines
    .filter((l) => l.available)
    .reduce((sum, l) => sum + l.estimatedUsd, 0)

  return {
    currency: 'USD',
    disclaimer: 'Estimación orientativa basada en tarifas públicas de Rekognition. No reemplaza la facturación de AWS.',
    totalEstimatedUsd: Math.round(totalEstimatedUsd * 100) / 100,
    lines,
  }
}
