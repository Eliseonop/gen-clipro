import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import { fmt } from '../../lib/utils'
import { getTimeline, saveTimeline } from '../../services/api'
import { clamp, clampCenter, frameAt } from '../../lib/panning'
import { defaultTextStyle, subtitleStyle, wrappedText } from '../../lib/textstyles'
import { applyThemeToStyle } from '../../lib/textKaraoke'
import {
  uid, FORMATS, mediaUrl, defaultTracks, newReframe, withKfIds,
  makeClip, makeTextClip, clipDur, clipEnd, clipPlaybackMuted,
  canCaptionClip, removeTrack, shouldConfirmTrackDelete,
} from './editorModel'
import { applyFrame, disableOverlay, enableOverlay, isOverlay, newTransform, videosAt } from '../../lib/clipLayout'
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
import ClipEditor from '../video/ClipEditor'
import AnchoredMenu from '../../components/AnchoredMenu'
import './editor.css'

const AUDIO_DB_PRESETS = [-24, -18, -16, -14, -12, -10, -8]

export default function VideoEditor({ project, onChange, onBack, onOpenJson, onOpenVideo, onOpenAudio }) {
  const [tracks, setTracks] = useState(defaultTracks())
  const [clips, setClips] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [pps, setPps] = useState(60)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selClipId, setSelClipId] = useState(null)
  const [selTrackId, setSelTrackId] = useState('V1')
  const [selKfId, setSelKfId] = useState(null)
  const [hiddenKf, setHiddenKf] = useState(() => new Set())

  const [outW, setOutW] = useState(720)
  const [outH, setOutH] = useState(1280)
  const [audioDb, setAudioDb] = useState(-14)
  const [rowH, setRowH] = useState(52)

  const [ctxMenu, setCtxMenu] = useState(null)      // { x, y, clip }
  const [trackToDelete, setTrackToDelete] = useState(null)
  const [dragInfo, setDragInfo] = useState(null)    // { kind, duration, name }
  const [framingMode, setFramingMode] = useState(null) // { trackId, x, y, w } o null
  const [builder, setBuilder] = useState(null)

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
  const selKfRef = useRef(selKfId); selKfRef.current = selKfId
  const hiddenKfRef = useRef(hiddenKf); hiddenKfRef.current = hiddenKf
  const outRef = useRef({ w: outW, h: outH }); outRef.current = { w: outW, h: outH }
  const framingModeRef = useRef(null); framingModeRef.current = framingMode

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
            reframe: c.kind === 'video' ? withKfIds(c.reframe) : null,
            appear: c.appear || 'none',
            exit: c.exit || 'none',
            look: c.look || 'none',
            muted: !!c.muted,
            frame: c.frame || (c.layout === 'overlay' ? 'free' : 'full'),
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

  useEffect(() => {
    if (!loaded) return
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
      if (c.kind !== 'video') continue
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
      clipsRef, tracksRef, mediaEls, outRef, selRef, selKfRef, hiddenKfRef,
      playingRef, framingModeRef, mainCanvasRef, mainTextBox, topVideoAt,
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
        if (!el) continue
        const track = tracksRef.current.find((t) => t.id === c.track_id)
        const cd = clipDur(c)
        const active = head >= c.start - 0.02 && head < c.start + cd
        const expected = clamp(c.in_point + (head - c.start), 0, (el.duration || c.out_point))
        if (active && playingRef.current) {
          el.muted = clipPlaybackMuted(c, track)
          el.volume = clipPlaybackMuted(c, track) ? 0 : clamp(c.volume ?? 1, 0, 1)
          if (el.paused) { try { el.currentTime = expected } catch { /* noop */ }; el.play().catch(() => {}) }
          else if (Math.abs(el.currentTime - expected) > 0.35) { try { el.currentTime = expected } catch { /* noop */ } }
        } else if (!el.paused) {
          el.pause()
        }
      }

      // Sincronizar fotogramas de todos los vídeos activos (fill + overlays)
      if (!playingRef.current) {
        for (const c of videosAt(head, clipsRef.current, tracksRef.current)) {
          const el = mediaEls.current.get(c.id)
          if (el && el.videoWidth) {
            const expected = clamp(c.in_point + (head - c.start), 0, el.duration || c.out_point)
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
    for (const el of mediaEls.current.values()) { if (!el.paused) el.pause() }
  }
  function togglePlay() { if (playing) stopPlayback(); else playPlayback() }
  function seek(t) {
    const nt = clamp(t, 0, Math.max(0, duration))
    playheadRef.current = nt
    setPlayhead(nt)
    if (playingRef.current) playRef.current = { perf: performance.now(), head: nt }
  }

  // --- Mutaciones de clips ---
  const mutateClip = useCallback((id, patch) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  function registerMediaMeta(clip, el) {
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
    const kind = assetKind === 'clips' ? 'video' : 'audio'
    const track = targetTrackFor(kind)
    if (!track) return
    const dur = assetKind === 'clips' ? (item.end - item.start) : (item.duration || 0)
    const trackEnd = clips.filter((c) => c.track_id === track.id).reduce((m, c) => Math.max(m, clipEnd(c)), 0)
    const clip = makeClip(assetKind, item, track.id, trackEnd, dur)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
  }

  function dropAsset(payload, trackId, startTime) {
    const clip = makeClip(payload.asset_kind, {
      index: payload.asset_id, id: payload.asset_id, filename: payload.filename,
      name: payload.name, label: payload.name, duration: payload.duration, end: payload.duration, start: 0,
      reframe: payload.reframe,
    }, trackId, startTime, payload.duration)
    setClips((prev) => [...prev, clip])
    setSelClipId(clip.id)
  }

  function splitClip(id, at) {
    setClips((prev) => {
      const c = prev.find((x) => x.id === id)
      if (!c) return prev
      const localOut = c.in_point + (at - c.start)
      if (localOut <= c.in_point + 0.1 || localOut >= c.out_point - 0.1) return prev
      const left = { ...c, out_point: +localOut.toFixed(3) }
      const remap = (arr) => (arr || []).map((k) => ({ ...k, id: uid('k') }))
      const right = {
        ...c, id: uid('c'), in_point: +localOut.toFixed(3), start: +at.toFixed(3),
        reframe: c.reframe ? withKfIds({
          ...c.reframe,
          keyframes: remap(c.reframe.keyframes),
          keyframes2: remap(c.reframe.keyframes2),
        }) : null,
      }
      return prev.flatMap((x) => (x.id === id ? [left, right] : [x]))
    })
  }

  function deleteClip(id) {
    if (!id) return
    setClips((prev) => prev.filter((c) => c.id !== id))
    if (selClipId === id) { setSelClipId(null); setSelKfId(null) }
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
    const nt = { id, kind, name: `${prefix}${n}`, hidden: false, muted: false, locked: false }
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
    setSelClipId(null); setSelKfId(null); setSelTrackId(id)
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
    if (framingMode?.trackId === trackId) setFramingMode(null)
    setTrackToDelete(null)
  }
  function requestDeleteTrack(track) {
    if (!track) return
    if (shouldConfirmTrackDelete(clipsRef.current, track.id)) setTrackToDelete(track)
    else applyRemoveTrack(track.id)
  }
  function selectTrack(id) { setSelTrackId(id); setSelClipId(null); setSelKfId(null); setFramingMode(null) }

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
    if (!clip || clip.kind !== 'video') return
    const el = mediaEls.current.get(clip.id)
    const srcW = el?.videoWidth || 1920
    const srcH = el?.videoHeight || 1080
    const localT = clamp(clip.in_point + (playhead - clip.start), clip.in_point, clip.out_point)
    const patch = applyFrame(clip, slot, srcW / srcH, outAspect, localT, srcW, srcH, outW, outH)
    setClips((prev) => prev.map((c) => (c.id === clip.id ? {
      ...c,
      layout: patch.layout,
      frame: patch.frame,
      transform: patch.transform,
      reframe: { ...(c.reframe || newReframe()), ...patch.reframe },
    } : c)))
  }
  function toggleOverlay(clip, on) {
    if (!clip || clip.kind !== 'video') return
    if (!on) {
      setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, ...disableOverlay(c) } : c)))
      return
    }
    const el = mediaEls.current.get(clip.id)
    const srcW = el?.videoWidth || 1920
    const srcH = el?.videoHeight || 1080
    const localT = clamp(clip.in_point + (playhead - clip.start), clip.in_point, clip.out_point)
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
    if (!clip || clip.kind !== 'video') return
    const localT = clamp(clip.in_point + (playhead - clip.start), clip.in_point, clip.out_point)
    const fr = frameAt(clip.reframe?.keyframes, localT, clip.reframe?.zoom ?? 1, clip.reframe?.pan_mode || 'smooth')
    const el = mediaEls.current.get(clip.id)
    const srcAspect = el?.videoWidth ? el.videoWidth / el.videoHeight : 16 / 9
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
    if (c) seek(c.start + (newT - c.in_point))
  }
  function toggleKfHidden(id) {
    setHiddenKf((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  // --- Texto ---
  function baseTextStyle() {
    const sel = tracksRef.current.find((t) => t.id === selTrackId)
    if (sel && sel.kind === 'text' && sel.style) return sel.style
    const first = tracksRef.current.find((t) => t.kind === 'text')
    return first?.style || defaultTextStyle()
  }
  function ensureTextTrack(style) {
    const sel = tracksRef.current.find((t) => t.id === selTrackId)
    if (sel && sel.kind === 'text') return sel.id
    const existing = tracksRef.current.find((t) => t.kind === 'text')
    if (existing) return existing.id
    return addTrack('text', style)
  }
  function addText() {
    const style = baseTextStyle()
    const tid = ensureTextTrack(style)
    const clip = makeTextClip(tid, playhead, 3, 'Texto', style)
    setClips((prev) => [...prev, clip]); setSelClipId(clip.id); setSelKfId(null)
  }
  function changeText(id, text) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, text, name: (text || 'Texto').slice(0, 22) } : c)))
  }
  function changeStyle(id, patch) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, style: { ...(c.style || defaultTextStyle()), ...patch } } : c)))
  }
  function applyPreset(id, preset) {
    setClips((prev) => prev.map((c) => {
      if (c.id !== id) return c
      return { ...c, style: applyThemeToStyle(c.style, preset) }
    }))
  }
  // Estilo general de la pista: se aplica a la pista y a todos sus segmentos.
  function changeTrackStyle(trackId, patch) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, style: { ...(t.style || defaultTextStyle()), ...patch } } : t)))
    setClips((prev) => prev.map((c) => (c.kind === 'text' && c.track_id === trackId ? { ...c, style: { ...(c.style || {}), ...patch } } : c)))
  }
  function applyTrackPreset(trackId, preset) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, style: applyThemeToStyle(t.style, preset) } : t)))
    setClips((prev) => prev.map((c) => {
      if (!(c.kind === 'text' && c.track_id === trackId)) return c
      return { ...c, style: applyThemeToStyle(c.style, preset) }
    }))
  }

  // --- Encuadre de texto por pista (overlay amarillo en el Main) ---
  function startFraming(track) {
    const st = track.style || defaultTextStyle()
    const h = clamp((st.size ?? 0.07) * 1.5, 0.05, 0.5)
    setSelClipId(null); setSelKfId(null); setSelTrackId(track.id)
    setFramingMode({ trackId: track.id, x: st.x ?? 0.5, y: st.y ?? 0.5, w: st.w ?? 0.8, h })
  }
  function saveFraming() {
    const fm = framingMode
    if (!fm) return
    const size = +clamp(fm.h / 1.22, 0.02, 0.4).toFixed(4)
    changeTrackStyle(fm.trackId, { x: +fm.x.toFixed(4), y: +fm.y.toFixed(4), w: +fm.w.toFixed(4), size })
    setFramingMode(null)
  }
  function cancelFraming() { setFramingMode(null) }

  // Aplica el estilo de un clip de texto a TODOS los clips de texto del Timeline.
  // Actúa como "estado inicial común": después cada texto sigue siendo editable individualmente.
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
      setClips((prev) => prev.map((c) => (c.id === selectedClip.id ? { ...c, style: st } : c)))
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

  // --- Subtítulos ---
  const { subJob, setSubJob, requestSubtitles } = useSubtitles(project.id, {
    tracksRef, ensureTextTrack, setClips, setCtxMenu, onChange,
  })
  const fav = useFavorites(project.id)

  // --- Arrastrar en el Main: mover texto o reencuadrar ---
  const onMainDown = createMainDownHandler({
    mainCanvasRef, framingModeRef, playingRef, stopPlayback, setFramingMode,
    selectedClip, mainTextBox, changeStyle, mediaEls, playhead, upsertKeyframe, outAspect,
    changeReframe,
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
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (selRef.current) { e.preventDefault(); deleteClip(selRef.current) } }
      else if (e.key.toLowerCase() === 's') { if (selRef.current) { e.preventDefault(); splitClip(selRef.current, playheadRef.current) } }
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
      preload: 'auto',
      ref: (el) => { if (el) mediaEls.current.set(c.id, el); else mediaEls.current.delete(c.id) },
      onLoadedMetadata: (e) => registerMediaMeta(c, e.target),
    }
    return c.kind === 'video'
      ? <video key={c.id} {...common} muted playsInline />
      : <audio key={c.id} {...common} />
  })

  const canEditFrame = selectedClip?.kind === 'video'
  const overlayOn = isOverlay(selectedClip)
  const isTextSel = selectedClip?.kind === 'text'
  const selTrackObj = tracks.find((t) => t.id === selTrackId)
  const isTextTrackSel = !selectedClip && selTrackObj?.kind === 'text'

  return (
    <div className="veditor">
      <div className="ed-hidden-media">{mediaPool}</div>

      {/* ===== PARTE SUPERIOR: 3 columnas ===== */}
      <div className="veditor-top">
        <EdMaterial
          project={project}
          onAdd={addAsset}
          onDragInfo={setDragInfo}
          onBack={onBack}
          onOpenVideo={onOpenVideo}
          onOpenAudio={onOpenAudio}
          fav={fav}
        />

        {/* MAIN: vídeo original + encuadre */}
        <div className="ed-col ed-col-main">
          <div className="ed-col-head"><Icon name="edit" size={15} /> Main · edición</div>
          <div className="ed-main-stage" ref={mainStageRef}
            onPointerDown={onMainDown}
            style={{ cursor: (canEditFrame || isTextSel || framingMode) ? 'crosshair' : 'default' }}>
            <canvas ref={mainCanvasRef} width={520} height={292} className="ed-main-canvas" />
            {clips.length === 0 && !framingMode && <div className="ed-stage-empty">Agrega clips o texto al timeline</div>}
            {canEditFrame && !overlayOn && <div className="ed-stage-hint">Arrastra el recuadro · esquinas para zoom</div>}
            {canEditFrame && overlayOn && <div className="ed-stage-hint">Esquinas: encuadre de la fuente · el tamaño en Resultado no cambia</div>}
            {isTextSel && <div className="ed-stage-hint">Arrastra el texto para moverlo · botón Global para aplicar a todos</div>}
            {framingMode && <div className="ed-stage-hint">Ajusta el recuadro amarillo y pulsa Guardar</div>}
          </div>
          <div className="ed-main-tools">
            <button className="primary alt small" onClick={addText} title="Añadir un texto a la composición">
              <Icon name="title" size={15} /> Agregar texto
            </button>
            <button
              className="primary alt small"
              title="Combinar materiales en un clip 9:16"
              onClick={() => {
                let seed = null
                if (selectedClip?.kind === 'video' && selectedClip.asset_kind === 'clips') {
                  seed = (project.clips || []).find((c) => String(c.index) === String(selectedClip.asset_id)) || null
                }
                setBuilder({ seed })
              }}
            >
              <Icon name="construction" size={15} /> Construir
            </button>
            {canEditFrame && (
              <label className="ed-chip" title="Colocar este clip encima del canvas sin rellenar el formato de salida">
                <input type="checkbox" checked={overlayOn}
                  onChange={(e) => toggleOverlay(selectedClip, e.target.checked)} /> Superponer
              </label>
            )}
          </div>
        </div>

        {/* RESULTADO FINAL */}
        <div className="ed-col ed-col-result">
          <div className="ed-col-head">
            <span><Icon name="smart_display" size={15} /> Resultado</span>
            <div className="ed-col-head-tools">
              <select className="select mini" value={curFormat} onChange={(e) => setFormat(e.target.value)} title="Dimensiones de salida">
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.id}</option>)}
                {curFormat === 'custom' && <option value="custom">Personalizado</option>}
              </select>
              <button className="ghost small" onClick={onOpenJson} title="Ver / editar el JSON del proyecto">
                <Icon name="data_object" size={15} /> JSON
              </button>
              {exporting ? (
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
            {exporting && (
              <div className="ed-result-exporting">
                <div className="progress"><span style={{ width: `${(exportJob.progress || 0.05) * 100}%` }} /></div>
                <span>{exportJob.message || 'Exportando…'}</span>
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
        </div>
      </div>

      {/* ===== PARTE INFERIOR: Timeline + Encuadres/Texto ===== */}
      <div className="veditor-bottom">
        <EdTimeline
          tracks={tracks} clips={clips} pps={pps} setPps={setPps}
          duration={duration} playhead={playhead} rowH={rowH} setRowH={setRowH}
          selectedClipId={selClipId} selectedTrackId={selTrackId}
          selectedClip={selectedClip} selKfId={selKfId} dragInfo={dragInfo}
          onSeek={seek}
          onSelectClip={(id) => { setSelClipId(id); setSelKfId(null); setFramingMode(null) }}
          onSelectTrack={selectTrack}
          onDoubleClip={(clip) => { seek(clip.start + 0.03); setSelClipId(clip.id); setSelKfId(null) }}
          onMutateClip={mutateClip}
          onSplit={splitClip}
          onDeleteClip={deleteClip}
          onDropAsset={dropAsset}
          onTrackToggle={trackToggle}
          onTrackCompact={compactTrack}
          onAddTrack={addTrack}
          onAddTextTrack={addTextTrack}
          onMoveKeyframe={moveKeyframe}
          onSelectKf={setSelKfId}
          onAddKf={addKeyframeAtPlayhead}
          onDeleteKf={deleteSelectedKeyframe}
          onContextClip={(e, clip) => { e.preventDefault(); setSelClipId(clip.id); setCtxMenu({ x: e.clientX, y: e.clientY, clip }) }}
          onContextTrack={(_e, track) => requestDeleteTrack(track)}
        />
        {isTextSel ? (
          <EdText mode="segment" clip={selectedClip} style={selectedClip.style}
            onChangeText={(v) => changeText(selectedClip.id, v)}
            onChangeStyle={(patch) => changeStyle(selectedClip.id, patch)}
            onApplyPreset={(p) => applyPreset(selectedClip.id, p)}
            onChangeDur={(d) => mutateClip(selectedClip.id, { out_point: +(selectedClip.in_point + d).toFixed(3), source_duration: +(selectedClip.in_point + d).toFixed(3) })}
            onApplyAsGlobalTemplate={() => applyGlobalTemplate(selectedClip)}
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
          />
        ) : (
          <EdCrops
            clip={selectedClip} selKfId={selKfId} hiddenKf={hiddenKf}
            onSelect={setSelKfId}
            onToggleHidden={toggleKfHidden}
            onDelete={(kf) => deleteKeyframe(selectedClip, kf)}
            onSeek={seek}
            onPanMode={(kf, mode) => patchKeyframePan(selectedClip, kf, mode)}
            onChangeFx={(patch) => selectedClip && mutateClip(selectedClip.id, patch)}
            onChangeFrame={(slot) => applyClipFrame(selectedClip, slot)}
          />
        )}
      </div>

      {/* Menú contextual (click derecho en clip) */}
      {ctxMenu && (
        <>
          <div className="ed-ctx-backdrop" onPointerDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <AnchoredMenu className="ed-ctx-menu" x={ctxMenu.x} y={ctxMenu.y}>
            {(ctxMenu.clip.asset_kind === 'sfx' || ctxMenu.clip.asset_kind === 'audios') && (
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
            <button className="danger" onClick={() => { deleteClip(ctxMenu.clip.id); setCtxMenu(null) }}><Icon name="delete" size={15} /> Eliminar</button>
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

      {builder && (
        <ClipEditor
          mode="compose"
          project={project}
          seedClip={builder.seed}
          url={builder.seed?.source_url || builder.seed?.url}
          segStart={builder.seed ? (builder.seed.source_url ? builder.seed.start : 0) : undefined}
          segEnd={builder.seed ? (builder.seed.source_url ? builder.seed.end : Math.max(0.5, (builder.seed.end || 0) - (builder.seed.start || 0))) : undefined}
          segIndex={builder.seed?.index || (100000 + (Date.now() % 900000))}
          initial={builder.seed?.reframe || null}
          onClose={() => setBuilder(null)}
          onChange={onChange}
        />
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
    </div>
  )
}
