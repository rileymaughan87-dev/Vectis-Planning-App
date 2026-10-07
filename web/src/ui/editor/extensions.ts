// The editor's building blocks: TipTap's starter kit plus the pieces
// Vectis adds — dashed lists, checklists, highlight, and headings whose
// sections fold away (and stay folded when the note is reopened).

import { Extension, wrappingInputRule, type Editor } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { BulletList, TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import type { Node as PMNode } from '@tiptap/pm/model'

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

export function editorExtensions(placeholder: string) {
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
