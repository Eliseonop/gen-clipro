import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { prepareReframe, createClipJob, composeClipJob, getJob } from '../../services/api'
import { fmt } from '../../lib/utils'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import { clamp, r2, r4, frameAt, zoomFromCorner, geomFor, clampCenter as clampCenterFor } from '../../lib/panning'
import { drawComposeFrame } from './clipCanvas'
import {
  MAX_LAYERS, MIN_SPLIT_GAP, makeLayer, prepKey, outputRect, slotTargetAspect,
  layersFromInitial, layerFromProjectClip, addSecondLayer,
  invertSlots, applySlotPreset, compositionDuration, cutLayerAt,
  isSequentialLayout, layerDelay, addSplitTrack, recipeFromLayers, isSyncedDual,
  previewDest, recipeForFile,
} from './composeModel'
import { FORMATS } from '../editor/editorModel'
import MaterialClipGrid from '../editor/MaterialClipGrid'
import JobStatusBar from '../../components/JobStatusBar'
import PanModeToggle from '../../components/PanModeToggle'

function trackAt(track, time) {
  if (!track?.length) return null
  let best = track[0], bd = Math.abs(track[0].t - time)
  for (const p of track) { const d = Math.abs(p.t - time); if (d < bd) { bd = d; best = p } }
  return best
}

function withLayerIds(list, startId = 1) {
  let n = startId
  return {
    layers: list.map((l) => (l.id ? l : { ...l, id: n++ })),
    nextId: n,
  }
}

