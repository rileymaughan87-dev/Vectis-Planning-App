// A photo, scan or drawing in a note. The document holds only its id and
// shape; the picture itself is in IndexedDB (store/attachments.ts).
// Tap one to select it: "Mark up" draws on it, "Remove" takes it out.
//
// A picture is a block in the flow of the text, never floating: it stays
// exactly where it was put and moves only as the words before it do (the
// opposite of Word's anchored, wrapping pictures). In a paper it can also
// be small, half or full width, sit left, centre or right on its own
// line, and carry a caption.

import { Node, mergeAttributes } from '@tiptap/core'
import { ATTACHMENT_READY, attachmentURL } from '../attachments'

export type AttachmentKind = 'photo' | 'scan' | 'drawing'

export type PictureSize = 'small' | 'half' | 'full'
export type PictureAlign = 'left' | 'center' | 'right'

export interface AttachmentAttrs {
  id: string
  kind: AttachmentKind
  width: number
  height: number
  size?: PictureSize
  align?: PictureAlign
  caption?: string
}

/** Fired (bubbling) from the picture when "Mark up" is tapped; RichEditor opens the drawing pad. */
export const MARKUP_EVENT = 'vectis-markup'
export interface MarkupDetail {
  pos: number
  attrs: AttachmentAttrs
}

const LABELS: Record<AttachmentKind, string> = { photo: 'Photo', scan: 'Scanned page', drawing: 'Drawing' }

export const Attachment = Node.create<{ layout: boolean }>({
  name: 'attachment',
  addOptions: () => ({ layout: false }),
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
      size: { default: 'full' },
      align: { default: 'center' },
      caption: { default: '' },
    }
  },

  parseHTML: () => [{ tag: 'figure[data-attachment]', getAttrs: el => ({ id: (el as HTMLElement).dataset.attachment }) }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes({ 'data-attachment': HTMLAttributes.id })],

  addNodeView() {
    const layout = this.options.layout
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
      const set = (attrs: Partial<AttachmentAttrs>) => {
        const at = pos()
        if (at === undefined) return
        editor.view.dispatch(editor.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, ...attrs }))
      }
      const caption = document.createElement('input')
      caption.className = 'attachment-caption'
      caption.placeholder = 'Add a caption'
      caption.setAttribute('aria-label', 'Caption')
      caption.addEventListener('change', () => set({ caption: caption.value.trim() }))
      caption.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          caption.blur()
        }
      })
      if (layout) {
        const choice = <K extends 'size' | 'align'>(key: K, value: AttachmentAttrs[K] & string, label: string) => {
          const b = button(label, () => set({ [key]: value } as Partial<AttachmentAttrs>))
          b.dataset[key] = value
          return b
        }
        choice('size', 'small', 'Small')
        choice('size', 'half', 'Half')
        choice('size', 'full', 'Full')
        choice('align', 'left', 'Left')
        choice('align', 'center', 'Centre')
        choice('align', 'right', 'Right')
      }
      button('Mark up', () => {
        const at = pos()
        if (at === undefined) return
        dom.dispatchEvent(new CustomEvent<MarkupDetail>(MARKUP_EVENT, { bubbles: true, detail: { pos: at, attrs: node.attrs as AttachmentAttrs } }))
      })
      button('Remove', () => {
        const at = pos()
        if (at !== undefined) editor.chain().focus().deleteRange({ from: at, to: at + node.nodeSize }).run()
      })

      const place = () => {
        const a = node.attrs as AttachmentAttrs
        dom.dataset.size = layout ? a.size ?? 'full' : 'full'
        dom.dataset.align = layout ? a.align ?? 'center' : 'center'
        for (const b of actions.querySelectorAll<HTMLButtonElement>('button')) {
          const on = (b.dataset.size && b.dataset.size === dom.dataset.size) || (b.dataset.align && b.dataset.align === dom.dataset.align)
          b.classList.toggle('is-on', Boolean(on))
        }
        if (document.activeElement !== caption) caption.value = a.caption ?? ''
        caption.hidden = !layout && !a.caption
        caption.readOnly = !layout
      }

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

      dom.append(img, caption, actions)
      place()
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
          place()
          if (changed) show()
          return true
        },
        selectNode: () => dom.classList.add('is-selected'),
        deselectNode: () => dom.classList.remove('is-selected'),
        // The buttons and the caption handle their own taps and typing.
        stopEvent: event => event.target instanceof HTMLButtonElement || event.target === caption,
        ignoreMutation: () => true,
        destroy: () => window.removeEventListener(ATTACHMENT_READY, onReady),
      }
    }
  },
})
