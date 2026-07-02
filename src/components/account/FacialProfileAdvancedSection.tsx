import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { ErrorBanner } from '../ui/ErrorBanner'
import { FaceImageCanvas } from '../recognition/FaceImageCanvas'
import { normalizeReferenceToJpegBlob, captureVideoFrameToJpeg } from '../../lib/recognition/normalizeReferenceImage'
import { blobToBase64 } from '../../lib/recognition/referenceClient'
import {
  addProfileReference,
  addProfileReferenceFromSelection,
  deleteProfileReference,
  fetchProfileReferences,
  getAuthErrorMessage,
} from '../../lib/auth/authClient'
import type { FacialProfileReferencePublic, FacialReferenceType } from '../../types/auth'
import type { DetectedFace } from '../../types/recognition'
import { cn } from '../../lib/utils'

const REFERENCE_TYPE_OPTIONS: { value: FacialReferenceType; label: string }[] = [
  { value: 'frontal', label: 'Frontal' },
  { value: 'left', label: 'Perfil izquierdo' },
  { value: 'right', label: 'Perfil derecho' },
  { value: 'smile', label: 'Sonriendo' },
  { value: 'lighting', label: 'Otra iluminación' },
  { value: 'extra', label: 'Otro ángulo' },
]

const REFERENCE_TYPE_LABELS: Record<FacialReferenceType, string> = {
  primary: 'Principal',
  frontal: 'Frontal',
  left: 'Perfil izquierdo',
  right: 'Perfil derecho',
  smile: 'Sonriendo',
  lighting: 'Otra iluminación',
  extra: 'Otro ángulo',
}

interface FacialProfileAdvancedSectionProps {
  onAdvancedProfileChange?: (hasAdvancedProfile: boolean, referenceCount: number) => void
}

