// Export de Paper Animator. Sigue siendo cliente (mediabunny sobre un canvas
// offscreen): el resto del editor exporta en el backend con FFmpeg, pero aquí el
// render ES canvas 2D, así que portarlo a FFmpeg significaría reescribir el motor.
// El resultado se sube al material como un vídeo más y desde ahí entra en la
// timeline y en el export final del proyecto por el camino normal.
//
// Cambios respecto a paper-animator/modules/export-module.js:
//   · era una función de 25 argumentos POSICIONALES acoplada a los popups del DOM;
//     ahora recibe un objeto y devuelve un Blob — el progreso lo pinta quien llama
//   · renderiza en su propio canvas a la resolución de salida del proyecto, sin
//     tocar el del preview (antes lo redimensionaba y lo restauraba al acabar)
//   · el tiempo es determinista: el jitter y el pliegue son funciones de `t`
//     (ver paperRender), así que no hace falta ir mutando el estado por fotograma

import {
  BufferTarget, CanvasSource, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat,
  Output, Quality, WebMOutputFormat,
} from 'mediabunny'

const FORMATS = {
  webm: { Format: WebMOutputFormat, codec: 'vp9', ext: '.webm', mime: 'video/webm' },
  mp4: { Format: Mp4OutputFormat, codec: 'avc', ext: '.mp4', mime: 'video/mp4' },
  mov: { Format: MovOutputFormat, codec: 'avc', ext: '.mov', mime: 'video/quicktime' },
  mkv: { Format: MkvOutputFormat, codec: 'avc', ext: '.mkv', mime: 'video/x-matroska' },
}

function outputCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, Math.round(width))
  canvas.height = Math.max(2, Math.round(height))
  return canvas
}

/**
 * Codifica la animación completa a vídeo.
 *
 * Transparencia: solo WebM/VP9. Hay que pedirla en DOS sitios y los dos importan
 * — no pintar el fondo (`transparent` en el render) y `alpha: 'keep'` en el
 * encoder, cuyo valor por defecto en mediabunny es `'discard'`. Si falta lo
 * segundo el vídeo sale opaco en negro sin ningún aviso.
 *
 * @returns {Promise<{blob: Blob, ext: string, mime: string}>}
 */
export async function exportPaperVideo({
  st, renderer, items, bgEl, assets, width, height, onProgress, shouldCancel,
}) {
  const fmt = FORMATS[st.export.format] || FORMATS.webm
  const duration = st.export.duration
  const fps = st.export.fps || 24
  const totalFrames = Math.max(1, Math.round(duration * fps))
  const frameDur = 1 / fps
  const transparent = !!st.export.transparentBackground && st.export.format === 'webm'

  const canvas = outputCanvas(width, height)
  const ctx = canvas.getContext('2d')
  renderer.resize(canvas, canvas.width, canvas.height)
  // La caché de bordes se calcula a la resolución de la imagen, no del lienzo,
  // así que vale la misma que ya tiene el preview. Solo se fuerza si falta.
  await renderer.prepare(items)

  const output = new Output({ format: new fmt.Format(), target: new BufferTarget() })
  const source = new CanvasSource(canvas, {
    codec: fmt.codec,
    quality: new Quality('high'),
    alpha: transparent ? 'keep' : 'discard',
  })
  output.addVideoTrack(source)
  await output.start()

  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (shouldCancel?.()) {
        await output.cancel?.()
        throw new Error('Export cancelado.')
      }
      const timeMs = (frame / fps) * 1000
      renderer.draw(ctx, canvas, st, timeMs, {
        items, bgEl, assets, loop: false, transparent,
      })
      await source.add(frame / fps, frameDur)

      if (frame % 3 === 0 || frame === totalFrames - 1) {
        onProgress?.(frame / totalFrames, `Codificando ${frame + 1}/${totalFrames}`)
        // Cede el hilo: si no, la pestaña se queda congelada durante todo el export.
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    onProgress?.(1, 'Cerrando el archivo…')
    await output.finalize()
    const blob = new Blob([output.target.buffer], { type: fmt.mime })
    return { blob, ext: fmt.ext, mime: fmt.mime }
  } finally {
    // El preview vuelve a mandar sobre el renderer compartido.
    renderer.requestRedraw()
  }
}

/** Exporta un solo fotograma (PNG/JPG) en el instante actual del transporte. */
export async function exportPaperFrame({ st, renderer, items, bgEl, assets, width, height, timeMs = 0 }) {
  const png = st.export.format !== 'jpg'
  const transparent = png && !!st.export.transparentBackground

  const canvas = outputCanvas(width, height)
  const ctx = canvas.getContext('2d')
  renderer.resize(canvas, canvas.width, canvas.height)
  await renderer.prepare(items)
  renderer.draw(ctx, canvas, st, timeMs, {
    items, bgEl, assets, loop: false, transparent,
  })

  const blob = await new Promise((resolve) => {
    if (png) canvas.toBlob(resolve, 'image/png')
    else canvas.toBlob(resolve, 'image/jpeg', (st.export.jpgQuality || 95) / 100)
  })
  renderer.requestRedraw()
  return { blob, ext: png ? '.png' : '.jpg', mime: png ? 'image/png' : 'image/jpeg' }
}
