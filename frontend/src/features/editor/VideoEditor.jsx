import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import Toast from '../../components/Toast'
import { fmt } from '../../lib/utils'
import { getTimeline, saveTimeline, prepareReframe, getJob, createClipJob } from '../../services/api'
import { clamp, clampCenter, frameAt } from '../../lib/panning'
import { defaultTextStyle, subtitleStyle, wrappedText, ensureEditorFonts, selectedSubtitleThemeId, clearTextTheme } from '../../lib/textstyles'
import { applyThemeToStyle } from '../../lib/textKaraoke'
import {
  uid, FORMATS, mediaUrl, defaultTracks, newReframe, withKfIds,
  makeClip, makeTextClip, clipDur, clipEnd, clipPlaybackMuted, clipSpeed, timelineToSource, sourceToTimeline, splitClipAt,
  canCaptionClip, removeTrack, shouldConfirmTrackDelete,
  extraClipsAfterSplit, splitTrackTextByMaxWords,
  nextClipSelection, groupMoveFromOrig, patchClipsStyle, removeClipsByIds,
  previewElementVolume, parsePreviewVolume, PREVIEW_VOL_KEY,
  isVisualClip, trackKindForClip, IMAGE_DEFAULT_DUR,
  duplicateClipOntoTrack, syncMaterialInstances, applyFaceTrack,
  isEditingExistingClip, clipSaveIndex,
  trackContextItems, linkedPartnerName, linkTrackPair, unlinkTrackPair,
  applyAudioSpeedToLinkedText,
} from './editorModel'
import { textRole } from '../../lib/textRole'
import { applyFrame, disableOverlay, enableOverlay, isOverlay, mediaSize, newTransform, videosAt } from '../../lib/clipLayout'
import { drawComposite, drawMainView } from './render/canvas'
import { useExportJob } from './hooks/useExportJob'
import { useSubtitles } from './hooks/useSubtitles'
import { useFavorites } from './hooks/useFavorites'
import { snapshotTextStyle } from '../../lib/favorites'
import { createMainDownHandler, createResultDownHandler } from './interactions'
import EdMaterial from './EdMaterial'
import EdTimeline from './EdTimeline'
import EdCrops from './EdCrops'
import EdText from './EdText'
import AnchoredMenu from '../../components/AnchoredMenu'
import JobStatusBar from '../../components/JobStatusBar'
import './editor.css'

const AUDIO_DB_PRESETS = [-24, -18, -16, -14, -12, -10, -8]

