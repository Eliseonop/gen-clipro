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

export function textAlignTargets(clips, tracks, head, exceptId) {
  const others = []
  for (const c of clips || []) {
    if (c.kind !== 'text' || c.id === exceptId) continue
    const track = (tracks || []).find((t) => t.id === c.track_id)
    if (track?.hidden) continue
    const dur = Math.max(0, (c.out_point ?? 0) - (c.in_point ?? 0))
    if (head < (c.start ?? 0) - 0.02 || head >= (c.start ?? 0) + dur) continue
    const st = c.style || {}
    others.push({ x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.8 })
  }
  return canvasAlignTargets(others)
}

export function drawAlignGuides(ctx, cw, ch, guides) {
  if (!guides) return
  const vs = guides.v || []
  const hs = guides.h || []
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
