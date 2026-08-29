// Modelo puro de composición de capas para el Clip Editor (máx. 2).
// Cada capa es un material (url + tramo + paneo) con un hueco en el 9:16.

export const MIN_SPLIT_GAP = 0.3
export const MAX_LAYERS = 2

export const SLOT_PAIRS = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
  overlay: 'overlay',
  custom: 'custom',
  full: 'bottom',
}

export function makeLayer(partial = {}) {
  return {
    id: partial.id ?? null,
    url: partial.url || '',
    segStart: partial.segStart ?? 0,
    segEnd: partial.segEnd ?? 0,
    trimIn: partial.trimIn ?? 0,
    trimOut: partial.trimOut ?? 0,
    zoom: partial.zoom ?? 1,
    pan_mode: partial.pan_mode ?? 'smooth',
    keyframes: partial.keyframes ?? [],
    slot: partial.slot || 'full',
    customRect: partial.customRect ?? null,
    label: partial.label || 'Capa',
  }
}

/** Rectángulo normalizado (0-1) del hueco en el canvas 9:16. */
export function slotRect(slot, index = 0, customRect = null) {
  if (slot === 'custom' && customRect) {
    return {
      x: customRect.x, y: customRect.y, w: customRect.w, h: customRect.h,
    }
  }
  if (slot === 'top') return { x: 0, y: 0, w: 1, h: 0.5 }
  if (slot === 'bottom') return { x: 0, y: 0.5, w: 1, h: 0.5 }
  if (slot === 'left') return { x: 0, y: 0, w: 0.5, h: 1 }
  if (slot === 'right') return { x: 0.5, y: 0, w: 0.5, h: 1 }
  if (slot === 'overlay') {
    return index === 0
      ? { x: 0, y: 0, w: 1, h: 1 }
      : { x: 0.52, y: 0.58, w: 0.44, h: 0.38 }
  }
  return { x: 0, y: 0, w: 1, h: 1 }
}

export function outputRect(layer, index, layerCount) {
  if (layerCount < 2) return { x: 0, y: 0, w: 1, h: 1 }
  return slotRect(layer.slot, index, layer.customRect)
}

/** Aspecto del recorte fuente para que encaje en el hueco de un 9:16. */
export function slotTargetAspect(rect, outRatio = 9 / 16) {
  const w = Math.max(0.05, rect.w)
  const h = Math.max(0.05, rect.h)
  return (w / h) * outRatio
}

export function complementSlot(slot) {
  return SLOT_PAIRS[slot] || 'bottom'
}

export function applySlotPreset(layers, preset, activeIndex = 0) {
  if (layers.length < 2) {
    return layers.map((l) => ({ ...l, slot: 'full', customRect: null }))
  }
  const next = layers.map((l) => ({ ...l }))
  if (preset === 'vertical') {
    next[0].slot = 'top'
    next[1].slot = 'bottom'
  } else if (preset === 'horizontal') {
    next[0].slot = 'left'
    next[1].slot = 'right'
  } else if (preset === 'overlay') {
    next[0].slot = 'overlay'
    next[1].slot = 'overlay'
  } else if (preset === 'custom') {
    const i = activeIndex
    const other = 1 - i
    next[i].slot = 'custom'
    next[i].customRect = next[i].customRect || slotRect(layers[i].slot, i, layers[i].customRect)
    next[other].slot = layers[other].slot === 'full' ? 'full' : layers[other].slot
  } else {
    const other = 1 - activeIndex
    next[activeIndex].slot = preset
    next[activeIndex].customRect = null
    if (preset !== 'overlay' && preset !== 'custom') {
      next[other].slot = complementSlot(preset)
      next[other].customRect = null
    }
  }
  return next
}

export function invertSlots(layers) {
  if (layers.length !== 2) return layers
  return [
    { ...layers[0], slot: layers[1].slot, customRect: layers[1].customRect },
    { ...layers[1], slot: layers[0].slot, customRect: layers[0].customRect },
  ]
}

