// Drawing with a finger (or mouse or pen): on a blank page, or on top of
// a photo or scan to mark it up. Strokes stay editable (undo, clear)
// until it's saved, then the picture is kept as one image.

import { Eraser, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Sheet } from '../../ui/components'
import { canvasOf, toBlob, type Picture } from './images'

interface Stroke {
  color: string
  width: number
  alpha: number
  points: { x: number; y: number }[]
}

const PENS = [
  { id: 'ink', label: 'Black pen', color: '#1C1C1E', width: 4, alpha: 1 },
  { id: 'blue', label: 'Blue pen', color: '#0068B5', width: 4, alpha: 1 },
  { id: 'red', label: 'Red pen', color: '#D2574A', width: 4, alpha: 1 },
  { id: 'marker', label: 'Highlighter', color: '#F2C230', width: 22, alpha: 0.35 },
] as const
const SIZES = [{ id: 'fine', label: 'Fine', scale: 0.6 }, { id: 'medium', label: 'Medium', scale: 1 }, { id: 'bold', label: 'Bold', scale: 2 }] as const

/** A blank page's size, in canvas pixels. */
const BLANK = { width: 1600, height: 1200 }

export function DrawingSheet({ background, onDone, onClose }: {
  /** A picture to draw on; a blank page if none. */
  background?: ImageBitmap
  onDone: (p: Picture) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [base] = useState(() => (background ? canvasOf(background) : null))
  const size = base ? { width: base.width, height: base.height } : BLANK
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const [pen, setPen] = useState<(typeof PENS)[number]['id']>(background ? 'red' : 'ink')
  const [sizeID, setSizeID] = useState<(typeof SIZES)[number]['id']>('medium')
  const [busy, setBusy] = useState(false)

  // Pen widths are in screen pixels, so they look the same however big the picture is.
  const screenScale = () => {
    const c = canvasRef.current
    return c ? c.width / c.getBoundingClientRect().width : 1
  }

  const paint = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length === 0) return
    ctx.save()
    ctx.globalAlpha = s.alpha
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(s.points[0].x, s.points[0].y)
    // Smooth curves through the midpoints, so quick strokes don't look jagged.
    for (let i = 1; i < s.points.length - 1; i++) {
      const p = s.points[i]
      const next = s.points[i + 1]
      ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2)
    }
    const last = s.points[s.points.length - 1]
    ctx.lineTo(last.x + 0.01, last.y)
    ctx.stroke()
    ctx.restore()
  }

  const redraw = (all: Stroke[]) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, c.width, c.height)
    if (base) ctx.drawImage(base, 0, 0)
    for (const s of all) paint(ctx, s)
  }

  useEffect(() => {
    redraw(strokes)
  })

  const point = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = PENS.find(x => x.id === pen)!
    const scale = SIZES.find(x => x.id === sizeID)!.scale
    current.current = { color: p.color, alpha: p.alpha, width: p.width * scale * screenScale(), points: [point(e)] }
  }

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = current.current
    if (!s) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events.length ? events : [e.nativeEvent]) s.points.push(point(ev))
    redraw([...strokes, s])
  }

  const up = () => {
    const s = current.current
    current.current = null
    if (s) setStrokes(list => [...list, s])
  }

  const save = async () => {
    setBusy(true)
    try {
      redraw(strokes)
      // A drawing on white keeps sharp lines as PNG; a marked-up photo stays a JPEG.
      onDone(await toBlob(canvasRef.current!, base ? 'image/jpeg' : 'image/png', 0.88))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={background ? 'Mark up' : 'Drawing'} onClose={onClose} right={{ label: busy ? 'Saving…' : 'Done', onClick: save, disabled: busy || strokes.length === 0 }}>
      <div className="draw-tools" role="toolbar" aria-label="Pens">
        {PENS.map(p => (
          <button key={p.id} type="button" className="pen" aria-label={p.label} aria-pressed={pen === p.id} onClick={() => setPen(p.id)}>
            <span style={{ background: p.color, opacity: p.alpha < 1 ? 0.6 : 1 }} />
          </button>
        ))}
        <span className="toolbar-sep" aria-hidden="true" />
        {SIZES.map(s => (
          <button key={s.id} type="button" className="pen-size" aria-label={s.label} aria-pressed={sizeID === s.id} onClick={() => setSizeID(s.id)}>
            <span style={{ width: 4 + s.scale * 5, height: 4 + s.scale * 5 }} />
          </button>
        ))}
        <span className="grow" />
        <button type="button" className="icon-button" aria-label="Undo last stroke" disabled={!strokes.length} onClick={() => setStrokes(s => s.slice(0, -1))}><Undo2 size={18} /></button>
        <button type="button" className="icon-button" aria-label="Clear" disabled={!strokes.length} onClick={() => setStrokes([])}><Eraser size={18} /></button>
      </div>
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        width={size.width}
        height={size.height}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label={background ? 'Drawing on the picture' : 'Drawing page'}
      />
    </Sheet>
  )
}
