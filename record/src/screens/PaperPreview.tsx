// The finished paper, page by page, as it will look in Word or on paper:
// the title page (or MLA's header), the writing without its guide
// headings, and the reference list on its own page. Built from the same
// layout as the Word export (model/layout.ts), and what printing prints.

import { attachmentURL } from '@suite/record/attachments'
import { citationLabel, type CitationAttrs } from '@suite/record/editor/citationText'
import type { DocNode } from '@suite/record/noteDoc'
import { PAGE_GAP, overflowAt, pageOf } from '@suite/record/pageFlow'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { finished } from '../model/layout'
import type { Paper } from '../model/papers'

function Inline({ node }: { node: DocNode }): ReactNode {
  if (node.type === 'hardBreak') return <br />
  if (node.type === 'citation') return citationLabel(node.attrs as unknown as CitationAttrs)
  if (node.type !== 'text') return null
  let out: ReactNode = node.text ?? ''
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') out = <strong>{out}</strong>
    else if (m.type === 'italic') out = <em>{out}</em>
    else if (m.type === 'underline') out = <u>{out}</u>
    else if (m.type === 'strike') out = <s>{out}</s>
    else if (m.type === 'highlight') out = <mark>{out}</mark>
  }
  return out
}

const inline = (n: DocNode) => (n.content ?? []).map((c, i) => <Inline key={i} node={c} />)
const alignOf = (n: DocNode): CSSProperties => ({ textAlign: (n.attrs?.textAlign as CSSProperties['textAlign']) ?? undefined })

/** The pictures' addresses, looked up before the pages are laid out (so their heights are known). */
const PictureURLs = createContext<Record<string, string | null>>({})

function Picture({ node }: { node: DocNode }) {
  const a = node.attrs ?? {}
  const url = useContext(PictureURLs)[String(a.id ?? '')] ?? null
  const width = a.size === 'small' ? '33%' : a.size === 'half' ? '50%' : '100%'
  const margin = a.align === 'left' ? '0 auto 0 0' : a.align === 'right' ? '0 0 0 auto' : '0 auto'
  return (
    <figure className="preview-figure" style={{ textAlign: (a.align as CSSProperties['textAlign']) ?? 'center' }}>
      {url ? <img src={url} alt={String(a.caption || 'Picture')} style={{ width, margin, display: 'block' }} /> : <span className="caption">[Picture not on this device]</span>}
      {a.caption ? <figcaption>{String(a.caption)}</figcaption> : null}
    </figure>
  )
}

function Block({ node }: { node: DocNode }): ReactNode {
  switch (node.type) {
    case 'paragraph': return <p style={alignOf(node)}>{inline(node)}</p>
    case 'heading': {
      const level = Number(node.attrs?.level ?? 2)
      return <div className={`preview-heading level-${level}`} style={alignOf(node)}>{inline(node)}</div>
    }
    case 'attachment': return <Picture node={node} />
    case 'bulletList': return <ul>{(node.content ?? []).map((li, i) => <li key={i}>{(li.content ?? []).map((c, j) => <Block key={j} node={c} />)}</li>)}</ul>
    case 'orderedList': return <ol>{(node.content ?? []).map((li, i) => <li key={i}>{(li.content ?? []).map((c, j) => <Block key={j} node={c} />)}</li>)}</ol>
    case 'taskList': return <ul className="preview-tasks">{(node.content ?? []).map((li, i) => <li key={i}>{li.attrs?.checked ? '☑ ' : '☐ '}{(li.content ?? []).map((c, j) => <Block key={j} node={c} />)}</li>)}</ul>
    case 'horizontalRule': return <hr />
    case 'codeBlock': return <pre>{(node.content ?? []).map(c => c.text).join('')}</pre>
    default: return null
  }
}

/**
 * Splits the writing into pages where each fills, as Word will: the sheet
 * ends, a gap, the next sheet starts (with its page number). Drawn into the
 * laid-out page directly, once, after React has rendered it; the section is
 * keyed by its content, so any change starts it afresh. Returns how many
 * pages the writing takes.
 */
