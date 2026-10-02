// Caché LRU con tope en BYTES (no en número de elementos).
//
// Las cachés del editor guardan canvas, imágenes decodificadas o cadenas cuyo
// tamaño varía de 1 KB a cientos de MB: un tope por número de elementos no dice
// nada de la RAM real. Aquí cada entrada declara su peso estimado y, al pasar el
// tope, se descartan las usadas hace más tiempo. `purge(keep)` borra lo que ya no
// pertenece a ningún clip vivo (se llama al cambiar la timeline).
//
// Todas las cachés se registran por nombre para que el panel `?debug=mem` pueda
// sumarlas (`cacheStats()`).

const registry = new Map()   // nombre -> caché

/** Bytes aproximados de un canvas/imagen/fotograma (RGBA, 4 bytes por píxel). */
export function pixelBytes(el) {
  if (!el) return 0
  const w = el.width || el.naturalWidth || el.videoWidth || el.displayWidth || 0
  const h = el.height || el.naturalHeight || el.videoHeight || el.displayHeight || 0
  return Math.max(0, w * h * 4)
}

/**
 * Crea una caché. `maxBytes`: tope total. `onEvict(key, value)`: se llama al
 * descartar una entrada (para cerrar recursos, quitar nodos del DOM…). `name`:
 * si se da, la caché aparece en `cacheStats()`.
 */
export function createLruBytes({ maxBytes = 64 * 1024 * 1024, onEvict = null, name = '' } = {}) {
  const map = new Map()   // key -> { value, bytes } (orden de inserción = antigüedad de uso)
  let total = 0

  function drop(key, entry, evicted) {
    map.delete(key)
    total -= entry.bytes
    if (evicted && onEvict) {
      try { onEvict(key, entry.value) } catch { /* una limpieza fallida no rompe la caché */ }
    }
  }

  function trim(keepKey) {
    for (const [key, entry] of map) {
      if (total <= maxBytes) break
      if (key === keepKey) continue   // una entrada sola mayor que el tope se conserva
      drop(key, entry, true)
    }
  }

  const cache = {
    get(key) {
      const e = map.get(key)
      if (!e) return undefined
      map.delete(key)
      map.set(key, e)
      return e.value
    },
    peek(key) {
      return map.get(key)?.value
    },
    has(key) {
      return map.has(key)
    },
    set(key, value, bytes = 0) {
      const old = map.get(key)
      if (old) drop(key, old, old.value !== value)
      const b = Math.max(0, Number(bytes) || 0)
      map.set(key, { value, bytes: b })
      total += b
      trim(key)
      return value
    },
    /** Actualiza el peso de una entrada que creció (p. ej. un GIF a medio decodificar). */
    resize(key, bytes) {
      const e = map.get(key)
      if (!e) return
      const b = Math.max(0, Number(bytes) || 0)
      total += b - e.bytes
      e.bytes = b
      trim(key)
    },
    delete(key) {
      const e = map.get(key)
      if (e) drop(key, e, true)
    },
    /** Borra las entradas para las que `keep(key, value)` devuelve false. */
    purge(keep) {
      for (const [key, entry] of [...map]) {
        if (!keep(key, entry.value)) drop(key, entry, true)
      }
    },
    clear() {
      for (const [key, entry] of [...map]) drop(key, entry, true)
    },
    keys() {
      return [...map.keys()]
    },
    get size() { return map.size },
    get bytes() { return total },
    get maxBytes() { return maxBytes },
  }
  if (name) registry.set(name, cache)
  return cache
}

/**
 * Registra una fuente de estadísticas que no es una caché LRU (p. ej. el
 * historial de undo). `fn()` devuelve `{ entries, bytes }`.
 */
export function registerStats(name, fn) {
  registry.set(name, { get size() { return fn().entries }, get bytes() { return fn().bytes }, maxBytes: 0 })
}

/** `[{ name, entries, bytes, maxBytes }]` de todas las cachés registradas. */
export function cacheStats() {
  return [...registry].map(([name, c]) => ({ name, entries: c.size, bytes: c.bytes, maxBytes: c.maxBytes || 0 }))
}
