import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import Toast from '../../components/Toast'
import { fmt } from '../../lib/utils'
import { getTimeline, saveTimeline, prepareReframe, getJob, createClipJob, getSettings } from '../../services/api'
import { clamp } from '../../lib/panning'
import { defaultTextStyle, subtitleStyle, wrappedText, ensureEditorFonts, selectedSubtitleThemeId, clearTextTheme, effectiveTextStyle } from '../../lib/textstyles'
import { applyThemeToStyle, wordsPerBoxOptions, activeWordsPerBox, splitCaptionWords } from '../../lib/textKaraoke'
import {
  uid, FORMATS, mediaUrl, defaultTracks, newReframe, withKfIds,
  makeClip, makeTextClip, makeShapeClip, clipDur, clipEnd, clipPlaybackMuted, clipSpeed, clipKeepPitch, timelineToSource, sourceToTimeline, splitClipAt,
  canCaptionClip, removeTrack, shouldConfirmTrackDelete,
  extraClipsAfterSplit, extraClipsAfterOneSplit, splitTrackTextByMaxWords, splitOneTextClip,
  nextClipSelection, groupMoveFromOrig, patchClipsStyle, removeClipsByIds,
  previewElementVolume, parsePreviewVolume, PREVIEW_VOL_KEY, syncPreviewMedia,
  isVisualClip, trackKindForClip, IMAGE_DEFAULT_DUR,
  duplicateClipOntoTrack, syncMaterialInstances, applyFaceTrack,
  isEditingExistingClip, clipSaveIndex,
  trackContextItems, linkedPartnerName, linkTrackPair, unlinkTrackPair,
  applyAudioSpeedToLinkedText, matchClipsToFirstDuration,
  clipLayerInfo, moveClipLayer, canLayerClip,
  trackTextContent, clipCopyText,
  previewHead, safeMediaTime, mcpBusyClipIds,
} from './editorModel'
import { textRole } from '../../lib/textRole'
import { SHAPE_DEFAULT_DUR } from '../../lib/shapes'
import { applyFrame, disableOverlay, enableOverlay, isOverlay, mediaSize, newTransform, videosAt } from '../../lib/clipLayout'
import {
  AUDIO_FX_KEYS, applyVolumeFade, canKeyframe, clipPropsAt, clipVolumeAt, clampVolume, deleteKeyframeItem, flattenPatch, keyframeIdAt,
  normalizeItems, patchKeyframe, upsertKeyframeAt,
} from '../../lib/clipKeyframes'
import { drawMainView } from './render/canvas'
import { useExportJob } from './hooks/useExportJob'
import { useSubtitles } from './hooks/useSubtitles'
import { useFavorites } from './hooks/useFavorites'
import { snapshotTextStyle } from '../../lib/favorites'
import { createCanvasDownHandler } from './interactions'
import { kfSnap, normalizeFps, snapToFrame } from '../../lib/projectFps'
import { fmtRuler, tickStep } from './timelineScale'
import EdMaterial from './EdMaterial'
import EdTimeline from './EdTimeline'
import EdTopBar from './EdTopBar'
import EdViewerTools from './EdViewerTools'
import EdInspector from './EdInspector'
import EdCrops from './EdCrops'
import EdShape from './EdShape'
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
  return clip.kind === 'video'
    ? <video {...mediaProps} playsInline />
    : <audio {...mediaProps} />
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

