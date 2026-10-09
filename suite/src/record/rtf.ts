// Classic notes are saved as RTF (base64 in the JSON), exactly as the
// iPhone app writes them, so a note edited on either side opens on the
// other. The iPhone editor offers bold, italic and a heading size; this
// reads and writes that much and quietly drops anything fancier.
//
// Everything passes through a plain "runs" shape — paragraphs of styled
// text — so the RTF half is testable without a browser.

export interface Run {
  text: string
  bold: boolean
  italic: boolean
  heading: boolean
}
export type Paragraph = Run[]

/** Font sizes are in half-points; the iPhone heading is 20pt, body 16pt. */
const BODY_FS = 32
const HEADING_FS = 40
const HEADING_MIN_FS = 38

// MARK: - Base64 <-> RTF text

/** The RTF from a note's `richTextData`, or '' if there is none. */
export function rtfFromBase64(data: string | undefined): string {
  if (!data) return ''
  try {
    const bin = atob(data)
    // RTF is 7-bit ASCII with escapes, so byte-for-byte is safe.
    return bin
  } catch {
    return ''
  }
}

export function base64FromRtf(rtf: string): string {
  return btoa(rtf)
}

// MARK: - RTF -> runs

interface State {
  bold: boolean
  italic: boolean
  fs: number
  font: number
  skip: boolean
  uc: number
}

const SKIP_DESTINATIONS = new Set(['colortbl', 'expandedcolortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable', 'listoverridetable'])

const cp1252 = typeof TextDecoder !== 'undefined' ? new TextDecoder('windows-1252') : null
const byteToChar = (b: number) => (cp1252 ? cp1252.decode(new Uint8Array([b])) : String.fromCharCode(b))

export function rtfToParagraphs(rtf: string): Paragraph[] {
  const paragraphs: Paragraph[] = [[]]
  const fonts = new Map<number, string>()
  let state: State = { bold: false, italic: false, fs: BODY_FS, font: 0, skip: false, uc: 1 }
  const stack: State[] = []
  let inFontTable = 0 // depth marker
  let fontName = ''
  let fontNumber = 0
  let pendingSkip = 0 // fallback chars to skip after \uN

  const fontStyle = (n: number) => {
    const name = (fonts.get(n) ?? '').toLowerCase()
    return {
      bold: /bold|semibold|heavy|black/.test(name),
      italic: /italic|oblique/.test(name),
    }
  }

  const emit = (text: string) => {
    if (state.skip || !text) return
    if (inFontTable) {
      fontName += text
      return
    }
    const fromFont = fontStyle(state.font)
    const run: Run = {
      text,
      bold: state.bold || fromFont.bold,
      italic: state.italic || fromFont.italic,
      heading: state.fs >= HEADING_MIN_FS,
    }
    const para = paragraphs[paragraphs.length - 1]
    const last = para[para.length - 1]
    if (last && last.bold === run.bold && last.italic === run.italic && last.heading === run.heading) last.text += text
    else para.push(run)
  }

  const newParagraph = () => {
    if (!state.skip && !inFontTable) paragraphs.push([])
  }

  let i = 0
  while (i < rtf.length) {
    const ch = rtf[i]
    if (ch === '{') {
      stack.push({ ...state })
      i++
      continue
    }
    if (ch === '}') {
      if (inFontTable && stack.length === inFontTable) inFontTable = 0
      state = stack.pop() ?? state
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      i++
      continue
    }
    if (ch !== '\\') {
      if (pendingSkip > 0) {
        pendingSkip--
        i++
        continue
      }
      if (inFontTable && ch === ';') {
        fonts.set(fontNumber, fontName.trim())
        fontName = ''
        i++
        continue
      }
      emit(ch)
      i++
      continue
    }

    // A control word or symbol.
    const next = rtf[i + 1]
    if (next === undefined) break
    if (/[a-zA-Z]/.test(next)) {
      let j = i + 1
      while (j < rtf.length && /[a-zA-Z]/.test(rtf[j])) j++
      const word = rtf.slice(i + 1, j)
      let numText = ''
      if (rtf[j] === '-' || /[0-9]/.test(rtf[j] ?? '')) {
        let k = j + 1
        while (k < rtf.length && /[0-9]/.test(rtf[k])) k++
        numText = rtf.slice(j, k)
        j = k
      }
      if (rtf[j] === ' ') j++
      const num = numText === '' ? undefined : parseInt(numText, 10)
      i = j

      if (pendingSkip > 0) {
        // A control word counts as one fallback character.
        pendingSkip--
        continue
      }

      switch (word) {
        case 'fonttbl':
          inFontTable = stack.length
          break
        case 'f':
          if (inFontTable) fontNumber = num ?? 0
          else state.font = num ?? 0
          break
        case 'b': state.bold = num !== 0; break
        case 'i': state.italic = num !== 0; break
        case 'fs': state.fs = num ?? BODY_FS; break
        case 'plain': state = { ...state, bold: false, italic: false, fs: BODY_FS, font: 0 }; break
        case 'par':
        case 'line':
        case 'sect':
        case 'page':
          newParagraph()
          break
        case 'tab': emit('\t'); break
        case 'emdash': emit('—'); break
        case 'endash': emit('–'); break
        case 'bullet': emit('•'); break
        case 'lquote': emit('‘'); break
        case 'rquote': emit('’'); break
        case 'ldblquote': emit('“'); break
        case 'rdblquote': emit('”'); break
        case 'uc': state.uc = num ?? 1; break
        case 'u': {
          const code = (num ?? 0) < 0 ? (num ?? 0) + 65536 : (num ?? 0)
          emit(String.fromCharCode(code))
          pendingSkip = state.uc
          break
        }
        default:
          if (SKIP_DESTINATIONS.has(word)) state.skip = true
      }
      continue
    }

    // Control symbols.
    i += 2
    switch (next) {
      case '\\':
      case '{':
      case '}':
        if (pendingSkip > 0) pendingSkip--
        else emit(next)
        break
      case "'": {
        const hex = rtf.slice(i, i + 2)
        i += 2
        if (pendingSkip > 0) pendingSkip--
        else emit(byteToChar(parseInt(hex, 16)))
        break
      }
      case '\n':
      case '\r':
        // Cocoa ends paragraphs with a backslash-newline.
        newParagraph()
        break
      case '*':
        state.skip = true
        break
      case '~':
        emit(' ')
        break
      default:
        // \- optional hyphen, \_ non-breaking hyphen and the like: drop.
        break
    }
  }

  // Trailing empty paragraph from a final \par isn't real content.
  while (paragraphs.length > 1 && paragraphs[paragraphs.length - 1].length === 0) paragraphs.pop()
  return paragraphs
}

