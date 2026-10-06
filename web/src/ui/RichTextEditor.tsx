// The classic-note editor: an editable area with Bold, Italic and
// Heading, matching the iPhone editor's three styles. The saved form is
// RTF (see model/rtf.ts); HTML only lives here while editing.

import { Bold, Heading, Italic } from 'lucide-react'
import { useEffect, useRef } from 'react'
import {
  base64FromRtf, paragraphsToRtf, paragraphsToText, rtfFromBase64, rtfToParagraphs, type Paragraph, type Run,
} from '../model/rtf'

// MARK: - Paragraphs <-> HTML

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function runHtml(run: Run, inHeading: boolean): string {
  let html = escapeHtml(run.text)
  if (run.italic) html = `<i>${html}</i>`
  if (run.bold && !inHeading) html = `<b>${html}</b>`
  if (run.heading && !inHeading) html = `<span class="h">${html}</span>`
  return html
}

export function paragraphsToHtml(paragraphs: Paragraph[]): string {
  return paragraphs.map(p => {
    const isHeading = p.length > 0 && p.every(r => r.heading)
    const inner = p.map(r => runHtml(r, isHeading)).join('')
    return isHeading ? `<h3>${inner}</h3>` : `<div>${inner || '<br>'}</div>`
  }).join('')
}

const BLOCKS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'])

/** Reads whatever markup the browser produced back into paragraphs. */
export function htmlToParagraphs(root: HTMLElement): Paragraph[] {
  const paras: Paragraph[] = [[]]
  const last = () => paras[paras.length - 1]
  const add = (text: string, style: Omit<Run, 'text'>) => {
    if (!text) return
    const clean = text.replace(/ /g, ' ')
    const para = last()
    const prev = para[para.length - 1]
    if (prev && prev.bold === style.bold && prev.italic === style.italic && prev.heading === style.heading) prev.text += clean
    else para.push({ text: clean, ...style })
  }

  const walk = (node: Node, style: Omit<Run, 'text'>) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        add(child.textContent ?? '', style)
        return
      }
      if (!(child instanceof HTMLElement)) return
      const tag = child.tagName
      if (tag === 'BR') {
        paras.push([])
        return
      }
      const next = { ...style }
      if (tag === 'B' || tag === 'STRONG') next.bold = true
      if (tag === 'I' || tag === 'EM') next.italic = true
      if (/^H[1-6]$/.test(tag) || child.classList.contains('h')) next.heading = true
      const css = child.style
      if (css.fontWeight === 'bold' || Number(css.fontWeight) >= 600) next.bold = true
      if (css.fontStyle === 'italic') next.italic = true

      if (BLOCKS.has(tag)) {
        if (last().length > 0) paras.push([])
        walk(child, next)
        if (last().length > 0) paras.push([])
      } else {
        walk(child, next)
      }
    })
  }
  walk(root, { bold: false, italic: false, heading: false })
  while (paras.length > 1 && paras[paras.length - 1].length === 0) paras.pop()
  return paras
}

// MARK: - Editor

export function RichTextEditor({ value, onChange, label }: { value: string | undefined; onChange: (data: string | undefined) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)

  // Filled once from the saved RTF; after that the DOM is the source of
  // truth until save, so typing never fights a re-render.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = paragraphsToHtml(rtfToParagraphs(rtfFromBase64(value)))
  }, [])

  const emit = () => {
    if (!ref.current) return
    const paragraphs = htmlToParagraphs(ref.current)
    onChange(paragraphsToText(paragraphs).trim() ? base64FromRtf(paragraphsToRtf(paragraphs)) : undefined)
  }

  const command = (name: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand('defaultParagraphSeparator', false, 'div')
    document.execCommand(name, false, arg)
    emit()
  }

  const toggleHeading = () => {
    const block = document.queryCommandValue('formatBlock').toLowerCase()
    command('formatBlock', block === 'h3' ? 'div' : 'h3')
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
        {/* onMouseDown keeps the text selection while pressing a button. */}
        <button type="button" aria-label="Bold" onMouseDown={e => { e.preventDefault(); command('bold') }}><Bold size={16} /></button>
        <button type="button" aria-label="Italic" onMouseDown={e => { e.preventDefault(); command('italic') }}><Italic size={16} /></button>
        <button type="button" aria-label="Heading" onMouseDown={e => { e.preventDefault(); toggleHeading() }}><Heading size={16} /></button>
      </div>
      <div
        ref={ref}
        className="rich-content"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        onInput={emit}
        onPaste={e => {
          // Plain text only — pasted styles the iPhone can't show would just vanish later.
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); command('bold') }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); command('italic') }
        }}
      />
    </div>
  )
}
