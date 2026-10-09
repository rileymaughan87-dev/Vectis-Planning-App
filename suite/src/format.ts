// Display formatting. Times follow the device's 12/24-hour setting
// rather than hard-coding AM/PM (audit item 9).

import { atMinutes } from './dates'

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

export function formatTime(date: Date): string {
  return timeFmt.format(date)
}

/** "9 PM" on the hour, "9:30 PM" otherwise (or 24-hour equivalents). */
export function formatMinutes(minutes: number): string {
  const d = atMinutes(new Date(2001, 0, 1), minutes)
  return minutes % 60 === 0 ? hourFmt.format(d) : timeFmt.format(d)
}

export function formatTimeRange(startMinutes: number, endMinutes: number): string {
  return `${formatMinutes(startMinutes)} – ${formatMinutes(endMinutes)}`
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDayHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const mins = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** Relative luminance (WCAG 2), 0 for black to 1 for white. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRGB(hex)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** White or ink, whichever reads better on top of a colour. */
export function contrastingText(hex: string): string {
  const ink = '#15171B'
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, ink) ? '#FFFFFF' : ink
}

/** A deeper shade of the same hue, for block edges. */
export function darkened(hex: string, amount = 0.25): string {
  const { r, g, b } = hexToRGB(hex)
  const f = Math.max(0, 1 - amount)
  return rgbToHex(r * f, g * f, b * f)
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRGB(hex)
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

export function normalizeHex(hex: string): string {
  const clean = hex.replace('#', '').trim()
  return `#${clean.padStart(6, '0').slice(0, 6).toUpperCase()}`
}

function hexToRGB(hex: string) {
  const n = parseInt(hex.replace('#', '').trim(), 16) || 0
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}
