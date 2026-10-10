// A citation in a paper: an inline token that points at a research item
// (`sourceId`) and shows the in-text citation in the paper's style — so
// changing the style, or fixing a source's details, updates every one.
// The paper supplies how to write it (`setCitationText`, citationText.ts).

import { Node } from '@tiptap/core'
import { CITATIONS_CHANGED, citationLabel, type CitationAttrs } from './citationText'

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      sourceId: { default: '' },
      page: { default: '' },
    }
  },

  parseHTML: () => [{ tag: 'cite[data-source]', getAttrs: el => ({ sourceId: (el as HTMLElement).dataset.source }) }],
  renderHTML: ({ HTMLAttributes, node }) => ['cite', { 'data-source': HTMLAttributes.sourceId }, citationLabel(node.attrs as CitationAttrs)],
  renderText: ({ node }) => citationLabel(node.attrs as CitationAttrs),

  addNodeView() {
    return ({ node: initial }) => {
      let node = initial
      const dom = document.createElement('span')
      dom.className = 'citation'
      dom.contentEditable = 'false'
      const paint = () => {
        dom.textContent = citationLabel(node.attrs as CitationAttrs)
      }
      paint()
      window.addEventListener(CITATIONS_CHANGED, paint)
      return {
        dom,
        update: updated => {
          if (updated.type !== node.type) return false
          node = updated
          paint()
          return true
        },
        selectNode: () => dom.classList.add('is-selected'),
        deselectNode: () => dom.classList.remove('is-selected'),
        ignoreMutation: () => true,
        destroy: () => window.removeEventListener(CITATIONS_CHANGED, paint),
      }
    }
  },
})
