// Guías de alineación tipo Canva: centro del canvas y otros textos visibles.

export const SNAP_THRESHOLD = 0.018

export function canvasAlignTargets(others = []) {
  const xs = [0.5]
  const ys = [0.5]
  const push = (arr, n) => {
    const v = +Number(n).toFixed(4)
    if (Number.isFinite(v)) arr.push(v)
  }
  for (const o of others) {
    const x = o?.x
    const y = o?.y
    const w = o?.w
    if (Number.isFinite(x)) {
      push(xs, x)
      if (Number.isFinite(w)) {
        push(xs, x - w / 2)
        push(xs, x + w / 2)
      }
    }
    if (Number.isFinite(y)) push(ys, y)
  }
  return { xs, ys }
}

export function snapAlign(x, y, targets, threshold = SNAP_THRESHOLD) {
  const snapAxis = (value, list) => {
    let best = null
    let bestD = threshold
    for (const t of list || []) {
      const d = Math.abs(value - t)
      if (d <= bestD) { bestD = d; best = t }
    }
    return best
  }
  const sx = snapAxis(x, targets?.xs)
  const sy = snapAxis(y, targets?.ys)
  return {
    x: sx == null ? x : sx,
    y: sy == null ? y : sy,
    guides: {
      v: sx == null ? [] : [sx],
      h: sy == null ? [] : [sy],
    },
  }
}

/**
 * Bordes del cuadro de salida, como CapCut: un lado del elemento (semiancho `hw`,
 * semialto `hh`, en fracción del cuadro) que toca un borde del cuadro, por dentro
 * o por fuera, se pega a él. Devuelve el centro pegado, la distancia del imán en
 * cada eje (Infinity si no pega) y qué bordes se iluminan.
 */
export function snapFrameEdges(x, y, hw, hh, threshold = SNAP_THRESHOLD) {
  const axis = (v, h, [lo, hi]) => {
    if (!(h > 0)) return null
    let best = null
    let bestD = threshold
    for (const [c, edge] of [[lo + h, lo], [hi - h, hi], [lo - h, lo], [hi + h, hi]]) {
      const d = Math.abs(v - c)
      if (d <= bestD) { bestD = d; best = { c, edge, d } }
    }
    return best
  }
  const bx = axis(x, hw, [0, 1])
  const by = axis(y, hh, [0, 1])
  return {
    x: bx ? bx.c : x,
    y: by ? by.c : y,
    dx: bx ? bx.d : Infinity,
    dy: by ? by.d : Infinity,
    edges: [
      ...(bx ? [bx.edge === 0 ? 'left' : 'right'] : []),
      ...(by ? [by.edge === 0 ? 'top' : 'bottom'] : []),
    ],
  }
}

/**
 * Imán al mover un elemento: centro del cuadro / otros textos (snapAlign) y bordes
 * del cuadro (snapFrameEdges); en cada eje gana el más cercano. `half` = {w, h}
 * semitamaño del elemento en fracción del cuadro (sin él, solo el centro).
 */
export function snapMove(x, y, targets, half, threshold = SNAP_THRESHOLD) {
  const c = snapAlign(x, y, targets, threshold)
  const e = snapFrameEdges(x, y, half?.w, half?.h, threshold)
  const cdx = c.guides.v.length ? Math.abs(c.x - x) : Infinity
  const cdy = c.guides.h.length ? Math.abs(c.y - y) : Infinity
  const ex = e.dx < cdx
  const ey = e.dy < cdy
  return {
    x: ex ? e.x : c.x,
    y: ey ? e.y : c.y,
    guides: {
      v: ex ? [] : c.guides.v,
      h: ey ? [] : c.guides.h,
      edges: e.edges.filter((s) => (s === 'left' || s === 'right' ? ex : ey)),
    },
  }
}

/** Semitamaño (fracción del cuadro) de la caja de un elemento en el lienzo. */
export function halfOnFrame(box, frame) {
  const w = box?.dw ?? box?.w
  const h = box?.dh ?? box?.h
  if (!(w > 0) || !(h > 0) || !(frame?.w > 0) || !(frame?.h > 0)) return null
  return { w: w / 2 / frame.w, h: h / 2 / frame.h }
}

export function textAlignTargets(clips, tracks, head, exceptId) {
  const others = []
  for (const c of clips || []) {
    if ((c.kind !== 'text' && c.kind !== 'shape') || c.id === exceptId || c.disabled) continue
    const track = (tracks || []).find((t) => t.id === c.track_id)
    if (track?.hidden) continue
    const dur = Math.max(0, (c.out_point ?? 0) - (c.in_point ?? 0))
    if (head < (c.start ?? 0) - 0.02 || head >= (c.start ?? 0) + dur) continue
    if (c.kind === 'shape') {
      const st = c.shape || {}
      others.push({ x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.38 })
      continue
    }
    const st = c.style || {}
    others.push({ x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.8 })
  }
  return canvasAlignTargets(others)
}

// Borde del cuadro al que se ha pegado un elemento: turquesa y con brillo (CapCut).
const EDGE_COLOR = '#19e3d6'
const EDGE_LINES = {
  left: (cw, ch) => [0, 0, 0, ch],
  right: (cw, ch) => [cw, 0, cw, ch],
  top: (cw) => [0, 0, cw, 0],
  bottom: (cw, ch) => [0, ch, cw, ch],
}

function drawFrameEdges(ctx, cw, ch, edges) {
  ctx.save()
  ctx.strokeStyle = EDGE_COLOR
  ctx.lineWidth = 3
  ctx.shadowColor = EDGE_COLOR
  ctx.shadowBlur = 14
  ctx.setLineDash([])
  for (const side of edges) {
    const seg = EDGE_LINES[side]?.(cw, ch)
    if (!seg) continue
    ctx.beginPath()
    ctx.moveTo(seg[0], seg[1])
    ctx.lineTo(seg[2], seg[3])
    ctx.stroke()
  }
  ctx.restore()
}

export function drawAlignGuides(ctx, cw, ch, guides) {
  if (!guides) return
  const vs = guides.v || []
  const hs = guides.h || []
  if (guides.edges?.length) drawFrameEdges(ctx, cw, ch, guides.edges)
  if (!vs.length && !hs.length) return
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 72, 196, 0.82)'
  ctx.lineWidth = 1.25
  ctx.setLineDash([])
  ctx.shadowColor = 'rgba(255, 72, 196, 0.45)'
  ctx.shadowBlur = 6
  for (const x of vs) {
    const px = x * cw
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, ch)
    ctx.stroke()
  }
  for (const y of hs) {
    const py = y * ch
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(cw, py)
    ctx.stroke()
  }
  ctx.restore()
}
