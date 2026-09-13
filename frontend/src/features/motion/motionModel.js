// Motion Studio — helpers de composición (espejo del backend app/motion/models.py).
// La composición es la fuente de verdad; IA y editor visual la modifican por igual.

export const ENTRANCE_TYPES = ['none', 'fade', 'slide', 'scale', 'zoom', 'rotate', 'draw']
export const EXIT_TYPES = ['none', 'fade', 'slide', 'scale', 'zoom', 'rotate', 'draw']
export const SLIDE_DIRS = ['left', 'right', 'up', 'down']
export const EFFECT_TYPES = ['none', 'pulse', 'flow', 'glow']
export const EASES = [
  'power1.out', 'power2.out', 'power3.out', 'power4.out',
  'power2.in', 'power3.in', 'back.out', 'back.in',
  'elastic.out', 'bounce.out', 'sine.inOut', 'expo.out', 'none',
]

// Familias tipográficas disponibles (cargadas por CDN en generator._FONTS_LINK).
// value = stack CSS completo (con fallback); label = nombre para el selector.
export const FONTS = [
  { label: 'Inter (moderna)', value: "'Inter', system-ui, sans-serif" },
  { label: 'Poppins (redondeada)', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Oswald (condensada)', value: "'Oswald', sans-serif" },
  { label: 'Bebas Neue (titular)', value: "'Bebas Neue', Impact, sans-serif" },
  { label: 'Playfair (serif)', value: "'Playfair Display', Georgia, serif" },
  { label: 'Caveat (manuscrita)', value: "'Caveat', cursive" },
  { label: 'Kalam (manuscrita)', value: "'Kalam', cursive" },
  { label: 'Pacifico (script)', value: "'Pacifico', cursive" },
  { label: 'JetBrains Mono (código)', value: "'JetBrains Mono', ui-monospace, monospace" },
]

// Efectos de texto seleccionables en Propiedades. Cada uno devuelve un patch de
// `style` (limpia los campos de los otros efectos para poder cambiar entre ellos).
export const TEXT_EFFECTS = ['ninguno', 'degradado', 'contorno', 'resaltado', 'sombra']

const _CLEAR_FX = { gradientFrom: null, gradientTo: null, outlineWidth: null, outlineColor: null, background: null, shadow: null }

export function textEffectPatch(kind, layer) {
  const color = layer?.style?.color || '#4f46e5'
  switch (kind) {
    case 'degradado': return { ...( _CLEAR_FX ), gradientFrom: color, gradientTo: '#06b6d4' }
    case 'contorno': return { ..._CLEAR_FX, outlineWidth: 3, outlineColor: '#0f172a' }
    case 'resaltado': return { ..._CLEAR_FX, background: '#fde047', padding: 14, borderRadius: 10 }
    case 'sombra': return { ..._CLEAR_FX, shadow: '0 6px 20px rgba(15,23,42,.35)' }
    default: return { ..._CLEAR_FX }
  }
}

// Deriva qué efecto está activo a partir del `style` (para el valor del selector).
export function textEffectOf(style = {}) {
  if (style.gradientFrom && style.gradientTo) return 'degradado'
  if (style.outlineWidth) return 'contorno'
  if (style.background) return 'resaltado'
  if (style.shadow) return 'sombra'
  return 'ninguno'
}

let _seq = 0
export function newLayerId(prefix = 'layer') {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}${_seq}`
}

export function newTextLayer(comp, overrides = {}) {
  return {
    id: newLayerId('text'),
    type: 'text',
    content: 'Texto',
    x: Math.round((comp?.width || 1080) / 2),
    y: Math.round((comp?.height || 1920) / 2),
    width: null,
    height: null,
    scale: 1,
    rotation: 0,
    opacity: 1,
    anchor: 'center',
    z_index: (comp?.layers?.length || 0) + 1,
    start: 0,
    end: null,
    visible: true,
    style: { font: "'Inter', system-ui, sans-serif", fontSize: 96, color: '#ffffff', fontWeight: '800', align: 'center', letterSpacing: -1 },
    animation: {
      entrance: { type: 'fade', direction: 'up', duration: 0.6, delay: 0, ease: 'power3.out' },
      exit: { type: 'fade', direction: 'down', duration: 0.4, delay: 0, ease: 'power2.in' },
    },
    ...overrides,
  }
}

export function newCircleLayer(comp, overrides = {}) {
  const cx = Math.round((comp?.width || 1080) / 2)
  const cy = Math.round((comp?.height || 1920) / 2)
  return {
    id: newLayerId('circle'), type: 'shape', content: '',
    x: cx, y: cy, scale: 1, rotation: 0, opacity: 1, anchor: 'center',
    z_index: (comp?.layers?.length || 0) + 1, start: 0, end: null, visible: true,
    style: {},
    shape: { kind: 'circle', radius: 40, fill: '#4f46e5', stroke: 'none', thickness: 3, glow: 0 },
    animation: { entrance: { type: 'scale', from_scale: 0.6, duration: 0.5, ease: 'power2.out' }, exit: { type: 'fade', duration: 0.4 } },
    effect: { type: 'none', duration: 1.4, delay: 0 },
    ...overrides,
  }
}

export function newLineLayer(comp, overrides = {}) {
  const w = comp?.width || 1080
  const cy = Math.round((comp?.height || 1920) / 2)
  return {
    id: newLayerId('line'), type: 'shape', content: '',
    x: Math.round(w * 0.25), y: cy, scale: 1, rotation: 0, opacity: 1, anchor: 'center',
    z_index: (comp?.layers?.length || 0) + 1, start: 0, end: null, visible: true,
    style: {},
    shape: { kind: 'line', x2: Math.round(w * 0.75), y2: cy, thickness: 4, stroke: '#4f46e5', fill: 'none', glow: 0 },
    animation: { entrance: { type: 'draw', duration: 0.6, ease: 'power2.out' }, exit: { type: 'fade', duration: 0.3 } },
    effect: { type: 'none', duration: 1.2, delay: 0 },
    ...overrides,
  }
}

export function defaultComposition(format = {}) {
  const width = Number(format.width) || 1080
  const height = Number(format.height) || 1920
  const fps = Number(format.fps) || 30
  return {
    id: null,
    name: 'Nuevo motion graphic',
    width,
    height,
    fps,
    duration: 4,
    background: 'transparent',
    version: 1,
    layers: [],
    metadata: {},
  }
}

export function updateLayer(comp, layerId, patch) {
  return {
    ...comp,
    layers: (comp.layers || []).map((l) => (l.id === layerId ? deepMerge(l, patch) : l)),
  }
}

export function removeLayer(comp, layerId) {
  return { ...comp, layers: (comp.layers || []).filter((l) => l.id !== layerId) }
}

// Traslada una capa dx/dy px (coordenadas del lienzo). En líneas mueve ambos
// extremos (x/y y x2/y2) para conservar longitud/ángulo. Clampa el centro al lienzo.
export function moveLayer(comp, layerId, dx, dy) {
  const W = comp?.width || 1080
  const H = comp?.height || 1920
  const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(v)))
  return {
    ...comp,
    layers: (comp.layers || []).map((l) => {
      if (l.id !== layerId) return l
      const nx = clamp((l.x || 0) + dx, W)
      const ny = clamp((l.y || 0) + dy, H)
      const next = { ...l, x: nx, y: ny }
      if (l.type === 'shape' && l.shape?.kind === 'line') {
        const ax = (l.x || 0), ay = (l.y || 0)
        next.shape = {
          ...l.shape,
          x2: clamp((l.shape.x2 ?? ax) + (nx - ax), W),
          y2: clamp((l.shape.y2 ?? ay) + (ny - ay), H),
        }
      }
      return next
    }),
  }
}

// Merge superficial con soporte de objetos anidados (style, animation.entrance…).
export function deepMerge(base, patch) {
  const out = { ...base }
  for (const k of Object.keys(patch || {})) {
    const v = patch[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

export function clampComposition(comp) {
  const c = { ...comp }
  c.duration = Math.max(0.1, Math.min(120, Number(c.duration) || 4))
  c.fps = Math.max(1, Math.min(120, Number(c.fps) || 30))
  return c
}
