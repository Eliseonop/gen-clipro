// Motor de dibujo de Paper Animator.
//
// Portado de paper-animator/modules/renderer.js + las partes de animation.js que
// eran cálculo (no bucle). Misma lógica de composición; lo que cambia es el
// acoplamiento:
//
//   antes                                   ahora
//   ─────────────────────────────────────   ────────────────────────────────────
//   canvas/ctx por getElementById           se pasan como argumento
//   lee el singleton `state`                recibe el estado
//   muta state.movement.rotation por frame  movementAt(t) → valor, sin mutar
//   muta paperFoldOverlay.currentImageIndex foldIndexAt(t) → índice
//   filtro SVG por id fijo del index.html   ids inyectables (PaperCanvas los monta)
//
// Que el jitter y el ciclo de pliegue pasen a ser funciones puras del tiempo es
// lo que hace el export determinista: el mismo `t` da el mismo fotograma, tanto
// en el preview como al codificar.

import { LIMITS, hexToRgba, seededRandom } from './paperModel.js'
import { getAdvancedTransform, getVisualStateAtTime, objectFrame } from './paperTransforms.js'

const BASE_RENDER_WIDTH = 1080
const TORN_SEEDS = [20, 30, 40, 10]
const FOLD_FRAMES = 6
const SIMPLE_ANIM_DURATION = 1 // s que dura la apertura/cierre en modo simple

// --- Cálculo de la animación ambiental (antes mutaba el estado cada frame) ---

/**
 * Vibración sutil del objeto (rotación + desplazamiento) en `elapsedMs`.
 * `phase` desincroniza varios objetos (cada letra de un texto vibra a su aire);
 * con 0 —la imagen— el resultado es el de siempre.
 */
export function movementAt(elapsedMs, movement, phase = 0) {
  if (!movement?.enabled) return { rotation: 0, offsetX: 0, offsetY: 0 }

  const simple = movement.mode === 'simpel'
  const speedK = simple ? movement.simpelSpeed : 1
  const strengthK = simple ? movement.simpelStrength : 1

  const rotSpeed = movement.rotationSpeed * speedK
  const rotStrength = movement.rotationStrength * strengthK
  const posSpeedX = movement.positionSpeed.x * speedK
  const posSpeedY = movement.positionSpeed.y * speedK
  const posStrengthX = movement.positionStrength.x * strengthK
  const posStrengthY = movement.positionStrength.y * strengthK

  let rotation = 0
  if (rotSpeed > 0 && rotStrength > 0) {
    const cycle = Math.floor(elapsedMs / (1000 / rotSpeed)) + phase
    rotation = cycle % 2 === 0 ? rotStrength : -rotStrength
  }

  let offsetX = 0
  if (posSpeedX > 0 && posStrengthX > 0) {
    const cycle = Math.floor(elapsedMs / (1000 / posSpeedX))
    offsetX = (seededRandom(cycle * 1000 + phase * 7919) - 0.5) * posStrengthX
  }

  let offsetY = 0
  if (posSpeedY > 0 && posStrengthY > 0) {
    const cycle = Math.floor(elapsedMs / (1000 / posSpeedY))
    offsetY = (seededRandom(cycle * 2000 + 500 + phase * 7919) - 0.5) * posStrengthY
  }

  return { rotation, offsetX, offsetY }
}

/** Índice (0-3) de la textura de arrugas que toca en `elapsedMs`. */
export function foldIndexAt(elapsedMs, fold) {
  const speed = fold?.speed || 0
  if (speed <= 0) return 0
  return Math.floor(elapsedMs / (1000 / speed)) % 4
}

/** Tiempo de la animación en segundos a partir del reloj del transporte. */
export function animTime(clockMs, duration, { loop = true } = {}) {
  const t = clockMs / 1000
  if (!loop || !duration) return t
  return t % duration
}

// --- Renderer -------------------------------------------------------------

/**
 * Crea el renderer. Encapsula los canvas offscreen, la caché de bordes rasgados y
 * el flag de "hay que repintar". Un renderer por stage (el preview y el export
 * usan el mismo, así el export sale idéntico a lo que se ve).
 *
 * `filterIds` son los ids de los nodos del `<filter>` SVG que monta PaperCanvas.
 */
