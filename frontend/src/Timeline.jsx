import { useRef, useState, useEffect } from 'react'
import { fmt } from './utils'

// Línea de tiempo con selección de rango (in/out) arrastrable.
// Los tramos del heatmap se dibujan como bloques; al hacer clic cargan su rango.
export default function Timeline({ duration, segments = [], inT, outT, setInT, setOutT }) {
  const barRef = useRef(null)
  const [drag, setDrag] = useState(null)   // 'in' | 'out' | null

  function timeFromClientX(clientX) {
    const rect = barRef.current.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    return (x / rect.width) * duration
  }

  useEffect(() => {
    if (!drag) return
    function move(e) {
      const t = timeFromClientX(e.clientX)
      if (drag === 'in') setInT(Math.max(0, Math.min(t, outT - 0.5)))
      else setOutT(Math.min(duration, Math.max(t, inT + 0.5)))
    }
    function up() { setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, inT, outT, duration])

  const pct = (t) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`

  return (
    <div className="tl">
      <div className="tl-bar" ref={barRef}>
        {segments.map((s, i) => (
          <div
            key={i}
            className="tl-seg"
            title={`Tramo #${s.index} — clic para seleccionar`}
            style={{ left: pct(s.start), width: pct(s.end - s.start) }}
            onClick={() => { setInT(s.start); setOutT(s.end) }}
          />
        ))}
        <div className="tl-sel" style={{ left: pct(inT), width: pct(outT - inT) }} />
        <div className="tl-handle" style={{ left: pct(inT) }} onPointerDown={(e) => { e.preventDefault(); setDrag('in') }} />
        <div className="tl-handle" style={{ left: pct(outT) }} onPointerDown={(e) => { e.preventDefault(); setDrag('out') }} />
      </div>
      <div className="tl-times">
        <span className="tl-t">{fmt(inT)}</span>
        <span className="muted">selección {fmt(Math.max(0, outT - inT))}</span>
        <span className="tl-t">{fmt(outT)}</span>
      </div>
    </div>
  )
}
