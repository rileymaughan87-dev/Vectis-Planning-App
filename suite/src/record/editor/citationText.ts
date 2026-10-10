// How citations read in the paper that's open — set by the paper (from its
// style and research), read by every citation in the editor. Kept apart
// from the editor itself so a paper can set it without loading the editor.

export interface CitationAttrs {
  sourceId: string
  /** The page for this citation, if it differs from the source's. */
  page: string
}

/** Fired on window when citations should be written again (style or sources changed). */
export const CITATIONS_CHANGED = 'vectis-citations-changed'

let citationText: (attrs: CitationAttrs) => string = () => '(source)'

/** How citations read now; every citation on screen redraws. */
export function setCitationText(f: (attrs: CitationAttrs) => string) {
  citationText = f
  window.dispatchEvent(new Event(CITATIONS_CHANGED))
}

/** The text a citation shows (also what exports use). */
export const citationLabel = (attrs: CitationAttrs) => citationText(attrs)
