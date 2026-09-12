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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uploadImages, uploadVideo } from '../../services/api'
import { useEditorHistory } from '../editor/hooks/useEditorHistory'
import { EMPTY_ASSETS, loadPaperAssets } from './paperAssets.js'
import { exportPaperFrame, exportPaperVideo } from './paperExport.js'
import { applyMatte, ensureAsset, runMatteJob } from './paperBg.js'
import {
  applyAlphaToContent, buildPaperImage, cropView, decodeCanvas,
  loadBackgroundImage, loadObjectImage,
} from './paperImage.js'
import {
  DEFAULT_OBJECT, TOOL, VIDEO_FORMATS, activeKeyframe, addKeyframe as addKf,
  cropSig, keyframeClipboardOf, newPaperState, normalizeCrop,
  patchKeyframe as patchKf, removeKeyframe as removeKf,
  resetPath, setDuration as setDur, setPath, setPaths, sortedKeyframes,
} from './paperModel.js'
import { createPaperRenderer } from './paperRender.js'
import { PAPER_FOLD_CLOSE_CLIP, PAPER_FOLD_OPEN_CLIP, PAPER_OBJECT_CLIP } from './paperTimeline.js'

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

  if (!rendererRef.current) rendererRef.current = createPaperRenderer()
  const renderer = rendererRef.current

  // `edit` (panel abierto, modo, tamaño del pincel) queda FUERA del historial: son
  // ajustes de herramienta, y deshacer no debería cerrarle el panel al usuario.
  const histSnap = useMemo(() => { const { edit: _edit, ...rest } = st; return rest }, [st])
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
  const patch = useCallback((path, value) => edit((cur) => setPath(cur, path, value)), [edit])
  /** `patchMany({'object.shadow.blur': 8, 'object.shadow.opacity': 60})` */
  const patchMany = useCallback((obj) => edit((cur) => setPaths(cur, obj)), [edit])
  const reset = useCallback((path) => edit((cur) => resetPath(cur, path)), [edit])

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
    if (!imgRef.current) return
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
  const kfs = useMemo(() => sortedKeyframes(st), [st])
  const selKf = useMemo(() => activeKeyframe(st), [st])

  const selectKeyframe = useCallback((id) => {
    edit((cur) => setPath(cur, 'object.animation.activeKeyframeId', id))
    const kf = stRef.current.object.animation.keyframes.find((k) => k.id === id)
    if (kf) {
      pause()
      seek(kf.time)
    }
  }, [edit, pause, seek])

  const addKeyframe = useCallback(() => edit((cur) => addKf(cur)), [edit])
  const removeKeyframe = useCallback((id) => edit((cur) => removeKf(cur, id)), [edit])
  const patchKeyframe = useCallback((id, p) => edit((cur) => patchKf(cur, id, p)), [edit])
  const moveKeyframe = useCallback((id, t) => {
    edit((cur) => patchKf(cur, id, { time: Math.max(0, +Number(t).toFixed(3)) }))
  }, [edit])

  const copyKeyframe = useCallback(() => setClipboard(keyframeClipboardOf(activeKeyframe(stRef.current))), [])
  const pasteKeyframe = useCallback(() => {
    const id = stRef.current.object.animation.activeKeyframeId
    if (!id || !clipboard) return
    edit((cur) => patchKf(cur, id, clipboard))
  }, [clipboard, edit])

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
    rendererRef.current.invalidateTornCache()
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
        'object.image.crop': null,
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
    edit((cur) => setPaths(cur, {
      imageSig,
      hasImage: false,
      imageName: '',
      erased: false,
      bgRemoved: false,
      object: structuredClone(DEFAULT_OBJECT),
      'edit.tool': TOOL.none,
    }))
    setBgJob(null)
    setError('')
    rendererRef.current.invalidateTornCache()
    rendererRef.current.requestRedraw()
    pause()
    seek(0)
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

  // --- borrado desde la timeline --------------------------------------------
  // La timeline de Paper proyecta el objeto y las bandas de apertura/cierre
  // (paperTimeline). Borrar cualquiera de esos clips se traduce aquí.
  const removeTimelineClip = useCallback((clipId) => {
    if (clipId === PAPER_FOLD_OPEN_CLIP) { patch('object.animation.simple.open', false); return }
    if (clipId === PAPER_FOLD_CLOSE_CLIP) { patch('object.animation.simple.close', false); return }
    // Solo el clip del objeto quita la imagen: un id desconocido no puede acabar
    // borrándola por descarte.
    if (clipId === PAPER_OBJECT_CLIP) clearImage()
  }, [patch, clearImage])

  // --- export ---------------------------------------------------------------
  const cancelExport = useCallback(() => { cancelExportRef.current = true }, [])

  const exportToMaterial = useCallback(async () => {
    const cur = stRef.current
    if (!imgRef.current) {
      setError('Carga primero una imagen.')
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
      imageEl: viewRef.current || imgRef.current,
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
  }, [format?.width, format?.height, projectId, onUploaded, pause, play])

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
    // `edit` no viaja en el historial: se conserva el actual.
    setSt((cur) => ({ ...snap, edit: cur.edit }))
    // La vista (recorte) se deriva de la imagen restaurada, no del historial.
    const view = imgRef.current ? cropView(imgRef.current, snap.object.image.crop) : null
    viewRef.current = view
    setViewSize(view ? { w: view.width, h: view.height } : null)
    rendererRef.current.invalidateTornCache()
    rendererRef.current.requestRedraw()
  }, [])

  return {
    st, setSt, time, playing, duration, error, setError, busy, assetsReady,
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
    // timeline
    removeTimelineClip,
    // salida
    exportToMaterial, cancelExport,
    // ciclo de vida / historia
    active, setActive, hist, applyHist,
  }
}
