// Herramientas de la imagen seleccionada (recorte · pincel · borrado por color).
//
// En el motor original esto era `edit-mode.js`: un overlay a pantalla completa,
// con su propio lienzo, su propia barra de herramientas y su propio pan/zoom —
// 700 líneas y, en la práctica, un modal dentro de otro modal.
//
// Aquí se comporta como "Recortar" en el editor: con una herramienta activa el
// stage de Paper se parte en dos (PaperCanvas añade `.split`) — esta vista a la
// izquierda, con la imagen ENTERA y el recuadro naranja o el pincel, y el
// resultado en vivo a la derecha. No hay barra sobre el lienzo: elegir la
// herramienta, sus ajustes y los "Restablecer" están en el panel derecho
// (Herramientas de imagen), y se termina con Esc o volviendo a pulsarla.
//
// El pincel y el borrado por color SÍ son destructivos (hornean el alfa, porque
// el borde rasgado se calcula de los píxeles). El RECORTE no: escribe
// `object.image.crop` y la vista se deriva de ahí, así que la imagen sigue siendo
// la misma y "Restablecer recorte" la devuelve entera.
//
// La matemática (rect de contenido, recorte de trazos a ese rect, tiradores del
// recorte, Liang-Barsky) viene tal cual del original; lo que cambia es de dónde
// salen los píxeles: ya no hay pan/zoom propio, la imagen se encaja en su mitad.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { brushErase, colorErase } from './paperErase'
import { contentRect, cropFromPixels, cropToPixels } from './paperImage'
import { CROP_MIN_SIDE, TOOL } from './paperModel'

const CROP_MIN_PX = 8
const CROP_HANDLE_PX = 12
const CROP_CURSOR = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize', move: 'move',
}
// Mismo naranja, penumbra y tiradores que el recuadro de "Recortar" del editor
// (render/canvas.js · drawMainView): una sola forma de recortar en toda la app.
const CROP_COLOR = '#ff8c1a'
const CROP_DIM = 'rgba(3,5,12,0.58)'
const CROP_CORNER = 5
// Aire alrededor de la imagen para que los tiradores de las esquinas no se corten.
const VIEW_PAD = 14

