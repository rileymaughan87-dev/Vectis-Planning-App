// Where a page ends, in laid-out writing: the first line that doesn't fit
// above a given height. Shared by the paper editor's page breaks and the
// finished-paper preview. Works from the lines' measured positions, so it
// doesn't matter whether that part of the page is on screen.

export const PAGE_W = 8.5 * 96
export const PAGE_H = 11 * 96
/** The space between two pages on screen. */
export const PAGE_GAP = 24

export type Overflow =
  /** A line part-way through a paragraph: break before this character. */
  | { kind: 'text'; node: Text; offset: number; top: number }
  /** A whole block (a paragraph's first line, a picture): break before it. */
  | { kind: 'block'; el: HTMLElement; index: number; top: number }

export interface Page { padTop: number; padBottom: number; padX: number; height: number; firstTop: number }

/** A sheet's margins on screen, and how tall a page of writing is at this width. */
export function pageOf(sheet: HTMLElement): Page {
  const cs = getComputedStyle(sheet)
  const margin = parseFloat(cs.getPropertyValue('--paper-margin')) || 96
  const padX = parseFloat(cs.paddingLeft)
  const width = sheet.clientWidth - padX - parseFloat(cs.paddingRight)
  // Narrower than the page, each line holds fewer words: draw pages taller to hold about the same.
  const ratio = Math.min(1, width / (PAGE_W - 2 * margin))
  return {
    padTop: parseFloat(cs.paddingTop),
    padBottom: parseFloat(cs.paddingBottom),
    padX,
    height: (PAGE_H - 2 * margin) / ratio,
    firstTop: sheet.getBoundingClientRect().top + sheet.clientTop + parseFloat(cs.paddingTop),
  }
}

const charRect = (range: Range, node: Text, i: number) => {
  range.setStart(node, i)
  range.setEnd(node, i + 1)
  return range.getBoundingClientRect()
}

/** The first line (or block) in `root`'s children that reaches below `bottom`. */
export function overflowAt(root: HTMLElement, bottom: number, skip: (el: Element) => boolean = () => false): Overflow | null {
  const range = document.createRange()
  const children = [...root.children] as HTMLElement[]
  for (let index = 0; index < children.length; index++) {
    const el = children[index]
    if (skip(el)) continue
    const box = el.getBoundingClientRect()
    if (box.bottom <= bottom || box.height === 0) continue
    // Find the first character below the line, in reading order.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement?.closest('[contenteditable="false"]') && n.parentElement !== el ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    })
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (!n.length) continue
      range.selectNodeContents(n)
      if (range.getBoundingClientRect().bottom <= bottom) continue
      let lo = 0
      let hi = n.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (charRect(range, n, mid).bottom > bottom) hi = mid
        else lo = mid + 1
      }
      const top = charRect(range, n, lo).top
      // Nothing before it in this block: the whole block moves on (keeping its first-line indent).
      range.setStart(el, 0)
      range.setEnd(n, lo)
      if (!range.toString().trim()) return { kind: 'block', el, index, top: box.top }
      return { kind: 'text', node: n, offset: lo, top }
    }
    // No words (a picture, a rule): the block moves on.
    return { kind: 'block', el, index, top: box.top }
  }
  return null
}
