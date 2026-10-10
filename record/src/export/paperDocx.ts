// A paper as a Word document (.docx), built in the browser. Loaded only
// when exporting (with the docx library), so it never slows Record down.
//
// The paper as finished (model/layout.ts): a title page (APA, Harvard)
// or MLA's header block; the writing — headings left out unless the paper
// includes them (then as Word's Heading 1–3); the font, size, spacing,
// first-line indent and margins; bold, italic, underline, strikethrough
// and alignment; pictures in line with text, so they stay where they are,
// with size, position and caption; citations as their text; page numbers
// top right (MLA: with the surname); the reference list on its own page.

import type { DocNode } from '@suite/record/noteDoc'
import { loadAttachment } from '@suite/record/attachments'
import type { CitationAttrs } from '@suite/record/editor/citationText'
import { finished } from '../model/layout'
import { MARGINS, PAPER_FONTS, type Paper } from '../model/papers'

/** What Word should call each font (it substitutes one it hasn't got). */
const WORD_FONT: Record<string, string> = {
  times: 'Times New Roman', georgia: 'Georgia', arial: 'Arial', calibri: 'Calibri', newsreader: 'Newsreader', plex: 'IBM Plex Sans',
}

type Docx = typeof import('docx')

export async function paperToDocx(paper: Paper, doc: DocNode, citation: (a: CitationAttrs) => string): Promise<Blob> {
  const d: Docx = await import('docx')
  const f = paper.format
  const font = WORD_FONT[f.font] ?? PAPER_FONTS[0].label
  const size = f.size * 2 // half-points
  const line = Math.round(240 * f.lineSpacing)
  const marginInches = MARGINS[f.margins].inches
  const margin = Math.round(marginInches * 1440)
  const contentWidthPx = (8.5 - 2 * marginInches) * 96
  const indent = f.indent ? { firstLine: 720 } : undefined

  const align = (a: unknown) => {
    switch (a) {
      case 'center': return d.AlignmentType.CENTER
      case 'right': return d.AlignmentType.RIGHT
      case 'justify': return d.AlignmentType.JUSTIFIED
      default: return d.AlignmentType.LEFT
    }
  }

  /** Text runs for a block's inline content: marks, line breaks and citations. */
  const runs = (node: DocNode): InstanceType<Docx['TextRun']>[] => (node.content ?? []).map(n => {
    if (n.type === 'hardBreak') return new d.TextRun({ break: 1 })
    if (n.type === 'citation') return new d.TextRun({ text: citation(n.attrs as unknown as CitationAttrs) })
    const marks = new Set((n.marks ?? []).map(m => m.type))
    return new d.TextRun({
      text: n.text ?? '',
      bold: marks.has('bold') || undefined,
      italics: marks.has('italic') || undefined,
      underline: marks.has('underline') ? {} : undefined,
      strike: marks.has('strike') || undefined,
      highlight: marks.has('highlight') ? 'yellow' : undefined,
    })
  })

  const plain = (node: DocNode): string => (node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(plain).join(''))

  const out = finished(paper, doc)
  type ParagraphOptions = ConstructorParameters<Docx['Paragraph']>[0] & object
  const blocks: InstanceType<Docx['Paragraph']>[] = []
  // The next paragraph starts a new page (after the title page; the references).
  let breakNext = false
  const push = (options: ParagraphOptions) => {
    blocks.push(new d.Paragraph(breakNext ? { ...options, pageBreakBefore: true } : options))
    breakNext = false
  }

  // A title page: the title a little way down, bold and centred, the details beneath.
  if (out.titlePage) {
    for (let i = 0; i < 3; i++) push({ children: [] })
    push({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: out.titlePage.title || 'Untitled', bold: true })] })
    push({ children: [] })
    for (const l of out.titlePage.lines) push({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun(l)] })
    breakNext = true
  }
  // MLA's block, top left.
  for (const l of out.header ?? []) push({ children: [new d.TextRun(l)] })
  if (out.bodyTitle) push({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: out.bodyTitle.text, bold: out.bodyTitle.bold || undefined })] })

  const picture = async (n: DocNode) => {
    const a = n.attrs ?? {}
    const stored = await loadAttachment(String(a.id ?? ''))
    if (!stored) {
      push({ children: [new d.TextRun({ text: '[Picture not on this device]', italics: true })] })
      return
    }
    const fraction = a.size === 'small' ? 1 / 3 : a.size === 'half' ? 0.5 : 1
    const w0 = Number(a.width) || 800
    const h0 = Number(a.height) || 600
    let width = contentWidthPx * fraction
    let height = (width * h0) / w0
    const maxHeight = 8 * 96
    if (height > maxHeight) {
      width *= maxHeight / height
      height = maxHeight
    }
    const alignment = a.align === 'left' ? d.AlignmentType.LEFT : a.align === 'right' ? d.AlignmentType.RIGHT : d.AlignmentType.CENTER
    push({
      alignment,
      children: [new d.ImageRun({
        type: stored.blob.type === 'image/png' ? 'png' : 'jpg',
        data: await stored.blob.arrayBuffer(),
        transformation: { width: Math.round(width), height: Math.round(height) },
      })],
    })
    const caption = String(a.caption ?? '').trim()
    if (caption) push({ alignment, children: [new d.TextRun({ text: caption, italics: true })] })
  }

  const list = (n: DocNode, ordered: boolean, depth = 0) => {
    ;(n.content ?? []).forEach((item, i) => {
      const mark = n.type === 'taskList' ? (item.attrs?.checked ? '☑ ' : '☐ ') : ordered ? `${i + 1}. ` : '• '
      for (const child of item.content ?? []) {
        if (child.type === 'paragraph') {
          push({ indent: { left: 360 * (depth + 1), hanging: 360 }, children: [new d.TextRun(mark), ...runs(child)] })
        } else if (['bulletList', 'orderedList', 'taskList'].includes(child.type)) {
          list(child, child.type === 'orderedList', depth + 1)
        }
      }
    })
  }

  for (const n of out.body) {
    switch (n.type) {
      case 'paragraph':
        push({ alignment: align(n.attrs?.textAlign), indent, children: runs(n) })
        break
      case 'heading': {
        const level = Number(n.attrs?.level ?? 2)
        const heading = level === 1 ? d.HeadingLevel.HEADING_1 : level === 2 ? d.HeadingLevel.HEADING_2 : d.HeadingLevel.HEADING_3
        push({ heading, alignment: align(n.attrs?.textAlign), children: runs(n) })
        break
      }
      case 'attachment':
        await picture(n)
        break
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        list(n, n.type === 'orderedList')
        break
      case 'codeBlock':
        push({ children: [new d.TextRun({ text: plain(n), font: 'Courier New' })] })
        break
      case 'horizontalRule':
        push({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'auto', space: 1 } } })
        break
      default:
        if (plain(n)) push({ children: [new d.TextRun(plain(n))] })
    }
  }

  // The reference list, on a page of its own, each entry with a hanging indent.
  if (out.references) {
    breakNext = true
    push({
      alignment: out.references.align === 'left' ? d.AlignmentType.LEFT : d.AlignmentType.CENTER,
      children: [new d.TextRun({ text: out.references.heading, bold: out.references.bold || undefined })],
    })
    for (const entry of out.references.entries) {
      push({ indent: { left: 720, hanging: 720 }, children: entry.map(s => new d.TextRun({ text: s.text, italics: s.italic || undefined })) })
    }
  }

  // Page numbers top right; MLA puts the surname before them.
  const headers = f.pageNumbers ? {
    default: new d.Header({
      children: [new d.Paragraph({
        alignment: d.AlignmentType.RIGHT,
        children: [new d.TextRun({ children: [out.runningHead ? `${out.runningHead} ` : '', d.PageNumber.CURRENT] })],
      })],
    }),
  } : undefined

  const headingStyle = (id: string, name: string, scale: number, italics = false) => ({
    id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font, size: Math.round(size * scale), bold: true, italics, color: '000000' },
    paragraph: { spacing: { before: 240, after: 0, line } },
  })

  const document = new d.Document({
    creator: f.name || undefined,
    title: paper.title || undefined,
    styles: {
      default: { document: { run: { font, size }, paragraph: { spacing: { line, before: 0, after: 0 } } } },
      paragraphStyles: [
        headingStyle('Heading1', 'Heading 1', 1.35),
        headingStyle('Heading2', 'Heading 2', 1.15),
        headingStyle('Heading3', 'Heading 3', 1, true),
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: margin, bottom: margin, left: margin, right: margin } } },
      headers,
      children: blocks,
    }],
  })
  return d.Packer.toBlob(document)
}
