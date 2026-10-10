// The one editor for notes and journal entries. TipTap (ProseMirror)
// underneath; Vectis styling and an adaptive toolbar on top.
//
// On a phone the toolbar rides just above the on-screen keyboard while
// you're typing. On a computer it sits at the top of the editor.
//
// Pictures: a photo from the library or camera, a scanned page, or a
// drawing, each kept on the device (store/attachments.ts) with only its
// id in the note.
//
// Papers use a quieter variant: just bold, italic, underline, alignment,
// the heading level, a picture and section focus — everything else (font,
// size, spacing) is set once in the paper's Format tab.

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Camera, ChevronsDownUp, ChevronsUpDown, Focus, Highlighter, Image as ImageIcon, Italic,
  KeyboardOff, List, ListChecks, ListIndentDecrease, ListIndentIncrease, ListOrdered, Pencil, Redo2, ScanLine, SeparatorHorizontal, Strikethrough,
  Underline, Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react'
import { newID } from '../../ids'
import type { DocNode } from '../noteDoc'
import { loadAttachment, saveAttachment } from '../attachments'
import { MARKUP_EVENT, type AttachmentAttrs, type AttachmentKind, type MarkupDetail } from './attachment'
import { DrawingSheet } from './DrawingSheet'
import { decode, preparePhoto, type Picture } from './images'
import { ScanSheet } from './ScanSheet'
import { PARAGRAPH_STYLES, applyStyle, canIndent, currentStyle, editorExtensions, focusKey, indent, mathKey, setSectionFocus } from './extensions'

export function RichEditor(props: {
  initial: DocNode
  onChange: (doc: DocNode) => void
  label: string
  placeholder?: string
  autofocus?: boolean
  /** Show answers after lines ending in "=" (on unless the note turned it off). */
  math?: boolean
  /** A paper: the quiet toolbar, alignment, picture layout and section focus. */
  variant?: 'note' | 'paper'
  /** A paper's notes per section (by heading id), shown faintly under each heading. */
  sectionNotes?: Record<string, string>
  /** A paper's word targets per section (by heading id), beside each heading's live count. */
  sectionTargets?: Record<string, number>
  /** The editor, once it's ready (a paper inserts citations from Research into it). */
  onEditor?: (editor: Editor | null) => void
}) {
  const { onChange } = props
  const math = props.math ?? true
  const paper = props.variant === 'paper'
  const editor = useEditor({
    extensions: editorExtensions(props.placeholder ?? 'Start writing…', math, props.variant, props.sectionNotes, props.sectionTargets),
    content: props.initial,
    autofocus: props.autofocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'note-doc', 'aria-label': props.label, role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
  })

  const rootRef = useRef<HTMLDivElement>(null)
  const pictures = usePictures(editor, rootRef)

  const { onEditor } = props
  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  // Turning maths on or off redraws the answers without touching the text or the undo history.
  useEffect(() => {
    if (!editor.isInitialized || mathKey.getState(editor.state)?.enabled === math) return
    editor.view.dispatch(editor.state.tr.setMeta(mathKey, math).setMeta('addToHistory', false))
  }, [editor, math])

  return (
    <div className="rich-note" ref={rootRef}>
      {paper ? <PaperToolbar editor={editor} pictures={pictures} /> : <EditorToolbar editor={editor} pictures={pictures} />}
      <EditorContent editor={editor} />
      {pictures.elements}
    </div>
  )
}

// MARK: - Pictures

type Pictures = ReturnType<typeof usePictures>

