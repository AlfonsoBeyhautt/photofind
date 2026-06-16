import type { FaceBox } from '../../types/recognition'

export interface ContainLayout {
  containerWidth: number
  containerHeight: number
  naturalWidth: number
  naturalHeight: number
  renderedWidth: number
  renderedHeight: number
  offsetX: number
  offsetY: number
}

/** Pixel rect for a normalized Rekognition face box over object-fit: contain. */
export interface FaceBoxRect {
  left: number
  top: number
  width: number
  height: number
}

export function computeContainLayout(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ContainLayout | null {
  if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return null
  }

  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight)
  const renderedWidth = naturalWidth * scale
  const renderedHeight = naturalHeight * scale
  const offsetX = (containerWidth - renderedWidth) / 2
  const offsetY = (containerHeight - renderedHeight) / 2

  return {
    containerWidth,
    containerHeight,
    naturalWidth,
    naturalHeight,
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
  }
}

export function faceBoxToRect(box: FaceBox, layout: ContainLayout): FaceBoxRect {
  return {
    left: layout.offsetX + box.left * layout.renderedWidth,
    top: layout.offsetY + box.top * layout.renderedHeight,
    width: box.width * layout.renderedWidth,
    height: box.height * layout.renderedHeight,
  }
}

export function faceBoxRectStyle(rect: FaceBoxRect): {
  left: string
  top: string
  width: string
  height: string
} {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

/** Crop region for circular thumbnail (normalized 0–1 on source image). */
export function faceThumbnailCrop(box: FaceBox, pad = 0.2): {
  left: number
  top: number
  width: number
  height: number
} {
  const padW = box.width * pad
  const padH = box.height * pad
  const left = Math.max(0, box.left - padW)
  const top = Math.max(0, box.top - padH)
  const width = Math.min(1 - left, box.width + padW * 2)
  const height = Math.min(1 - top, box.height + padH * 2)
  return { left, top, width, height }
}
