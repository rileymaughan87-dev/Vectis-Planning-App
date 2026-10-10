// The editor's building blocks: TipTap's starter kit plus the pieces
// Vectis adds — dashed lists, checklists, highlight, headings whose
// sections fold away (and stay folded when the note is reopened), and
// maths answers after lines ending in "=".

import { Extension, wrappingInputRule, type Editor } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { BulletList, TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import type { Node as PMNode } from '@tiptap/pm/model'
import { evaluateLines } from '../math'
import { Attachment } from './attachment'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dashedList: {
      /** A bulleted list drawn with dashes instead of dots. */
      toggleDashedList: () => ReturnType
    }
  }
}

/**
 * Bullets with a `listStyle` of disc or dash. Typing "- " starts a dashed
 * list and "* " a bulleted one, as in Apple Notes.
 */
const StyledBulletList = BulletList.extend({
  addAttributes() {
    return {
      listStyle: {
        default: 'disc',
        parseHTML: el => (el.getAttribute('data-style') === 'dash' ? 'dash' : 'disc'),
        renderHTML: attrs => (attrs.listStyle === 'dash' ? { 'data-style': 'dash' } : {}),
      },
    }
  },
  addInputRules() {
    return [
      wrappingInputRule({ find: /^\s*([*+])\s$/, type: this.type, getAttributes: () => ({ listStyle: 'disc' }) }),
      wrappingInputRule({ find: /^\s*(-)\s$/, type: this.type, getAttributes: () => ({ listStyle: 'dash' }) }),
    ]
  },
  addCommands() {
    return {
      ...this.parent?.(),
      toggleDashedList: () => ({ editor, commands, chain }) => {
        if (editor.isActive('bulletList', { listStyle: 'dash' })) return commands.toggleBulletList()
        if (editor.isActive('bulletList')) return commands.updateAttributes('bulletList', { listStyle: 'dash' })
        return chain().toggleBulletList().updateAttributes('bulletList', { listStyle: 'dash' }).run()
      },
    }
  },
})

// MARK: - Foldable sections

const foldKey = new PluginKey('vectis-fold')

/** Where a heading's section ends: the next heading of the same or higher rank. */
function sectionEnd(doc: PMNode, index: number, level: number): number {
  for (let i = index + 1; i < doc.childCount; i++) {
    const node = doc.child(i)
    if (node.type.name === 'heading' && (node.attrs.level as number) <= level) return i
  }
  return doc.childCount
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []

  let hideUntil = -1
  doc.forEach((node, offset, index) => {
    if (index < hideUntil) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-folded-away' }))
      return
    }
    if (node.type.name !== 'heading') return
    const level = node.attrs.level as number
    const end = sectionEnd(doc, index, level)
    if (end === index + 1) return // nothing under it to fold
    const collapsed = Boolean(node.attrs.collapsed)
    decorations.push(
      Decoration.widget(offset + 1, view => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `fold-toggle${collapsed ? ' is-collapsed' : ''}`
        button.contentEditable = 'false'
        button.setAttribute('aria-label', collapsed ? 'Show section' : 'Hide section')
        button.setAttribute('aria-expanded', String(!collapsed))
        button.addEventListener('mousedown', e => e.preventDefault())
        button.addEventListener('click', e => {
          e.preventDefault()
          const current = view.state.doc.nodeAt(offset)
          if (!current) return
          const tr = view.state.tr.setNodeMarkup(offset, undefined, { ...current.attrs, collapsed: !current.attrs.collapsed })
          // Folding is a view choice, not an edit worth undoing.
          view.dispatch(tr.setMeta('addToHistory', false))
        })
        return button
      }, { side: -1, ignoreSelection: true, key: `fold-${offset}-${collapsed}` }),
    )
    if (collapsed) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-collapsed-heading' }))
      hideUntil = end
    }
  })
  return DecorationSet.create(doc, decorations)
}

