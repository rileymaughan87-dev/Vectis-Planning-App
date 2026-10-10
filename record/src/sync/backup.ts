// Pictures in use, and tidying away the rest. (Backups themselves are the
// shared "vectis-backup" file — suite/record/backup.ts.)

import { removeUnused } from '@suite/record/attachments'
import { attachmentIDs } from '@suite/record/noteDoc'
import { useData } from '../store/data'

/** Every picture a note, journal entry or paper still uses. */
export function attachmentsInUse(): Set<string> {
  const { notes, journal, papers } = useData.getState()
  const ids = new Set<string>()
  for (const item of [...notes, ...journal, ...papers]) if (item.body) for (const id of attachmentIDs(item.body.doc)) ids.add(id)
  return ids
}

/** Clears out pictures nothing uses any more; run quietly a little after start-up. */
export function tidyAttachments() {
  removeUnused(attachmentsInUse()).catch(() => {})
}
