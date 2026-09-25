import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import Toast from '../../components/Toast'
import { fmt } from '../../lib/utils'
import { getTimeline, saveTimeline, prepareReframe, getJob, createClipJob, getSettings,
  createBgRemovalJob, createBgCutoutJob, createBgAnalyzeJob, segmentBg, listBgProviders, cancelJob,
  addMotionToTimeline,
  createSegments, faceTrackMaterial, importExplore } from '../../services/api'
import { dragMark, markToSourceRange, materialDuration, segmentDescription, segmentLabel, MIN_SEGMENT } from './clipExtract'
import SegmentConfirmModal from './SegmentConfirmModal'
import EdPasteAttrs from './EdPasteAttrs'
import EdSoundDesign from './EdSoundDesign'
import EdStickMenu from './EdStickMenu'
import EdCropModal from './EdCropModal'
import { clamp } from '../../lib/panning'
import { defaultTextStyle, subtitleStyle, wrappedText, ensureEditorFonts, selectedSubtitleThemeId, clearTextTheme, effectiveTextStyle } from '../../lib/textstyles'
import { applyThemeToStyle, wordsPerBoxOptions, activeWordsPerBox, splitCaptionWords } from '../../lib/textKaraoke'
import {
  uid, mediaUrl, defaultTracks, newReframe, withKfIds,
  makeClip, makeTextClip, makeShapeClip, makeAdjustmentClip, clipDur, clipEnd, clipPlaybackMuted, clipSpeed, clipKeepPitch, timelineToSource, sourceToTimeline, splitClipAt,
  canCaptionClip, removeTrack, shouldConfirmTrackDelete,
  extraClipsAfterSplit, extraClipsAfterOneSplit, splitTrackTextByMaxWords, splitOneTextClip,
  nextClipSelection, groupMoveFromOrig, patchClipsStyle, removeClipsByIds, freeStartOnTrack,
  previewElementVolume, parsePreviewVolume, PREVIEW_VOL_KEY, syncPreviewMedia,
  isVisualClip, trackKindForClip, laneKindForAsset, IMAGE_DEFAULT_DUR,
  duplicateClipOntoTrack, syncMaterialInstances, applyFaceTrack,
  isEditingExistingClip, clipSaveIndex,
  trackContextItems, linkTrackPair, unlinkTrackPair,
  applyAudioSpeedToLinkedText, matchClipsToFirstDuration,
  clipLayerInfo, moveClipLayer, canLayerClip,
  trackTextContent, trackSrt, trackSrtWithReference, trackSource, clipCopyText,
  previewHead, safeMediaTime, mcpBusyClipIds,
  motionLayersToTimeline, motionClipTiming,
} from './editorModel'
import { textRole } from '../../lib/textRole'
import { CINEMA_RATIOS, SHAPE_DEFAULT_DUR, cinemaBar, defaultShape, drawInKeyframes, pathShape, renormalizePath } from '../../lib/shapes'
import { clipFlip } from '../../lib/clipAnim'
import { readRowHeight, writeRowHeight } from './trackRows'
import { newTrackIndex, resolveNewTrack } from './dropIntent'
import { TIMELINE_SCHEMA_VERSION, insertTrack, reorderTrack, stepTrack, trackNeighbor } from './trackStack'
import { MASK_KF_KEYS, clipMasks, defaultMask, maskId, normalizeMask } from '../../lib/clipMask'
import {
  DEFAULT_PROVIDER, autoActive, bgCapable, chromaBg, clipBg, defaultBg, editsAtFrame,
  isInteractiveProvider, isManualMark, matteFrameIndex, matteFrameTime, normalizeBg,
  preferredSamProvider,
} from '../../lib/clipBg'
import { clearMagic, magicCovers, setMagicMask } from './bgMagic'
import { copyClipAttrs, groupApplies, pasteClipAttrs, pasteableGroups } from '../../lib/clipAttrs'
import { resetBgMeta, resetCutout } from './bgCutout'
import { canvasPointer, cropWindow, followTrackMaskKeys, frameRectOf, freeFrameAt, isOverlay, mediaSize, newTransform, sourceCropPx, videosAt } from '../../lib/clipLayout'
import {
  AUDIO_FX_KEYS, applyVolumeFade, canKeyframe, clipPropsAt, clipVolumeAt, clampVolume, deleteKeyframeItem,
  copyKeyframeAt, disableKeyframes, duplicateKeyframeAt, enableKeyframes, flattenPatch,
  KF_GROUP_IDS, keyframeIdAt, keyframesOn, kfState, normalizeItems, pasteKeyframeAt,
  keyframesEnabled, patchKeyframe, shouldKeyframe, upsertKeyframeAt,
} from '../../lib/clipKeyframes'
import { drawMainView } from './render/canvas'
import MotionCanvas from '../motion/MotionCanvas'
import MotionProps from '../motion/MotionProps'
import GenerateSceneModal from '../motion/GenerateSceneModal'
import GenerateResourceModal from '../motion/GenerateResourceModal'
import SceneDirectionWorkspace from '../direction/SceneDirectionWorkspace'
import { patchDirectionSegment, suggestClipNotes, freezeFrame as apiFreezeFrame, detectBeats as apiDetectBeats, trackObject as apiTrackObject, soundDesign as apiSoundDesign,
  applyRecipe as apiApplyRecipe } from '../../services/api'
import { placeSoundDesign } from '../../lib/soundDesign'
import { applyFollowKeys, followObjectKeys } from '../../lib/objectTrack'
import { resumeAudio, syncAudioFx } from './audioGraph'
import { canFreeze, FREEZE_DUR, freezeSourceTime, frozenClipFrom, insertFreeze } from '../../lib/freezeFrame'
import { clipBeats, nextSnapTime, normalizeMarkers, toggleMarkerAt } from '../../lib/beats'
import { EMPTY_MARK, hasMarkRange, resolveGenerateTarget, setMark } from './motionTarget'
import { useMotionComp } from '../motion/useMotionComp'
import PaperCanvas from '../paper/PaperCanvas'
import PaperProps from '../paper/PaperProps'
import { usePaperComp } from '../paper/usePaperComp'
import { isPaperFoldClip, paperClipTarget, paperElementClipId, paperStateToTimeline, paperTimelineSig, PAPER_OBJECT_CLIP } from '../paper/paperTimeline'
import { hasContent as paperHasContent, selectedObject as paperSelectedObject } from '../paper/paperModel'
import { useExportJob } from './hooks/useExportJob'
import { useSubtitles } from './hooks/useSubtitles'
import { useFavorites } from './hooks/useFavorites'
import { snapshotTextStyle } from '../../lib/favorites'
import { createCanvasDownHandler } from './interactions'
import { kfSnap, normalizeFps, snapToFrame } from '../../lib/projectFps'
import { fmtRuler, tickStep } from './timelineScale'
import EdMaterial from './EdMaterial'
import { bustUrl } from './MaterialClipGrid'
import EdTimeline from './EdTimeline'
import EdTopBar from './EdTopBar'
import EdViewerTools from './EdViewerTools'
import EdInspector from './EdInspector'
import EdCrops from './EdCrops'
import AnchoredMenu from '../../components/AnchoredMenu'
import JobStatusBar from '../../components/JobStatusBar'
import { useEditorHistory } from './hooks/useEditorHistory'
import { usePanelLayout } from './hooks/usePanelLayout'
import './editor.css'