const FoldableSections = Extension.create({
  name: 'foldableSections',
  addGlobalAttributes() {
    return [{
      types: ['heading'],
      attributes: {
        collapsed: {
          default: false,
          parseHTML: el => el.getAttribute('data-collapsed') === 'true',
          renderHTML: attrs => (attrs.collapsed ? { 'data-collapsed': 'true' } : {}),
        },
        // A paper's section id (its plan and research follow it); unused in notes.
        sid: {
          default: null,
          parseHTML: el => el.getAttribute('data-sid'),
          renderHTML: attrs => (attrs.sid ? { 'data-sid': attrs.sid } : {}),
        },
      },
    }]
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: foldKey,
      state: {
        init: (_, state) => buildDecorations(state.doc),
        apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
      },
      props: { decorations: state => foldKey.getState(state) },
    })]
  },
})

// MARK: - Section notes (papers)

/**
 * What each section is meant to say (from Plan), shown faintly under its
 * heading while writing. Drawn by CSS from an attribute, so it's never
 * part of the text.
 */
const SectionNotes = Extension.create<{ notes: Record<string, string> }>({
  name: 'sectionNotes',
  addOptions: () => ({ notes: {} }),
  addProseMirrorPlugins() {
    const notes = this.options.notes
    const build = (doc: PMNode) => {
      const decorations: Decoration[] = []
      doc.forEach((node, offset) => {
        const note = node.type.name === 'heading' ? notes[node.attrs.sid as string]?.trim() : undefined
        if (note) decorations.push(Decoration.node(offset, offset + node.nodeSize, { 'data-note': note, class: 'has-section-note' }))
      })
      return DecorationSet.create(doc, decorations)
    }
    const key = new PluginKey<DecorationSet>('vectis-section-notes')
    return [new Plugin({
      key,
      state: { init: (_, state) => build(state.doc), apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old) },
      props: { decorations: state => key.getState(state) },
    })]
  },
})

// MARK: - Section focus (papers)

export const focusKey = new PluginKey<number | null>('vectis-section-focus')

/** The heading a position sits under, as an index into the document's top-level blocks. */
export function sectionAt(doc: PMNode, pos: number): number | null {
  let found: number | null = null
  doc.forEach((node, offset, index) => {
    if (offset <= pos && node.type.name === 'heading') found = index
  })
  return found
}

/**
 * Section focus: only one heading's section shows (its subheadings
 * included); everything else steps out of view until focus ends. A view
 * choice — nothing in the paper changes.
 */
