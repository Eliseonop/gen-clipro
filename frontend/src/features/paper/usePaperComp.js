// Estado de Paper Animator dentro del editor. Mismo contrato que `useMotionComp`:
// vive en VideoEditor y lo consumen los tres paneles (PaperElements a la izquierda,
// PaperCanvas en el centro, PaperProps a la derecha) y la timeline.
//
// Reparto de responsabilidades:
//   · estado serializable (`st`)  → React, entra en undo/redo
//   · imágenes y assets           → refs (no son clonables por JSON)
//   · reloj de la animación       → ref + rAF, NO estado (cambia 60 veces/s;
//     meterlo en el estado dispararía un render por fotograma). Solo se publica
//     un `time` redondeado para que la timeline y el transporte lo pinten.

//   · texto                       → `st.text` (glyphs + elementos, cada uno con su
//     `object`); sus bitmaps se derivan en refs. Los paneles editan el object
//     SELECCIONADO (`st.selected`) a través de una vista: ver paperModel.viewOf.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { letterUrl, listLetters, uploadImages, uploadVideo } from '../../services/api'
import { useEditorHistory } from '../editor/hooks/useEditorHistory'
import { EMPTY_ASSETS, loadPaperAssets } from './paperAssets.js'
import { exportPaperFrame, exportPaperVideo } from './paperExport.js'
import { applyMatte, ensureAsset, runMatteJob } from './paperBg.js'
import {
  applyAlphaToContent, buildPaperImage, cropView, decodeCanvas,
  loadBackgroundImage, loadObjectImage,
} from './paperImage.js'
import {
  DEFAULT_OBJECT, DEFAULT_TEXT, TOOL, VIDEO_FORMATS, activeKeyframe, addKeyframe as addKf,
  cropSig, extendDuration, hasContent, hasText, isObjectPath, keyframeClipboardOf,
  newPaperState, normalizeCrop, patchKeyframe as patchKf, removeKeyframe as removeKf,
  resetPath, selectedObject, setDuration as setDur, setPath, setPaths, sortedKeyframes,
  viewOf, withSelectedObject,
} from './paperModel.js'
import { createPaperRenderer } from './paperRender.js'
import {
  applyObjectToAll, cycleGlyph, elementAt, elementSlot, glyphsSig, groupElements,
  indexLibrary, lastKeyframeTime, layoutGlyphs, removeElementChars, resolveGlyphs,
  switchMode, syncElements, ungroupElement,
} from './paperText.js'
import { buildElementBitmap, elementBitmapSig, loadGlyphImages } from './paperTextImage.js'
import {
  PAPER_FOLD_CLOSE_CLIP, PAPER_FOLD_OPEN_CLIP, PAPER_OBJECT_CLIP, paperClipTarget,
} from './paperTimeline.js'

/**
 * Deja `selected` apuntando a algo que exista: si el elemento seleccionado
 * desapareció (texto editado, undo…) pasa al primero, y si no hay texto, a la imagen.
 */
function fixSelection(st) {
  const els = st.text?.elements || []
  if (st.selected === 'image') {
    return !st.hasImage && els.length ? { ...st, selected: els[0].id } : st
  }
  if (els.some((e) => e.id === st.selected)) return st
  return { ...st, selected: els[0]?.id || 'image' }
}

/**
 * Re-resuelve los glyphs de `text` contra la biblioteca y re-encaja los
 * elementos. `prev` conserva las letras ya elegidas donde el carácter no cambió.
 */
function withGlyphs(cur, text, index, prev) {
  const glyphs = resolveGlyphs(text.content, index, text, prev)
  const sameGlyphs = glyphsSig(glyphs) === glyphsSig(cur.text.glyphs)
  const elements = sameGlyphs ? text.elements : syncElements(text, glyphs)
  const hadText = hasText(cur)
  let next = setPath(cur, 'text', { ...text, glyphs, elements, stash: sameGlyphs ? text.stash : null })
  // El primer texto se selecciona solo: es lo que el usuario va a querer tocar.
  if (!hadText && elements.length) next = { ...next, selected: elements[0].id }
  return fixSelection(next)
}

