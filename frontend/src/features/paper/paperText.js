// Texto de Paper Animator hecho con letras recortadas (assets/alfnum).
//
// El texto NO es un sistema de animación aparte: se descompone en ELEMENTOS y
// cada elemento tiene un `object` con la misma forma que `st.object` de la imagen
// (borde rasgado, sombra, color, movimiento, pliegue, animación simple/keyframes).
// El render, el lienzo, el inspector y la timeline trabajan sobre ese `object`
// igual que con la imagen; lo único propio del texto es de dónde sale el bitmap.
//
//   texto → glyphs (qué PNG va en cada carácter) → layout (dónde cae cada uno)
//         → elementos (rangos de caracteres) → object + bitmap → render
//
// Un elemento es un RANGO de caracteres, así que las tres granularidades son lo
// mismo con distinto corte:
//   · letras individuales  un elemento por letra
//   · grupo                un elemento que abarca varias letras seguidas
//   · frase completa       un único elemento con todo el texto
//
// La POSE de un elemento (x, y, escala, giro — en el object y en sus keyframes)
// es RELATIVA a su hueco natural dentro de la frase (ver `slot` y objectFrame):
// x = y = 0 significa "en su sitio". Por eso cambiar de modo o agrupar no tiene
// que recalcular posiciones y conserva la configuración tal cual.
//
// Todo lo de este archivo es puro (sin DOM): el bitmap se compone en paperTextImage.

import { DEFAULT_OBJECT } from './paperModel.js'

export { DEFAULT_TEXT } from './paperModel.js'

export const TEXT_MODES = [
  { value: 'letters', label: 'Letras individuales' },
  { value: 'phrase', label: 'Frase completa' },
]

export const TEXT_ASSIGN = [
  { value: 'style', label: 'Por estilo' },
  { value: 'random', label: 'Aleatorio' },
]

// --- Proporciones del layout (unidades de "frase"; solo cuentan las relaciones)
export const GLYPH_H = 240
const LETTER_GAP = 0.05 * GLYPH_H
const SPACE_W = 0.42 * GLYPH_H
const LINE_GAP = 0.18 * GLYPH_H
const PAD_RATIO = 0.25 // mismo margen que paperImage: el borde rasgado dilata

// --- Utilidades ---------------------------------------------------------------

/** Hash determinista (FNV-1a) → [0, 1). Sustituye a Math.random en la elección. */
export function hash01(...parts) {
  let h = 0x811c9dc5
  const s = parts.join('|')
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 100000) / 100000
}

function pick(list, r) {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))]
}

let elSeq = 0
export function newElementId() {
  elSeq += 1
  return `te${Date.now().toString(36)}${elSeq.toString(36)}`
}

export function isDrawable(g) {
  return !!g?.file
}

// --- Biblioteca -------------------------------------------------------------

/**
 * Índice de la biblioteca (`/api/letters`) por carácter.
 * `{ styles, byChar: Map<char, glyph[]> }`
 */
export function indexLibrary(lib) {
  const byChar = new Map()
  for (const g of lib?.glyphs || []) {
    if (!byChar.has(g.char)) byChar.set(g.char, [])
    byChar.get(g.char).push(g)
  }
  return { styles: lib?.styles || [], byChar }
}

/**
 * Variantes que pueden representar `ch`. Si no hay minúscula se acepta la
 * mayúscula (y al revés): una frase en minúsculas no debe quedarse en blanco
 * porque la biblioteca solo tenga mayúsculas de esa letra.
 */
export function candidatesFor(index, ch) {
  const exact = index.byChar.get(ch)
  if (exact?.length) return exact
  const other = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()
  return other !== ch ? (index.byChar.get(other) || []) : []
}

function glyphOf(ch, g) {
  return { ch, file: g.file, style: g.style, w: g.w || null, h: g.h || null }
}

/**
 * Elige el asset de UN carácter.
 *  · style:  variantes de ese estilo; si el estilo no tiene la letra, cualquier
 *            otro (es mejor una letra de otro estilo que un hueco).
 *  · random: primero un estilo al azar entre los que tienen la letra y luego una
 *            variante — así los estilos se reparten aunque uno tenga más letras.
 * `i` entra en el hash para que dos "L" seguidas no salgan iguales.
 */