function EdSplit({ axis, kind, onDown, label }) {
  return (
    <div
      className={`ed-split ${axis}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      data-kind={kind}
      onPointerDown={onDown}
    />
  )
}

function clipWorkspaceTracks() {
  return [{ id: 'V1', kind: 'video', name: 'V1', hidden: false, muted: false, locked: false }]
}

function HiddenMedia({ clip, src, mediaEls, onLoadedMetadata }) {
  const id = clip.id
  const ref = useCallback((el) => {
    if (el) mediaEls.current.set(id, el)
    else mediaEls.current.delete(id)
  }, [id, mediaEls])
  if (clip.kind === 'image') {
    return <img alt="" loading="eager" decoding="async" src={src} ref={ref} onLoad={onLoadedMetadata} />
  }
  const mediaProps = { src, ref, preload: 'auto', onLoadedMetadata }
  // Motion: WebM con alfa → <video muted> (no lleva audio); se dibuja como overlay.
  if (clip.kind === 'video' || clip.kind === 'motion')
    return <video {...mediaProps} playsInline muted={clip.kind === 'motion'} />
  return <audio {...mediaProps} />
}

function shiftKfs(kfs, t0, t1) {
  const sorted = [...(kfs || [])].sort((a, b) => a.t - b.t)
  if (!sorted.length) return []
  const before = [...sorted].reverse().find((k) => k.t <= t0) || sorted[0]
  const after = sorted.find((k) => k.t >= t1) || sorted[sorted.length - 1]
  const mid = sorted.filter((k) => k.t > t0 && k.t < t1)
  const out = []
  const seen = new Set()
  for (const k of [before, ...mid, after]) {
    const t = Math.max(0, +(k.t - t0).toFixed(4))
    if (seen.has(t)) continue
    seen.add(t)
    out.push({ ...k, t })
  }
  return out
}

function reframeForCut(reframe, t0, t1) {
  if (!reframe) return null
  return {
    ...reframe,
    keyframes: shiftKfs(reframe.keyframes, t0, t1),
    ...(reframe.keyframes2?.length ? { keyframes2: shiftKfs(reframe.keyframes2, t0, t1) } : {}),
  }
}

// Modo libre: el ÚNICO modo de un clip visual desde que no existe "Fijar vídeo".
// El clip es un objeto suelto sobre el lienzo (se mueve, se escala y se recorta a
// mano, estilo CapCut). Todo lo que llegue en el layout antiguo — 'fill' (el propio
// "Fijar vídeo") o un overlay pegado a un hueco — se convierte al entrar.
// Excepción: el doble encuadre (dual_crop) parte el clip en dos mitades y eso un
// objeto libre no lo sabe hacer; esas timelines antiguas se dejan como están.
function needsFreeLayout(c) {
  if (!isVisualClip(c) || c.reframe?.dual_crop) return false
  return !(isOverlay(c) && (c.frame || 'free') === 'free')
}

// Instantes (tiempo LOCAL) en los que se muestrea el encuadre al hornear el corte:
// los extremos, los pose-keyframes y el paneo del encuadre — que vive en
// reframe.keyframes en tiempo de FUENTE (seguimiento de cara), así que se traduce.
function cutSampleTimes(clip, d) {
  const times = new Set([0, +d.toFixed(4)])
  for (const it of normalizeItems(clip.keyframes?.items)) {
    times.add(+clamp(it.t, 0, d).toFixed(4))
  }
  for (const k of clip.reframe?.keyframes || []) {
    const t = sourceToTimeline(clip, k.t) - (clip.start || 0)
    if (t >= 0 && t <= d) times.add(+t.toFixed(4))
  }
  return [...times].sort((a, b) => a - b)
}

// El recorte guardado (cx/cy/zoom) se hornea desde la MISMA fuente de verdad que
// el preview y el export, así "Guardar clip" siempre coincide con lo que se ve en
// pantalla: `freeFrameAt` para los clips en modo libre (todos, desde que no existe
// "Fijar vídeo") y `clipPropsAt` para los que aún conservan el encuadre antiguo.
// Muestrea en tiempo LOCAL (0 = inicio del corte = t de FFmpeg tras -ss); los
// tiempos NO se vuelven a desplazar.
function bakedReframeForCut(clip, dur, src, out) {
  const d = Math.max(0.1, dur)
  const free = isOverlay(clip) && src?.w > 0 && src?.h > 0
  const keyframes = cutSampleTimes(clip, d).map((t) => {
    const p = free
      ? freeFrameAt(clip, t, src.w, src.h, out.w, out.h)
      : clipPropsAt(clip, t)
    return {
      id: uid('k'),
      t,
      cx: +Number(p.cx ?? 0.5).toFixed(4),
      cy: +Number(p.cy ?? 0.5).toFixed(4),
      zoom: +Number(p.zoom ?? 1).toFixed(4),
      pan_mode: 'smooth',
    }
  })
  const rf = { ...(clip.reframe || {}), keyframes }
  delete rf.keyframes2
  // El corte se guarda ya recortado: la ventana de recorte del objeto libre no
  // debe viajar con él (si no, se aplicaría dos veces al reabrirlo).
  delete rf.crop_w
  delete rf.crop_h
  return rf
}

export default function VideoEditor({ project, onChange, onBack, onOpenJson }) {
  const [tracks, setTracks] = useState(defaultTracks())
  // Marcadores de la timeline (#12): [{ id, t, label?, color? }] en s de timeline.
  const [markers, setMarkers] = useState([])
  const [clips, setClips] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [pps, setPps] = useState(60)
  const [fps, setFps] = useState(30)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selClipId, setSelClipId] = useState(null)
  const [selClipIds, setSelClipIds] = useState([])
  const [selTrackId, setSelTrackId] = useState('V1')
  const [selKfId, setSelKfId] = useState(null)
  // Portapapeles de keyframes (Alt+C / Alt+V), independiente del de clips.
  const [kfBoard, setKfBoard] = useState(null)
  const [kfGroups, setKfGroups] = useState(KF_GROUP_IDS)
  const [matTab, setMatTab] = useState('video')
  const [mcpAudit, setMcpAudit] = useState({ entries: [], active: [] })

  const [outW, setOutW] = useState(720)
  const [outH, setOutH] = useState(1280)
  const [audioDb, setAudioDb] = useState(-14)
  const [previewVol, setPreviewVol] = useState(() => {
    try { return parsePreviewVolume(localStorage.getItem(PREVIEW_VOL_KEY)) }
    catch { return 1 }
  })
  // Alto de fila del timeline: Ctrl+rueda lo ajusta y se conserva entre sesiones.
  const [rowH, setRowH] = useState(() => readRowHeight(typeof localStorage === 'undefined' ? null : localStorage))
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    writeRowHeight(localStorage, rowH)
  }, [rowH])
  const panels = usePanelLayout()

  const [ctxMenu, setCtxMenu] = useState(null)      // { x, y, clip }
  // "Generar Motion": rango marcado con I / O, menú del hueco de pista/regla y el
  // tramo abierto en el modal. Solo en modo Main (la timeline del proyecto).
  const [markRange, setMarkRange] = useState(EMPTY_MARK)
  const markRangeRef = useRef(EMPTY_MARK); markRangeRef.current = markRange
  const [laneMenu, setLaneMenu] = useState(null)    // { x, y, time, track }
  const [stickMenu, setStickMenu] = useState(null)  // { x, y, time, trackId } — "Agregar Stick"
  // Extractor del Clip Editor: Z / X marcan inicio y fin (arrastrables en la
  // regla) y "Crear clip" guarda el tramo en Materiales por referencia. Estado
  // aparte del I/O de Main para que un rango no se cuele en el otro editor.
  const [clipMark, setClipMark] = useState(EMPTY_MARK)
  const clipMarkRef = useRef(EMPTY_MARK); clipMarkRef.current = clipMark
  const [segBusy, setSegBusy] = useState(false)
  const segBusyRef = useRef(false)
  // Modal "Crear clip": revisar título/descripción y confirmar; luego su progreso.
  const [segAsk, setSegAsk] = useState(null)
  const segAskRef = useRef(null); segAskRef.current = segAsk
  const [genMotion, setGenMotion] = useState(null)  // { start, end, playhead, explicit, clipId }
  const genMotionRef = useRef(null); genMotionRef.current = genMotion
  // "Generar recurso": modal rapido (mismo target que genMotion). Es la via por
  // defecto; el wizard largo (genMotion) solo se abre desde Direccion de escena.
  const [genResource, setGenResource] = useState(null)
  const genResourceRef = useRef(null); genResourceRef.current = genResource
  // "Dirección de escena": workspace de tramos del guion ({ focus }) y el tramo con el que
  // se abrió Generar Escena ({ segment, pack }). directionReload refresca la escaleta.
  const [directionWs, setDirectionWs] = useState(null)
  const directionWsRef = useRef(null); directionWsRef.current = directionWs
  const [genDirection, setGenDirection] = useState(null)
  const [directionReload, setDirectionReload] = useState(0)
  const [attrClipboard, setAttrClipboard] = useState(null)  // clip copiado con «Copiar atributos» (#13)
  const attrClipboardRef = useRef(null); attrClipboardRef.current = attrClipboard
  const [attrPaste, setAttrPaste] = useState(null)          // { ids }: diálogo «Pegar atributos» abierto
  const [trackMenu, setTrackMenu] = useState(null)  // { x, y, track }
  const [linkPick, setLinkPick] = useState(null)    // id de pista de audio al relacionar
  const [trackToDelete, setTrackToDelete] = useState(null)
  const [fragmentAsk, setFragmentAsk] = useState(null)
  // Soltar un clip justo encima de otro = intención de reemplazarlo: se confirma.
  const [replaceAsk, setReplaceAsk] = useState(null)
  const [dragInfo, setDragInfo] = useState(null)    // { kind, duration, name }
  const [framingMode, setFramingMode] = useState(null) // { trackId, x, y, w } o null
  const [mainColTab, setMainColTab] = useState('main')
  // Motion Studio como MODO nativo: estado de composición compartido; el timeline
  // real muestra las capas como clips (adapter en editorModel), el canvas central el
  // preview y el inspector las propiedades de la capa.
  const motion = useMotionComp(project?.id, { onReloadTimeline: () => reloadTimeline() })
  const motionRef = useRef(motion); motionRef.current = motion
  const motionModeRef = useRef(false)
  const motionControlsRef = useRef(null)
  const [motionTime, setMotionTime] = useState(0)
  const motionTimeRef = useRef(0)
  const [motionPlaying, setMotionPlaying] = useState(false)
  // Paper Animator, mismo esquema que Motion: estado en un hook, el canvas central
  // es su lienzo, el inspector sus propiedades y la timeline real proyecta su
  // animación (adapter en paper/paperTimeline). Antes vivía en un iframe + modal.
  const paper = usePaperComp(project?.id, {
    format: { width: outW, height: outH, fps },
    onUploaded: () => onChange?.(),
  })
  const paperRef = useRef(paper); paperRef.current = paper
  const paperModeRef = useRef(false)
  // Recortar (estilo CapCut): id del clip abierto en EdCropModal, o null.
  const [cropClipId, setCropClipId] = useState(null)
  // Zoom SOLO visual del canvas (aleja/acerca la vista para ver alrededor del encuadre).
  // No toca el clip ni el export. Independiente por editor (Main vs Clip).
  const [mainZoom, setMainZoom] = useState(1)
  // Marco de plataforma (TikTok / Shorts): solo vista previa sobre el canvas Main.
  // Guía de zona segura; no se exporta.
  const [platformOverlay, setPlatformOverlay] = useState('none')
  // Máscara: `maskMode` muestra y permite manipularla sobre el reproductor
  // (se enciende al abrir Video → Máscara); `maskDraw` es el pincel.
  const [maskMode, setMaskMode] = useState(false)
  const [maskDraw, setMaskDraw] = useState(false)
  // Eliminar fondo: pincel de corrección (op/tamaño/posición del cursor),
  // job del matte y catálogo de modelos. El chroma key no necesita estado:
  // es una propiedad del clip que el preview lee cada fotograma.
  // `tool`: 'smart' (pincel/borrador inteligente, SAM) o 'manual' (pinta tal cual).
  const [bgBrush, setBgBrush] = useState({ on: false, op: 'erase', tool: 'manual', size: 0.08, px: null, py: null })
  const [bgJob, setBgJob] = useState(null)
  const bgJobRef = useRef(null); bgJobRef.current = bgJob
  // "Exportar recorte": job que hornea el clip con el fondo eliminado a un WebM
  // transparente y lo añade al material (conserva la animación de vídeo/GIF).
  const [cutoutJob, setCutoutJob] = useState(null)
  // Eliminación personalizada (SAM): overlay con la selección del fotograma
  // marcado mientras se pinta con las herramientas, antes de "Aplicar".
  const magicRef = useRef({ on: false, clipId: null })
  const magicSeqRef = useRef({ sent: 0, shown: 0 })   // peticiones de selección
  const [magicBusy, setMagicBusy] = useState(false)
  const [bgStroking, setBgStroking] = useState(false)  // trazo en curso
  // Análisis de los fotogramas del clip en segundo plano (el «Procesando…» de
  // CapCut): arranca con la primera selección; Aplicar solo sigue la selección.
  const [bgAnalyze, setBgAnalyze] = useState(null)
  const bgAnalyzeRef = useRef(null); bgAnalyzeRef.current = bgAnalyze
  const bgAnalyzedRef = useRef(new Set())   // claves ya lanzadas en esta sesión
  const bgAliveRef = useRef(true)           // false al cerrar el editor
  const [bgInfo, setBgInfo] = useState({ providers: [], device: '' })
  const [chromaPick, setChromaPick] = useState(false)
  // Fondo de vista previa (solo preview): normal|checker|solid|media.
  const [bgPreview, setBgPreview] = useState({ mode: 'normal', color: '#3B82F6', kind: '' })
  const [clipZoom, setClipZoom] = useState(1)
  const viewZoom = mainColTab === 'clip' ? clipZoom : mainZoom
  const setViewZoom = mainColTab === 'clip' ? setClipZoom : setMainZoom
  const [savedLabel, setSavedLabel] = useState('')
  const [clipMeta, setClipMeta] = useState({
    title: '', description: '', url: '', segStart: 0, segEnd: 0, segIndex: null,
    existingIndex: null,
    // sourceIdent: material LOCAL del proyecto abierto tal cual (sin proxy): la
    // timeline del clip está en segundos de su archivo y "Crear clip" crea
    // segmentos por referencia. null = tramo de YouTube (proxy) → se renderiza.
    sourceIdent: null,
    preparing: false, prepProgress: 0, prepMsg: '', err: '',
  })
  const clipMetaRef = useRef(clipMeta); clipMetaRef.current = clipMeta
  const [clipSaveJob, setClipSaveJob] = useState(null)
  const [faceJob, setFaceJob] = useState(null)
  const [clipToast, setClipToast] = useState(null)

  const mainCanvasRef = useRef(null)
  const mainStageRef = useRef(null)
  const hitListRef = useRef([])
  const mediaEls = useRef(new Map())
  const rafRef = useRef(0)
  const playRef = useRef({ perf: 0, head: 0 })
  const mainTextBox = useRef(null)

  const playheadRef = useRef(0); playheadRef.current = playhead
  const playingRef = useRef(false); playingRef.current = playing
  const durationRef = useRef(0)
  const fpsRef = useRef(30); fpsRef.current = fps
  const clipsRef = useRef(clips); clipsRef.current = clips
  const markersRef = useRef(markers); markersRef.current = markers
  const tracksRef = useRef(tracks); tracksRef.current = tracks
  const selRef = useRef(selClipId); selRef.current = selClipId
  const selIdsRef = useRef(selClipIds); selIdsRef.current = selClipIds
  const selKfRef = useRef(selKfId); selKfRef.current = selKfId
  const kfBoardRef = useRef(kfBoard); kfBoardRef.current = kfBoard
  const kfOpsRef = useRef({})
  // Pluma (#14): trazado que se está dibujando ({ points: [[x, y] en 0–1 del cuadro] })
  // y edición de las anclas del trazado seleccionado. El puntero (hover) va en un
  // ref: el preview se redibuja solo en cada fotograma.
  const [pen, setPen] = useState(null)
  const penRef = useRef(null); penRef.current = pen
  const penHoverRef = useRef(null)
  const [pathEdit, setPathEdit] = useState(false)
  const pathEditRef = useRef(false); pathEditRef.current = pathEdit
  const penOpsRef = useRef({})
  // Seguimiento (#15): {followerId, videoId} mientras se dibuja el recuadro del
  // objeto; el recuadro en curso (px del canvas) va en un ref.
  const [trackPick, setTrackPick] = useState(null)
  const trackPickRef = useRef(null); trackPickRef.current = trackPick
  const trackBoxRef = useRef(null)
  const [trackRun, setTrackRun] = useState(null)      // {progress, message} con el job en marcha
  const [trackMode, setTrackMode] = useState('position_scale')
  // Sonorizar con IA (#17): job en marcha y propuestas a revisar.
  const [soundBusy, setSoundBusy] = useState(null)       // clipId mientras piensa la IA
  const [soundResult, setSoundResult] = useState(null)   // {clipId, sounds, missing, mode}
  const kfGroupsRef = useRef(kfGroups); kfGroupsRef.current = kfGroups
  const pendingKfSel = useRef(null)
  const clipClipboardRef = useRef(null)   // [{ clip, offset }] copiados con Ctrl+C
  const outRef = useRef({ w: outW, h: outH }); outRef.current = { w: outW, h: outH }
  const framingModeRef = useRef(null); framingModeRef.current = framingMode
  const maskModeRef = useRef(false); maskModeRef.current = maskMode
  const maskDrawRef = useRef(false); maskDrawRef.current = maskDraw
  const bgBrushRef = useRef(bgBrush); bgBrushRef.current = bgBrush
  const bgPreviewRef = useRef(bgPreview); bgPreviewRef.current = bgPreview
  const bgPreviewElRef = useRef(null)   // <img>/<video> del fondo de reemplazo
  const bgPreviewUrlRef = useRef('')    // objectURL a revocar al reemplazar
  const chromaPickRef = useRef(false); chromaPickRef.current = chromaPick
  const viewZoomRef = useRef(1); viewZoomRef.current = viewZoom
  const platformOverlayRef = useRef('none'); platformOverlayRef.current = platformOverlay
  const previewVolRef = useRef(previewVol); previewVolRef.current = previewVol
  const alignGuidesRef = useRef(null)
  const clipModeRef = useRef(false)
  const projectTlRef = useRef(null)
  const clipTlRef = useRef(null)
  const prepGen = useRef(0)
  const faceGen = useRef(0)
  const clipSaveCtxRef = useRef(null)
  const clipSaveHandledRef = useRef(null)

  const duration = clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  durationRef.current = duration
  const selectedClip = clips.find((c) => c.id === selClipId) || null
  const histSnap = useMemo(() => ({ tracks, clips, markers }), [tracks, clips, markers])
  const hist = useEditorHistory(histSnap, loaded)
  const histRef = useRef(hist)
  histRef.current = hist
  const mcpBusyIds = useMemo(
    () => mcpBusyClipIds(mcpAudit.active, mcpAudit.entries, clips),
    [mcpAudit, clips],
  )
  const layerInfo = selectedClip && canLayerClip(selectedClip) ? clipLayerInfo(clips, selectedClip.id) : null
  const outAspect = outW / outH

  function markKf(clip, t) {
    const id = keyframeIdAt(clip, t, fpsRef.current)
    if (id) pendingKfSel.current = id
  }
  function upsertKf(clip, t, patch, interpolation) {
    return upsertKeyframeAt(clip, t, patch, interpolation, fpsRef.current)
  }

  useLayoutEffect(() => {
    const id = pendingKfSel.current
    if (id == null) return
    pendingKfSel.current = null
    if (selKfRef.current !== id) setSelKfId(id)
  }, [clips])

  useEffect(() => { ensureEditorFonts() }, [])

  // --- Carga inicial ---
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const tl = await getTimeline(project.id)
        if (!alive) return
        if (tl && tl.tracks && tl.tracks.length) {
          setTracks(tl.tracks)
          setClips((tl.clips || []).map((c) => ({
            ...c,
            reframe: isVisualClip(c) ? withKfIds(c.reframe || newReframe()) : null,
            appear: c.appear || 'none',
            exit: c.exit || 'none',
            look: c.look || 'none',
            effects: c.effects && typeof c.effects === 'object' ? c.effects : {},
            audio_fx: c.audio_fx && typeof c.audio_fx === 'object' ? c.audio_fx : {},
            muted: !!c.muted,
            speed: c.speed,
            keep_pitch: true,
            reverse: !!c.reverse,
            speed_curve: c.speed_curve || null,
            frame: c.frame || (c.layout === 'overlay' ? 'free' : 'full'),
            ...(c.kind === 'text' ? { text_role: textRole(c) } : {}),
          })))
          if (tl.tracks[0]) setSelTrackId(tl.tracks[0].id)
        }
        setMarkers(normalizeMarkers(tl?.markers))
        if (tl?.width) setOutW(tl.width)
        if (tl?.height) setOutH(tl.height)
        if (tl?.audio_target_db != null) setAudioDb(tl.audio_target_db)
        // FPS por proyecto: el de la timeline guardada. El de Configuración→Exportar
        // solo es el predeterminado de un proyecto sin timeline todavía.
        if (tl?.fps) setFps(normalizeFps(tl.fps))
        else {
          try {
            const s = await getSettings()
            if (alive) setFps(normalizeFps(s?.export?.fps))
          } catch { /* deja 30 */ }
        }
      } catch { /* vacía */ } finally {
        if (alive) setLoaded(true)
      }
    })()
    return () => { alive = false }
  }, [project.id])

  // Clips viejos traían keep_pitch:false (el preview nunca lo aplicaba).
  // Una vez: alinear al Resultado (preservesPitch / atempo).
  useEffect(() => {
    if (!loaded) return
    setClips((cs) => {
      if (!cs.some((c) => c.keep_pitch === false)) return cs
      return cs.map((c) => (c.keep_pitch === false ? { ...c, keep_pitch: true } : c))
    })
  }, [loaded, project.id])

  // --- Autoguardado ---
  const timelinePayload = useCallback(() => ({
    version: 1, schema_version: TIMELINE_SCHEMA_VERSION, fps, width: outW, height: outH, audio_target_db: audioDb, tracks, clips, markers,
  }), [fps, outW, outH, audioDb, tracks, clips, markers])

  function setListenVolume(v) {
    const n = parsePreviewVolume(v)
    setPreviewVol(n)
    previewVolRef.current = n
    try { localStorage.setItem(PREVIEW_VOL_KEY, String(n)) } catch { /* noop */ }
  }

  // OJO: solo se autoguarda en modo Main. En Clip, Motion y Paper, `tracks`/`clips`
  // NO son la timeline del proyecto (son el tramo del clip, las capas de la
  // composición convertidas a clips por motionLayersToTimeline, o la animación de
  // papel por paperStateToTimeline): guardarlas aquí sobrescribiría el proyecto
  // entero con el contenido de esos editores.
  useEffect(() => {
    if (!loaded || clipModeRef.current || motionModeRef.current || paperModeRef.current) return
    const id = setTimeout(() => {
      saveTimeline(project.id, timelinePayload()).catch(() => {})
      setSavedLabel('Guardado')
    }, 800)
    return () => clearTimeout(id)
  }, [timelinePayload, loaded, project.id])

  // Todo clip visual acaba en modo libre en cuanto su medio tiene dimensiones,
  // venga de donde venga (material, arrastre, timeline guardada, tramo preparado).
  // No depende del evento de carga: los clips que ya tenían el medio en memoria
  // también pasan por aquí. `applyFreeLayout` los deja en overlay+free → no reentra.
  useEffect(() => {
    if (!clips.some((c) => needsFreeLayout(c))) return
    for (const c of clips) {
      if (!needsFreeLayout(c)) continue
      const el = mediaEls.current.get(c.id)
      if (mediaSize(el).h) applyFreeLayout(c, el)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips])

  // Al cambiar de clip seleccionado se sale del modo "Recortar" (evita quedar
  // recortando un clip distinto por error).

  // Recarga el timeline desde el servidor (tras ediciones de la IA por el MCP).
  // Reutiliza el MISMO mapeo que la carga inicial → no hay segundo estado.
  const reloadTimeline = useCallback(async () => {
    try {
      const tl = await getTimeline(project.id)
      if (!tl) return
      const nextTracks = tl.tracks || []
      const nextClips = (tl.clips || []).map((c) => ({
        ...c,
        reframe: isVisualClip(c) ? withKfIds(c.reframe || newReframe()) : null,
        appear: c.appear || 'none',
        exit: c.exit || 'none',
        look: c.look || 'none',
        effects: c.effects && typeof c.effects === 'object' ? c.effects : {},
        audio_fx: c.audio_fx && typeof c.audio_fx === 'object' ? c.audio_fx : {},
        muted: !!c.muted,
        speed: c.speed,
        keep_pitch: c.keep_pitch !== false,
        reverse: !!c.reverse,
        speed_curve: c.speed_curve || null,
        frame: c.frame || (c.layout === 'overlay' ? 'free' : 'full'),
        ...(c.kind === 'text' ? { text_role: textRole(c) } : {}),
      }))
      // En Clip/Motion/Paper el editor muestra OTRA timeline: volcar aquí la del proyecto
      // la pisaría (es lo que hacía que Motion Studio "saltara" al editor principal
      // al terminar "Agregar al proyecto" o un reload del chat IA). Se refresca el
      // snapshot para que al volver a "Main" ya aparezca actualizada.
      if (clipModeRef.current || motionModeRef.current || paperModeRef.current) {
        const prev = projectTlRef.current
        if (prev) {
          projectTlRef.current = {
            ...prev,
            tracks: nextTracks,
            clips: nextClips,
            markers: normalizeMarkers(tl.markers),
            outW: tl.width || prev.outW,
            outH: tl.height || prev.outH,
          }
        }
        return nextClips
      }
      setTracks(nextTracks)
      setClips(nextClips)
      setMarkers(normalizeMarkers(tl.markers))
      if (tl.width) setOutW(tl.width)
      if (tl.height) setOutH(tl.height)
      if (tl.fps) setFps(normalizeFps(tl.fps))
      return nextClips
    } catch { /* si falla, deja el estado actual */ }
    return null
  }, [project.id])

  // --- Selección de capa / clip superior ---
  const layerOf = useCallback((trackId) => {
    const vids = tracksRef.current.filter((t) => t.kind === 'video')
    return vids.findIndex((t) => t.id === trackId)
  }, [])
  const topVideoAt = useCallback((head) => {
    let best = null, bestLayer = -1
    for (const c of clipsRef.current) {
      if (!isVisualClip(c) || c.disabled) continue
      const track = tracksRef.current.find((t) => t.id === c.track_id)
      if (!track || track.hidden) continue
      if (head >= c.start - 0.02 && head < clipEnd(c)) {
        const l = layerOf(c.track_id)
        if (l >= bestLayer) { bestLayer = l; best = c }
      }
    }
    return best
  }, [layerOf])

  // --- Motor rAF: canvas compuesto + reproducción ---
  useEffect(() => {
    const env = {
      clipsRef, tracksRef, mediaEls, outRef, selRef, selIdsRef, selKfRef,
      playingRef, framingModeRef, mainCanvasRef, mainStageRef, mainTextBox, topVideoAt, alignGuidesRef,
      clipModeRef, fpsRef, hitListRef, viewZoomRef,
      maskModeRef, maskDrawRef, bgBrushRef, bgPreviewRef, bgPreviewElRef, magicRef,
      platformOverlayRef, penRef, penHoverRef, pathEditRef, trackBoxRef,
    }
    const tick = () => {
      const total = clipsRef.current.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
      let head = playheadRef.current
      if (playingRef.current) {
        head = playRef.current.head + (performance.now() - playRef.current.perf) / 1000
        if (head >= total) { head = total; stopPlayback() }
        playheadRef.current = head
        setPlayhead(head)
      }
      const fpsNow = fpsRef.current
      const drawHead = previewHead(head, total, fpsNow)

      for (const c of clipsRef.current) {
        const el = mediaEls.current.get(c.id)
        if (!el || c.kind === 'image' || typeof el.play !== 'function') continue
        const track = tracksRef.current.find((t) => t.id === c.track_id)
        const cd = clipDur(c)
        const active = drawHead >= c.start - 0.02 && drawHead < c.start + cd
        const expected = safeMediaTime(
          el,
          clamp(timelineToSource(c, drawHead), c.in_point, c.out_point),
          fpsNow,
        )
        const holdLast = Number.isFinite(el.duration) && el.duration > 0
          && expected >= el.duration - 0.04 - 1e-4
        const mutedNow = !active || clipPlaybackMuted(c, track)
        // Efectos y filtros de sonido (#16): Web Audio solo si el clip lleva alguno.
        syncAudioFx(el, c, Math.max(0, drawHead - (c.start || 0)))
        syncPreviewMedia(el, {
          muted: mutedNow,
          volume: previewElementVolume(
            clipVolumeAt(c, Math.max(0, drawHead - (c.start || 0))),
            previewVolRef.current,
            mutedNow,
          ),
        })
        if (active && playingRef.current && !holdLast) {
          if (c.reverse) {
            if (!el.paused) el.pause()
            if (Math.abs(el.currentTime - expected) > 0.04) { try { el.currentTime = expected } catch { /* noop */ } }
          } else {
            syncPreviewMedia(el, { playbackRate: clipSpeed(c) })
            try {
              const keep = clipKeepPitch(c)
              if ('preservesPitch' in el && el.preservesPitch !== keep) el.preservesPitch = keep
              else if ('mozPreservesPitch' in el && el.mozPreservesPitch !== keep) el.mozPreservesPitch = keep
              else if ('webkitPreservesPitch' in el && el.webkitPreservesPitch !== keep) el.webkitPreservesPitch = keep
            } catch { /* noop */ }
            if (el.paused) { try { el.currentTime = expected } catch { /* noop */ }; el.play().catch(() => {}) }
            else if (Math.abs(el.currentTime - expected) > 0.35) { try { el.currentTime = expected } catch { /* noop */ } }
          }
        } else if (active) {
          if (!el.paused) el.pause()
          if (Math.abs(el.currentTime - expected) > 0.04) { try { el.currentTime = expected } catch { /* noop */ } }
        } else if (!el.paused) {
          el.pause()
        }
      }

      // Sincronizar fotogramas de todos los vídeos activos (fill + overlays)
      if (!playingRef.current) {
        for (const c of videosAt(drawHead, clipsRef.current, tracksRef.current)) {
          if (c.kind === 'image') continue
          const el = mediaEls.current.get(c.id)
          if (el && el.videoWidth) {
            const expected = safeMediaTime(
              el,
              clamp(timelineToSource(c, drawHead), c.in_point, c.out_point),
              fpsNow,
            )
            if (Math.abs(el.currentTime - expected) > 0.06) { try { el.currentTime = expected } catch { /* noop */ } }
          }
        }
      }

      drawMainView(drawHead, env)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topVideoAt])

  // --- Transporte ---
  function playPlayback() {
    const dur = durationRef.current
    if (dur <= 0) return
    resumeAudio()   // gesto del usuario: el contexto de Web Audio puede arrancar
    let head = playheadRef.current
    if (head >= dur - 0.02) head = 0
    playRef.current = { perf: performance.now(), head }
    setPlayhead(head)
    setPlaying(true)
  }
  function stopPlayback() {
    setPlaying(false)
    for (const el of mediaEls.current.values()) {
      if (typeof el.pause === 'function' && !el.paused) el.pause()
    }
  }
  function togglePlay() { if (playingRef.current) stopPlayback(); else playPlayback() }
  function seek(t) {
    const nt = clamp(t, 0, Math.max(0, durationRef.current))
    playheadRef.current = nt
    setPlayhead(nt)
    if (playingRef.current) playRef.current = { perf: performance.now(), head: nt }
  }
  function scrub(t) {
    if (playingRef.current) stopPlayback()
    const nt = clamp(t, 0, Math.max(0, durationRef.current, Number(t) || 0))
    playheadRef.current = nt
    setPlayhead(nt)
  }
  function nudgePlayhead(dt) {
    seek(playheadRef.current + dt)
  }

  // Pantalla completa del reproductor: fullscreen sobre la columna central
  // (canvas + transporte) para conservar los controles. Esc sale.
  function toggleFullscreen() {
    const col = mainStageRef.current?.closest('.ed-canvas-col')
    if (!col) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else col.requestFullscreen?.().catch(() => {})
  }
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function snapshotTl() {
    return {
      tracks, clips, markers, playhead, selClipId, selClipIds, selTrackId, selKfId, pps,
      outW, outH,  // formato de salida: independiente por editor (Main vs Clip)
    }
  }
  function applyTl(s) {
    if (!s) return
    setTracks(s.tracks)
    setClips(s.clips)
    setMarkers(s.markers || [])
    setPlayhead(s.playhead)
    playheadRef.current = s.playhead
    setSelClipId(s.selClipId)
    setSelClipIds(s.selClipIds || [])
    setSelTrackId(s.selTrackId)
    setSelKfId(s.selKfId)
    setPps(s.pps)
    if (s.outW) setOutW(s.outW)
    if (s.outH) setOutH(s.outH)
  }
  function applyEmptyClipTl() {
    setTracks(clipWorkspaceTracks())
    setClips([])
    setMarkers([])
    setPlayhead(0)
    playheadRef.current = 0
    setSelTrackId('V1')
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
  }
  // Aplica una composición de motion como timeline (capas → clips), reusando EdTimeline.
  function applyMotionTimeline(c) {
    const { tracks: mt, clips: mc } = c ? motionLayersToTimeline(c) : { tracks: [], clips: [] }
    setTracks(mt)
    setClips(mc)
    setMarkers([])
    setPlayhead(0)
    playheadRef.current = 0
    setSelTrackId(mt[0]?.id || null)
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
  }
  // Las pestañas de Motion Studio y Paper Animator tienen SU pestaña de material
  // (Motion / Paper); Main y Clip trabajan con las pestañas normales. Al cambiar
  // de workspace se sincroniza el material: entrar en un estudio abre su tab, y
  // volver a Main/Clip saca de esas tabs (a Video) — así no queda el material
  // mostrando Motion/Paper mientras se edita el vídeo, ni al revés.
  const backToMaterialTab = () => setMatTab((t) => (t === 'motion' || t === 'paper' ? 'video' : t))
  function goMainTab() {
    if (mainColTab === 'main') return
    if (!projectTlRef.current) return
    stopPlayback()
    if (mainColTab === 'clip') clipTlRef.current = snapshotTl()
    applyTl(projectTlRef.current)
    clipModeRef.current = false
    motionModeRef.current = false
    paperModeRef.current = false
    paper.setActive(false)
    hist.reset()
    setLinkPick(null)
    setMainColTab('main')
    backToMaterialTab()
  }
  function goClipTab() {
    if (mainColTab === 'clip') return
    stopPlayback()
    if (mainColTab === 'main') projectTlRef.current = snapshotTl()
    clipModeRef.current = true
    motionModeRef.current = false
    paperModeRef.current = false
    paper.setActive(false)
    hist.reset()
    setLinkPick(null)
    setMainColTab('clip')
    backToMaterialTab()
    if (clipTlRef.current) applyTl(clipTlRef.current)
    else applyEmptyClipTl()
  }
  // Volver a Main desde un estudio (Motion/Paper) cuando el material cambia a una
  // pestaña normal: sirve para que elegir "Video/Imagen/Audio…" saque del estudio.
  function leaveStudioForMaterial() {
    if (mainColTab === 'motion' || mainColTab === 'paper') goMainTab()
  }
  async function goMotionTab(compId = null) {
    stopPlayback()
    // Preserva la timeline del editor donde estemos para poder volver.
    if (mainColTab === 'main') projectTlRef.current = snapshotTl()
    else if (mainColTab === 'clip') clipTlRef.current = snapshotTl()
    setLinkPick(null)
    clipModeRef.current = false
    motionModeRef.current = true
    paperModeRef.current = false
    paper.setActive(false)
    hist.reset()
    setMainColTab('motion')
    setMatTab('motion')
    let c = motion.comp
    if (compId) c = await motion.loadComp(compId)
    applyMotionTimeline(c)
  }
  function goMotionBlank() {
    // Volver a la pantalla inicial de creación (sin composición cargada).
    motion.close()
    applyMotionTimeline(null)
  }

  // Motion tiene UN solo reloj: el del preview (iframe). La timeline pinta
  // `motionTime` y sus clics/scrub/teclas mueven el preview. Antes la timeline
  // usaba `playhead`/`seek` del vídeo: la línea roja y el preview iban cada uno
  // por su lado. Solo usan refs y setters estables → válidas desde el keydown.
  function motionSeek(t) {
    const c = motionControlsRef.current
    if (!c) return
    if (c.isPlaying()) { c.pause(); setMotionPlaying(false) }
    c.seek(clamp(Number(t) || 0, 0, motionRef.current.comp?.duration || 0))
  }
  function motionTogglePlay() {
    const c = motionControlsRef.current
    if (!c) return
    if (c.isPlaying()) { c.pause(); setMotionPlaying(false) }
    else { c.setLoop(true); c.play(); setMotionPlaying(true) }
  }

  // "Generar recurso": tramo = rango I/O si está marcado; si no, el instante del
  // clic + 5 s. Se guarda la timeline antes de abrir porque el backend construye
  // el contexto (guion, elementos del tramo, notas) desde la versión guardada.
  //
  // Es el camino normal desde el editor. El wizard largo (GenerateSceneModal, en
  // `genMotion`) ya no se abre desde aquí: solo desde Dirección de escena, cuando
  // se dirige el guion entero tramo a tramo.
  async function openGenerateResource({ time, clip } = {}) {
    setCtxMenu(null)
    setLaneMenu(null)
    if (clipModeRef.current || motionModeRef.current || paperModeRef.current) return
    const target = resolveGenerateTarget({
      mark: markRangeRef.current,
      time: Number.isFinite(time) ? time : playheadRef.current,
      clip,
    })
    stopPlayback()
    seek(target.start)
    try { await saveTimeline(project.id, timelinePayload()) } catch { /* se usa lo último guardado */ }
    setGenResource(target)
  }

  // "Dirección de escena": abre la escaleta enfocada en el rango marcado (o en el tramo
  // bajo el cursor). Se guarda la timeline antes: el backend lee subtítulos y clips de ahí.
  async function openSceneDirection({ time } = {}) {
    setCtxMenu(null)
    setLaneMenu(null)
    if (clipModeRef.current || motionModeRef.current || paperModeRef.current) return
    stopPlayback()
    const mark = markRangeRef.current
    const t = Number.isFinite(time) ? time : playheadRef.current
    const focus = hasMarkRange(mark)
      ? { start: mark.in, end: mark.out, explicit: true }
      : { start: t, end: t, explicit: false }
    try { await saveTimeline(project.id, timelinePayload()) } catch { /* se usa lo último guardado */ }
    setDirectionWs({ focus })
  }

  function generateFromDirection(segment, pack) {
    setGenDirection({ segment, pack })
    setGenMotion({ start: segment.start, end: segment.end, playhead: segment.start, explicit: true, clipId: null })
  }

  // "Agregar al timeline" desde el modal de Generar Motion: guarda la timeline,
  // lanza el job de inserción (renderiza + coloca el clip motion), recarga y
  // selecciona el clip nuevo con el cursor a su inicio.
  async function addMotionDraftToTimeline({ draftId, target }) {
    if (!draftId) return
    if (clipModeRef.current || motionModeRef.current || paperModeRef.current) return
    setClipToast({ type: 'info', message: 'Insertando motion…' })
    try {
      try { await saveTimeline(project.id, timelinePayload()) } catch { /* usa lo guardado */ }
      let job = await addMotionToTimeline(project.id, draftId,
        { start: target.start, end: target.end, mode: 'add' })
      while (job.status !== 'done' && job.status !== 'error') {
        await new Promise((r) => setTimeout(r, 400))
        job = await getJob(job.id)
        setClipToast({ type: 'info', message: job.message || 'Insertando motion…' })
      }
      if (job.status === 'error') {
        setClipToast({ type: 'error', message: job.error || 'No se pudo insertar el motion.' })
        return
      }
      onChange?.()          // el motion es ahora un vídeo del material: refresca Materiales
      await reloadTimeline()
      const info = job.motion_add
      if (info?.clip_id) {
        setSelTrackId(info.track_id)
        setSelClipId(info.clip_id)
        setSelClipIds([info.clip_id])
        if (Number.isFinite(info.start)) seek(info.start)
      }
      if (target?.directionId && info?.clip_id) {
        patchDirectionSegment(project.id, target.directionId, { status: 'placed', placed_clip_id: info.clip_id })
          .then(() => setDirectionReload((n) => n + 1)).catch(() => {})
      }
      setClipToast({ type: 'success', message: 'Motion añadido como vídeo (editable) a la timeline' })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo insertar el motion.' })
    }
  }

  // Proyecta el estado de Paper Animator como timeline (objeto + keyframes →
  // pista/clip), reusando EdTimeline igual que hace Motion.
  function applyPaperTimeline(st) {
    const { tracks: pt, clips: pc } = paperStateToTimeline(st)
    setTracks(pt)
    setClips(pc)
    setPlayhead(0)
    playheadRef.current = 0
    // El clip del objeto seleccionado (la imagen o un elemento de texto) va
    // seleccionado de entrada: EdTimeline solo dibuja los keyframes del clip
    // seleccionado.
    const sel = pc.find((c) => c.id === paperSelectedClipId(st)) || pc[0]
    setSelTrackId(sel?.track_id || pt[0]?.id || null)
    setSelClipId(sel?.id || null)
    setSelClipIds(sel ? [sel.id] : [])
    setSelKfId(null)
  }

  function paperSelectedClipId(st) {
    return st.selected === 'image' ? PAPER_OBJECT_CLIP : paperElementClipId(st.selected)
  }

  function goPaperTab() {
    if (mainColTab === 'paper') return
    stopPlayback()
    if (mainColTab === 'main') projectTlRef.current = snapshotTl()
    else if (mainColTab === 'clip') clipTlRef.current = snapshotTl()
    setLinkPick(null)
    clipModeRef.current = false
    motionModeRef.current = false
    paperModeRef.current = true
    hist.reset()
    setMainColTab('paper')
    setMatTab('paper')
    paper.setActive(true)
    applyPaperTimeline(paper.raw)
  }

  // Carga una imagen del material en Paper Animator y le prepara una animación
  // simple de entrada (open), salida (close) o ambas. Es el "Generar Paper
  // Animation" del menú contextual de una imagen.
  async function generatePaperFromImage(image, mode = 'both') {
    if (!image) return
    goPaperTab()
    setMatTab('paper')
    await paper.loadImage(
      bustUrl(image.url, image),
      image.label || image.name || image.filename,
      { asset_id: String(image.id), filename: image.filename },
    )
    paper.patchMany({
      'object.animation.mode': 'simple',
      'object.animation.simple.open': mode !== 'close',
      'object.animation.simple.close': mode !== 'open',
    })
  }

  // Sync estado → TIMELINE. Se re-deriva por FIRMA (duración, modo, keyframes),
  // no en cada cambio de propiedad: tocar el slider de la sombra no tiene por qué
  // rehacer las pistas.
  const paperSigRef = useRef('')
  useEffect(() => {
    if (!paperModeRef.current) { paperSigRef.current = ''; return }
    const sig = paperTimelineSig(paper.raw)
    if (sig === paperSigRef.current) return
    paperSigRef.current = sig
    const { tracks: pt, clips: pc } = paperStateToTimeline(paper.raw)
    setTracks(pt)
    setClips(pc)
    // Lo seleccionado en Paper (lienzo, lista de letras) manda sobre la timeline.
    const sel = pc.find((c) => c.id === paperSelectedClipId(paper.raw))
    setSelTrackId((cur) => sel?.track_id || (pt.some((t) => t.id === cur) ? cur : (pt[0]?.id || null)))
    setSelClipId((cur) => sel?.id || (pc.some((c) => c.id === cur) ? cur : (pc[0]?.id || null)))
    setSelClipIds((cur) => {
      if (sel) return [sel.id]
      const keep = cur.filter((id) => pc.some((c) => c.id === id))
      return keep.length ? keep : (pc[0] ? [pc[0].id] : [])
    })
  }, [paper.raw])

  // Sync reloj de Paper → cabezal. Solo se escribe el REF: el valor que se PINTA
  // se pasa directamente a EdTimeline (`paperMode ? paper.time : playhead`). Si
  // además hiciéramos setPlayhead, cada fotograma re-renderizaría el editor entero
  // dos veces en vez de una.
  useEffect(() => {
    if (!paperModeRef.current) return
    playheadRef.current = paper.time
  }, [paper.time])

  // --- Handlers de la timeline en modo Paper --------------------------------
  // EdTimeline es genérico: habla de clips y keyframes. Aquí se traduce a las
  // acciones de Paper Animator, y lo que no aplica (cortar, duplicar, arrastrar
  // material, pistas nuevas) llega como `undefined` y la barra lo deshabilita.
  const paperMode = mainColTab === 'paper'
  const motionMode = mainColTab === 'motion'

  // Estirar el clip del objeto = cambiar la duración de la animación.
  // Las bandas de papel (apertura/cierre) tienen tiempos fijos: se ignoran.
  function paperMutateClip(clipId, patch) {
    if (isPaperFoldClip(clipId)) return
    if (!paperClipTarget(clipId)) return
    const span = Number(patch?.out_point) - Number(patch?.in_point ?? 0)
    if (Number.isFinite(span) && span > 0) paper.setDuration(span)
  }

  // Cada clip lleva los keyframes de SU object: se selecciona antes de moverlo
  // (las dos escrituras van en orden en la misma cola de React).
  function paperMoveKeyframe(clipId, kfId, t) {
    const target = paperClipTarget(clipId)
    if (!target) return
    if (target !== paper.raw.selected) paper.select(target)
    paper.moveKeyframe(kfId, t)
  }

  function paperSelectClip(clip, e) {
    handleSelectClip(clip, e)
    const target = paperClipTarget(clip?.id)
    if (target) paper.select(target)
  }

  // El botón "+" de la timeline añade un keyframe; en modo simple no hay
  // keyframes, así que primero cambia a avanzado (es lo que el usuario quiere al
  // pulsarlo).
  function paperAddKf() {
    if (paper.st.object.animation.mode !== 'advanced') {
      paper.patch('object.animation.mode', 'advanced')
      return
    }
    paper.addKeyframe()
  }

  function paperDeleteKf() {
    const id = paper.st.object.animation.activeKeyframeId
    if (id) paper.removeKeyframe(id)
  }

  // Borrar en la timeline de Paper: el clip del objeto quita la imagen entera
  // (con sus transformaciones y su animación); las bandas de papel apagan su
  // animación. La selección la limpia el efecto que re-deriva las pistas, porque
  // el clip deja de existir en la proyección.
  function paperDeleteClip(clipId) {
    const ids = clipId ? [clipId] : selIdsRef.current
    for (const id of ids) paper.removeTimelineClip(id)
  }

  // Sync TIMELINE → composición: al mover/estirar un clip en modo motion, actualiza
  // start/end de la capa (el preview se reconstruye). Guardado por comparación (sin bucle).
  useEffect(() => {
    if (!motionModeRef.current) return
    const c = motionRef.current.comp
    if (!c) return
    let changed = false
    const layers = c.layers.map((l) => {
      const clip = clips.find((cl) => cl.id === l.id)
      if (!clip) return l
      const { start, end } = motionClipTiming(clip)
      const curEnd = l.end == null ? c.duration : l.end
      if ((l.start || 0) !== start || curEnd !== end) { changed = true; return { ...l, start, end } }
      return l
    })
    if (changed) motionRef.current.applyTiming(layers)
  }, [clips])

  // Sync composición → TIMELINE: cuando cambia el CONJUNTO de capas (añadir/quitar),
  // re-deriva los clips. Solo estructura (los tiempos van por el efecto de arriba).
  const motionLayerIdsRef = useRef('')
  useEffect(() => {
    if (!motionModeRef.current) { motionLayerIdsRef.current = ''; return }
    const ids = (motion.comp?.layers || []).map((l) => l.id).join(',')
    if (ids !== motionLayerIdsRef.current) {
      motionLayerIdsRef.current = ids
      const { tracks: mt, clips: mc } = motion.comp ? motionLayersToTimeline(motion.comp) : { tracks: [], clips: [] }
      setTracks(mt)
      setClips(mc)
    }
  }, [motion.comp])

  // Vídeo local del proyecto: se abre el archivo ORIGINAL directamente (sin
  // transcodificar un proxy de todo el vídeo). Así la timeline del clip está en
  // segundos del archivo, que es justo lo que guardan los segmentos por referencia.
  function openDirectSource(url, dur, title) {
    ++prepGen.current
    const span = Math.max(0.3, Number(dur) || 1)
    const clip = {
      ...makeClip('clips', {
        index: `local-${Date.now()}`,
        filename: '',
        label: title || 'Vídeo',
        start: 0,
        end: span,
      }, 'V1', 0, span),
      media_url: url,
      source_url: url,
    }
    setClips([clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
    setSelTrackId('V1')
    setClipMeta((m) => ({ ...m, preparing: false, prepMsg: '', err: '' }))
  }

  async function startClipPrepare(url, start, end, title) {
    const gen = ++prepGen.current
    setClipMeta((m) => ({ ...m, preparing: true, prepProgress: 0.04, prepMsg: 'Preparando el tramo…', err: '' }))
    try {
      let job = await prepareReframe({ url, start, end, track_faces: false })
      while (job.status !== 'done' && job.status !== 'error') {
        if (prepGen.current !== gen) return
        await new Promise((r) => setTimeout(r, 400))
        job = await getJob(job.id)
        if (prepGen.current !== gen) return
        setClipMeta((m) => ({
          ...m,
          prepProgress: job.progress || 0.04,
          prepMsg: job.message || 'Preparando el tramo…',
        }))
      }
      if (prepGen.current !== gen) return
      if (job.status === 'error' || !job.reframe_prep) {
        setClipMeta((m) => ({ ...m, preparing: false, err: job.error || 'No se pudo preparar el tramo.' }))
        return
      }
      const prep = job.reframe_prep
      const dur = Math.max(0.3, prep.duration || (end - start))
      const clip = {
        ...makeClip('clips', {
          index: `yt-${Date.now()}`,
          filename: 'proxy.mp4',
          label: title || `Tramo`,
          start: 0,
          end: dur,
        }, 'V1', 0, dur),
        media_url: prep.proxy_url,
        source_url: url,
      }
      if (prep.keyframes?.length) {
        clip.reframe = withKfIds({ ...newReframe(), keyframes: prep.keyframes })
      }
      setClips([clip])
      setSelClipId(clip.id)
      setSelClipIds([clip.id])
      setSelTrackId('V1')
      setPlayhead(0)
      playheadRef.current = 0
      setClipMeta((m) => ({ ...m, preparing: false, prepMsg: '', err: '' }))
    } catch (e) {
      if (prepGen.current !== gen) return
      setClipMeta((m) => ({ ...m, preparing: false, err: e.message || 'No se pudo preparar el tramo.' }))
    }
  }

  function openClipEditor(info) {
    const url = (info?.url || '').trim()
    if (!url) return
    stopPlayback()
    if (mainColTab === 'main') projectTlRef.current = snapshotTl()
    clipModeRef.current = true
    clipTlRef.current = null
    hist.reset()
    setClipSaveJob(null)
    setFaceJob(null)
    faceGen.current += 1
    setMainColTab('clip')
    applyEmptyClipTl()
    const title = info.title || `Tramo #${info.index}`
    const direct = info.materialIdent != null
    // Reabrir un segmento: se ve el vídeo entero con su rango ya marcado.
    const mark = Number.isFinite(info.markIn) && Number.isFinite(info.markOut) && info.markOut > info.markIn
      ? { in: info.markIn, out: info.markOut }
      : EMPTY_MARK
    setClipMark(mark)
    setClipMeta({
      title,
      description: info.description || '',
      url,
      segStart: direct ? 0 : (info.start || 0),
      segEnd: direct ? (info.end || 0) : (info.end || 0),
      segIndex: info.index,
      // Un segmento abierto sobre su vídeo entero NO se sobrescribe con "Guardar
      // clip" (renderizaría todo el vídeo en su lugar): guarda uno nuevo.
      existingIndex: info.existing && !info.segment ? info.index : null,
      sourceIdent: direct ? String(info.materialIdent) : null,
      preparing: !direct,
      prepProgress: 0.04,
      prepMsg: 'Preparando el tramo…',
      err: '',
    })
    if (direct) {
      openDirectSource(url, info.end, title)
      if (mark.in != null) scrub(mark.in)
    } else {
      startClipPrepare(url, info.start, info.end, title)
    }
  }

  // El keydown se registra una vez: llama siempre a la versión más reciente.
  const createSegmentFromMarkRef = useRef(null)
  createSegmentFromMarkRef.current = createSegmentFromMark

  // "Crear clip" (botón o Enter): el rango Z/X pasa a Materiales.
  //   · Vídeo local → segmento POR REFERENCIA: instantáneo, sin render.
  //   · Tramo de YouTube (proxy sin archivo local) → hay que descargarlo: se
  //     recorta en su aspecto original (receta master, sin hornear 9:16).
  // Paso 1 (botón o Enter): valida el rango y abre el modal de confirmación
  // con el título del clip completo y su descripción. Aún no se crea nada.
  function createSegmentFromMark() {
    if (segBusyRef.current || !clipModeRef.current || segAskRef.current) return
    const meta = clipMetaRef.current
    const range = markToSourceRange(clipsRef.current, clipMarkRef.current)
    if (range.error) {
      setClipToast({ type: 'error', message: range.error })
      return
    }
    stopPlayback()
    const sourceDescription = String(meta.description || '').trim()
    setSegAsk({
      start: +((meta.segStart || 0) + range.start).toFixed(3),
      end: +((meta.segStart || 0) + range.end).toFixed(3),
      clipId: range.clip.id,
      remote: meta.sourceIdent == null,
      title: String(meta.title || '').trim() || 'Clip',
      descMode: sourceDescription ? 'source' : 'manual',
      description: '',
      sourceDescription,
      phase: 'edit',
      progress: 0,
      message: '',
      error: '',
    })
  }

  // Anticlick "Agregar a material" (modo Clip Editor): el clip de vídeo ENTERO
  // (su in/out actuales, como hace saveClip) pasa a Materiales por referencia,
  // sin marcar Z/X y sin render. Antes de confirmar el usuario revisa 2 inputs
  // —título y descripción— ya rellenados con los del vídeo de origen.
  function addClipToMaterial(video) {
    if (segBusyRef.current || !clipModeRef.current || segAskRef.current) return
    if (!video || video.kind !== 'video') return
    const meta = clipMetaRef.current
    const off = meta.segStart || 0
    const start = +(off + (video.in_point || 0)).toFixed(3)
    const end = +(off + (video.out_point ?? meta.segEnd ?? (video.in_point || 0))).toFixed(3)
    if (end - start < MIN_SEGMENT) {
      setClipToast({ type: 'error', message: 'El clip es demasiado corto para guardarlo como material.' })
      return
    }
    stopPlayback()
    const sourceDescription = String(meta.description || '').trim()
    setSegAsk({
      start,
      end,
      clipId: video.id,
      remote: meta.sourceIdent == null,
      title: String(meta.title || '').trim() || 'Clip',
      descMode: 'manual',
      description: sourceDescription,
      sourceDescription,
      simple: true,
      phase: 'edit',
      progress: 0,
      message: '',
      error: '',
    })
  }

  function patchSegAsk(patch) {
    setSegAsk((a) => (a ? { ...a, ...patch } : a))
  }

  // Paso 2 (Confirmar): recién aquí se crea el clip, con progreso en el modal
  // hasta que aparece en Mis materiales.
  //   · Vídeo local → segmento POR REFERENCIA: sin render.
  //   · Tramo de YouTube (sin archivo local) → se descarga en su aspecto original
  //     (receta master, sin hornear 9:16).
  async function confirmSegment() {
    const ask = segAskRef.current
    if (!ask || segBusyRef.current) return
    const meta = clipMetaRef.current
    const label = String(ask.title || '').trim() || segmentLabel(meta.title, ask.start, ask.end)
    const description = segmentDescription(ask) || null
    const { start, end } = ask
    segBusyRef.current = true
    setSegBusy(true)
    patchSegAsk({ phase: 'running', progress: 0.08, message: 'Iniciando…', error: '' })
    try {
      if (meta.sourceIdent != null) {
        patchSegAsk({ progress: 0.35, message: 'Creando el clip desde el vídeo original…' })
        await createSegments(project.id, meta.sourceIdent, [{ start, end, label, description }])
        patchSegAsk({ progress: 0.8, message: 'Añadiendo a Mis materiales…' })
        await onChange?.()
      } else {
        const url = (meta.url || '').trim()
        if (!url) throw new Error('Falta la URL del vídeo original.')
        const video = clipsRef.current.find((c) => c.id === ask.clipId) || {}
        const index = 100000 + (Date.now() % 900000)
        let job = await createClipJob({
          url,
          project_id: project.id,
          segments: [{ index, start, end, score: 1, duration: +(end - start).toFixed(3), label, description }],
          crop_mode: 'smart_face',
          reframe: { ...newReframe(), master: true, keyframes: [] },
          volume: video.volume ?? 1,
          muted: !!video.muted,
          width: outW,
          height: outH,
        })
        while (job.status !== 'done' && job.status !== 'error') {
          patchSegAsk({ progress: Math.min(0.9, job.progress || 0.1), message: job.message || 'Descargando el tramo…' })
          await new Promise((r) => setTimeout(r, 400))
          job = await getJob(job.id)
        }
        if (job.status === 'error') throw new Error(job.error || 'No se pudo crear el clip.')
        patchSegAsk({ progress: 0.95, message: 'Añadiendo a Mis materiales…' })
        await onChange?.()
      }
      patchSegAsk({ progress: 1, message: 'Listo' })
      setSegAsk(null)
      setClipToast({ type: 'success', message: `«${label}» añadido a Mis materiales · ${fmt(end - start)}` })
      // Listo para marcar el siguiente: la salida de este es la entrada del próximo.
      setClipMark((m) => ({ in: m.out, out: null }))
    } catch (e) {
      patchSegAsk({ phase: 'error', error: e.message || 'No se pudo crear el clip.' })
    } finally {
      segBusyRef.current = false
      setSegBusy(false)
    }
  }

  async function saveClip() {
    if (clipSaveJob && clipSaveJob.status !== 'error' && clipSaveJob.status !== 'done') return
    const url = clipMeta.url.trim()
    const video = clips.find((c) => c.kind === 'video') || clips[0]
    if (!url || !video) return
    const start = (clipMeta.segStart || 0) + (video.in_point || 0)
    const end = (clipMeta.segStart || 0) + (video.out_point || clipMeta.segEnd || start + 0.5)
    if (end - start < 0.5) return
    const fallback = 100000 + (Date.now() % 900000)
    const index = clipSaveIndex(clipMeta, fallback)
    const label = clipMeta.title.trim() || `Clip #${index}`
    // El doble encuadre guarda cx/cy directo en reframe.keyframes; el resto hornea
    // el encuadre desde clipPropsAt (misma fuente que el preview y compose.py).
    const cutRf = video.reframe?.dual_crop
      ? reframeForCut(video.reframe, video.in_point || 0, video.out_point || (end - start))
      : bakedReframeForCut(video, end - start, mediaSize(mediaEls.current.get(video.id)), { w: outW, h: outH })
    clipSaveCtxRef.current = {
      existingIndex: clipMeta.existingIndex,
      description: (clipMeta.description || '').trim() || null,
      title: label,
      reframe: cutRf,
    }
    try {
      setClipSaveJob(await createClipJob({
        url,
        project_id: project.id,
        segments: [{
          index,
          start,
          end,
          score: 1,
          duration: +(end - start).toFixed(3),
          label,
          description: clipMeta.description.trim() || null,
        }],
        crop_mode: 'smart_face',
        reframe: cutRf,
        volume: video.volume ?? 1,
        muted: !!video.muted,
        // Formato de salida elegido en el editor (9:16, 16:9, 1:1, …). Sin esto
        // el backend caía siempre a 720×1280 vertical.
        width: outW,
        height: outH,
        ...(video.keyframes?.enabled ? { audio_keyframes: video.keyframes } : {}),
      }))
    } catch (e) {
      setClipSaveJob({ status: 'error', error: e.message })
    }
  }

  function duplicateSelected(clipArg) {
    const clip = clipArg?.id
      ? clipArg
      : (clips.find((c) => c.id === selClipId) || clips.find((c) => selClipIds.includes(c.id)))
    if (!clip) return
    // El duplicado se queda en LA MISMA pista, justo detrás del original (y si
    // ahí no cabe, en el siguiente hueco libre). Antes se creaba una pista nueva
    // por cada duplicado, que es lo que llenaba el timeline de V2/V3/V4…
    const trackId = clip.track_id
    const copy = duplicateClipOntoTrack(clip, trackId, uid('c'))
    copy.start = freeStartOnTrack(clipsRef.current, trackId, clipEnd(clip), clipDur(clip))
    setClips((prev) => [...prev, copy])
    setSelClipId(copy.id)
    setSelClipIds([copy.id])
    setSelTrackId(trackId)
    setSelKfId(null)
  }

  // Copiar (Ctrl+C) cualquier clip del timeline —audio, imagen, vídeo, texto o
  // forma—. Guarda una instantánea y el desfase de cada uno respecto al primero,
  // para pegar el grupo conservando su separación.
  function copySelectedClips() {
    const ids = selIdsRef.current || []
    const chosen = clipsRef.current.filter((c) => ids.includes(c.id))
    if (!chosen.length) return false
    const base = Math.min(...chosen.map((c) => c.start || 0))
    clipClipboardRef.current = chosen.map((c) => ({
      clip: JSON.parse(JSON.stringify(c)),
      offset: (c.start || 0) - base,
    }))
    setClipToast({ type: 'success', message: chosen.length > 1 ? `${chosen.length} clips copiados` : 'Clip copiado' })
    return true
  }
  // Pegar (Ctrl+V) donde está el cabezal (la línea roja). El primer clip queda
  // en el cabezal y el resto conserva su separación original. Mantiene la pista
  // de origen si sigue existiendo; si no, busca una compatible.
  function pasteClips() {
    const buf = clipClipboardRef.current
    if (!buf?.length) return false
    const at = Math.max(0, playheadRef.current || 0)
    const tracks = tracksRef.current
    const fresh = []
    const ids = []
    for (const { clip, offset } of buf) {
      let trackId = clip.track_id
      if (!tracks.some((t) => t.id === trackId)) {
        const kind = trackKindForClip(clip.kind)
        const fallback = tracks.find((t) => t.kind === kind && !t.locked)
        if (!fallback) continue
        trackId = fallback.id
      }
      const copy = duplicateClipOntoTrack(clip, trackId, uid('c'))
      copy.start = +(at + offset).toFixed(3)
      fresh.push(copy)
      ids.push(copy.id)
    }
    if (!fresh.length) return false
    setClips((prev) => [...prev, ...fresh])
    const anchor = ids[ids.length - 1]
    setSelClipIds(ids)
    setSelClipId(anchor)
    selIdsRef.current = ids
    selRef.current = anchor
    setSelKfId(null)
    return true
  }

  async function startFaceTrack(mode) {
    if (faceJob && faceJob.status !== 'done' && faceJob.status !== 'error') return
    const url = (clipMeta.url || '').trim()
    if (!url || clipMeta.preparing) return
    const gen = ++faceGen.current
    setClipMeta((m) => ({ ...m, err: '' }))
    const pan = mode === 'direct' ? 'direct' : 'smooth'
    // Vídeo local: se analiza SOLO el rango marcado (Z/X) o, sin marca, el tramo
    // visible del clip, buscando directamente en el archivo original.
    if (clipMeta.sourceIdent != null) {
      const marked = markToSourceRange(clips, clipMark)
      const video = clips.find((c) => c.kind === 'video')
      const range = marked.error
        ? (video ? { start: video.in_point || 0, end: video.out_point } : null)
        : marked
      if (!range) return
      try {
        const job = await faceTrackMaterial(project.id, clipMeta.sourceIdent, { start: range.start, end: range.end })
        if (faceGen.current !== gen) return
        setFaceJob({ ...job, mode: pan, gen })
      } catch (e) {
        if (faceGen.current !== gen) return
        setClipMeta((m) => ({ ...m, err: e.message || 'No se pudo generar el seguimiento.' }))
      }
      return
    }
    try {
      const job = await prepareReframe({
        url,
        start: clipMeta.segStart || 0,
        end: clipMeta.segEnd || 0,
        track_faces: true,
      })
      if (faceGen.current !== gen) return
      setFaceJob({ ...job, mode: mode === 'direct' ? 'direct' : 'smooth', gen })
    } catch (e) {
      if (faceGen.current !== gen) return
      setClipMeta((m) => ({ ...m, err: e.message || 'No se pudo generar el seguimiento.' }))
    }
  }

  // --- Mutaciones de clips ---
  const mutateClip = useCallback((id, patch) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  // Copiar / pegar atributos (#13, Ctrl+Alt+C / Ctrl+Alt+V): se copia el clip
  // entero y al pegar se elige qué grupos (posición, animación, audio…) van a
  // los clips seleccionados, sin tocar su contenido ni sus tiempos.
  function copyAttrs(clipId) {
    const id = clipId || selIdsRef.current[0]
    const clip = clipsRef.current.find((c) => c.id === id)
    if (!clip) return false
    setAttrClipboard(copyClipAttrs(clip))
    setClipToast({ type: 'success', message: 'Atributos copiados · Ctrl+Alt+V para pegarlos' })
    return true
  }
  function openPasteAttrs(clipId) {
    const src = attrClipboardRef.current
    if (!src) return false
    const sel = selIdsRef.current
    const ids = clipId ? (sel.includes(clipId) ? sel : [clipId]) : sel
    const targets = clipsRef.current.filter((c) => ids.includes(c.id) && c.id !== src.id)
    if (!targets.length) return false
    if (!pasteableGroups(src, targets).length) {
      setClipToast({ type: 'error', message: 'Esos clips no admiten los atributos del clip copiado' })
      return true
    }
    setAttrPaste({ ids: targets.map((c) => c.id) })
    return true
  }
  function applyPasteAttrs(groups) {
    const src = attrClipboardRef.current
    const ids = new Set(attrPaste?.ids || [])
    setAttrPaste(null)
    if (!src || !ids.size) return
    setClips((prev) => {
      let next = prev
      // Los subtítulos enlazados a un audio siguen su velocidad (igual que en el inspector).
      if (groups.includes('speed')) {
        for (const c of prev) {
          if (ids.has(c.id) && c.kind === 'audio' && groupApplies('speed', src, c)) {
            next = applyAudioSpeedToLinkedText(next, tracksRef.current, c, src.speed ?? 1)
          }
        }
      }
      return next.map((c) => (ids.has(c.id) ? pasteClipAttrs(c, src, groups) : c))
    })
    setClipToast({ type: 'success', message: ids.size === 1 ? 'Atributos pegados' : `Atributos pegados en ${ids.size} clips` })
  }

  function registerMediaMeta(clip, el) {
    if (clip.kind === 'image') return
    const real = el.duration
    if (!real || !isFinite(real)) return
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      // Un segmento por referencia apunta al vídeo ENTERO: su out_point es el fin
      // del tramo, no el del archivo. Nunca se "des-recorta" hasta el final.
      if (c.ref_segment) return { ...c, source_duration: real, out_point: Math.min(c.out_point, real) }
      const wasUntrimmed = Math.abs(c.out_point - c.source_duration) < 0.05 || c.source_duration <= 0
      const out = wasUntrimmed ? real : Math.min(c.out_point, real)
      return { ...c, source_duration: real, out_point: out }
    }))
  }

  // Clips nuevos "planos" (sin recorte/paneo horneado) se colocan a altura completa
  // del cuadro; los que traen encuadre (preparados/guardados) lo conservan tal cual
  // se ve al convertirlos.
  function wantsBaseFit(clip) {
    const rf = clip.reframe
    if (!rf) return true
    if (rf.keyframes?.length) return false
    if (rf.crop_w != null || rf.crop_h != null) return false
    if (rf.zoom != null && Math.abs(rf.zoom - 1) > 0.001) return false
    return true
  }

  // Al cargar el medio, deja el clip como objeto libre (overlay + frame 'free'):
  //   * sin encuadre horneado → centrado y a altura completa del cuadro naranja
  //     (Escala 100% = altura del clip = altura del cuadro);
  //   * con encuadre (zoom/paneo de seguimiento) → captura la ventana de recorte
  //     actual y la escala hasta llenar el cuadro, así en pantalla NO se mueve nada
  //     y el paneo animado (cx/cy de reframe) se conserva;
  //   * si ya era un overlay pegado a un hueco → solo suelta el hueco (misma
  //     geometría: el recorte y la transformación ya son los suyos).
  function applyFreeLayout(clip, el) {
    const { w: srcW, h: srcH } = mediaSize(el)
    if (!srcW || !srcH) return
    const oW = outRef.current.w
    const oH = outRef.current.h
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id || !needsFreeLayout(c)) return c
      if (isOverlay(c) && c.reframe?.crop_w != null && c.reframe?.crop_h != null) {
        return { ...c, frame: 'free' }
      }
      if (wantsBaseFit(c)) {
        return {
          ...c,
          layout: 'overlay',
          frame: 'free',
          reframe: { ...(c.reframe || newReframe()), crop_w: 1, crop_h: 1, dual_crop: false, keyframes: [] },
          transform: { x: 0.5, y: 0.5, scale: +(oH / srcH).toFixed(5), rotation: 0 },
        }
      }
      const srcT = clamp(timelineToSource(c, playheadRef.current), c.in_point, c.out_point)
      const localT = Math.max(0, playheadRef.current - (c.start || 0))
      const crop = cropWindow({ ...c, layout: 'fill' }, srcW / srcH, oW / oH, srcT, localT)
      const px = sourceCropPx(crop, srcW, srcH)
      const scale = Math.max(oW / Math.max(1, px.sw), oH / Math.max(1, px.sh))
      return {
        ...c,
        layout: 'overlay',
        frame: 'free',
        reframe: { ...(c.reframe || newReframe()), crop_w: crop.wf, crop_h: crop.hf, dual_crop: false },
        transform: { x: 0.5, y: 0.5, scale: +scale.toFixed(5), rotation: 0 },
      }
    }))
  }

  // Aplica un seguimiento de caras (keyframes cx/cy en tiempo de FUENTE) a clips
  // de la timeline. Un objeto libre ya "encajado" (crop 1×1) no tiene margen para
  // panear, así que se vuelve al encuadre de relleno y se reconvierte a objeto
  // libre: applyFreeLayout captura la ventana 9:16 (o la del formato) alrededor de
  // la cara y el paneo animado queda como movimiento de cámara.
  function applyFaceTrackToClips(ids, keyframes, mode) {
    const set = new Set(ids)
    setClips((prev) => prev.map((c) => {
      if (!set.has(c.id) || !isVisualClip(c)) return c
      const rf = applyFaceTrack({ ...(c.reframe || newReframe()), dual_crop: false, zoom: 1 }, keyframes, mode)
      delete rf.crop_w
      delete rf.crop_h
      return { ...c, layout: 'fill', frame: 'full', transform: undefined, reframe: rf }
    }))
    for (const id of set) {
      const el = mediaEls.current.get(id)
      if (el) applyFreeLayout({ id }, el)
    }
  }

  // Material → "Seguimiento de caras": analiza el tramo del material (o reutiliza
  // el análisis guardado en él) y lo aplica a sus instancias en la timeline.
  const [matFaceBusy, setMatFaceBusy] = useState(null)   // index del material en análisis
  async function faceTrackFromMaterial(item, { force = false } = {}) {
    if (!item || matFaceBusy != null) return
    const ident = String(item.index ?? item.id)
    setMatFaceBusy(ident)
    setClipToast({ type: 'info', message: 'Seguimiento de caras…' })
    try {
      let job = await faceTrackMaterial(project.id, ident, { force })
      while (job.status !== 'done' && job.status !== 'error') {
        await new Promise((r) => setTimeout(r, 400))
        job = await getJob(job.id)
        setClipToast({ type: 'info', message: `${job.message || 'Seguimiento de caras…'} ${Math.round((job.progress || 0) * 100)}%` })
      }
      if (job.status === 'error') throw new Error(job.error || 'No se pudo analizar.')
      await onChange?.()
      const kfs = job.reframe_prep?.keyframes || []
      const targets = clipsRef.current.filter((c) => c.asset_kind === 'clips' && String(c.asset_id) === ident)
      if (targets.length && !clipModeRef.current && !motionModeRef.current && !paperModeRef.current) {
        applyFaceTrackToClips(targets.map((c) => c.id), kfs, 'smooth')
      }
      setClipToast({
        type: 'success',
        message: `${job.message || 'Seguimiento listo'}${targets.length ? ` · aplicado a ${targets.length} clip${targets.length > 1 ? 's' : ''}` : ' · se aplicará al agregarlo'}`,
      })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo generar el seguimiento.' })
    } finally {
      setMatFaceBusy(null)
    }
  }

  function targetTrackFor(kind) {
    const sel = tracks.find((t) => t.id === selTrackId)
    if (sel && sel.kind === kind && !sel.locked) return sel
    return tracks.find((t) => t.kind === kind && !t.locked) || null
  }

  function addAsset(assetKind, item) {
    // El material se agrega justo donde está el cabezal (la línea roja), no al
    // final de la pista.
    const at = Math.max(0, playheadRef.current || 0)
    if (assetKind === 'shape') {
      const track = targetTrackFor('video')
      if (!track) return
      // Las figuras son objetos libres (rótulos, flechas): se quedan en el
      // cabezal aunque haya un clip debajo, porque suelen ir SOBRE el vídeo.
      const clip = makeShapeClip(track.id, at, SHAPE_DEFAULT_DUR, item)
      setClips((prev) => [...prev, clip])
      setSelClipId(clip.id)
      setSelClipIds([clip.id])
      return
    }
    const clipKind = assetKind === 'clips' ? 'video' : assetKind === 'images' ? 'image' : 'audio'
    const track = targetTrackFor(trackKindForClip(clipKind))
    if (!track) return
    const dur = assetKind === 'images'
      ? (item.animated && Number(item.duration) > 0 ? Number(item.duration) : IMAGE_DEFAULT_DUR)
      : assetKind === 'clips'
        ? materialDuration(item)
        : (item.duration || 0)
    // Desde el cabezal, pero sin pisar lo que ya hay: la pista es una secuencia.
    // Pulsar + varias veces encadena los clips en vez de amontonarlos.
    const at0 = freeStartOnTrack(clipsRef.current, track.id, at, dur)
    const clip = makeClip(assetKind, item, track.id, at0, dur)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
  }

  // --- Pluma (#14) ---
  function startPen() {
    if (playingRef.current) stopPlayback()
    setPathEdit(false)
    penHoverRef.current = null
    setPen({ points: [] })
  }
  function addPenPoint(pt) {
    setPen((cur) => (cur ? { ...cur, points: [...cur.points, pt] } : cur))
  }
  function popPenPoint() {
    setPen((cur) => (cur ? { ...cur, points: cur.points.slice(0, -1) } : cur))
  }
  function cancelPen() {
    penHoverRef.current = null
    setPen(null)
  }
  function finishPen(opts = {}) {
    // Un doble clic deja dos anclas casi en el mismo sitio: sobra la última.
    const pts = (penRef.current?.points || []).filter((p, i, arr) => (
      i === 0 || Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) > 0.004))
    cancelPen()
    if (pts.length < 2) return
    const track = targetTrackFor('video')
    if (!track) return
    const closed = !!opts.closed && pts.length >= 3
    const shape = pathShape(pts, { closed, ...(closed ? {} : { fill: 'none' }) })
    const at = Math.max(0, playheadRef.current || 0)
    const clip = makeShapeClip(track.id, at, SHAPE_DEFAULT_DUR, { type: 'path', label: 'Trazado', shape })
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
  }
  penOpsRef.current = { finish: finishPen, cancel: cancelPen, pop: popPenPoint }
  // Anclas de un trazado: sin reajustar la caja mientras se arrastra; al soltar se
  // reajusta (si no está animado: con keyframes la posición la mandan ellos).
  function setPathShape(id, patch, renorm) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id || c.kind !== 'shape') return c
      let shape = { ...(c.shape || {}), ...patch }
      if (renorm && !keyframesEnabled(c)) shape = renormalizePath(shape, outAspect, clipFlip(c))
      return { ...c, shape }
    }))
  }
  function onCanvasPenMove(e) {
    if (!penRef.current) return
    const canvas = mainCanvasRef.current
    if (!canvas) return
    const frame = frameRectOf(canvas.width, canvas.height, viewZoomRef.current ?? 1, outAspect)
    const p = canvasPointer(e, canvas)
    penHoverRef.current = [(p.x - frame.x) / frame.w, (p.y - frame.y) / frame.h]
  }
  // --- Seguimiento de objetos (#15) ---
  // El vídeo cuyo objeto se sigue: el de más arriba bajo el cursor (sin contar el
  // propio clip que lo va a acompañar).
  function videoUnder(follower) {
    const vids = videosAt(playheadRef.current, clipsRef.current, tracksRef.current)
      .filter((c) => c.kind === 'video' && c.id !== follower?.id)
    return vids[vids.length - 1] || null
  }
  function startTrackPick() {
    const follower = selectedClip
    if (!follower || follower.kind === 'audio' || trackRun) return
    const video = videoUnder(follower)
    if (!video) {
      setClipToast({ type: 'error', message: 'Pon el cursor sobre un vídeo con el objeto que quieres seguir.' })
      return
    }
    if (playingRef.current) stopPlayback()
    setPen(null)
    setPathEdit(false)
    trackBoxRef.current = null
    setTrackPick({ followerId: follower.id, videoId: video.id })
  }
  function cancelTrackPick() {
    trackBoxRef.current = null
    setTrackPick(null)
  }
  async function runTrack(box) {
    const pick = trackPickRef.current
    cancelTrackPick()
    const video = pick && clipsRef.current.find((c) => c.id === pick.videoId)
    if (!video || !box) return
    const anchorT = playheadRef.current
    const at = clamp(timelineToSource(video, anchorT), video.in_point, video.out_point)
    setTrackRun({ progress: 0.02, message: 'Siguiendo el objeto…' })
    try {
      let job = await apiTrackObject(project.id, video, box, at)
      while (job.status !== 'done' && job.status !== 'error') {
        await new Promise((r) => setTimeout(r, 400))
        job = await getJob(job.id)
        setTrackRun((m) => (m ? { progress: job.progress || m.progress, message: job.message || m.message } : m))
      }
      if (job.status === 'error') throw new Error(job.error || 'No se pudo seguir el objeto.')
      const res = job.result || {}
      const fresh = clipsRef.current.find((c) => c.id === pick.followerId)
      const vNow = clipsRef.current.find((c) => c.id === video.id) || video
      const keys = fresh ? followObjectKeys(vNow, fresh, res.track || [],
        { srcW: res.width, srcH: res.height, outW, outH }, box.w, anchorT, trackMode) : []
      if (!keys.length) throw new Error('El objeto no se ve mientras dura este clip.')
      setClips((prev) => prev.map((c) => (c.id === pick.followerId ? applyFollowKeys(c, keys, fpsRef.current) : c)))
      const lost = (res.track || []).filter((p) => !p.ok).length
      setClipToast({
        type: lost ? 'info' : 'success',
        message: `Sigue al objeto (${keys.length} keyframes)` + (lost ? ` · ${lost} fotogramas sin seguir` : ''),
      })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo seguir el objeto.' })
    } finally {
      setTrackRun(null)
    }
  }

  // --- Capa de ajuste (#19) ---
  // En el cursor, en la pista de vídeo de arriba si está libre en ese tramo; si no,
  // en una pista de vídeo nueva encima de todas.
  function topFreeVideoTrack(at, dur) {
    const vids = tracksRef.current.filter((t) => t.kind === 'video')
    const top = vids[vids.length - 1]
    const busy = !top || top.locked || clipsRef.current.some((c) => c.track_id === top.id
      && c.start < at + dur - 1e-6 && clipEnd(c) > at + 1e-6)
    return busy ? addTrack('video') : top.id
  }
  function addAdjustmentLayer() {
    const at = Math.max(0, playheadRef.current || 0)
    const dur = 5
    const clip = makeAdjustmentClip(topFreeVideoTrack(at, dur), at, dur)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
    setClipToast({ type: 'success', message: 'Capa de ajuste añadida: elige filtros y color en el inspector' })
  }

  // --- Recetas en un clic (#21) ---
  // Viven en el backend (una operación deshacible, la misma que usa el MCP): se
  // guarda la timeline, se aplica la receta y se recarga. Si la receta pide el
  // recorte IA de un clip (Sujeto que se adelanta), se lanza aquí.
  const [recipeBusy, setRecipeBusy] = useState(null)
  async function applyRecipeUI(recipe) {
    if (recipeBusy) return
    setRecipeBusy(recipe.id)
    setClipToast({ type: 'info', message: `Aplicando «${recipe.label}»…` })
    try {
      await saveTimeline(project.id, timelinePayload())
      const res = await apiApplyRecipe(project.id, recipe.id, selIdsRef.current, { at_time: playheadRef.current })
      const next = (await reloadTimeline()) || []
      const touched = next.filter((c) => (res.changed || []).includes(c.id))
      for (const c of touched) {
        const auto = c.bg_removal?.auto
        if (bgCapable(c) && auto?.enabled && (auto.status || 'idle') === 'idle') startBgAutoFor(c)
      }
      const sel = touched.find((c) => c.kind !== 'audio') || touched[0]
      if (sel) { setSelClipId(sel.id); setSelClipIds([sel.id]) }
      const warn = (res.warnings || []).filter((w) => !/recorte IA/.test(w))
      setClipToast({ type: warn.length ? 'info' : 'success', message: `«${recipe.label}» aplicada` + (warn.length ? ` · ${warn.join(' · ')}` : '') })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo aplicar la receta.' })
    } finally {
      setRecipeBusy(null)
    }
  }

  // --- Barras de cine (#20) ---
  // De principio a fin de la timeline, encima de todo, con el grosor que deja lo
  // visible en la proporción elegida (según el formato del proyecto).
  function addCinemaBars(ratioId) {
    const r = CINEMA_RATIOS.find((x) => x.id === ratioId) || CINEMA_RATIOS[0]
    const bar = cinemaBar(outAspect, r.ratio)
    if (bar <= 0) {
      setClipToast({ type: 'error', message: `Con este formato ${r.label} no deja barras: el vídeo ya es más ancho.` })
      return
    }
    const end = clipsRef.current.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
    const dur = end > 0.05 ? end : SHAPE_DEFAULT_DUR
    const clip = makeShapeClip(topFreeVideoTrack(0, dur), 0, dur,
      { type: 'letterbox', label: 'Barras de cine', shape: { ...defaultShape('letterbox'), bar } })
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
    setClipToast({ type: 'success', message: `Barras de cine ${r.label} · grosor y entrada animada en el inspector` })
  }

  // --- Sonorizar con IA (#17) ---
  async function soundDesignFor(clipId) {
    const clip = clipsRef.current.find((c) => c.id === clipId)
    if (!clip || (clip.kind !== 'video' && clip.kind !== 'image') || soundBusy) return
    setSoundBusy(clip.id)
    setClipToast({ type: 'info', message: 'Sonorizando la escena…' })
    try {
      let job = await apiSoundDesign(project.id, clip)
      while (job.status !== 'done' && job.status !== 'error') {
        await new Promise((r) => setTimeout(r, 500))
        job = await getJob(job.id)
        if (job.message) setClipToast({ type: 'info', message: job.message })
      }
      if (job.status === 'error') throw new Error(job.error || 'No se pudo sonorizar la escena.')
      const res = job.result || {}
      if (!(res.sounds || []).length && !(res.missing || []).length) {
        setClipToast({ type: 'info', message: 'La IA no propuso ningún sonido para esta escena.' })
        return
      }
      setClipToast(null)
      setSoundResult({ ...res, clipId: clip.id })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo sonorizar la escena.' })
    } finally {
      setSoundBusy(null)
    }
  }
  function applySoundDesign(sounds) {
    const res = soundResult
    setSoundResult(null)
    const scene = res && clipsRef.current.find((c) => c.id === res.clipId)
    if (!scene || !sounds.length) return
    const out = placeSoundDesign(clipsRef.current, tracksRef.current, scene, sounds,
      (p) => (p === 'c' ? uid('c') : `${p}-${uid('sfx')}`))
    setTracks(out.tracks)
    setClips(out.clips)
    setClipToast({ type: 'success', message: `${out.added.length} sonidos añadidos en las pistas SFX` })
  }

  // «Dibujar trazo» de un clic: keyframes 0 → 100 % en 1,5 s desde el inicio.
  function drawInShape(id) {
    setClips((prev) => prev.map((c) => (c.id === id && c.kind === 'shape' ? drawInKeyframes(c, 1.5, fpsRef.current) : c)))
  }
  useEffect(() => {
    if (pathEdit && !(selectedClip?.kind === 'shape' && selectedClip.shape?.type === 'path')) setPathEdit(false)
  }, [pathEdit, selectedClip])

  // "Agregar Stick" desde la timeline: un recurso de colección (vídeo/imagen)
  // entra en la pista/instante del clic derecho, YA con fondo por croma activado
  // (los sticks vienen sobre verde). No hay que configurar el croma a mano.
  function addStickClip(item, opts = {}) {
    const assetKind = item.kind === 'video' ? 'clips' : 'images'
    const clipKind = item.kind === 'video' ? 'video' : 'image'
    const track = (opts.trackId && tracksRef.current.find((t) => t.id === opts.trackId))
      || targetTrackFor(trackKindForClip(clipKind))
    if (!track) return
    const at = opts.time != null ? Math.max(0, opts.time) : Math.max(0, playheadRef.current || 0)
    const dur = assetKind === 'images'
      ? (item.animated && Number(item.duration) > 0 ? Number(item.duration) : IMAGE_DEFAULT_DUR)
      : (materialDuration(item) || 1)
    const at0 = freeStartOnTrack(clipsRef.current, track.id, at, dur)
    const base = makeClip(assetKind, item, track.id, at0, dur)
    const clip = { ...base, bg_removal: chromaBg(item.chromaColor) }
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
    setStickMenu(null)
  }

  // Aplica la intención deducida al soltar (ver dropIntent.js). Devuelve la
  // pista definitiva y el instante, o null si hay que esperar confirmación.
  function resolveDropTarget(payload, trackId, startTime, intent) {
    if (!intent || intent.action === 'place' || intent.action === 'after') {
      return { trackId, start: startTime }
    }
    const dur = Math.max(0.1, payload.duration || SHAPE_DEFAULT_DUR)
    if (intent.action === 'newTrack') {
      const spot = resolveNewTrack(clipsRef.current, tracksRef.current, trackId, startTime, dur)
      // Si la de encima está ocupada se crea una: es lo que anuncia la línea verde.
      return { trackId: spot.create ? addTrack(laneKindForAsset(payload.asset_kind), undefined, spot.index) : spot.trackId, start: startTime }
    }
    if (intent.action === 'replace') {
      setReplaceAsk({ payload, trackId, start: startTime, targetId: intent.targetId })
      return null
    }
    return { trackId, start: startTime }
  }

  function dropAsset(payload, trackId, startTime, intent) {
    if (payload._explore) {
      dropExploreAsset(payload, trackId, startTime, intent)
      return
    }
    const spot = resolveDropTarget(payload, trackId, startTime, intent)
    if (!spot) return                       // el modal de reemplazo decide
    placeAsset(payload, spot.trackId, spot.start)
  }

  async function dropExploreAsset(item, trackId, startTime, intent) {
    setClipToast({ type: 'info', message: 'Importando material…' })
    try {
      const res = await importExplore(project.id, item)
      onChange?.()
      const imported = res.item || res
      const isVideo = res.kind === 'clips'
      const assetKind = isVideo ? 'clips' : 'images'
      const materialPayload = {
        asset_kind: assetKind,
        asset_id: isVideo ? String(imported.index) : String(imported.id),
        filename: imported.filename,
        name: imported.label || imported.name || imported.filename,
        url: imported.url,
        duration: isVideo ? (imported.duration || item.duration || 3) : (imported.animated ? (imported.duration || 3) : IMAGE_DEFAULT_DUR),
        kind: isVideo ? 'video' : 'image',
        animated: imported.animated || undefined,
        loop: imported.animated ? imported.loop !== false : undefined,
        scope: 'project',
        description: imported.description || null,
        media_version: imported.created_at || null,
      }
      const spot = resolveDropTarget(materialPayload, trackId, startTime, intent)
      if (!spot) return
      placeAsset(materialPayload, spot.trackId, spot.start)
      setClipToast({ type: 'success', message: isVideo ? 'Vídeo añadido a la timeline.' : 'Imagen añadida a la timeline.' })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo importar.' })
    }
  }

  // Confirmado el reemplazo: fuera el clip de debajo y el nuevo ocupa su sitio.
  function applyReplaceDrop() {
    const ask = replaceAsk
    setReplaceAsk(null)
    if (!ask) return
    setClips((prev) => removeClipsByIds(prev, [ask.targetId]))
    placeAsset(ask.payload, ask.trackId, ask.start)
  }

  function placeAsset(payload, trackId, startTime) {
    if (payload.asset_kind === 'shape' || payload.kind === 'shape') {
      const clip = makeShapeClip(trackId, startTime, payload.duration || SHAPE_DEFAULT_DUR, payload)
      setClips((prev) => [...prev, clip])
      setSelClipId(clip.id)
      setSelClipIds([clip.id])
      return
    }
    const clip = makeClip(payload.asset_kind, {
      index: payload.asset_id, id: payload.asset_id, filename: payload.filename,
      name: payload.name, label: payload.name, duration: payload.duration, end: payload.duration, start: 0,
      reframe: payload.reframe,
      scope: payload.scope,
      description: payload.description,
      media_version: payload.media_version,
      animated: payload.animated,
      loop: payload.loop,
      in_point: payload.in_point,
      out_point: payload.out_point,
      face_track: payload.face_track,
    }, trackId, startTime, payload.duration)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
  }

  function splitClip(id, at) {
    const ids = new Set(
      id && selIdsRef.current.includes(id) ? selIdsRef.current : (id ? [id] : selIdsRef.current)
    )
    if (!ids.size) return
    setClips((prev) => {
      const remap = (arr) => (arr || []).map((k) => ({ ...k, id: uid('k') }))
      const out = []
      for (const c of prev) {
        if (!ids.has(c.id)) { out.push(c); continue }
        const parts = splitClipAt(c, at, uid('c'))
        if (!parts) { out.push(c); continue }
        const left = parts.left
        const right = {
          ...parts.right,
          reframe: c.reframe ? withKfIds({
            ...c.reframe,
            keyframes: remap(c.reframe.keyframes),
            keyframes2: remap(c.reframe.keyframes2),
          }) : null,
        }
        out.push(left, right)
      }
      return out
    })
  }

  function deleteClip(id) {
    const ids = id && selIdsRef.current.includes(id)
      ? selIdsRef.current
      : (id ? [id] : selIdsRef.current)
    if (!ids.length) return
    setClips((prev) => removeClipsByIds(prev, ids))
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
  }

  function trackToggle(id, prop) {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, [prop]: !t[prop] } : t)))
  }

  // Compactar pista: pega los clips al inicio de la timeline y los junta
  // uno tras otro (sin huecos ni solapes), manteniendo su orden.
  function compactTrack(trackId) {
    setClips((prev) => {
      const track = tracksRef.current.find((t) => t.id === trackId)
      if (track?.locked) return prev
      const ordered = prev
        .filter((c) => c.track_id === trackId)
        .sort((a, b) => a.start - b.start)
      if (!ordered.length) return prev
      const nextStart = {}
      let cursor = 0
      for (const c of ordered) {
        nextStart[c.id] = +cursor.toFixed(3)
        cursor += clipDur(c)
      }
      return prev.map((c) => (c.track_id === trackId ? { ...c, start: nextStart[c.id] } : c))
    })
  }

  // `where`: 'above' | 'below' al sacar un clip fuera del bloque de pistas, un
  // índice del array para colocarla justo encima de otra, o nada = el sitio de
  // siempre (ver defaultTrackIndex).
  function addTrack(kind, style, where) {
    const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'T'
    const nums = tracksRef.current.filter((t) => t.kind === kind).map((t) => parseInt(String(t.name).replace(/\D/g, ''), 10) || 0)
    const n = (nums.length ? Math.max(...nums) : 0) + 1
    const id = `${prefix}${n}-${uid('')}`
    const nt = { id, kind, name: `${prefix}${n}`, hidden: false, muted: false, locked: false, linked_track_id: null }
    if (kind === 'text') nt.style = style || subtitleStyle()
    setTracks((prev) => insertTrack(prev, nt, typeof where === 'string' ? newTrackIndex(prev, kind, where) : where))
    return id
  }
  function reorderTracks(next) {
    if (next !== tracksRef.current) setTracks(next)
  }
  function addTextTrack() {
    const id = addTrack('text')
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
    setSelTrackId(id)
  }
  function applyRemoveTrack(trackId) {
    const next = removeTrack(tracksRef.current, clipsRef.current, trackId)
    setTracks(next.tracks)
    setClips(next.clips)
    if (selTrackId === trackId) setSelTrackId(next.tracks[0]?.id || null)
    if (selClipId && !next.clips.some((c) => c.id === selClipId)) {
      setSelClipId(null)
      setSelKfId(null)
    }
    setSelClipIds((prev) => prev.filter((id) => next.clips.some((c) => c.id === id)))
    if (framingMode?.trackId === trackId) setFramingMode(null)
    setTrackToDelete(null)
  }
  function requestDeleteTrack(track) {
    if (!track) return
    setTrackMenu(null)
    if (shouldConfirmTrackDelete(clipsRef.current, track.id)) setTrackToDelete(track)
    else applyRemoveTrack(track.id)
  }
  function startLinkPick(audioTrack) {
    setTrackMenu(null)
    if (!audioTrack || audioTrack.kind !== 'audio') return
    if (!tracksRef.current.some((t) => t.kind === 'text')) return
    setLinkPick(audioTrack.id)
  }
  function cancelLinkPick() {
    setLinkPick(null)
  }
  function pickLinkTextTrack(textTrack) {
    if (!linkPick || !textTrack || textTrack.kind !== 'text') return
    setTracks((prev) => linkTrackPair(prev, linkPick, textTrack.id))
    setLinkPick(null)
  }
  function unlinkTrack(track) {
    setTrackMenu(null)
    if (!track) return
    setTracks((prev) => unlinkTrackPair(prev, track.id))
  }
  async function copyPlain(text, okMsg) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setClipToast({ type: 'success', message: okMsg })
    } catch {
      setClipToast({ type: 'error', message: 'No se pudo copiar.' })
    }
  }
  async function copyTrackText(track) {
    setTrackMenu(null)
    if (!track || track.kind !== 'text') return
    await copyPlain(trackTextContent(clipsRef.current, track.id), 'Texto copiado.')
  }
  async function copyTrackSrt(track) {
    setTrackMenu(null)
    if (!track || track.kind !== 'text') return
    await copyPlain(trackSrt(clipsRef.current, track.id), 'SRT copiado.')
  }
  async function copyTrackSrtRef(track) {
    setTrackMenu(null)
    if (!track || track.kind !== 'text') return
    await copyPlain(trackSrtWithReference(clipsRef.current, track.id), 'SRT + referencia copiado.')
  }
  async function copyClipDescription(clip) {
    setCtxMenu(null)
    if (!clip || clip.kind !== 'audio') return
    const live = clipsRef.current.find((c) => c.id === clip.id) || clip
    await copyPlain(clipCopyText(live, project.audios), 'Descripción copiada.')
  }
  function selectTrack(id) {
    setSelTrackId(id)
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
    setFramingMode(null)
  }
  function renameTrack(id, name) {
    const n = String(name || '').trim().slice(0, 32)
    if (!n) return
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, name: n } : t)))
  }
  function patchTrackAudio(trackId, patch) {
    setClips((prev) => prev.map((c) => {
      if (c.track_id !== trackId || (c.kind !== 'audio' && c.kind !== 'video')) return c
      const next = { ...c, ...patch }
      if (patch.audio_fx && typeof patch.audio_fx === 'object') {
        next.audio_fx = { ...(c.audio_fx && typeof c.audio_fx === 'object' ? c.audio_fx : {}), ...patch.audio_fx }
      }
      return next
    }))
  }
  function fadeTrackAudio(trackId, side) {
    setClips((prev) => prev.map((c) => {
      if (c.track_id !== trackId || (c.kind !== 'audio' && c.kind !== 'video')) return c
      return applyVolumeFade(c, clipDur(c), side)
    }))
  }
  function handleSelectClip(clip, e) {
    if (!clip) return { ids: [], anchorId: null }
    const additive = !!(e?.ctrlKey || e?.metaKey)
    const range = !!e?.shiftKey
    const keepGroup = !additive && !range && selIdsRef.current.includes(clip.id)
    const next = nextClipSelection(clipsRef.current, selIdsRef.current, selRef.current, clip.id, {
      additive, range, keepGroup,
    })
    setSelClipIds(next.ids)
    setSelClipId(next.anchorId)
    selIdsRef.current = next.ids
    selRef.current = next.anchorId
    setSelKfId(null)
    if (clip.track_id) setSelTrackId(clip.track_id)
    if (!keepGroup) {
      setFramingMode(null)
    }
    return next
  }
  function clearCanvasSelection() {
    setSelClipId(null)
    setSelClipIds([])
    selIdsRef.current = []
    selRef.current = null
    setSelKfId(null)
  }
  // Selección múltiple desde el rectángulo del timeline. Fija el conjunto de ids
  // (ya unido con la selección previa si fue aditiva) y usa el último como ancla,
  // para que las ops existentes (mover/eliminar grupo) y Shift funcionen igual
  // que con la selección por clic.
  function selectClipIds(ids) {
    const arr = (ids || []).filter((id) => clipsRef.current.some((c) => c.id === id))
    const anchor = arr.length ? arr[arr.length - 1] : null
    setSelClipIds(arr)
    setSelClipId(anchor)
    selIdsRef.current = arr
    selRef.current = anchor
    setSelKfId(null)
    setFramingMode(null)
    const last = anchor ? clipsRef.current.find((c) => c.id === anchor) : null
    if (last?.track_id) setSelTrackId(last.track_id)
  }
  function matchSelectedDurations() {
    const ids = selIdsRef.current
    if (!ids || ids.length < 2) return
    setClips((prev) => matchClipsToFirstDuration(prev, ids))
  }
  function moveLayer(clipId, action) {
    if (!clipId) return
    setClips((prev) => moveClipLayer(prev, clipId, action))
  }
  // Arrastrar un clip ya colocado fuera del bloque de pistas (o a la franja
  // superior de una ocupada) crea la pista y lo lleva allí. Se aplica al SOLTAR,
  // no en cada movimiento: crear pistas en el pointermove sería un desastre.
  function moveClipToNewTrack(clipId, side, start) {
    const clip = clipsRef.current.find((c) => c.id === clipId)
    if (!clip) return
    const kind = trackKindForClip(clip.kind)
    const trackId = addTrack(kind, undefined, side || 'above')
    const at = Number.isFinite(Number(start)) ? Math.max(0, Number(start)) : clip.start
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, track_id: trackId, start: +at.toFixed(3) } : c)))
    setSelTrackId(trackId)
  }

  function moveGroup(origs, deltaT) {
    setClips((prev) => groupMoveFromOrig(prev, origs, deltaT))
  }

  function localTOf(clip) {
    return Math.max(0, playheadRef.current - (clip.start || 0))
  }
  function applyStaticPose(c, patch) {
    if (c.kind === 'shape') {
      const shape = { ...(c.shape || {}) }
      if (patch.x != null) shape.x = patch.x
      if (patch.y != null) shape.y = patch.y
      if (patch.scale != null) shape.scale = patch.scale
      if (patch.rotation != null) shape.rotation = patch.rotation
      if (patch.opacity != null) shape.opacity = patch.opacity
      if (patch.draw != null) shape.draw = Math.min(1, Math.max(0, Number(patch.draw)))
      return { ...c, shape }
    }
    if (c.kind === 'text') {
      const style = { ...(c.style || {}) }
      if (patch.x != null) style.x = patch.x
      if (patch.y != null) style.y = patch.y
      if (patch.scale != null) style.scale = patch.scale
      if (patch.rotation != null) style.rotation = patch.rotation
      if (patch.opacity != null) style.opacity = patch.opacity
      if (patch.rot_x != null) style.rot_x = patch.rot_x
      if (patch.rot_y != null) style.rot_y = patch.rot_y
      return { ...c, style }
    }
    let next = { ...c }
    if (patch.volume != null) next.volume = clampVolume(patch.volume)
    const fxPatch = {}
    for (const key of AUDIO_FX_KEYS) {
      if (patch[key] != null && Number.isFinite(Number(patch[key]))) {
        fxPatch[key] = Math.min(1, Math.max(0, Number(patch[key])))
      }
    }
    if (Object.keys(fxPatch).length) {
      next.audio_fx = { ...(c.audio_fx && typeof c.audio_fx === 'object' ? c.audio_fx : {}), ...fxPatch }
    }
    if (patch.opacity != null) next.opacity = patch.opacity
    if (c.layout === 'overlay' || c.transform) {
      const tr = { ...newTransform(), ...c.transform }
      if (patch.x != null) tr.x = patch.x
      if (patch.y != null) tr.y = patch.y
      if (patch.scale != null) tr.scale = patch.scale
      if (patch.rotation != null) tr.rotation = patch.rotation
      // Conserva el encuadre (full o slot) si lo tiene; solo un overlay libre queda 'free'.
      next = { ...next, transform: tr, frame: (c.frame && c.frame !== 'free') ? c.frame : 'free' }
    }
    if (patch.cx != null || patch.cy != null || patch.zoom != null) {
      const rf = { ...(c.reframe || newReframe()) }
      if (patch.zoom != null) rf.zoom = patch.zoom
      next = { ...next, reframe: rf }
    }
    return next
  }
  // Mover una propiedad NO la anima: solo escribe su valor estático. El keyframe
  // aparece cuando el clip ya está animado (o cuando el usuario pulsa el rombo).
  // La regla vive en `shouldKeyframe`, que también cubre el caso del encuadre.
  function commitPose(id, patch) {
    const ids = new Set(selIdsRef.current.includes(id) ? selIdsRef.current : [id])
    setClips((prev) => prev.map((c) => {
      if (!ids.has(c.id) || !canKeyframe(c)) return c
      let next = applyStaticPose(c, patch)
      if (!shouldKeyframe(c, patch)) return next
      const t = localTOf(next)
      next = upsertKf(next, t, patch)
      if (c.id === id) markKf(next, t)
      return next
    }))
  }
  function interpAnimKf(k, mode, bezier) {
    const clip = selectedClip
    if (!clip || !k) return
    const patch = { interpolation: mode, ...(bezier ? { bezier } : {}) }
    setClips((prev) => prev.map((c) => (c.id === clip.id ? patchKeyframe(c, k.id, patch) : c)))
  }
  function deleteAnimKf(kf) {
    const clip = selectedClip
    if (!clip || !kf) return
    if (clip.keyframes?.enabled) {
      setClips((prev) => prev.map((c) => (c.id === clip.id ? deleteKeyframeItem(c, kf.id) : c)))
      if (selKfId === kf.id) setSelKfId(null)
      return
    }
    deleteKeyframe(clip, kf)
  }
  function changeReframe(id, patch) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, reframe: { ...(c.reframe || newReframe()), ...patch } } : c)))
  }
  function changeTransform(id, patch) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      let next = { ...c, frame: 'free', transform: { ...newTransform(), ...c.transform, ...patch } }
      if (!shouldKeyframe(c, patch)) return next
      const t = localTOf(next)
      next = upsertKf(next, t, flattenPatch(patch, 'transform'))
      markKf(next, t)
      return next
    }))
  }
  function upsertKeyframe(clip, localT, cx, cy, extra = {}) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      if (c.reframe?.dual_crop) {
        const rf = { ...(c.reframe || newReframe()) }
        const kfs = [...(rf.keyframes || [])]
        const t = +snapToFrame(clamp(localT, c.in_point, c.out_point), fpsRef.current).toFixed(6)
        const j = kfs.findIndex((k) => Math.abs(k.t - t) < kfSnap(fpsRef.current))
        let newId = null
        if (j >= 0) {
          kfs[j] = {
            ...kfs[j],
            t,
            cx: +cx.toFixed(4),
            cy: +cy.toFixed(4),
            ...(extra.zoom != null ? { zoom: extra.zoom } : {}),
            ...(extra.pan_mode ? { pan_mode: extra.pan_mode } : {}),
          }
          newId = kfs[j].id
        } else {
          const id = uid('k'); newId = id
          kfs.push({
            id, t, cx: +cx.toFixed(4), cy: +cy.toFixed(4),
            zoom: extra.zoom ?? rf.zoom ?? 1,
            pan_mode: extra.pan_mode ?? 'smooth',
          })
        }
        kfs.sort((a, b) => a.t - b.t)
        rf.keyframes = kfs
        if (newId) pendingKfSel.current = newId
        return { ...c, reframe: rf }
      }
      const t = localTOf(c)
      const next = upsertKf(c, t, {
        cx: +cx.toFixed(4),
        cy: +cy.toFixed(4),
        ...(extra.zoom != null ? { zoom: extra.zoom } : {}),
      })
      const posed = applyStaticPose(next, { cx, cy, ...(extra.zoom != null ? { zoom: extra.zoom } : {}) })
      markKf(posed, t)
      return posed
    }))
  }
  function srcTOf(c) {
    return clamp(timelineToSource(c, playheadRef.current), c.in_point, c.out_point)
  }
  // Recortar (botón del toolbar de la timeline → EdCropModal, como CapCut).
  function canCropClip(c) {
    return !!(c && isVisualClip(c) && isOverlay(c) && mediaEls.current.get(c.id))
  }
  function openCrop() {
    const clip = clipsRef.current.find((c) => c.id === selRef.current)
    if (!canCropClip(clip)) return
    if (playingRef.current) stopPlayback()
    const head = playheadRef.current
    if (head < clip.start || head >= clipEnd(clip)) scrub(clip.start + 0.02)
    setCropClipId(clip.id)
  }
  function confirmCrop({ crop, rotation }) {
    const clip = clipsRef.current.find((c) => c.id === cropClipId)
    setCropClipId(null)
    if (!clip) return
    const rf = clip.reframe || newReframe()
    const cx = +crop.cx.toFixed(4)
    const cy = +crop.cy.toFixed(4)
    const size = { crop_w: +crop.wf.toFixed(4), crop_h: +crop.hf.toFixed(4) }
    if (keyframesOn(clip) || (rf.keyframes || []).length > 1) {
      // Clip animado (keyframes o seguimiento de cara): el recorte entra como keyframe
      // en el cabezal, igual que antes, para no aplanar el movimiento.
      changeReframe(clip.id, size)
      upsertKeyframe(clip, srcTOf(clip), cx, cy)
    } else {
      // Clip estático: recorte fijo en todo el clip (lo que hace CapCut).
      const k0 = (rf.keyframes || [])[0]
      changeReframe(clip.id, {
        ...size,
        keyframes: [{
          id: k0?.id || uid('k'), t: clip.in_point, cx, cy,
          zoom: k0?.zoom ?? rf.zoom ?? 1, pan_mode: k0?.pan_mode || 'smooth',
        }],
      })
    }
    const rot = +(Number(rotation) || 0).toFixed(2)
    if (Math.abs((clip.transform?.rotation || 0) - rot) > 0.009) changeTransform(clip.id, { rotation: rot })
  }
  // Rombo de tres estados: sin animar → activa la animación sembrando el primer
  // keyframe; animado sin KF aquí → lo crea; con KF aquí → lo quita.
  function toggleKeyframeAtPlayhead() {
    const clip = selectedClip
    if (!clip || !canKeyframe(clip)) return
    const t = clamp(localTOf(clip), 0, clipDur(clip))
    const st = kfState(clip, t, fpsRef.current)
    if (st === 'on') {
      deleteAnimKf({ id: keyframeIdAt(clip, t, fpsRef.current) })
      return
    }
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const next = st === 'off' ? enableKeyframes(c, t, srcTOf(c)) : upsertKf(c, t, {})
      markKf(next, t)
      return next
    }))
  }
  // Al apagar la animación se hornea el valor visible en el cabezal para que el
  // clip no salte; los keyframes se conservan por si se vuelve a activar.
  function setClipAnimated(on) {
    const clip = selectedClip
    if (!clip || !canKeyframe(clip)) return
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const t = clamp(localTOf(c), 0, clipDur(c))
      if (on) {
        const next = enableKeyframes(c, t, srcTOf(c))
        markKf(next, t)
        return next
      }
      const props = clipPropsAt(c, t, srcTOf(c))
      return disableKeyframes(applyStaticMask(applyStaticPose(c, props), props))
    }))
    if (!on) setSelKfId(null)
  }

  // --- Portapapeles de keyframes ---------------------------------------------
  // `kf` llega desde la lista del panel; sin él se copia el del cabezal.
  function copyKeyframe(kf) {
    const clip = selectedClip
    if (!clip || !canKeyframe(clip)) return false
    const t = kf?.t != null ? kf.t : clamp(localTOf(clip), 0, clipDur(clip))
    const board = copyKeyframeAt(clip, t, fpsRef.current)
    if (!board) return false
    setKfBoard(board)
    return true
  }
  function pasteKeyframe() {
    const clip = selectedClip
    const board = kfBoardRef.current
    if (!clip || !canKeyframe(clip) || !board) return false
    const t = clamp(localTOf(clip), 0, clipDur(clip))
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const next = pasteKeyframeAt(c, t, board, kfGroupsRef.current, fpsRef.current)
      markKf(next, t)
      return next
    }))
    return true
  }
  // Duplicar conserva TODOS los valores del keyframe y solo cambia su instante.
  function duplicateKeyframe(kf) {
    const clip = selectedClip
    const id = kf?.id || selKfRef.current
    if (!clip || !id) return false
    const items = normalizeItems(clip.keyframes?.items)
    const item = items.find((k) => k.id === id)
    if (!item) return false
    const dur = clipDur(clip)
    // Al hueco siguiente: el cabezal si está libre, si no un segundo después.
    const head = clamp(localTOf(clip), 0, dur)
    const free = Math.abs(head - item.t) > kfSnap(fpsRef.current)
    const target = clamp(free ? head : item.t + 1, 0, dur)
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const next = duplicateKeyframeAt(c, id, target, fpsRef.current)
      markKf(next, target)
      return next
    }))
    return true
  }
  function toggleKfGroup(gid) {
    setKfGroups((prev) => (prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]))
  }
  // El handler de teclado se registra una sola vez: alcanza las versiones
  // frescas por ref, como hace `histRef`.
  kfOpsRef.current = { copyKeyframe, pasteKeyframe, duplicateKeyframe }
  // Voltear (#7) los clips seleccionados (vídeo, imagen, figura o texto). Con varios
  // seleccionados todos quedan como el opuesto del clip principal.
  function toggleFlip(axis, only) {
    const key = axis === 'v' ? 'flip_v' : 'flip_h'
    const ids = new Set(only ? [only] : selIdsRef.current)
    setClips((prev) => {
      const primary = prev.find((c) => c.id === (only || selRef.current)) || prev.find((c) => ids.has(c.id))
      const next = !primary?.[key]
      return prev.map((c) => (ids.has(c.id) && c.kind !== 'audio' ? { ...c, [key]: next } : c))
    })
  }
  // --- Marcadores y beats (#12) ---
  // M: marcador en el cursor (o lo quita si ya hay uno ahí).
  function toggleMarker(t = playheadRef.current) {
    setMarkers((prev) => toggleMarkerAt(prev, t, fpsRef.current))
  }
  function patchMarker(id, patch) {
    setMarkers((prev) => normalizeMarkers(patch ? prev.map((m) => (m.id === id ? { ...m, ...patch } : m)) : prev.filter((m) => m.id !== id)))
  }
  // Salta al siguiente / anterior marcador o beat (, y . como en CapCut: ←/→ ya mueven el cursor).
  function jumpSnap(dir) {
    const t = nextSnapTime(markersRef.current, clipsRef.current, playheadRef.current, dir)
    if (t != null) seek(t)
  }
  const [beatBusy, setBeatBusy] = useState(null)   // clipId mientras se detectan
  async function detectClipBeats(clipId) {
    const clip = clipsRef.current.find((c) => c.id === clipId)
    if (!clip || (clip.kind !== 'audio' && clip.kind !== 'video') || beatBusy) return
    setBeatBusy(clipId)
    try {
      const res = await apiDetectBeats(project.id, clip)
      setClips((prev) => prev.map((c) => (c.id === clipId
        ? { ...c, beats: { times: res.times || [], bpm: res.bpm || 0, every: clipBeats(c)?.every || 1 } } : c)))
      setClipToast({ type: 'success', message: `${(res.times || []).length} beats · ${Math.round(res.bpm || 0)} BPM` })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudieron detectar los beats.' })
    } finally {
      setBeatBusy(null)
    }
  }
  function setClipBeats(clipId, patch) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clipId) return c
      if (!patch) return { ...c, beats: undefined }
      return { ...c, beats: { ...(c.beats || {}), ...patch } }
    }))
  }

  // Congelar fotograma (#11): el backend saca el fotograma del cabezal como imagen
  // del proyecto y aquí se parte el vídeo y se inserta esa imagen (3 s) con la
  // misma pose, recorte y efectos (lib/freezeFrame.js). Un solo paso de deshacer.
  const [freezeBusy, setFreezeBusy] = useState(false)
  async function freezeAtPlayhead(clipId) {
    const clip = clipsRef.current.find((c) => c.id === (clipId || selRef.current))
    const head = playheadRef.current
    if (!canFreeze(clip, head) || freezeBusy) return
    setFreezeBusy(true)
    try {
      const { image } = await apiFreezeFrame(project.id, clip, freezeSourceTime(clip, head))
      const frozen = frozenClipFrom(clip, image, head, FREEZE_DUR)
      setClips((prev) => insertFreeze(prev, clip.id, head, frozen, uid('c')))
      setSelClipId(frozen.id)
      setSelClipIds([frozen.id])
      onChange?.()     // la imagen aparece en el material del proyecto
      setClipToast({ type: 'success', message: 'Fotograma congelado (3 s)' })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo congelar el fotograma.' })
    } finally {
      setFreezeBusy(false)
    }
  }
  // Desactivar / activar (#10, tecla V) los clips seleccionados: siguen en la
  // timeline pero no se ven, no suenan ni se exportan. Con varios, todos quedan al
  // revés que el principal.
  function toggleDisabled(only) {
    const ids = new Set(only ? [only] : selIdsRef.current)
    if (!ids.size) return
    setClips((prev) => {
      const primary = prev.find((c) => c.id === (only || selRef.current)) || prev.find((c) => ids.has(c.id))
      const next = !primary?.disabled
      return prev.map((c) => (ids.has(c.id) ? { ...c, disabled: next || undefined } : c))
    })
  }
  // Modo de fusión (#8) de los clips seleccionados (no audio).
  function setBlendMode(mode) {
    const ids = new Set(selIdsRef.current)
    const value = mode && mode !== 'normal' ? mode : undefined
    setClips((prev) => prev.map((c) => (ids.has(c.id) && c.kind !== 'audio' ? { ...c, blend_mode: value } : c)))
  }
  function applySelectedFade(side) {
    const ids = new Set(selIdsRef.current)
    setClips((prev) => prev.map((c) => {
      if (!ids.has(c.id) || (c.kind !== 'audio' && c.kind !== 'video')) return c
      return applyVolumeFade(c, clipDur(c), side)
    }))
  }
  function deleteKeyframe(clip, kf) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id || !c.reframe) return c
      return {
        ...c,
        reframe: {
          ...c.reframe,
          keyframes: (c.reframe.keyframes || []).filter((k) => k.id !== kf.id),
          keyframes2: (c.reframe.keyframes2 || []).filter((k) => k.id !== kf.id),
        },
      }
    }))
    if (selKfId === kf.id) setSelKfId(null)
  }
  function deleteSelectedKeyframe() {
    const clip = selectedClip
    if (!clip || selKfId == null) return
    if (clip.keyframes?.enabled) {
      deleteAnimKf({ id: selKfId })
      return
    }
    const kf = [...(clip.reframe?.keyframes || []), ...(clip.reframe?.keyframes2 || [])].find((k) => k.id === selKfId)
    if (kf) deleteKeyframe(clip, kf)
  }
  function moveKeyframe(clipId, kfId, newT, extra) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clipId) return c
      if (c.keyframes?.enabled) {
        const patch = { t: newT }
        if (extra?.props) patch.props = extra.props
        return patchKeyframe(c, kfId, patch, fpsRef.current)
      }
      if (!c.reframe) return c
      const kfs = (c.reframe.keyframes || []).map((k) => (k.id === kfId ? { ...k, t: newT } : k))
      return { ...c, reframe: { ...c.reframe, keyframes: kfs } }
    }))
    const c = clipsRef.current.find((x) => x.id === clipId) || clips.find((x) => x.id === clipId)
    if (c?.keyframes?.enabled) seek(c.start + newT)
    else if (c) seek(sourceToTimeline(c, newT))
  }
  function selectTimelineKf(id) {
    setSelKfId(id)
    const clip = selectedClip
    if (!clip || id == null) return
    if (clip.keyframes?.enabled) {
      const k = normalizeItems(clip.keyframes.items).find((x) => x.id === id)
      if (k) seek(clip.start + k.t)
      return
    }
    const k = [...(clip.reframe?.keyframes || []), ...(clip.reframe?.keyframes2 || [])].find((x) => x.id === id)
    if (k) seek(sourceToTimeline(clip, k.t))
  }

  // --- Texto ---
  function ensureTextTrack(style) {
    const sel = tracksRef.current.find((t) => t.id === selTrackId)
    if (sel && sel.kind === 'text') return sel.id
    const existing = tracksRef.current.find((t) => t.kind === 'text')
    if (existing) return existing.id
    return addTrack('text', style)
  }
  function addText(preset) {
    const tid = ensureTextTrack()
    const track = tracksRef.current.find((t) => t.id === tid)
    const fromTrack = track?.style || {}
    let style = {
      ...defaultTextStyle(),
      x: fromTrack.x ?? 0.5,
      y: fromTrack.y ?? 0.5,
      w: fromTrack.w ?? 0.8,
      size: fromTrack.size ?? defaultTextStyle().size,
      opacity: fromTrack.opacity ?? 1,
    }
    if (preset) style = applyThemeToStyle(style, preset)
    const end = clipsRef.current.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
    const dur = Math.max(3, +(end - playhead).toFixed(3))
    const clip = makeTextClip(tid, playhead, dur, preset?.sample || 'Texto', style)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
    setSelKfId(null)
    setMatTab('text')
  }
  function changeText(id, text) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, text, name: (text || 'Texto').slice(0, 22) } : c)))
  }
  function changeStyle(id, patch) {
    const ids = selIdsRef.current.includes(id) ? selIdsRef.current : [id]
    setClips((prev) => patchClipsStyle(prev, ids, patch).map((c) => {
      if (!ids.includes(c.id)) return c
      const pose = flattenPatch(patch, 'text')
      if (!Object.keys(pose).length || !shouldKeyframe(c, pose)) return c
      const t = localTOf(c)
      const next = upsertKf(c, t, pose)
      if (c.id === id) markKf(next, t)
      return next
    }))
  }
  function changeShape(id, patch) {
    const ids = new Set(selIdsRef.current.includes(id) ? selIdsRef.current : [id])
    setClips((prev) => prev.map((c) => {
      if (!(ids.has(c.id) && c.kind === 'shape')) return c
      let next = { ...c, shape: { ...(c.shape || {}), ...patch } }
      const pose = flattenPatch(patch, 'shape')
      if (Object.keys(pose).length && shouldKeyframe(c, pose)) {
        const t = localTOf(next)
        next = upsertKf(next, t, pose)
        if (c.id === id) markKf(next, t)
      }
      return next
    }))
  }
  // --- Máscaras del clip -------------------------------------------------
  // La geometría (mx/my/mw/mh/msx/msy/mrot/mfeather) es animable y viaja por el
  // MISMO sistema de keyframes que la pose; el resto son campos estáticos.
  function patchFirstMask(id, build) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const masks = clipMasks(c)
      const next = build(masks, c)
      return next ? { ...c, masks: next } : c
    }))
  }
  function addMask(type, target = 'clip') {
    const clip = selectedClip
    if (!clip) return
    patchFirstMask(clip.id, (masks) => [{ ...defaultMask(type, outAspect), target }, ...masks])
    setMaskMode(true)
  }
  // "Ajustar → Aplicar solo en una zona": máscara de ajuste (círculo difuminado)
  // como masks[0], salvo que ya lo sea.
  function addAdjustMask() {
    const clip = selectedClip
    if (!clip) return
    if (clipMasks(clip)[0]?.target === 'adjust') { setMaskMode(true); return }
    patchFirstMask(clip.id, (masks) => [
      { ...defaultMask('circle', outAspect), target: 'adjust', feather: 0.06 }, ...masks,
    ])
    setMaskMode(true)
  }
  // "Seguir" (CapCut): la máscara sigue la cara. Usa el seguimiento de caras del
  // material (cacheado) y lo convierte en keyframes de posición de la máscara.
  const [maskFollow, setMaskFollow] = useState(null)   // {clipId, progress, message} | null
  async function followMaskFace() {
    const clip = clipsRef.current.find((c) => c.id === selRef.current)
    if (!clip || clip.kind !== 'video' || !clipMasks(clip).length || maskFollow) return
    if ((clip.asset_scope || 'project') !== 'project' || clip.asset_kind !== 'clips') {
      setClipToast({ type: 'error', message: 'Seguir solo funciona con vídeos del material del proyecto.' })
      return
    }
    const el = mediaEls.current.get(clip.id)
    const sz = mediaSize(el)
    if (!sz.w) return
    setMaskFollow({ clipId: clip.id, progress: 0.02, message: 'Buscando la cara…' })
    try {
      let job = await faceTrackMaterial(project.id, clip.asset_id, { start: clip.in_point, end: clip.out_point })
      while (job.status !== 'done' && job.status !== 'error') {
        await new Promise((r) => setTimeout(r, 500))
        job = await getJob(job.id)
        setMaskFollow((m) => (m ? { ...m, progress: job.progress || m.progress, message: job.message || m.message } : m))
      }
      if (job.status === 'error') throw new Error(job.error || 'No se pudo seguir la cara.')
      const fresh = clipsRef.current.find((c) => c.id === clip.id)
      const keys = fresh ? followTrackMaskKeys(fresh, job.reframe_prep?.track || [],
        { srcW: sz.w, srcH: sz.h, outW, outH }) : []
      if (!keys.length) throw new Error('No se detectó ninguna cara en este tramo.')
      setClips((prev) => prev.map((c) => {
        if (c.id !== clip.id) return c
        let next = keyframesOn(c) ? c : enableKeyframes(c, keys[0].t, srcTOf(c))
        for (const k of keys) next = upsertKf(next, k.t, { mx: k.mx, my: k.my })
        return next
      }))
      setClipToast({ type: 'success', message: `La máscara sigue la cara (${keys.length} keyframes).` })
    } catch (e) {
      setClipToast({ type: 'error', message: e.message || 'No se pudo seguir la cara.' })
    } finally {
      setMaskFollow(null)
    }
  }
  function removeMask() {
    const clip = selectedClip
    if (!clip) return
    patchFirstMask(clip.id, (masks) => (masks.length ? masks.slice(1) : null))
    setMaskDraw(false)
  }
  function duplicateMask() {
    const clip = selectedClip
    if (!clip) return
    patchFirstMask(clip.id, (masks) => {
      if (!masks.length) return null
      const copy = { ...masks[0], id: maskId(), x: masks[0].x + 0.06, y: masks[0].y + 0.06 }
      return [masks[0], copy, ...masks.slice(1)]
    })
  }
  // Cambiar de tipo re-siembra el tamaño por defecto de la forma nueva; los
  // keyframes sueltan mw/mh/msx/msy para no arrastrar la medida de la anterior.
  function retypeMask(masks, type) {
    const base = defaultMask(type, outAspect)
    return {
      ...base,
      id: masks[0].id,
      enabled: masks[0].enabled,
      x: masks[0].x,
      y: masks[0].y,
      rotation: masks[0].rotation,
      feather: masks[0].feather,
      invert: masks[0].invert,
      opacity: masks[0].opacity,
      target: masks[0].target,
    }
  }
  function dropMaskSizeKfs(clip) {
    if (!clip.keyframes?.enabled) return clip
    const drop = new Set(['mw', 'mh', 'msx', 'msy'])
    const items = (clip.keyframes.items || []).map((k) => {
      const props = { ...(k.props || {}) }
      for (const key of drop) delete props[key]
      return { ...k, props }
    })
    return { ...clip, keyframes: { ...clip.keyframes, items } }
  }
  function changeMask(id, patch) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const masks = clipMasks(c)
      if (!masks.length) return c
      const retype = patch.type && patch.type !== masks[0].type
      const first = retype
        ? retypeMask(masks, patch.type)
        : normalizeMask({ ...masks[0], ...patch })
      const next = { ...c, masks: [first, ...masks.slice(1)] }
      return retype ? dropMaskSizeKfs(next) : next
    }))
  }
  function applyStaticMask(c, patch) {
    const masks = clipMasks(c)
    if (!masks.length) return c
    const first = { ...masks[0] }
    const fields = {
      mx: 'x', my: 'y', mw: 'w', mh: 'h',
      msx: 'scale_x', msy: 'scale_y', mrot: 'rotation', mfeather: 'feather',
    }
    for (const key of MASK_KF_KEYS) {
      if (patch[key] != null && Number.isFinite(Number(patch[key]))) {
        first[fields[key]] = Number(patch[key])
      }
    }
    return { ...c, masks: [normalizeMask(first), ...masks.slice(1)] }
  }
  function commitMask(id, patch) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id || !clipMasks(c).length) return c
      let next = applyStaticMask(c, patch)
      if (!shouldKeyframe(c, patch)) return next
      const t = localTOf(next)
      next = upsertKf(next, t, patch)
      markKf(next, t)
      return next
    }))
  }
  const onMaskPanel = useCallback((open) => {
    setMaskMode(open)
    if (!open) setMaskDraw(false)
  }, [])

  // --- Eliminar fondo ----------------------------------------------------
  // Todo vive en `clip.bg_removal`: entra por el mismo setClips que el resto de
  // propiedades, así que el undo/redo del editor (snapshot con debounce) lo
  // cubre sin código extra — arrastrar un slider colapsa en un solo estado, y
  // aplicar un trazo o activar/desactivar sí dejan un paso reversible.
  function patchBg(id, build) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const next = build(clipBg(c) || defaultBg(), c)
      return next === undefined ? c : { ...c, bg_removal: next }
    }))
  }
  function patchBgAuto(id, patch) {
    patchBg(id, (bg) => normalizeBg({ ...bg, auto: { ...bg.auto, ...patch } }))
  }
  function patchBgChroma(id, patch) {
    patchBg(id, (bg) => normalizeBg({ ...bg, chroma: { ...bg.chroma, ...patch } }))
  }
  // Contorno / halo del sujeto recortado (#9).
  function patchBgOutline(id, patch) {
    patchBg(id, (bg) => normalizeBg({ ...bg, outline: { ...bg.outline, ...patch } }))
  }

  // Eliminación AUTOMÁTICA y PERSONALIZADA comparten `bg_removal.auto` y se
  // excluyen, como en CapCut: la familia del modelo decide cuál está activa
  // (U²-Net = automática, SAM = personalizada). Pasar de una a otra descarta
  // las marcas, porque significan cosas distintas en cada una (corrección fija
  // vs. prompt que se sigue); el cambio entra en el undo como cualquier otro.
  const toggleBgAuto = (on) => {
    const clip = selectedClip
    if (!clip) return
    const bg = clipBg(clip) || defaultBg()
    const fromSam = on && isInteractiveProvider(bg.auto.provider)
    patchBgAuto(clip.id, {
      enabled: !!on,
      ...(fromSam ? { provider: DEFAULT_PROVIDER, edits: [], base_key: '', status: 'idle', error: null } : {}),
    })
    if (fromSam) { resetCutout(clip.id); stopBgAnalyze(clip.id) }
    if (!on || fromSam) setBgBrush((b) => ({ ...b, on: false }))
  }
  const toggleBgCustom = (on) => {
    const clip = selectedClip
    if (!clip) return
    const bg = clipBg(clip) || defaultBg()
    if (!on) {
      patchBgAuto(clip.id, { enabled: false })
      setBgBrush((b) => ({ ...b, on: false }))
      stopBgAnalyze(clip.id)
      return
    }
    const fromAuto = !isInteractiveProvider(bg.auto.provider)
    patchBgAuto(clip.id, {
      enabled: true,
      provider: preferredSamProvider(bg.auto.provider, bgInfo.providers),
      ...(fromAuto ? { edits: [], base_key: '', status: 'idle', error: null } : {}),
    })
    if (fromAuto) resetCutout(clip.id)
    onBgBrush({ on: true, tool: 'smart', op: 'keep', size: 0.05 })
  }
  // Saltar a un fotograma marcado (tiempo de la FUENTE → timeline).
  const seekBgMark = (srcT) => {
    const clip = selectedClip
    if (!clip) return
    if (playingRef.current) stopPlayback()
    seek(clamp(sourceToTimeline(clip, srcT), clip.start || 0, clipEnd(clip)))
  }

  // Lo que los endpoints de Eliminar fondo necesitan del clip: el DESCRIPTOR
  // (material + tramo), no su id. Así no hay carrera con el autosave y funciona
  // con clips recién añadidos que todavía no están guardados en el servidor.
  function bgClipDescriptor(clip) {
    return {
      clip_id: clip.id,
      kind: clip.kind,
      asset_kind: clip.asset_kind,
      asset_id: String(clip.asset_id ?? ''),
      filename: clip.filename,
      asset_scope: clip.asset_scope || 'project',
      in_point: clip.in_point,
      out_point: clip.out_point,
      source_duration: clip.source_duration,
    }
  }

  // Lanza el cálculo del matte.
  function applyBgAuto() {
    startBgAutoFor(selectedClip)
  }
  function startBgAutoFor(clip) {
    if (!clip || !bgCapable(clip)) return
    const bg = clipBg(clip) || defaultBg()
    patchBgAuto(clip.id, { enabled: true, status: 'running', error: null })
    createBgRemovalJob(project.id, { ...bgClipDescriptor(clip), auto: bg.auto })
      .then((job) => setBgJob({ ...job, clipId: clip.id }))
      .catch((e) => {
        patchBgAuto(clip.id, { status: 'error', error: e.message })
        setBgJob({ status: 'error', error: e.message, clipId: clip.id })
      })
  }

  function cancelBgAuto() {
    if (!bgJob?.id) return
    cancelJob(bgJob.id).catch(() => {})
    setBgJob((j) => (j ? { ...j, message: 'Cancelando…' } : j))
  }

  // "Exportar recorte": hornea el clip con el fondo eliminado a un WebM
  // transparente y lo añade al material como vídeo. A diferencia de la propiedad
  // no destructiva, esto CONSERVA la animación en un archivo reutilizable —
  // vídeo o GIF salen como vídeo, no como imagen estática.
  function exportBgCutout() {
    const clip = selectedClip
    if (!clip || !bgCapable(clip)) return
    const bg = clipBg(clip)
    if (!bg || !(autoActive(bg) || bg.chroma?.enabled)) return
    setCutoutJob({ status: 'running', progress: 0, message: 'Preparando el recorte…' })
    createBgCutoutJob(project.id, {
      clip_id: clip.id,
      kind: clip.kind,
      asset_kind: clip.asset_kind,
      asset_id: String(clip.asset_id ?? ''),
      filename: clip.filename,
      asset_scope: clip.asset_scope || 'project',
      in_point: clip.in_point,
      out_point: clip.out_point,
      source_duration: clip.source_duration,
      label: clip.name || undefined,
      bg_removal: clip.bg_removal,
    })
      .then((job) => setCutoutJob({ ...job }))
      .catch((e) => setCutoutJob({ status: 'error', error: e.message }))
  }

  function cancelBgCutout() {
    if (!cutoutJob?.id) return
    cancelJob(cutoutJob.id).catch(() => {})
    setCutoutJob((j) => (j ? { ...j, message: 'Cancelando…' } : j))
  }

  // Aplicar la Eliminación personalizada = el job de siempre: con SAM, el
  // backend sigue la selección desde los fotogramas marcados por todo el clip.
  // El análisis en segundo plano se detiene: lo analizado ya está en caché y el
  // job continúa desde ahí (dos hilos encodeando a la vez solo se estorban).
  function applyBgCustom() {
    if (selectedClip) stopBgAnalyze(selectedClip.id)
    applyBgAuto()
    setBgBrush((b) => ({ ...b, on: false }))
  }

  // Análisis en segundo plano (el «Procesando…» de CapCut): en cuanto el objeto
  // tiene selección, se analizan los demás fotogramas del clip mientras el
  // usuario sigue marcando, para que Aplicar solo tenga que seguirla. Una vez
  // por clip, tramo y modelo; solo en material animado (vídeo o GIF).
  function maybeAnalyzeBg(clip, auto) {
    if (!bgAliveRef.current) return
    if (!clip || !(clip.kind === 'video' || /\.gif(\?|#|$)/i.test(clip.filename || ''))) return
    const key = [clip.id, clip.filename, clip.in_point, clip.out_point,
      auto.provider, auto.mask_fps, auto.mask_height].join('|')
    if (bgAnalyzedRef.current.has(key)) return
    const job = bgJobRef.current
    if (job?.clipId === clip.id && (job.status === 'pending' || job.status === 'running')) return
    const cur = bgAnalyzeRef.current
    if (cur && (cur.status === 'pending' || cur.status === 'running')) cancelJob(cur.id).catch(() => {})
    bgAnalyzedRef.current.add(key)
    createBgAnalyzeJob(project.id, { ...bgClipDescriptor(clip), auto })
      .then((j) => {
        if (bgAliveRef.current) setBgAnalyze({ ...j, clipId: clip.id })
        else cancelJob(j.id).catch(() => {})
      })
      .catch(() => { /* es una optimización: Aplicar analiza lo que falte */ })
  }
  // Al cerrar el editor el análisis se detiene: nadie va a esperar su resultado.
  useEffect(() => {
    bgAliveRef.current = true
    return () => {
      bgAliveRef.current = false
      const cur = bgAnalyzeRef.current
      if (cur?.id && (cur.status === 'pending' || cur.status === 'running')) cancelJob(cur.id).catch(() => {})
    }
  }, [])
  function stopBgAnalyze(clipId) {
    const cur = bgAnalyzeRef.current
    if (!cur || (clipId && cur.clipId !== clipId)) return
    if (cur.status === 'pending' || cur.status === 'running') cancelJob(cur.id).catch(() => {})
    setBgAnalyze(null)
  }

  const changeBgAuto = (patch) => {
    const clip = selectedClip
    if (!clip) return
    // Cambiar de modelo o la estabilización obliga a recalcular: el matte
    // cacheado es de otra base_key.
    const resets = (patch.provider !== undefined || patch.stabilize !== undefined)
      ? { base_key: '', status: 'idle', error: null }
      : {}
    patchBgAuto(clip.id, { ...patch, ...resets })
    resetCutout(clip.id)
    if (patch.provider !== undefined) stopBgAnalyze(clip.id)
  }

  // Un trazo = una entrada de `edits`; arrastrar solo alarga la última. Se
  // guarda en el espacio normalizado de la FUENTE, así que sigue pegado al
  // sujeto aunque después se recorte, se mueva o se anime el clip.
  const addBgStroke = useCallback((id, stroke) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const bg = clipBg(c) || defaultBg()
      return {
        ...c,
        bg_removal: normalizeBg({ ...bg, auto: { ...bg.auto, edits: [...bg.auto.edits, stroke] } }),
      }
    }))
  }, [])

  const extendBgStroke = useCallback((id, point) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const bg = clipBg(c)
      if (!bg?.auto.edits.length) return c
      const edits = bg.auto.edits.slice()
      const last = edits[edits.length - 1]
      edits[edits.length - 1] = { ...last, points: [...last.points, point] }
      return { ...c, bg_removal: normalizeBg({ ...bg, auto: { ...bg.auto, edits } }) }
    }))
  }, [])

  function undoBgEdit() {
    const clip = selectedClip
    if (!clip) return
    patchBg(clip.id, (bg) => normalizeBg({
      ...bg, auto: { ...bg.auto, edits: bg.auto.edits.slice(0, -1) },
    }))
  }
  function clearBgEdits() {
    const clip = selectedClip
    if (clip) patchBgAuto(clip.id, { edits: [] })
  }

  const onBgBrush = (patch) => {
    setBgBrush((b) => ({ ...b, ...patch }))
    // El pincel y la manipulación de la máscara no pueden convivir: se pisan el
    // puntero. Al encender uno se apaga el otro.
    if (patch.on) { setMaskMode(false); setMaskDraw(false); setChromaPick(false) }
  }

  const toggleBgChroma = (on) => {
    const clip = selectedClip
    if (!clip) return
    patchBgChroma(clip.id, { enabled: !!on })
    if (!on) setChromaPick(false)
  }
  const changeBgChroma = (patch) => {
    if (selectedClip) patchBgChroma(selectedClip.id, patch)
  }
  const resetBgChroma = () => {
    const clip = selectedClip
    if (!clip) return
    patchBg(clip.id, (bg) => normalizeBg({ ...bg, chroma: { enabled: bg.chroma.enabled } }))
  }
  const onPickChroma = (on) => {
    setChromaPick(!!on)
    if (on) setBgBrush((b) => ({ ...b, on: false }))
  }

  // El panel abierto es lo que mantiene vivo el pincel sobre el reproductor.
  const onBgPanel = useCallback((open) => {
    if (!open) {
      setBgBrush((b) => (b.on ? { ...b, on: false } : b))
      setChromaPick(false)
    }
  }, [])

  // Fondo de vista previa (solo preview). `file` carga imagen/vídeo de prueba.
  const onBgPreview = useCallback((patch) => {
    if (patch?.file) {
      const isVideo = /^video\//.test(patch.file.type || '')
      const url = URL.createObjectURL(patch.file)
      if (bgPreviewUrlRef.current) URL.revokeObjectURL(bgPreviewUrlRef.current)
      bgPreviewUrlRef.current = url
      if (isVideo) {
        const v = document.createElement('video')
        v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true
        v.play?.().catch(() => {})
        bgPreviewElRef.current = v
      } else {
        const img = new Image()
        img.src = url
        bgPreviewElRef.current = img
      }
      setBgPreview((p) => ({ ...p, mode: 'media', kind: isVideo ? 'video' : 'image' }))
      return
    }
    if (patch?.mode && patch.mode !== 'media') {
      if (bgPreviewUrlRef.current) { URL.revokeObjectURL(bgPreviewUrlRef.current); bgPreviewUrlRef.current = '' }
      bgPreviewElRef.current = null
    }
    setBgPreview((p) => ({ ...p, ...patch }))
  }, [])

  // Revocar el objectURL del fondo de prueba al desmontar.
  useEffect(() => () => {
    if (bgPreviewUrlRef.current) URL.revokeObjectURL(bgPreviewUrlRef.current)
  }, [])

  // Cursor del pincel sobre el lienzo (el círculo lo dibuja drawComposite).
  function onCanvasBgMove(e) {
    if (!bgBrushRef.current.on) return
    const canvas = mainCanvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    setBgBrush((b) => ({
      ...b,
      px: (e.clientX - r.left) * (canvas.width / (r.width || 1)),
      py: (e.clientY - r.top) * (canvas.height / (r.height || 1)),
    }))
  }
  function onCanvasBgLeave() {
    if (bgBrushRef.current.px != null) setBgBrush((b) => ({ ...b, px: null, py: null }))
  }

  // Cuentagotas: toma el color del PÍXEL COMPUESTO bajo el puntero, que es lo
  // que el usuario ve. Devuelve true si consumió el clic.
  function pickChromaAt(e) {
    if (!chromaPickRef.current) return false
    const canvas = mainCanvasRef.current
    const clip = selectedClip
    if (!canvas || !clip) return false
    const r = canvas.getBoundingClientRect()
    const x = Math.round((e.clientX - r.left) * (canvas.width / (r.width || 1)))
    const y = Math.round((e.clientY - r.top) * (canvas.height / (r.height || 1)))
    try {
      const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data
      const hex = [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
      patchBgChroma(clip.id, { color: `#${hex.toUpperCase()}`, enabled: true })
    } catch { /* lienzo no legible: ignorar */ }
    setChromaPick(false)
    return true
  }

  // Catálogo de modelos + device efectivo (una vez por sesión del editor).
  useEffect(() => {
    let alive = true
    listBgProviders()
      .then((r) => {
        if (alive) setBgInfo({ providers: r.providers || [], device: r.onnx_selected || '' })
      })
      .catch(() => { /* sin catálogo se usan los ids por defecto */ })
    return () => { alive = false }
  }, [])

  // Sondeo del job del matte.
  useEffect(() => {
    if (!bgJob?.id || bgJob.status === 'done' || bgJob.status === 'error') return undefined
    const id = setInterval(async () => {
      try {
        const j = await getJob(bgJob.id)
        setBgJob({ ...j, clipId: bgJob.clipId })
      } catch { /* reintenta */ }
    }, 700)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgJob?.id, bgJob?.status])

  // Sondeo del job "Exportar recorte".
  useEffect(() => {
    if (!cutoutJob?.id || cutoutJob.status === 'done' || cutoutJob.status === 'error') return undefined
    const id = setInterval(async () => {
      try { setCutoutJob({ ...(await getJob(cutoutJob.id)) }) } catch { /* reintenta */ }
    }, 800)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoutJob?.id, cutoutJob?.status])

  // Al terminar el recorte, refrescar el material (aparece el nuevo vídeo
  // transparente en Vídeos) y limpiar el aviso tras unos segundos.
  useEffect(() => {
    if (cutoutJob?.status === 'done') {
      onChange?.()
      const t = setTimeout(() => setCutoutJob(null), 3200)
      return () => clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoutJob?.status])

  // Eliminación personalizada (como CapCut): mientras una herramienta está
  // activa, el clip se ve SIN recortar con la selección del fotograma actual
  // encima. bgMagic.js la compone al instante (pincel/borrador normal, línea de
  // los trazos inteligentes); aquí solo se pide a SAM la selección de los trazos
  // INTELIGENTES, y al SOLTAR el trazo. El encode del fotograma se cachea en el
  // backend: solo el primer trazo en un fotograma es lento.
  const magicBg = selectedClip ? clipBg(selectedClip) : null
  const magicOn = !!(bgBrush.on && magicBg?.auto?.enabled && isInteractiveProvider(magicBg.auto.provider))
  // Fotograma del matte bajo el cabezal (el panel resalta si está marcado).
  const bgCurFrame = magicBg?.auto ? matteFrameIndex(srcTOf(selectedClip), magicBg.auto.mask_fps) : -1
  const magicFrame = magicOn ? bgCurFrame : -1
  const magicMarks = magicOn ? editsAtFrame(magicBg.auto.edits, magicFrame, magicBg.auto.mask_fps) : []
  magicRef.current = {
    on: magicOn, clipId: magicOn ? selectedClip.id : null,
    frame: magicFrame, marks: magicMarks, live: bgStroking,
  }
  const magicSmart = magicMarks.filter((e) => !isManualMark(e))
  const magicSig = magicOn
    ? `${selectedClip.id}|${magicBg.auto.provider}|${magicFrame}|${JSON.stringify(magicSmart)}`
    : ''
  useEffect(() => {
    if (!magicOn) { setMagicBusy(false); return }
    const clip = selectedClip
    // Sin trazos inteligentes en este fotograma no hay nada que pedir a SAM.
    if (!magicSmart.length) { clearMagic(clip.id); setMagicBusy(false); return }
    // Durante el arrastre bgMagic dibuja la línea del trazo; se pide al soltar.
    if (bgStroking || magicCovers(clip.id, magicFrame, magicSmart)) return
    const auto = magicBg.auto
    const frame = magicFrame
    const marks = magicSmart
    const seq = ++magicSeqRef.current.sent
    setMagicBusy(true)
    segmentBg(project.id, {
      ...bgClipDescriptor(clip),
      src_time: matteFrameTime(frame, auto.mask_fps),
      auto: { ...auto, edits: marks },
    })
      .then((img) => {
        const q = magicSeqRef.current
        const now = magicRef.current
        // Llega tarde (ya hay una más nueva) o el usuario cambió de fotograma.
        if (seq < q.shown || now.clipId !== clip.id || now.frame !== frame) return
        q.shown = seq
        setMagicMask(clip.id, img, { frame, marks })
        maybeAnalyzeBg(clip, auto)
      })
      .catch(() => { /* la selección simplemente no se actualiza */ })
      .finally(() => { if (seq === magicSeqRef.current.sent) setMagicBusy(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicSig, bgStroking])

  // Sondeo del análisis en segundo plano. Al acabar (o detenerse) desaparece:
  // lo analizado queda en la caché del backend.
  useEffect(() => {
    if (!bgAnalyze?.id) return undefined
    if (bgAnalyze.status === 'done' || bgAnalyze.status === 'error') {
      setBgAnalyze(null)
      return undefined
    }
    const id = setInterval(async () => {
      try {
        const j = await getJob(bgAnalyze.id)
        setBgAnalyze((cur) => (cur?.id === j.id ? { ...j, clipId: cur.clipId } : cur))
      } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
  }, [bgAnalyze?.id, bgAnalyze?.status])

  // Al terminar, la clave de caché se escribe en EL CLIP (la copia del editor),
  // no en el timeline del servidor: así el autosave no la pisa y el cambio queda
  // en el historial como cualquier otra edición.
  useEffect(() => {
    if (!bgJob?.clipId) return
    if (bgJob.status === 'done' && bgJob.bg_removal) {
      const r = bgJob.bg_removal
      resetBgMeta(r.base_key)
      resetCutout(bgJob.clipId)
      patchBgAuto(bgJob.clipId, {
        enabled: true,
        status: 'ready',
        error: null,
        base_key: r.base_key,
        provider: r.provider,
        model_version: r.model_version,
        mask_fps: r.mask_fps,
        mask_height: r.mask_height,
      })
      setBgJob(null)
    } else if (bgJob.status === 'error') {
      patchBgAuto(bgJob.clipId, { status: 'error', error: bgJob.error || 'Error' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgJob?.status])

  function applyPreset(id, preset) {
    const ids = new Set(selIdsRef.current.includes(id) ? selIdsRef.current : [id])
    const source = clipsRef.current.find((c) => c.id === id)
    const clearing = selectedSubtitleThemeId(source?.style) === preset?.id
    setClips((prev) => prev.map((c) => {
      if (!ids.has(c.id) || c.kind !== 'text') return c
      return { ...c, style: clearing ? clearTextTheme(c.style) : applyThemeToStyle(c.style, preset) }
    }))
  }
  // Estilo general de la pista: se aplica a la pista y a todos sus segmentos.
  function changeTrackStyle(trackId, patch) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, style: { ...(t.style || defaultTextStyle()), ...patch } } : t)))
    setClips((prev) => prev.map((c) => (
      c.kind === 'text' && c.track_id === trackId ? { ...c, style: { ...(c.style || {}), ...patch } } : c
    )))
  }
  function applyTrackPreset(trackId, preset) {
    const track = tracksRef.current.find((t) => t.id === trackId)
    const clearing = selectedSubtitleThemeId(track?.style) === preset?.id
    setTracks((prev) => prev.map((t) => (t.id === trackId
      ? { ...t, style: clearing ? clearTextTheme(t.style) : applyThemeToStyle(t.style, preset) }
      : t)))
    setClips((prev) => prev.map((c) => {
      if (!(c.kind === 'text' && c.track_id === trackId)) return c
      return { ...c, style: clearing ? clearTextTheme(c.style) : applyThemeToStyle(c.style, preset) }
    }))
  }

  // --- Encuadre de texto por pista (overlay amarillo en el Main) ---
  function startFraming(track) {
    const st = track.style || defaultTextStyle()
    const h = clamp((st.size ?? 0.07) * 1.5, 0.05, 0.5)
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
    setSelTrackId(track.id)
    setFramingMode({ trackId: track.id, x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.8, h })
  }
  function saveFraming() {
    const fm = framingMode
    if (!fm) return
    const size = +clamp(fm.h / 1.22, 0.02, 0.4).toFixed(4)
    const patch = { x: +fm.x.toFixed(4), y: +fm.y.toFixed(4), w: +fm.w.toFixed(4), size }
    if (fm.clipIds?.length) setClips((prev) => patchClipsStyle(prev, fm.clipIds, patch))
    else if (fm.trackId) changeTrackStyle(fm.trackId, patch)
    setFramingMode(null)
  }
  function cancelFraming() { setFramingMode(null) }

  function requestFragmentTrack(trackId) {
    const maxWords = Math.min(10, Math.max(1, Math.floor(Number(tracksRef.current.find((t) => t.id === trackId)?.style?.max_words) || 8)))
    const extra = extraClipsAfterSplit(clipsRef.current, trackId, maxWords)
    if (extra <= 0) return
    setFragmentAsk({ trackId, maxWords, extra })
  }
  function requestFragmentClip(clipId) {
    const clip = clipsRef.current.find((c) => c.id === clipId)
    if (!clip || clip.kind !== 'text') return
    const maxWords = activeWordsPerBox(wordsPerBoxOptions(splitCaptionWords(clip.text || '').length), clip.style?.max_words)
    const extra = extraClipsAfterOneSplit(clip, maxWords)
    if (extra <= 0) return
    setFragmentAsk({ clipId, maxWords, extra })
  }
  function applyFragment() {
    if (!fragmentAsk) return
    if (fragmentAsk.clipId) {
      const prev = clipsRef.current
      const idx = prev.findIndex((c) => c.id === fragmentAsk.clipId)
      const next = splitOneTextClip(prev, fragmentAsk.clipId, fragmentAsk.maxWords)
      setClips(next)
      const first = idx >= 0 ? next[idx] : null
      if (first) {
        setSelClipId(first.id)
        setSelClipIds([first.id])
      }
    } else if (fragmentAsk.trackId) {
      setClips((prev) => splitTrackTextByMaxWords(prev, fragmentAsk.trackId, fragmentAsk.maxWords))
    }
    setFragmentAsk(null)
  }

  // Aplica el estilo de un clip de texto a TODOS los clips de texto del Timeline.
  function applyGlobalTemplate(sourceClip) {
    if (!sourceClip || sourceClip.kind !== 'text') return
    const template = { ...(sourceClip.style || {}) }
    setClips((prev) => prev.map((c) => {
      if (c.kind !== 'text') return c
      return { ...c, style: { ...template } }
    }))
  }

  function applyTextFavorite(item) {
    const st = snapshotTextStyle(item?.style)
    if (selectedClip?.kind === 'text') {
      const ids = new Set(selIdsRef.current.length ? selIdsRef.current : [selectedClip.id])
      setClips((prev) => prev.map((c) => (
        ids.has(c.id) && c.kind === 'text' ? { ...c, style: st } : c
      )))
      return
    }
    if (selTrackObj?.kind === 'text') {
      setTracks((prev) => prev.map((t) => (t.id === selTrackObj.id ? { ...t, style: st } : t)))
      setClips((prev) => prev.map((c) => (
        c.kind === 'text' && c.track_id === selTrackObj.id ? { ...c, style: { ...st } } : c
      )))
    }
  }

  // --- Export ---
  // Para el export, el texto se ajusta a su caja (wrap) antes de renderizar.
  function exportPayload() {
    const octx = document.createElement('canvas').getContext('2d')
    const outClips = clips.map((c) => {
      if (c.kind !== 'text') return c
      const track = tracks.find((t) => t.id === c.track_id)
      const style = effectiveTextStyle(track?.style, c.style)
      return { ...c, style, text: wrappedText(octx, { ...c, style }, outW, outH) }
    })
    return { version: 1, schema_version: TIMELINE_SCHEMA_VERSION, fps, width: outW, height: outH, audio_target_db: audioDb, tracks, clips: outClips }
  }
  const { exportJob, setExportJob, doExport, exporting } = useExportJob(project.id, { timelinePayload, exportPayload })
  const clipSaving = clipSaveJob && (clipSaveJob.status === 'pending' || clipSaveJob.status === 'running')
  const faceBusy = faceJob && (faceJob.status === 'pending' || faceJob.status === 'running')
  const editingExisting = isEditingExistingClip(clipMeta)

  useEffect(() => {
    if (!clipSaveJob || clipSaveJob.status === 'done' || clipSaveJob.status === 'error') return
    const id = setInterval(async () => {
      try { setClipSaveJob(await getJob(clipSaveJob.id)) } catch { /* reintenta */ }
    }, 400)
    return () => clearInterval(id)
  }, [clipSaveJob?.id, clipSaveJob?.status])

  useEffect(() => {
    if (clipSaveJob?.status !== 'done') return
    if (clipSaveHandledRef.current === clipSaveJob.id) return
    clipSaveHandledRef.current = clipSaveJob.id
    onChange?.()
    const ctx = clipSaveCtxRef.current || {}
    const saved = clipSaveJob.clips?.[0]
    const existing = ctx.existingIndex != null && ctx.existingIndex !== ''
    if (existing && projectTlRef.current) {
      const dur = saved ? Math.max(0.3, (saved.end ?? 0) - (saved.start ?? 0)) : null
      const snap = projectTlRef.current
      const nextClips = syncMaterialInstances(snap.clips, {
        assetKind: 'clips',
        assetId: String(ctx.existingIndex),
        duration: dur,
        filename: saved?.filename,
        name: saved?.label || ctx.title,
        description: ctx.description !== undefined ? ctx.description : saved?.description,
        reframe: saved?.reframe || ctx.reframe,
        media_version: saved?.created_at || String(Date.now()),
      })
      projectTlRef.current = { ...snap, clips: nextClips }
      saveTimeline(project.id, {
        version: 1, schema_version: TIMELINE_SCHEMA_VERSION, fps, width: outW, height: outH, audio_target_db: audioDb,
        tracks: snap.tracks, clips: nextClips,
      }).catch(() => {})
    }
    setClipToast({ type: 'success', message: existing ? 'Clip actualizado' : 'Guardado exitosamente' })
  }, [clipSaveJob?.id, clipSaveJob?.status, onChange, project.id, outW, outH, audioDb, fps])

  useEffect(() => {
    if (!faceJob || faceJob.status === 'done' || faceJob.status === 'error') return
    const id = setInterval(async () => {
      try {
        const next = await getJob(faceJob.id)
        setFaceJob((prev) => ({ ...next, mode: prev?.mode || 'smooth', gen: prev?.gen }))
      } catch { /* reintenta */ }
    }, 400)
    return () => clearInterval(id)
  }, [faceJob?.id, faceJob?.status])

  useEffect(() => {
    if (faceJob?.status !== 'done') return
    if (!clipModeRef.current) return
    if (faceJob.gen != null && faceJob.gen !== faceGen.current) return
    const kfs = faceJob.reframe_prep?.keyframes
    const video = clipsRef.current.find((c) => c.kind === 'video') || clipsRef.current[0]
    if (!video) return
    applyFaceTrackToClips([video.id], kfs || [], faceJob.mode)
    setClipToast({ type: 'success', message: faceJob.message || 'Seguimiento de caras aplicado' })
  }, [faceJob?.id, faceJob?.status])

  useEffect(() => {
    if (faceJob?.status !== 'error') return
    if (faceJob.gen != null && faceJob.gen !== faceGen.current) return
    setClipMeta((m) => ({ ...m, err: faceJob.error || 'No se pudo generar el seguimiento.' }))
  }, [faceJob?.id, faceJob?.status])

  useEffect(() => {
    if (!linkPick) return
    const onKey = (e) => { if (e.key === 'Escape') setLinkPick(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkPick])

  // --- Subtítulos ---
  // Resuelve el clip fuente de la transcripción contra el material del proyecto
  // para quedarnos con el título/descripción/URL del vídeo (para el copiado SRT
  // con referencia). Cae a los datos que trae el propio clip de la timeline.
  function resolveTranscriptSource(src) {
    if (!src) return null
    const materials = src.kind === 'video' ? (project.clips || []) : (project.audios || [])
    const id = String(src.asset_id ?? src.index ?? '')
    const file = src.filename
    const hit = materials.find((m) => (
      (id && (String(m.id) === id || String(m.index) === id || String(m.asset_id) === id))
      || (file && m.filename === file)
    ))
    const title = String(hit?.label || src.name || '').trim()
    const description = String(hit?.description || src.description || '').trim()
    const url = String(hit?.source_url || hit?.youtube_url || src.source_url || '').trim()
    if (!title && !description && !url) return null
    return { title, description, url }
  }
  const { subJob, setSubJob, requestSubtitles } = useSubtitles(project.id, {
    tracksRef, ensureTextTrack, setClips, setCtxMenu, onChange,
    resolveSource: resolveTranscriptSource,
  })
  const fav = useFavorites(project.id)

  function applyHistSnap(s) {
    if (!s) return
    setTracks(s.tracks || [])
    setClips(s.clips || [])
    setMarkers(s.markers || [])
  }

  // --- Arrastrar en el canvas: compuesto, o recorte en modo encuadre ---
  const onCanvasDown = createCanvasDownHandler({
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, changeShape, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe, clipsRef, tracksRef, playheadRef, alignGuidesRef, seek: scrub,
    clipModeRef, hitListRef, viewZoomRef,
    maskModeRef, maskDrawRef, changeMask, commitMask,
    bgBrushRef, addBgStroke, extendBgStroke, outRef, onBgStroke: setBgStroking,
    penRef, addPenPoint, finishPen, pathEditRef, setPathShape,
    trackPickRef, trackBoxRef, onTrackBox: runTrack, onTrackCancel: cancelTrackPick,
    onSelectClip: handleSelectClip,
    onClearSelection: clearCanvasSelection,
    changeTransform, commitPose, outW, outH,
  })

  // --- Teclado ---
  useEffect(() => {
    function typingTarget(el) {
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return !!el.isContentEditable
    }
    function onKey(e) {
      if (typingTarget(document.activeElement) || typingTarget(e.target)) return
      if (genMotionRef.current || genResourceRef.current || directionWsRef.current) return   // los modales de generar / Dirección de escena tienen el teclado
      if (segAskRef.current) return      // el modal de Crear clip tiene el teclado
      // Pluma (#14) activa: Enter termina, Esc cancela, Supr/Retroceso quita el
      // último punto. Mientras se dibuja no hay más atajos.
      if (penRef.current) {
        if (e.key === 'Enter') { e.preventDefault(); penOpsRef.current.finish() }
        else if (e.key === 'Escape') { e.preventDefault(); penOpsRef.current.cancel() }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); penOpsRef.current.pop() }
        return
      }
      if (pathEditRef.current && e.key === 'Escape') { e.preventDefault(); setPathEdit(false); return }
      if (trackPickRef.current && e.key === 'Escape') { e.preventDefault(); trackBoxRef.current = null; setTrackPick(null); return }
      // Paper Animator tiene su propio estado y su propio historial: solo comparte
      // los atajos que significan lo mismo (deshacer, play, mover el cabezal).
      // Cortar/duplicar/pegar clips no aplican a un objeto único.
      if (paperModeRef.current) {
        const pp = paperRef.current
        if (e.ctrlKey || e.metaKey) {
          const k = e.key.toLowerCase()
          if (k === 'z') { e.preventDefault(); pp.applyHist(e.shiftKey ? pp.hist.redo() : pp.hist.undo()) }
          else if (k === 'y') { e.preventDefault(); pp.applyHist(pp.hist.redo()) }
          return
        }
        if (e.code === 'Space') {
          if (e.repeat) { e.preventDefault(); return }
          e.preventDefault()
          pp.togglePlay()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          pp.seek(playheadRef.current - (e.shiftKey ? 1 : 0.1))
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          pp.seek(playheadRef.current + (e.shiftKey ? 1 : 0.1))
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          const id = paperSelectedObject(pp.stRef.current).animation.activeKeyframeId
          // Con un keyframe seleccionado manda el keyframe; si no, se borra el
          // clip seleccionado de la timeline (imagen, elemento de texto o banda de papel).
          if (id) pp.removeKeyframe(id)
          else for (const cid of selIdsRef.current) pp.removeTimelineClip(cid)
        }
        return
      }
      // Motion: transporte y borrado van al preview/composición, no al motor de
      // vídeo (Espacio reproducía la timeline de capas y el preview no se movía).
      // Deshacer (Ctrl+Z) sigue cayendo al historial de la timeline de abajo.
      if (motionModeRef.current && !(e.ctrlKey || e.metaKey || e.altKey)) {
        if (e.code === 'Space') {
          e.preventDefault()
          if (!e.repeat) motionTogglePlay()
          return
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const step = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1)
          motionSeek(motionTimeRef.current + step)
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const id = motionRef.current.selLayerId
          if (id) { e.preventDefault(); motionRef.current.deleteLayer(id) }
          return
        }
        if (e.key.toLowerCase() === 's') return   // cortar una capa no aplica
      }
      // Clip Editor como extractor: Z = inicio, X = fin, Enter = Crear clip.
      if (!(e.ctrlKey || e.metaKey || e.altKey) && clipModeRef.current) {
        const k = e.key.toLowerCase()
        if (k === 'z' || k === 'x') {
          e.preventDefault()
          setClipMark((m) => setMark(m, k === 'z' ? 'in' : 'out', playheadRef.current))
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          createSegmentFromMarkRef.current?.()
          return
        }
        if (e.key === 'Escape' && (clipMarkRef.current.in != null || clipMarkRef.current.out != null)) {
          setClipMark(EMPTY_MARK)
          return
        }
      }
      // I / O: entrada y salida del rango para "Generar Motion" (timeline del proyecto).
      if (!(e.ctrlKey || e.metaKey || e.altKey) && !clipModeRef.current && !motionModeRef.current) {
        const k = e.key.toLowerCase()
        if (k === 'i' || k === 'o') {
          e.preventDefault()
          setMarkRange((m) => setMark(m, k === 'i' ? 'in' : 'out', playheadRef.current))
          return
        }
      }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'z') {
          e.preventDefault()
          applyHistSnap(e.shiftKey ? histRef.current.redo() : histRef.current.undo())
        } else if (k === 'y') {
          e.preventDefault()
          applyHistSnap(histRef.current.redo())
        } else if (e.altKey && (k === 'c' || k === 'v')) {
          // Ctrl+Alt+C / Ctrl+Alt+V: copiar / pegar atributos (#13).
          if (k === 'c' ? copyAttrs() : openPasteAttrs()) e.preventDefault()
        } else if (k === 'c') {
          if (selIdsRef.current.length && copySelectedClips()) e.preventDefault()
        } else if (k === 'x') {
          if (selIdsRef.current.length && copySelectedClips()) { e.preventDefault(); deleteClip(selIdsRef.current[0]) }
        } else if (k === 'v') {
          if (pasteClips()) e.preventDefault()
        }
        return
      }
      if (e.altKey) {
        // Keyframes, no clips: Ctrl+C/V se reservan para copiar clips.
        const k = e.key.toLowerCase()
        const ops = kfOpsRef.current
        if (k === 'c') { if (ops.copyKeyframe()) e.preventDefault() }
        else if (k === 'v') { if (ops.pasteKeyframe()) e.preventDefault() }
        else if (k === 'd') { if (ops.duplicateKeyframe()) e.preventDefault() }
        else if (k === 'x') { e.preventDefault(); setMarkRange(EMPTY_MARK) }   // quitar marca I/O
        return
      }
      if (e.code === 'Space') {
        if (e.repeat) { e.preventDefault(); return }
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgePlayhead(e.shiftKey ? -1 : -0.1)   // fino 0,1s · Shift = 1s
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgePlayhead(e.shiftKey ? 1 : 0.1)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selIdsRef.current.length) { e.preventDefault(); deleteClip(selIdsRef.current[0]) }
      } else if (e.key.toLowerCase() === 's') {
        if (selIdsRef.current.length) { e.preventDefault(); splitClip(selIdsRef.current[0], playheadRef.current) }
      } else if (e.key.toLowerCase() === 'v') {
        if (selIdsRef.current.length) { e.preventDefault(); toggleDisabled() }
      } else if (e.key.toLowerCase() === 'm' && !clipModeRef.current) {
        e.preventDefault()
        toggleMarker()
      } else if (e.key === ',' || e.key === '.') {
        e.preventDefault()
        jumpSnap(e.key === '.' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setOutSize(w, h) { setOutW(w); setOutH(h) }

  // "Original": proporción del clip visual seleccionado o, si no hay, del primero
  // de la timeline. Solo si su medio ya tiene dimensiones.
  function originalMediaSize() {
    const visual = clipsRef.current.filter((c) => isVisualClip(c))
    const sel = visual.find((c) => c.id === selIdsRef.current[0])
    const first = sel || [...visual].sort((a, b) => a.start - b.start)[0]
    if (!first) return null
    const m = mediaSize(mediaEls.current.get(first.id))
    return m.w > 0 && m.h > 0 ? m : null
  }
  const hasVisualClip = clips.some((c) => isVisualClip(c))

  // Elementos multimedia ocultos (el texto no tiene medio)
  const mediaPool = clips.filter((c) => c.kind !== 'text' && c.kind !== 'shape' && c.kind !== 'adjustment').map((c) => (
    <HiddenMedia
      key={c.id}
      clip={c}
      src={mediaUrl(project.id, c)}
      mediaEls={mediaEls}
      onLoadedMetadata={(e) => { registerMediaMeta(c, e.target); applyFreeLayout(c, e.target) }}
    />
  ))

  const canEditFrame = isVisualClip(selectedClip)
  const overlayOn = isOverlay(selectedClip)
  // Escala 100% = altura del clip = altura del cuadro: factor = outH / altura de la fuente.
  const selSrcH = selectedClip ? mediaSize(mediaEls.current.get(selectedClip.id)).h : 0
  const heightScale = selSrcH > 0 ? outH / selSrcH : 1
  const isTextSel = selectedClip?.kind === 'text'
  const isShapeSel = selectedClip?.kind === 'shape'
  const selTrackObj = tracks.find((t) => t.id === selTrackId)
  const isTextTrackSel = !selectedClip && selTrackObj?.kind === 'text'
  const isAudioTrackSel = !selectedClip && selTrackObj?.kind === 'audio'
  const trackAudioClip = isAudioTrackSel
    ? clips.find((c) => c.track_id === selTrackObj.id && (c.kind === 'audio' || c.kind === 'video'))
    : null

  // Nota de contexto de un clip (§5-§8): qué representa el fragmento en la historia.
  // Es una propiedad más del clip, así que va por el flujo normal de la timeline
  // (estado → guardado → deshacer), sin endpoint propio.
  function setClipNote(clipId, note, source = 'user') {
    const text = (note || '').trim()
    setClips((prev) => prev.map((c) => (
      c.id === clipId ? { ...c, note: text || null, note_source: text ? source : null } : c)))
  }

  // Propuesta de la IA para la nota. Guarda la timeline antes: el backend lee de
  // ahí el guion del tramo y los materiales de alrededor.
  async function suggestClipNoteFor(clipId) {
    try { await saveTimeline(project.id, timelinePayload()) } catch { /* usa lo último guardado */ }
    let note = ''
    let degraded = ''
    await suggestClipNotes(project.id, [clipId], (ev) => {
      if (ev.type === 'note') { note = ev.note || ''; degraded = ev.degraded || '' }
      else if (ev.type === 'error') throw new Error(ev.message || 'No se pudo proponer la nota.')
    })
    if (degraded && !note) throw new Error(degraded)
    return note
  }

  function patchClipFx(patch) {
    const ids = new Set(selIdsRef.current)
    setClips((prev) => {
      let next = prev
      if (patch.speed != null) {
        for (const id of ids) {
          const audio = next.find((c) => c.id === id)
          next = applyAudioSpeedToLinkedText(next, tracksRef.current, audio, patch.speed)
        }
      }
      return next.map((c) => (ids.has(c.id) && c.kind !== 'text' ? { ...c, ...patch } : c))
    })
  }

  return (
    <div
      ref={panels.editorRef}
      className={`veditor${mainColTab === 'clip' ? ' clip-mode' : ''}${mainColTab === 'motion' ? ' motion-mode' : ''}${mainColTab === 'paper' ? ' paper-mode' : ''}${linkPick ? ' link-picking' : ''} ws-${panels.preset}${panels.dragging ? ` is-resizing is-rs-${panels.dragging}` : ''}`}
      style={panels.vars}
    >
      <div className="ed-hidden-media">{mediaPool}</div>

      <EdTopBar
        projectName={project.name}
        savedLabel={savedLabel}
        canUndo={paperMode ? paper.hist.canUndo : hist.canUndo}
        canRedo={paperMode ? paper.hist.canRedo : hist.canRedo}
        onBack={onBack}
        onUndo={() => (paperMode ? paper.applyHist(paper.hist.undo()) : applyHistSnap(hist.undo()))}
        onRedo={() => (paperMode ? paper.applyHist(paper.hist.redo()) : applyHistSnap(hist.redo()))}
        onHelp={() => setClipToast({ type: 'success', message: 'Espacio: play · S: dividir · Supr: borrar · Ctrl+Z: deshacer' })}
        onSettings={() => setMatTab('settings')}
        onChat={() => setMatTab('chat')}
        chatBusy={!!mcpAudit.active?.length}
        onOpenJson={onOpenJson}
        clipMode={mainColTab === 'clip'}
        onLeaveClip={goMainTab}
        exporting={exporting}
        exportPct={exportJob?.progress}
        exportDone={exportJob?.status === 'done'}
        exportUrl={exportJob?.export_url}
        exportBusyDisabled={!clips.length}
        onExport={doExport}
        onClearExport={() => setExportJob(null)}
        clipSaving={clipSaving}
        clipSavePct={clipSaveJob?.progress}
        clipSaveDisabled={!clipMeta.url || !clips.length || clipMeta.preparing}
        onSaveClip={saveClip}
        saveClipLabel={editingExisting ? 'Editar clip' : 'Guardar clip'}
        layoutPreset={panels.preset}
        onLayoutPreset={panels.setPreset}
      />

      <div className="veditor-workspace" ref={panels.workRef}>
        <EdMaterial
          project={project}
          onAdd={addAsset}
          onPen={() => (pen ? penOpsRef.current.finish() : startPen())}
          onAddAdjustment={addAdjustmentLayer}
          onAddCinemaBars={addCinemaBars}
          onApplyRecipe={applyRecipeUI}
          recipeBusy={recipeBusy}
          selectedClips={clips.filter((c) => selClipIds.includes(c.id))}
          penActive={!!pen}
          onDragInfo={setDragInfo}
          onRefresh={onChange}
          fav={fav}
          onEditYtClip={openClipEditor}
          onFaceTrackMaterial={faceTrackFromMaterial}
          faceTrackBusyIdent={matFaceBusy}
          selectedClip={selectedClip}
          onChangeFx={patchClipFx}
          onAddText={addText}
          onApplyTextPreset={(p) => {
            if (isTextSel) applyPreset(selectedClip.id, p)
            else if (isTextTrackSel) applyTrackPreset(selTrackObj.id, p)
          }}
          matTab={matTab}
          onMatTab={setMatTab}
          timelineClips={clips}
          audioDb={audioDb}
          onAudioDb={setAudioDb}
          aiContext={{ project_id: project.id, selected_clip_id: selClipId || null, selected_track_id: selTrackId || null, current_time: Math.round((playhead || 0) * 100) / 100 }}
          onReloadTimeline={reloadTimeline}
          onMcpAudit={setMcpAudit}
          motion={motion}
          motionFormat={{ width: outW, height: outH, fps }}
          onGoMotion={() => goMotionTab(null)}
          onMotionBack={goMotionBlank}
          onMotionSeek={motionSeek}
          motionTimeRef={motionTimeRef}
          paper={paper}
          onGoPaper={goPaperTab}
          onExitStudio={leaveStudioForMaterial}
          onGeneratePaper={generatePaperFromImage}
        />
        <EdSplit axis="x" kind="materials" label="Redimensionar materiales" onDown={panels.begin('materials')} />

        <div className="ed-canvas-col">
          <div className="ed-col-tabs">
            <button
              type="button"
              className={`ed-tab ${mainColTab === 'main' ? 'on' : ''}`}
              onClick={goMainTab}
            >
              Main Editor
            </button>
            <button
              type="button"
              className={`ed-tab ${mainColTab === 'clip' ? 'on' : ''}`}
              onClick={goClipTab}
            >
              Clip Editor
            </button>
            <button
              type="button"
              className={`ed-tab ${mainColTab === 'motion' ? 'on' : ''}`}
              onClick={() => goMotionTab(null)}
            >
              Motion Studio
            </button>
            <button
              type="button"
              className={`ed-tab ${mainColTab === 'paper' ? 'on' : ''}`}
              onClick={goPaperTab}
            >
              Paper Animator
            </button>
          </div>
          {mainColTab === 'paper' && (
            <div className="ed-paper-canvas">
              <PaperCanvas paper={paper} format={{ width: outW, height: outH, fps }} />
              <div className="ed-transport">
                <button className="icon-btn big" type="button" title="Reproducir / Pausa"
                  onClick={paper.togglePlay} disabled={!paperHasContent(paper.raw)}>
                  <Icon name={paper.playing ? 'pause_circle' : 'play_circle'} size={24} />
                </button>
                <button className="icon-btn" type="button" title="Al inicio"
                  onClick={() => paper.seek(0)}><Icon name="first_page" size={18} /></button>
                <div className="ed-scrub" onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const doSeek = (cx) => paper.seek(((cx - rect.left) / rect.width) * paper.duration)
                  doSeek(e.clientX)
                  const mv = (ev) => doSeek(ev.clientX)
                  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
                  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
                }}>
                  <div className="ed-scrub-fill" style={{ width: `${paper.duration ? (paper.time / paper.duration) * 100 : 0}%` }} />
                  <div className="ed-scrub-knob" style={{ left: `${paper.duration ? (paper.time / paper.duration) * 100 : 0}%` }} />
                </div>
                <span className="ed-time">{paper.time.toFixed(2)} / {paper.duration.toFixed(2)}s</span>
                <EdViewerTools
                  zoom={viewZoom}
                  onZoom={setViewZoom}
                  width={outW}
                  height={outH}
                  onSize={setOutSize}
                  fps={fps}
                  onFps={setFps}
                />
              </div>
            </div>
          )}
          {mainColTab === 'motion' && (
            <div className="ed-motion-canvas">
              {motion.comp ? (
                <MotionCanvas
                  projectId={project.id}
                  comp={motion.comp}
                  onControls={(c) => { motionControlsRef.current = c }}
                  onTime={(t) => { motionTimeRef.current = t; setMotionTime(t); setMotionPlaying(!!motionControlsRef.current?.isPlaying?.()) }}
                  selLayerId={motion.selLayerId}
                  onSelectLayer={motion.setSelLayerId}
                  onMoveLayer={motion.moveLayerBy}
                />
              ) : (
                <div className="ed-stage-empty">Crea un motion graphic desde Materiales (icono Motion).</div>
              )}
              <div className="ed-transport">
                <button className="icon-btn big" type="button" title="Reproducir / Pausa (Espacio)"
                  onClick={motionTogglePlay}>
                  <Icon name={motionPlaying ? 'pause_circle' : 'play_circle'} size={24} />
                </button>
                <button className="icon-btn" type="button" title="Al inicio"
                  onClick={() => motionSeek(0)}><Icon name="first_page" size={18} /></button>
                <div className="ed-scrub" onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const dur = motion.comp?.duration || 1
                  const doSeek = (cx) => motionSeek(((cx - rect.left) / rect.width) * dur)
                  doSeek(e.clientX)
                  const mv = (ev) => doSeek(ev.clientX)
                  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
                  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
                }}>
                  <div className="ed-scrub-fill" style={{ width: `${motion.comp?.duration ? (motionTime / motion.comp.duration) * 100 : 0}%` }} />
                  <div className="ed-scrub-knob" style={{ left: `${motion.comp?.duration ? (motionTime / motion.comp.duration) * 100 : 0}%` }} />
                </div>
                <span className="ed-time">{motionTime.toFixed(2)} / {Number(motion.comp?.duration || 0).toFixed(2)}s</span>
              </div>
            </div>
          )}
          {mainColTab === 'clip' && (
            <div className="ed-clip-banner">
              <span className="ed-clip-banner-label">Preparar clip</span>
              <input
                className="ed-clip-title"
                placeholder="Título"
                value={clipMeta.title}
                onChange={(e) => setClipMeta((m) => ({ ...m, title: e.target.value }))}
              />
              <input
                className="ed-clip-desc"
                placeholder="Descripción"
                value={clipMeta.description}
                onChange={(e) => setClipMeta((m) => ({ ...m, description: e.target.value }))}
              />
              {clipMeta.err && <div className="ed-mat-err">{clipMeta.err}</div>}
              {faceBusy && (
                <div className="ed-clip-face-msg">
                  Seguimiento de cara… {Math.round((faceJob.progress || 0.05) * 100)}%
                </div>
              )}
            </div>
          )}
          <div
            className="ed-canvas-stage"
            ref={mainStageRef}
            onPointerDown={(e) => { if (!pickChromaAt(e)) onCanvasDown(e) }}
            onPointerMove={(e) => { onCanvasPenMove(e); onCanvasBgMove(e) }}
            onPointerLeave={() => { penHoverRef.current = null; onCanvasBgLeave() }}
            onDragOver={(e) => {
              const types = [...e.dataTransfer.types]
              if (types.includes('application/x-material') || types.includes('application/x-explore')) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const rawExplore = e.dataTransfer.getData('application/x-explore')
              if (rawExplore) {
                try {
                  const ex = JSON.parse(rawExplore)
                  const at = freeStartOnTrack(clipsRef.current, selTrackId, playhead, ex.duration || 3)
                  dropAsset({ ...ex, _explore: true }, selTrackId, at)
                } catch { /* noop */ }
                return
              }
              const raw = e.dataTransfer.getData('application/x-material')
              if (!raw) return
              try {
                const p = JSON.parse(raw)
                const at = freeStartOnTrack(clipsRef.current, selTrackId, playhead, p.duration || SHAPE_DEFAULT_DUR)
                dropAsset(p, selTrackId, at)
              } catch { /* noop */ }
            }}
            style={{
              cursor: (bgBrush.on || chromaPick || pen || trackPick) ? 'crosshair'
                : ((framingMode || (canEditFrame && !overlayOn)) ? 'crosshair'
                  : ((canEditFrame || isTextSel || isShapeSel) ? 'move' : 'default')),
            }}
          >
            <canvas ref={mainCanvasRef} width={540} height={960} className="ed-main-canvas" />
            {mainColTab === 'clip' && clipMeta.preparing && (
              <div className="ed-stage-prep">
                <JobStatusBar progress={clipMeta.prepProgress} message={clipMeta.prepMsg} />
              </div>
            )}
            {mainColTab === 'clip' && !clipMeta.preparing && !clips.length && (
              <div className="ed-stage-empty">Elige un tramo en Materiales para prepararlo</div>
            )}
            {mainColTab === 'main' && clips.length === 0 && !framingMode && (
              <div className="ed-stage-empty">Arrastra un clip al timeline o al canvas</div>
            )}
            {(exporting || clipSaving) && (
              <div className="ed-result-exporting">
                <div className="progress"><span style={{ width: `${((clipSaving ? clipSaveJob.progress : exportJob.progress) || 0.05) * 100}%` }} /></div>
                <span>{(clipSaving ? clipSaveJob.message : exportJob.message) || (clipSaving ? 'Guardando…' : 'Exportando…')}</span>
              </div>
            )}
            {canEditFrame && !overlayOn && (
              <div className="ed-stage-hint">
                Vídeo fijo · arrastra el recuadro naranja{mainColTab === 'clip' ? ' · Guardar clip lo deja en Materiales' : ' · esquinas para zoom'}
              </div>
            )}

            {isTextSel && (
              <div className="ed-stage-hint">
                {selClipIds.length > 1
                  ? `${selClipIds.length} textos · arrastra en el timeline para mover el grupo`
                  : 'Arrastra el texto · esquinas para tamaño'}
              </div>
            )}
            {trackPick ? (
              <div className="ed-stage-hint">Seguimiento: dibuja un recuadro sobre el objeto que quieres seguir · Esc cancela</div>
            ) : trackRun ? (
              <div className="ed-stage-hint">{trackRun.message} {Math.round((trackRun.progress || 0) * 100)}%</div>
            ) : pen ? (
              <div className="ed-stage-hint">
                Pluma: clic para añadir puntos · doble clic o Enter termina · clic en el primero lo cierra · Supr quita el último · Esc cancela
              </div>
            ) : pathEdit ? (
              <div className="ed-stage-hint">Arrastra los puntos · clic en la línea añade uno · Alt+clic lo quita</div>
            ) : isShapeSel && (
              <div className="ed-stage-hint">Arrastra la figura · esquinas para tamaño · círculo para rotar</div>
            )}
            {framingMode && <div className="ed-stage-hint">Ajusta el recuadro amarillo y pulsa Guardar</div>}
          </div>
          <div className="ed-transport">
            <button className="icon-btn" type="button" onClick={(e) => nudgePlayhead(e.shiftKey ? -1 : -0.1)} title="Atrás 0,1s (← · Shift = 1s)">
              <Icon name="fast_rewind" size={18} />
            </button>
            <button className="icon-btn big" type="button" onClick={togglePlay} title="Reproducir / Pausa (Espacio)">
              <Icon name={playing ? 'pause_circle' : 'play_circle'} size={24} />
            </button>
            <button className="icon-btn" type="button" onClick={(e) => nudgePlayhead(e.shiftKey ? 1 : 0.1)} title="Adelante 0,1s (→ · Shift = 1s)">
              <Icon name="fast_forward" size={18} />
            </button>
            <button className="icon-btn" type="button" onClick={() => seek(0)} title="Al inicio"><Icon name="first_page" size={18} /></button>
            <div className="ed-scrub" onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const doSeek = (cx) => seek(((cx - rect.left) / rect.width) * (duration || 1))
              doSeek(e.clientX)
              const mv = (ev) => doSeek(ev.clientX)
              const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
              window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
            }}>
              <div className="ed-scrub-fill" style={{ width: `${duration ? (playhead / duration) * 100 : 0}%` }} />
              <div className="ed-scrub-knob" style={{ left: `${duration ? (playhead / duration) * 100 : 0}%` }} />
            </div>
            <span className="ed-time">{fmtRuler(playhead, { step: tickStep(pps, fps), fps, long: duration >= 3600 })} / {fmt(duration)}</span>
            <button
              className="icon-btn"
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            >
              <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} size={18} />
            </button>
            <EdViewerTools
              zoom={viewZoom}
              onZoom={setViewZoom}
              width={outW}
              height={outH}
              onSize={setOutSize}
              fps={fps}
              onFps={setFps}
              originalSize={hasVisualClip ? originalMediaSize : null}
              overlay={platformOverlay}
              onOverlay={setPlatformOverlay}
            />
          </div>
          {exportJob?.status === 'error' && <div className="error small">⚠️ {exportJob.error}</div>}
          {clipSaveJob?.status === 'error' && <div className="error small">⚠️ {clipSaveJob.error}</div>}
        </div>
        <EdSplit axis="x" kind="inspector" label="Redimensionar inspector" onDown={panels.begin('inspector')} />

        {mainColTab === 'paper' ? (
          <PaperProps
            paper={paper}
            format={{ width: outW, height: outH, fps }}
          />
        ) : mainColTab === 'motion' ? (
          <aside className="ed-inspector motion-props-panel">
            <div className="motion-panel-title">Propiedades</div>
            <MotionProps comp={motion.comp} layer={motion.selLayer}
              onChange={(patch) => motion.selLayerId && motion.editLayer(motion.selLayerId, patch)} />
          </aside>
        ) : (
        <EdInspector
          selectedClip={isAudioTrackSel ? (trackAudioClip || { kind: 'audio', volume: 1, muted: false, audio_fx: {}, start: 0 }) : selectedClip}
          textMode={isTextSel ? 'clip' : (isTextTrackSel ? 'track' : null)}
          audioMode={isAudioTrackSel ? 'track' : null}
          clipMode={mainColTab === 'clip'}
          noteProps={selectedClip && !isAudioTrackSel && !isTextTrackSel
            ? { onChange: setClipNote, onSuggest: suggestClipNoteFor } : null}
          effectsProps={{
            clip: isAudioTrackSel ? (trackAudioClip || { kind: 'audio', volume: 1, muted: false, audio_fx: {}, start: 0 }) : selectedClip,
            onChangeFx: isAudioTrackSel ? (patch) => patchTrackAudio(selTrackObj.id, patch) : patchClipFx,
            textStyle: isTextSel ? effectiveTextStyle(selTrackObj?.style, selectedClip.style) : (isTextTrackSel ? selTrackObj.style : null),
            textMode: isTextSel ? 'clip' : (isTextTrackSel ? 'track' : null),
            onChangeTextStyle: (patch) => {
              if (isTextSel) changeStyle(selectedClip.id, patch)
              else if (isTextTrackSel) changeTrackStyle(selTrackObj.id, patch)
            },
            onApplyTextPreset: (p) => {
              if (isTextSel) applyPreset(selectedClip.id, p)
              else if (isTextTrackSel) applyTrackPreset(selTrackObj.id, p)
            },
            playhead,
            onPose: (patch) => !isAudioTrackSel && selectedClip && commitPose(selectedClip.id, patch),
            selKfId,
            onInterpKf: interpAnimKf,
            fps,
            heightScale,
            audioMode: isAudioTrackSel ? 'track' : null,
            trackLabel: isAudioTrackSel ? selTrackObj.name : null,
            trackEmpty: isAudioTrackSel && !trackAudioClip,
            onAddKf: isAudioTrackSel ? undefined : toggleKeyframeAtPlayhead,
            onFade: isAudioTrackSel ? (side) => fadeTrackAudio(selTrackObj.id, side) : applySelectedFade,
            onFlip: isAudioTrackSel || isTextTrackSel ? undefined : toggleFlip,
            onBlend: isAudioTrackSel || isTextTrackSel ? undefined : setBlendMode,
            beats: isAudioTrackSel ? null : { busy: !!beatBusy, onDetect: detectClipBeats, onChange: setClipBeats },
            track: (isAudioTrackSel || isTextTrackSel || !selectedClip || selectedClip.kind === 'audio') ? null : {
              mode: trackMode,
              onMode: setTrackMode,
              picking: !!trackPick,
              run: trackRun,
              hasVideo: !!videoUnder(selectedClip),
              onStart: startTrackPick,
              onCancel: cancelTrackPick,
            },
            textEditor: {
              clip: isTextSel ? selectedClip : null,
              selectionCount: selClipIds.length,
              onChangeText: (v) => { if (isTextSel) changeText(selectedClip.id, v) },
              onChangeDur: (d) => {
                if (!isTextSel || !Number.isFinite(d) || d <= 0) return
                const next = Math.max(0.15, d)
                mutateClip(selectedClip.id, {
                  out_point: +(selectedClip.in_point + next).toFixed(3),
                  source_duration: +(selectedClip.in_point + next).toFixed(3),
                })
              },
              onApplyAsGlobalTemplate: isTextSel ? () => applyGlobalTemplate(selectedClip) : undefined,
              framing: !!(framingMode && selTrackObj && framingMode.trackId === selTrackObj.id),
              onStartFraming: isTextTrackSel ? () => startFraming(selTrackObj) : undefined,
              onSaveFraming: isTextTrackSel ? saveFraming : undefined,
              onCancelFraming: isTextTrackSel ? cancelFraming : undefined,
              textFavorites: fav.favs.textStyles,
              onSaveFavorite: (st) => fav.saveTextStyle(st),
              onApplyFavorite: applyTextFavorite,
              onDeleteFavorite: (id) => fav.removeTextStyle(id),
              onFragment: isTextTrackSel
                ? () => requestFragmentTrack(selTrackObj.id)
                : (isTextSel ? () => requestFragmentClip(selectedClip.id) : undefined),
            },
          }}
          bgProps={{
            job: bgJob,
            cutoutJob,
            providers: bgInfo.providers,
            device: bgInfo.device,
            brush: bgBrush,
            picking: chromaPick,
            onPanelOpen: onBgPanel,
            onToggleAuto: toggleBgAuto,
            onApplyAuto: applyBgAuto,
            onCancelAuto: cancelBgAuto,
            onExportCutout: exportBgCutout,
            onCancelCutout: cancelBgCutout,
            magicBusy,
            analyzeJob: bgAnalyze && selectedClip && bgAnalyze.clipId === selectedClip.id ? bgAnalyze : null,
            onStopAnalyze: () => stopBgAnalyze(selectedClip?.id),
            onToggleCustom: toggleBgCustom,
            onApplyCustom: applyBgCustom,
            onSeekMark: seekBgMark,
            curFrame: bgCurFrame,
            onChangeAuto: changeBgAuto,
            onBrush: onBgBrush,
            onUndoEdit: undoBgEdit,
            onClearEdits: clearBgEdits,
            onToggleChroma: toggleBgChroma,
            onChangeChroma: changeBgChroma,
            onChangeOutline: (patch) => selectedClip && patchBgOutline(selectedClip.id, patch),
            onResetChroma: resetBgChroma,
            onPickColor: onPickChroma,
            bgPreview,
            onBgPreview,
          }}
          maskProps={{
            maskMode,
            onMaskMode: setMaskMode,
            drawMode: maskDraw,
            onDrawMode: setMaskDraw,
            onPanelOpen: onMaskPanel,
            onAddMask: addMask,
            onAddAdjustMask: addAdjustMask,
            onFollow: followMaskFace,
            follow: maskFollow,
            onRemoveMask: removeMask,
            onDuplicateMask: duplicateMask,
            onChangeMask: (patch) => selectedClip && changeMask(selectedClip.id, patch),
            onCommitMask: (patch) => selectedClip && commitMask(selectedClip.id, patch),
            onAddKf: toggleKeyframeAtPlayhead,
          }}
          shapeProps={isShapeSel ? {
            clip: selectedClip,
            onFlip: toggleFlip,
            layer: layerInfo,
            onMoveLayer: (action) => moveLayer(selectedClip.id, action),
            onChangeShape: (patch) => changeShape(selectedClip.id, patch),
            pathEdit,
            onPathEdit: () => setPathEdit((v) => !v),
            onDrawIn: () => drawInShape(selectedClip.id),
            onChangeDur: (d) => {
              if (!Number.isFinite(d) || d <= 0) return
              const next = Math.max(0.15, d)
              mutateClip(selectedClip.id, {
                out_point: +(selectedClip.in_point + next).toFixed(3),
                source_duration: +(selectedClip.in_point + next).toFixed(3),
              })
            },
          } : null}
        />
        )}
      </div>

      <EdSplit axis="y" kind="bottom" label="Redimensionar timeline" onDown={panels.begin('bottom')} />

      {/* ===== Timeline + keyframes ===== */}
      <div className={`veditor-bottom${mainColTab === 'clip' ? ' clip-mode' : ''}`} ref={panels.bottomRef}>
        <EdTimeline
          tracks={tracks} clips={clips} pps={pps} setPps={setPps} fps={fps}
          duration={motionMode ? Math.max(duration, motion.comp?.duration || 0) : duration}
          playhead={paperMode ? paper.time : motionMode ? motionTime : playhead} rowH={rowH} setRowH={setRowH}
          selectedClipId={mainColTab === 'motion' ? motion.selLayerId : selClipId} selectedClipIds={mainColTab === 'motion' ? (motion.selLayerId ? [motion.selLayerId] : []) : selClipIds} selectedTrackId={selTrackId}
          selKfId={paperMode ? paper.st.object.animation.activeKeyframeId : selKfId} dragInfo={dragInfo}
          mcpBusyIds={mcpBusyIds}
          onSeek={paperMode ? paper.seek : motionMode ? motionSeek : seek}
          onScrub={paperMode ? paper.seek : motionMode ? motionSeek : scrub}
          onSelectClip={mainColTab === 'motion' ? ((clip) => motion.setSelLayerId(clip.id)) : paperMode ? paperSelectClip : handleSelectClip}
          onMarqueeSelect={mainColTab === 'motion' || paperMode ? undefined : selectClipIds}
          onSelectTrack={selectTrack}
          onDoubleClip={(clip) => {
            if (clip.kind === 'motion' && (clip.composition_id || clip.asset_id)) {
              goMotionTab(clip.composition_id || clip.asset_id)   // reeditar el motion graphic
              return
            }
            if (motionMode) {   // capa de la composición: el preview salta a su inicio
              motion.setSelLayerId(clip.id)
              motionSeek(clip.start)
              return
            }
            seek(clip.start)   // exactamente el inicio del clip (00:00 relativo), sin offset
            setSelClipId(clip.id)
            setSelClipIds([clip.id])
            setSelKfId(null)
          }}
          onMutateClip={paperMode ? paperMutateClip : mutateClip}
          onMoveGroup={paperMode ? undefined : moveGroup}
          onMoveToNewTrack={paperMode ? undefined : moveClipToNewTrack}
          onMatchDuration={paperMode ? undefined : matchSelectedDurations}
          onSplit={paperMode ? undefined : splitClip}
          onDuplicate={paperMode ? undefined : duplicateSelected}
          onCrop={paperMode || motionMode ? undefined : openCrop}
          cropDisabled={selClipIds.length > 1 || !canCropClip(selectedClip)}
          onFreeze={paperMode || motionMode ? undefined : () => freezeAtPlayhead()}
          markers={mainColTab === 'main' ? markers : null}
          onMarkerChange={mainColTab === 'main' ? patchMarker : undefined}
          onToggleMarker={mainColTab === 'main' ? toggleMarker : undefined}
          freezeDisabled={selClipIds.length > 1 || !canFreeze(selectedClip, playhead)}
          freezeBusy={freezeBusy}
          onFaceTrack={mainColTab === 'clip' ? startFaceTrack : undefined}
          faceTrackBusy={!!faceBusy}
          faceTrackDisabled={!clipMeta.url || clipMeta.preparing}
          onDeleteClip={paperMode ? paperDeleteClip : motionMode ? ((id) => { const lid = id || motion.selLayerId; if (lid) motion.deleteLayer(lid) }) : deleteClip}
          previewVol={previewVol}
          onPreviewVol={setListenVolume}
          onDropAsset={paperMode ? undefined : dropAsset}
          onTrackToggle={paperMode ? undefined : trackToggle}
          onTrackCompact={paperMode ? undefined : compactTrack}
          onAddTrack={paperMode ? undefined : addTrack}
          onAddTextTrack={paperMode ? undefined : addTextTrack}
          onRenameTrack={paperMode ? undefined : renameTrack}
          onReorderTrack={paperMode || motionMode ? undefined : (id, targetId, place) => reorderTracks(reorderTrack(tracksRef.current, id, targetId, place))}
          onMoveKeyframe={paperMode ? paperMoveKeyframe : moveKeyframe}
          onSelectKf={paperMode ? paper.selectKeyframe : selectTimelineKf}
          onAddKf={paperMode ? paperAddKf : toggleKeyframeAtPlayhead}
          onDeleteKf={paperMode ? paperDeleteKf : deleteSelectedKeyframe}
          onContextClip={paperMode ? undefined : (e, clip, time) => {
            e.preventDefault()
            if (!selIdsRef.current.includes(clip.id)) {
              setSelClipId(clip.id)
              setSelClipIds([clip.id])
              selIdsRef.current = [clip.id]
              selRef.current = clip.id
            }
            setLaneMenu(null)
            setCtxMenu({ x: e.clientX, y: e.clientY, clip, time })
          }}
          markRange={mainColTab === 'main' ? markRange : mainColTab === 'clip' ? clipMark : null}
          onMarkChange={mainColTab === 'clip'
            ? (which, t) => setClipMark((m) => dragMark(m, which, t, duration))
            : mainColTab === 'main'
              ? (which, t) => setMarkRange((m) => dragMark(m, which, t, duration))
              : undefined}
          onCreateSegment={mainColTab === 'clip' && clips.some((c) => c.kind === 'video') ? createSegmentFromMark : undefined}
          segmentBusy={segBusy || !!clipSaving}
          markKeys={mainColTab === 'clip' ? ['Z', 'X'] : ['I', 'O']}
          segmentLabelText={mainColTab === 'clip' && clipMark.in == null && clipMark.out == null ? 'Z inicio · X fin' : ''}
          onGenerateResource={mainColTab === 'main' ? () => openGenerateResource() : undefined}
          onSceneDirection={mainColTab === 'main' ? () => openSceneDirection() : undefined}
          onContextLane={mainColTab === 'main' ? (e, track, time) => {
            setCtxMenu(null)
            setTrackMenu(null)
            setLaneMenu({ x: e.clientX, y: e.clientY, time, track })
          } : undefined}
          onContextTrack={paperMode ? undefined : (e, track) => {
            e.preventDefault()
            setLinkPick(null)
            setCtxMenu(null)
            setTrackMenu({ x: e.clientX, y: e.clientY, track })
          }}
          linkPick={linkPick}
          onPickLinkTrack={pickLinkTextTrack}
          onCancelLinkPick={cancelLinkPick}
          onCopyDesc={copyClipDescription}
          audioMaterials={project.audios}
        />
        {!paperMode && (
        <EdSplit axis="x" kind="crops" label="Redimensionar keyframes" onDown={panels.begin('crops')} />
        )}
        {!paperMode && (
        <EdCrops
          clip={selectedClip}
          selKfId={selKfId}
          fps={fps}
          playhead={playhead}
          hideVolume
          layer={layerInfo}
          onMoveLayer={(action) => selectedClip && moveLayer(selectedClip.id, action)}
          onChangeFx={patchClipFx}
          onPose={(patch) => selectedClip && commitPose(selectedClip.id, patch)}
          onFade={applySelectedFade}
          onAddKf={toggleKeyframeAtPlayhead}
          onSetAnimated={setClipAnimated}
          onCopyKf={copyKeyframe}
          onPasteKf={pasteKeyframe}
          onDuplicateKf={duplicateKeyframe}
          kfBoard={kfBoard}
          kfGroups={kfGroups}
          onToggleKfGroup={toggleKfGroup}
          onSelectKf={(k) => k && selectTimelineKf(k.id)}
          onDeleteKf={deleteAnimKf}
        />
        )}
      </div>

      {/* Menú contextual (click derecho en clip) */}
      {ctxMenu && (
        <>
          <div className="ed-ctx-backdrop" onPointerDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <AnchoredMenu className="ed-ctx-menu" x={ctxMenu.x} y={ctxMenu.y}>
            {mainColTab === 'clip' && ctxMenu.clip.kind === 'video' && (
              <>
                <button className="accent" disabled={segBusy || !!clipSaving}
                  onClick={() => { addClipToMaterial(ctxMenu.clip); setCtxMenu(null) }}>
                  <Icon name="add_to_photos" size={15} /> Agregar a material
                </button>
                <div className="ed-ctx-sep" />
              </>
            )}
            {mainColTab === 'main' && (
              <>
                <button className="accent" onClick={() => openGenerateResource({ time: ctxMenu.time, clip: ctxMenu.clip })}>
                  <Icon name="auto_awesome" size={15} /> Generar recurso{hasMarkRange(markRange) ? ' en el rango' : ' aquí'}
                </button>
                <button onClick={() => openSceneDirection({ time: ctxMenu.time })}>
                  <Icon name="theaters" size={15} /> Dirección de escena{hasMarkRange(markRange) ? ' del rango' : ''}
                </button>
                <div className="ed-ctx-sep" />
              </>
            )}
            {(ctxMenu.clip.asset_kind === 'sfx') && (
              <button onClick={() => { fav.toggleClipFav(ctxMenu.clip); setCtxMenu(null) }}>
                <Icon name={fav.isClipFav(ctxMenu.clip) ? 'star' : 'star_border'} size={15} />
                {fav.isClipFav(ctxMenu.clip) ? 'Quitar de favoritos' : 'Favorito'}
              </button>
            )}
            {canCaptionClip(ctxMenu.clip) && (
              <button onClick={() => requestSubtitles(ctxMenu.clip)}>
                <Icon name={ctxMenu.clip.kind === 'video' ? 'notes' : 'subtitles'} size={15} />
                {ctxMenu.clip.kind === 'video' ? 'Generar transcripción' : 'Generar subtítulos'}
              </button>
            )}
            {ctxMenu.clip.kind === 'text' && (
              <button onClick={() => { applyGlobalTemplate(ctxMenu.clip); setCtxMenu(null) }}>
                <Icon name="style" size={15} /> Aplicar como plantilla global
              </button>
            )}
            {canLayerClip(ctxMenu.clip) && (() => {
              const info = clipLayerInfo(clips, ctxMenu.clip.id)
              return (
                <>
                  <button disabled={!info.canFront} onClick={() => { moveLayer(ctxMenu.clip.id, 'forward'); setCtxMenu(null) }}>
                    <Icon name="arrow_upward" size={15} /> Adelante
                  </button>
                  <button disabled={!info.canBack} onClick={() => { moveLayer(ctxMenu.clip.id, 'backward'); setCtxMenu(null) }}>
                    <Icon name="arrow_downward" size={15} /> Atrás
                  </button>
                  <button disabled={!info.canFront} onClick={() => { moveLayer(ctxMenu.clip.id, 'front'); setCtxMenu(null) }}>
                    <Icon name="flip_to_front" size={15} /> Al frente
                  </button>
                  <button disabled={!info.canBack} onClick={() => { moveLayer(ctxMenu.clip.id, 'back'); setCtxMenu(null) }}>
                    <Icon name="flip_to_back" size={15} /> Al fondo
                  </button>
                </>
              )
            })()}
            <button onClick={() => { toggleDisabled(ctxMenu.clip.id); setCtxMenu(null) }}>
              <Icon name={ctxMenu.clip.disabled ? 'visibility' : 'visibility_off'} size={15} />
              {ctxMenu.clip.disabled ? 'Activar clip' : 'Desactivar clip'} <kbd>V</kbd>
            </button>
            {(ctxMenu.clip.kind === 'audio' || ctxMenu.clip.kind === 'video') && (
              clipBeats(ctxMenu.clip) ? (
                <button onClick={() => { setClipBeats(ctxMenu.clip.id, null); setCtxMenu(null) }}>
                  <Icon name="music_off" size={15} /> Quitar beats
                </button>
              ) : (
                <button disabled={!!beatBusy} onClick={() => { detectClipBeats(ctxMenu.clip.id); setCtxMenu(null) }}>
                  <Icon name="graphic_eq" size={15} /> Detectar beats
                </button>
              )
            )}
            {(ctxMenu.clip.kind === 'video' || ctxMenu.clip.kind === 'image') && (
              <button disabled={!!soundBusy} onClick={() => { soundDesignFor(ctxMenu.clip.id); setCtxMenu(null) }}>
                <Icon name="surround_sound" size={15} /> {soundBusy ? 'Sonorizando…' : 'Sonorizar con IA'}
              </button>
            )}
            {canFreeze(ctxMenu.clip, playhead) && (
              <button disabled={freezeBusy} onClick={() => { freezeAtPlayhead(ctxMenu.clip.id); setCtxMenu(null) }}>
                <Icon name="ac_unit" size={15} /> Congelar fotograma
              </button>
            )}
            {ctxMenu.clip.kind !== 'audio' && (
              <>
                <button onClick={() => { toggleFlip('h', ctxMenu.clip.id); setCtxMenu(null) }}>
                  <Icon name="flip" size={15} /> Voltear horizontal
                </button>
                <button className="ed-flip-v" onClick={() => { toggleFlip('v', ctxMenu.clip.id); setCtxMenu(null) }}>
                  <Icon name="flip" size={15} /> Voltear vertical
                </button>
              </>
            )}
            {ctxMenu.clip.kind === 'audio' && (
              <button
                disabled={!clipCopyText(ctxMenu.clip, project.audios)}
                onClick={() => copyClipDescription(ctxMenu.clip)}
              >
                <Icon name="content_copy" size={15} /> Copiar descripción
              </button>
            )}
            <button onClick={() => { copyAttrs(ctxMenu.clip.id); setCtxMenu(null) }}>
              <Icon name="content_copy" size={15} /> Copiar atributos <kbd>Ctrl+Alt+C</kbd>
            </button>
            <button
              disabled={!attrClipboard || attrClipboard.id === ctxMenu.clip.id}
              onClick={() => { openPasteAttrs(ctxMenu.clip.id); setCtxMenu(null) }}
            >
              <Icon name="content_paste" size={15} /> Pegar atributos… <kbd>Ctrl+Alt+V</kbd>
            </button>
            <button onClick={() => { splitClip(ctxMenu.clip.id, playhead); setCtxMenu(null) }}><Icon name="content_cut" size={15} /> Dividir aquí</button>
            <button onClick={() => { duplicateSelected(ctxMenu.clip); setCtxMenu(null) }}><Icon name="content_copy" size={15} /> Duplicar</button>
            <button className="danger" onClick={() => { deleteClip(ctxMenu.clip.id); setCtxMenu(null) }}><Icon name="delete" size={15} /> Eliminar</button>
          </AnchoredMenu>
        </>
      )}

      {/* Menú del hueco de una pista o de la regla: Generar Escena + marcas I/O */}
      {laneMenu && (
        <>
          <div className="ed-ctx-backdrop" onPointerDown={() => setLaneMenu(null)} onContextMenu={(e) => { e.preventDefault(); setLaneMenu(null) }} />
          <AnchoredMenu className="ed-ctx-menu" x={laneMenu.x} y={laneMenu.y}>
            <button className="accent" onClick={() => { setStickMenu({ x: laneMenu.x, y: laneMenu.y, time: laneMenu.time, trackId: laneMenu.track?.id }); setLaneMenu(null) }}>
              <Icon name="emoji_people" size={15} /> Agregar Stick
            </button>
            <button className="accent" onClick={() => openGenerateResource({ time: laneMenu.time })}>
              <Icon name="auto_awesome" size={15} /> Generar recurso {hasMarkRange(markRange) ? 'en el rango' : 'aquí'}
            </button>
            <button onClick={() => openSceneDirection({ time: laneMenu.time })}>
              <Icon name="theaters" size={15} /> Dirección de escena{hasMarkRange(markRange) ? ' del rango' : ''}
            </button>
            <div className="ed-ctx-sep" />
            <button onClick={() => { setMarkRange((m) => setMark(m, 'in', laneMenu.time)); setLaneMenu(null) }}>
              <Icon name="first_page" size={15} /> Marcar entrada aquí <kbd>I</kbd>
            </button>
            <button onClick={() => { setMarkRange((m) => setMark(m, 'out', laneMenu.time)); setLaneMenu(null) }}>
              <Icon name="last_page" size={15} /> Marcar salida aquí <kbd>O</kbd>
            </button>
            <button disabled={markRange.in == null && markRange.out == null}
              onClick={() => { setMarkRange(EMPTY_MARK); setLaneMenu(null) }}>
              <Icon name="backspace" size={15} /> Quitar marca <kbd>Alt+X</kbd>
            </button>
          </AnchoredMenu>
        </>
      )}

      {stickMenu && (
        <EdStickMenu
          x={stickMenu.x}
          y={stickMenu.y}
          onPick={(item) => addStickClip(item, { time: stickMenu.time, trackId: stickMenu.trackId })}
          onClose={() => setStickMenu(null)}
        />
      )}

      {directionWs && (
        <SceneDirectionWorkspace
          projectId={project.id}
          focus={directionWs.focus}
          markRange={markRange}
          reloadKey={directionReload}
          onClose={() => setDirectionWs(null)}
          onGenerate={generateFromDirection}
          onGoToSegment={(seg) => {
            setDirectionWs(null)
            setMarkRange({ in: seg.start, out: seg.end })
            seek(seg.start)
          }}
          onOpenComposition={(cid) => { setDirectionWs(null); goMotionTab(cid) }}
          onToast={(t) => { setClipToast(t); if (t?.type === 'success') reloadTimeline() }}
        />
      )}

      {genResource && (
        <GenerateResourceModal
          projectId={project.id}
          target={genResource}
          onChangeTarget={setGenResource}
          onClose={() => setGenResource(null)}
          onEditInStudio={(cid) => { setGenResource(null); goMotionTab(cid) }}
          onAddToTimeline={addMotionDraftToTimeline}
        />
      )}

      {genMotion && (
        <GenerateSceneModal
          key={genDirection?.segment?.id || 'free'}
          projectId={project.id}
          target={genMotion}
          direction={genDirection}
          onChangeTarget={setGenMotion}
          onClose={() => { setGenMotion(null); setGenDirection(null); setDirectionReload((n) => n + 1) }}
          onEditInStudio={(cid) => { setGenMotion(null); setGenDirection(null); setDirectionWs(null); goMotionTab(cid) }}
          onAddToTimeline={addMotionDraftToTimeline}
        />
      )}

      {trackMenu && (
        <>
          <div
            className="ed-ctx-backdrop"
            onPointerDown={() => setTrackMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setTrackMenu(null) }}
          />
          <AnchoredMenu className="ed-ctx-menu" x={trackMenu.x} y={trackMenu.y}>
            {trackContextItems(tracks.find((t) => t.id === trackMenu.track.id) || trackMenu.track, {
              linked: !!(tracks.find((t) => t.id === trackMenu.track.id) || trackMenu.track).linked_track_id,
              canLink: tracks.some((t) => t.kind === 'text'),
              hasText: !!trackTextContent(clips, trackMenu.track.id),
              hasSource: !!trackSource(clips, trackMenu.track.id),
              canUp: !motionMode && !!trackNeighbor(tracks, trackMenu.track.id, -1),
              canDown: !motionMode && !!trackNeighbor(tracks, trackMenu.track.id, 1),
            }).map((item) => (
              <button
                key={item.id}
                className={item.danger ? 'danger' : undefined}
                disabled={item.disabled}
                onClick={() => {
                  if (item.id === 'rename') {
                    const t = tracks.find((x) => x.id === trackMenu.track.id) || trackMenu.track
                    const name = window.prompt('Nombre de la pista', t.name || '')
                    if (name != null) renameTrack(t.id, name)
                    setTrackMenu(null)
                  } else if (item.id === 'track-up' || item.id === 'track-down') {
                    reorderTracks(stepTrack(tracksRef.current, trackMenu.track.id, item.id === 'track-up' ? -1 : 1))
                    setTrackMenu(null)
                  } else if (item.id === 'link') startLinkPick(trackMenu.track)
                  else if (item.id === 'unlink') unlinkTrack(trackMenu.track)
                  else if (item.id === 'copy-text') copyTrackText(trackMenu.track)
                  else if (item.id === 'copy-srt') copyTrackSrt(trackMenu.track)
                  else if (item.id === 'copy-srt-ref') copyTrackSrtRef(trackMenu.track)
                  else if (item.id === 'delete') requestDeleteTrack(trackMenu.track)
                }}
              >
                <Icon name={item.id === 'rename' ? 'edit' : item.id === 'track-up' ? 'arrow_upward' : item.id === 'track-down' ? 'arrow_downward' : item.id === 'link' ? 'link' : item.id === 'unlink' ? 'link_off' : item.id === 'copy-text' ? 'content_copy' : item.id === 'copy-srt' ? 'subtitles' : item.id === 'copy-srt-ref' ? 'description' : 'delete'} size={15} />
                {item.label}
              </button>
            ))}
          </AnchoredMenu>
        </>
      )}

      {/* Progreso de subtítulos */}
      {subJob && (subJob.status === 'pending' || subJob.status === 'running') && (
        <div className="ed-sub-toast"><Icon name="subtitles" size={16} /> {subJob.message || (subJob.srcClip?.kind === 'video' ? 'Transcribiendo…' : 'Generando subtítulos…')}</div>
      )}
      {subJob?.status === 'error' && (
        <div className="ed-sub-toast error" onClick={() => setSubJob(null)}>⚠️ {subJob.error}</div>
      )}

      <ConfirmModal
        open={!!trackToDelete}
        title={`¿Eliminar la pista ${trackToDelete?.name || ''}?`}
        message={trackToDelete
          ? `Se borrarán los ${clips.filter((c) => c.track_id === trackToDelete.id).length} clips de esta línea.`
          : ''}
        confirmText="Eliminar pista"
        onConfirm={() => applyRemoveTrack(trackToDelete.id)}
        onCancel={() => setTrackToDelete(null)}
      />
      <ConfirmModal
        open={!!fragmentAsk}
        title={fragmentAsk?.clipId ? '¿Fragmentar este cuadro?' : '¿Fragmentar los textos?'}
        message={fragmentAsk
          ? (fragmentAsk.clipId
            ? `Este cuadro se partirá en ${fragmentAsk.extra + 1} clips de hasta ${fragmentAsk.maxWords} palabra${fragmentAsk.maxWords === 1 ? '' : 's'}, conservando los tiempos.`
            : `Los cuadros con más de ${fragmentAsk.maxWords} palabras se partirán en ${fragmentAsk.extra} clip${fragmentAsk.extra === 1 ? '' : 's'} extra, conservando los tiempos.`)
          : ''}
        confirmText="Fragmentar"
        danger={false}
        onConfirm={applyFragment}
        onCancel={() => setFragmentAsk(null)}
      />
      <ConfirmModal
        open={!!replaceAsk}
        title="¿Reemplazar el clip?"
        message={replaceAsk
          ? `“${clips.find((c) => c.id === replaceAsk.targetId)?.name || 'El clip de debajo'}” se quitará de la pista y “${replaceAsk.payload?.name || 'el nuevo clip'}” ocupará su lugar. Para dejar los dos, suelta en la franja superior de la pista (crea una pista nueva).`
          : ''}
        confirmText="Reemplazar"
        onConfirm={applyReplaceDrop}
        onCancel={() => setReplaceAsk(null)}
      />
      {cropClipId && clips.some((c) => c.id === cropClipId) && (
        <EdCropModal
          clip={clips.find((c) => c.id === cropClipId)}
          mediaEl={mediaEls.current.get(cropClipId)}
          playhead={playhead}
          playing={playing}
          fps={fps}
          outAspect={outAspect}
          onSeek={scrub}
          onConfirm={confirmCrop}
          onCancel={() => setCropClipId(null)}
        />
      )}
      {soundResult && (
        <EdSoundDesign result={soundResult} onApply={applySoundDesign} onCancel={() => setSoundResult(null)} />
      )}

      {attrPaste && attrClipboard && (
        <EdPasteAttrs
          source={attrClipboard}
          targets={clips.filter((c) => attrPaste.ids.includes(c.id))}
          onPaste={applyPasteAttrs}
          onCancel={() => setAttrPaste(null)}
        />
      )}

      <SegmentConfirmModal
        ask={segAsk}
        onChange={patchSegAsk}
        onConfirm={confirmSegment}
        onCancel={() => { if (!segBusyRef.current) setSegAsk(null) }}
      />
      <Toast toast={clipToast} onClose={() => setClipToast(null)} />
    </div>
  )
}
