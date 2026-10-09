import { describe, expect, it } from 'vitest'
import { CLOUD_GRACE_MS, planPictures, splitParts } from './picturePlan'

const now = 1_800_000_000_000

describe('moving note pictures', () => {
  it('uploads new ones, downloads ones a note here needs, and tidies old unused ones from the cloud', () => {
    const local = new Set(['mine', 'both'])
    const cloud = new Map([
      ['both', { createdAt: now }],
      ['theirs', { createdAt: now }],
      ['unusedOld', { createdAt: now - CLOUD_GRACE_MS - 1 }],
      ['unusedNew', { createdAt: now - 1000 }],
    ])
    const inUse = new Set(['mine', 'both', 'theirs', 'notSyncedYet'])
    expect(planPictures(local, cloud, inUse, now)).toEqual({
      upload: ['mine'],
      download: ['theirs'],
      removeFromCloud: ['unusedOld'],
    })
  })

  it('splits text into parts that fit a document, and joins back the same', () => {
    const text = 'x'.repeat(1_500_001)
    const parts = splitParts(text)
    expect(parts.map(p => p.length)).toEqual([700_000, 700_000, 100_001])
    expect(parts.join('')).toBe(text)
    expect(splitParts('')).toEqual([''])
  })
})