function clipWorkspaceTracks() {
  return [{ id: 'V1', kind: 'video', name: 'V1', hidden: false, muted: false, locked: false }]
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

export default function VideoEditor({ project, onChange, onBack, onOpenJson }) {
  const [tracks, setTracks] = useState(defaultTracks())
  const [clips, setClips] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [pps, setPps] = useState(60)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selClipId, setSelClipId] = useState(null)
  const [selClipIds, setSelClipIds] = useState([])
  const [selTrackId, setSelTrackId] = useState('V1')
  const [selKfId, setSelKfId] = useState(null)
  const [hiddenKf, setHiddenKf] = useState(() => new Set())

  const [outW, setOutW] = useState(720)
  const [outH, setOutH] = useState(1280)
  const [audioDb, setAudioDb] = useState(-14)
  const [previewVol, setPreviewVol] = useState(() => {
    try { return parsePreviewVolume(localStorage.getItem(PREVIEW_VOL_KEY)) }
    catch { return 1 }
  })
  const [rowH, setRowH] = useState(52)

  const [ctxMenu, setCtxMenu] = useState(null)      // { x, y, clip }
  const [trackMenu, setTrackMenu] = useState(null)  // { x, y, track }
  const [linkPick, setLinkPick] = useState(null)    // id de pista de audio al relacionar
  const [trackToDelete, setTrackToDelete] = useState(null)
  const [fragmentAsk, setFragmentAsk] = useState(null)
  const [dragInfo, setDragInfo] = useState(null)    // { kind, duration, name }
  const [framingMode, setFramingMode] = useState(null) // { trackId, x, y, w } o null
  const [mainColTab, setMainColTab] = useState('main')
  const [clipMeta, setClipMeta] = useState({
    title: '', description: '', url: '', segStart: 0, segEnd: 0, segIndex: null,
    existingIndex: null,
    preparing: false, prepProgress: 0, prepMsg: '', err: '',
  })
  const [clipSaveJob, setClipSaveJob] = useState(null)
  const [faceJob, setFaceJob] = useState(null)
  const [clipToast, setClipToast] = useState(null)

  const mainCanvasRef = useRef(null)
  const resultCanvasRef = useRef(null)
  const mainStageRef = useRef(null)
  const mediaEls = useRef(new Map())
  const rafRef = useRef(0)
  const playRef = useRef({ perf: 0, head: 0 })
  const mainTextBox = useRef(null)

  const playheadRef = useRef(0); playheadRef.current = playhead
  const playingRef = useRef(false); playingRef.current = playing
  const clipsRef = useRef(clips); clipsRef.current = clips
  const tracksRef = useRef(tracks); tracksRef.current = tracks
  const selRef = useRef(selClipId); selRef.current = selClipId
  const selIdsRef = useRef(selClipIds); selIdsRef.current = selClipIds
  const selKfRef = useRef(selKfId); selKfRef.current = selKfId
  const hiddenKfRef = useRef(hiddenKf); hiddenKfRef.current = hiddenKf
  const outRef = useRef({ w: outW, h: outH }); outRef.current = { w: outW, h: outH }
  const framingModeRef = useRef(null); framingModeRef.current = framingMode
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
  const selectedClip = clips.find((c) => c.id === selClipId) || null
  const outAspect = outW / outH

  // Ajusta el buffer del canvas de Resultado al formato elegido (sin deformar).
  useEffect(() => {
    const c = resultCanvasRef.current
    if (!c) return
    const a = outW / outH
    if (a >= 1) { c.width = 640; c.height = Math.round(640 / a) }
    else { c.height = 640; c.width = Math.round(640 * a) }
  }, [outW, outH])

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
            muted: !!c.muted,
            speed: c.speed,
            keep_pitch: !!c.keep_pitch,
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
      } catch { /* vacía */ } finally {
        if (alive) setLoaded(true)
      }
    })()
    return () => { alive = false }
  }, [project.id])

  // --- Autoguardado ---
  const timelinePayload = useCallback(() => ({
    version: 1, fps: 30, width: outW, height: outH, audio_target_db: audioDb, tracks, clips,
  }), [outW, outH, audioDb, tracks, clips])

  function setListenVolume(v) {
    const n = parsePreviewVolume(v)
    setPreviewVol(n)
    previewVolRef.current = n
    try { localStorage.setItem(PREVIEW_VOL_KEY, String(n)) } catch { /* noop */ }
  }

  useEffect(() => {
    if (!loaded || clipModeRef.current) return
    const id = setTimeout(() => { saveTimeline(project.id, timelinePayload()).catch(() => {}) }, 800)
    return () => clearTimeout(id)
  }, [timelinePayload, loaded, project.id])

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

  // --- Motor rAF: Main + Resultado + reproducción ---
  useEffect(() => {
    const resultCtx = resultCanvasRef.current?.getContext('2d')
    const env = {
      clipsRef, tracksRef, mediaEls, outRef, selRef, selIdsRef, selKfRef, hiddenKfRef,
      playingRef, framingModeRef, mainCanvasRef, mainTextBox, topVideoAt, alignGuidesRef,
      clipModeRef,
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

      for (const c of clipsRef.current) {
        const el = mediaEls.current.get(c.id)
        if (!el || c.kind === 'image' || typeof el.play !== 'function') continue
        const track = tracksRef.current.find((t) => t.id === c.track_id)
        const cd = clipDur(c)
        const active = head >= c.start - 0.02 && head < c.start + cd
        const expected = clamp(timelineToSource(c, head), c.in_point, c.out_point)
        if (active && playingRef.current) {
          el.muted = clipPlaybackMuted(c, track)
          el.volume = previewElementVolume(c.volume ?? 1, previewVolRef.current, clipPlaybackMuted(c, track))
          if (c.reverse) {
            if (!el.paused) el.pause()
            if (Math.abs(el.currentTime - expected) > 0.04) { try { el.currentTime = expected } catch { /* noop */ } }
          } else {
            try { el.playbackRate = clipSpeed(c) } catch { /* noop */ }
            if (el.paused) { try { el.currentTime = expected } catch { /* noop */ }; el.play().catch(() => {}) }
            else if (Math.abs(el.currentTime - expected) > 0.35) { try { el.currentTime = expected } catch { /* noop */ } }
          }
        } else if (!el.paused) {
          el.pause()
        }
      }

      // Sincronizar fotogramas de todos los vídeos activos (fill + overlays)
      if (!playingRef.current) {
        for (const c of videosAt(head, clipsRef.current, tracksRef.current)) {
          if (c.kind === 'image') continue
          const el = mediaEls.current.get(c.id)
          if (el && el.videoWidth) {
            const expected = clamp(timelineToSource(c, head), c.in_point, c.out_point)
            if (Math.abs(el.currentTime - expected) > 0.06) { try { el.currentTime = expected } catch { /* noop */ } }
          }
        }
      }

      if (resultCtx) {
        const sel = clipsRef.current.find((c) => c.id === selRef.current)
        drawComposite(resultCtx, head, (sel && isOverlay(sel)) ? sel.id : null, env)
      }

      drawMainView(head, env)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topVideoAt])

  // --- Transporte ---
  function playPlayback() {
    if (duration <= 0) return
    let head = playheadRef.current
    if (head >= duration - 0.02) head = 0
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
  function togglePlay() { if (playing) stopPlayback(); else playPlayback() }
  function seek(t) {
    const nt = clamp(t, 0, Math.max(0, duration))
    playheadRef.current = nt
    setPlayhead(nt)
    if (playingRef.current) playRef.current = { perf: performance.now(), head: nt }
  }

  function snapshotTl() {
    return {
      tracks, clips, playhead, selClipId, selClipIds, selTrackId, selKfId, pps,
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
    setLinkPick(null)
    setMainColTab('main')
  }
  function goClipTab() {
    if (mainColTab === 'clip') return
    stopPlayback()
    projectTlRef.current = snapshotTl()
    clipModeRef.current = true
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
    const cutRf = reframeForCut(video.reframe, video.in_point || 0, video.out_point || (end - start))
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

  function targetTrackFor(kind) {
    const sel = tracks.find((t) => t.id === selTrackId)
    if (sel && sel.kind === kind && !sel.locked) return sel
    return tracks.find((t) => t.kind === kind && !t.locked) || null
  }

  function addAsset(assetKind, item) {
    const clipKind = assetKind === 'clips' ? 'video' : assetKind === 'images' ? 'image' : 'audio'
    const track = targetTrackFor(trackKindForClip(clipKind))
    if (!track) return
    const dur = assetKind === 'images'
      ? IMAGE_DEFAULT_DUR
      : assetKind === 'clips'
        ? ((item.end ?? item.duration ?? 0) - (item.start ?? 0))
        : (item.duration || 0)
    const trackEnd = clips.filter((c) => c.track_id === track.id).reduce((m, c) => Math.max(m, clipEnd(c)), 0)
    const clip = makeClip(assetKind, item, track.id, trackEnd, dur)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
  }

  function dropAsset(payload, trackId, startTime) {
    const clip = makeClip(payload.asset_kind, {
      index: payload.asset_id, id: payload.asset_id, filename: payload.filename,
      name: payload.name, label: payload.name, duration: payload.duration, end: payload.duration, start: 0,
      reframe: payload.reframe,
      scope: payload.scope,
      description: payload.description,
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

  // Compactar pista: junta los clips uno tras otro (sin huecos ni solapes),
  // manteniendo su orden y la posición del primero.
  function compactTrack(trackId) {
    setClips((prev) => {
      const track = tracksRef.current.find((t) => t.id === trackId)
      if (track?.locked) return prev
      const ordered = prev
        .filter((c) => c.track_id === trackId)
        .sort((a, b) => a.start - b.start)
      if (ordered.length < 2) return prev
      const nextStart = {}
      let cursor = ordered[0].start
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
  function selectTrack(id) {
    setSelTrackId(id)
    setSelClipId(null)
    setSelClipIds([])
    setSelKfId(null)
    setFramingMode(null)
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
    if (!keepGroup) setFramingMode(null)
    return next
  }
  function moveGroup(origs, deltaT) {
    setClips((prev) => groupMoveFromOrig(prev, origs, deltaT))
  }

  // --- Encuadres / keyframes ---
  function changeReframe(id, patch) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, reframe: { ...(c.reframe || newReframe()), ...patch } } : c)))
  }
  function changeTransform(id, patch) {
    setClips((prev) => prev.map((c) => (
      c.id === id ? { ...c, frame: 'free', transform: { ...newTransform(), ...c.transform, ...patch } } : c
    )))
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
      const localT = clamp(timelineToSource(c, playhead), c.in_point, c.out_point)
      const patch = applyFrame(c, slot, srcW / srcH, outAspect, localT, srcW, srcH, outW, outH)
      return {
        ...c,
        layout: patch.layout,
        frame: patch.frame,
        transform: patch.transform,
        reframe: { ...(c.reframe || newReframe()), ...patch.reframe },
      }
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
    const localT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
    const patch = enableOverlay(clip, srcW / srcH, outAspect, localT, srcW, srcH, outW, outH)
    setClips((prev) => prev.map((c) => (c.id === clip.id ? {
      ...c,
      layout: patch.layout,
      frame: patch.frame,
      transform: patch.transform,
      reframe: { ...(c.reframe || newReframe()), ...patch.reframe },
    } : c)))
  }
  function upsertKeyframe(clip, localT, cx, cy, extra = {}) {
    let newId = null
    setClips((prev) => prev.map((c) => {
      if (c.id !== clip.id) return c
      const rf = { ...(c.reframe || newReframe()) }
      const kfs = [...(rf.keyframes || [])]
      const t = +clamp(localT, c.in_point, c.out_point).toFixed(3)
      const j = kfs.findIndex((k) => Math.abs(k.t - t) < 0.06)
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
      return { ...c, reframe: rf }
    }))
    if (newId) setSelKfId(newId)
  }
  function addKeyframeAtPlayhead() {
    const clip = selectedClip
    if (!clip || !isVisualClip(clip)) return
    const localT = clamp(timelineToSource(clip, playhead), clip.in_point, clip.out_point)
    const fr = frameAt(clip.reframe?.keyframes, localT, clip.reframe?.zoom ?? 1, clip.reframe?.pan_mode || 'smooth')
    const el = mediaEls.current.get(clip.id)
    const sz = mediaSize(el)
    const srcAspect = sz.w ? sz.w / sz.h : 16 / 9
    const c = clampCenter(fr.cx, fr.cy, fr.zoom, srcAspect, outAspect)
    upsertKeyframe(clip, localT, c.cx, c.cy, { zoom: fr.zoom })
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
    const kf = [...(clip.reframe?.keyframes || []), ...(clip.reframe?.keyframes2 || [])].find((k) => k.id === selKfId)
    if (kf) deleteKeyframe(clip, kf)
  }
  function moveKeyframe(clipId, idx, newT) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clipId || !c.reframe) return c
      const sorted = [...c.reframe.keyframes].sort((a, b) => a.t - b.t)
      const target = sorted[idx]
      if (!target) return c
      const kfs = c.reframe.keyframes.map((k) => (k.id === target.id ? { ...k, t: newT } : k))
      return { ...c, reframe: { ...c.reframe, keyframes: kfs } }
    }))
    const c = clips.find((x) => x.id === clipId)
    if (c) seek(sourceToTimeline(c, newT))
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
  function addText() {
    const tid = ensureTextTrack()
    const track = tracksRef.current.find((t) => t.id === tid)
    const fromTrack = track?.style || {}
    const style = {
      ...defaultTextStyle(),
      x: fromTrack.x ?? 0.5,
      y: fromTrack.y ?? 0.5,
      w: fromTrack.w ?? 0.8,
      size: fromTrack.size ?? defaultTextStyle().size,
      opacity: fromTrack.opacity ?? 1,
    }
    const end = clipsRef.current.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
    const dur = Math.max(3, +(end - playhead).toFixed(3))
    const clip = makeTextClip(tid, playhead, dur, 'Texto', style)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
    setSelClipIds([clip.id])
    setSelKfId(null)
  }
  function changeText(id, text) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, text, name: (text || 'Texto').slice(0, 22) } : c)))
  }
  function changeStyle(id, patch) {
    const ids = selIdsRef.current.includes(id) ? selIdsRef.current : [id]
    setClips((prev) => patchClipsStyle(prev, ids, patch))
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
  function startFramingSelection() {
    const ids = selIdsRef.current.filter((id) => clipsRef.current.find((c) => c.id === id)?.kind === 'text')
    if (!ids.length) return
    const st = clipsRef.current.find((c) => c.id === ids[0])?.style || defaultTextStyle()
    const h = clamp((st.size ?? 0.07) * 1.5, 0.05, 0.5)
    setFramingMode({ clipIds: ids, x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.8, h })
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
    const maxWords = Math.max(1, Math.floor(Number(tracksRef.current.find((t) => t.id === trackId)?.style?.max_words) || 8))
    const extra = extraClipsAfterSplit(clipsRef.current, trackId, maxWords)
    if (extra <= 0) return
    setFragmentAsk({ trackId, maxWords, extra })
  }
  function applyFragmentTrack() {
    if (!fragmentAsk) return
    setClips((prev) => splitTrackTextByMaxWords(prev, fragmentAsk.trackId, fragmentAsk.maxWords))
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
    const outClips = clips.map((c) => (c.kind === 'text' ? { ...c, text: wrappedText(octx, c, outW, outH) } : c))
    return { version: 1, fps: 30, width: outW, height: outH, audio_target_db: audioDb, tracks, clips: outClips }
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
      })
      projectTlRef.current = { ...snap, clips: nextClips }
      saveTimeline(project.id, {
        version: 1, fps: 30, width: outW, height: outH, audio_target_db: audioDb,
        tracks: snap.tracks, clips: nextClips,
      }).catch(() => {})
    }
    setClipToast({ type: 'success', message: existing ? 'Clip actualizado' : 'Guardado exitosamente' })
  }, [clipSaveJob?.id, clipSaveJob?.status, onChange, project.id, outW, outH, audioDb])

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

  // --- Arrastrar en el Main: mover texto o reencuadrar ---
  const onMainDown = createMainDownHandler({
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe, clipsRef, tracksRef, playheadRef, alignGuidesRef,
  })
  const onResultDown = createResultDownHandler({
    resultCanvasRef, selectedClip, playhead, mediaEls, outW, outH,
    changeTransform, playingRef, stopPlayback,
  })

  // --- Teclado ---
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selIdsRef.current.length) { e.preventDefault(); deleteClip(selIdsRef.current[0]) }
      }
      else if (e.key.toLowerCase() === 's') {
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
  const mediaPool = clips.filter((c) => c.kind !== 'text').map((c) => {
    const common = {
      src: mediaUrl(project.id, c),
      ref: (el) => { if (el) mediaEls.current.set(c.id, el); else mediaEls.current.delete(c.id) },
    }
    if (c.kind === 'image') {
      return <img key={c.id} alt="" loading="eager" decoding="async" {...common} />
    }
    const mediaProps = {
      ...common,
      preload: 'auto',
      onLoadedMetadata: (e) => registerMediaMeta(c, e.target),
    }
    return c.kind === 'video'
      ? <video key={c.id} {...mediaProps} muted playsInline />
      : <audio key={c.id} {...mediaProps} />
  })

  const canEditFrame = isVisualClip(selectedClip)
  const overlayOn = isOverlay(selectedClip)
  const isTextSel = selectedClip?.kind === 'text'
  const selTrackObj = tracks.find((t) => t.id === selTrackId)
  const isTextTrackSel = !selectedClip && selTrackObj?.kind === 'text'

  return (
    <div className={`veditor${mainColTab === 'clip' ? ' clip-mode' : ''}${linkPick ? ' link-picking' : ''}`}>
      <div className="ed-hidden-media">{mediaPool}</div>

      {/* ===== PARTE SUPERIOR: 3 columnas ===== */}
      <div className="veditor-top">
        <EdMaterial
          project={project}
          onAdd={addAsset}
          onDragInfo={setDragInfo}
          onBack={onBack}
          onRefresh={onChange}
          fav={fav}
          onEditYtClip={openClipEditor}
        />

        {/* MAIN / CLIP EDITOR */}
        <div className="ed-col ed-col-main">
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
          <div className="ed-main-body">
            <div className="ed-main-stage" ref={mainStageRef}
              onPointerDown={onMainDown}
              style={{ cursor: (canEditFrame || isTextSel || framingMode) ? 'crosshair' : 'default' }}>
              <canvas ref={mainCanvasRef} width={520} height={292} className="ed-main-canvas" />
              {mainColTab === 'clip' && clipMeta.preparing && (
                <div className="ed-stage-prep">
                  <JobStatusBar
                    progress={clipMeta.prepProgress}
                    message={clipMeta.prepMsg}
                  />
                </div>
              )}
              {mainColTab === 'clip' && !clipMeta.preparing && !clips.length && (
                <div className="ed-stage-empty">Pulsa Editar en un tramo recomendado</div>
              )}
              {mainColTab === 'main' && clips.length === 0 && !framingMode && <div className="ed-stage-empty">Agrega clips o texto al timeline</div>}
              {canEditFrame && !overlayOn && <div className="ed-stage-hint">Arrastra el recuadro · esquinas para zoom</div>}
              {canEditFrame && overlayOn && <div className="ed-stage-hint">Esquinas: encuadre de la fuente · el tamaño en Resultado no cambia</div>}
              {isTextSel && (
                <div className="ed-stage-hint">
                  {selClipIds.length > 1
                    ? `${selClipIds.length} textos · arrastra en el timeline para mover el grupo`
                    : 'Arrastra el texto para moverlo · botón Global para aplicar a todos'}
                </div>
              )}
              {framingMode && <div className="ed-stage-hint">Ajusta el recuadro amarillo y pulsa Guardar</div>}
            </div>
            <div className="ed-main-tools">
              {mainColTab === 'main' ? (
                <>
                  <button className="primary alt small" onClick={addText} title="Añadir un texto a la composición">
                    <Icon name="title" size={15} /> Agregar texto
                  </button>
                  {canEditFrame && (
                    <label className="ed-chip" title="Colocar este clip encima del canvas sin rellenar el formato de salida">
                      <input type="checkbox" checked={overlayOn}
                        onChange={(e) => toggleOverlay(selectedClip, e.target.checked)} /> Superponer
                    </label>
                  )}
                </>
              ) : (
                <div className="ed-clip-fields">
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
            </div>
          </div>
        </div>

        {/* RESULTADO FINAL */}
        <div className="ed-col ed-col-result">
          <div className="ed-col-head">
            <span> Resultado</span>
            <div className="ed-col-head-tools">
              <select className="select mini" value={curFormat} onChange={(e) => setFormat(e.target.value)} title="Dimensiones de salida">
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
                {curFormat === 'custom' && <option value="custom">Personalizado</option>}
              </select>
              <button className="ghost small" onClick={onOpenJson} title="Ver / editar el JSON del proyecto">
                <Icon name="data_object" size={15} /> JSON
              </button>
              {mainColTab === 'clip' ? (
                clipSaving ? (
                  <span className="ed-export-pct" title={clipSaveJob.message || (editingExisting ? 'Actualizando…' : 'Guardando…')}>
                    {Math.round((clipSaveJob.progress || 0.05) * 100)}%
                  </span>
                ) : (
                  <button
                    className="primary small"
                    onClick={saveClip}
                    disabled={!clipMeta.url || !clips.length || clipMeta.preparing}
                    title={editingExisting ? 'Sobrescribir este clip en el material' : 'Guardar este clip en el material'}
                  >
                    <Icon name={editingExisting ? 'movie_edit' : 'save'} size={15} />
                    {editingExisting ? 'Editar clip' : 'Guardar clip'}
                  </button>
                )
              ) : exporting ? (
                <span className="ed-export-pct" title={exportJob.message || 'Exportando…'}>
                  {Math.round((exportJob.progress || 0.05) * 100)}%
                </span>
              ) : exportJob?.status === 'done' ? (
                <>
                  <a className="primary small" href={exportJob.export_url} download>
                    <Icon name="download" size={15} /> Descargar
                  </a>
                  <button className="ghost small" onClick={() => setExportJob(null)}>Editar</button>
                </>
              ) : (
                <button className="primary small" onClick={doExport} disabled={!clips.length} title="Exportar el resultado">
                  <Icon name="movie" size={15} /> Exportar
                </button>
              )}
            </div>
          </div>
          <div className="ed-result-stage">
            <canvas
              ref={resultCanvasRef}
              width={360}
              height={640}
              className="ed-result-canvas"
              onPointerDown={onResultDown}
              style={{ cursor: overlayOn ? 'move' : 'default' }}
            />
            {overlayOn && <div className="ed-stage-hint">Arrastra el recuadro para colocar · esquinas escala · punto rota</div>}
            {(exporting || clipSaving) && (
              <div className="ed-result-exporting">
                <div className="progress"><span style={{ width: `${((clipSaving ? clipSaveJob.progress : exportJob.progress) || 0.05) * 100}%` }} /></div>
                <span>{(clipSaving ? clipSaveJob.message : exportJob.message) || (clipSaving ? 'Guardando…' : 'Exportando…')}</span>
              </div>
            )}
          </div>
          <div className="ed-transport">
            <button className="icon-btn big" onClick={togglePlay} title="Reproducir / Pausa (Espacio)">
              <Icon name={playing ? 'pause_circle' : 'play_circle'} size={24} />
            </button>
            <button className="icon-btn" onClick={() => seek(0)} title="Al inicio"><Icon name="first_page" size={18} /></button>
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
            <span className="ed-time">{fmt(playhead)} / {fmt(duration)}</span>
            <label className="ed-audio-db" title="Nivel de audio objetivo del render (LUFS). No cambia la vista previa.">
              <Icon name="volume_up" size={14} />
              <select
                className="select mini"
                value={audioDb}
                onChange={(e) => setAudioDb(Number(e.target.value))}
              >
                {(AUDIO_DB_PRESETS.includes(Number(audioDb))
                  ? AUDIO_DB_PRESETS
                  : [...AUDIO_DB_PRESETS, Number(audioDb)].sort((a, b) => a - b)
                ).map((db) => (
                  <option key={db} value={db}>{db} dB</option>
                ))}
              </select>
            </label>
          </div>
          {exportJob?.status === 'error' && <div className="error small">⚠️ {exportJob.error}</div>}
          {clipSaveJob?.status === 'error' && <div className="error small">⚠️ {clipSaveJob.error}</div>}
        </div>
      </div>

      {/* ===== PARTE INFERIOR: Timeline + Encuadres/Texto ===== */}
      <div className={`veditor-bottom${mainColTab === 'clip' ? ' clip-mode' : ''}`}>
        <EdTimeline
          tracks={tracks} clips={clips} pps={pps} setPps={setPps}
          duration={duration} playhead={playhead} rowH={rowH} setRowH={setRowH}
          selectedClipId={selClipId} selectedClipIds={selClipIds} selectedTrackId={selTrackId}
          selectedClip={selectedClip} selKfId={selKfId} dragInfo={dragInfo}
          onSeek={seek}
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
          onMoveKeyframe={moveKeyframe}
          onSelectKf={setSelKfId}
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
        />
        {isTextSel ? (
          <EdText mode="segment" clip={selectedClip} style={selectedClip.style}
            selectionCount={selClipIds.length}
            onChangeText={(v) => changeText(selectedClip.id, v)}
            onChangeStyle={(patch) => changeStyle(selectedClip.id, patch)}
            onApplyPreset={(p) => applyPreset(selectedClip.id, p)}
            onChangeDur={(d) => {
              if (!Number.isFinite(d) || d <= 0) return
              const next = Math.max(0.15, d)
              mutateClip(selectedClip.id, {
                out_point: +(selectedClip.in_point + next).toFixed(3),
                source_duration: +(selectedClip.in_point + next).toFixed(3),
              })
            }}
            onApplyAsGlobalTemplate={() => applyGlobalTemplate(selectedClip)}
            framing={!!framingMode && (framingMode.clipIds?.length > 0)}
            onStartFraming={startFramingSelection}
            onSaveFraming={saveFraming}
            onCancelFraming={cancelFraming}
            textFavorites={fav.favs.textStyles}
            onSaveFavorite={(st) => fav.saveTextStyle(st)}
            onApplyFavorite={applyTextFavorite}
            onDeleteFavorite={(id) => fav.removeTextStyle(id)}
          />
        ) : isTextTrackSel ? (
          <EdText mode="track" style={selTrackObj.style}
            onChangeStyle={(patch) => changeTrackStyle(selTrackObj.id, patch)}
            onApplyPreset={(p) => applyTrackPreset(selTrackObj.id, p)}
            framing={!!framingMode && framingMode.trackId === selTrackObj.id}
            onStartFraming={() => startFraming(selTrackObj)}
            onSaveFraming={saveFraming}
            onCancelFraming={cancelFraming}
            textFavorites={fav.favs.textStyles}
            onSaveFavorite={(st) => fav.saveTextStyle(st)}
            onApplyFavorite={applyTextFavorite}
            onDeleteFavorite={(id) => fav.removeTextStyle(id)}
            onFragment={() => requestFragmentTrack(selTrackObj.id)}
          />
        ) : (
          <EdCrops
            clip={selectedClip} selKfId={selKfId} hiddenKf={hiddenKf}
            onSelect={setSelKfId}
            onToggleHidden={toggleKfHidden}
            onDelete={(kf) => deleteKeyframe(selectedClip, kf)}
            onSeek={seek}
            onPanMode={(kf, mode) => patchKeyframePan(selectedClip, kf, mode)}
            onChangeFx={(patch) => {
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
            }}
            onChangeFrame={(slot) => applyClipFrame(selectedClip, slot)}
          />
        )}
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
            }).map((item) => (
              <button
                key={item.id}
                className={item.danger ? 'danger' : undefined}
                disabled={item.disabled}
                onClick={() => {
                  if (item.id === 'link') startLinkPick(trackMenu.track)
                  else if (item.id === 'unlink') unlinkTrack(trackMenu.track)
                  else if (item.id === 'delete') requestDeleteTrack(trackMenu.track)
                }}
              >
                <Icon name={item.id === 'link' ? 'link' : item.id === 'unlink' ? 'link_off' : 'delete'} size={15} />
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
        title="¿Fragmentar los textos?"
        message={fragmentAsk
          ? `Los cuadros con más de ${fragmentAsk.maxWords} palabras se partirán en ${fragmentAsk.extra} clip${fragmentAsk.extra === 1 ? '' : 's'} extra, conservando los tiempos.`
          : ''}
        confirmText="Fragmentar"
        danger={false}
        onConfirm={applyFragmentTrack}
        onCancel={() => setFragmentAsk(null)}
      />
      <Toast toast={clipToast} onClose={() => setClipToast(null)} />
    </div>
  )
}
