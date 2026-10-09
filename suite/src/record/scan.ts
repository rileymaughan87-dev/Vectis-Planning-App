// The maths behind "scan a document": flattening a photographed page
// from its four corners (a perspective transform), and turning it into
// crisp black-and-white. Pure functions on numbers and pixel arrays; the
// canvas work that uses them is in ui/editor/images.ts.

export interface Point {
  x: number
  y: number
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

/**
 * The 3×3 matrix (as 8 numbers, the last one fixed at 1) taking each
 * `from` corner to the matching `to` corner. Solved as eight linear
 * equations by Gaussian elimination. Null if the corners are degenerate
 * (three in a line, say).
 */
export function homography(from: Quad, to: Quad): number[] | null {
  const a: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    if (Math.abs(a[pivot][col]) < 1e-10) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const f = a[r][col] / a[col][col]
      for (let c = col; c < 9; c++) a[r][c] -= f * a[col][c]
    }
  }
  return a.map((row, i) => row[8] / row[i])
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + 1
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** A flat page's size from its corners: the longer of each pair of opposite edges, capped. */
export function pageSize(q: Quad, maxSide = 2000): { width: number; height: number } {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]))
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]))
  const scale = Math.min(1, maxSide / Math.max(w, h, 1))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** Corners a little in from the photo's edges — where the handles start. */
export function defaultQuad(width: number, height: number, inset = 0.06): Quad {
  const dx = width * inset
  const dy = height * inset
  return [{ x: dx, y: dy }, { x: width - dx, y: dy }, { x: width - dx, y: height - dy }, { x: dx, y: height - dy }]
}

/** Perceived brightness of each pixel (RGBA in, one byte per pixel out). */
export function toGrey(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
  return out
}

/**
 * Black and white that copes with shadows across the page: each pixel is
 * compared with the average of its neighbourhood (Bradley's adaptive
 * threshold, using a summed-area table so it's fast on big photos).
 */
export function adaptiveThreshold(grey: Uint8ClampedArray, width: number, height: number, sensitivity = 0.15): Uint8ClampedArray {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += grey[y * width + x]
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row
    }
  }
  const half = Math.max(4, Math.round(Math.max(width, height) / 32))
  const out = new Uint8ClampedArray(grey.length)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      out[y * width + x] = grey[y * width + x] < mean * (1 - sensitivity) ? 0 : 255
    }
  }
  return out
}

/** Stretches greys so the page is near white and the ink near black (ignoring the outer 1%). */
export function autoLevels(grey: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256)
  for (const v of grey) hist[v]++
  const cut = grey.length * 0.01
  let lo = 0
  let below = hist[0]
  while (lo < 255 && below < cut) below += hist[++lo]
  let hi = 255
  let above = hist[255]
  while (hi > 0 && above < cut) above += hist[--hi]
  if (hi <= lo) return grey
  const out = new Uint8ClampedArray(grey.length)
  for (let i = 0; i < grey.length; i++) out[i] = ((grey[i] - lo) * 255) / (hi - lo)
  return out
}