const HINTS = {
  [TOOL.crop]: 'Arrastra las esquinas o dibuja un recuadro · Esc para terminar',
  [TOOL.brush]: 'Arrastra para borrar · Esc para terminar',
  [TOOL.color]: 'Clic en un color para quitarlo · Esc para terminar',
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

/** ¿El recuadro toca los cuatro bordes? Entonces moverlo no haría nada. */
function coversContent(rect, cr) {
  return rect.x <= cr.x + 1 && rect.y <= cr.y + 1
    && rect.x + rect.w >= cr.x + cr.w - 1 && rect.y + rect.h >= cr.y + cr.h - 1
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

/** Tablero de ajedrez del stage (`.paper-stage-wrap`): sin él no se distingue lo borrado. */
function checkerPattern(ctx) {
  const tile = document.createElement('canvas')
  tile.width = 18
  tile.height = 18
  const t = tile.getContext('2d')
  t.fillStyle = '#151a28'
  t.fillRect(0, 0, 18, 18)
  t.fillStyle = '#1b2032'
  t.fillRect(9, 0, 9, 9)
  t.fillRect(0, 9, 9, 9)
  return ctx.createPattern(tile, 'repeat')
}

/** Esc no debe robarle la tecla a un campo de texto. */
function editingText(el) {
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)
}

export default function PaperEditLayer({ paper }) {
  const { st, imgRef, applyErase, applyCrop, closeTool, busy } = paper
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, w: 0, h: 0, dpr: 1 })
  const patternRef = useRef(null)
  const strokeRef = useRef(null)   // canvas de trabajo mientras se arrastra
  const lastRef = useRef(null)     // punto anterior del trazo
  const cropDragRef = useRef(null)
  const [crop, setCrop] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [tick, setTick] = useState(0) // fuerza repintado tras cada trazo

  const mode = st.edit.tool
  // El pincel trabaja sobre la imagen ENTERA (`imgRef`), no sobre la vista
  // recortada: el recorte es una propiedad, y borrar solo lo visible dejaría el
  // resto sin tocar al restablecerlo.
  const el = imgRef.current
  const savedCrop = st.object.image.crop

  // --- encaje de la vista ---------------------------------------------------
  // Todo se calcula en px CSS; el bitmap va a `devicePixelRatio` para que la
  // imagen no salga borrosa en pantallas HiDPI.
  const fit = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !el) return false
    const w = Math.max(2, Math.floor(wrap.clientWidth))
    const h = Math.max(2, Math.floor(wrap.clientHeight))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    const cr = contentRect(el)
    const scale = Math.max(0.01, Math.min((w - VIEW_PAD * 2) / cr.w, (h - VIEW_PAD * 2) / cr.h))
    viewRef.current = {
      scale,
      offsetX: (w - cr.w * scale) / 2,
      offsetY: (h - cr.h * scale) / 2,
      w,
      h,
      dpr,
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

  // Sin recorte previo el recuadro abarca la imagen entera: se ven los tiradores
  // desde el primer momento, como en el editor.
  useEffect(() => {
    if (mode !== TOOL.crop || !el) { setCrop(null); return }
    setCrop(cropToPixels(el, savedCrop))
  }, [mode, el, savedCrop])

  // Esc termina la herramienta, igual que volver a pulsarla en el panel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || editingText(e.target)) return
      e.preventDefault()
      closeTool()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeTool])

  // --- pintado --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !el || !fit()) return
    const ctx = canvas.getContext('2d')
    const view = viewRef.current
    const cr = contentRect(el)
    const source = strokeRef.current || el
    const img = { x: view.offsetX, y: view.offsetY, w: cr.w * view.scale, h: cr.h * view.scale }

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
    ctx.clearRect(0, 0, view.w, view.h)
    if (!patternRef.current) patternRef.current = checkerPattern(ctx)
    ctx.fillStyle = patternRef.current
    ctx.fillRect(img.x, img.y, img.w, img.h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, cr.x, cr.y, cr.w, cr.h, img.x, img.y, img.w, img.h)

    if (mode === TOOL.crop && crop) {
      const r = {
        x: view.offsetX + (crop.x - cr.x) * view.scale,
        y: view.offsetY + (crop.y - cr.y) * view.scale,
        w: crop.w * view.scale,
        h: crop.h * view.scale,
      }
      // Penumbra solo sobre la imagen, fuera del recuadro.
      ctx.fillStyle = CROP_DIM
      ctx.fillRect(img.x, img.y, img.w, Math.max(0, r.y - img.y))
      ctx.fillRect(img.x, r.y + r.h, img.w, Math.max(0, img.y + img.h - (r.y + r.h)))
      ctx.fillRect(img.x, r.y, Math.max(0, r.x - img.x), r.h)
      ctx.fillRect(r.x + r.w, r.y, Math.max(0, img.x + img.w - (r.x + r.w)), r.h)
      // Tercios mientras se arrastra, para encuadrar.
      if (dragging) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 1; i < 3; i += 1) {
          ctx.moveTo(r.x + (r.w * i) / 3, r.y)
          ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h)
          ctx.moveTo(r.x, r.y + (r.h * i) / 3)
          ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3)
        }
        ctx.stroke()
      }
      ctx.strokeStyle = CROP_COLOR
      ctx.lineWidth = 2
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.fillStyle = CROP_COLOR
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      const hs = CROP_CORNER
      for (const [px, py] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        ctx.fillRect(px - hs, py - hs, hs * 2, hs * 2)
        ctx.strokeRect(px - hs, py - hs, hs * 2, hs * 2)
      }
    } else if (cursor && mode !== TOOL.crop) {
      const r = mode === TOOL.brush ? st.edit.brushSize : 5
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
    }
  }, [el, mode, crop, dragging, cursor, st.edit.brushSize, st.imageSig, tick, fit])

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
    // Dentro de un recuadro que abarca toda la imagen no hay nada que mover:
    // arrastrar ahí dibuja uno nuevo.
    const inside = sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h
    if (inside && !coversContent(crop, cr)) return 'move'
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
      setDragging(true)
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
        // Se desplaza entero: al llegar a un borde se para, no se encoge.
        const o = drag.orig
        const x = Math.max(cr.x, Math.min(cr.x + cr.w - o.w, o.x + p.x - drag.start.x))
        const y = Math.max(cr.y, Math.min(cr.y + cr.h - o.h, o.y + p.y - drag.start.y))
        setCrop({ ...o, x, y })
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
    // paso de undo por arrastre) y el resultado de la derecha ya lo muestra.
    if (mode === TOOL.crop && wasCropping) {
      setDragging(false)
      const cr = contentRect(el)
      const big = crop
        && crop.w >= Math.max(CROP_MIN_PX, cr.w * CROP_MIN_SIDE)
        && crop.h >= Math.max(CROP_MIN_PX, cr.h * CROP_MIN_SIDE)
      // Un clic sin arrastrar (o un recuadro minúsculo) no borra el recorte que
      // ya había: se vuelve a mostrar el guardado.
      if (big) applyCrop(cropFromPixels(el, crop))
      else setCrop(cropToPixels(el, savedCrop))
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

  return (
    <div ref={wrapRef} className="paper-edit-layer">
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
      {HINTS[mode] && <div className="ed-stage-hint">{HINTS[mode]}</div>}
    </div>
  )
}
