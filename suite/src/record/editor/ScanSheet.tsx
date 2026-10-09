// Scanning a page: after the photo is taken, drag the four corners onto
// the page's corners, pick a look, and it's flattened into a clean,
// straight page. (The iPhone app used the system scanner; on the web the
// corners are placed by hand.)

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { defaultQuad, type Quad } from '../scan'
import { Segmented, Sheet, VButton } from '../../ui/components'
import { applyLook, canvasOf, flatten, rotate, toBlob, type Picture, type ScanLook } from './images'

export function ScanSheet({ photo, onDone, onClose }: { photo: ImageBitmap; onDone: (p: Picture) => void; onClose: () => void }) {
  // Working copy at a size that's quick to flatten.
  const [source, setSource] = useState(() => canvasOf(photo, 2400))
  const [quad, setQuad] = useState<Quad>(() => defaultQuad(source.width, source.height))
  const [look, setLook] = useState<ScanLook>('bw')
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => source.toDataURL('image/jpeg', 0.7), [source])
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)

  const toImage = (e: ReactPointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    return {
      x: Math.min(Math.max(((e.clientX - r.left) / r.width) * source.width, 0), source.width),
      y: Math.min(Math.max(((e.clientY - r.top) / r.height) * source.height, 0), source.height),
    }
  }

  const onMove = (e: ReactPointerEvent) => {
    const i = dragging.current
    if (i === null) return
    const p = toImage(e)
    setQuad(q => q.map((c, j) => (j === i ? p : c)) as Quad)
  }

  const turn = () => {
    const turned = rotate(source)
    setSource(turned)
    setQuad(defaultQuad(turned.width, turned.height))
  }

  const finish = async () => {
    setBusy(true)
    // Let the "Working…" label paint before the heavy lifting.
    await new Promise(r => setTimeout(r, 30))
    try {
      onDone(await toBlob(applyLook(flatten(source, quad), look), 'image/jpeg', look === 'bw' ? 0.8 : 0.85))
    } finally {
      setBusy(false)
    }
  }

  const pct = (p: { x: number; y: number }) => ({ left: `${(p.x / source.width) * 100}%`, top: `${(p.y / source.height) * 100}%` })

  return (
    <Sheet title="Scan" onClose={onClose} right={{ label: busy ? 'Working…' : 'Use scan', onClick: finish, disabled: busy }}>
      <p className="help" style={{ margin: 0 }}>Drag the four corners onto the corners of the page.</p>
      <div
        ref={boxRef}
        className="scan-box"
        style={{ aspectRatio: `${source.width} / ${source.height}` }}
        onPointerMove={onMove}
        onPointerUp={() => { dragging.current = null }}
        onPointerCancel={() => { dragging.current = null }}
      >
        <img src={preview} alt="The photo to scan" draggable={false} />
        <svg viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="none" aria-hidden="true">
          <polygon points={quad.map(p => `${p.x},${p.y}`).join(' ')} />
        </svg>
        {quad.map((p, i) => (
          <button
            key={i}
            type="button"
            className="scan-handle"
            style={pct(p)}
            aria-label={['Top left corner', 'Top right corner', 'Bottom right corner', 'Bottom left corner'][i]}
            onPointerDown={e => {
              dragging.current = i
              ;(e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId)
            }}
          />
        ))}
      </div>
      <Segmented<ScanLook>
        label="Look"
        value={look}
        onChange={setLook}
        options={[{ value: 'bw', label: 'Black & white' }, { value: 'grey', label: 'Greyscale' }, { value: 'colour', label: 'Colour' }]}
      />
      <div className="button-row">
        <VButton onClick={turn}>Turn ↻</VButton>
        <VButton onClick={() => setQuad(defaultQuad(source.width, source.height))}>Reset corners</VButton>
      </div>
    </Sheet>
  )
}
