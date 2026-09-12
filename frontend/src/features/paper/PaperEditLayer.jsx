// Herramientas de la imagen seleccionada (pincel · borrado por color · recorte).
//
// En el motor original esto era `edit-mode.js`: un overlay a pantalla completa,
// con su propio lienzo, su propia barra de herramientas y su propio pan/zoom —
// 700 líneas y, en la práctica, un modal dentro de otro modal.
//
// Aquí es una CAPA sobre el stage de Paper Animator: se dibuja encima del lienzo,
// ocupando exactamente el mismo rectángulo, y los ajustes viven en el panel
// derecho. Es el mismo patrón que `EdBgRemove` en el editor: herramienta activa ⇒
// pincel sobre el reproductor. Cada herramienta se abre por sí sola desde el
// panel; no hay un "editar imagen" que haya que abrir primero.
//
// El pincel y el borrado por color SÍ son destructivos (hornean el alfa, porque
// el borde rasgado se calcula de los píxeles). El RECORTE no: escribe
// `object.image.crop` y la vista se deriva de ahí, así que la imagen sigue siendo
// la misma y "Restablecer recorte" la devuelve entera.
//
// La matemática (rect de contenido, recorte de trazos a ese rect, tiradores del
// recorte, Liang-Barsky) viene tal cual del original; lo que cambia es de dónde
// salen los píxeles: ya no hay pan/zoom propio, la capa se ajusta al stage.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { brushErase, colorErase } from './paperErase'
import { contentRect, cropFromPixels, cropToPixels } from './paperImage'
import { TOOL, imageEdited } from './paperModel'

const CROP_MIN_PX = 8
const CROP_HANDLE_PX = 12
const CROP_CURSOR = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize', move: 'move',
}

function normalizeRect(x, y, w, h) {
  let rx = x
  let ry = y
  let rw = w
  let rh = h
  if (rw < 0) { rx += rw; rw = -rw }
  if (rh < 0) { ry += rh; rh = -rh }
  return { x: rx, y: ry, w: rw, h: rh }
}

function clampToContent(rect, cr) {
  const x = Math.max(cr.x, Math.min(cr.x + cr.w, rect.x))
  const y = Math.max(cr.y, Math.min(cr.y + cr.h, rect.y))
  const ex = Math.max(cr.x, Math.min(cr.x + cr.w, rect.x + rect.w))
  const ey = Math.max(cr.y, Math.min(cr.y + cr.h, rect.y + rect.h))
  return { x, y, w: Math.max(0, ex - x), h: Math.max(0, ey - y) }
}

/** Recorta un segmento al rect de contenido (Liang-Barsky). Portado del original. */
function clipSegment(p0, p1, cr) {
  let t0 = 0
  let t1 = 1
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const edges = [
    [-dx, p0.x - cr.x],
    [dx, cr.x + cr.w - p0.x],
    [-dy, p0.y - cr.y],
    [dy, cr.y + cr.h - p0.y],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return null
        if (t > t0) t0 = t
      } else {
        if (t < t0) return null
        if (t < t1) t1 = t
      }
    }
  }
  if (t0 > t1) return null
  return [
    { x: p0.x + dx * t0, y: p0.y + dy * t0 },
    { x: p0.x + dx * t1, y: p0.y + dy * t1 },
  ]
}

