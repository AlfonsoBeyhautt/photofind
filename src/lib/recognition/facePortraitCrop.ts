import type { FaceBox } from '../../types/recognition'

export interface PortraitCropRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface PortraitCropOptions {
  /** Target share of the crop square occupied by the face (0.7–0.8). */
  faceFillRatio?: number
  marginX?: number
  marginTop?: number
  marginBottom?: number
}

const DEFAULT_OPTIONS: Required<PortraitCropOptions> = {
  faceFillRatio: 0.75,
  marginX: 0.55,
  marginTop: 0.7,
  marginBottom: 0.55,
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

/** Rejects boxes outside the image or with implausible geometry. */
export function isValidFaceBoundingBox(box: FaceBox): boolean {
  if (box.width <= 0 || box.height <= 0) return false
  if (box.left < -0.01 || box.top < -0.01) return false
  if (box.left + box.width > 1.01 || box.top + box.height > 1.01) return false
  if (box.width < 0.012 || box.height < 0.012) return false
  if (box.width > 0.92 || box.height > 0.92) return false
  const aspect = box.width / box.height
  return aspect >= 0.35 && aspect <= 2.4
}

function containsFace(crop: PortraitCropRegion, box: FaceBox, padX: number, padTop: number, padBottom: number): boolean {
  const minLeft = box.left - box.width * padX
  const minTop = box.top - box.height * padTop
  const maxRight = box.left + box.width + box.width * padX
  const maxBottom = box.top + box.height + box.height * padBottom
  return (
    crop.left <= minLeft + 0.002
    && crop.top <= minTop + 0.002
    && crop.left + crop.width >= maxRight - 0.002
    && crop.top + crop.height >= maxBottom - 0.002
  )
}

/**
 * Square portrait crop with generous margins so the full face stays visible
 * and occupies ~70–80% of the circle.
 */
export function facePortraitCrop(
  box: FaceBox,
  options?: PortraitCropOptions,
): PortraitCropRegion | null {
  if (!isValidFaceBoundingBox(box)) return null

  const opts = { ...DEFAULT_OPTIONS, ...options }
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const faceW = box.width
  const faceH = box.height

  const expW = faceW * (1 + opts.marginX * 2)
  const expH = faceH * (1 + opts.marginTop + opts.marginBottom)
  const faceMax = Math.max(faceW, faceH)

  let size = Math.max(expW, expH, faceMax / opts.faceFillRatio)

  const verticalBias = faceH * (opts.marginTop - opts.marginBottom) * 0.12
  let left = cx - size / 2
  let top = cy - size / 2 - verticalBias

  const minLeft = box.left - faceW * opts.marginX
  const minTop = box.top - faceH * opts.marginTop
  const maxRight = box.left + faceW + faceW * opts.marginX
  const maxBottom = box.top + faceH + faceH * opts.marginBottom
  size = Math.max(size, maxRight - minLeft, maxBottom - minTop)

  left = cx - size / 2
  top = cy - size / 2 - verticalBias

  if (left < 0) left = 0
  if (top < 0) top = 0
  if (left + size > 1) left = Math.max(0, 1 - size)
  if (top + size > 1) top = Math.max(0, 1 - size)

  if (size <= 0 || size > 1) return null

  const region = { left, top, width: size, height: size }
  if (!containsFace(region, box, opts.marginX, opts.marginTop, opts.marginBottom)) {
    return null
  }

  return region
}

export function isUsablePortraitCrop(box: FaceBox, options?: PortraitCropOptions): boolean {
  return facePortraitCrop(box, options) != null
}
