// The one editor for notes and journal entries. TipTap (ProseMirror)
// underneath; Vectis styling and an adaptive toolbar on top.
//
// On a phone the toolbar rides just above the on-screen keyboard while
// you're typing. On a computer it sits at the top of the editor.

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import {
  Bold, ChevronsDownUp, ChevronsUpDown, Highlighter, Italic, KeyboardOff, List, ListChecks, ListIndentDecrease,
  ListIndentIncrease, ListOrdered, Redo2, SeparatorHorizontal, Strikethrough, Underline, Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DocNode } from '../../model/noteDoc'
import { PARAGRAPH_STYLES, applyStyle, canIndent, currentStyle, editorExtensions, indent } from './extensions'

export function RichEditor(props: {
  initial: DocNode
  onChange: (doc: DocNode) => void
  label: string
  placeholder?: string
  autofocus?: boolean
}) {
  const { onChange } = props
  const editor = useEditor({
    extensions: editorExtensions(props.placeholder ?? 'Start writing…'),
    content: props.initial,
    autofocus: props.autofocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'note-doc', 'aria-label': props.label, role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
  })

  return (
    <div className="rich-note">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

// MARK: - Toolbar

type Group = 'lists' | 'marks' | 'styles' | 'section' | 'insert'

function useIsTouch() {
  const [touch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)
  return touch
}

/** How far the on-screen keyboard pushes up from the bottom of the window. */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return inset
}

function EditorToolbar({ editor }: { editor: Editor }) {
  const touch = useIsTouch()
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      focused: e.isFocused,
      hasSelection: !e.state.selection.empty,
      inList: e.isActive('bulletList') || e.isActive('orderedList') || e.isActive('taskList'),
      inHeading: e.isActive('heading'),
      style: currentStyle(e),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      bullet: e.isActive('bulletList', { listStyle: 'disc' }),
      dash: e.isActive('bulletList', { listStyle: 'dash' }),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      collapsed: Boolean(e.getAttributes('heading').collapsed),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canIndent: canIndent(e, true),
      canOutdent: canIndent(e, false),
    }),
  })
  const inset = useKeyboardInset(touch && s.focused)
  const scrollRef = useRef<HTMLDivElement>(null)

  // The most relevant tools first; the rest are a swipe away.
  const order: Group[] = s.hasSelection ? ['marks', 'styles', 'lists', 'insert']
    : s.inList ? ['lists', 'marks', 'styles', 'insert']
    : s.inHeading ? ['styles', 'section', 'marks', 'lists', 'insert']
    : ['lists', 'styles', 'marks', 'insert']
  const orderKey = order.join()
  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0 })
  }, [orderKey])

  // On a phone it only shows while typing, docked above the keyboard.
  if (touch && !s.focused) return null

  const run = (f: () => void) => (e: { preventDefault: () => void }) => {
    e.preventDefault() // keep focus and selection in the editor
    f()
  }
  const chain = () => editor.chain().focus()

  const groups: Record<Group, ReactNode> = {
    marks: (
      <>
        <Tool label="Bold" active={s.bold} onPress={run(() => chain().toggleBold().run())}><Bold size={17} /></Tool>
        <Tool label="Italic" active={s.italic} onPress={run(() => chain().toggleItalic().run())}><Italic size={17} /></Tool>
        <Tool label="Underline" active={s.underline} onPress={run(() => chain().toggleUnderline().run())}><Underline size={17} /></Tool>
        <Tool label="Strikethrough" active={s.strike} onPress={run(() => chain().toggleStrike().run())}><Strikethrough size={17} /></Tool>
        <Tool label="Highlight" active={s.highlight} onPress={run(() => chain().toggleHighlight().run())}><Highlighter size={17} /></Tool>
      </>
    ),
    styles: (
      <>
        {PARAGRAPH_STYLES.map(p => (
          <Tool key={p.id} label={p.label} wide active={s.style === p.id} onPress={run(() => applyStyle(editor, p.id))}>
            <span className={`style-chip style-${p.id}`}>{p.label}</span>
          </Tool>
        ))}
      </>
    ),
    lists: (
      <>
        <Tool label="Checklist" active={s.task} onPress={run(() => chain().toggleTaskList().run())}><ListChecks size={17} /></Tool>
        <Tool label="Bulleted list" active={s.bullet} onPress={run(() => chain().toggleBulletList().updateAttributes('bulletList', { listStyle: 'disc' }).run())}><List size={17} /></Tool>
        <Tool label="Dashed list" active={s.dash} onPress={run(() => chain().toggleDashedList().run())}><DashListIcon /></Tool>
        <Tool label="Numbered list" active={s.ordered} onPress={run(() => chain().toggleOrderedList().run())}><ListOrdered size={17} /></Tool>
        <Tool label="Indent" disabled={!s.canIndent} onPress={run(() => indent(editor, true))}><ListIndentIncrease size={17} /></Tool>
        <Tool label="Outdent" disabled={!s.canOutdent} onPress={run(() => indent(editor, false))}><ListIndentDecrease size={17} /></Tool>
      </>
    ),
    section: (
      <Tool
        label={s.collapsed ? 'Show section' : 'Hide section'}
        active={s.collapsed}
        onPress={run(() => chain().updateAttributes('heading', { collapsed: !s.collapsed }).run())}
      >
        {s.collapsed ? <ChevronsUpDown size={17} /> : <ChevronsDownUp size={17} />}
      </Tool>
    ),
    insert: (
      <Tool label="Divider" onPress={run(() => chain().setHorizontalRule().run())}><SeparatorHorizontal size={17} /></Tool>
    ),
  }

  return (
    <div
      className={`editor-toolbar ${touch ? 'docked' : 'inline'}`}
      style={touch ? { bottom: inset } : undefined}
      role="toolbar"
      aria-label="Formatting"
    >
      <div className="toolbar-fixed">
        <Tool label="Undo" disabled={!s.canUndo} onPress={run(() => chain().undo().run())}><Undo2 size={17} /></Tool>
        <Tool label="Redo" disabled={!s.canRedo} onPress={run(() => chain().redo().run())}><Redo2 size={17} /></Tool>
      </div>
      <div className="toolbar-scroll" ref={scrollRef}>
        {order.map((g, i) => (
          <div key={g} className="toolbar-group">
            {i > 0 && <span className="toolbar-sep" aria-hidden="true" />}
            {groups[g]}
          </div>
        ))}
      </div>
      {touch && (
        <div className="toolbar-fixed">
          <Tool label="Hide keyboard" onPress={run(() => { editor.commands.blur(); (document.activeElement as HTMLElement | null)?.blur() })}>
            <KeyboardOff size={17} />
          </Tool>
        </div>
      )}
    </div>
  )
}

function Tool(props: {
  label: string
  active?: boolean
  disabled?: boolean
  wide?: boolean
  onPress: (e: { preventDefault: () => void }) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`tool ${props.active ? 'is-active' : ''} ${props.wide ? 'wide' : ''}`}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      disabled={props.disabled}
      // mousedown, not click: a click would take focus from the editor
      // first, and on a phone that drops the keyboard.
      onMouseDown={props.onPress}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && props.onPress(e)}
    >
      {props.children}
    </button>
  )
}

function DashListIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h3M3 12h3M3 18h3M10 6h11M10 12h11M10 18h11" />
    </svg>
  )
}