// Las rutas `object.*` van al object SELECCIONADO (la imagen o un elemento de
// texto): así el inspector entero sirve igual para los dos.
function setAny(cur, path, value) {
  return isObjectPath(path)
    ? withSelectedObject(cur, (v) => setPath(v, path, value))
    : setPath(cur, path, value)
}

export function usePaperComp(projectId, { format, onUploaded } = {}) {
  const [st, setSt] = useState(newPaperState)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)
  const [busy, setBusy] = useState('') // mensaje mientras se procesa la imagen
  const [error, setError] = useState('')
  const [exportJob, setExportJob] = useState(null) // { progress, message, status }
  const [clipboard, setClipboard] = useState(null)
  const [bgJob, setBgJob] = useState(null) // { progress, message, status } del matte
  // Tamaño de la vista que se dibuja. Va en estado (y no solo en `viewRef`)
  // porque el marco de transformación del lienzo se coloca a partir de él.
  const [viewSize, setViewSize] = useState(null)
  const [active, setActive] = useState(false) // el tab está abierto
  // Biblioteca de letras (assets/alfnum). null hasta que se pide por primera vez.
  const [letters, setLetters] = useState(null)
  const [glyphTick, setGlyphTick] = useState(0) // sube al terminar de cargar PNG de letras

  // --- refs: lo que no puede vivir en el estado ---
  const stRef = useRef(st)
  stRef.current = st
  const imgRef = useRef(null)        // Image re-muestreado: la imagen ENTERA
  const viewRef = useRef(null)       // lo que se dibuja: imgRef con el recorte aplicado
  const originalRef = useRef(null)   // Image original, fuente del matte y del restablecer
  const assetRef = useRef(null)      // material del proyecto detrás de la imagen, si lo hay
  const fileRef = useRef(null)       // File de una subida local (para poder subirla luego)
  const bgRef = useRef(null)         // Image de fondo
  const assetsRef = useRef(EMPTY_ASSETS)
  const rendererRef = useRef(null)
  const clockRef = useRef(0)         // ms de reproducción
  const startedRef = useRef(0)       // performance.now() del último play
  const playingRef = useRef(false)
  const cancelExportRef = useRef(false)
  const cancelBgRef = useRef(false)
  // Los píxeles NO caben en el estado (un Image no es serializable), pero el undo
  // sí tiene que devolverlos: sin esto, Ctrl+Z tras un trazo restauraría `imageSig`
  // dejando la imagen borrada — estado y píxeles en desacuerdo. Se guarda un Image
  // por firma y `applyHist` recupera el que corresponda a la instantánea.
  // Guarda también el ORIGINAL: sin él, deshacer un "quitar imagen" devolvería
  // los píxeles pero dejaría a `resetImage` sin fuente de la que reconstruir.
  const imgHistRef = useRef(new Map())
  const glyphCacheRef = useRef(new Map())   // file → { img, ready } de las letras
  const bitmapsRef = useRef(new Map())      // id de elemento → { sig, canvas, slot }
  const libIndexRef = useRef(indexLibrary(null))

  if (!rendererRef.current) rendererRef.current = createPaperRenderer()
  const renderer = rendererRef.current

  // `edit` (panel abierto, modo, tamaño del pincel) queda FUERA del historial: son
  // ajustes de herramienta, y deshacer no debería cerrarle el panel al usuario.
  // `selected` tampoco: elegir otra letra no es un paso que haya que deshacer.
  const histSnap = useMemo(() => { const { edit: _edit, selected: _sel, ...rest } = st; return rest }, [st])
  const hist = useEditorHistory(histSnap, active)

  // Contador propio para `imageSig`, en vez de derivarlo del estado dentro de un
  // updater: los updaters de React pueden ejecutarse más de una vez y no deben
  // tener efectos. Con un ref, cada edición obtiene una firma única y estable.
  const sigRef = useRef(0)

  /** Nueva firma + los píxeles que le corresponden, para que el undo los recupere. */
  const rememberImage = useCallback((image, original = originalRef.current) => {
    sigRef.current += 1
    const map = imgHistRef.current
    map.set(sigRef.current, { el: image, original })
    if (map.size > 24) map.delete(map.keys().next().value)
    return sigRef.current
  }, [])

  useEffect(() => {
    let alive = true
    loadPaperAssets().then((a) => {
      if (!alive) return
      assetsRef.current = a
      setAssetsReady(true)
      renderer.requestRedraw()
    })
    return () => { alive = false }
  }, [renderer])

  // --- escritura del estado -------------------------------------------------
  const edit = useCallback((fn) => {
    setSt((cur) => {
      const next = fn(cur)
      if (next !== cur) rendererRef.current.requestRedraw()
      return next
    })
  }, [])

  /** `patch('object.stroke.width', 30)` */
  const patch = useCallback((path, value) => edit((cur) => setAny(cur, path, value)), [edit])
  /** `patchMany({'object.shadow.blur': 8, 'object.shadow.opacity': 60})` */
  const patchMany = useCallback((obj) => edit((cur) => (
    Object.entries(obj).reduce((acc, [p, v]) => setAny(acc, p, v), cur)
  )), [edit])
  const reset = useCallback((path) => edit((cur) => (isObjectPath(path)
    ? withSelectedObject(cur, (v) => resetPath(v, path))
    : resetPath(cur, path))), [edit])
  const onSelected = useCallback((fn) => edit((cur) => withSelectedObject(cur, fn)), [edit])

  // Lo que ven los paneles: el estado con `object` = el seleccionado.
  const view = useMemo(() => viewOf(st), [st])

  /** Al tocar los parámetros del borde: filtro en vivo mientras se arrastra. */
  const setStrokeLive = useCallback((on) => renderer.setLivePreview(on), [renderer])

  // --- transporte -----------------------------------------------------------
  const duration = st.export.duration

  const seek = useCallback((seconds) => {
    const d = stRef.current.export.duration
    const t = Math.max(0, Math.min(d, Number(seconds) || 0))
    clockRef.current = t * 1000
    startedRef.current = performance.now() - clockRef.current
    setTime(t)
    rendererRef.current.requestRedraw()
  }, [])

  const play = useCallback(() => {
    if (!imgRef.current && !hasText(stRef.current)) return
    startedRef.current = performance.now() - clockRef.current
    playingRef.current = true
    setPlaying(true)
  }, [])

  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    rendererRef.current.requestRedraw()
  }, [])

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause()
    else play()
  }, [play, pause])

  const setDuration = useCallback((d) => edit((cur) => setDur(cur, d)), [edit])

  // --- keyframes ------------------------------------------------------------
  // Todo sobre el object seleccionado (la vista), con las mismas operaciones puras.
  const kfs = useMemo(() => sortedKeyframes(view), [view])
  const selKf = useMemo(() => activeKeyframe(view), [view])

  const selectKeyframe = useCallback((id) => {
    onSelected((cur) => setPath(cur, 'object.animation.activeKeyframeId', id))
    const kf = selectedObject(stRef.current).animation.keyframes.find((k) => k.id === id)
    if (kf) {
      pause()
      seek(kf.time)
    }
  }, [onSelected, pause, seek])

  const addKeyframe = useCallback(() => onSelected((cur) => addKf(cur)), [onSelected])
  const removeKeyframe = useCallback((id) => onSelected((cur) => removeKf(cur, id)), [onSelected])
  const patchKeyframe = useCallback((id, p) => onSelected((cur) => patchKf(cur, id, p)), [onSelected])
  const moveKeyframe = useCallback((id, t) => {
    onSelected((cur) => patchKf(cur, id, { time: Math.max(0, +Number(t).toFixed(3)) }))
  }, [onSelected])

  const copyKeyframe = useCallback(() => setClipboard(keyframeClipboardOf(activeKeyframe(viewOf(stRef.current)))), [])
  const pasteKeyframe = useCallback(() => {
    const id = selectedObject(stRef.current).animation.activeKeyframeId
    if (!id || !clipboard) return
    onSelected((cur) => patchKf(cur, id, clipboard))
  }, [clipboard, onSelected])

  /** Qué se edita: 'image' o el id de un elemento de texto. */
  const select = useCallback((target) => {
    edit((cur) => {
      if (cur.selected === target) return cur
      const next = fixSelection({ ...cur, selected: target })
      // Las herramientas de píxeles (recorte, pincel…) son de la imagen.
      return next.selected === 'image' ? next : setPath(next, 'edit.tool', TOOL.none)
    })
  }, [edit])

  // --- imagen ---------------------------------------------------------------
  // `imgRef` es SIEMPRE la imagen entera. Lo que se dibuja es `viewRef`, que se
  // deriva de ella aplicando el recorte: así recortar no crea una imagen nueva y
  // "restablecer recorte" es solo volver a poner `crop: null`.
  const crop = st.object.image.crop
  const cropKey = cropSig(crop)

  // `nextCrop` permite derivar con el recorte que ACABA de escribirse: `stRef`
  // todavía apunta al estado anterior hasta que React confirma el render, y sin
  // esto la imagen nueva se pintaría un fotograma con el recorte de la anterior.
  const deriveView = useCallback((nextCrop) => {
    const rect = nextCrop === undefined ? stRef.current.object.image.crop : nextCrop
    const view = imgRef.current ? cropView(imgRef.current, rect) : null
    viewRef.current = view
    setViewSize(view ? { w: view.width, h: view.height } : null)
    rendererRef.current.invalidateTornCache('image')
    rendererRef.current.requestRedraw()
  }, [])

  // El recorte cambia el tamaño del element que se dibuja, así que la caché de
  // bordes rasgados (que va por `imageSig`) hay que invalidarla a mano.
  useEffect(() => { deriveView() }, [st.imageSig, cropKey, deriveView])

  const bumpImage = useCallback((extra = {}) => {
    const imageSig = rememberImage(imgRef.current)
    edit((cur) => setPaths(cur, { imageSig, hasImage: true, ...extra }))
    deriveView()
  }, [edit, rememberImage, deriveView])

  const loadImage = useCallback(async (source, name, asset = null) => {
    setBusy('Cargando la imagen…')
    setError('')
    setBgJob(null)
    try {
      const { original, element, name: label } = await loadObjectImage(source, name)
      originalRef.current = original
      imgRef.current = element
      assetRef.current = asset
      fileRef.current = source instanceof Blob ? source : null
      const imageSig = rememberImage(element, original)
      edit((cur) => setPaths(cur, {
        imageSig, hasImage: true, imageName: label, erased: false, bgRemoved: false,
        'object.image.crop': null, selected: 'image',
      }))
      deriveView(null)
      seek(0)
      play()
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la imagen.')
    } finally {
      setBusy('')
    }
  }, [edit, seek, play, rememberImage, deriveView])

  /**
   * Quita la imagen y TODO lo que colgaba de ella: píxeles, recorte, matte,
   * transformaciones, animación y keyframes. Es lo que ejecuta también el borrado
   * desde la timeline, para que no queden estados residuales de un objeto que ya
   * no existe.
   */
  const clearImage = useCallback(() => {
    cancelBgRef.current = true
    imgRef.current = null
    viewRef.current = null
    originalRef.current = null
    assetRef.current = null
    fileRef.current = null
    const imageSig = rememberImage(null, null)
    edit((cur) => fixSelection(setPaths(cur, {
      imageSig,
      hasImage: false,
      imageName: '',
      erased: false,
      bgRemoved: false,
      object: structuredClone(DEFAULT_OBJECT),
      'edit.tool': TOOL.none,
    })))
    setBgJob(null)
    setError('')
    rendererRef.current.invalidateTornCache('image')
    rendererRef.current.requestRedraw()
    // Si queda texto, la animación sigue: solo se para cuando ya no hay nada.
    if (!hasText(stRef.current)) {
      pause()
      seek(0)
    }
  }, [edit, pause, seek, rememberImage])

  const loadBackground = useCallback(async (source) => {
    try {
      bgRef.current = await loadBackgroundImage(source)
      patch('background.hasImage', true)
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el fondo.')
    }
  }, [patch])

  const clearBackground = useCallback(() => {
    bgRef.current = null
    patch('background.hasImage', false)
  }, [patch])

  // --- herramientas del lienzo ----------------------------------------------
  // Cada herramienta se activa por sí misma desde el panel; no hay un modo
  // "editar imagen" que haya que abrir antes.
  const setTool = useCallback((tool) => {
    const next = Object.values(TOOL).includes(tool) ? tool : TOOL.none
    if (next !== TOOL.none) pause()
    patch('edit.tool', next)
  }, [patch, pause])

  const closeTool = useCallback(() => patch('edit.tool', TOOL.none), [patch])

  // Las ediciones destructivas trabajan sobre `imgRef` (el element ya
  // re-muestreado y con margen), NO sobre el original: repetir el pipeline en
  // cada trazo degradaría la imagen. `originalRef` se guarda intacto para poder
  // restablecer.

  /** Fija un canvas ya borrado (pincel / color) como nueva imagen. */
  const applyErase = useCallback(async (canvas) => {
    try {
      imgRef.current = await decodeCanvas(canvas)
      bumpImage({ erased: true })
    } catch (e) {
      setError(e?.message || 'No se pudo aplicar el borrado.')
    }
  }, [bumpImage])

  // --- recorte (no destructivo) ---------------------------------------------

  /** Fija el recorte. `rect` es normalizado (0-1) sobre la región útil. */
  const applyCrop = useCallback((rect) => {
    patch('object.image.crop', normalizeCrop(rect))
  }, [patch])

  const resetCrop = useCallback(() => patch('object.image.crop', null), [patch])

  /** Deshace borrados y matte: reconstruye desde la imagen original. */
  const resetImage = useCallback(async () => {
    if (!originalRef.current) return
    setBusy('Restableciendo…')
    try {
      const element = await buildPaperImage(originalRef.current)
      imgRef.current = element
      const imageSig = rememberImage(element)
      edit((cur) => setPaths(cur, { imageSig, erased: false, bgRemoved: false }))
      deriveView()
    } catch (e) {
      setError(e?.message || 'No se pudo restablecer la imagen.')
    } finally {
      setBusy('')
    }
  }, [edit, rememberImage, deriveView])

  // --- quitar fondo ----------------------------------------------------------
  // Reutiliza el motor de Eliminar fondo del editor (job del backend + matte
  // derivado con bgCutout); aquí solo se hornea el alfa en la imagen. Ver paperBg.
  const removeBackground = useCallback(async () => {
    if (!originalRef.current) return
    cancelBgRef.current = false
    setError('')
    setBgJob({ progress: 0, message: 'Preparando…', status: 'running' })
    const wasPlaying = playingRef.current
    pause()
    try {
      const isNew = !assetRef.current?.filename
      const asset = await ensureAsset(projectId, assetRef.current, fileRef.current, stRef.current.imageName)
      assetRef.current = asset
      // Si hubo que subirla, el material del proyecto tiene una imagen nueva.
      if (isNew) { fileRef.current = null; onUploaded?.() }

      const result = await runMatteJob(projectId, {
        asset,
        provider: stRef.current.edit.bgProvider,
        onProgress: (progress, message) => setBgJob({ progress, message, status: 'running' }),
        shouldCancel: () => cancelBgRef.current,
      })
      if (!result || cancelBgRef.current) { setBgJob(null); return }

      setBgJob({ progress: 1, message: 'Aplicando el matte…', status: 'running' })
      // El matte se calcula sobre el ORIGINAL (la geometría del archivo), pero se
      // aplica sobre la imagen ACTUAL: así se suma a los borrados a pincel que ya
      // hubiera, en vez de descartarlos.
      const cut = await applyMatte(originalRef.current, result, { shouldCancel: () => cancelBgRef.current })
      if (!cut || cancelBgRef.current || !imgRef.current) { setBgJob(null); return }

      imgRef.current = await decodeCanvas(applyAlphaToContent(imgRef.current, cut))
      bumpImage({ bgRemoved: true })
      setBgJob({ progress: 1, message: 'Fondo eliminado', status: 'done' })
      setTimeout(() => setBgJob((j) => (j?.status === 'done' ? null : j)), 2200)
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar el fondo.')
      setBgJob(null)
    } finally {
      if (wasPlaying) play()
    }
  }, [projectId, onUploaded, pause, play, bumpImage])

  const cancelBackground = useCallback(() => {
    cancelBgRef.current = true
    setBgJob(null)
  }, [])

  // --- texto con letras recortadas ------------------------------------------
  // La biblioteca se pide la primera vez que se abre el tab (no antes: el
  // editor no la necesita si nunca se usa Paper Animator).
  const loadLetters = useCallback(async () => {
    try {
      const lib = await listLetters()
      libIndexRef.current = indexLibrary(lib)
      setLetters(lib)
    } catch (e) {
      setLetters({ available: false, styles: [], glyphs: [], error: e?.message || 'No se pudo leer la biblioteca de letras.' })
    }
  }, [])

  useEffect(() => {
    if (active && !letters) loadLetters()
  }, [active, letters, loadLetters])

  const setTextContent = useCallback((content) => {
    edit((cur) => withGlyphs(cur, { ...cur.text, content }, libIndexRef.current, cur.text.glyphs))
  }, [edit])

  /** Cambia cómo se asignan las letras (`assign`, `style`, `seed`): vuelve a sortear. */
  const setTextAssign = useCallback((patchText) => {
    edit((cur) => withGlyphs(cur, { ...cur.text, ...patchText }, libIndexRef.current, null))
  }, [edit])

  const rerollText = useCallback(() => {
    edit((cur) => withGlyphs(cur, { ...cur.text, seed: (cur.text.seed || 0) + 1 }, libIndexRef.current, null))
  }, [edit])

  const setTextMode = useCallback((mode) => {
    edit((cur) => {
      const was = cur.text.elements.find((e) => e.id === cur.selected)
      const text = switchMode(cur.text, mode, cur.selected)
      const now = was ? elementAt(text.elements, was.from) : null
      return fixSelection({ ...setPath(cur, 'text', text), selected: now?.id || cur.selected })
    })
  }, [edit])

  /** Agrupa las letras de esas posiciones en un solo elemento y lo selecciona. */
  const groupLetters = useCallback((charIndexes) => {
    edit((cur) => {
      const { text, id } = groupElements(cur.text, charIndexes)
      return id ? { ...setPath(cur, 'text', text), selected: id } : cur
    })
  }, [edit])

  const ungroup = useCallback((id) => {
    edit((cur) => {
      const g = cur.text.elements.find((e) => e.id === id)
      if (!g) return cur
      const text = ungroupElement(cur.text, id)
      return fixSelection({ ...setPath(cur, 'text', text), selected: elementAt(text.elements, g.from)?.id })
    })
  }, [edit])

  /** Otra variante del carácter `i` (dir ±1), o la primera de `style`. */
  const changeLetter = useCallback((i, { dir = 1, style } = {}) => {
    edit((cur) => {
      const glyphs = cycleGlyph(cur.text.glyphs, i, libIndexRef.current, { dir, style })
      return glyphs === cur.text.glyphs ? cur : setPath(cur, 'text.glyphs', glyphs)
    })
  }, [edit])

  /** Copia el object seleccionado al resto de elementos (con retardo escalonado opcional). */
  const applySelectedToAll = useCallback((stagger = 0) => {
    edit((cur) => {
      const text = applyObjectToAll(cur.text, cur.selected, stagger)
      return extendDuration(setPath(cur, 'text', text), lastKeyframeTime(text))
    })
  }, [edit])

  const clearText = useCallback(() => {
    edit((cur) => fixSelection({
      ...setPath(cur, 'text', { ...structuredClone(DEFAULT_TEXT), assign: cur.text.assign, style: cur.text.style }),
      selected: 'image',
    }))
  }, [edit])

  const glyphs = st.text.glyphs
  const elements = st.text.elements
  const textLayout = useMemo(() => layoutGlyphs(glyphs), [glyphs])
  /** Hueco de cada elemento en la frase (id → slot): lo usa el marco del lienzo. */
  const textSlots = useMemo(() => {
    const out = new Map()
    for (const el of elements) {
      const slot = elementSlot(textLayout, el)
      if (slot) out.set(el.id, slot)
    }
    return out
  }, [elements, textLayout])

  // PNG de las letras: se cargan una vez y, al llegar, se rehacen los bitmaps.
  useEffect(() => {
    if (!glyphs.length) return undefined
    let alive = true
    loadGlyphImages(glyphs, glyphCacheRef.current, letterUrl).then(() => {
      if (alive) setGlyphTick((t) => t + 1)
    })
    return () => { alive = false }
  }, [glyphs])

  // Bitmap por elemento, derivado (no entra en el historial: el undo lo rehace).
  // Solo se recompone el elemento cuyas letras o rango cambiaron.
  useEffect(() => {
    const map = bitmapsRef.current
    const r = rendererRef.current
    const alive = new Set()
    for (const el of elements) {
      alive.add(el.id)
      const sig = `${elementBitmapSig(glyphs, el)}#${glyphTick}`
      if (map.get(el.id)?.sig === sig) continue
      const built = buildElementBitmap(textLayout, glyphs, el, glyphCacheRef.current)
      if (built) map.set(el.id, { sig, ...built })
      else map.delete(el.id)
      r.invalidateTornCache(el.id)
    }
    for (const id of [...map.keys()]) {
      if (!alive.has(id)) { map.delete(id); r.invalidateTornCache(id) }
    }
    r.requestRedraw()
  }, [elements, glyphs, textLayout, glyphTick])

  /**
   * Lo que se dibuja, de fondo a frente: la imagen y cada elemento de texto con
   * su bitmap. Lo consumen el lienzo y el export (mismo render → mismo resultado).
   */
  const renderItems = useCallback((cur) => {
    const items = []
    if (cur.hasImage && viewRef.current) {
      items.push({
        key: 'image', object: cur.object, imageEl: viewRef.current, sig: cur.imageSig,
        live: cur.selected === 'image',
      })
    }
    cur.text.elements.forEach((el, k) => {
      const b = bitmapsRef.current.get(el.id)
      if (!b) return
      items.push({
        key: el.id,
        object: el.object,
        imageEl: b.canvas,
        sig: b.sig,
        slot: b.slot,
        phase: k + 1, // cada letra vibra a su aire
        strokeRef: Math.max(b.canvas.width, b.canvas.height),
        live: cur.selected === el.id,
      })
    })
    return items
  }, [])

  // --- borrado desde la timeline --------------------------------------------
  // La timeline de Paper proyecta el objeto y las bandas de apertura/cierre
  // (paperTimeline). Borrar cualquiera de esos clips se traduce aquí.
  const removeTimelineClip = useCallback((clipId) => {
    if (clipId === PAPER_FOLD_OPEN_CLIP) { patch('object.animation.simple.open', false); return }
    if (clipId === PAPER_FOLD_CLOSE_CLIP) { patch('object.animation.simple.close', false); return }
    // Solo el clip del objeto quita la imagen: un id desconocido no puede acabar
    // borrándola por descarte.
    if (clipId === PAPER_OBJECT_CLIP) { clearImage(); return }
    // El clip de un elemento de texto quita sus caracteres de la frase.
    const target = paperClipTarget(clipId)
    if (target && target !== 'image') {
      edit((cur) => fixSelection(setPath(cur, 'text', removeElementChars(cur.text, target))))
    }
  }, [patch, edit, clearImage])

  // --- export ---------------------------------------------------------------
  const cancelExport = useCallback(() => { cancelExportRef.current = true }, [])

  const exportToMaterial = useCallback(async () => {
    const cur = stRef.current
    if (!hasContent(cur)) {
      setError('Carga primero una imagen o escribe un texto.')
      return
    }
    cancelExportRef.current = false
    setError('')
    const wasPlaying = playingRef.current
    pause()
    setExportJob({ progress: 0, message: 'Preparando…', status: 'running' })

    const common = {
      st: cur,
      renderer: rendererRef.current,
      items: renderItems(cur),
      bgEl: bgRef.current,
      assets: assetsRef.current,
      width: format?.width || 1080,
      height: format?.height || 1920,
    }

    try {
      const isVideo = VIDEO_FORMATS.includes(cur.export.format)
      const { blob, ext, mime } = isVideo
        ? await exportPaperVideo({
          ...common,
          onProgress: (p, message) => setExportJob({ progress: p, message, status: 'running' }),
          shouldCancel: () => cancelExportRef.current,
        })
        : await exportPaperFrame({ ...common, timeMs: clockRef.current })

      if (cancelExportRef.current) {
        setExportJob(null)
        if (wasPlaying) play()
        return
      }

      setExportJob({ progress: 1, message: 'Guardando en el material…', status: 'running' })
      const base = (cur.export.filename || 'paper').replace(/\.[^.]+$/, '')
      const file = new File([blob], `${base}${ext}`, { type: mime })
      // Un PNG/JPG va a Imágenes, no a Vídeos: si no, el material quedaría con un
      // "vídeo" que no se puede reproducir.
      if (isVideo) await uploadVideo(projectId, file)
      else await uploadImages(projectId, [file])
      setExportJob({ progress: 1, message: `Añadido a ${isVideo ? 'Vídeos' : 'Imágenes'}`, status: 'done' })
      onUploaded?.()
      setTimeout(() => setExportJob(null), 2200)
    } catch (e) {
      setError(e?.message || 'No se pudo exportar.')
      setExportJob(null)
    } finally {
      rendererRef.current.requestRedraw()
      if (wasPlaying) play()
    }
  }, [format?.width, format?.height, projectId, onUploaded, pause, play, renderItems])

  // --- bucle de reproducción ------------------------------------------------
  // Solo corre con el tab abierto. Mantiene el reloj y publica `time` redondeado
  // a centésimas: suficiente para el transporte y la timeline, y evita un render
  // de React por fotograma.
  useEffect(() => {
    if (!active) return undefined
    let raf = 0
    let lastPublished = -1
    const tick = () => {
      if (playingRef.current) {
        const d = stRef.current.export.duration * 1000
        clockRef.current = d > 0 ? (performance.now() - startedRef.current) % d : 0
        rendererRef.current.requestRedraw()
        const rounded = Math.round(clockRef.current / 10) / 100
        if (rounded !== lastPublished) {
          lastPublished = rounded
          setTime(rounded)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  // Al cerrar el tab se para: el editor vuelve a mandar sobre el preview.
  useEffect(() => {
    if (!active) {
      playingRef.current = false
      setPlaying(false)
    }
  }, [active])

  const applyHist = useCallback((snap) => {
    if (!snap) return
    const remembered = imgHistRef.current.get(snap.imageSig)
    if (remembered !== undefined) {
      imgRef.current = remembered.el
      originalRef.current = remembered.original
    } else if (!snap.hasImage) {
      imgRef.current = null
      originalRef.current = null
    }
    // `edit` y `selected` no viajan en el historial: se conservan los actuales
    // (si lo seleccionado ya no existe en la instantánea, se corrige).
    setSt((cur) => fixSelection({ ...snap, edit: cur.edit, selected: cur.selected }))
    // La vista (recorte) se deriva de la imagen restaurada, no del historial.
    const view = imgRef.current ? cropView(imgRef.current, snap.object.image.crop) : null
    viewRef.current = view
    setViewSize(view ? { w: view.width, h: view.height } : null)
    rendererRef.current.invalidateTornCache('image')
    rendererRef.current.requestRedraw()
  }, [])

  return {
    // `st` es la VISTA (su `object` es el seleccionado): lo que leen los paneles.
    // `raw` es el estado completo (imagen + todos los elementos de texto).
    st: view, raw: st, setSt, time, playing, duration, error, setError, busy, assetsReady,
    exportJob, bgJob, clipboard, kfs, selKf, viewSize,
    // refs para el canvas y el export. `viewRef` es lo que se DIBUJA (con el
    // recorte aplicado); `imgRef` sigue siendo la imagen entera.
    stRef, imgRef, viewRef, originalRef, bgRef, assetsRef, renderer, clockRef,
    // escritura
    patch, patchMany, reset, setStrokeLive,
    // transporte
    play, pause, togglePlay, seek, setDuration,
    // keyframes
    addKeyframe, removeKeyframe, patchKeyframe, moveKeyframe, selectKeyframe,
    copyKeyframe, pasteKeyframe,
    // imagen
    loadImage, clearImage, loadBackground, clearBackground,
    // herramientas de la imagen seleccionada
    setTool, closeTool, applyErase, applyCrop, resetCrop, resetImage,
    removeBackground, cancelBackground,
    // texto con letras
    letters, loadLetters, textLayout, textSlots, renderItems, select,
    setTextContent, setTextAssign, rerollText, setTextMode, groupLetters, ungroup,
    changeLetter, applySelectedToAll, clearText,
    // timeline
    removeTimelineClip,
    // salida
    exportToMaterial, cancelExport,
    // ciclo de vida / historia
    active, setActive, hist, applyHist,
  }
}