function usePictures(editor: Editor, rootRef: RefObject<HTMLDivElement | null>) {
  const libraryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  // Where to put it: the cursor when the button was pressed (choosing a file takes focus away).
  const insertAt = useRef(0)
  const [scanning, setScanning] = useState<ImageBitmap | null>(null)
  const [drawing, setDrawing] = useState<{ background?: ImageBitmap; markup?: MarkupDetail } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remember = () => { insertAt.current = editor.state.selection.to }

  const insert = async (picture: Picture, kind: AttachmentKind) => {
    const id = newID()
    await saveAttachment(id, picture.blob)
    const attrs: AttachmentAttrs = { id, kind, width: picture.width, height: picture.height }
    const at = Math.min(insertAt.current, editor.state.doc.content.size)
    editor.chain().focus().insertContentAt(at, { type: 'attachment', attrs }).run()
    // Always somewhere to keep typing after a picture at the very end.
    if (editor.state.doc.lastChild?.type.name === 'attachment') {
      editor.chain().insertContentAt(editor.state.doc.content.size, { type: 'paragraph' }).run()
    }
    insertAt.current = editor.state.selection.to
  }

  const guard = async (f: () => Promise<void>) => {
    setError(null)
    try {
      await f()
    } catch {
      setError("That picture couldn't be added. Try another, or a smaller one.")
    }
  }

  // "Mark up" on a picture in the note opens the drawing pad over it. Listened
  // for on our own wrapper: the editor's view may not be mounted yet here.
  useEffect(() => {
    const dom = rootRef.current
    if (!dom) return
    const onMarkup = (e: Event) => {
      const detail = (e as CustomEvent<MarkupDetail>).detail
      void guard(async () => {
        const stored = await loadAttachment(detail.attrs.id)
        if (!stored) throw new Error('missing')
        setDrawing({ background: await decode(stored.blob), markup: detail })
      })
    }
    dom.addEventListener(MARKUP_EVENT, onMarkup)
    return () => dom.removeEventListener(MARKUP_EVENT, onMarkup)
  }, [rootRef])

  const finishDrawing = (picture: Picture) => {
    const markup = drawing?.markup
    setDrawing(null)
    void guard(async () => {
      if (!markup) return insert(picture, 'drawing')
      // Marked up: the picture is replaced by the marked-up copy (the original is tidied away later).
      const id = newID()
      await saveAttachment(id, picture.blob)
      const node = editor.state.doc.nodeAt(markup.pos)
      if (node?.type.name !== 'attachment') return insert(picture, markup.attrs.kind)
      editor.view.dispatch(editor.state.tr.setNodeMarkup(markup.pos, undefined, { ...node.attrs, id, width: picture.width, height: picture.height }))
    })
  }

  const files = (e: ChangeEvent<HTMLInputElement>, onFile: (f: File) => Promise<void>) => {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    void guard(async () => {
      for (const f of list) await onFile(f)
    })
  }

  const elements = (
    <>
      <input ref={libraryRef} type="file" accept="image/*" multiple className="visually-hidden" tabIndex={-1} aria-hidden="true"
        onChange={e => files(e, async f => insert(await preparePhoto(f), 'photo'))} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} aria-hidden="true"
        onChange={e => files(e, async f => insert(await preparePhoto(f), 'photo'))} />
      <input ref={scanRef} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} aria-hidden="true"
        onChange={e => files(e, async f => setScanning(await decode(f)))} />
      {error && <div className="notice error" role="alert">{error}</div>}
      {scanning && (
        <ScanSheet
          photo={scanning}
          onClose={() => setScanning(null)}
          onDone={p => { setScanning(null); void guard(() => insert(p, 'scan')) }}
        />
      )}
      {drawing && <DrawingSheet background={drawing.background} onClose={() => setDrawing(null)} onDone={finishDrawing} />}
    </>
  )

  return {
    elements,
    pickPhoto: () => { remember(); libraryRef.current?.click() },
    takePhoto: () => { remember(); cameraRef.current?.click() },
    scan: () => { remember(); scanRef.current?.click() },
    draw: () => { remember(); setDrawing({}) },
  }
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