export function FacialProfileAdvancedSection({ onAdvancedProfileChange }: FacialProfileAdvancedSectionProps) {
  const [references, setReferences] = useState<FacialProfileReferencePublic[]>([])
  const [hasAdvancedProfile, setHasAdvancedProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadReferences = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchProfileReferences()
    setLoading(false)
    if (!result.ok) {
      setError(getAuthErrorMessage(result.error.code, result.error.message))
      return
    }
    setReferences(result.references)
    setHasAdvancedProfile(result.hasAdvancedProfile)
    onAdvancedProfileChange?.(result.hasAdvancedProfile, result.references.length)
  }, [onAdvancedProfileChange])

  useEffect(() => {
    void loadReferences()
  }, [loadReferences])

  const handleDelete = async (referenceId: string) => {
    if (!confirm('¿Borrar esta referencia?')) return
    setDeletingId(referenceId)
    setError(null)
    const result = await deleteProfileReference(referenceId)
    setDeletingId(null)
    if (!result.ok) {
      setError(getAuthErrorMessage(result.error.code, result.error.message))
      return
    }
    setReferences(result.references)
    setHasAdvancedProfile(result.hasAdvancedProfile)
    onAdvancedProfileChange?.(result.hasAdvancedProfile, result.references.length)
  }

  return (
    <div className="mt-6 pt-6 border-t border-border-subtle">
      <h4 className="font-medium text-sm mb-1">Mejorar precisión</h4>
      <p className="text-xs text-text-muted mb-4">
        Agregá más ángulos de tu cara para encontrar más fotos. Usamos varias referencias y combinamos los resultados.
      </p>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
        </div>
      ) : (
        <>
          {references.length > 0 && (
            <ul className="space-y-2 mb-4">
              {references.map((ref) => (
                <li
                  key={ref.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-elevated/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {REFERENCE_TYPE_LABELS[ref.referenceType]}
                      {ref.isPrimary && (
                        <span className="ml-2 text-xs text-accent-bright">· Principal</span>
                      )}
                    </p>
                    <p className="text-xs text-text-dim">
                      {new Date(ref.createdAt).toLocaleDateString('es-AR')}
                      {ref.qualityWarning && ` · ${ref.qualityWarning}`}
                    </p>
                  </div>
                  {!ref.isPrimary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === ref.id}
                      onClick={() => void handleDelete(ref.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hasAdvancedProfile && (
            <p className="text-xs text-emerald-400 mb-3">
              Perfil avanzado activo — usaremos {references.length} referencias en tus búsquedas.
            </p>
          )}

          {adding ? (
            <AddReferenceFlow
              onDone={() => {
                setAdding(false)
                void loadReferences()
              }}
              onCancel={() => setAdding(false)}
              onError={setError}
            />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={references.length >= 6}>
              <Plus className="w-4 h-4" />
              Agregar ángulo
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function AddReferenceFlow({
  onDone,
  onCancel,
  onError,
}: {
  onDone: () => void
  onCancel: () => void
  onError: (message: string) => void
}) {
  const [referenceType, setReferenceType] = useState<FacialReferenceType>('frontal')
  const [mode, setMode] = useState<'upload' | 'camera'>('upload')

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated/30 p-4 space-y-4">
      <div>
        <label className="text-xs text-text-muted block mb-2">Tipo de ángulo</label>
        <select
          value={referenceType}
          onChange={(e) => setReferenceType(e.target.value as FacialReferenceType)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        >
          {REFERENCE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button variant={mode === 'upload' ? 'primary' : 'outline'} size="sm" onClick={() => setMode('upload')}>
          Subir foto
        </Button>
        <Button variant={mode === 'camera' ? 'primary' : 'outline'} size="sm" onClick={() => setMode('camera')}>
          <Camera className="w-4 h-4" />
          Selfie
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>

      {mode === 'upload' ? (
        <ReferenceUploadAdd referenceType={referenceType} onDone={onDone} onError={onError} />
      ) : (
        <ReferenceCameraAdd referenceType={referenceType} onDone={onDone} onError={onError} />
      )}
    </div>
  )
}

function ReferenceUploadAdd({
  referenceType,
  onDone,
  onError,
}: {
  referenceType: FacialReferenceType
  onDone: () => void
  onError: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<{ detectionToken: string; faces: DetectedFace[]; previewUrl: string } | null>(null)

  const processFile = async (file: File) => {
    setLoading(true)
    onError('')
    try {
      const normalized = await normalizeReferenceToJpegBlob(file)
      const previewUrl = URL.createObjectURL(normalized)
      const dataBase64 = await blobToBase64(normalized)
      const mimeType = /heic|heif/i.test(file.name) ? file.type || 'image/heic' : 'image/jpeg'
      const result = await addProfileReference(dataBase64, mimeType, 'upload', referenceType)

      if (!result.ok) {
        URL.revokeObjectURL(previewUrl)
        onError(getAuthErrorMessage(result.error.code, result.error.message))
        return
      }

      if ('needsSelection' in result && result.needsSelection) {
        setSelection({ detectionToken: result.detectionToken, faces: result.faces, previewUrl })
        return
      }

      URL.revokeObjectURL(previewUrl)
      onDone()
    } catch {
      onError('No pudimos procesar la imagen.')
    } finally {
      setLoading(false)
    }
  }

  if (selection) {
    return (
      <ReferenceFaceSelector
        previewUrl={selection.previewUrl}
        detectionToken={selection.detectionToken}
        faces={selection.faces}
        referenceType={referenceType}
        onDone={onDone}
        onError={onError}
      />
    )
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer border-border hover:border-accent/40',
        loading && 'pointer-events-none opacity-60',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void processFile(file)
        }}
      />
      {loading ? (
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-accent" />
      ) : (
        <>
          <ImagePlus className="w-6 h-6 mx-auto text-text-dim mb-2" />
          <p className="text-xs text-text-muted">Elegí una foto clara de tu rostro</p>
        </>
      )}
    </div>
  )
}

function ReferenceCameraAdd({
  referenceType,
  onDone,
  onError,
}: {
  referenceType: FacialReferenceType
  onDone: () => void
  onError: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<{ detectionToken: string; faces: DetectedFace[]; previewUrl: string } | null>(null)

  useEffect(() => {
    if (selection) return
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const el = videoRef.current
        if (el) {
          el.srcObject = stream
          await el.play()
          setReady(true)
        }
      } catch {
        onError('No pudimos acceder a la cámara.')
      }
    }

    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [onError, selection])

  const capture = async () => {
    const video = videoRef.current
    if (!video || loading) return
    setLoading(true)
    onError('')
    try {
      const blob = await captureVideoFrameToJpeg(video)
      const previewUrl = URL.createObjectURL(blob)
      const dataBase64 = await blobToBase64(blob)
      const result = await addProfileReference(dataBase64, 'image/jpeg', 'camera', referenceType)

      if (!result.ok) {
        URL.revokeObjectURL(previewUrl)
        onError(getAuthErrorMessage(result.error.code, result.error.message))
        return
      }

      if ('needsSelection' in result && result.needsSelection) {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        setSelection({ detectionToken: result.detectionToken, faces: result.faces, previewUrl })
        return
      }

      URL.revokeObjectURL(previewUrl)
      onDone()
    } catch {
      onError('No pudimos capturar la selfie.')
    } finally {
      setLoading(false)
    }
  }

  if (selection) {
    return (
      <ReferenceFaceSelector
        previewUrl={selection.previewUrl}
        detectionToken={selection.detectionToken}
        faces={selection.faces}
        referenceType={referenceType}
        onDone={onDone}
        onError={onError}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-h-[220px]">
        <video ref={videoRef} playsInline muted className={cn('w-full h-full object-cover scale-x-[-1]', !ready && 'opacity-0')} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
        )}
      </div>
      <Button onClick={() => void capture()} disabled={!ready || loading} size="sm" className="w-full">
        {loading ? 'Guardando…' : 'Sacar selfie'}
      </Button>
    </div>
  )
}

function ReferenceFaceSelector({
  previewUrl,
  detectionToken,
  faces,
  referenceType,
  onDone,
  onError,
}: {
  previewUrl: string
  detectionToken: string
  faces: DetectedFace[]
  referenceType: FacialReferenceType
  onDone: () => void
  onError: (message: string) => void
}) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(faces.length === 1 ? faces[0].index : null)
  const [loading, setLoading] = useState(false)

  const confirm = async () => {
    if (pendingIndex === null || loading) return
    setLoading(true)
    const result = await addProfileReferenceFromSelection(detectionToken, pendingIndex, referenceType)
    if (!result.ok) {
      onError(getAuthErrorMessage(result.error.code, result.error.message))
      setLoading(false)
      return
    }
    URL.revokeObjectURL(previewUrl)
    onDone()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Elegí tu cara en la foto</p>
      <FaceImageCanvas
        src={previewUrl}
        alt="Seleccionar cara"
        faces={faces}
        highlightedIndex={pendingIndex}
        selectedIndex={pendingIndex}
        onFaceClick={setPendingIndex}
        maxHeight={180}
      />
      <Button onClick={() => void confirm()} disabled={pendingIndex === null || loading} size="sm">
        {loading ? 'Guardando…' : 'Guardar referencia'}
      </Button>
    </div>
  )
}