export function chooseGlyph(index, ch, i, { assign, style, seed }) {
  const cands = candidatesFor(index, ch)
  if (!cands.length) return { ch, missing: true }
  let pool = cands
  if (assign === 'random') {
    const styles = [...new Set(cands.map((g) => g.style))].sort()
    const s = pick(styles, hash01(seed, i, ch, 'style'))
    pool = cands.filter((g) => g.style === s)
  } else {
    const wanted = style || index.styles[0]
    const inStyle = cands.filter((g) => g.style === wanted)
    if (inStyle.length) pool = inStyle
  }
  return glyphOf(ch, pick(pool, hash01(seed, i, ch, 'variant')))
}

/**
 * Texto → glyphs. `prev` (los glyphs anteriores) permite conservar las letras ya
 * elegidas —incluidas las cambiadas a mano— en las posiciones cuyo carácter no ha
 * cambiado: escribir al final no vuelve a sortear lo que ya estaba.
 */
export function resolveGlyphs(content, index, opts, prev = null) {
  const chars = Array.from(String(content || ''))
  return chars.map((ch, i) => {
    if (ch === '\n') return { ch, br: true }
    if (/\s/.test(ch)) return { ch: ' ', space: true }
    const old = prev?.[i]
    if (old && old.ch === ch && isDrawable(old)) return old
    return chooseGlyph(index, ch, i, opts)
  })
}

/** Siguiente/anterior variante del carácter `i` (en su estilo, o en `style` si se pasa). */
export function cycleGlyph(glyphs, i, index, { dir = 1, style } = {}) {
  const g = glyphs[i]
  if (!g || g.space || g.br) return glyphs
  const cands = candidatesFor(index, g.ch)
  if (!cands.length) return glyphs
  const wanted = style || g.style
  const pool = cands.filter((c) => c.style === wanted)
  const list = pool.length ? pool : cands
  const at = list.findIndex((c) => c.file === g.file)
  const next = style && style !== g.style ? list[0] : list[(at + dir + list.length) % list.length]
  const out = [...glyphs]
  out[i] = glyphOf(g.ch, next)
  return out
}

/** Firma de los glyphs: si cambia, el layout y los bitmaps se rehacen. */
export function glyphsSig(glyphs) {
  return (glyphs || []).map((g) => g.file || (g.br ? '\n' : g.space ? '_' : `?${g.ch}`)).join(',')
}

// --- Layout -----------------------------------------------------------------

/**
 * Coloca los glyphs en líneas centradas. Todas las letras se normalizan a la
 * misma altura (GLYPH_H) conservando su proporción. Espacios y caracteres sin
 * asset ocupan SPACE_W: "HELLO WORLD" nunca se pega en "HELLOWORLD".
 *
 * @returns {{ slots: Array<{x,y,w,h}|null>, width, height }}  (x,y = esquina sup. izq.)
 */
export function layoutGlyphs(glyphs) {
  const lines = [[]]
  ;(glyphs || []).forEach((g, i) => {
    if (g.br) lines.push([])
    else lines[lines.length - 1].push(i)
  })

  const slots = new Array((glyphs || []).length).fill(null)
  const widths = lines.map((line) => {
    let x = 0
    line.forEach((i, k) => {
      const g = glyphs[i]
      const w = isDrawable(g) ? GLYPH_H * ((g.w && g.h) ? g.w / g.h : 0.75) : SPACE_W
      if (isDrawable(g)) slots[i] = { x, y: 0, w, h: GLYPH_H }
      x += w + (k < line.length - 1 ? LETTER_GAP : 0)
    })
    return x
  })
  const width = Math.max(1, ...widths)
  lines.forEach((line, li) => {
    const shift = (width - widths[li]) / 2
    const y = li * (GLYPH_H + LINE_GAP)
    for (const i of line) {
      if (slots[i]) { slots[i].x += shift; slots[i].y = y }
    }
  })
  const height = lines.length * GLYPH_H + (lines.length - 1) * LINE_GAP
  return { slots, width, height }
}

