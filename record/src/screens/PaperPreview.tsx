// The finished paper, page by page, as it will look in Word or on paper:
// the title page (or MLA's header), the writing without its guide
// headings, and the reference list on its own page. Built from the same
// layout as the Word export (model/layout.ts), and what printing prints.

import { attachmentURL } from '@suite/record/attachments'
import { citationLabel, type CitationAttrs } from '@suite/record/editor/citationText'
import type { DocNode } from '@suite/record/noteDoc'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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

function Picture({ node }: { node: DocNode }) {
  const a = node.attrs ?? {}
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    attachmentURL(String(a.id ?? '')).then(u => live && setUrl(u ?? null))
    return () => { live = false }
  }, [a.id])
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

export function PaperPreview({ paper, doc, style }: { paper: Paper; doc: DocNode; style: CSSProperties }) {
  const out = finished(paper, doc)
  const numbers = paper.format.pageNumbers
  let page = 0
  const pageNumber = () => {
    page += 1
    return numbers ? <span className="preview-page-number" aria-hidden="true">{out.runningHead ? `${out.runningHead} ` : ''}{page}</span> : null
  }

  return (
    <div className="paper-preview" style={style}>
      {out.titlePage && (
        <section className="preview-sheet preview-title-page" aria-label="Title page">
          {pageNumber()}
          <div className="preview-title-block">
            <p className="preview-title"><strong>{out.titlePage.title || 'Untitled'}</strong></p>
            <p>&nbsp;</p>
            {out.titlePage.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </section>
      )}

      <section className="preview-sheet preview-body" aria-label="The paper">
        {pageNumber()}
        {out.header?.map((l, i) => <p key={i} className="preview-header-line">{l}</p>)}
        {out.bodyTitle && <p className="preview-title">{out.bodyTitle.bold ? <strong>{out.bodyTitle.text}</strong> : out.bodyTitle.text}</p>}
        {out.body.map((n, i) => <Block key={i} node={n} />)}
      </section>

      {out.references && (
        <section className="preview-sheet preview-references" aria-label={out.references.heading}>
          {pageNumber()}
          <p className="preview-references-heading" style={{ textAlign: out.references.align }}>
            {out.references.bold ? <strong>{out.references.heading}</strong> : out.references.heading}
          </p>
          {out.references.entries.map((e, i) => (
            <p key={i} className="preview-reference">{e.map((s, j) => (s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>))}</p>
          ))}
        </section>
      )}
      <p className="help preview-note">Long writing runs on over as many pages as it needs; page numbers carry on in Word and when printed.</p>
    </div>
  )
}