// El recorte guardado (cx/cy/zoom) se hornea desde la MISMA fuente de verdad que
// el preview y el export: `clipPropsAt`. Sirva o no con pose-keyframes (si no hay,
// devuelve el encuadre de reframe), así "Guardar clip" siempre coincide con lo que
// se ve en pantalla. Muestrea en tiempo LOCAL (0 = inicio del corte = t de FFmpeg
// tras -ss); los tiempos NO se vuelven a desplazar.
function bakedReframeForCut(clip, dur) {
  const d = Math.max(0.1, dur)
  const times = new Set([0, +d.toFixed(4)])
  for (const it of normalizeItems(clip.keyframes?.items)) {
    times.add(+clamp(it.t, 0, d).toFixed(4))
  }
  const keyframes = [...times].sort((a, b) => a - b).map((t) => {
    const p = clipPropsAt(clip, t)
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
  return rf
}

export default function VideoEditor({ project, onChange, onBack, onOpenJson }) {
  const [tracks, setTracks] = useState(defaultTracks())
  const [clips, setClips] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [pps, setPps] = useState(60)
  const [fps, setFps] = useState(30)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selClipId, setSelClipId] = useState(null)
  const [selClipIds, setSelClipIds] = useState([])
  const [selTrackId, setSelTrackId] = useState('V1')
  const [selKfId, setSelKfId] = useState(null)
  const [hiddenKf, setHiddenKf] = useState(() => new Set())
  const [matTab, setMatTab] = useState('video')
  const [mcpAudit, setMcpAudit] = useState({ entries: [], active: [] })

  const [outW, setOutW] = useState(720)
  const [outH, setOutH] = useState(1280)
  const [audioDb, setAudioDb] = useState(-14)
  const [previewVol, setPreviewVol] = useState(() => {
    try { return parsePreviewVolume(localStorage.getItem(PREVIEW_VOL_KEY)) }
    catch { return 1 }
  })
  const [rowH, setRowH] = useState(52)
  const panels = usePanelLayout()

  const [ctxMenu, setCtxMenu] = useState(null)      // { x, y, clip }
  const [trackMenu, setTrackMenu] = useState(null)  // { x, y, track }
  const [linkPick, setLinkPick] = useState(null)    // id de pista de audio al relacionar
  const [trackToDelete, setTrackToDelete] = useState(null)
  const [fragmentAsk, setFragmentAsk] = useState(null)
  const [dragInfo, setDragInfo] = useState(null)    // { kind, duration, name }
  const [framingMode, setFramingMode] = useState(null) // { trackId, x, y, w } o null
  const [mainColTab, setMainColTab] = useState('main')
  const [cropMode, setCropMode] = useState(false)
  // Zoom SOLO visual del canvas (aleja/acerca la vista para ver alrededor del encuadre).
  // No toca el clip ni el export. Independiente por editor (Main vs Clip).
  const [mainZoom, setMainZoom] = useState(1)
  const [clipZoom, setClipZoom] = useState(1)
  const viewZoom = mainColTab === 'clip' ? clipZoom : mainZoom
  const setViewZoom = mainColTab === 'clip' ? setClipZoom : setMainZoom
  const [savedLabel, setSavedLabel] = useState('')
  const [clipMeta, setClipMeta] = useState({
    title: '', description: '', url: '', segStart: 0, segEnd: 0, segIndex: null,
    existingIndex: null,
    preparing: false, prepProgress: 0, prepMsg: '', err: '',
  })
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
  const tracksRef = useRef(tracks); tracksRef.current = tracks
  const selRef = useRef(selClipId); selRef.current = selClipId
  const selIdsRef = useRef(selClipIds); selIdsRef.current = selClipIds
  const selKfRef = useRef(selKfId); selKfRef.current = selKfId
  const pendingKfSel = useRef(null)
  const hiddenKfRef = useRef(hiddenKf); hiddenKfRef.current = hiddenKf
  const outRef = useRef({ w: outW, h: outH }); outRef.current = { w: outW, h: outH }
  const framingModeRef = useRef(null); framingModeRef.current = framingMode
  const cropModeRef = useRef(false); cropModeRef.current = cropMode
  const viewZoomRef = useRef(1); viewZoomRef.current = viewZoom
  const previewVolRef = useRef(previewVol); previewVolRef.current = previewVol
  const alignGuidesRef = useRef(null)
  const croppingRef = useRef(false)
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
  const hist = useEditorHistory(tracks, clips, loaded)
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
        if (tl?.width) setOutW(tl.width)
        if (tl?.height) setOutH(tl.height)
        if (tl?.audio_target_db != null) setAudioDb(tl.audio_target_db)
        if (tl?.fps) setFps(normalizeFps(tl.fps))
        try {
          const s = await getSettings()
          if (alive) setFps(normalizeFps(s?.export?.fps ?? tl?.fps))
        } catch { /* deja el fps del timeline */ }
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
    version: 1, fps, width: outW, height: outH, audio_target_db: audioDb, tracks, clips,
  }), [fps, outW, outH, audioDb, tracks, clips])

  function setListenVolume(v) {
    const n = parsePreviewVolume(v)
    setPreviewVol(n)
    previewVolRef.current = n
    try { localStorage.setItem(PREVIEW_VOL_KEY, String(n)) } catch { /* noop */ }
  }

  useEffect(() => {
    if (!loaded || clipModeRef.current) return
    const id = setTimeout(() => {
      saveTimeline(project.id, timelinePayload()).catch(() => {})
      setSavedLabel('Guardado')
    }, 800)
    return () => clearTimeout(id)
  }, [timelinePayload, loaded, project.id])

  // Recarga el timeline desde el servidor (tras ediciones de la IA por el MCP).
  // Reutiliza el MISMO mapeo que la carga inicial → no hay segundo estado.
  const reloadTimeline = useCallback(async () => {
    try {
      const tl = await getTimeline(project.id)
      if (!tl) return
      setTracks(tl.tracks || [])
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
        keep_pitch: c.keep_pitch !== false,
        reverse: !!c.reverse,
        speed_curve: c.speed_curve || null,
        frame: c.frame || (c.layout === 'overlay' ? 'free' : 'full'),
        ...(c.kind === 'text' ? { text_role: textRole(c) } : {}),
      })))
      if (tl.width) setOutW(tl.width)
      if (tl.height) setOutH(tl.height)
      if (tl.fps) setFps(normalizeFps(tl.fps))
    } catch { /* si falla, deja el estado actual */ }
  }, [project.id])

  // --- Selección de capa / clip superior ---
  const layerOf = useCallback((trackId) => {
    const vids = tracksRef.current.filter((t) => t.kind === 'video')
    return vids.findIndex((t) => t.id === trackId)
  }, [])
  const topVideoAt = useCallback((head) => {
    let best = null, bestLayer = -1
    for (const c of clipsRef.current) {
      if (!isVisualClip(c)) continue
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
      clipsRef, tracksRef, mediaEls, outRef, selRef, selIdsRef, selKfRef, hiddenKfRef,
      playingRef, framingModeRef, mainCanvasRef, mainStageRef, mainTextBox, topVideoAt, alignGuidesRef,
      clipModeRef, cropModeRef, croppingRef, fpsRef, hitListRef, viewZoomRef,
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

  function snapshotTl() {
    return {
      tracks, clips, playhead, selClipId, selClipIds, selTrackId, selKfId, pps,
      outW, outH,  // formato de salida: independiente por editor (Main vs Clip)
    }
  }
  function applyTl(s) {
    if (!s) return
    setTracks(s.tracks)
    setClips(s.clips)
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
    setPlayhead(0)
    playheadRef.current = 0
    setSelTrackId('V1')
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
  }
  function goMainTab() {
    if (mainColTab === 'main') return
    if (!projectTlRef.current) return
    stopPlayback()
    clipTlRef.current = snapshotTl()
    applyTl(projectTlRef.current)
    clipModeRef.current = false
    setCropMode(false)
    hist.reset()
    setLinkPick(null)
    setMainColTab('main')
  }
  function goClipTab() {
    if (mainColTab === 'clip') return
    stopPlayback()
    projectTlRef.current = snapshotTl()
    clipModeRef.current = true
    setCropMode(false)
    hist.reset()
    setLinkPick(null)
    setMainColTab('clip')
    if (clipTlRef.current) applyTl(clipTlRef.current)
    else applyEmptyClipTl()
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
    setCropMode(false)
    hist.reset()
    setClipSaveJob(null)
    setFaceJob(null)
    faceGen.current += 1
    setMainColTab('clip')
    applyEmptyClipTl()
    const title = info.title || `Tramo #${info.index}`
    setClipMeta({
      title,
      description: info.description || '',
      url,
      segStart: info.start || 0,
      segEnd: info.end || 0,
      segIndex: info.index,
      existingIndex: info.existing ? info.index : null,
      preparing: true,
      prepProgress: 0.04,
      prepMsg: 'Preparando el tramo…',
      err: '',
    })
    startClipPrepare(url, info.start, info.end, title)
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
      : bakedReframeForCut(video, end - start)
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
    const kind = trackKindForClip(clip.kind)
    const trackId = addTrack(kind)
    const copy = duplicateClipOntoTrack(clip, trackId, uid('c'))
    setClips((prev) => [...prev, copy])
    setSelClipId(copy.id)
    setSelClipIds([copy.id])
    setSelTrackId(trackId)
    setSelKfId(null)
  }

  async function startFaceTrack(mode) {
    if (faceJob && faceJob.status !== 'done' && faceJob.status !== 'error') return
    const url = (clipMeta.url || '').trim()
    if (!url || clipMeta.preparing) return
    const gen = ++faceGen.current
    setClipMeta((m) => ({ ...m, err: '' }))
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

  function registerMediaMeta(clip, el) {
    if (clip.kind === 'image') return
    const real = el.duration
    if (!real || !isFinite(real)) return
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const wasUntrimmed = Math.abs(c.out_point - c.source_duration) < 0.05 || c.source_duration <= 0
      const out = wasUntrimmed ? real : Math.min(c.out_point, real)
      return { ...c, source_duration: real, out_point: out }
    }))
  }

  // Clips nuevos "planos" (sin recorte/paneo horneado) arrancan como objeto libre:
  // Escala 100% = altura del clip = altura del cuadro naranja, centrado. Los clips
  // preparados/guardados (con reframe) conservan su encuadre.
  function wantsBaseFit(clip) {
    if (!isVisualClip(clip)) return false
    const rf = clip.reframe
    if (!rf) return true
    if (rf.keyframes?.length) return false
    if (rf.crop_w != null || rf.crop_h != null) return false
    if (rf.zoom != null && Math.abs(rf.zoom - 1) > 0.001) return false
    return true
  }
  const flagBaseFit = (clip) => (wantsBaseFit(clip) ? { ...clip, _baseFit: true } : clip)

  // Al cargar el medio, coloca el clip nuevo como objeto libre a altura completa del
  // cuadro (overlay, crop completo, centrado, scale = outH/srcH). Reutiliza la tubería
  // de overlay → el preview coincide con el export.
  function applyBaseFit(clip, el) {
    const { h } = mediaSize(el)
    if (!h) return
    const scale = +(outRef.current.h / h).toFixed(5)
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id || !c._baseFit) return c
      const rest = { ...c }
      delete rest._baseFit
      return {
        ...rest,
        layout: 'overlay',
        frame: 'free',
        reframe: { ...(c.reframe || newReframe()), crop_w: 1, crop_h: 1, dual_crop: false, keyframes: [] },
        transform: { x: 0.5, y: 0.5, scale, rotation: 0 },
      }
    }))
  }

  function targetTrackFor(kind) {
    const sel = tracks.find((t) => t.id === selTrackId)
    if (sel && sel.kind === kind && !sel.locked) return sel
    return tracks.find((t) => t.kind === kind && !t.locked) || null
  }

  function addAsset(assetKind, item) {
    if (assetKind === 'shape') {
      const track = targetTrackFor('video')
      if (!track) return
      const trackEnd = clips.filter((c) => c.track_id === track.id).reduce((m, c) => Math.max(m, clipEnd(c)), 0)
      const clip = makeShapeClip(track.id, trackEnd, SHAPE_DEFAULT_DUR, item)
      setClips((prev) => [...prev, clip])
      setSelClipId(clip.id)
      setSelClipIds([clip.id])
      return
    }
    const clipKind = assetKind === 'clips' ? 'video' : assetKind === 'images' ? 'image' : 'audio'
    const track = targetTrackFor(trackKindForClip(clipKind))
    if (!track) return
    const dur = assetKind === 'images'
      ? IMAGE_DEFAULT_DUR
      : assetKind === 'clips'
        ? ((item.end ?? item.duration ?? 0) - (item.start ?? 0))
        : (item.duration || 0)
    const trackEnd = clips.filter((c) => c.track_id === track.id).reduce((m, c) => Math.max(m, clipEnd(c)), 0)
    const clip = flagBaseFit(makeClip(assetKind, item, track.id, trackEnd, dur))
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
  }

  function dropAsset(payload, trackId, startTime) {
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
    }, trackId, startTime, payload.duration)
    const dropped = flagBaseFit(clip)
    setClips((prev) => [...prev, dropped])
    setSelClipId(dropped.id)
    setSelClipIds([dropped.id])
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

  function addTrack(kind, style) {
    const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'T'
    const nums = tracksRef.current.filter((t) => t.kind === kind).map((t) => parseInt(String(t.name).replace(/\D/g, ''), 10) || 0)
    const n = (nums.length ? Math.max(...nums) : 0) + 1
    const id = `${prefix}${n}-${uid('')}`
    const nt = { id, kind, name: `${prefix}${n}`, hidden: false, muted: false, locked: false, linked_track_id: null }
    if (kind === 'text') nt.style = style || subtitleStyle()
    setTracks((prev) => {
      if (kind === 'video') {
        const lastVid = prev.map((t, i) => (t.kind === 'video' ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
        const copy = [...prev]; copy.splice(lastVid + 1, 0, nt); return copy
      }
      return [...prev, nt]
    })
    return id
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
    const t = tracksRef.current.find((x) => x.id === id)
    if (t?.kind === 'text' || t?.kind === 'audio') setCropMode(false)
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
      if (isVisualClip(clip) && !isOverlay(clip)) setCropMode(true)
      else setCropMode(false)
    }
    return next
  }
  function clearCanvasSelection() {
    setSelClipId(null)
    setSelClipIds([])
    selIdsRef.current = []
    selRef.current = null
    setSelKfId(null)
    setCropMode(false)
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
      return { ...c, shape }
    }
    if (c.kind === 'text') {
      const style = { ...(c.style || {}) }
      if (patch.x != null) style.x = patch.x
      if (patch.y != null) style.y = patch.y
      if (patch.scale != null) style.scale = patch.scale
      if (patch.rotation != null) style.rotation = patch.rotation
      if (patch.opacity != null) style.opacity = patch.opacity
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
      next = { ...next, transform: tr, frame: 'free' }
    }
    if (patch.cx != null || patch.cy != null || patch.zoom != null) {
      const rf = { ...(c.reframe || newReframe()) }
      if (patch.zoom != null) rf.zoom = patch.zoom
      next = { ...next, reframe: rf }
    }
    return next
  }
  function commitPose(id, patch) {
    const ids = new Set(selIdsRef.current.includes(id) ? selIdsRef.current : [id])
    setClips((prev) => prev.map((c) => {
      if (!ids.has(c.id) || !canKeyframe(c)) return c
      let next = applyStaticPose(c, patch)
      const t = localTOf(next)
      next = upsertKf(next, t, patch)
      if (c.id === id) markKf(next, t)
      return next
    }))
  }
  function interpAnimKf(k, mode) {
    const clip = selectedClip
    if (!clip || !k) return
    setClips((prev) => prev.map((c) => (c.id === clip.id ? patchKeyframe(c, k.id, { interpolation: mode }) : c)))
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
      const t = localTOf(next)
      next = upsertKf(next, t, flattenPatch(patch, 'transform'))
      markKf(next, t)
      return next
    }))
  }
  function applyClipFrame(clip, slot) {
    if (!clip || !isVisualClip(clip)) return
    const group = clipsRef.current.filter((c) => selIdsRef.current.includes(c.id) && isVisualClip(c))
    const targets = group.length ? group : [clip]
    setClips((prev) => prev.map((c) => {
      if (!targets.some((t) => t.id === c.id)) return c
      const el = mediaEls.current.get(c.id)
      const srcW = mediaSize(el).w || 1920
      const srcH = mediaSize(el).h || 1080
      const srcT = clamp(timelineToSource(c, playhead), c.in_point, c.out_point)
      const clipT = Math.max(0, playhead - (c.start || 0))
      const patch = applyFrame(c, slot, srcW / srcH, outAspect, srcT, srcW, srcH, outW, outH, clipT)
      let next = {
        ...c,
        layout: patch.layout,
        frame: patch.frame,
        transform: patch.transform,
        reframe: { ...(c.reframe || newReframe()), ...patch.reframe },
      }
      next = upsertKf(next, clipT, flattenPatch({ ...(patch.transform || {}) }, 'transform'))
      if (c.id === clip.id) markKf(next, clipT)
      return next
    }))
  }
  function toggleOverlay(clip, on) {
    if (!clip || !isVisualClip(clip)) return
    if (!on) {
      setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, ...disableOverlay(c) } : c)))
      return
    }
    const el = mediaEls.current.get(clip.id)
    const srcW = mediaSize(el).w || 1920
    const srcH = mediaSize(el).h || 1080
    const srcT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
    const clipT = Math.max(0, playhead - (clip.start || 0))
    const patch = enableOverlay(clip, srcW / srcH, outAspect, srcT, srcW, srcH, outW, outH, clipT)
    setClips((prev) => prev.map((c) => (c.id === clip.id ? {
      ...c,
      layout: patch.layout,
      frame: patch.frame,
      transform: patch.transform,
      reframe: { ...(c.reframe || newReframe()), ...patch.reframe },
    } : c)))
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
  function addKeyframeAtPlayhead() {
    const clip = selectedClip
    if (!clip || !canKeyframe(clip)) return
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const t = clamp(localTOf(c), 0, clipDur(c))
      const next = upsertKf(c, t, {})
      markKf(next, t)
      return next
    }))
  }
  function applySelectedFade(side) {
    const ids = new Set(selIdsRef.current)
    setClips((prev) => prev.map((c) => {
      if (!ids.has(c.id) || (c.kind !== 'audio' && c.kind !== 'video')) return c
      return applyVolumeFade(c, clipDur(c), side)
    }))
  }
  function patchKeyframePan(clip, kf, mode) {
    if (!clip || !kf) return
    const patchArr = (arr) => (arr || []).map((k) => (k.id === kf.id ? { ...k, pan_mode: mode } : k))
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id || !c.reframe) return c
      return {
        ...c,
        reframe: {
          ...c.reframe,
          keyframes: patchArr(c.reframe.keyframes),
          keyframes2: patchArr(c.reframe.keyframes2),
        },
      }
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
  function toggleKfHidden(id) {
    setHiddenKf((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
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
      if (!Object.keys(pose).length) return c
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
      if (Object.keys(pose).length) {
        const t = localTOf(next)
        next = upsertKf(next, t, pose)
        if (c.id === id) markKf(next, t)
      }
      return next
    }))
  }
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
  function applyFragmentTrack() {
    applyFragment()
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
    return { version: 1, fps, width: outW, height: outH, audio_target_db: audioDb, tracks, clips: outClips }
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
        version: 1, fps, width: outW, height: outH, audio_target_db: audioDb,
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
    const nextRf = applyFaceTrack(video.reframe, kfs || [], faceJob.mode)
    setClips((prev) => prev.map((c) => (c.id === video.id ? { ...c, reframe: nextRf } : c)))
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
  const { subJob, setSubJob, requestSubtitles } = useSubtitles(project.id, {
    tracksRef, ensureTextTrack, setClips, setCtxMenu, onChange,
  })
  const fav = useFavorites(project.id)

  function applyHistSnap(s) {
    if (!s) return
    setTracks(s.tracks || [])
    setClips(s.clips || [])
  }

  // --- Arrastrar en el canvas: compuesto, o recorte en modo encuadre ---
  const onCanvasDown = createCanvasDownHandler({
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, changeShape, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe, clipsRef, tracksRef, playheadRef, alignGuidesRef, seek: scrub, croppingRef,
    clipModeRef, cropModeRef, hitListRef, viewZoomRef,
    onSelectClip: handleSelectClip,
    onClearSelection: clearCanvasSelection,
    changeTransform, commitPose, upsertKeyframe, outW, outH,
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
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'z') {
          e.preventDefault()
          applyHistSnap(e.shiftKey ? histRef.current.redo() : histRef.current.undo())
        } else if (k === 'y') {
          e.preventDefault()
          applyHistSnap(histRef.current.redo())
        }
        return
      }
      if (e.altKey) return
      if (e.code === 'Space') {
        if (e.repeat) { e.preventDefault(); return }
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgePlayhead(-0.5)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgePlayhead(0.5)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selIdsRef.current.length) { e.preventDefault(); deleteClip(selIdsRef.current[0]) }
      } else if (e.key.toLowerCase() === 's') {
        if (selIdsRef.current.length) { e.preventDefault(); splitClip(selIdsRef.current[0], playheadRef.current) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setFormat(fmtId) {
    const f = FORMATS.find((x) => x.id === fmtId)
    if (f) { setOutW(f.w); setOutH(f.h) }
  }
  const curFormat = FORMATS.find((f) => f.w === outW && f.h === outH)?.id || 'custom'

  // Elementos multimedia ocultos (el texto no tiene medio)
  const mediaPool = clips.filter((c) => c.kind !== 'text' && c.kind !== 'shape').map((c) => (
    <HiddenMedia
      key={c.id}
      clip={c}
      src={mediaUrl(project.id, c)}
      mediaEls={mediaEls}
      onLoadedMetadata={(e) => { registerMediaMeta(c, e.target); applyBaseFit(c, e.target) }}
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
      className={`veditor${mainColTab === 'clip' ? ' clip-mode' : ''}${linkPick ? ' link-picking' : ''}${panels.dragging ? ` is-resizing is-rs-${panels.dragging}` : ''}`}
      style={panels.vars}
    >
      <div className="ed-hidden-media">{mediaPool}</div>

      <EdTopBar
        projectName={project.name}
        savedLabel={savedLabel}
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
        onBack={onBack}
        onUndo={() => applyHistSnap(hist.undo())}
        onRedo={() => applyHistSnap(hist.redo())}
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
      />

      <div className="veditor-workspace" ref={panels.workRef}>
        <EdMaterial
          project={project}
          onAdd={addAsset}
          onDragInfo={setDragInfo}
          onRefresh={onChange}
          fav={fav}
          onEditYtClip={openClipEditor}
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
          onExportFps={setFps}
          audioDb={audioDb}
          onAudioDb={setAudioDb}
          aiContext={{ project_id: project.id, selected_clip_id: selClipId || null, selected_track_id: selTrackId || null, current_time: Math.round((playhead || 0) * 100) / 100 }}
          onReloadTimeline={reloadTimeline}
          onMcpAudit={setMcpAudit}
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
          </div>
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
            onPointerDown={onCanvasDown}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].includes('application/x-material')) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const raw = e.dataTransfer.getData('application/x-material')
              if (!raw) return
              try { dropAsset(JSON.parse(raw), selTrackId, playhead) } catch { /* noop */ }
            }}
            style={{ cursor: (cropMode || mainColTab === 'clip' || framingMode) ? 'crosshair' : ((canEditFrame || isTextSel || isShapeSel) ? 'move' : 'default') }}
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
            {cropMode && mainColTab === 'main' && canEditFrame && (
              <div className="ed-stage-hint">Vídeo completo · arrastra el recuadro para otro plano · esquinas para zoom</div>
            )}
            {mainColTab === 'clip' && canEditFrame && (
              <div className="ed-stage-hint">Ajusta el recuadro · Guardar clip lo deja en Materiales</div>
            )}
            {!cropMode && mainColTab === 'main' && canEditFrame && overlayOn && (
              <div className="ed-stage-hint">Arrastra para colocar · esquinas escala · punto rota</div>
            )}
            {!cropMode && mainColTab === 'main' && canEditFrame && !overlayOn && (
              <div className="ed-stage-hint">Arrastra para panear el plano · esquinas zoom · punto rota</div>
            )}
            {isTextSel && !cropMode && (
              <div className="ed-stage-hint">
                {selClipIds.length > 1
                  ? `${selClipIds.length} textos · arrastra en el timeline para mover el grupo`
                  : 'Arrastra el texto · esquinas para tamaño'}
              </div>
            )}
            {isShapeSel && !cropMode && (
              <div className="ed-stage-hint">Arrastra la figura · esquinas para tamaño · círculo para rotar</div>
            )}
            {framingMode && <div className="ed-stage-hint">Ajusta el recuadro amarillo y pulsa Guardar</div>}
          </div>
          <div className="ed-transport">
            <button className="icon-btn" type="button" onClick={() => nudgePlayhead(-0.5)} title="Atrás 0,5s (←)">
              <Icon name="fast_rewind" size={18} />
            </button>
            <button className="icon-btn big" type="button" onClick={togglePlay} title="Reproducir / Pausa (Espacio)">
              <Icon name={playing ? 'pause_circle' : 'play_circle'} size={24} />
            </button>
            <button className="icon-btn" type="button" onClick={() => nudgePlayhead(0.5)} title="Adelante 0,5s (→)">
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
            <EdViewerTools
              zoom={viewZoom}
              onZoom={setViewZoom}
              formatId={curFormat}
              onFormat={setFormat}
              formatCustomLabel={`${outW}×${outH}`}
            />
          </div>
          {exportJob?.status === 'error' && <div className="error small">⚠️ {exportJob.error}</div>}
          {clipSaveJob?.status === 'error' && <div className="error small">⚠️ {clipSaveJob.error}</div>}
        </div>
        <EdSplit axis="x" kind="inspector" label="Redimensionar inspector" onDown={panels.begin('inspector')} />

        <EdInspector
          selectedClip={isAudioTrackSel ? (trackAudioClip || { kind: 'audio', volume: 1, muted: false, audio_fx: {}, start: 0 }) : selectedClip}
          textMode={isTextSel ? 'clip' : (isTextTrackSel ? 'track' : null)}
          audioMode={isAudioTrackSel ? 'track' : null}
          cropMode={cropMode}
          onCropMode={setCropMode}
          overlayOn={overlayOn}
          onToggleOverlay={(on) => selectedClip && toggleOverlay(selectedClip, on)}
          clipMode={mainColTab === 'clip'}
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
            onChangeFrame: (slot) => applyClipFrame(selectedClip, slot),
            selKfId,
            onInterpKf: interpAnimKf,
            fps,
            heightScale,
            audioMode: isAudioTrackSel ? 'track' : null,
            trackLabel: isAudioTrackSel ? selTrackObj.name : null,
            trackEmpty: isAudioTrackSel && !trackAudioClip,
            onAddKf: isAudioTrackSel ? undefined : addKeyframeAtPlayhead,
            onFade: isAudioTrackSel ? (side) => fadeTrackAudio(selTrackObj.id, side) : applySelectedFade,
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
          shapeProps={isShapeSel ? {
            clip: selectedClip,
            layer: layerInfo,
            onMoveLayer: (action) => moveLayer(selectedClip.id, action),
            onChangeShape: (patch) => changeShape(selectedClip.id, patch),
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
      </div>

      <EdSplit axis="y" kind="bottom" label="Redimensionar timeline" onDown={panels.begin('bottom')} />

      {/* ===== Timeline + keyframes ===== */}
      <div className={`veditor-bottom${mainColTab === 'clip' ? ' clip-mode' : ''}`} ref={panels.bottomRef}>
        <EdTimeline
          tracks={tracks} clips={clips} pps={pps} setPps={setPps} fps={fps}
          duration={duration} playhead={playhead} rowH={rowH} setRowH={setRowH}
          selectedClipId={selClipId} selectedClipIds={selClipIds} selectedTrackId={selTrackId}
          selectedClip={selectedClip} selKfId={selKfId} dragInfo={dragInfo}
          mcpBusyIds={mcpBusyIds}
          onSeek={seek}
          onScrub={scrub}
          onSelectClip={handleSelectClip}
          onSelectTrack={selectTrack}
          onDoubleClip={(clip) => {
            seek(clip.start + 0.03)
            setSelClipId(clip.id)
            setSelClipIds([clip.id])
            setSelKfId(null)
          }}
          onMutateClip={mutateClip}
          onMoveGroup={moveGroup}
          onMatchDuration={matchSelectedDurations}
          onSplit={splitClip}
          onDuplicate={duplicateSelected}
          onFaceTrack={mainColTab === 'clip' ? startFaceTrack : undefined}
          faceTrackBusy={!!faceBusy}
          faceTrackDisabled={!clipMeta.url || clipMeta.preparing}
          onDeleteClip={deleteClip}
          previewVol={previewVol}
          onPreviewVol={setListenVolume}
          onDropAsset={dropAsset}
          onTrackToggle={trackToggle}
          onTrackCompact={compactTrack}
          onAddTrack={addTrack}
          onAddTextTrack={addTextTrack}
          onRenameTrack={renameTrack}
          onMoveKeyframe={moveKeyframe}
          onSelectKf={selectTimelineKf}
          onAddKf={addKeyframeAtPlayhead}
          onDeleteKf={deleteSelectedKeyframe}
          onContextClip={(e, clip) => {
            e.preventDefault()
            if (!selIdsRef.current.includes(clip.id)) {
              setSelClipId(clip.id)
              setSelClipIds([clip.id])
              selIdsRef.current = [clip.id]
              selRef.current = clip.id
            }
            setCtxMenu({ x: e.clientX, y: e.clientY, clip })
          }}
          onContextTrack={(e, track) => {
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
        <EdSplit axis="x" kind="crops" label="Redimensionar keyframes" onDown={panels.begin('crops')} />
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
          onAddKf={addKeyframeAtPlayhead}
          onSelectKf={(k) => k && selectTimelineKf(k.id)}
          onDeleteKf={deleteAnimKf}
        />
      </div>

      {/* Menú contextual (click derecho en clip) */}
      {ctxMenu && (
        <>
          <div className="ed-ctx-backdrop" onPointerDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <AnchoredMenu className="ed-ctx-menu" x={ctxMenu.x} y={ctxMenu.y}>
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
            {ctxMenu.clip.kind === 'audio' && (
              <button
                disabled={!clipCopyText(ctxMenu.clip, project.audios)}
                onClick={() => copyClipDescription(ctxMenu.clip)}
              >
                <Icon name="content_copy" size={15} /> Copiar descripción
              </button>
            )}
            <button onClick={() => { splitClip(ctxMenu.clip.id, playhead); setCtxMenu(null) }}><Icon name="content_cut" size={15} /> Dividir aquí</button>
            <button onClick={() => { duplicateSelected(ctxMenu.clip); setCtxMenu(null) }}><Icon name="content_copy" size={15} /> Duplicar</button>
            <button className="danger" onClick={() => { deleteClip(ctxMenu.clip.id); setCtxMenu(null) }}><Icon name="delete" size={15} /> Eliminar</button>
          </AnchoredMenu>
        </>
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
                  } else if (item.id === 'link') startLinkPick(trackMenu.track)
                  else if (item.id === 'unlink') unlinkTrack(trackMenu.track)
                  else if (item.id === 'copy-text') copyTrackText(trackMenu.track)
                  else if (item.id === 'delete') requestDeleteTrack(trackMenu.track)
                }}
              >
                <Icon name={item.id === 'rename' ? 'edit' : item.id === 'link' ? 'link' : item.id === 'unlink' ? 'link_off' : item.id === 'copy-text' ? 'content_copy' : 'delete'} size={15} />
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
      <Toast toast={clipToast} onClose={() => setClipToast(null)} />
    </div>
  )
}
