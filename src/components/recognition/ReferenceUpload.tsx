import { useRef, useState, useCallback, useEffect } from 'react'
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { normalizeReferenceToJpegBlob } from '../../lib/recognition/normalizeReferenceImage'
import {
  blobToBase64,
  fileToBase64,
  getReferenceErrorMessage,
  validateReferenceImage,
} from '../../lib/recognition/referenceClient'
import { FaceImageCanvas } from './FaceImageCanvas'
import { FaceSelector, ValidatedBadge } from './FaceSelector'
import type { DetectedFace, FaceBox, ReferenceQualityTier, ValidateReferenceSuccess } from '../../types/recognition'
import { isNeedsSelection, isReferenceValidated } from '../../types/recognition'

interface ReferenceUploadProps {
  onValidated: (result: ValidateReferenceSuccess) => void
  onError: (message: string) => void
  onCleared?: () => void
  disabled?: boolean
}

export function ReferenceUpload({ onValidated, onError, onCleared, disabled }: ReferenceUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null)
  const [validated, setValidated] = useState(false)
  const [qualityTier, setQualityTier] = useState<ReferenceQualityTier | null>(null)
  const [qualityWarning, setQualityWarning] = useState<string | null>(null)
  const [selection, setSelection] = useState<{
    detectionToken: string
    faces: DetectedFace[]
  } | null>(null)

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    revokePreview()
    setPreviewUrl(null)
    setFaceBox(null)
    setValidated(false)
    setQualityTier(null)
    setQualityWarning(null)
    setSelection(null)
    if (inputRef.current) inputRef.current.value = ''
    onError('')
    onCleared?.()
  }, [onCleared, onError, revokePreview])

  useEffect(() => () => revokePreview(), [revokePreview])

  const handleValidationResult = useCallback((
    result: Awaited<ReturnType<typeof validateReferenceImage>>,
  ) => {
    if (!result.ok) {
      setValidated(false)
      setFaceBox(null)
      setSelection(null)
      onError(getReferenceErrorMessage(result.error.code, result.error.message))
      return
    }

    if (isNeedsSelection(result)) {
      setSelection({ detectionToken: result.detectionToken, faces: result.faces })
      setValidated(false)
      setFaceBox(null)
      onError('')
      return
    }

    if (isReferenceValidated(result)) {
      setFaceBox(result.faceBox)
      setValidated(true)
      setQualityTier(result.qualityTier)
      setQualityWarning(result.qualityWarning ?? null)
      setSelection(null)
      onError('')
      onValidated(result)
    }
  }, [onError, onValidated])

  const processFile = useCallback(async (file: File) => {
    setLoading(true)
    setValidated(false)
    setFaceBox(null)
    setSelection(null)
    onError('')

    try {
      revokePreview()
      const normalized = await normalizeReferenceToJpegBlob(file)
      const preview = URL.createObjectURL(normalized)
      previewUrlRef.current = preview
      setPreviewUrl(preview)

      const dataBase64 = normalized instanceof File && normalized === file
        ? await fileToBase64(file)
        : await blobToBase64(normalized)

      const mimeType = /heic|heif/i.test(file.name) || /heic|heif/i.test(file.type)
        ? file.type || 'image/heic'
        : 'image/jpeg'

      const result = await validateReferenceImage(dataBase64, mimeType, 'upload')
      handleValidationResult(result)
    } catch {
      onError('No pudimos procesar la imagen. Probá con otra foto.')
    } finally {
      setLoading(false)
    }
  }, [handleValidationResult, onError, revokePreview])

  const onFile = (file: File | undefined) => {
    if (!file || disabled || loading) return
    void processFile(file)
  }

  const openPicker = () => {
    if (!disabled && !loading) inputRef.current?.click()
  }

  if (!previewUrl) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          onFile(e.dataTransfer.files[0])
        }}
        onClick={openPicker}
        className={cn(
          'mt-4 relative border-2 border-dashed rounded-xl overflow-hidden text-center transition-all cursor-pointer min-h-[140px]',
          dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40',
          (disabled || loading) && 'opacity-70 pointer-events-none',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <div className="p-6">
          {loading ? (
            <Loader2 className="w-8 h-8 mx-auto text-accent animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-8 h-8 mx-auto text-text-dim mb-2" />
              <p className="text-xs text-text-muted">Arrastrá aquí o hacé clic</p>
              <p className="text-[10px] text-text-dim mt-1">JPG, PNG o HEIC</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {loading && (
        <div className="flex items-center justify-center py-8 rounded-xl border border-border bg-bg-elevated/50">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      )}

      {!loading && selection && (
        <FaceSelector
          previewUrl={previewUrl}
          detectionToken={selection.detectionToken}
          faces={selection.faces}
          onSelected={(result) => {
            setFaceBox(result.faceBox)
            setValidated(true)
            setQualityTier(result.qualityTier)
            setQualityWarning(result.qualityWarning ?? null)
            setSelection(null)
            onValidated(result)
          }}
          onError={onError}
        />
      )}

      {!loading && !selection && validated && faceBox && (
        <div
          className={cn(
            'relative rounded-xl border-2 p-2',
            qualityTier === 'high' && 'border-emerald-500/50',
            qualityTier === 'medium' && 'border-amber-500/50',
          )}
        >
          <FaceImageCanvas
            src={previewUrl}
            alt="Referencia validada"
            faceBox={faceBox}
            maxHeight={200}
          />
          <div className="absolute top-3 right-3">
            <ValidatedBadge qualityTier={qualityTier ?? undefined} />
          </div>
        </div>
      )}

      {qualityWarning && validated && !selection && (
        <p className="text-xs text-amber-200/90 px-1">{qualityWarning}</p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={loading}
          onClick={openPicker}
        >
          <RefreshCw className="w-4 h-4" />
          Cambiar foto
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="flex-1"
          disabled={loading}
          onClick={reset}
        >
          <Trash2 className="w-4 h-4" />
          Eliminar
        </Button>
      </div>
    </div>
  )
}