// MARK: - runs -> RTF

function escapeRtf(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch
    else if (ch === '\t') out += '\\tab '
    else if (code < 128) out += ch
    else {
      // UTF-16 code units, each as a signed 16-bit \u with a ? fallback.
      for (const unit of ch.split('').map(c => c.charCodeAt(0))) {
        out += `\\u${unit > 32767 ? unit - 65536 : unit}?`
      }
    }
  }
  return out
}

/** RTF in the shape Cocoa writes, so the iPhone reads it back cleanly. */
export function paragraphsToRtf(paragraphs: Paragraph[]): string {
  let body = ''
  let bold = false
  let italic = false
  let fs = BODY_FS
  paragraphs.forEach((para, index) => {
    for (const run of para) {
      const runBold = run.bold || run.heading
      const runFs = run.heading ? HEADING_FS : BODY_FS
      let controls = ''
      if (runBold !== bold) controls += runBold ? '\\b' : '\\b0'
      if (run.italic !== italic) controls += run.italic ? '\\i' : '\\i0'
      if (runFs !== fs) controls += `\\fs${runFs}`
      if (controls) body += controls + ' '
      bold = runBold
      italic = run.italic
      fs = runFs
      body += escapeRtf(run.text)
    }
    if (index < paragraphs.length - 1) body += '\\\n'
  })
  return (
    '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n' +
    '{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}\n' +
    '{\\colortbl;\\red255\\green255\\blue255;}\n' +
    '\\pard\\pardeftab720\\partightenfactor0\n\n' +
    `\\f0\\fs${BODY_FS} \\cf0 ` +
    body +
    '}'
  )
}

// MARK: - Plain text

export function paragraphsToText(paragraphs: Paragraph[]): string {
  return paragraphs.map(p => p.map(r => r.text).join('')).join('\n')
}

/** The plain words of a classic note, for previews and search. */
export function noteRichText(data: string | undefined): string {
  return paragraphsToText(rtfToParagraphs(rtfFromBase64(data)))
}
