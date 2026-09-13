// Tests de las partes SIN DOM de Paper Animator: el modelo de estado, la
// interpolación de la animación y el adaptador a la timeline del editor.
// (paperRender / paperImage / paperErase necesitan canvas y no se prueban aquí.)
//
// Ejecutar: node src/features/paper/paperModel.test.mjs

import assert from 'node:assert/strict'
import {
  addKeyframe, activeKeyframe, cropSig, DEFAULT_OBJECT, DEFAULT_PAPER_STATE,
  extendDuration, getPath, hasCrop, imageEdited, isOverlayTool, keyframeClipboardOf,
  LIMITS, newPaperState, normalizeCrop, patchKeyframe, paperExportName, removeKeyframe,
  resetPath, setDuration, setPath, setPaths, sortedKeyframes, TOOL,
} from './paperModel.js'
import { getAdvancedTransform, getVisualStateAtTime, objectFrame, transformAt } from './paperTransforms.js'
import {
  isPaperFoldClip, PAPER_OBJECT_CLIP, paperStateToTimeline, paperTimelineSig,
} from './paperTimeline.js'

// --- setPath: copia inmutable por ruta ------------------------------------
{
  const st = newPaperState()
  const next = setPath(st, 'object.stroke.width', 40)
  assert.equal(next.object.stroke.width, 40)
  assert.equal(st.object.stroke.width, DEFAULT_PAPER_STATE.object.stroke.width, 'no muta el original')
  assert.notEqual(next.object, st.object, 'clona la rama tocada')
  assert.notEqual(next.object.stroke, st.object.stroke)
  assert.equal(next.background, st.background, 'comparte las ramas intactas')
  assert.equal(getPath(next, 'object.stroke.width'), 40)
}

// setPaths aplica varias rutas y deja un solo objeto nuevo
{
  const st = newPaperState()
  const next = setPaths(st, { 'object.shadow.blur': 9, 'object.shadow.opacity': 20, 'export.fps': 30 })
  assert.equal(next.object.shadow.blur, 9)
  assert.equal(next.object.shadow.opacity, 20)
  assert.equal(next.export.fps, 30)
  assert.equal(st.object.shadow.blur, 5, 'el original intacto')
}

// resetPath devuelve una rama a su valor por defecto, sin compartir referencia
{
  const st = setPath(newPaperState(), 'object.movement.simpelSpeed', 4)
  const back = resetPath(st, 'object.movement')
  assert.equal(back.object.movement.simpelSpeed, 1)
  assert.notEqual(back.object.movement, DEFAULT_PAPER_STATE.object.movement,
    'clona: tocar el estado no puede contaminar el default')
}

// --- duración -------------------------------------------------------------
{
  assert.equal(setDuration(newPaperState(), 12).export.duration, 12)
  assert.equal(setDuration(newPaperState(), 0).export.duration, LIMITS.duration.min, 'recorta por abajo')
  assert.equal(setDuration(newPaperState(), 999).export.duration, LIMITS.duration.max, 'recorta por arriba')

  // extendDuration solo crece, y redondea al medio segundo hacia arriba
  const st = newPaperState() // duración 5
  assert.equal(extendDuration(st, 3).export.duration, 5, 'no encoge')
  assert.equal(extendDuration(st, 7).export.duration, 7)
  assert.equal(extendDuration(st, 7.1).export.duration, 7.5, 'redondea a 0,5 arriba')
  assert.equal(extendDuration(st, 999).export.duration, LIMITS.duration.max, 'con tope')
}

// --- keyframes ------------------------------------------------------------
{
  let st = newPaperState()
  assert.equal(st.object.animation.keyframes.length, 2)

  st = addKeyframe(st)
  const kfs = sortedKeyframes(st)
  assert.equal(kfs.length, 3)
  assert.equal(kfs[2].time, 2, 'el nuevo va 1 s después del último')
  assert.equal(kfs[2].easing, 'linear')
  assert.equal(kfs[2].paperAnim, 'none')
  assert.equal(activeKeyframe(st).id, kfs[2].id, 'queda seleccionado')

  // mover un keyframe más allá de la duración la estira
  st = setDuration(st, 2)
  st = patchKeyframe(st, kfs[2].id, { time: 5 })
  assert.ok(st.export.duration >= 5, 'la duración acompaña al keyframe')

  // borrar
  const id = kfs[2].id
  st = removeKeyframe(st, id)
  assert.equal(st.object.animation.keyframes.length, 2)
  assert.equal(st.object.animation.activeKeyframeId, null, 'deselecciona el borrado')

  // nunca se queda sin keyframes
  let only = newPaperState()
  only = removeKeyframe(only, only.object.animation.keyframes[0].id)
  only = removeKeyframe(only, only.object.animation.keyframes[0].id)
  assert.equal(only.object.animation.keyframes.length, 1, 'el último no se puede borrar')
}