export function createPaperRenderer(filterIds = {}) {
  const ids = {
    filter: 'paper-torn-filter',
    dilate: 'paper-torn-dilate',
    turbulence: 'paper-torn-turbulence',
    displacement: 'paper-torn-displacement',
    flood: 'paper-torn-flood',
    ...filterIds,
  }

  const objectCanvas = document.createElement('canvas')
  const objectCtx = objectCanvas.getContext('2d')
  const contentCanvas = document.createElement('canvas')
  const contentCtx = contentCanvas.getContext('2d')
  const finalCanvas = document.createElement('canvas')
  const finalCtx = finalCanvas.getContext('2d')
  const livePreviewCanvas = document.createElement('canvas')

  const whitenedCache = new Map()
  // Una caché de siluetas rasgadas POR ITEM (la imagen y cada elemento de texto):
  // key → { sig, images: [], generating }. El filtro SVG es uno solo y se
  // reconfigura por semilla, así que las generaciones van en cola.
  const torn = new Map()
  let tornQueue = Promise.resolve()
  let livePreview = false
  let needsRedraw = true

  function filterNode(key) {
    return document.getElementById(ids[key])
  }

  /**
   * La textura de arrugas se aclara hacia blanco según la opacidad elegida: en
   * `multiply` el blanco es neutro, así que "menos opacidad" = "más blanco".
   * Se memoiza por índice porque recorrer el ImageData es caro.
   */
  function whitenedOverlay(img, index, strengthPct) {
    const strength = (100 - strengthPct) / 100
    const cached = whitenedCache.get(index)
    if (cached && cached.img === img && cached.strength === strength
      && cached.canvas.width === img.naturalWidth && cached.canvas.height === img.naturalHeight) {
      return cached.canvas
    }
    const canvas = cached?.canvas || document.createElement('canvas')
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
    }
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = data.data
    for (let i = 0; i < px.length; i += 4) {
      px[i] += (255 - px[i]) * strength
      px[i + 1] += (255 - px[i + 1]) * strength
      px[i + 2] += (255 - px[i + 2]) * strength
    }
    ctx.putImageData(data, 0, 0)
    whitenedCache.set(index, { img, strength, canvas })
    return canvas
  }

  /**
   * Ajusta el `<filter>` SVG a los parámetros del borde, escalados al tamaño de
   * referencia del bitmap (su ancho; los elementos de texto pasan su lado mayor,
   * para que una "I" estrecha no tenga un borde más fino que una "W").
   */
  function applyTornFilter(refSize, stroke, seed) {
    const k = refSize / BASE_RENDER_WIDTH
    filterNode('dilate')?.setAttribute('radius', String(stroke.width * k))
    filterNode('displacement')?.setAttribute('scale', String(stroke.roughness * k))
    filterNode('turbulence')?.setAttribute('baseFrequency', String(stroke.detail / k))
    filterNode('turbulence')?.setAttribute('seed', String(seed))
    filterNode('flood')?.setAttribute('flood-color', '#FFFFFF')
  }

  function strokeSignature(object, imageSig) {
    const s = object.stroke
    return `${imageSig}|${s.enabled}|${s.width}|${s.roughness}|${s.detail}`
  }

  function strokeRef(item) {
    return item.strokeRef || item.imageEl.width
  }

  /**
   * Genera las 4 siluetas rasgadas (una por semilla) de un item aplicando el
   * filtro SVG. Progresiva: publica cada una en cuanto está y cede el hilo, para
   * que el preview no se congele con imágenes grandes.
   */
  function generateTornCache(item) {
    const { key = 'image', object, imageEl, sig: imageSig = 0 } = item
    let entry = torn.get(key)
    if (!entry) {
      entry = { sig: '', images: [], generating: null }
      torn.set(key, entry)
    }
    const sig = strokeSignature(object, imageSig)
    // Si ya hay una generación en vuelo se devuelve ESA promesa en lugar de
    // ignorar la llamada: el export la espera, y sin esto los primeros
    // fotogramas podrían codificarse con la caché a medias.
    if (entry.generating) return entry.generating
    if (!imageEl || !object.stroke.enabled || sig === entry.sig) return Promise.resolve()

    entry.sig = sig
    entry.images = []
    const ref = strokeRef(item)
    const stroke = { ...object.stroke }
    const owner = entry

    const run = async () => {
      const next = []
      try {
        for (let i = 0; i < TORN_SEEDS.length; i += 1) {
          // Invalidada mientras esperaba turno (texto editado, item borrado…).
          if (torn.get(key) !== owner || owner.sig !== sig) return
          const cache = document.createElement('canvas')
          cache.width = imageEl.width
          cache.height = imageEl.height
          const ctx = cache.getContext('2d')
          applyTornFilter(ref, stroke, TORN_SEEDS[i])
          ctx.filter = `url(#${ids.filter})`
          ctx.drawImage(imageEl, 0, 0)

          const img = new Image()
          img.src = cache.toDataURL()
          await img.decode()
          next[i] = img
          owner.images = [...next]
          needsRedraw = true
          await new Promise((r) => setTimeout(r, 16))
        }
      } catch (e) {
        console.error('Paper Animator: falló la caché de bordes rasgados', e)
        owner.sig = ''
      } finally {
        owner.generating = null
      }
    }
    tornQueue = tornQueue.then(run)
    owner.generating = tornQueue
    return owner.generating
  }

  /**
   * Compone el "sello": imagen + arrugas + capa de pliegue, recortado por la
   * silueta rasgada y, si hay animación de papel, por su máscara.
   * Devuelve `{ canvas, region }`: el offscreen y la región de él que toca estampar.
   */
  function drawStamp(item, imgW, imgH, assets, foldIndex, layerImage, maskImage) {
    const { object: obj, imageEl } = item
    const cx = contentCanvas.width / 2
    const cy = contentCanvas.height / 2
    // Todo lo que se pinta cae dentro del cuadrado de lado max(imgW, imgH)
    // centrado (la máscara y la capa de pliegue son ese cuadrado). Limpiar y
    // estampar solo esa región, y no los offscreen enteros, es lo que permite
    // dibujar un texto de muchas letras sin que el preview se arrastre.
    const region = stampRegion(imgW, imgH)
    objectCtx.clearRect(region.x, region.y, region.w, region.h)
    contentCtx.clearRect(region.x, region.y, region.w, region.h)
    finalCtx.clearRect(region.x, region.y, region.w, region.h)

    let colorFilter = ''
    if (obj.color.enabled) {
      const parts = []
      if (obj.color.colorize) parts.push('sepia(1)')
      parts.push(`hue-rotate(${obj.color.hue}deg)`)
      parts.push(`saturate(${100 + obj.color.saturation}%)`)
      parts.push(`brightness(${100 + obj.color.brightness}%)`)
      colorFilter = parts.join(' ')
    }

    contentCtx.save()
    contentCtx.filter = colorFilter
    contentCtx.translate(cx, cy)
    contentCtx.drawImage(imageEl, -imgW / 2, -imgH / 2, imgW, imgH)
    contentCtx.restore()

    const overlay = assets.overlays?.[foldIndex]
    if (overlay?.complete && overlay.naturalWidth > 0) {
      const strength = obj.paperFoldOverlay.enabled ? obj.paperFoldOverlay.opacity : 0
      const whitened = whitenedOverlay(overlay, foldIndex, strength)
      contentCtx.save()
      contentCtx.translate(cx, cy)
      contentCtx.globalCompositeOperation = obj.paperFoldOverlay.blendMode
      contentCtx.drawImage(whitened, -imgW / 2, -imgH / 2, imgW, imgH)
      contentCtx.restore()
    }

    if (layerImage) {
      const size = Math.max(imgW, imgH)
      contentCtx.save()
      contentCtx.translate(cx, cy)
      contentCtx.drawImage(layerImage, -size / 2, -size / 2, size, size)
      contentCtx.restore()
    }

    // Silueta: con borde rasgado (de la caché, o en vivo mientras se ajusta) o
    // la propia imagen. Se usa como alfa con destination-in.
    objectCtx.save()
    objectCtx.translate(cx, cy)
    const tornOn = obj.stroke.enabled && obj.stroke.width > 0
    if (tornOn && livePreview && item.live !== false) {
      livePreviewCanvas.width = imageEl.width
      livePreviewCanvas.height = imageEl.height
      const pctx = livePreviewCanvas.getContext('2d')
      applyTornFilter(strokeRef(item), obj.stroke, 10)
      pctx.clearRect(0, 0, livePreviewCanvas.width, livePreviewCanvas.height)
      pctx.filter = `url(#${ids.filter})`
      pctx.drawImage(imageEl, 0, 0)
      objectCtx.drawImage(livePreviewCanvas, -imgW / 2, -imgH / 2, imgW, imgH)
    } else if (tornOn) {
      const images = torn.get(item.key || 'image')?.images || []
      const cached = images[foldIndex] || images[0]
      objectCtx.drawImage(cached?.complete ? cached : imageEl, -imgW / 2, -imgH / 2, imgW, imgH)
    } else {
      objectCtx.drawImage(imageEl, -imgW / 2, -imgH / 2, imgW, imgH)
    }
    objectCtx.restore()

    // destination-in / source-in componen sobre TODO el lienzo; el clip a la región
    // da el mismo resultado donde importa y evita recorrer los offscreen enteros.
    contentCtx.save()
    clipTo(contentCtx, region)
    contentCtx.globalCompositeOperation = 'destination-in'
    contentCtx.drawImage(objectCanvas, 0, 0)
    contentCtx.restore()

    if (!maskImage) return { canvas: contentCanvas, region }

    const maskSize = Math.max(imgW, imgH)
    finalCtx.save()
    finalCtx.translate(cx, cy)
    finalCtx.drawImage(maskImage, -maskSize / 2, -maskSize / 2, maskSize, maskSize)
    finalCtx.restore()
    finalCtx.save()
    clipTo(finalCtx, region)
    finalCtx.globalCompositeOperation = 'source-in'
    finalCtx.drawImage(contentCanvas, 0, 0)
    finalCtx.restore()
    return { canvas: finalCanvas, region }
  }

  function clipTo(c, region) {
    c.beginPath()
    c.rect(region.x, region.y, region.w, region.h)
    c.clip()
  }

  /** Región (en píxeles de los offscreen) que ocupa un sello de imgW×imgH. */
  function stampRegion(imgW, imgH) {
    const half = Math.ceil(Math.max(imgW, imgH) / 2) + 2
    const cx = contentCanvas.width / 2
    const cy = contentCanvas.height / 2
    const x = Math.max(0, Math.floor(cx - half))
    const y = Math.max(0, Math.floor(cy - half))
    return {
      x,
      y,
      w: Math.max(1, Math.min(contentCanvas.width, Math.ceil(cx + half)) - x),
      h: Math.max(1, Math.min(contentCanvas.height, Math.ceil(cy + half)) - y),
    }
  }

  function drawBackground(ctx, canvas, st, bgEl, transparent) {
    const bg = st.background
    const parts = []
    const cc = bg.effects.colorCorrection
    if (cc.enabled) {
      if (cc.colorize) parts.push('sepia(1)')
      parts.push(`hue-rotate(${cc.hue}deg)`)
      parts.push(`saturate(${100 + cc.saturation}%)`)
      parts.push(`brightness(${100 + cc.brightness}%)`)
    }
    if (bg.effects.blur.enabled && bg.effects.blur.intensity > 0) {
      parts.push(`blur(${bg.effects.blur.intensity}px)`)
    }
    ctx.filter = parts.join(' ')

    if (!transparent) {
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    if (bgEl && !transparent) {
      const offX = (canvas.width * bg.transform.offset.x) / 100
      const offY = (canvas.height * -bg.transform.offset.y) / 100
      ctx.save()
      if (bg.transform.mode === 'fill') {
        ctx.translate(canvas.width / 2 + offX, canvas.height / 2 + offY)
        ctx.rotate((bg.transform.rotation * Math.PI) / 180)
        const userScale = bg.transform.size / 100
        const canvasAspect = canvas.width / canvas.height
        const bgAspect = bgEl.width / bgEl.height
        const fill = canvasAspect > bgAspect ? canvas.width / bgEl.width : canvas.height / bgEl.height
        ctx.scale(fill * userScale, fill * userScale)
        ctx.drawImage(bgEl, -bgEl.width / 2, -bgEl.height / 2)
      } else {
        ctx.drawImage(bgEl, 0, 0, canvas.width, canvas.height)
      }
      ctx.restore()
    }

    ctx.filter = 'none'

    const vig = bg.effects.vignette
    if (vig.enabled && !transparent) {
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const outer = 1.5 * Math.hypot(cx, cy)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer)
      const color = hexToRgba(vig.color, vig.opacity / 100)
      const mid = vig.radius / 100
      const halfFeather = vig.feather / 100 / 2
      grad.addColorStop(Math.max(0, mid - halfFeather), 'rgba(0,0,0,0)')
      grad.addColorStop(Math.min(1, mid + halfFeather), color)
      grad.addColorStop(1, color)
      ctx.save()
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
  }

  /**
   * Pinta un fotograma completo.
   *
   * @param ctx/canvas  destino (el del stage, o el del export)
   * @param st          estado de Paper Animator (fondo y duración)
   * @param clockMs     reloj del transporte en ms (manda el jitter y el pliegue)
   * @param opts.items  lo que se anima, de fondo a frente:
   *                    [{ key, object, imageEl, sig, slot?, phase?, strokeRef?, live? }]
   *                    Sin `items` se dibuja la imagen (`opts.imageEl` con `st.object`).
   * @param opts.bgEl / assets
   * @param opts.loop   false en el export (el tiempo no da la vuelta)
   * @param opts.transparent  omite el fondo (export con alfa)
   */
  function draw(ctx, canvas, st, clockMs, opts = {}) {
    const { bgEl, assets = {}, loop = true, transparent = false } = opts
    const items = opts.items || (opts.imageEl
      ? [{ key: 'image', object: st.object, imageEl: opts.imageEl, sig: opts.imageSig || 0 }]
      : [])

    // Los offscreen se ajustan aquí y no solo en resize(): el preview y el export
    // comparten el renderer, así que quien dibuja manda sobre su tamaño. Sin esto,
    // exportar a 1080×1920 y volver al preview dejaría los offscreen con el tamaño
    // del otro y el sello se recortaría.
    ensureOffscreen(canvas)

    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawBackground(ctx, canvas, st, bgEl, transparent)
    for (const item of items) {
      if (!item.imageEl) continue
      if (item.object.stroke.enabled && !(livePreview && item.live !== false)) generateTornCache(item)
      drawItem(ctx, canvas, st, clockMs, item, assets, loop)
    }
    ctx.restore()
  }

  /** Un objeto animable (la imagen o un elemento de texto) sobre el lienzo. */
  function drawItem(ctx, canvas, st, clockMs, item, assets, loop) {
    const obj = item.object
    const anim = obj.animation
    const duration = st.export.duration
    const timeSec = animTime(clockMs, duration, { loop })
    const foldIndex = foldIndexAt(clockMs, obj.paperFoldOverlay)
    const jitter = movementAt(clockMs, obj.movement, item.phase || 0)

    let transform
    let paperActive = false
    let paperFrame = 0

    if (anim.mode === 'simple') {
      transform = {
        x: obj.image.offset.x,
        y: obj.image.offset.y,
        scale: obj.image.size,
        rotation: obj.image.rotation,
      }
      const frameDur = SIMPLE_ANIM_DURATION / FOLD_FRAMES
      if (anim.simple.open && timeSec >= 0 && timeSec < SIMPLE_ANIM_DURATION) {
        paperActive = true
        paperFrame = Math.min(FOLD_FRAMES - 1, Math.floor(timeSec / frameDur))
      }
      const closeStart = duration - SIMPLE_ANIM_DURATION
      if (anim.simple.close && timeSec >= closeStart && timeSec <= duration) {
        paperActive = true
        const into = timeSec - closeStart
        paperFrame = FOLD_FRAMES - 1 - Math.min(FOLD_FRAMES - 1, Math.floor(into / frameDur))
      }
    } else {
      const adv = getAdvancedTransform(timeSec, obj)
      transform = adv.transform
      const { prevKeyframe, nextKeyframe } = adv
      if (prevKeyframe && nextKeyframe && prevKeyframe.paperAnim !== 'none') {
        const segment = nextKeyframe.time - prevKeyframe.time
        if (segment > 0) {
          paperActive = true
          const progress = Math.min(1, Math.max(0, (timeSec - prevKeyframe.time) / segment))
          const idx = Math.max(0, Math.min(FOLD_FRAMES - 1, Math.floor(progress * FOLD_FRAMES)))
          paperFrame = prevKeyframe.paperAnim === 'close' ? FOLD_FRAMES - 1 - idx : idx
        }
      }
    }

    // Fuera de una animación de papel, si el último estado fue "cerrado" el objeto
    // se queda plegado (fotograma 0) en vez de reaparecer entero.
    const closed = anim.mode !== 'simple' && !paperActive
      && getVisualStateAtTime(timeSec, anim.keyframes) === 'closed'
    const layerImage = paperActive ? assets.layers?.[paperFrame] : (closed ? assets.layers?.[0] : null)
    const maskImage = paperActive ? assets.masks?.[paperFrame] : (closed ? assets.masks?.[0] : null)

    // Mismo encaje que usa el marco de transformación del lienzo (PaperCanvas).
    const { imageEl } = item
    const frame = objectFrame(canvas.width, canvas.height, imageEl.width, imageEl.height, transform, item.slot)
    const imgW = frame.w
    const imgH = frame.h

    const { canvas: stamp, region } = drawStamp(item, imgW, imgH, assets, foldIndex, layerImage, maskImage)

    ctx.save()
    if (obj.shadow.enabled) {
      const k = canvas.height / 720
      ctx.shadowColor = hexToRgba(obj.shadow.color, obj.shadow.opacity / 100)
      ctx.shadowBlur = obj.shadow.blur * k
      ctx.shadowOffsetX = obj.shadow.offsetX * k
      ctx.shadowOffsetY = -obj.shadow.offsetY * k
    }
    ctx.translate(frame.cx + jitter.offsetX, frame.cy - jitter.offsetY)
    const rotation = transform.rotation + jitter.rotation
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180)
    // Solo la región usada del offscreen, en la misma posición relativa al centro
    // que tendría si se estampara el offscreen entero.
    ctx.drawImage(
      stamp, region.x, region.y, region.w, region.h,
      region.x - stamp.width / 2, region.y - stamp.height / 2, region.w, region.h,
    )
    ctx.restore()
  }

  /**
   * Ajusta los offscreen al lienzo de destino. Son más grandes que él porque el
   * objeto puede escalar hasta `LIMITS.imageSize.max` y no debe recortarse al
   * componerse.
   */
  function ensureOffscreen(canvas) {
    const k = LIMITS.imageSize.max / 100 + 0.1
    const ow = Math.round(canvas.width * k)
    const oh = Math.round(canvas.height * k)
    if (objectCanvas.width === ow && objectCanvas.height === oh) return
    objectCanvas.width = ow
    contentCanvas.width = ow
    finalCanvas.width = ow
    objectCanvas.height = oh
    contentCanvas.height = oh
    finalCanvas.height = oh
  }

  /** Fija la resolución interna del lienzo (y con ella la de los offscreen). */
  function resize(canvas, width, height) {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ensureOffscreen(canvas)
    needsRedraw = true
  }

  return {
    draw,
    resize,
    generateTornCache,
    /** Espera a que todos los items tengan su caché de bordes (lo usa el export). */
    async prepare(items) {
      for (const item of items || []) {
        if (item.imageEl && item.object.stroke.enabled) await generateTornCache(item)
      }
    },
    get needsRedraw() { return needsRedraw },
    requestRedraw() { needsRedraw = true },
    clearRedraw() { needsRedraw = false },
    /** Mientras se ajustan los sliders del borde: filtro en vivo, sin caché. */
    setLivePreview(on) {
      if (livePreview === on) return
      livePreview = on
      // Al soltar no hace falta invalidar nada: la firma de la caché incluye los
      // parámetros del borde, así que solo se regenera el item que cambió (con un
      // texto de muchas letras, invalidarlo todo las rehacía todas).
      needsRedraw = true
    },
    /** Sin `key` invalida todas las cachés; con `key`, solo la de ese item. */
    invalidateTornCache(key) {
      if (key == null) torn.clear()
      else torn.delete(key)
      needsRedraw = true
    },
    filterIds: ids,
  }
}
