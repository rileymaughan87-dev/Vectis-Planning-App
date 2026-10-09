// Deciding what note pictures to move between this device and the cloud.
// Pure, so it can be tested; sync/pictures.ts does the moving.

/** A Firestore document holds up to 1 MiB, so a picture's base64 text is stored in parts this size. */
export const PART_SIZE = 700_000

export function splitParts(data: string, size = PART_SIZE): string[] {
  const parts: string[] = []
  for (let i = 0; i < data.length; i += size) parts.push(data.slice(i, i + size))
  return parts.length ? parts : ['']
}

/** Pictures the cloud lists, with when each was added (ms). */
export type CloudIndex = Map<string, { createdAt: number }>

export interface PicturePlan {
  /** On this device but not in the cloud. */
  upload: string[]
  /** Used by a note here, in the cloud, not on this device yet. */
  download: string[]
  /** In the cloud, used by no note, and old enough to be sure it's gone for good. */
  removeFromCloud: string[]
}

/** A week: long enough that a note using the picture has synced everywhere before it's removed. */
export const CLOUD_GRACE_MS = 7 * 86_400_000

export function planPictures(local: Set<string>, cloud: CloudIndex, inUse: Set<string>, now: number): PicturePlan {
  return {
    upload: [...local].filter(id => !cloud.has(id)),
    download: [...inUse].filter(id => cloud.has(id) && !local.has(id)),
    removeFromCloud: [...cloud].filter(([id, c]) => !inUse.has(id) && now - c.createdAt > CLOUD_GRACE_MS).map(([id]) => id),
  }
}