export function splitLayer(layer, t, minGap = MIN_SPLIT_GAP) {
  const aIn = layer.trimIn
  const aOut = layer.trimOut
  if (t < aIn + minGap || t > aOut - minGap) return null
  return [
    { ...layer, trimOut: t },
    { ...layer, id: null, trimIn: t, slot: complementSlot(layer.slot === 'full' ? 'top' : layer.slot) },
  ]
}

/** Corta el tramo en el playhead: dos piezas a pantalla completa (en secuencia al generar). */
export function cutLayerAt(layer, t, minGap = MIN_SPLIT_GAP) {
  const aIn = layer.trimIn || 0
  const aOut = layer.trimOut || 0
  if (t < aIn + minGap || t > aOut - minGap) return null
  const kfs = layer.keyframes || []
  return [
    {
      ...layer,
      trimOut: t,
      slot: 'full',
      customRect: null,
      keyframes: kfs.filter((k) => k.t <= t + 0.05),
    },
    {
      ...layer,
      id: null,
      trimIn: t,
      slot: 'full',
      customRect: null,
      keyframes: kfs.filter((k) => k.t >= t - 0.05),
    },
  ]
}

export function isSequentialLayout(layers) {
  return layers.length > 1 && layers.every((l) => (l.slot || 'full') === 'full')
}

export function layerDelay(layers, index) {
  if (!isSequentialLayout(layers)) return 0
  return layers.slice(0, index).reduce((s, l) => s + layerDuration(l), 0)
}

export function layerDuration(layer) {
  return Math.max(0, (layer.trimOut || 0) - (layer.trimIn || 0))
}

export function compositionDuration(layers) {
  if (isSequentialLayout(layers)) {
    return layers.reduce((s, l) => s + layerDuration(l), 0)
  }
  return layers.reduce((m, l) => Math.max(m, layerDuration(l)), 0)
}

export function layersFromInitial(url, segStart, segEnd, initial, label) {
  const base = {
    url,
    segStart,
    segEnd,
    trimIn: initial?.trimIn ?? 0,
    trimOut: initial?.trimOut ?? 0,
    pan_mode: initial?.pan_mode ?? 'smooth',
    label: initial?.label || label || 'Capa 1',
  }
  if (initial?.dual_crop) {
    const vertical = (initial.split_orientation || 'vertical') !== 'horizontal'
    return [
      makeLayer({
        ...base,
        zoom: initial.zoom ?? 1,
        keyframes: initial.keyframes ?? [],
        slot: vertical ? 'top' : 'left',
        label: `${base.label} · A`,
      }),
      makeLayer({
        ...base,
        zoom: initial.zoom2 ?? initial.zoom ?? 1,
        keyframes: initial.keyframes2 ?? initial.keyframes ?? [],
        slot: vertical ? 'bottom' : 'right',
        label: `${base.label} · B`,
      }),
    ]
  }
  return [
    makeLayer({
      ...base,
      zoom: initial?.zoom ?? 1,
      keyframes: initial?.keyframes ?? [],
      slot: 'full',
    }),
  ]
}

export function layerFromProjectClip(clip) {
  const url = clip.source_url || clip.url || ''
  return layersFromInitial(url, clip.start ?? 0, clip.end ?? 0, {
    ...(clip.reframe || {}),
    label: clip.label || clip.filename || `Clip #${clip.index}`,
  }, clip.label || clip.filename)
}

export function addSecondLayer(existing, incoming) {
  const first = { ...existing[0], slot: existing[0].slot === 'full' ? 'top' : existing[0].slot }
  const second = { ...incoming, slot: complementSlot(first.slot) }
  return [first, second]
}

export function prepKey(layer) {
  return `${layer.url}|${Number(layer.segStart).toFixed(2)}|${Number(layer.segEnd).toFixed(2)}`
}
