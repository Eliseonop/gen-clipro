// Interpolación de la animación de Paper Animator. Portado tal cual de
// paper-animator/modules/transforms.js — ya era puro.

import { EASING, lerp } from './paperModel.js'

/**
 * Rectángulo que ocupa el objeto en un lienzo de `canvasW`×`canvasH`.
 *
 * La misma cuenta que hacía `draw` en línea; se saca aquí porque el marco de
 * transformación del lienzo (PaperCanvas) tiene que caer EXACTAMENTE sobre lo
 * que se pinta. Dos copias de esta fórmula = tiradores que no coinciden con la
 * imagen.
 *
 * Devuelve el centro y el tamaño en píxeles del lienzo; el jitter del movimiento
 * ambiental lo suma quien dibuja (no es parte de la pose editable).
 *
 * `slot` (solo elementos de texto, ver paperText.elementSlot) cambia dos cosas:
 *   · el encaje se calcula con la FRASE entera (fitW×fitH), no con el elemento,
 *     para que todas las letras compartan escala y conserven su tamaño relativo
 *   · el centro se desplaza a su hueco dentro de la frase (dx, dy), escalado con
 *     el propio elemento: x = y = 0 es "en su sitio"
 * Sin `slot` (la imagen) la cuenta es exactamente la de siempre.
 */
export function objectFrame(canvasW, canvasH, elW, elH, transform, slot = null) {
  const fitW = slot ? slot.fitW : elW
  const fitH = slot ? slot.fitH : elH
  const w = slot ? slot.w : elW
  const h = slot ? slot.h : elH
  const canvasAspect = canvasW / canvasH
  const imageAspect = fitW / fitH
  const baseScale = canvasAspect > imageAspect ? canvasH / fitH : canvasW / fitW
  const finalScale = baseScale * (transform.scale / 100)
  return {
    w: w * finalScale,
    h: h * finalScale,
    cx: canvasW / 2 + (canvasW * transform.x) / 100 + (slot ? slot.dx * finalScale : 0),
    cy: canvasH / 2 - (canvasH * transform.y) / 100 + (slot ? slot.dy * finalScale : 0),
    rotation: transform.rotation,
  }
}

/** Pose editable en `timeSec`: los sliders en modo simple, los keyframes en avanzado. */
export function transformAt(timeSec, objectState) {
  if (objectState.animation.mode !== 'advanced') {
    return {
      x: objectState.image.offset.x,
      y: objectState.image.offset.y,
      scale: objectState.image.size,
      rotation: objectState.image.rotation,
    }
  }
  return getAdvancedTransform(timeSec, objectState).transform
}

/**
 * Estado visual del papel ("open"/"closed") ANTES de `timeInSeconds`, según los
 * keyframes con `paperAnim` que hayan quedado atrás. Determina si el objeto se
 * dibuja plegado cuando no hay una animación de papel en curso.
 */
export function getVisualStateAtTime(timeInSeconds, keyframes) {
  const sorted = [...(keyframes || [])].sort((a, b) => a.time - b.time)
  let cur = 'open'
  for (const kf of sorted) {
    if (kf.time >= timeInSeconds) break
    if (kf.paperAnim === 'open') cur = 'open'
    else if (kf.paperAnim === 'close') cur = 'closed'
  }
  return cur
}

/**
 * Transform interpolado en `timeInSeconds` + los keyframes que lo rodean (los
 * necesita el render para saber si hay una animación de papel en ese tramo).
 */
export function getAdvancedTransform(timeInSeconds, objectState) {
  const keyframes = [...(objectState.animation.keyframes || [])].sort((a, b) => a.time - b.time)
  let transform = {
    x: objectState.image.offset.x,
    y: objectState.image.offset.y,
    scale: objectState.image.size,
    rotation: objectState.image.rotation,
  }

  if (!keyframes.length) return { transform, prevKeyframe: null, nextKeyframe: null }

  let prevKeyframe = keyframes[0]
  let nextKeyframe = keyframes[keyframes.length - 1]
  for (let i = 0; i < keyframes.length; i += 1) {
    if (keyframes[i].time <= timeInSeconds) prevKeyframe = keyframes[i]
    if (keyframes[i].time > timeInSeconds) {
      nextKeyframe = keyframes[i]
      break
    }
  }

  if (prevKeyframe === nextKeyframe) {
    const { x, y, scale, rotation } = prevKeyframe
    transform = { x, y, scale, rotation }
  } else if (prevKeyframe.easing === 'instant') {
    const { x, y, scale, rotation } = nextKeyframe
    transform = { x, y, scale, rotation }
  } else {
    const segment = nextKeyframe.time - prevKeyframe.time
    const into = timeInSeconds - prevKeyframe.time
    const progress = Math.max(0, Math.min(1, segment > 0 ? into / segment : 1))
    const ease = EASING[prevKeyframe.easing] || EASING.linear
    const p = ease(progress)
    transform = {
      x: lerp(prevKeyframe.x, nextKeyframe.x, p),
      y: lerp(prevKeyframe.y, nextKeyframe.y, p),
      scale: lerp(prevKeyframe.scale, nextKeyframe.scale, p),
      rotation: lerp(prevKeyframe.rotation, nextKeyframe.rotation, p),
    }
  }

  return { transform, prevKeyframe, nextKeyframe }
}
