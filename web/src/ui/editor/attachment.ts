// A photo, scan or drawing in a note. The document holds only its id and
// shape; the picture itself is in IndexedDB (store/attachments.ts).
// Tap one to select it: "Mark up" draws on it, "Remove" takes it out.

import { Node, mergeAttributes } from '@tiptap/core'
import { ATTACHMENT_READY, attachmentURL } from '../../store/attachments'

export type AttachmentKind = 'photo' | 'scan' | 'drawing'

export interface AttachmentAttrs {
  id: string
  kind: AttachmentKind
  width: number
  height: number
}

/** Fired (bubbling) from the picture when "Mark up" is tapped; RichEditor opens the drawing pad. */
export const MARKUP_EVENT = 'vectis-markup'
export interface MarkupDetail {
  pos: number
  attrs: AttachmentAttrs
}

const LABELS: Record<AttachmentKind, string> = { photo: 'Photo', scan: 'Scanned page', drawing: 'Drawing' }

export const Attachment = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: '' },
      kind: { default: 'photo' },
      width: { default: 0 },
      height: { default: 0 },
    }
  },

  parseHTML: () => [{ tag: 'figure[data-attachment]', getAttrs: el => ({ id: (el as HTMLElement).dataset.attachment }) }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes({ 'data-attachment': HTMLAttributes.id })],

  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial
      const dom = document.createElement('figure')
      dom.className = 'note-attachment'
      dom.contentEditable = 'false'
      const img = document.createElement('img')
      img.draggable = false
      const missing = document.createElement('figcaption')
      missing.className = 'attachment-missing'
      missing.textContent = "This picture isn't on this device yet. With sync on it arrives shortly; otherwise it may be in a backup from another device."
      const actions = document.createElement('div')
      actions.className = 'attachment-actions'

      const button = (label: string, onPress: () => void) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = label
        b.addEventListener('mousedown', e => e.preventDefault())
        b.addEventListener('click', e => {
          e.preventDefault()
          e.stopPropagation()
          onPress()
        })
        actions.append(b)
        return b
      }
      const pos = () => (typeof getPos === 'function' ? getPos() : undefined)
      button('Mark up', () => {
        const at = pos()
        if (at === undefined) return
        dom.dispatchEvent(new CustomEvent<MarkupDetail>(MARKUP_EVENT, { bubbles: true, detail: { pos: at, attrs: node.attrs as AttachmentAttrs } }))
      })
      button('Remove', () => {
        const at = pos()
        if (at !== undefined) editor.chain().focus().deleteRange({ from: at, to: at + node.nodeSize }).run()
      })

      const show = () => {
        const { id, kind, width, height } = node.attrs as AttachmentAttrs
        img.alt = LABELS[kind] ?? 'Picture'
        // Reserve the space before it loads, so the note doesn't jump about.
        if (width && height) img.style.aspectRatio = `${width} / ${height}`
        dom.classList.toggle('is-drawing', kind === 'drawing')
        attachmentURL(id).then(url => {
          if ((node.attrs as AttachmentAttrs).id !== id) return
          if (url) {
            img.src = url
            missing.remove()
          } else {
            img.removeAttribute('src')
            dom.append(missing)
          }
        })
      }

      dom.append(img, actions)
      show()
      // Synced from another device after the note opened: show it now.
      const onReady = (e: Event) => {
        if ((e as CustomEvent<string>).detail === (node.attrs as AttachmentAttrs).id) show()
      }
      window.addEventListener(ATTACHMENT_READY, onReady)

      return {
        dom,
        update: updated => {
          if (updated.type !== node.type) return false
          const changed = updated.attrs.id !== node.attrs.id
          node = updated
          if (changed) show()
          return true
        },
        selectNode: () => dom.classList.add('is-selected'),
        deselectNode: () => dom.classList.remove('is-selected'),
        // The buttons handle their own taps.
        stopEvent: event => event.target instanceof HTMLButtonElement,
        ignoreMutation: () => true,
        destroy: () => window.removeEventListener(ATTACHMENT_READY, onReady),
      }
    }
  },
})