export default function PaperEditLayer({ paper }) {
  const {
    st, imgRef, applyErase, applyCrop, resetCrop, resetImage, setTool, closeTool, busy,
  } = paper
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const strokeRef = useRef(null)   // canvas de trabajo mientras se arrastra
  const lastRef = useRef(null)     // punto anterior del trazo
  const cropDragRef = useRef(null)
  const [crop, setCrop] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [tick, setTick] = useState(0) // fuerza repintado tras cada trazo

  const mode = st.edit.tool
  // El pincel trabaja sobre la imagen ENTERA (`imgRef`), no sobre la vista
  // recortada: el recorte es una propiedad, y borrar solo lo visible dejaría el
  // resto sin tocar al restablecerlo.
  const el = imgRef.current
  const savedCrop = st.object.image.crop

  // --- encaje de la capa ----------------------------------------------------
  const fit = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !el) return false
    const w = Math.max(2, Math.floor(wrap.clientWidth))
    const h = Math.max(2, Math.floor(wrap.clientHeight))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const cr = contentRect(el)
    const scale = Math.min(w / cr.w, h / cr.h)
    viewRef.current = {
      scale,
      offsetX: (w - cr.w * scale) / 2,
      offsetY: (h - cr.h * scale) / 2,
    }
    return true
  }, [el])

  useLayoutEffect(() => {
    fit()
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => { fit(); setTick((t) => t + 1) })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fit])

  // Al entrar en recorte se parte del que ya tenga la imagen, para poder
  // afinarlo con los tiradores. Sin recorte previo se arranca en blanco: así
  // arrastrar sobre la imagen dibuja un encuadre nuevo, como siempre.
  useEffect(() => {
    if (mode !== TOOL.crop || !el) { setCrop(null); return }
    setCrop(savedCrop ? cropToPixels(el, savedCrop) : null)
  }, [mode, el, savedCrop])

  // --- pintado de la capa ---------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !el || !fit()) return
    const ctx = canvas.getContext('2d')
    const view = viewRef.current
    const cr = contentRect(el)
    const source = strokeRef.current || el

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // Tablero de ajedrez detrás: sin él no se distingue lo borrado del blanco.
    ctx.fillStyle = '#1b1f2a'
    ctx.fillRect(view.offsetX, view.offsetY, cr.w * view.scale, cr.h * view.scale)
    ctx.drawImage(source, cr.x, cr.y, cr.w, cr.h,
      view.offsetX, view.offsetY, cr.w * view.scale, cr.h * view.scale)
    ctx.restore()

    if (cursor && mode !== TOOL.crop) {
      const r = mode === TOOL.brush ? st.edit.brushSize : 5
      ctx.save()
      ctx.beginPath()
      ctx.arc(cursor.x, cursor.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2
      if (mode === TOOL.brush) ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(cursor.x, cursor.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    if (mode === TOOL.crop && crop) {
      const r = {
        x: view.offsetX + (crop.x - cr.x) * view.scale,
        y: view.offsetY + (crop.y - cr.y) * view.scale,
        w: crop.w * view.scale,
        h: crop.h * view.scale,
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, canvas.width, canvas.height)
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fill('evenodd')
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.lineWidth = 2
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1
      for (let i = 1; i < 3; i += 1) {
        ctx.beginPath()
        ctx.moveTo(r.x + (r.w * i) / 3, r.y)
        ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h)
        ctx.moveTo(r.x, r.y + (r.h * i) / 3)
        ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3)
        ctx.stroke()
      }
      const hs = 7
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      for (const [px, py] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        ctx.beginPath()
        ctx.rect(px - hs / 2, py - hs / 2, hs, hs)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [el, mode, crop, cursor, st.edit.brushSize, st.imageSig, tick, fit])

  // --- coordenadas ----------------------------------------------------------
  const toCanvas = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const toImage = (sx, sy) => {
    const view = viewRef.current
    if (!el || view.scale <= 0) return null
    const cr = contentRect(el)
    return { x: cr.x + (sx - view.offsetX) / view.scale, y: cr.y + (sy - view.offsetY) / view.scale }
  }

  const hitHandle = (sx, sy) => {
    if (!crop || !el) return null
    const view = viewRef.current
    const cr = contentRect(el)
    const r = {
      x: view.offsetX + (crop.x - cr.x) * view.scale,
      y: view.offsetY + (crop.y - cr.y) * view.scale,
      w: crop.w * view.scale,
      h: crop.h * view.scale,
    }
    const pts = {
      nw: [r.x, r.y], ne: [r.x + r.w, r.y], sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h],
      n: [r.x + r.w / 2, r.y], s: [r.x + r.w / 2, r.y + r.h],
      w: [r.x, r.y + r.h / 2], e: [r.x + r.w, r.y + r.h / 2],
    }
    for (const key of ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e']) {
      const [px, py] = pts[key]
      if (Math.abs(sx - px) <= CROP_HANDLE_PX && Math.abs(sy - py) <= CROP_HANDLE_PX) return key
    }
    if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return 'move'
    return null
  }

  // --- pincel / color -------------------------------------------------------
  function paintAt(p) {
    const view = viewRef.current
    const cr = contentRect(el)
    const source = strokeRef.current || el
    const prev = lastRef.current
    // El trazo solo pinta dentro del contenido: si se sale, se recorta el segmento.
    let from = prev
    let to = p
    if (prev) {
      const seg = clipSegment(prev, p, cr)
      if (!seg) { lastRef.current = p; return }
      ;[from, to] = seg
    } else if (p.x < cr.x || p.x > cr.x + cr.w || p.y < cr.y || p.y > cr.y + cr.h) {
      lastRef.current = p
      return
    }
    const radius = st.edit.brushSize / view.scale
    const out = brushErase(source, to.x, to.y, from ? from.x : null, from ? from.y : null, radius)
    if (out) strokeRef.current = out
    lastRef.current = p
    setTick((t) => t + 1)
  }

  function eraseColorAt(p) {
    const cr = contentRect(el)
    if (p.x < cr.x || p.x > cr.x + cr.w || p.y < cr.y || p.y > cr.y + cr.h) return
    const out = colorErase(el, p.x, p.y, st.edit.colorTolerance)
    if (!out) return
    strokeRef.current = out
    Promise.resolve(applyErase(out)).finally(() => {
      if (strokeRef.current === out) strokeRef.current = null
      setTick((t) => t + 1)
    })
  }

  // --- punteros -------------------------------------------------------------
  const onDown = (e) => {
    if (!el || busy) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const s = toCanvas(e)
    const p = toImage(s.x, s.y)
    if (!p) return

    if (mode === TOOL.crop) {
      const handle = hitHandle(s.x, s.y)
      cropDragRef.current = handle
        ? { kind: handle, start: p, orig: crop }
        : { kind: 'new', start: p }
      if (!handle) setCrop({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }
    if (mode === TOOL.color) { eraseColorAt(p); return }
    lastRef.current = null
    paintAt(p)
  }

  const onMove = (e) => {
    if (!el) return
    const s = toCanvas(e)
    setCursor(s)
    const p = toImage(s.x, s.y)
    if (!p) return

    const drag = cropDragRef.current
    if (mode === TOOL.crop && drag) {
      const cr = contentRect(el)
      if (drag.kind === 'new') {
        setCrop(clampToContent(normalizeRect(drag.start.x, drag.start.y, p.x - drag.start.x, p.y - drag.start.y), cr))
      } else if (drag.kind === 'move') {
        const dx = p.x - drag.start.x
        const dy = p.y - drag.start.y
        setCrop(clampToContent({ ...drag.orig, x: drag.orig.x + dx, y: drag.orig.y + dy }, cr))
      } else {
        const o = drag.orig
        let { x, y, w, h } = o
        if (drag.kind.includes('w')) { w += x - p.x; x = p.x }
        if (drag.kind.includes('e')) { w = p.x - x }
        if (drag.kind.includes('n')) { h += y - p.y; y = p.y }
        if (drag.kind.includes('s')) { h = p.y - y }
        setCrop(clampToContent(normalizeRect(x, y, w, h), cr))
      }
      return
    }

    if (mode === TOOL.brush && e.buttons === 1) paintAt(p)
  }

  const onUp = () => {
    const wasCropping = cropDragRef.current
    cropDragRef.current = null
    // Recortar es una propiedad, no una imagen nueva: se escribe al soltar (un
    // paso de undo por arrastre) y el lienzo de debajo ya muestra el resultado.
    if (mode === TOOL.crop && wasCropping) {
      if (crop && crop.w >= CROP_MIN_PX && crop.h >= CROP_MIN_PX) applyCrop(cropFromPixels(el, crop))
      return
    }
    if (mode === TOOL.brush && strokeRef.current) {
      // Un trazo = un paso de undo: se confirma al soltar, no por cada píxel.
      // El canvas de trabajo se suelta cuando applyErase YA ha puesto la imagen
      // nueva; vaciarlo antes haría que un fotograma se pintara con la anterior.
      const stroke = strokeRef.current
      lastRef.current = null
      Promise.resolve(applyErase(stroke)).finally(() => {
        if (strokeRef.current === stroke) strokeRef.current = null
        setTick((t) => t + 1)
      })
    }
  }

  const cropCursor = mode === TOOL.crop && cursor ? CROP_CURSOR[hitHandle(cursor.x, cursor.y)] : null
  const edited = imageEdited(st)

  return (
    <div className="paper-edit-layer">
      <div className="paper-edit-bar">
        <div className="ed-fx-chips">
          {[
            { value: TOOL.crop, label: 'Recortar', icon: 'crop' },
            { value: TOOL.brush, label: 'Pincel', icon: 'brush' },
            { value: TOOL.color, label: 'Por color', icon: 'colorize' },
          ].map((m) => (
            <button
              key={m.value}
              type="button"
              className={`ed-fx-chip ${mode === m.value ? 'on' : ''}`}
              onClick={() => setTool(m.value)}
            >
              <Icon name={m.icon} size={13} /> {m.label}
            </button>
          ))}
        </div>
        <span className="paper-edit-hint">
          {mode === TOOL.brush && 'Arrastra para borrar. Cada trazo es un paso de Ctrl+Z.'}
          {mode === TOOL.color && 'Haz clic en un color para eliminarlo de toda la imagen.'}
          {mode === TOOL.crop && 'Arrastra el encuadre. La imagen no cambia: el recorte es una propiedad.'}
        </span>
        {mode === TOOL.crop && (
          <button type="button" className="ed-btn" onClick={resetCrop} disabled={!savedCrop}
            title="Devolver la imagen entera">
            <Icon name="crop_free" size={14} /> Restablecer recorte
          </button>
        )}
        {mode !== TOOL.crop && (
          <button type="button" className="ed-btn" onClick={resetImage}
            disabled={!edited} title="Volver a la imagen original">
            <Icon name="restart_alt" size={14} /> Restablecer imagen
          </button>
        )}
        <button type="button" className="ed-btn" onClick={closeTool}>
          <Icon name="check" size={14} /> Listo
        </button>
      </div>
      <div ref={wrapRef} className="paper-edit-wrap">
        <canvas
          ref={canvasRef}
          className="paper-edit-canvas"
          style={{ cursor: cropCursor || (mode === TOOL.crop ? 'crosshair' : 'none') }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setCursor(null)}
        />
      </div>
    </div>
  )
}
