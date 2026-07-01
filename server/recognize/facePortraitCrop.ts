/** Server mirror of src/lib/recognition/facePortraitCrop.ts */

export interface FaceBox {
  left: number
  top: number
  width: number
  height: number
}

export interface PortraitCropRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface PortraitCropOptions {
  faceFillRatio?: number
  marginX?: number
  marginTop?: number
  marginBottom?: number
}

const DEFAULT_OPTIONS: Required<PortraitCropOptions> = {
  faceFillRatio: 0.75,
  marginX: 0.5,
  marginTop: 0.65,
  marginBottom: 0.5,
}

export function awsBoundingBoxToFaceBox(
  crop: { Width?: number; Height?: number; Left?: number; Top?: number } | null | undefined,
): FaceBox | null {
  if (
    crop?.Left == null
    || crop.Top == null
    || crop.Width == null
    || crop.Height == null
    || crop.Width <= 0
    || crop.Height <= 0
  ) {
    return null
  }
  return {
    left: crop.Left,
    top: crop.Top,
    width: crop.Width,
    height: crop.Height,
  }
}

export function hasMinimumFaceBox(box: FaceBox | null | undefined): box is FaceBox {
  if (!box || box.width <= 0 || box.height <= 0) return false
  if (box.width > 0.98 || box.height > 0.98) return false
  return box.left + box.width > 0.01 && box.top + box.height > 0.01
}

export function clampFaceBox(box: FaceBox): FaceBox {
  let { left, top, width, height } = box
  if (left < 0) {
    width += left
    left = 0
  }
  if (top < 0) {
    height += top
    top = 0
  }
  if (left + width > 1) width = 1 - left
  if (top + height > 1) height = 1 - top
  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.max(0.01, Math.min(width, 1)),
    height: Math.max(0.01, Math.min(height, 1)),
  }
}

export function scoreFaceForAvatar(box: FaceBox, confidence = 50): number {
  const clamped = clampFaceBox(box)
  const area = clamped.width * clamped.height
  const aspect = clamped.width / clamped.height
  const frontal = 1 - Math.min(1, Math.abs(aspect - 0.82) / 0.55)
  const cx = clamped.left + clamped.width / 2
  const cy = clamped.top + clamped.height / 2
  const centered = 1 - Math.min(1, Math.abs(cx - 0.5) * 1.2 + Math.abs(cy - 0.42) * 0.9)
  const conf = Math.min(100, Math.max(0, confidence)) / 100
  return area * 3.5 + conf * 0.35 + frontal * 0.25 + centered * 0.2
}

export function facePortraitCrop(
  box: FaceBox,
  options?: PortraitCropOptions,
): PortraitCropRegion | null {
  if (!hasMinimumFaceBox(box)) return null

  const face = clampFaceBox(box)
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const cx = face.left + face.width / 2
  const cy = face.top + face.height / 2
  const faceW = face.width
  const faceH = face.height

  const padLeft = faceW * opts.marginX
  const padRight = faceW * opts.marginX
  const padTop = faceH * opts.marginTop
  const padBottom = faceH * opts.marginBottom

  const neededW = faceW + padLeft + padRight
  const neededH = faceH + padTop + padBottom
  const faceMax = Math.max(faceW, faceH)

  let size = Math.max(neededW, neededH, faceMax / opts.faceFillRatio)

  const verticalBias = faceH * (opts.marginTop - opts.marginBottom) * 0.1
  let left = cx - size / 2
  let top = cy - size / 2 - verticalBias

  if (left < 0) left = 0
  if (top < 0) top = 0
  if (left + size > 1) left = Math.max(0, 1 - size)
  if (top + size > 1) top = Math.max(0, 1 - size)

  if (size > 1) {
    size = 1
    left = 0
    top = 0
  }

  if (size < 0.05) return null

  return { left, top, width: size, height: size }
}

export function isUsablePortraitCrop(box: FaceBox, options?: PortraitCropOptions): boolean {
  return facePortraitCrop(box, options) != null
}
