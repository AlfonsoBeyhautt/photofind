import { logCapture } from '../api/apiFetch'

const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.92

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('LOAD_FAILED'))
    }
    img.src = url
  })
}

/** Normalize camera/upload preview to JPEG blob (max 1920px) when browser can decode the image. */
export async function normalizeReferenceToJpegBlob(input: File | Blob): Promise<Blob> {
  const file = input instanceof File ? input : new File([input], 'reference.jpg', { type: input.type || 'image/jpeg' })

  // HEIC and other formats the browser cannot decode are sent raw; server sharp normalizes.
  const canCanvasDecode = file.type.startsWith('image/') && !/heic|heif/i.test(file.type)
  if (!canCanvasDecode) {
    return file
  }

  try {
    const img = await loadImageFromFile(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
    })

    return blob ?? file
  } catch {
    return file
  }
}

export function captureVideoFrameToJpeg(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth
  const height = video.videoHeight
  logCapture('capture_start', { videoWidth: width, videoHeight: height, readyState: video.readyState })

  if (!width || !height) {
    return Promise.reject(new Error('CAMERA_NOT_READY'))
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('CANVAS_FAILED'))

  ctx.drawImage(video, 0, 0, outW, outH)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          logCapture('blob_created', { size: blob.size, type: blob.type || 'image/jpeg' })
          resolve(blob)
        } else {
          reject(new Error('CAPTURE_FAILED'))
        }
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}