function paginate(sheet: HTMLElement, firstPage: number, head: string | null): number {
  // Once only (React may run the effect twice on the same page).
  if (sheet.dataset.pages) return Number(sheet.dataset.pages)
  const page = pageOf(sheet)
  const spacer = (height: number, number: number, block: boolean) => {
    const el = document.createElement(block ? 'div' : 'span')
    el.className = 'page-break'
    el.setAttribute('aria-hidden', 'true')
    el.style.setProperty('--break-height', `${height}px`)
    el.style.setProperty('--break-gap-top', `${height - page.padTop - PAGE_GAP}px`)
    el.style.setProperty('--break-pad-x', `${page.padX}px`)
    el.append(Object.assign(document.createElement('span'), { className: 'page-break-gap' }))
    if (head !== null) {
      const n = Object.assign(document.createElement('span'), { className: 'page-break-number', textContent: `${head ? `${head} ` : ''}${number}` })
      n.style.top = `${height - page.padTop / 2}px`
      el.append(n)
    }
    return el
  }
  const isPageNumber = (el: Element) => el.classList.contains('preview-page-number')
  let pageTop = page.firstTop
  let count = 1
  for (let n = 0; n < 500; n++) {
    const end = sheet.getBoundingClientRect().bottom - sheet.clientTop - page.padBottom
    const bottom = pageTop + page.height
    if (bottom >= end - 1) break
    const at = overflowAt(sheet, bottom, isPageNumber)
    if (!at) break
    // A picture (or line) taller than a page can't be moved on: let it run over.
    if (at.top <= pageTop + 1) {
      pageTop = bottom
      continue
    }
    count += 1
    const el = spacer(Math.max(0, bottom - at.top) + page.padBottom + PAGE_GAP + page.padTop, firstPage + count - 1, at.kind === 'block')
    if (at.kind === 'text') at.node.splitText(at.offset).before(el)
    else at.el.before(el)
    pageTop = el.getBoundingClientRect().bottom
  }
  sheet.dataset.pages = String(count)
  // The last page is drawn full height, like the others.
  const end = sheet.getBoundingClientRect().bottom - sheet.clientTop - page.padBottom
  if (pageTop + page.height > end) sheet.append(Object.assign(document.createElement('div'), { className: 'page-tail', style: `height:${pageTop + page.height - end}px` }))
  return count
}

export function PaperPreview({ paper, doc, style }: { paper: Paper; doc: DocNode; style: CSSProperties }) {
  const out = finished(paper, doc)
  const numbers = paper.format.pageNumbers
  const bodyRef = useRef<HTMLElement>(null)
  const firstBodyPage = out.titlePage ? 2 : 1
  // Any change to what's shown (or how) lays the pages out afresh.
  const contentKey = JSON.stringify([out.header, out.bodyTitle, out.body, style, numbers])
  const [width, setWidth] = useState(0)
  const ids = out.body.flatMap(function find(n: DocNode): string[] {
    return n.type === 'attachment' ? [String(n.attrs?.id ?? '')] : (n.content ?? []).flatMap(find)
  })
  const [urls, setURLs] = useState<Record<string, string | null> | null>(ids.length ? null : {})
  const idKey = ids.join()
  useEffect(() => {
    let live = true
    const ids = idKey ? idKey.split(',') : []
    Promise.all(ids.map(id => attachmentURL(id).then(u => [id, u] as const))).then(pairs => live && setURLs(Object.fromEntries(pairs)))
    return () => { live = false }
  }, [idKey])
  const head = numbers ? out.runningHead : null
  const [bodyPages, setBodyPages] = useState(1)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useLayoutEffect(() => {
    const sheet = bodyRef.current
    if (!sheet || !urls) return
    const run = () => setBodyPages(paginate(sheet, firstBodyPage, head))
    // Pictures load after the first layout: lay the pages out once they have.
    const pending = [...sheet.querySelectorAll('img')].filter(i => !i.complete)
    if (!pending.length) run()
    else Promise.all(pending.map(i => new Promise(r => { i.onload = i.onerror = r }))).then(run)
  }, [contentKey, width, urls, firstBodyPage, head])
  const pageNumber = (page: number) => {
    return numbers ? <span className="preview-page-number" aria-hidden="true">{out.runningHead ? `${out.runningHead} ` : ''}{page}</span> : null
  }

  return (
    <div className="paper-preview" style={style}>
      {out.titlePage && (
        <section className="preview-sheet preview-title-page" aria-label="Title page">
          {pageNumber(1)}
          <div className="preview-title-block">
            <p className="preview-title"><strong>{out.titlePage.title || 'Untitled'}</strong></p>
            <p>&nbsp;</p>
            {out.titlePage.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </section>
      )}

      <section key={`${contentKey}${width}${urls ? 1 : 0}`} ref={bodyRef} className="preview-sheet preview-body" aria-label="The paper">
        {pageNumber(firstBodyPage)}
        {out.header?.map((l, i) => <p key={i} className="preview-header-line">{l}</p>)}
        {out.bodyTitle && <p className="preview-title">{out.bodyTitle.bold ? <strong>{out.bodyTitle.text}</strong> : out.bodyTitle.text}</p>}
        <PictureURLs.Provider value={urls ?? {}}>
          {out.body.map((n, i) => <Block key={i} node={n} />)}
        </PictureURLs.Provider>
      </section>

      {out.references && (
        <section className="preview-sheet preview-references" aria-label={out.references.heading}>
          {pageNumber(firstBodyPage + bodyPages)}
          <p className="preview-references-heading" style={{ textAlign: out.references.align }}>
            {out.references.bold ? <strong>{out.references.heading}</strong> : out.references.heading}
          </p>
          {out.references.entries.map((e, i) => (
            <p key={i} className="preview-reference">{e.map((s, j) => (s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>))}</p>
          ))}
        </section>
      )}
      <p className="help preview-note">Pages break about where Word will put them; on a narrow screen it's an estimate.</p>
    </div>
  )
}
