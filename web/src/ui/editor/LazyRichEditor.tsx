// The editor is the heaviest part of the app, so it's only downloaded
// the first time a note or journal entry is opened.

import { Suspense, lazy, type ComponentProps } from 'react'

const RichEditorImpl = lazy(() => import('./RichEditor').then(m => ({ default: m.RichEditor })))

export function RichEditor(props: ComponentProps<typeof RichEditorImpl>) {
  return (
    <Suspense fallback={<div className="note-doc editor-loading" aria-busy="true">Opening…</div>}>
      <RichEditorImpl {...props} />
    </Suspense>
  )
}