// portapapeles: solo posición/escala/giro, nunca el tiempo ni el id
{
  const kf = newPaperState().object.animation.keyframes[1]
  const clip = keyframeClipboardOf(kf)
  assert.deepEqual(Object.keys(clip).sort(), ['rotation', 'scale', 'x', 'y'])
  assert.equal(keyframeClipboardOf(null), null)
}

// --- interpolación --------------------------------------------------------
{
  const obj = {
    image: { size: 80, offset: { x: 0, y: 0 }, rotation: 0 },
    animation: {
      keyframes: [
        { id: 'a', time: 0, x: 0, y: 0, scale: 50, rotation: 0, easing: 'linear', paperAnim: 'none' },
        { id: 'b', time: 2, x: 100, y: 0, scale: 150, rotation: 90, easing: 'linear', paperAnim: 'none' },
      ],
    },
  }

  assert.equal(getAdvancedTransform(0, obj).transform.x, 0)
  assert.equal(getAdvancedTransform(2, obj).transform.x, 100)
  const mid = getAdvancedTransform(1, obj).transform
  assert.equal(mid.x, 50, 'lineal a mitad de camino')
  assert.equal(mid.scale, 100)
  assert.equal(mid.rotation, 45)

  // antes del primero y después del último: se queda pegado a los extremos
  assert.equal(getAdvancedTransform(-1, obj).transform.x, 0)
  assert.equal(getAdvancedTransform(99, obj).transform.x, 100)

  // 'instant' salta al valor del siguiente sin interpolar
  const inst = structuredClone(obj)
  inst.animation.keyframes[0].easing = 'instant'
  assert.equal(getAdvancedTransform(1, inst).transform.x, 100)

  // Los easing no lineales se desvían del punto medio pero respetan los extremos.
  // Con tolerancia: los back* se apoyan en (t-1)² y dejan ruido de coma flotante.
  for (const easing of ['easeIn', 'easeOut', 'easeInOut', 'backIn', 'backOut', 'backInOut']) {
    const e = structuredClone(obj)
    e.animation.keyframes[0].easing = easing
    assert.ok(Math.abs(getAdvancedTransform(0, e).transform.x - 0) < 1e-9, `${easing} en t=0`)
    assert.ok(Math.abs(getAdvancedTransform(2, e).transform.x - 100) < 1e-9, `${easing} en t=fin`)
  }
  const ei = structuredClone(obj)
  ei.animation.keyframes[0].easing = 'easeIn'
  assert.ok(getAdvancedTransform(1, ei).transform.x < 50, 'easeIn va por detrás')

  // sin keyframes cae a la transformación estática de la imagen
  const none = { ...obj, animation: { keyframes: [] } }
  assert.equal(getAdvancedTransform(1, none).transform.scale, 80)
}

// estado del papel: lo fija el último keyframe con paperAnim que ya haya pasado
{
  const kfs = [
    { time: 0, paperAnim: 'none' },
    { time: 1, paperAnim: 'close' },
    { time: 3, paperAnim: 'open' },
  ]
  assert.equal(getVisualStateAtTime(0.5, kfs), 'open', 'por defecto abierto')
  assert.equal(getVisualStateAtTime(2, kfs), 'closed')
  assert.equal(getVisualStateAtTime(4, kfs), 'open')
  assert.equal(getVisualStateAtTime(1, kfs), 'open', 'el keyframe en t no cuenta todavía')
}

