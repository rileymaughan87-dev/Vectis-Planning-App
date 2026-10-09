// The suite's app icons, drawn the same way as each app's Home Screen icon
// (docs/design-system.md): suite blue square, thin black ring, and one
// thick round-capped stroke breaking out of the ring at the top right.
// Used for the tiles on the Vectis home page.

export type AppIconName = 'vectis' | 'planner' | 'finance' | 'record'

/** Each icon's stroke(s), in a 1024 × 1024 box. */
export const ICON_STROKES: Record<AppIconName, { path: string; fill?: string }[]> = {
  // A lever on its fulcrum (vectis is Latin for lever).
  vectis: [
    { path: 'M262 664 L832 284' },
    { path: 'M440 560 L372 690 L508 690 Z', fill: '#000' },
  ],
  // The lever tick.
  planner: [{ path: 'M306 340 Q 380 570 510 762 Q 640 520 786 272' }],
  // A rising line.
  finance: [{ path: 'M284 655 L444 495 L565 600 L792 266' }],
  // A line of handwriting running off the page.
  record: [{ path: 'M268 640 C 360 420, 430 760, 530 570 S 690 320, 806 268' }],
}

export function AppIcon({ name, size = 56, label }: { name: AppIconName; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect width="1024" height="1024" rx="224" fill="#0068B5" />
      <circle cx="512" cy="512" r="378" fill="none" stroke="#000" strokeWidth="34" />
      {ICON_STROKES[name].map((s, i) => (
        <path key={i} d={s.path} fill={s.fill ?? 'none'} stroke="#000" strokeWidth={s.fill ? 0 : 88} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

/** The icon as a standalone SVG file (favicon, and drawn to PNG for the Home Screen). */
export function iconSVG(name: AppIconName, rounded = false): string {
  const strokes = ICON_STROKES[name]
    .map(s => `<path d="${s.path}" fill="${s.fill ?? 'none'}" stroke="#000" stroke-width="${s.fill ? 0 : 88}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('')
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024"${rounded ? ' rx="224"' : ''} fill="#0068B5"/><circle cx="512" cy="512" r="378" fill="none" stroke="#000" stroke-width="34"/>${strokes}</svg>`
}