export default function ClipEditor({
  project, url, segStart, segEnd, segIndex, initial, onClose, onChange,
  mode = 'edit', seedClip = null,
}) {
  const idc = useRef(1)
  const withId = (k) => ({ ...k, id: idc.current++ })

  const [layers, setLayers] = useState(() => {
    let boot = []
    if (seedClip) boot = layerFromProjectClip(seedClip)
    else if (url != null && url !== '' && segStart != null && segEnd != null) {
      boot = layersFromInitial(url, segStart, segEnd, initial, initial?.label || `Clip #${segIndex}`)
    }
    const { layers: ls, nextId } = withLayerIds(boot, 1)
    idc.current = nextId
    return ls
  })
  const [activeIdx, setActiveIdx] = useState(0)
  const [jobMap, setJobMap] = useState({})
  const [prepMap, setPrepMap] = useState({})
  const [err, setErr] = useState('')
  const [pickerOpen, setPickerOpen] = useState(() => mode === 'compose' && !seedClip && !url)
  const [saveMode, setSaveMode] = useState(mode === 'compose' ? 'new' : 'overwrite')
  const [clipLabel, setClipLabel] = useState(initial?.label || seedClip?.label || (mode === 'compose' ? 'Clip compuesto' : `Clip #${segIndex}`))
  const [clipDescription, setClipDescription] = useState(initial?.description || seedClip?.description || '')
  const [confirmClearPoints, setConfirmClearPoints] = useState(false)
  const [t, setT] = useState(0)
  const [selId, setSelId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [genJob, setGenJob] = useState(null)
  const [slotMenu, setSlotMenu] = useState(false)
  const [prepElapsed, setPrepElapsed] = useState(0)
  const prepTick = useRef(0)

  const stageRef = useRef(null)
  const tlRef = useRef(null)
  const canvasRef = useRef(null)
  const modalRef = useRef(null)
  const videoEls = useRef({})
  const drag = useRef({ dx: 0, dy: 0, id: null, t: 0 })
  const dragDot = useRef(null)
  const dragTrim = useRef(null)
  const dragSlot = useRef(null)
  const startedKeys = useRef(new Set())
  const layersRef = useRef(layers)
  const activeIdxRef = useRef(activeIdx)
  useEffect(() => { layersRef.current = layers }, [layers])
  useEffect(() => { activeIdxRef.current = activeIdx }, [activeIdx])

  const active = layers[activeIdx] || null
  const activeKey = active ? prepKey(active) : ''
  const prep = activeKey ? prepMap[activeKey] : null
  const job = activeKey ? jobMap[activeKey] : null
  const kfs = active?.keyframes || []
  const fallbackZoom = active?.zoom ?? 1
  const fallbackMode = active?.pan_mode ?? 'smooth'
  const selKf = kfs.find((k) => k.id === selId) || null
  const live = frameAt(kfs, t, fallbackZoom, fallbackMode)
  const zoom = live.zoom
  const panMode = (selKf?.pan_mode === 'direct' || (!selKf && live.pan_mode === 'direct')) ? 'direct' : 'smooth'
  const selFit = (selKf?.fit === 'contain' || (!selKf && live.fit === 'contain')) ? 'contain' : 'cover'
  const trimIn = active?.trimIn ?? 0
  const trimOut = active?.trimOut ?? 0
  const outW = project?.timeline?.width || 720
  const outH = project?.timeline?.height || 1280
  const outAspect = outW / outH
  const previewH = Math.max(1, Math.round(270 * outH / outW))
  const formatLabel = FORMATS.find((f) => f.w === outW && f.h === outH)?.id || `${outW}×${outH}`

  const patchLayer = useCallback((id, patch) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const patchActive = useCallback((patch) => {
    const L = layersRef.current[activeIdxRef.current]
    if (!L) return
    patchLayer(L.id, patch)
  }, [patchLayer])

  // Preparar proxy por fuente única (no cancelar el POST si `layers` cambia de referencia).
  useEffect(() => {
    layers.forEach((layer) => {
      if (!layer.url) return
      const k = prepKey(layer)
      if (startedKeys.current.has(k)) return
      startedKeys.current.add(k)
      prepareReframe({ url: layer.url, start: layer.segStart, end: layer.segEnd })
        .then((j) => setJobMap((m) => ({ ...m, [k]: j })))
        .catch((e) => {
          startedKeys.current.delete(k)
          setErr(e.message)
        })
    })
  }, [layers])

  useEffect(() => {
    const entries = Object.entries(jobMap)
    const pending = entries.filter(([, j]) => j && j.status !== 'done' && j.status !== 'error')
    for (const [k, j] of entries) {
      if (j?.status === 'done' && j.reframe_prep && !prepMap[k]) {
        setPrepMap((p) => ({ ...p, [k]: j.reframe_prep }))
      }
      if (j?.status === 'error') setErr(j.error || 'Error preparando el editor.')
    }
    if (!pending.length) return
    const id = setInterval(async () => {
      for (const [k, j] of pending) {
        try {
          const next = await getJob(j.id)
          if (!next) continue
          setJobMap((m) => ({ ...m, [k]: next }))
        } catch { /* reintenta */ }
      }
    }, 400)
    return () => clearInterval(id)
  }, [jobMap, prepMap])

  useEffect(() => {
    setLayers((prev) => {
      let changed = false
      const next = prev.map((l) => {
        const p = prepMap[prepKey(l)]
        if (!p || l._seeded) return l
        changed = true
        const kfs0 = (l.keyframes?.length ? l.keyframes : (p.keyframes || [])).map((k) => {
          const row = k.id ? k : withId(k)
          return {
            ...row,
            zoom: row.zoom ?? l.zoom ?? 1,
            pan_mode: row.pan_mode === 'direct' ? 'direct' : 'smooth',
          }
        })
        return {
          ...l,
          _seeded: true,
          keyframes: kfs0,
          trimOut: l.trimOut || p.duration || 0,
        }
      })
      return changed ? next : prev
    })
  }, [prepMap])

  useEffect(() => {
    if (!genJob || genJob.status === 'done' || genJob.status === 'error') {
      if (genJob?.status === 'done') onChange?.()
      return
    }
    const id = setInterval(async () => {
      try { setGenJob(await getJob(genJob.id)) } catch { /* reintenta */ }
    }, 400)
    return () => clearInterval(id)
  }, [genJob?.id, genJob?.status])

  const dest = active
    ? previewDest(active, activeIdx, layers.length, {
      solo: isSequentialLayout(layers),
      syncedDual: isSyncedDual(layers),
      outAspect,
    })
    : { x: 0, y: 0, w: 1, h: 1 }
  const srcAspect = prep ? prep.width / prep.height : 16 / 9
  const targetAspect = layers.length > 1 ? slotTargetAspect(dest, outAspect) : outAspect
  const geom = useCallback((z, tAspect = targetAspect) => geomFor(z, srcAspect, tAspect), [srcAspect, targetAspect])
  const clampCenter = useCallback(
    (cx, cy, z = zoom, tAspect = targetAspect) => clampCenterFor(cx, cy, z, srcAspect, tAspect),
    [srcAspect, zoom, targetAspect],
  )

  const dur = prep?.duration || 0
  const interp = live
  const center = live.fit === 'contain'
    ? { cx: 0.5, cy: 0.5 }
    : clampCenter(interp.cx, interp.cy, zoom, targetAspect)
  const face = prep ? trackAt(prep.track, t) : null
  const geomBox = live.fit === 'contain' ? { widthFrac: 1, heightFrac: 1 } : geom(zoom, targetAspect)

  const layersLive = useMemo(() => layers.map((l) => ({
    ...l,
    keyframes: l.keyframes || [],
  })), [layers])

  useEffect(() => {
    if (!layers.length) return
    let raf = 0
    const draw = () => {
      const c = canvasRef.current
      if (c) {
        const videos = layersRef.current.map((l) => videoEls.current[l.id])
        const preps = layersRef.current.map((l) => prepMap[prepKey(l)])
        drawComposeFrame(videos, c, {
          layers: layersRef.current,
          preps,
          soloIndex: isSequentialLayout(layersRef.current) ? activeIdxRef.current : null,
          outAspect,
          syncedDual: isSyncedDual(layersRef.current),
        })
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [layers.length, prepMap, layersLive, outAspect])

  const writeKf = useCallback((id, tt, cx, cy, extra = {}) => {
    const L = layersRef.current[activeIdxRef.current]
    if (!L) return
    const next = [...(L.keyframes || [])]
    const j = next.findIndex((k) => k.id === id)
    const prev = j >= 0 ? next[j] : null
    const fr = frameAt(L.keyframes, tt, L.zoom ?? 1, L.pan_mode || 'smooth')
    const point = {
      id,
      t: r2(tt),
      cx: r4(cx),
      cy: r4(cy),
      zoom: extra.zoom ?? prev?.zoom ?? fr.zoom,
      pan_mode: extra.pan_mode ?? prev?.pan_mode ?? 'smooth',
      fit: extra.fit ?? prev?.fit ?? fr.fit ?? 'cover',
    }
    if (j >= 0) next[j] = point; else next.push(point)
    next.sort((a, b) => a.t - b.t)
    patchLayer(L.id, { keyframes: next })
    setSelId(id)
  }, [patchLayer])

  function addHere() {
    const fr = frameAt(kfs, t, fallbackZoom, fallbackMode)
    const c = clampCenter(fr.cx, fr.cy, fr.zoom, targetAspect)
    const tt = r2(clamp(t, 0, dur))
    const ex = kfs.find((k) => Math.abs(k.t - tt) < 0.06)
    writeKf(ex ? ex.id : idc.current++, tt, c.cx, c.cy, {
      zoom: fr.zoom, pan_mode: ex?.pan_mode || 'smooth', fit: ex?.fit || fr.fit || 'cover',
    })
  }

  function patchSelPan(mode) {
    if (selId == null || !active) return
    patchActive({
      keyframes: kfs.map((k) => (k.id === selId ? { ...k, pan_mode: mode } : k)),
    })
  }

  function patchSelFit(mode) {
    if (selId == null || !active) return
    patchActive({
      keyframes: kfs.map((k) => (k.id === selId ? { ...k, fit: mode } : k)),
    })
  }

  function delSel() {
    if (selId == null || !active) return
    patchActive({ keyframes: kfs.filter((k) => k.id !== selId) })
    setSelId(null)
  }

  function clearAllActivePoints() {
    patchActive({ keyframes: [] })
    setSelId(null)
    setConfirmClearPoints(false)
  }

  function reseed() {
    if (prep?.keyframes) { patchActive({ keyframes: prep.keyframes.map(withId) }); setSelId(null) }
  }

  function activeVideo() {
    return active ? videoEls.current[active.id] : null
  }

  function syncOthers(sourceTime) {
    const A = layersRef.current[activeIdxRef.current]
    if (!A) return
    const comp = sourceTime - (A.trimIn || 0)
    layersRef.current.forEach((L, i) => {
      if (i === activeIdxRef.current) return
      const v = videoEls.current[L.id]
      if (!v) return
      const local = clamp((L.trimIn || 0) + Math.max(0, comp), L.trimIn || 0, L.trimOut || v.duration || 0)
      if (Math.abs(v.currentTime - local) > 0.04) v.currentTime = local
    })
  }

  function playVideo() {
    const v = activeVideo()
    if (!v) return
    if (v.currentTime >= trimOut - 0.05 || v.currentTime < trimIn) v.currentTime = trimIn
    layers.forEach((L, i) => {
      const el = videoEls.current[L.id]
      if (!el) return
      if (i === activeIdx) el.play()
      else {
        const comp = Math.max(0, v.currentTime - trimIn)
        el.currentTime = clamp((L.trimIn || 0) + comp, L.trimIn || 0, L.trimOut || el.duration || 0)
        el.play().catch(() => {})
      }
    })
  }

  function pauseVideo() {
    Object.values(videoEls.current).forEach((el) => el?.pause())
  }

  function stopVideo() {
    const v = activeVideo()
    if (!v) return
    pauseVideo()
    v.currentTime = trimIn
    setT(trimIn)
    syncOthers(trimIn)
  }

  function seek(sec) {
    const v = activeVideo()
    const nt = clamp(sec, 0, dur)
    if (v) v.currentTime = nt
    setT(nt)
    syncOthers(nt)
  }

  function onTime(e) {
    const v = e.target
    if (active && v !== activeVideo()) return
    if (!v.paused && v.currentTime >= trimOut) v.currentTime = trimIn
    setT(v.currentTime)
    syncOthers(v.currentTime)
  }

  function updateTrimIn(newIn) {
    const validIn = Math.min(newIn, trimOut - MIN_SPLIT_GAP)
    patchActive({ trimIn: validIn })
    const v = activeVideo()
    if (v && v.paused) { v.currentTime = validIn; setT(validIn) }
  }

  function stageNorm(e) {
    const r = stageRef.current.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }
  }

  function onBoxDown(e) {
    e.preventDefault()
    const p = stageNorm(e)
    const tt = r2(clamp(t, 0, dur))
    const ex = kfs.find((k) => Math.abs(k.t - tt) < 0.06)
    drag.current = { kind: 'move', dx: p.x - center.cx, dy: p.y - center.cy, id: ex ? ex.id : null, t: tt, cx: center.cx, cy: center.cy }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    pauseVideo()
  }

  function onCornerDown(e) {
    e.stopPropagation()
    e.preventDefault()
    const tt = r2(clamp(t, 0, dur))
    const ex = kfs.find((k) => Math.abs(k.t - tt) < 0.06)
    drag.current = { kind: 'zoom', id: ex ? ex.id : null, t: tt, cx: center.cx, cy: center.cy }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    pauseVideo()
  }

  function onBoxMove(e) {
    if (!dragging) return
    const p = stageNorm(e)
    if (drag.current.kind === 'zoom') {
      const z = zoomFromCorner(p.x, p.y, drag.current.cx, drag.current.cy, srcAspect, targetAspect)
      const c = clampCenter(drag.current.cx, drag.current.cy, z, targetAspect)
      if (drag.current.id == null) drag.current.id = idc.current++
      writeKf(drag.current.id, drag.current.t, c.cx, c.cy, { zoom: z, fit: 'cover' })
      return
    }
    const c = clampCenter(p.x - drag.current.dx, p.y - drag.current.dy, zoom, targetAspect)
    if (drag.current.id == null) drag.current.id = idc.current++
    writeKf(drag.current.id, drag.current.t, c.cx, c.cy)
  }

  function onBoxUp(e) {
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function tlNorm(e) {
    const r = tlRef.current.getBoundingClientRect()
    return clamp((e.clientX - r.left) / r.width, 0, 1)
  }
  function onTlDown(e) {
    if (dragDot.current != null || dragTrim.current) return
    seek(tlNorm(e) * dur)
  }
  function onDotDown(e, kf) {
    e.stopPropagation()
    dragDot.current = kf.id; setSelId(kf.id); seek(kf.t)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onDotMove(e) {
    if (dragDot.current == null) return
    e.stopPropagation()
    const nt = r2(clamp(tlNorm(e) * dur, 0, dur))
    patchActive({
      keyframes: [...kfs].map((k) => (k.id === dragDot.current ? { ...k, t: nt } : k)).sort((a, b) => a.t - b.t),
    })
    seek(nt)
  }
  function onDotUp(e) {
    dragDot.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }
  function onTrimDown(e, which) {
    e.stopPropagation()
    dragTrim.current = which
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onTrimMove(e) {
    if (!dragTrim.current) return
    e.stopPropagation()
    const nt = r2(clamp(tlNorm(e) * dur, 0, dur))
    if (dragTrim.current === 'in') updateTrimIn(nt)
    else patchActive({ trimOut: Math.max(nt, trimIn + MIN_SPLIT_GAP) })
    seek(nt)
  }
  function onTrimUp(e) {
    dragTrim.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Tab') {
        e.preventDefault()
        if (!kfs.length) return
        const sorted = [...kfs].sort((a, b) => a.t - b.t)
        let nextIdx = 0
        if (selId != null) {
          const currIdx = sorted.findIndex((k) => k.id === selId)
          if (currIdx >= 0) nextIdx = e.shiftKey ? (currIdx - 1 + sorted.length) % sorted.length : (currIdx + 1) % sorted.length
        }
        const targetKf = sorted[nextIdx]
        setSelId(targetKf.id)
        seek(targetKf.t)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const targetKf = kfs.find((k) => k.id === selId)
        if (targetKf) seek(targetKf.t)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selId != null) { e.preventDefault(); delSel() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [kfs, selId, dur])

  function buildKfList(kfsList, inTime, outTime, zVal, tAspect, mode, srcA) {
    const sa = srcA || srcAspect
    const pack = (tt, forceKf) => {
      const src = forceKf || frameAt(kfsList, tt, zVal, mode)
      const z = forceKf ? (forceKf.zoom ?? zVal) : src.zoom
      const c = clampCenterFor(forceKf ? forceKf.cx : src.cx, forceKf ? forceKf.cy : src.cy, z, sa, tAspect)
      return {
        t: tt,
        ...c,
        zoom: r2(z),
        pan_mode: (forceKf?.pan_mode === 'direct' || src.pan_mode === 'direct') ? 'direct' : 'smooth',
      }
    }
    const inside = (kfsList || [])
      .filter((k) => k.t > inTime + 0.02 && k.t < outTime - 0.02)
      .map((k) => pack(k.t, k))
    return [pack(inTime), ...inside, pack(outTime)]
      .map((k) => ({ t: r2(k.t - inTime), cx: r4(k.cx), cy: r4(k.cy), zoom: k.zoom, pan_mode: k.pan_mode }))
      .sort((a, b) => a.t - b.t)
  }

  function payloadForLayer(L, i) {
    const p = prepMap[prepKey(L)]
    const srcA = p ? p.width / p.height : 16 / 9
    const destR = outputRect(L, i, layers.length)
    const tAspect = layers.length > 1 ? slotTargetAspect(destR, outAspect) : outAspect
    const outT = L.trimOut || p?.duration || 0
    const kfsAbs = buildKfList(L.keyframes || [], L.trimIn || 0, outT, L.zoom ?? 1, tAspect, L.pan_mode || 'smooth', srcA)
    return {
      url: L.url,
      start: r2(L.segStart + (L.trimIn || 0)),
      end: r2(L.segStart + outT),
      zoom: r2(L.zoom ?? 1),
      pan_mode: L.pan_mode || 'smooth',
      keyframes: kfsAbs,
      slot: layers.length < 2 ? 'full' : L.slot,
      custom_rect: L.slot === 'custom' ? L.customRect : null,
      label: L.label,
      delay: layerDelay(layers, i),
    }
  }

  function currentConfig() {
    const L = layers[0]
    if (!L) return null
    return {
      ...recipeFromLayers(layers),
      trimIn: L.trimIn,
      trimOut: L.trimOut,
      label: clipLabel,
      description: clipDescription,
    }
  }

  async function generate() {
    setErr('')
    if (!layers.length) { setErr('Agrega al menos un material.'); return }
    if (layers.some((l) => !prepMap[prepKey(l)])) {
      setErr('Espera a que carguen todas las capas.')
      return
    }
    const targetIndex = (saveMode === 'new' || mode === 'compose' || layers.length > 1)
      ? (100000 + (Date.now() % 900000))
      : segIndex
    const label = clipLabel.trim() || `Clip #${targetIndex}`
    try {
      const sameSource = layers.length === 1 || isSyncedDual(layers)
      if (!sameSource) {
        setGenJob(await composeClipJob({
          project_id: project.id,
          layers: layers.map(payloadForLayer),
          label,
          description: clipDescription.trim() || null,
          index: targetIndex,
        }))
      } else {
        const L = layers[0]
        const p = payloadForLayer(L, 0)
        const recipe = recipeForFile(layers)
        const seg = {
          index: targetIndex,
          start: p.start,
          end: p.end,
          score: 1,
          duration: r2(p.end - p.start),
          label,
          description: clipDescription.trim() || null,
        }
        setGenJob(await createClipJob({
          url: L.url, project_id: project.id, segments: [seg],
          crop_mode: 'smart_face',
          reframe: recipe,
        }))
      }
    } catch (e) { setErr(e.message) }
  }

  function close() { onClose?.(currentConfig()) }

  function addProjectClip(clip) {
    const incoming = layerFromProjectClip(clip)
    const extra = makeLayer({ ...incoming[0], id: idc.current++, label: incoming[0].label })
    if (layers.length === 0) {
      setLayers([extra])
      setActiveIdx(0)
    } else if (layers.length >= MAX_LAYERS) {
      setErr('En esta versión puedes combinar 2 materiales.')
    } else {
      const stacked = addSecondLayer(layers, extra)
      stacked[1] = { ...stacked[1], id: extra.id }
      setLayers(stacked)
      setActiveIdx(1)
    }
    setPickerOpen(false)
    setErr('')
  }

  function onSplitTrack() {
    const next = addSplitTrack(layers)
    if (!next) return
    next[1] = { ...next[1], id: idc.current++ }
    setLayers(next)
    setActiveIdx(1)
    setErr('')
  }

  function onCut(idx = activeIdx) {
    const L = layers[idx]
    if (!L || layers.length >= MAX_LAYERS) return
    const parts = cutLayerAt(L, t, MIN_SPLIT_GAP)
    if (!parts) {
      setErr('Coloca el playhead más al centro del recorte para cortar. Luego puedes quitar la parte que no sirva.')
      return
    }
    const a = { ...parts[0], id: L.id, label: `${L.label || 'Clip'} · 1` }
    const b = { ...parts[1], id: idc.current++, label: `${L.label || 'Clip'} · 2` }
    setLayers([a, b])
    setActiveIdx(0)
    setErr('')
  }

  function onInvert() {
    if (layers.length !== 2) return
    setLayers(invertSlots(layers))
  }

  function setPreset(preset) {
    setLayers(applySlotPreset(layers, preset, activeIdx))
    setSlotMenu(false)
  }

  function removeLayer(id) {
    const next = layers.filter((l) => l.id !== id)
    if (next.length === 1) next[0] = { ...next[0], slot: 'full' }
    setLayers(next)
    setActiveIdx(0)
  }

  function onResultDown(e) {
    if (layers.length < 2 || !active) return
    if (active.slot !== 'custom' && !(active.slot === 'overlay' && activeIdx === 1)) return
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1)
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1)
    const rect = outputRect(active, activeIdx, 2)
    dragSlot.current = { ox: nx - rect.x, oy: ny - rect.y, w: rect.w, h: rect.h }
    canvas.setPointerCapture(e.pointerId)
  }
  function onResultMove(e) {
    if (!dragSlot.current || !active) return
    const canvas = canvasRef.current
    const r = canvas.getBoundingClientRect()
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1)
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1)
    const { ox, oy, w, h } = dragSlot.current
    const x = clamp(nx - ox, 0, 1 - w)
    const y = clamp(ny - oy, 0, 1 - h)
    patchActive({ slot: active.slot === 'overlay' ? 'custom' : 'custom', customRect: { x, y, w, h } })
  }
  function onResultUp(e) {
    dragSlot.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  const loading = layers.length > 0 && !prep && !err
  const waitingEmpty = layers.length === 0
  const pct = (v) => `${v * 100}%`
  const genBusy = genJob && (genJob.status === 'pending' || genJob.status === 'running')
  const genDone = genJob?.status === 'done'
  const statusJob = genBusy ? genJob : job
  const showStatus = loading || genBusy

  useEffect(() => {
    if (!showStatus) { setPrepElapsed(0); return }
    prepTick.current = Date.now()
    setPrepElapsed(0)
    const id = setInterval(() => setPrepElapsed(Math.floor((Date.now() - prepTick.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [showStatus, activeKey, genJob?.id])

  const statusMessage = genBusy
    ? (genJob.message || 'Generando clip…')
    : (job?.message || (loading ? 'Lanzando preparación del clip…' : ''))
  const clips = project?.clips || []
  const slotLabel = (s) => ({ top: 'Arriba', bottom: 'Abajo', left: 'Izquierda', right: 'Derecha', overlay: 'Superpuesto', custom: 'Personalizado', full: 'Completo' }[s] || s)

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal modal-editor ultra-workspace" ref={modalRef}>
        <div className="ed-top-toolbar">
          <div className="ed-top-title">
            <Icon name="movie_edit" size={18} />
            <strong>{mode === 'compose' ? 'Caja construir' : 'Caja editor'}</strong>
            {active && prep && (
              <span className="muted small">({fmt((active.segStart || 0) + trimIn)} → {fmt((active.segStart || 0) + trimOut)})</span>
            )}
          </div>

          <div className="ed-top-controls">
            <button className="ghost small" onClick={() => setPickerOpen(true)} disabled={layers.length >= MAX_LAYERS} title="Agregar un material del proyecto">
              <Icon name="library_add" size={15} /> {layers.length < 1 ? 'Unir' : 'Agregar material'}
            </button>
            {layers.length === 2 && (
              <>
                <div className="crop-tab-pills">
                  <button className="crop-pill" onClick={() => setSlotMenu((s) => !s)}>Hueco: {slotLabel(active?.slot)}</button>
                  <button className="crop-pill" onClick={onInvert} title="Intercambia la posición de las dos capas">Orden</button>
                </div>
              </>
            )}
          </div>

          <button className="icon-btn close-btn" title="Cerrar" onClick={close}><Icon name="close" size={20} /></button>
        </div>

        {showStatus && (
          <JobStatusBar
            progress={statusJob?.progress || 0.04}
            message={statusMessage}
            elapsed={prepElapsed}
          />
        )}

        {slotMenu && layers.length === 2 && (
          <div className="comp-slot-bar">
            {[
              ['vertical', 'Arriba / abajo'],
              ['horizontal', 'Izquierda / derecha'],
              ['overlay', 'Superpuesto'],
              ['custom', 'Personalizado'],
            ].map(([id, lab]) => (
              <button key={id} className="ghost small" onClick={() => setPreset(id)}>{lab}</button>
            ))}
            {['top', 'bottom', 'left', 'right'].map((s) => (
              <button key={s} className={`ghost small ${active?.slot === s ? 'active-save' : ''}`} onClick={() => setPreset(s)}>{slotLabel(s)}</button>
            ))}
          </div>
        )}

        {waitingEmpty && (
          <div className="rf-loading">
            <p className="muted">Elige un material del proyecto para empezar la composición.</p>
            <button className="primary small" onClick={() => setPickerOpen(true)}>
              <Icon name="library_add" size={15} /> Elegir material
            </button>
          </div>
        )}
        {loading && (
          <div className="rf-loading">
            <p className="muted">Preparando el tramo para editarlo. Si tarda, la barra de arriba indica el paso actual.</p>
          </div>
        )}
        {err && <div className="error">⚠️ {err}</div>}

        {prep && active && (
          <>
            {layers.length > 0 && (
              <div className="comp-layer-strip">
                {layers.map((L, i) => (
                  <button
                    key={L.id}
                    className={`comp-layer-chip ${i === activeIdx ? 'on' : ''} ${i === 0 ? 'c1' : 'c2'}`}
                    onClick={() => { setActiveIdx(i); setSelId(null); const p = prepMap[prepKey(L)]; if (p) seek(L.trimIn || 0) }}
                  >
                    <span className="comp-layer-name">{L.label || `Capa ${i + 1}`}</span>
                    <span className="muted small">{slotLabel(layers.length < 2 ? 'full' : L.slot)}</span>
                    {layers.length < MAX_LAYERS && (
                    <span
                      className="comp-layer-split"
                      onClick={(e) => { e.stopPropagation(); onCut(i) }}
                      title="Cortar aquí: dos partes. Quita la que no quieras o recorta el medio en la segunda."
                    >Cortar</span>
                    )}
                    {layers.length > 1 && (
                      <span className="comp-layer-x" onClick={(e) => { e.stopPropagation(); removeLayer(L.id) }} title="Quitar">×</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="ed-grid-workspace">
              <div className="ed-col-main">
                <div className="rf-stage-wrap">
                  <div className="rf-stage" ref={stageRef} style={{ aspectRatio: `${prep.width} / ${prep.height}` }}>
                    {layers.map((L, i) => {
                      const pr = prepMap[prepKey(L)]
                      if (!pr) return null
                      return (
                        <video
                          key={L.id}
                          ref={(el) => { videoEls.current[L.id] = el }}
                          src={pr.proxy_url}
                          preload="auto"
                          muted={i !== activeIdx}
                          style={{
                            display: 'block',
                            position: i === activeIdx ? 'relative' : 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            opacity: i === activeIdx ? 1 : 0,
                            pointerEvents: i === activeIdx ? 'auto' : 'none',
                          }}
                          onTimeUpdate={onTime}
                          onPlay={() => setPlaying(true)}
                          onPause={() => setPlaying(false)}
                          onClick={playing ? pauseVideo : playVideo}
                        />
                      )
                    })}
                    {face && (
                      <div className="rf-facebox" style={{
                        left: pct(face.cx - face.w / 2), top: pct(face.cy - face.h / 2),
                        width: pct(face.w), height: pct(face.h),
                      }}><span className="rf-facedot" /></div>
                    )}
                    <div
                      className={`rf-cropbox crop1-box active ${dragging ? 'drag' : ''}`}
                      style={{
                        left: pct(center.cx - geomBox.widthFrac / 2), top: pct(center.cy - geomBox.heightFrac / 2),
                        width: pct(geomBox.widthFrac), height: pct(geomBox.heightFrac),
                      }}
                      onPointerDown={onBoxDown} onPointerMove={onBoxMove} onPointerUp={onBoxUp}
                    >
                      <span className="rf-cbadge crop1-badge">{active.label || `Capa ${activeIdx + 1}`}</span>
                      {['nw', 'ne', 'sw', 'se'].map((c) => (
                        <span
                          key={c}
                          className={`rf-chandle ${c}`}
                          onPointerDown={onCornerDown}
                          onPointerMove={onBoxMove}
                          onPointerUp={onBoxUp}
                          title="Arrastra la esquina para hacer zoom"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ed-transport-bar">
                  <div className="transport-btns">
                    {playing ? (
                      <button className="icon-btn big" onClick={pauseVideo} title="Pausa">
                        <Icon name="pause_circle" size={32} />
                      </button>
                    ) : (
                      <button className="icon-btn big" onClick={playVideo} title="Reproducir">
                        <Icon name="play_circle" size={32} />
                      </button>
                    )}
                    <button className="ghost small" onClick={stopVideo} title="Stop">
                      <Icon name="stop" size={16} /> Stop
                    </button>
                    <button className="ghost small icon-only" onClick={() => seek(t - 0.5)} title="Atrás 0,5s">
                      <Icon name="fast_rewind" size={15} />
                    </button>
                    <button className="ghost small icon-only" onClick={() => seek(t + 0.5)} title="Adelante 0,5s">
                      <Icon name="fast_forward" size={15} />
                    </button>
                    <button className="ghost small" onClick={onCut} disabled={layers.length >= MAX_LAYERS} title="Corta el clip en el playhead en dos partes seguidas">
                      Cortar
                    </button>
                    <button className="ghost small" onClick={onSplitTrack} disabled={layers.length !== 1} title="Duplica el clip en una segunda pista sincronizada">
                      Dividir
                    </button>
                    {selKf && (
                      <>
                        <button
                          type="button"
                          className={`ghost small ${selFit === 'contain' ? 'active-save' : ''}`}
                          title="Entero: el vídeo completo cabe en el hueco"
                          onClick={() => patchSelFit('contain')}
                        >
                          Entero
                        </button>
                        <button
                          type="button"
                          className={`ghost small ${selFit === 'cover' ? 'active-save' : ''}`}
                          title="Custom: recorta una zona y llena el hueco"
                          onClick={() => patchSelFit('cover')}
                        >
                          Custom
                        </button>
                        <PanModeToggle value={panMode} onChange={patchSelPan} />
                      </>
                    )}
                  </div>
                  <span className="rf-time">{fmt(t)} / {fmt(dur)}{layers.length > 1 ? ` · out ${fmt(compositionDuration(layers))}` : ''}</span>
                </div>

                <div className="ed-timeline" ref={tlRef} onPointerDown={onTlDown}>
                  <div className="ed-trim-dim" style={{ left: 0, width: pct(dur ? trimIn / dur : 0) }} />
                  <div className="ed-trim-dim" style={{ right: 0, width: pct(dur ? 1 - trimOut / dur : 0) }} />
                  <div className="ed-trim-range" style={{ left: pct(dur ? trimIn / dur : 0), width: pct(dur ? (trimOut - trimIn) / dur : 0) }} />
                  <div className="ed-handle in" style={{ left: pct(dur ? trimIn / dur : 0) }}
                    onPointerDown={(e) => onTrimDown(e, 'in')} onPointerMove={onTrimMove} onPointerUp={onTrimUp} title="Inicio del recorte" />
                  <div className="ed-handle out" style={{ left: pct(dur ? trimOut / dur : 0) }}
                    onPointerDown={(e) => onTrimDown(e, 'out')} onPointerMove={onTrimMove} onPointerUp={onTrimUp} title="Fin del recorte" />
                  <div className="rf-playhead" style={{ left: pct(dur ? t / dur : 0) }} />
                  {kfs.map((k) => (
                    <button key={k.id} className={`rf-dot ${k.pan_mode === 'direct' ? 'direct' : ''} ${k.id === selId ? 'sel' : ''}`}
                      style={{ left: pct(dur ? k.t / dur : 0) }} title={`${k.pan_mode === 'direct' ? 'Directo' : 'Suave'} · ${fmt(k.t)}`}
                      onPointerDown={(e) => onDotDown(e, k)} onPointerMove={onDotMove} onPointerUp={onDotUp} />
                  ))}
                </div>
              </div>

              <div className="ed-col-preview">
                <div className="ed-result-head">
                  <span>Resultado {formatLabel}</span>
                  <span className="muted small">
                    {isSequentialLayout(layers)
                      ? 'En secuencia'
                      : (layers.length > 1 ? `${layers.length} capas` : 'En vivo')}
                  </span>
                </div>
                <div className="canvas-wrapper">
                  <canvas
                    ref={canvasRef}
                    width={270}
                    height={previewH}
                    className="ed-result-canvas"
                    onPointerDown={onResultDown}
                    onPointerMove={onResultMove}
                    onPointerUp={onResultUp}
                    title={active?.slot === 'custom' || (active?.slot === 'overlay' && activeIdx === 1) ? 'Arrastra para colocar esta capa' : undefined}
                  />
                </div>
                <div className="ed-pan-tools-row">
                  <button className="primary alt small" onClick={addHere}>
                    <Icon name="add_location_alt" size={15} /> + Punto
                  </button>
                  <button className="ghost small" onClick={delSel} disabled={selId == null}>
                    <Icon name="delete" size={15} /> Quitar
                  </button>
                  <button className="ghost small danger" onClick={() => setConfirmClearPoints(true)} disabled={!kfs.length}>
                    <Icon name="delete_sweep" size={15} /> Borrar todos
                  </button>
                  <button className="ghost small" onClick={reseed}>
                    <Icon name="auto_fix_high" size={15} /> Auto
                  </button>
                </div>
              </div>
            </div>

            <div className="ed-bottom-bar">
              {mode !== 'compose' && layers.length === 1 && (
                <div className="save-mode-selector">
                  <button className={`ghost small ${saveMode === 'overwrite' ? 'active-save' : ''}`} onClick={() => setSaveMode('overwrite')}>
                    Sobrescribir clip
                  </button>
                  <button className={`ghost small ${saveMode === 'new' ? 'active-save' : ''}`} onClick={() => setSaveMode('new')}>
                    + Guardar como nuevo
                  </button>
                </div>
              )}
              <div className="save-fields-row">
                <input className="time-input clip-name-input" placeholder="Nombre / Etiqueta del clip…"
                  value={clipLabel} onChange={(e) => setClipLabel(e.target.value)} />
                <input className="time-input clip-desc-input" placeholder="Descripción del clip…"
                  value={clipDescription} onChange={(e) => setClipDescription(e.target.value)} />
              </div>
              <div className="save-actions">
                {genBusy ? (
                  <div className="ed-genprog">
                    <div className="progress"><span style={{ width: pct(genJob.progress || 0.05) }} /></div>
                    <span className="muted small">{genJob.message || 'Generando…'}</span>
                  </div>
                ) : genDone ? (
                  <>
                    <span className="reframe-status ok"><Icon name="check_circle" size={16} /> Generado</span>
                    <button className="primary small" onClick={close}>Cerrar</button>
                    <button className="ghost small" onClick={() => setGenJob(null)}>Editar</button>
                  </>
                ) : (
                  <>
                    <button className="primary small" onClick={generate} disabled={!layers.length}>
                      <Icon name="movie" size={16} /> Guardar y generar
                    </button>
                    <button className="ghost small" onClick={close}>Cancelar</button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {pickerOpen && (
        <div className="modal-overlay" style={{ zIndex: 110 }} onPointerDown={(e) => e.target === e.currentTarget && setPickerOpen(false)}>
          <div className="modal comp-picker-modal">
            <h3 style={{ margin: '0 0 12px' }}>Materiales del proyecto</h3>
            <MaterialClipGrid
              clips={clips}
              onAdd={addProjectClip}
              draggable={false}
              addTitle="Usar en la composición"
              emptyText="No hay clips en la biblioteca. Créalos en la pestaña Vídeo."
            />
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="ghost small" onClick={() => setPickerOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmClearPoints}
        title="¿Eliminar todos los puntos de esta capa?"
        message={`Se eliminarán los ${kfs.length} puntos de posicionamiento. Las demás capas no se verán afectadas.`}
        confirmText="Eliminar puntos"
        cancelText="Cancelar"
        danger
        onConfirm={clearAllActivePoints}
        onCancel={() => setConfirmClearPoints(false)}
      />
    </div>
  )
}