const SectionFocus = Extension.create({
  name: 'sectionFocus',
  addProseMirrorPlugins() {
    return [new Plugin<number | null>({
      key: focusKey,
      state: {
        init: () => null,
        apply: (tr, old) => {
          const meta = tr.getMeta(focusKey) as number | null | undefined
          if (meta !== undefined) return meta
          return old
        },
      },
      props: {
        decorations: state => {
          const index = focusKey.getState(state)
          if (index === null || index === undefined || index >= state.doc.childCount) return null
          const heading = state.doc.child(index)
          if (heading.type.name !== 'heading') return null
          const end = sectionEnd(state.doc, index, heading.attrs.level as number)
          const decorations: Decoration[] = []
          state.doc.forEach((node, offset, i) => {
            if (i < index || i >= end) decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-out-of-focus' }))
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    })]
  },
})

/** Focus on the section the cursor's in, or (null) show the whole paper again. */
export function setSectionFocus(editor: Editor, on: boolean) {
  const index = on ? sectionAt(editor.state.doc, editor.state.selection.from) : null
  editor.view.dispatch(editor.state.tr.setMeta(focusKey, index).setMeta('addToHistory', false))
}

// MARK: - Maths

export const mathKey = new PluginKey<{ enabled: boolean; decorations: DecorationSet }>('vectis-math')

/**
 * Answers shown after lines ending in "=", worked out from the top of
 * the note on every edit (so changing a variable updates everything
 * below). They're decorations, not text: nothing is saved into the note,
 * and turning maths off for the note simply stops drawing them.
 * Monospaced blocks are left alone, for writing code or raw text.
 */
function buildMath(doc: PMNode, enabled: boolean): DecorationSet {
  if (!enabled) return DecorationSet.empty
  const blocks: { text: string; from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.name !== 'codeBlock') blocks.push({ text: node.textContent, from: pos, to: pos + node.nodeSize })
    return false
  })
  const results = evaluateLines(blocks.map(b => b.text))
  // An attribute on the line, drawn by CSS (::after), rather than an
  // element inside the text: Chrome slipped a real line break into the
  // note when an uneditable element sat right beside the cursor.
  const decorations = results.flatMap((r, i) =>
    r ? [Decoration.node(blocks[i].from, blocks[i].to, { 'data-math-result': r.text, class: 'has-math-result' })] : [])
  return DecorationSet.create(doc, decorations)
}

const MathResults = Extension.create<{ enabled: boolean }>({
  name: 'mathResults',
  addOptions: () => ({ enabled: true }),
  addProseMirrorPlugins() {
    const initial = this.options.enabled
    return [new Plugin({
      key: mathKey,
      state: {
        init: (_, state) => ({ enabled: initial, decorations: buildMath(state.doc, initial) }),
        apply: (tr, old) => {
          const toggled = tr.getMeta(mathKey) as boolean | undefined
          const enabled = toggled ?? old.enabled
          if (toggled === undefined && !tr.docChanged) return old
          return { enabled, decorations: buildMath(tr.doc, enabled) }
        },
      },
      props: { decorations: state => mathKey.getState(state)?.decorations },
    })]
  },
})

export function editorExtensions(placeholder: string, math = true, variant: 'note' | 'paper' = 'note', sectionNotes: Record<string, string> = {}) {
  const paper = variant === 'paper'
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: false,
      link: false,
      code: false,
      blockquote: false,
    }),
    StyledBulletList,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Placeholder.configure({ placeholder }),
    FoldableSections,
    MathResults.configure({ enabled: math && !paper }),
    Attachment.configure({ layout: paper }),
    // Papers: text alignment, and focusing on one section at a time.
    ...(paper ? [TextAlign.configure({ types: ['heading', 'paragraph'] }), SectionFocus, SectionNotes.configure({ notes: sectionNotes })] : []),
  ]
}

// MARK: - Helpers the toolbar uses

export type ParagraphStyle = 'title' | 'heading' | 'subheading' | 'body' | 'mono'

export const PARAGRAPH_STYLES: { id: ParagraphStyle; label: string }[] = [
  { id: 'title', label: 'Title' },
  { id: 'heading', label: 'Heading' },
  { id: 'subheading', label: 'Subheading' },
  { id: 'body', label: 'Body' },
  { id: 'mono', label: 'Monospaced' },
]

export function currentStyle(editor: Editor): ParagraphStyle {
  if (editor.isActive('heading', { level: 1 })) return 'title'
  if (editor.isActive('heading', { level: 2 })) return 'heading'
  if (editor.isActive('heading', { level: 3 })) return 'subheading'
  if (editor.isActive('codeBlock')) return 'mono'
  return 'body'
}

export function applyStyle(editor: Editor, style: ParagraphStyle) {
  const chain = editor.chain().focus()
  switch (style) {
    case 'title': return chain.setHeading({ level: 1 }).run()
    case 'heading': return chain.setHeading({ level: 2 }).run()
    case 'subheading': return chain.setHeading({ level: 3 }).run()
    case 'mono': return chain.setCodeBlock().run()
    case 'body': return chain.setParagraph().run()
  }
}

/** Indent or outdent whichever kind of list item the cursor is in. */
export function indent(editor: Editor, deeper: boolean) {
  const type = editor.isActive('taskItem') ? 'taskItem' : 'listItem'
  const chain = editor.chain().focus()
  return deeper ? chain.sinkListItem(type).run() : chain.liftListItem(type).run()
}

export function canIndent(editor: Editor, deeper: boolean): boolean {
  const type = editor.isActive('taskItem') ? 'taskItem' : 'listItem'
  return deeper ? editor.can().sinkListItem(type) : editor.can().liftListItem(type)
}
