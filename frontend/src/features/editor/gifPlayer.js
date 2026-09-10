// Reproducción frame-accurate de GIF animado en el preview (canvas).
//
// El preview compone sobre <canvas> con drawImage. Un GIF cargado en un <img>
// anima por su cuenta, ajeno al reloj del timeline: seek y pausa no controlan el
// fotograma. Para que el GIF se comporte como un elemento visual del editor
// (fotograma = f(tiempo del timeline)) decodificamos el GIF una sola vez con
// WebCodecs (ImageDecoder) a un array de <canvas> por fotograma + sus tiempos, y
// en cada tick de dibujo elegimos el fotograma correcto.
//
// Es best-effort: mientras decodifica (o si ImageDecoder no existe) devolvemos
// null y canvas.js cae al <img> (que al menos muestra algo). La caché es por
// `src`, así que varios clips del mismo GIF comparten los fotogramas.

const cache = new Map()   // src -> { status, frames: [{canvas, end}], duration, width, height }
const MAX_FRAMES = 600    // tope de seguridad para GIFs enormes

const SUPPORTED = typeof window !== 'undefined' && typeof window.ImageDecoder !== 'undefined'

export function gifSupported() {
  return SUPPORTED
}

async function decodeGif(src) {
  const entry = { status: 'loading', frames: [], duration: 0, width: 0, height: 0 }
  cache.set(src, entry)
  try {
    const resp = await fetch(src)
    const data = await resp.arrayBuffer()
    const dec = new window.ImageDecoder({ data, type: 'image/gif' })
    await dec.tracks.ready
    const track = dec.tracks.selectedTrack
    const count = Math.min(MAX_FRAMES, track?.frameCount || 1)
    let t = 0
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { image } = await dec.decode({ frameIndex: i })
      const w = image.displayWidth || image.codedWidth
      const h = image.displayHeight || image.codedHeight
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      cv.getContext('2d').drawImage(image, 0, 0)
      // image.duration está en microsegundos; 0 → 0.1s (como los navegadores).
      const dur = image.duration ? image.duration / 1e6 : 0.1
      t += dur > 0 ? dur : 0.1
      entry.frames.push({ canvas: cv, end: t })
      if (typeof image.close === 'function') image.close()
    }
    entry.duration = t
    entry.width = entry.frames[0]?.canvas.width || 0
    entry.height = entry.frames[0]?.canvas.height || 0
    entry.status = 'ready'
    if (typeof dec.close === 'function') dec.close()
  } catch {
    entry.status = 'error'
  }
}

// Info decodificada del GIF (dispara la decodificación perezosa la primera vez).
// Devuelve null hasta que está lista.
export function gifInfo(src) {
  if (!src) return null
  const e = cache.get(src)
  if (!e) {
    if (SUPPORTED) decodeGif(src)
    return null
  }
  return e.status === 'ready' ? e : null
}

// Devuelve el <canvas> del fotograma correcto para un tiempo local (segundos)
// dentro del GIF, o null si aún no está decodificado. `loop`: repetir con módulo;
// sin loop, se congela en el último fotograma pasado el final.
export function gifFrameAt(src, localTime, loop = true) {
  const e = gifInfo(src)
  if (!e || !e.frames.length || !(e.duration > 0)) return null
  let t = Number(localTime) || 0
  if (loop) t = ((t % e.duration) + e.duration) % e.duration
  else if (t >= e.duration) return e.frames[e.frames.length - 1].canvas
  else if (t < 0) t = 0
  const frames = e.frames
  for (let i = 0; i < frames.length; i++) {
    if (t < frames[i].end) return frames[i].canvas
  }
  return frames[frames.length - 1].canvas
}
