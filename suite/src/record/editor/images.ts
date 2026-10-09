// Getting pictures ready to keep: phone photos are shrunk (a 12 MP photo
// is several MB, far more than a note needs), turned the right way up,
// and saved as JPEG; scans are flattened and cleaned up first.

import { adaptiveThreshold, applyHomography, autoLevels, homography, pageSize, toGrey, type Quad } from '../scan'

export const MAX_SIDE = 2000

export interface Picture {
  blob: Blob
  width: number
  height: number
}

/** Decodes an image file the right way up (phones store rotation separately). */
export function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

export function canvasOf(source: CanvasImageSource & { width: number; height: number }, maxSide = MAX_SIDE): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function toBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Picture> {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => (blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error("Couldn't save the picture."))),
    type, quality,
  ))
}

/** A photo from the library or camera, ready to attach. */
export async function preparePhoto(file: Blob): Promise<Picture> {
  const bitmap = await decode(file)
  try {
    return await toBlob(canvasOf(bitmap))
  } finally {
    bitmap.close()
  }
}

export type ScanLook = 'colour' | 'grey' | 'bw'

/**
 * The page inside `quad` (in the source canvas's pixels), flattened to a
 * rectangle. Each output pixel looks up where it came from in the photo
 * (bilinear, so edges stay smooth).
 */
export function flatten(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const { width, height } = pageSize(quad)
  const h = homography([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], quad)
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  if (!h) {
    out.getContext('2d')!.drawImage(source, 0, 0, width, height)
    return out
  }
  const src = source.getContext('2d')!.getImageData(0, 0, source.width, source.height)
  const sw = source.width
  const sh = source.height
  const s = src.data
  const ctx = out.getContext('2d')!
  const dst = ctx.createImageData(width, height)
  const d = dst.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(h, { x: x + 0.5, y: y + 0.5 })
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1.001)
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1.001)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const ax = fx - x0
      const ay = fy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + sw * 4
      const i11 = i01 + 4
      const o = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] * (1 - ax) + s[i10 + c] * ax
        const bottom = s[i01 + c] * (1 - ax) + s[i11 + c] * ax
        d[o + c] = top * (1 - ay) + bottom * ay
      }
      d[o + 3] = 255
    }
  }
  ctx.putImageData(dst, 0, 0)
  return out
}

/** Greyscale with stretched contrast, or crisp black and white. Colour is left as it is. */
export function applyLook(canvas: HTMLCanvasElement, look: ScanLook): HTMLCanvasElement {
  if (look === 'colour') return canvas
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const grey = autoLevels(toGrey(img.data))
  const out = look === 'bw' ? adaptiveThreshold(grey, canvas.width, canvas.height) : grey
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = out[j]
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** A quarter turn clockwise. */
export function rotate(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = canvas.height
  out.height = canvas.width
  const ctx = out.getContext('2d')!
  ctx.translate(out.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(canvas, 0, 0)
  return out
}