// --- adaptador a la timeline ---------------------------------------------
{
  // sin imagen no hay nada que pintar
  assert.deepEqual(paperStateToTimeline(newPaperState()), { tracks: [], clips: [] })

  // modo simple, sin apertura ni cierre: una sola pista con el objeto
  let st = setPaths(newPaperState(), { hasImage: true, imageName: 'gato.png' })
  let tl = paperStateToTimeline(st)
  assert.equal(tl.tracks.length, 1)
  assert.equal(tl.clips.length, 1)
  assert.equal(tl.clips[0].id, PAPER_OBJECT_CLIP)
  assert.equal(tl.clips[0].kind, 'image', 'image: la timeline no le dibuja curva de volumen')
  assert.equal(tl.clips[0].start, 0)
  assert.equal(tl.clips[0].out_point, st.export.duration, 'ocupa toda la animación')
  assert.equal(tl.clips[0].keyframes.enabled, false, 'en simple no hay keyframes')

  // modo simple con apertura y cierre: pista "Papel" con dos bandas de 1 s
  st = setPaths(st, {
    'object.animation.simple.open': true,
    'object.animation.simple.close': true,
  })
  tl = paperStateToTimeline(st)
  assert.equal(tl.tracks.length, 2)
  assert.ok(tl.tracks[1].locked, 'la pista de papel está bloqueada: sus tiempos son fijos')
  const open = tl.clips.find((c) => c.id === 'paper_fold_open')
  const close = tl.clips.find((c) => c.id === 'paper_fold_close')
  assert.equal(open.start, 0)
  assert.equal(open.out_point, 1)
  assert.equal(close.start, st.export.duration - 1)
  assert.ok(isPaperFoldClip(open.id) && isPaperFoldClip(close.id))
  assert.ok(!isPaperFoldClip(PAPER_OBJECT_CLIP))

  // modo avanzado: los keyframes se proyectan al formato del editor
  st = setPath(st, 'object.animation.mode', 'advanced')
  tl = paperStateToTimeline(st)
  assert.equal(tl.tracks.length, 1, 'en avanzado no hay pista de papel')
  const items = tl.clips[0].keyframes.items
  assert.equal(tl.clips[0].keyframes.enabled, true)
  assert.equal(items.length, 2)
  assert.deepEqual(Object.keys(items[0].props).sort(), ['rotation', 'scale', 'x', 'y'])
  assert.equal(items[0].t, 0)
  assert.equal(items[1].t, 1)
  assert.equal(items[0].interpolation, 'linear')

  // 'instant' se pinta como 'hold' (el punto sale marcado como directo)
  const inst = patchKeyframe(st, st.object.animation.keyframes[0].id, { easing: 'instant' })
  assert.equal(paperStateToTimeline(inst).clips[0].keyframes.items[0].interpolation, 'hold')

  // un keyframe más allá de la duración se recorta al pintarlo (no descuadra la barra)
  const over = setPath(st, 'object.animation.keyframes',
    [{ id: 'z', time: 999, x: 0, y: 0, scale: 80, rotation: 0, easing: 'linear', paperAnim: 'none' }])
  assert.equal(paperStateToTimeline(over).clips[0].keyframes.items[0].t, over.export.duration)
}

// La firma solo cambia con lo que afecta a la timeline: tocar la sombra no la mueve.
{
  const st = setPaths(newPaperState(), { hasImage: true, imageName: 'a.png' })
  const sig = paperTimelineSig(st)
  assert.equal(paperTimelineSig(setPath(st, 'object.shadow.blur', 40)), sig,
    'la sombra no re-deriva la timeline')
  assert.equal(paperTimelineSig(setPath(st, 'object.stroke.width', 60)), sig)
  assert.notEqual(paperTimelineSig(setDuration(st, 9)), sig, 'la duración sí')
  assert.notEqual(paperTimelineSig(setPath(st, 'object.animation.mode', 'advanced')), sig, 'el modo sí')
  assert.notEqual(paperTimelineSig(addKeyframe(setPath(st, 'object.animation.mode', 'advanced'))),
    paperTimelineSig(setPath(st, 'object.animation.mode', 'advanced')), 'añadir keyframe sí')
  assert.equal(paperTimelineSig(newPaperState()), 'empty')
}

// --- recorte no destructivo ----------------------------------------------
{
  // Por defecto no hay recorte y la imagen no tiene ediciones.
  const st = newPaperState()
  assert.equal(st.object.image.crop, null)
  assert.equal(hasCrop(st), false)
  assert.equal(imageEdited(st), false)
  assert.equal(cropSig(null), '')

  // Un rect válido se guarda tal cual (redondeado) y queda marcado como recorte.
  const cropped = setPath(st, 'object.image.crop', normalizeCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }))
  assert.deepEqual(cropped.object.image.crop, { x: 0.1, y: 0.2, w: 0.5, h: 0.5 })
  assert.equal(hasCrop(cropped), true)
  assert.notEqual(cropSig(cropped.object.image.crop), '')

  // El recorte NO toca los píxeles: `erased`/`bgRemoved` siguen a cero, así que
  // "restablecer imagen" y "restablecer recorte" son acciones distintas.
  assert.equal(imageEdited(cropped), false)

  // Recortarlo todo equivale a no recortar (si no, el botón de restablecer se
  // quedaría encendido sin nada que restablecer).
  assert.equal(normalizeCrop({ x: 0, y: 0, w: 1, h: 1 }), null)
  assert.equal(normalizeCrop({ x: 0, y: 0, w: 0.001, h: 0.5 }), null, 'demasiado pequeño')
  assert.equal(normalizeCrop(null), null)

  // Fuera de rango: se recorta a 0-1 sin salirse.
  const clamped = normalizeCrop({ x: 0.8, y: -0.5, w: 5, h: 5 })
  assert.equal(clamped.x, 0.8)
  assert.equal(clamped.y, 0)
  assert.ok(clamped.x + clamped.w <= 1.00001)
  assert.ok(clamped.y + clamped.h <= 1.00001)

  // `resetPath` devuelve la rama entera de la imagen, recorte incluido.
  assert.equal(resetPath(cropped, 'object.image').object.image.crop, null)

  // Las marcas de edición destructiva sí las llevan sus propios flags.
  assert.equal(imageEdited(setPath(st, 'erased', true)), true)
  assert.equal(imageEdited(setPath(st, 'bgRemoved', true)), true)
}

