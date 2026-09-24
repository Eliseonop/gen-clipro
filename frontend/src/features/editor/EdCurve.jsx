// Curva de velocidad de un keyframe: cómo llega la animación a ese punto desde
// el keyframe anterior (la "animación de velocidad variable" de CapCut).
// Presets con miniatura + editor bézier con dos tiradores arrastrables.
// La curva se evalúa con easeT, el mismo cálculo que el preview y el export
// (espejo de backend/app/clip_keyframes.py).
import { useRef } from 'react'
import Hint from '../../components/Hint'
import {
  easeT, interpBezier, KF_INTERPS, normalizeInterp, normalizeItems, targetInterpItem,
} from '../../lib/clipKeyframes'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Rango vertical visible: deja sitio a curvas que se pasan (rebote) o retroceden.
const Y_MIN = -0.45
const Y_MAX = 1.45

function curvePoints(kind, bezier, steps = 48) {
  if (kind === 'hold') return [[0, 0], [0.999, 0], [1, 1]]
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const x = i / steps
    pts.push([x, easeT(x, kind, bezier)])
  }
  return pts
}

function pathOf(pts, map) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${map(p).map((v) => v.toFixed(2)).join(' ')}`).join(' ')
}

export function CurveThumb({ kind, bezier }) {
  const W = 30
  const H = 22
  const map = ([x, y]) => [2 + x * (W - 4), H - 3 - ((y + 0.2) / 1.4) * (H - 6)]
  return (
    <svg className="ed-curve-thumb" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={pathOf(curvePoints(kind, bezier, 24), map)} />
    </svg>
  )
}

export function CurveEditor({ item, onChange }) {
  const svgRef = useRef(null)
  const dragRef = useRef(0)
  const kind = normalizeInterp(item?.interpolation)
  const bez = interpBezier(item)
  const W = 220
  const H = 170
  const PAD = 14
  const toPx = ([x, y]) => [PAD + x * (W - PAD * 2), H - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * H]
  const fromPx = (px, py) => [
    clamp((px - PAD) / (W - PAD * 2), 0, 1),
    clamp(Y_MIN + (1 - py / H) * (Y_MAX - Y_MIN), -1, 2),
  ]
  const [ox, oy] = toPx([0, 0])
  const [ex, ey] = toPx([1, 1])
  const p1 = toPx([bez[0], bez[1]])
  const p2 = toPx([bez[2], bez[3]])

  function down(e, which) {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = which
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    const which = dragRef.current
    const svg = svgRef.current
    if (!which || !svg) return
    const r = svg.getBoundingClientRect()
    const [x, y] = fromPx(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H)
    const next = [...bez]
    if (which === 1) { next[0] = x; next[1] = y } else { next[2] = x; next[3] = y }
    onChange?.('bezier', next.map((v) => +v.toFixed(3)))
  }
  function up() { dragRef.current = 0 }

  return (
    <svg
      ref={svgRef}
      className={`ed-curve-editor${kind === 'bezier' ? ' custom' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="img"
      aria-label="Curva de velocidad del keyframe"
    >
      <rect className="ed-curve-box" x={ox} y={ey} width={ex - ox} height={oy - ey} />
      <line className="ed-curve-diag" x1={ox} y1={oy} x2={ex} y2={ey} />
      <path className="ed-curve-path" d={pathOf(curvePoints(kind, item?.bezier), toPx)} />
      <line className="ed-curve-arm" x1={ox} y1={oy} x2={p1[0]} y2={p1[1]} />
      <line className="ed-curve-arm" x1={ex} y1={ey} x2={p2[0]} y2={p2[1]} />
      <circle className="ed-curve-end" cx={ox} cy={oy} r={3} />
      <circle className="ed-curve-end" cx={ex} cy={ey} r={3} />
      <circle className="ed-curve-handle" cx={p1[0]} cy={p1[1]} r={6.5}
        onPointerDown={(e) => down(e, 1)}><title>Tirador de salida</title></circle>
      <circle className="ed-curve-handle" cx={p2[0]} cy={p2[1]} r={6.5}
        onPointerDown={(e) => down(e, 2)}><title>Tirador de llegada</title></circle>
    </svg>
  )
}

/** Panel "Curva de velocidad" del keyframe seleccionado (o el siguiente al cabezal). */
export function KfCurvePanel({ clip, selKfId, playhead, onInterp, fps }) {
  const localT = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const target = targetInterpItem(clip, selKfId, localT, fps)
  if (!target) return null
  const kind = normalizeInterp(target.interpolation)
  const first = normalizeItems(clip?.keyframes?.items)[0]?.id === target.id
  const bez = interpBezier(target)
  return (
    <div className="ed-curve">
      <span className="ed-prop">
        Curva de velocidad
        <Hint>Cómo llega la animación a este keyframe desde el anterior. Arrastra los tiradores para personalizarla.</Hint>
      </span>
      <div className="ed-curve-presets">
        {KF_INTERPS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`ed-curve-chip${kind === o.id ? ' on' : ''}`}
            title={o.label}
            onClick={() => (o.id === 'bezier' ? onInterp?.(target, 'bezier', bez) : onInterp?.(target, o.id))}
          >
            <CurveThumb kind={o.id} bezier={o.id === 'bezier' ? bez : null} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <CurveEditor item={target} onChange={(mode, next) => onInterp?.(target, mode, next)} />
      {kind === 'bezier' && (
        <code className="ed-curve-values">cubic-bezier({bez.map((v) => v.toFixed(2)).join(', ')})</code>
      )}
      {first && (
        <p className="ed-key-hint warn">Primer keyframe: su curva no se usa. Selecciona el siguiente.</p>
      )}
    </div>
  )
}
