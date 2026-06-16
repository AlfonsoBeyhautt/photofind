import { useRef, useState, useCallback, useEffect } from 'react'
import { ImagePlus, Loader2, Camera, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { normalizeReferenceToJpegBlob, captureVideoFrameToJpeg } from '../../lib/recognition/normalizeReferenceImage'
import { blobToBase64 } from '../../lib/recognition/referenceClient'
import {
  getAuthErrorMessage,
  saveFacialProfileFromImage,
  saveFacialProfileFromSelection,
} from '../../lib/auth/authClient'
import { FaceImageCanvas } from '../recognition/FaceImageCanvas'
import type { DetectedFace } from '../../types/recognition'
import type { FacialProfileMeta } from '../../types/auth'

type SetupMode = 'upload' | 'camera'

interface FacialProfileSetupProps {
  onSaved: (profile: FacialProfileMeta) => void
  onError: (message: string) => void
  onCancel?: () => void
}

export function FacialProfileSetup({ onSaved, onError, onCancel }: FacialProfileSetupProps) {
  const [mode, setMode] = useState<SetupMode>('upload')
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant={mode === 'upload' ? 'primary' : 'outline'} size="sm" onClick={() => setMode('upload')}>
          Subir foto
        </Button>
        <Button variant={mode === 'camera' ? 'primary' : 'outline'} size="sm" onClick={() => setMode('camera')}>
          <Camera className="w-4 h-4" />
          Selfie
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
      {mode === 'upload' ? (
        <ProfileUploadFlow onSaved={onSaved} onError={onError} />
      ) : (
        <ProfileCameraFlow onSaved={onSaved} onError={onError} />
      )}
    </div>
  )
}

function ProfileUploadFlow({ onSaved, onError }: FacialProfileSetupProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ detectionToken: string; faces: DetectedFace[] } | null>(null)

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  useEffect(() => () => revokePreview(), [revokePreview])

  const processFile = async (file: File) => {
    setLoading(true)
    setSelection(null)
    onError('')

    try {
      revokePreview()
      const normalized = await normalizeReferenceToJpegBlob(file)
      const preview = URL.createObjectURL(normalized)
      previewUrlRef.current = preview
      setPreviewUrl(preview)

      const dataBase64 = await blobToBase64(normalized)
      const mimeType = /heic|heif/i.test(file.name) ? file.type || 'image/heic' : 'image/jpeg'
      const result = await saveFacialProfileFromImage(dataBase64, mimeType, 'upload')

      if (!result.ok) {
        onError(getAuthErrorMessage(result.error.code, result.error.message))
        return
      }

      if ('needsSelection' in result && result.needsSelection) {
        setSelection({ detectionToken: result.detectionToken, faces: result.faces })
        return
      }

      if ('profile' in result) {
        onSaved(result.profile)
      }
    } catch {
      onError('No pudimos procesar la imagen.')
    } finally {
      setLoading(false)
    }
  }

  if (!previewUrl) {
    return (
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer border-border hover:border-accent/40"
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
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-accent" />
        ) : (
          <>
            <ImagePlus className="w-8 h-8 mx-auto text-text-dim mb-2" />
            <p className="text-xs text-text-muted">Subí una foto clara de tu rostro</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {loading && <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto" />}
      {selection && previewUrl && (
        <ProfileFaceSelector
          previewUrl={previewUrl}
          detectionToken={selection.detectionToken}
          faces={selection.faces}
          onSaved={onSaved}
          onError={onError}
        />
      )}
      {!selection && !loading && (
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <RefreshCw className="w-4 h-4" />
          Cambiar foto
        </Button>
      )}
    </div>
  )
}

function ProfileCameraFlow({ onSaved, onError }: FacialProfileSetupProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<{ detectionToken: string; faces: DetectedFace[]; previewUrl: string } | null>(null)

  useEffect(() => {
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
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
    }
  }, [onError])

  const capture = async () => {
    if (!videoRef.current || loading) return
    setLoading(true)
    onError('')
    try {
      const blob = await captureVideoFrameToJpeg(videoRef.current)
      const previewUrl = URL.createObjectURL(blob)
      const dataBase64 = await blobToBase64(blob)
      const result = await saveFacialProfileFromImage(dataBase64, 'image/jpeg', 'camera')

      if (!result.ok) {
        onError(getAuthErrorMessage(result.error.code, result.error.message))
        URL.revokeObjectURL(previewUrl)
        return
      }

      if ('needsSelection' in result && result.needsSelection) {
        setSelection({ detectionToken: result.detectionToken, faces: result.faces, previewUrl })
        streamRef.current?.getTracks().forEach((t) => t.stop())
        return
      }

      if ('profile' in result) {
        URL.revokeObjectURL(previewUrl)
        onSaved(result.profile)
      }
    } catch {
      onError('No pudimos capturar la selfie.')
    } finally {
      setLoading(false)
    }
  }

  if (selection) {
    return (
      <ProfileFaceSelector
        previewUrl={selection.previewUrl}
        detectionToken={selection.detectionToken}
        faces={selection.faces}
        onSaved={(profile) => {
          URL.revokeObjectURL(selection.previewUrl)
          onSaved(profile)
        }}
        onError={onError}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-h-[280px]">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover mirror" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
      </div>
      <Button onClick={capture} disabled={!ready || loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        Sacar selfie
      </Button>
    </div>
  )
}

function ProfileFaceSelector({
  previewUrl,
  detectionToken,
  faces,
  onSaved,
  onError,
}: {
  previewUrl: string
  detectionToken: string
  faces: DetectedFace[]
  onSaved: (profile: FacialProfileMeta) => void
  onError: (message: string) => void
}) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(faces.length === 1 ? faces[0].index : null)
  const [loading, setLoading] = useState(false)

  const confirm = async () => {
    if (pendingIndex === null || loading) return
    setLoading(true)
    const result = await saveFacialProfileFromSelection(detectionToken, pendingIndex)
    if (!result.ok) {
      onError(getAuthErrorMessage(result.error.code, result.error.message))
      setLoading(false)
      return
    }
    if ('profile' in result) {
      onSaved(result.profile)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">Elegí tu cara en la foto grupal</p>
      <FaceImageCanvas
        src={previewUrl}
        alt="Seleccionar cara"
        faces={faces}
        highlightedIndex={pendingIndex}
        selectedIndex={pendingIndex}
        onFaceClick={setPendingIndex}
        maxHeight={200}
      />
      <div className="flex flex-wrap gap-2">
        {faces.map((face) => (
          <button
            key={face.index}
            type="button"
            onClick={() => setPendingIndex(face.index)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs border',
              pendingIndex === face.index ? 'border-accent bg-accent/10' : 'border-border',
            )}
          >
            Persona {face.index + 1}
          </button>
        ))}
      </div>
      <Button onClick={confirm} disabled={pendingIndex === null || loading} size="sm">
        {loading ? 'Guardando…' : 'Guardar esta cara'}
      </Button>
    </div>
  )
}
