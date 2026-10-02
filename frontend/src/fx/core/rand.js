// Azar DETERMINISTA para los efectos: el mismo (semilla, fotograma, canal) da
// siempre el mismo número, en el preview y en el export (que puede pedir los
// fotogramas en cualquier orden). Prohibido Math.random en un efecto.

/** Hash entero de 32 bits (mezcla de Murmur3). */
export function hash32(...parts) {
  let h = 0x811c9dc5
  for (const p of parts) {
    let k = Math.floor(Number(p) * 1000003) | 0
    k = Math.imul(k, 0xcc9e2d51)
    k = (k << 15) | (k >>> 17)
    k = Math.imul(k, 0x1b873593)
    h ^= k
    h = (h << 13) | (h >>> 19)
    h = (Math.imul(h, 5) + 0xe6546b64) | 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Número en [0, 1) a partir de las partes dadas. */
export function rand(...parts) {
  return hash32(...parts) / 4294967296
}

/** Generador con estado para un fotograma: `const r = rng(seed, frame); r(); r()…` */
export function rng(seed, frame = 0) {
  let i = 0
  return () => rand(seed, frame, i++)
}