/**
 * Hueco de un elemento dentro de la frase — lo que objectFrame necesita para
 * colocarlo:
 *   · box:        rect del contenido (unidades de frase) — de aquí sale el bitmap
 *   · w, h:       tamaño con el margen del 25 % (lo mismo que ocupa una imagen)
 *   · fitW, fitH: tamaño de la frase entera con margen. TODOS los elementos
 *                 encajan con él, así las letras conservan su tamaño relativo.
 *   · dx, dy:     centro del elemento respecto del centro de la frase
 * null si el rango no tiene ninguna letra dibujable.
 */
export function elementSlot(layout, el) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (let i = el.from; i <= el.to; i += 1) {
    const s = layout.slots[i]
    if (!s) continue
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y)
    x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h)
  }
  if (x0 === Infinity) return null
  const k = 1 + PAD_RATIO * 2
  const w = x1 - x0
  const h = y1 - y0
  return {
    box: { x: x0, y: y0, w, h },
    w: w * k,
    h: h * k,
    fitW: layout.width * k,
    fitH: layout.height * k,
    dx: x0 + w / 2 - layout.width / 2,
    dy: y0 + h / 2 - layout.height / 2,
  }
}

// --- Elementos ----------------------------------------------------------------

function drawableIndexes(glyphs) {
  const out = []
  ;(glyphs || []).forEach((g, i) => { if (isDrawable(g)) out.push(i) })
  return out
}

function freshObject(source) {
  const obj = structuredClone(source || DEFAULT_OBJECT)
  // Los keyframes se clonan con sus ids: son locales a cada object, pero la
  // selección activa no debe viajar a los elementos nuevos.
  obj.animation.activeKeyframeId = null
  return obj
}

/** Un elemento por letra dibujable. */
export function lettersElements(glyphs, sourceObject) {
  return drawableIndexes(glyphs).map((i) => ({
    id: newElementId(), from: i, to: i, object: freshObject(sourceObject),
  }))
}

/** Un solo elemento con todo el texto (vacío si no hay ninguna letra). */
export function phraseElements(glyphs, sourceObject) {
  const idx = drawableIndexes(glyphs)
  if (!idx.length) return []
  return [{ id: newElementId(), from: idx[0], to: idx[idx.length - 1], object: freshObject(sourceObject) }]
}

/** Etiqueta legible del elemento (los caracteres que abarca). */
export function elementLabel(glyphs, el) {
  return (glyphs || []).slice(el.from, el.to + 1).map((g) => (g.br ? ' ' : g.ch)).join('').trim() || '·'
}

export function elementAt(elements, charIndex) {
  return (elements || []).find((e) => charIndex >= e.from && charIndex <= e.to) || null
}

/**
 * Re-encaja los elementos tras cambiar los glyphs (texto editado o re-sorteado),
 * conservando todo lo posible:
 *   · frase: el mismo elemento (mismo id y object) estirado al texto nuevo
 *   · letras: cada elemento existente se recorta al texto nuevo y se queda si
 *     aún abarca alguna letra; las letras nuevas heredan el object del elemento
 *     anterior más cercano (así lo que escribes aparece con el mismo aspecto).
 */
export function syncElements(text, glyphs) {
  const idx = drawableIndexes(glyphs)
  const old = text.elements || []
  if (!idx.length) return []

  if (text.mode === 'phrase') {
    const keep = old[0]
    return [{
      id: keep?.id || newElementId(),
      from: idx[0],
      to: idx[idx.length - 1],
      object: keep?.object || freshObject(),
    }]
  }

  const n = glyphs.length
  const kept = []
  for (const e of old) {
    const from = Math.min(e.from, n - 1)
    const to = Math.min(e.to, n - 1)
    const has = idx.some((i) => i >= from && i <= to)
    if (has && !kept.some((k) => from <= k.to && to >= k.from)) kept.push({ ...e, from, to })
  }
  const out = [...kept]
  for (const i of idx) {
    if (out.some((e) => i >= e.from && i <= e.to)) continue
    const near = [...out].filter((e) => e.to < i).sort((a, b) => b.to - a.to)[0] || out[0]
    out.push({ id: newElementId(), from: i, to: i, object: freshObject(near?.object) })
  }
  return out.sort((a, b) => a.from - b.from)
}

