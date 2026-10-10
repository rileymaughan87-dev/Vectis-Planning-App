// Page breaks while writing a paper: where the writing reaches the bottom
// of a letter-size page (less its margins), the sheet ends and the next
// one starts, as in Word. Measured from the laid-out lines, so it follows
// the paper's font, size and spacing. On a screen narrower than the page
// each line holds fewer words, so pages are drawn taller to hold about
// the same writing — close there, not exact.
//
// Each run takes the breaks out, measures the lines where they naturally
// fall, and puts the breaks back, all before the screen redraws.

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { PAGE_GAP, overflowAt, pageOf, type Page } from '../pageFlow'

const key = new PluginKey<DecorationSet>('vectis-page-breaks')

interface Break { pos: number; height: number; block: boolean }

/** Where each page ends, from the lines as they lie with no breaks drawn. */
function measure(view: EditorView, page: Page): { breaks: Break[]; tail: number } {
  const root = view.dom as HTMLElement
  const last = root.lastElementChild?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top
  const breaks: Break[] = []
  // The first page starts at the top of the sheet's writing area (the title and header use some of it).
  let pageTop = page.firstTop
  for (let n = 0; n < 500; n++) {
    const bottom = pageTop + page.height
    if (bottom >= last) break
    const at = overflowAt(root, bottom)
    if (!at) break
    // A picture (or line) taller than a page can't be moved on: let it run over.
    if (at.top <= pageTop + 1) {
      pageTop = bottom
      continue
    }
    const pos = at.kind === 'text' ? view.posAtDOM(at.node, at.offset) : view.posAtDOM(root, at.index)
    breaks.push({ pos, block: at.kind === 'block', height: Math.max(0, bottom - at.top) + page.padBottom + PAGE_GAP + page.padTop })
    pageTop = at.top
  }
  // The last page is drawn full height, like the others.
  return { breaks, tail: Math.max(0, pageTop + page.height - last) }
}

function build(doc: PMNode, breaks: Break[], tail: number, sheet: Page): DecorationSet {
  const decorations = breaks.map(b => Decoration.widget(b.pos, () => {
    const el = document.createElement(b.block ? 'div' : 'span')
    el.className = 'page-break'
    el.contentEditable = 'false'
    el.setAttribute('aria-hidden', 'true')
    el.style.setProperty('--break-height', `${b.height}px`)
    el.style.setProperty('--break-gap-top', `${b.height - sheet.padTop - PAGE_GAP}px`)
    el.style.setProperty('--break-pad-x', `${sheet.padX}px`)
    el.append(Object.assign(document.createElement('span'), { className: 'page-break-gap' }))
    return el
  }, { side: -1, ignoreSelection: true, key: `break-${b.pos}-${Math.round(b.height)}` }))
  if (tail > 0) {
    decorations.push(Decoration.widget(doc.content.size, () => {
      const el = document.createElement('div')
      el.className = 'page-tail'
      el.contentEditable = 'false'
      el.setAttribute('aria-hidden', 'true')
      el.style.height = `${tail}px`
      return el
    }, { side: 1, ignoreSelection: true, key: `tail-${Math.round(tail)}` }))
  }
  return DecorationSet.create(doc, decorations)
}

export const PageBreaks = Extension.create({
  name: 'pageBreaks',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, old) => tr.getMeta(key) ?? old.map(tr.mapping, tr.doc),
      },
      props: { decorations: state => key.getState(state) },
      view(view) {
        let timer: ReturnType<typeof setTimeout> | undefined
        let lastWidth = 0
        let lastHeight = 0
        const run = () => {
          const el = view.dom.closest<HTMLElement>('.paper-sheet')
          if (!el || !el.offsetParent || view.isDestroyed) return // hidden (another mode is showing)
          const dom = view.dom as HTMLElement
          // Hold the height while the breaks are out, so the page doesn't scroll.
          dom.style.minHeight = `${dom.offsetHeight}px`
          view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta('addToHistory', false))
          const page = pageOf(el)
          const { breaks, tail } = measure(view, page)
          view.dispatch(view.state.tr.setMeta(key, build(view.state.doc, breaks, tail, page)).setMeta('addToHistory', false))
          dom.style.minHeight = ''
          lastWidth = dom.offsetWidth
          lastHeight = dom.offsetHeight
        }
        const soon = (ms = 150) => {
          clearTimeout(timer)
          timer = setTimeout(run, ms)
        }
        // A new width, font or spacing moves the lines (but not the breaks' own changes).
        const resized = new ResizeObserver(() => {
          const dom = view.dom as HTMLElement
          if (dom.offsetWidth !== lastWidth || dom.offsetHeight !== lastHeight) soon(50)
        })
        resized.observe(view.dom)
        // Fonts arriving late change the lines too.
        document.fonts?.ready.then(() => soon(0))
        soon(0)
        return {
          update(v, prev) {
            if (!v.state.doc.eq(prev.doc)) soon()
          },
          destroy() {
            clearTimeout(timer)
            resized.disconnect()
          },
        }
      },
    })]
  },
})