// --- herramientas ---------------------------------------------------------
{
  assert.equal(newPaperState().edit.tool, TOOL.none)
  assert.equal(isOverlayTool(TOOL.none), false, 'sin herramienta no hay capa sobre el lienzo')
  for (const t of [TOOL.crop, TOOL.brush, TOOL.color]) assert.equal(isOverlayTool(t), true)
}

// --- geometría del objeto -------------------------------------------------
// La misma que usa el renderer: el marco de transformación del lienzo tiene que
// caer justo encima de lo que se pinta.
{
  // Lienzo 1000x1000, imagen 500x250 (más ancha que alta) al 100 %: encaja por el
  // ancho y conserva el aspecto.
  const f = objectFrame(1000, 1000, 500, 250, { x: 0, y: 0, scale: 100, rotation: 0 })
  assert.equal(f.w, 1000)
  assert.equal(f.h, 500)
  assert.equal(f.cx, 500, 'centrado sin desplazamiento')
  assert.equal(f.cy, 500)

  // La escala es un porcentaje de ese encaje.
  assert.equal(objectFrame(1000, 1000, 500, 250, { x: 0, y: 0, scale: 50, rotation: 0 }).w, 500)

  // El desplazamiento es un % del lado del lienzo, y la Y va hacia ARRIBA.
  const moved = objectFrame(1000, 2000, 500, 250, { x: 10, y: 10, scale: 100, rotation: 0 })
  assert.equal(moved.cx, 500 + 100)
  assert.equal(moved.cy, 1000 - 200)

  // Un lienzo más alto que la imagen encaja por el alto.
  const tall = objectFrame(1000, 1000, 250, 500, { x: 0, y: 0, scale: 100, rotation: 0 })
  assert.equal(tall.h, 1000)
  assert.equal(tall.w, 500)

  // Recortar cambia el element que se dibuja: la vista recortada llena el mismo
  // encaje, que es justo lo que hace que el marco siga al contenido visible.
  const full = objectFrame(1000, 1000, 800, 800, { x: 0, y: 0, scale: 100, rotation: 0 })
  const half = objectFrame(1000, 1000, 400, 400, { x: 0, y: 0, scale: 100, rotation: 0 })
  assert.equal(full.w, half.w)
}

// transformAt: en simple manda la imagen, en avanzado los keyframes
{
  const obj = structuredClone(DEFAULT_OBJECT)
  obj.image.size = 42
  obj.image.offset = { x: 5, y: -5 }
  assert.deepEqual(transformAt(0, obj), { x: 5, y: -5, scale: 42, rotation: 0 })

  obj.animation.mode = 'advanced'
  // kf1 (t=0, scale 50) → kf2 (t=1, scale 80): a mitad, 65
  assert.equal(transformAt(0, obj).scale, 50)
  assert.equal(transformAt(0.5, obj).scale, 65)
  assert.equal(transformAt(1, obj).scale, 80)
}

// paperExportName: prefijo fijo + imagen/texto, y fallback obligatorio
{
  const FIXED = new Date(2026, 8, 13, 4, 5) // 2026-09-13 04:05

  // Imagen con nombre → se usa sin extensión
  const img = setPaths(newPaperState(), { hasImage: true, imageName: 'Gato jugando.png' })
  assert.equal(paperExportName(img, FIXED), 'paper-animation Gato jugando')

  // Sin imagen pero con texto → se usa el texto de la frase
  const txt = setPaths(newPaperState(), {
    'text.content': '200', 'text.elements': [{ id: 'e1', from: 0, to: 2, object: DEFAULT_OBJECT }],
  })
  assert.equal(paperExportName(txt, FIXED), 'paper-animation 200')

  // La imagen manda sobre el texto (representa "la imagen que utiliza")
  const both = setPaths(img, {
    'text.content': 'hola', 'text.elements': [{ id: 'e1', from: 0, to: 3, object: DEFAULT_OBJECT }],
  })
  assert.equal(paperExportName(both, FIXED), 'paper-animation Gato jugando')

  // Sin nombre ni texto → nombre descriptivo obligatorio (marca de tiempo)
  const empty = setPaths(newPaperState(), { hasImage: true, imageName: '' })
  assert.equal(paperExportName(empty, FIXED), 'paper-animation 2026-09-13 0405')

  // Siempre empieza por el prefijo identificable
  assert.ok(paperExportName(newPaperState(), FIXED).startsWith('paper-animation'))
}

console.log('paper ok')
