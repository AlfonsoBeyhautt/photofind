import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2, RefreshCw, User } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { captureVideoFrameToJpeg } from '../../lib/recognition/normalizeReferenceImage'
import { captureErrorMessage } from '../../lib/api/apiFetch'
import {
  blobToBase64,
  getReferenceErrorMessage,
  validateReferenceImage,
} from '../../lib/recognition/referenceClient'
import { FaceSelector, ValidatedBadge } from './FaceSelector'
import type { DetectedFace, ReferenceQualityTier, ValidateReferenceSuccess } from '../../types/recognition'
import { isNeedsSelection, isReferenceValidated } from '../../types/recognition'

interface ReferenceCameraProps {
  active: boolean
  onValidated: (result: ValidateReferenceSuccess) => void
  onError: (message: string) => void
  onCleared?: () => void
  disabled?: boolean
}

export function ReferenceCamera({
  active,
  onValidated,
  onError,
  onCleared,
  disabled,
}: ReferenceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [cameraKey, setCameraKey] = useState(0)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [validated, setValidated] = useState(false)
  const [qualityTier, setQualityTier] = useState<ReferenceQualityTier | null>(null)
  const [qualityWarning, setQualityWarning] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState(false)
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

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  const resetToLive = useCallback((clearError = true) => {
    revokePreview()
    setPreviewUrl(null)
    setValidated(false)
    setQualityTier(null)
    setQualityWarning(null)
    setSelection(null)
    if (clearError) {
      setCaptureError(false)
      onError('')
    }
    stopCamera()
    setCameraKey((k) => k + 1)
    onCleared?.()
  }, [onCleared, onError, revokePreview, stopCamera])

  useEffect(() => {
    if (!active || disabled) {
      stopCamera()
      return
    }

    if (previewUrl || validated || selection) {
      stopCamera()
      return
    }

    let cancelled = false

    const markReady = () => {
      const el = videoRef.current
      if (el && el.videoWidth > 0 && el.videoHeight > 0) {
        setReady(true)
      }
    }

    async function start() {
      setReady(false)
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
          el.addEventListener('loadedmetadata', markReady)
          await el.play()
          markReady()
        }
      } catch {
        onError('No pudimos acceder a la cámara. Revisá los permisos del navegador.')
        setCaptureError(true)
      }
    }

    void start()

    return () => {
      cancelled = true
      videoRef.current?.removeEventListener('loadedmetadata', markReady)
      stopCamera()
    }
  }, [active, disabled, cameraKey, previewUrl, validated, selection, onError, stopCamera])

  useEffect(() => {
    return () => revokePreview()
  }, [revokePreview])

  const handleValidationResult = (
    result: Awaited<ReturnType<typeof validateReferenceImage>>,
  ) => {
    if (!result.ok) {
      setValidated(false)
      setSelection(null)
      setCaptureError(true)
      resetToLive(false)
      onError(getReferenceErrorMessage(result.error.code, result.error.message))
      return
    }

    if (isNeedsSelection(result)) {
      setSelection({ detectionToken: result.detectionToken, faces: result.faces })
      setValidated(false)
      setCaptureError(false)
      onError('')
      return
    }

    if (isReferenceValidated(result)) {
      setValidated(true)
      setQualityTier(result.qualityTier)
      setQualityWarning(result.qualityWarning ?? null)
      setSelection(null)
      setCaptureError(false)
      onError('')
      onValidated(result)
    }
  }

  const capture = async () => {
    const video = videoRef.current
    if (!video || !ready || loading) return

    if (!video.videoWidth || !video.videoHeight) {
      onError('La cámara todavía no está lista. Esperá un momento e intentá de nuevo.')
      return
    }

    setLoading(true)
    setValidated(false)
    setSelection(null)
    setCaptureError(false)
    onError('')

    try {
      const blob = await captureVideoFrameToJpeg(video)
      revokePreview()
      const preview = URL.createObjectURL(blob)
      previewUrlRef.current = preview
      setPreviewUrl(preview)
      stopCamera()

      const dataBase64 = await blobToBase64(blob)
      const result = await validateReferenceImage(dataBase64, 'image/jpeg', 'camera')
      handleValidationResult(result)
    } catch (err) {
      setCaptureError(true)
      resetToLive(false)
      const message = import.meta.env.DEV
        ? captureErrorMessage(err)
        : 'No pudimos capturar la selfie. Probá de nuevo.'
      console.error('[PhotoFind:Reference] capture_error', err)
      onError(message)
    } finally {
      setLoading(false)
    }
  }

  const showLive = !previewUrl
  const showValidatedPreview = previewUrl && validated && !selection
  const showSelectionOnly = Boolean(selection && previewUrl)

  return (
    <div className="mt-4 space-y-3">
      {showSelectionOnly && selection && previewUrl ? (
        <FaceSelector
          previewUrl={previewUrl}
          detectionToken={selection.detectionToken}
          faces={selection.faces}
          onSelected={(result) => {
            setValidated(true)
            setQualityTier(result.qualityTier)
            setQualityWarning(result.qualityWarning ?? null)
            setSelection(null)
            onValidated(result)
          }}
          onError={onError}
        />
      ) : (
      <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-bg-elevated border border-border">
        {showLive ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn('w-full h-full object-cover', !ready && 'opacity-0')}
            />
            {!ready && !captureError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-accent/10 to-violet/10">
                <User className="w-10 h-10 text-accent/60" />
              </div>
            )}
            {ready && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-accent/40" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={!ready || loading}
                onClick={() => void capture()}
                className="pointer-events-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {loading ? 'Validando…' : 'Capturar selfie'}
              </Button>
            </div>
            {ready && (
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </>
        ) : (
          <>
            <img src={previewUrl} alt="Selfie" className="w-full h-full object-cover" />
            {loading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
            {showValidatedPreview && (
              <div className="absolute top-2 right-2">
                <ValidatedBadge qualityTier={qualityTier ?? undefined} />
              </div>
            )}
          </>
        )}
      </div>
      )}

      {(captureError || showValidatedPreview) && !loading && !selection && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => resetToLive()}
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar selfie
        </Button>
      )}

      {qualityWarning && validated && !selection && (
        <p className="text-xs text-amber-200/90 px-1">{qualityWarning}</p>
      )}
    </div>
  )
}