function EditorToolbar({ editor, pictures }: { editor: Editor; pictures: Pictures }) {
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
      <>
        {/* These open the photo picker or camera, which needs a real tap (click), not mousedown. */}
        <Tool label="Photo from library" click onPress={() => pictures.pickPhoto()}><ImageIcon size={17} /></Tool>
        <Tool label="Take a photo" click onPress={() => pictures.takePhoto()}><Camera size={17} /></Tool>
        <Tool label="Scan a page" click onPress={() => pictures.scan()}><ScanLine size={17} /></Tool>
        <Tool label="Drawing" click onPress={() => pictures.draw()}><Pencil size={17} /></Tool>
        <Tool label="Divider" onPress={run(() => chain().setHorizontalRule().run())}><SeparatorHorizontal size={17} /></Tool>
      </>
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

/** The paper's toolbar: only what's needed while writing. */
function PaperToolbar({ editor, pictures }: { editor: Editor; pictures: Pictures }) {
  const touch = useIsTouch()
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      focused: e.isFocused,
      style: currentStyle(e),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      align: (['left', 'center', 'right', 'justify'] as const).find(a => e.isActive({ textAlign: a })) ?? 'left',
      focusOn: focusKey.getState(e.state) !== null && focusKey.getState(e.state) !== undefined,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const inset = useKeyboardInset(touch && s.focused)
  // On a phone it only shows while typing (and while a section's in focus, to step out of it).
  if (touch && !s.focused && !s.focusOn) return null

  const run = (f: () => void) => (e: { preventDefault: () => void }) => {
    e.preventDefault()
    f()
  }
  const chain = () => editor.chain().focus()
  const align = (a: 'left' | 'center' | 'right' | 'justify') => run(() => chain().setTextAlign(a).run())
  const levels: { id: 'body' | 'heading' | 'subheading'; label: string }[] = [
    { id: 'body', label: 'Text' }, { id: 'heading', label: 'Heading' }, { id: 'subheading', label: 'Subheading' },
  ]

  return (
    <div className={`editor-toolbar paper-toolbar ${touch ? 'docked' : 'inline'}`} style={touch ? { bottom: inset } : undefined} role="toolbar" aria-label="Formatting">
      <div className="toolbar-fixed">
        <Tool label="Undo" disabled={!s.canUndo} onPress={run(() => chain().undo().run())}><Undo2 size={17} /></Tool>
        <Tool label="Redo" disabled={!s.canRedo} onPress={run(() => chain().redo().run())}><Redo2 size={17} /></Tool>
      </div>
      <div className="toolbar-scroll">
        <div className="toolbar-group">
          {levels.map(l => (
            <Tool key={l.id} label={l.label} wide active={s.style === l.id} onPress={run(() => applyStyle(editor, l.id))}>
              <span className={`style-chip style-${l.id}`}>{l.label}</span>
            </Tool>
          ))}
        </div>
        <div className="toolbar-group">
          <span className="toolbar-sep" aria-hidden="true" />
          <Tool label="Bold" active={s.bold} onPress={run(() => chain().toggleBold().run())}><Bold size={17} /></Tool>
          <Tool label="Italic" active={s.italic} onPress={run(() => chain().toggleItalic().run())}><Italic size={17} /></Tool>
          <Tool label="Underline" active={s.underline} onPress={run(() => chain().toggleUnderline().run())}><Underline size={17} /></Tool>
        </div>
        <div className="toolbar-group">
          <span className="toolbar-sep" aria-hidden="true" />
          <Tool label="Align left" active={s.align === 'left'} onPress={align('left')}><AlignLeft size={17} /></Tool>
          <Tool label="Centre" active={s.align === 'center'} onPress={align('center')}><AlignCenter size={17} /></Tool>
          <Tool label="Align right" active={s.align === 'right'} onPress={align('right')}><AlignRight size={17} /></Tool>
          <Tool label="Justify" active={s.align === 'justify'} onPress={align('justify')}><AlignJustify size={17} /></Tool>
        </div>
        <div className="toolbar-group">
          <span className="toolbar-sep" aria-hidden="true" />
          <Tool label="Add a picture" click onPress={() => pictures.pickPhoto()}><ImageIcon size={17} /></Tool>
          {touch && <Tool label="Take a photo" click onPress={() => pictures.takePhoto()}><Camera size={17} /></Tool>}
          <Tool
            label={s.focusOn ? 'Show the whole paper' : 'Focus on this section'}
            active={s.focusOn}
            onPress={run(() => setSectionFocus(editor, !s.focusOn))}
          >
            <Focus size={17} />
          </Tool>
        </div>
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
  /** Act on click rather than mousedown (for buttons that open a picker). */
  click?: boolean
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
      onMouseDown={props.click ? e => e.preventDefault() : props.onPress}
      onClick={props.click ? props.onPress : undefined}
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