/**
 * Cambia de modo SIN destruir: los elementos del modo que se deja van a `stash` y
 * se recuperan al volver si el texto no cambió entretanto. Si no hay nada que
 * recuperar, los elementos nuevos toman el object del elemento seleccionado.
 */
export function switchMode(text, mode, selectedId) {
  if (text.mode === mode) return text
  const sig = glyphsSig(text.glyphs)
  const source = (text.elements.find((e) => e.id === selectedId) || text.elements[0])?.object
  const stashed = text.stash?.mode === mode && text.stash.sig === sig ? text.stash.elements : null
  const elements = stashed
    || (mode === 'phrase' ? phraseElements(text.glyphs, source) : lettersElements(text.glyphs, source))
  return {
    ...text,
    mode,
    elements,
    stash: { mode: text.mode, sig, elements: text.elements },
  }
}

/**
 * Agrupa las letras de `charIndexes` en un solo elemento que abarca desde la
 * primera hasta la última (lo que haya en medio entra también: un grupo es un
 * trozo continuo de la frase). Hereda el object del primer elemento afectado.
 * Solo en modo letras. Devuelve `{ text, id }` (id del grupo, o null si no cambió).
 */
export function groupElements(text, charIndexes) {
  if (text.mode !== 'letters') return { text, id: null }
  const touched = text.elements.filter((e) => charIndexes.some((i) => i >= e.from && i <= e.to))
  if (touched.length < 2) return { text, id: null }
  const from = Math.min(...touched.map((e) => e.from))
  const to = Math.max(...touched.map((e) => e.to))
  const inside = text.elements.filter((e) => e.from <= to && e.to >= from)
  const group = { id: newElementId(), from, to, object: freshObject(inside[0].object) }
  const elements = [...text.elements.filter((e) => !inside.includes(e)), group].sort((a, b) => a.from - b.from)
  return { text: { ...text, elements }, id: group.id }
}

/** Deshace un grupo en letras sueltas, todas con el object del grupo. */
export function ungroupElement(text, id) {
  const g = text.elements.find((e) => e.id === id)
  if (!g || g.from === g.to || text.mode !== 'letters') return text
  const letters = drawableIndexes(text.glyphs)
    .filter((i) => i >= g.from && i <= g.to)
    .map((i) => ({ id: newElementId(), from: i, to: i, object: freshObject(g.object) }))
  const elements = [...text.elements.filter((e) => e !== g), ...letters].sort((a, b) => a.from - b.from)
  return { ...text, elements }
}

/**
 * Quita del texto los caracteres de un elemento (lo que hace borrar su clip en
 * la timeline). Los elementos posteriores se desplazan; nada se re-sortea.
 */
export function removeElementChars(text, id) {
  const el = text.elements.find((e) => e.id === id)
  if (!el) return text
  const len = el.to - el.from + 1
  const chars = Array.from(text.content)
  chars.splice(el.from, len)
  const glyphs = [...text.glyphs]
  glyphs.splice(el.from, len)
  const elements = text.elements
    .filter((e) => e !== el)
    .map((e) => (e.from > el.to ? { ...e, from: e.from - len, to: e.to - len } : e))
  return { ...text, content: chars.join(''), glyphs, elements, stash: null }
}

/**
 * Copia el object de `sourceId` a todos los elementos. Con `stagger` (s) los
 * keyframes de cada elemento se retrasan `k * stagger`: la clásica animación
 * letra a letra sale sola de una sola configuración.
 */
export function applyObjectToAll(text, sourceId, stagger = 0) {
  const src = text.elements.find((e) => e.id === sourceId)
  if (!src) return text
  const elements = text.elements.map((e, k) => {
    if (e.id === sourceId && !stagger) return e
    const object = freshObject(src.object)
    if (stagger) {
      object.animation.keyframes = object.animation.keyframes.map((kf) => ({
        ...kf, time: +(kf.time + k * stagger).toFixed(3),
      }))
    }
    return { ...e, object }
  })
  return { ...text, elements }
}

/** Último instante con keyframes entre todos los elementos (para estirar la duración). */
export function lastKeyframeTime(text) {
  let t = 0
  for (const e of text.elements || []) {
    for (const kf of e.object.animation.keyframes || []) t = Math.max(t, kf.time)
  }
  return t
}
