import { useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import {
  getReferenceErrorMessage,
  selectReferenceFace,
} from '../../lib/recognition/referenceClient'
import { faceThumbnailCrop } from '../../lib/recognition/faceBoxLayout'
import { FaceImageCanvas } from './FaceImageCanvas'
import type { DetectedFace, FaceBox, ReferenceQualityTier, ValidateReferenceSuccess } from '../../types/recognition'

interface FaceSelectorProps {
  previewUrl: string
  detectionToken: string
  faces: DetectedFace[]
  onSelected: (result: ValidateReferenceSuccess) => void
  onError: (message: string) => void
}

export function FaceSelector({
  previewUrl,
  detectionToken,
  faces,
  onSelected,
  onError,
}: FaceSelectorProps) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(
    faces.length === 1 ? faces[0].index : null,
  )
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const highlightedIndex = hoverIndex ?? pendingIndex
  const pendingFace = pendingIndex !== null
    ? faces.find((f) => f.index === pendingIndex)
    : null

  const confirmSelection = async () => {
    if (pendingIndex === null || loading) return

    setLoading(true)
    onError('')

    const result = await selectReferenceFace(detectionToken, pendingIndex)
    if (!result.ok) {
      setLoading(false)
      onError(getReferenceErrorMessage(result.error.code, result.error.message))
      return
    }

    onSelected({
      ok: true,
      referenceToken: result.referenceToken,
      faceBox: result.faceBox,
      confidence: result.confidence,
      qualityTier: result.qualityTier,
      qualityWarning: result.qualityWarning,
      expiresAt: result.expiresAt,
    })
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-text">Seleccioná la persona</p>
        <p className="text-xs text-text-muted mt-0.5">
          Elegí la cara que querés buscar en el álbum
        </p>
      </div>

      <FaceImageCanvas
        src={previewUrl}
        alt="Seleccionar persona"
        faces={faces}
        highlightedIndex={highlightedIndex}
        selectedIndex={pendingIndex}
        onFaceClick={setPendingIndex}
        maxHeight={280}
        interactive
      />

      <ul className="space-y-1.5">
        {faces.map((face, i) => {
          const isPending = pendingIndex === face.index
          const isHover = hoverIndex === face.index
          return (
            <li key={face.index}>
              <button
                type="button"
                disabled={loading}
                onMouseEnter={() => setHoverIndex(face.index)}
                onMouseLeave={() => setHoverIndex(null)}
                onClick={() => setPendingIndex(face.index)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 min-h-[52px] rounded-lg border text-left transition-all',
                  isPending
                    ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                    : isHover
                      ? 'border-border bg-surface/80'
                      : 'border-border/60 bg-surface/40 hover:border-border hover:bg-surface/70',
                  loading && !isPending && 'opacity-50',
                )}
              >
                <FaceThumbnail previewUrl={previewUrl} faceBox={face.faceBox} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text">Persona {i + 1}</span>
                  <span className="block text-[11px] text-text-muted truncate">
                    {tierDescription(face.qualityTier)}
                  </span>
                </span>
                <QualityBadge tier={face.qualityTier} />
                {isPending && (
                  <Check className="w-4 h-4 text-accent shrink-0" />
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {pendingFace?.qualityTier === 'medium' && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-100/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Esta referencia es aceptable. Puede que encontremos menos fotos. Para mejores resultados,
            usá una foto más frontal y con mejor luz.
          </p>
        </div>
      )}

      <Button
        type="button"
        size="md"
        variant="primary"
        className="w-full"
        disabled={pendingIndex === null || loading}
        onClick={() => void confirmSelection()}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continuar con esta referencia
      </Button>
    </div>
  )
}

function QualityBadge({ tier }: { tier?: ReferenceQualityTier }) {
  if (tier === 'high') {
    return (
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        Buena
      </span>
    )
  }
  if (tier === 'medium') {
    return (
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-200 border border-amber-500/30">
        Aceptable
      </span>
    )
  }
  if (tier === 'low') {
    return (
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-300 border border-red-500/25">
        Difícil
      </span>
    )
  }
  return null
}

function tierDescription(tier?: ReferenceQualityTier): string {
  if (tier === 'high') return 'Referencia de buena calidad'
  if (tier === 'medium') return 'Referencia aceptable'
  if (tier === 'low') return 'Puede no servir como referencia'
  return 'Cara detectada'
}

function FaceThumbnail({ previewUrl, faceBox }: { previewUrl: string; faceBox: FaceBox }) {
  const crop = faceThumbnailCrop(faceBox)

  return (
    <div className="w-11 h-11 rounded-full overflow-hidden bg-bg-elevated shrink-0 ring-1 ring-border/80 relative">
      <img
        src={previewUrl}
        alt=""
        className="absolute max-w-none object-cover"
        style={{
          width: `${100 / crop.width}%`,
          height: `${100 / crop.height}%`,
          left: `${-crop.left / crop.width * 100}%`,
          top: `${-crop.top / crop.height * 100}%`,
        }}
      />
    </div>
  )
}

export function ValidatedBadge({ qualityTier }: { qualityTier?: ReferenceQualityTier }) {
  if (qualityTier === 'medium') {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/90 text-white text-[10px]">
        <AlertTriangle className="w-3 h-3" />
        Referencia aceptable
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/90 text-white text-[10px]">
      <Check className="w-3 h-3" />
      Buena referencia
    </div>
  )
}
