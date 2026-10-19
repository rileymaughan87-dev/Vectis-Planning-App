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

let started = false

const editable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable)

export function trackKeyboard() {
  if (started || typeof window === 'undefined' || !window.visualViewport) return
  started = true
  const vv = window.visualViewport
  const root = document.documentElement
  let last = ''

  const update = () => {
    const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    const value = `${Math.round(vv.offsetTop)}|${Math.round(vv.height)}|${keyboard}`
    if (value === last) return
    last = value
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
    root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`)
    root.style.setProperty('--keyboard', `${keyboard}px`)
    // More than a sliver: the keyboard (not just a browser bar) is up.
    root.classList.toggle('keyboard-open', keyboard > 80)
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
  document.addEventListener('focusout', () => follow(1000))
  // Scrolling while typing can move the view under the keyboard.
  document.addEventListener('scroll', whileTyping(400), { capture: true, passive: true })
  document.addEventListener('touchmove', whileTyping(400), { passive: true })
  update()
}
