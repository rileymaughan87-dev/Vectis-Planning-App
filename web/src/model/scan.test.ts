import { describe, expect, it } from 'vitest'
import { adaptiveThreshold, applyHomography, autoLevels, homography, pageSize, type Quad } from './scan'

describe('flattening a page', () => {
  // A page photographed at an angle, mapped onto a flat 200 × 300 rectangle.
  const photo: Quad = [{ x: 30, y: 20 }, { x: 260, y: 40 }, { x: 240, y: 380 }, { x: 10, y: 350 }]
  const flat: Quad = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }]

  it('maps each corner onto its target', () => {
    const h = homography(flat, photo)!
    flat.forEach((p, i) => {
      const q = applyHomography(h, p)
      expect(q.x).toBeCloseTo(photo[i].x, 6)
      expect(q.y).toBeCloseTo(photo[i].y, 6)
    })
  })

  it('refuses corners in a line', () => {
    expect(homography(flat, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])).toBeNull()
  })

  it('sizes the flat page from its longest edges, capped', () => {
    expect(pageSize(flat)).toEqual({ width: 200, height: 300 })
    expect(pageSize([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }])).toEqual({ width: 2000, height: 1500 })
  })
})

describe('black and white', () => {
  it('keeps ink black and paper white even under a shadow', () => {
    // A 64 × 1 strip: paper fading from bright to shadowed, with a dark mark in each half.
    const w = 64
    const grey = new Uint8ClampedArray(w).map((_, x) => 230 - x * 2)
    grey[10] = 40
    grey[50] = 20
    const out = adaptiveThreshold(grey, w, 1)
    expect(out[10]).toBe(0)
    expect(out[50]).toBe(0)
    expect(out[30]).toBe(255)
    expect(out[60]).toBe(255)
  })

  it('stretches a dull page to full contrast', () => {
    const grey = new Uint8ClampedArray(200).map((_, i) => (i < 100 ? 90 : 170))
    const out = autoLevels(grey)
    expect(out[0]).toBe(0)
    expect(out[199]).toBe(255)
  })
})
