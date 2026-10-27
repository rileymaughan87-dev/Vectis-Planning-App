// Where the on-screen keyboard is, for every app (Oct 2026).
//
// On an iPhone the keyboard covers the page rather than shrinking it, and
// the browser only says where it is through `visualViewport` — whose
// updates come late (after the keyboard has slid up, or after a scroll
// stops). Anything placed from those updates alone lags behind: the format
// bar sat behind the keyboard, and full-screen editors ran on underneath it
// where you couldn't scroll to.
//
// So this keeps three CSS variables on <html> up to date: every frame for a
// moment whenever something could move the keyboard or the view (focus
// coming or going, scrolling, a viewport change), and on every viewport
// change:
//   --vv-top     where the visible area starts (iOS scrolls it when typing)
//   --vv-height  how tall the visible area is, above the keyboard
//   --keyboard   how much of the window the keyboard covers
// and the class `keyboard-open` while it's up. CSS places the docked format
// bar and sizes full-screen editors from them (styles.css, record.css).
//
// Phone audit (Oct 2026) added three more:
// - iPhone zooms in on any box with text under 16px when you tap it, and
//   often stays zoomed (or shifted) after — so on iOS the viewport asks for
//   no automatic zoom. (iOS still lets you pinch-zoom; it ignores that part.)
// - The apps scroll inside their own boxes, never the page, but iOS slides
//   the whole page up to show a box above the keyboard and doesn't always
//   slide it back. When the keyboard goes, the page goes back.
// - When the keyboard comes up, the box you're typing in is brought into
//   view in whatever it scrolls in (a sheet shrinks to fit above it).

let started = false

const editable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable)

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** No automatic zoom when a box is tapped (iOS only: elsewhere this would also stop pinch-zoom). */
function noFocusZoom() {
  if (!isIOS()) return
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (meta && !/maximum-scale/.test(meta.content)) meta.content += ', maximum-scale=1'
}

/** The page itself never scrolls in the apps (each scrolls in its own box), so any leftover shift is iOS's. */
function settlePage() {
  const page = document.scrollingElement
  if (!page || (page.scrollTop === 0 && page.scrollLeft === 0)) return
  if (page.scrollHeight <= window.innerHeight + 1) window.scrollTo(0, 0)
}

/** Brings the box being typed in into view inside whatever it scrolls in. */
function revealFocused() {
  const el = document.activeElement
  if (!editable(el) || (el as HTMLElement).isContentEditable) return
  el!.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function trackKeyboard() {
  if (started || typeof window === 'undefined' || !window.visualViewport) return
  started = true
  const vv = window.visualViewport
  const root = document.documentElement
  let last = ''
  let open = false
  noFocusZoom()

  const update = () => {
    const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    const value = `${Math.round(vv.offsetTop)}|${Math.round(vv.height)}|${keyboard}`
    if (value === last) return
    last = value
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
    root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`)
    root.style.setProperty('--keyboard', `${keyboard}px`)
    // More than a sliver: the keyboard (not just a browser bar) is up.
    const now = keyboard > 80
    root.classList.toggle('keyboard-open', now)
    if (now !== open) {
      open = now
      // Once things have moved: the box into view, or the page back where it was.
      setTimeout(now ? revealFocused : settlePage, 60)
    }
  }

  // Every frame for a short while (the keyboard slides; iOS scrolls the view to the caret), then stop.
  let following = 0
  let until = 0
  const follow = (ms: number) => {
    until = Math.max(until, performance.now() + ms)
    if (following) return
    const tick = () => {
      update()
      following = performance.now() < until ? requestAnimationFrame(tick) : 0
    }
    following = requestAnimationFrame(tick)
  }
  const whileTyping = (ms: number) => () => editable(document.activeElement) && follow(ms)

  vv.addEventListener('resize', () => { update(); follow(300) })
  vv.addEventListener('scroll', () => { update(); follow(300) })
  window.addEventListener('resize', update)
  document.addEventListener('focusin', () => follow(1000))
  // The keyboard takes a moment to go down after focus leaves.
  document.addEventListener('focusout', () => {
    follow(1000)
    // Moving between boxes keeps the keyboard; leaving them all lets the page settle.
    setTimeout(() => !editable(document.activeElement) && settlePage(), 400)
  })
  // Scrolling while typing can move the view under the keyboard.
  document.addEventListener('scroll', whileTyping(400), { capture: true, passive: true })
  document.addEventListener('touchmove', whileTyping(400), { passive: true })
  update()
}
