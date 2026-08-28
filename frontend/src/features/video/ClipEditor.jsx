import { useState, useEffect, useRef, useCallback } from 'react'
import { prepareReframe, createClipJob, getJob } from '../../services/api'
import { fmt } from '../../lib/utils'
import Icon from '../../components/Icon'
import ConfirmModal from '../../components/ConfirmModal'
import { clamp, r2, r4, posAt, OUT_RATIO, geomFor, clampCenter as clampCenterFor } from '../../lib/panning'
import { drawClipFrame } from './clipCanvas'

// Punto de la pista de caras más cercano al instante `time` (específico del editor de clip).
function trackAt(track, time) {
  if (!track?.length) return null
  let best = track[0], bd = Math.abs(track[0].t - time)
  for (const p of track) { const d = Math.abs(p.t - time); if (d < bd) { bd = d; best = p } }
  return best
}

export default function ClipEditor({ project, url, segStart, segEnd, segIndex, initial, onClose, onChange }) {
  const [job, setJob] = useState(null)
  const [prep, setPrep] = useState(null)
  const [err, setErr] = useState('')

  // Opciones de paneo y doble encuadre
  const [panMode, setPanMode] = useState(initial?.pan_mode ?? 'smooth')
  const [dualCrop, setDualCrop] = useState(initial?.dual_crop ?? false)
  const [splitOrientation, setSplitOrientation] = useState(initial?.split_orientation ?? 'vertical')
  const [activeCropTab, setActiveCropTab] = useState(1)

  // Modos de guardado & Metadata del clip
  const [saveMode, setSaveMode] = useState('overwrite') // 'overwrite' | 'new'
  const [clipLabel, setClipLabel] = useState(initial?.label || `Clip #${segIndex}`)
  const [clipDescription, setClipDescription] = useState(initial?.description || '')

  // Confirmación de borrado masivo de puntos
  const [confirmClearPoints, setConfirmClearPoints] = useState(false)

  // Encuadre 1
  const [zoom, setZoom] = useState(initial?.zoom ?? 1)
  const [kfs, setKfs] = useState([])

  // Encuadre 2
  const [zoom2, setZoom2] = useState(initial?.zoom2 ?? 1)
  const [kfs2, setKfs2] = useState([])

  const [t, setT] = useState(0)
  const [selId, setSelId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [playing, setPlaying] = useState(false)

  const [trimIn, setTrimIn] = useState(initial?.trimIn ?? 0)
  const [trimOut, setTrimOut] = useState(initial?.trimOut ?? 0)

  const [genJob, setGenJob] = useState(null)

  const idc = useRef(1)
  const withId = (k) => ({ ...k, id: idc.current++ })

  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const tlRef = useRef(null)
  const canvasRef = useRef(null)
  const modalRef = useRef(null)

  const drag = useRef({ cropIndex: 1, dx: 0, dy: 0, id: null, t: 0 })
  const dragDot = useRef(null)
  const dragTrim = useRef(null)

  const activeKfs = activeCropTab === 1 ? kfs : kfs2
  const setActiveKfs = activeCropTab === 1 ? setKfs : setKfs2
  const activeZoom = activeCropTab === 1 ? zoom : zoom2

  const kfsRef = useRef(kfs); kfsRef.current = kfs
  const kfs2Ref = useRef(kfs2); kfs2Ref.current = kfs2
  const activeKfsRef = useRef(activeKfs); activeKfsRef.current = activeKfs
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const zoom2Ref = useRef(zoom2); zoom2Ref.current = zoom2
  const panModeRef = useRef(panMode); panModeRef.current = panMode
  const dualCropRef = useRef(dualCrop); dualCropRef.current = dualCrop
  const splitOrientRef = useRef(splitOrientation); splitOrientRef.current = splitOrientation

  const initialKfs = useRef(initial?.keyframes ?? null)
  const initialKfs2 = useRef(initial?.keyframes2 ?? null)

  // 1) Preparar proxy
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const j = await prepareReframe({ url, start: segStart, end: segEnd })
        if (alive) setJob(j)
      } catch (e) { if (alive) setErr(e.message) }
    })()
    return () => { alive = false }
  }, [url, segStart, segEnd])

  // 2) Polling de preparación
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') {
      if (job?.status === 'done' && job.reframe_prep) {
        const p = job.reframe_prep
        setPrep(p)
        setKfs((initialKfs.current ?? p.keyframes ?? []).map(withId))
        setKfs2((initialKfs2.current ?? p.keyframes ?? []).map(withId))
        if (!initial) {
          setTrimIn(0)
          setTrimOut(p.duration || 0)
        } else {
          setTrimIn(initial.trimIn ?? 0)
          setTrimOut(initial.trimOut ?? p.duration ?? 0)
          if (initial.zoom != null) setZoom(initial.zoom)
          if (initial.zoom2 != null) setZoom2(initial.zoom2)
        }
      }
      if (job?.status === 'error') setErr(job.error || 'Error preparando el editor.')
      return
    }
    const id = setInterval(async () => {
      try { setJob(await getJob(job.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
  }, [job?.id, job?.status])

  // 3) Polling de generación
  useEffect(() => {
    if (!genJob || genJob.status === 'done' || genJob.status === 'error') {
      if (genJob?.status === 'done') onChange?.()
      return
    }
    const id = setInterval(async () => {
      try { setGenJob(await getJob(genJob.id)) } catch { /* reintenta */ }
    }, 1000)
    return () => clearInterval(id)
  }, [genJob?.id, genJob?.status])

  // --- Geometría ---
  const srcAspect = prep ? prep.width / prep.height : 16 / 9
  const geom = useCallback((z, targetAspect = OUT_RATIO) => geomFor(z, srcAspect, targetAspect), [srcAspect])

  const targetAspect = dualCrop
    ? (splitOrientation === 'vertical' ? (9 / 8) : (4.5 / 16))
    : OUT_RATIO

  const clampCenter = useCallback((cx, cy, z = activeZoom, tAspect = targetAspect) => clampCenterFor(cx, cy, z, srcAspect, tAspect), [srcAspect, activeZoom, targetAspect])

  const dur = prep?.duration || 0
  const interp1 = posAt(kfs, t, panMode)
  const center1 = clampCenter(interp1.cx, interp1.cy, zoom, targetAspect)

  const interp2 = posAt(kfs2, t, panMode)
  const center2 = clampCenter(interp2.cx, interp2.cy, zoom2, targetAspect)

  const face = prep ? trackAt(prep.track, t) : null

  // --- Resultado 9:16 en vivo en Canvas ---
  useEffect(() => {
    if (!prep) return
    let raf = 0
    const env = { dualCropRef, splitOrientRef, panModeRef, zoomRef, zoom2Ref, kfsRef, kfs2Ref, geom, clampCenter, prep }
    const draw = () => {
      const v = videoRef.current, c = canvasRef.current
      if (v && c && v.readyState >= 2) drawClipFrame(v, c, env)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [prep, geom, clampCenter])

  // --- Mutación de keyframes por Encuadre ---
  const writeKfForCrop = useCallback((cropNum, id, tt, cx, cy) => {
    const setter = cropNum === 1 ? setKfs : setKfs2
    setter((prev) => {
      const next = [...prev]
      const j = next.findIndex((k) => k.id === id)
      const point = { id, t: r2(tt), cx: r4(cx), cy: r4(cy) }
      if (j >= 0) next[j] = point; else next.push(point)
      next.sort((a, b) => a.t - b.t)
      return next
    })
    setSelId(id)
  }, [])

  function upsertAt(time, cx, cy) {
    const tt = r2(clamp(time, 0, dur))
    const targetKfs = activeCropTab === 1 ? kfsRef.current : kfs2Ref.current
    const ex = targetKfs.find((k) => Math.abs(k.t - tt) < 0.06)
    writeKfForCrop(activeCropTab, ex ? ex.id : idc.current++, tt, cx, cy)
  }

  function addHere() {
    const p = posAt(activeKfs, t, panMode)
    const c = clampCenter(p.cx, p.cy, activeZoom, targetAspect)
    upsertAt(t, c.cx, c.cy)
  }

  function delSel() {
    if (selId == null) return
    setActiveKfs((prev) => prev.filter((k) => k.id !== selId))
    setSelId(null)
  }

  function clearAllActivePoints() {
    setActiveKfs([])
    setSelId(null)
    setConfirmClearPoints(false)
  }

  function reseed() {
    if (prep?.keyframes) { setActiveKfs(prep.keyframes.map(withId)); setSelId(null) }
  }

  // --- Navegación por teclado (Tab, Enter, Delete) ---
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Tab') {
        e.preventDefault()
        if (!activeKfs.length) return
        const sorted = [...activeKfs].sort((a, b) => a.t - b.t)
        let nextIdx = 0
        if (selId != null) {
          const currIdx = sorted.findIndex((k) => k.id === selId)
          if (currIdx >= 0) {
            nextIdx = e.shiftKey ? (currIdx - 1 + sorted.length) % sorted.length : (currIdx + 1) % sorted.length
          }
        }
        const targetKf = sorted[nextIdx]
        setSelId(targetKf.id)
        seek(targetKf.t)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const targetKf = activeKfs.find((k) => k.id === selId)
        if (targetKf) seek(targetKf.t)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selId != null) {
          e.preventDefault()
          delSel()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeKfs, selId])

  // --- Transporte de reproducción (Play, Pausa, Stop) ---
  function playVideo() {
    const v = videoRef.current
    if (!v) return
    if (v.currentTime >= trimOut - 0.05 || v.currentTime < trimIn) {
      v.currentTime = trimIn
    }
    v.play()
  }

  function pauseVideo() {
    videoRef.current?.pause()
  }

  function stopVideo() {
    const v = videoRef.current
    if (!v) return
    v.pause()
    v.currentTime = trimIn
    setT(trimIn)
  }

  function seek(sec) {
    const v = videoRef.current
    if (v) { v.currentTime = clamp(sec, 0, dur); setT(v.currentTime) }
  }

  function onTime(e) {
    const v = e.target
    if (!v.paused && v.currentTime >= trimOut) {
      v.currentTime = trimIn
    }
    setT(v.currentTime)
  }

  function updateTrimIn(newIn) {
    const validIn = Math.min(newIn, trimOut - 0.3)
    setTrimIn(validIn)
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.currentTime = validIn
      setT(validIn)
    }
  }

  // --- Arrastre de las cajas en el vídeo ---
  function stageNorm(e) {
    const r = stageRef.current.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }
  }

  function onBoxDown(e, cropIndex = activeCropTab) {
    e.preventDefault()
    setActiveCropTab(cropIndex)
    const p = stageNorm(e)
    const tt = r2(clamp(t, 0, dur))
    const targetKfs = cropIndex === 1 ? kfsRef.current : kfs2Ref.current
    const targetCenter = cropIndex === 1 ? center1 : center2

    const ex = targetKfs.find((k) => Math.abs(k.t - tt) < 0.06)
    drag.current = { cropIndex, dx: p.x - targetCenter.cx, dy: p.y - targetCenter.cy, id: ex ? ex.id : null, t: tt }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    videoRef.current?.pause()
  }

  function onBoxMove(e) {
    if (!dragging) return
    const cropIndex = drag.current.cropIndex || activeCropTab
    const zTarget = cropIndex === 1 ? zoomRef.current : zoom2Ref.current
    const p = stageNorm(e)
    const c = clampCenter(p.x - drag.current.dx, p.y - drag.current.dy, zTarget, targetAspect)
    if (drag.current.id == null) drag.current.id = idc.current++
    writeKfForCrop(cropIndex, drag.current.id, drag.current.t, c.cx, c.cy)
  }

  function onBoxUp(e) {
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  // --- Timeline ---
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
    setActiveKfs((prev) => {
      const next = prev.map((k) => (k.id === dragDot.current ? { ...k, t: nt } : k))
      next.sort((a, b) => a.t - b.t); return next
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
    else setTrimOut(Math.max(nt, trimIn + 0.3))
    seek(nt)
  }
  function onTrimUp(e) {
    dragTrim.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  // --- Construcción de Reframe ---
  function buildKfList(kfsList, inTime, outTime, zVal) {
    const pin = posAt(kfsList, inTime, panMode)
    const kin = clampCenter(pin.cx, pin.cy, zVal, targetAspect)
    const pout = posAt(kfsList, outTime, panMode)
    const kout = clampCenter(pout.cx, pout.cy, zVal, targetAspect)

    const inside = kfsList
      .filter((k) => k.t > inTime + 0.02 && k.t < outTime - 0.02)
      .map((k) => { const c = clampCenter(k.cx, k.cy, zVal, targetAspect); return { t: k.t, cx: c.cx, cy: c.cy } })
    const all = [{ t: inTime, ...kin }, ...inside, { t: outTime, ...kout }]
    return all
      .map((k) => ({ t: r2(k.t - inTime), cx: r4(k.cx), cy: r4(k.cy) }))
      .sort((a, b) => a.t - b.t)
  }

  function buildReframe() {
    return {
      zoom: r2(zoom),
      pan_mode: panMode,
      dual_crop: dualCrop,
      split_orientation: splitOrientation,
      zoom2: r2(zoom2),
      keyframes: buildKfList(kfs, trimIn, trimOut, zoom),
      keyframes2: dualCrop ? buildKfList(kfs2, trimIn, trimOut, zoom2) : [],
    }
  }

  function currentConfig() {
    return {
      trimIn, trimOut, zoom, zoom2, pan_mode: panMode, dual_crop: dualCrop, split_orientation: splitOrientation,
      label: clipLabel, description: clipDescription,
      keyframes: kfs.map((k) => ({ t: k.t, cx: k.cx, cy: k.cy })),
      keyframes2: kfs2.map((k) => ({ t: k.t, cx: k.cx, cy: k.cy })),
    }
  }

  async function generate() {
    setErr('')
    const targetIndex = saveMode === 'new' ? (100000 + (Date.now() % 900000)) : segIndex
    const seg = {
      index: targetIndex,
      start: r2(segStart + trimIn),
      end: r2(segStart + trimOut),
      score: 1,
      duration: r2(trimOut - trimIn),
      label: clipLabel.trim() || `Clip #${targetIndex}`,
      description: clipDescription.trim() || null,
    }
    try {
      setGenJob(await createClipJob({
        url, project_id: project.id, segments: [seg],
        crop_mode: 'smart_face', reframe: buildReframe(),
      }))
    } catch (e) { setErr(e.message) }
  }

  function close() { onClose?.(currentConfig()) }

  const loading = !prep && !err
  const pct = (v) => `${v * 100}%`
  const genBusy = genJob && (genJob.status === 'pending' || genJob.status === 'running')
  const genDone = genJob?.status === 'done'

  // Geometría para Crop 1 y Crop 2 en el stage
  const geom1 = geom(zoom, targetAspect)
  const geom2 = geom(zoom2, targetAspect)

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal modal-editor ultra-workspace" ref={modalRef}>
        {/* BARRA SUPERIOR HORIZONTAL COMPACTA */}
        <div className="ed-top-toolbar">
          <div className="ed-top-title">
            <Icon name="movie_edit" size={18} />
            <strong>Editor de Clip</strong>
            <span className="muted small">({fmt(segStart + trimIn)} → {fmt(segStart + trimOut)})</span>
          </div>

          <div className="ed-top-controls">
            <label className="ed-pill-switch" title="Saltos directos sin interpolación lineal">
              <input
                type="checkbox"
                checked={panMode === 'direct'}
                onChange={(e) => setPanMode(e.target.checked ? 'direct' : 'smooth')}
              />
              <span>⚡ Paneo directo</span>
            </label>

            <label className="ed-pill-switch" title="Doble encuadre arriba/abajo o lado a lado">
              <input
                type="checkbox"
                checked={dualCrop}
                onChange={(e) => setDualCrop(e.target.checked)}
              />
              <span>📱 Doble encuadre</span>
            </label>

            {dualCrop && (
              <>
                <select
                  className="select mini"
                  value={splitOrientation}
                  onChange={(e) => setSplitOrientation(e.target.value)}
                >
                  <option value="vertical">Vertical (Arriba/Abajo)</option>
                  <option value="horizontal">Horizontal (Lado a Lado)</option>
                </select>

                <div className="crop-tab-pills">
                  <button
                    className={`crop-pill ${activeCropTab === 1 ? 'active crop1' : ''}`}
                    onClick={() => setActiveCropTab(1)}
                  >
                    Encuadre 1 ({kfs.length})
                  </button>
                  <button
                    className={`crop-pill ${activeCropTab === 2 ? 'active crop2' : ''}`}
                    onClick={() => setActiveCropTab(2)}
                  >
                    Encuadre 2 ({kfs2.length})
                  </button>
                </div>
              </>
            )}
          </div>

          <button className="icon-btn close-btn" title="Cerrar" onClick={close}><Icon name="close" size={20} /></button>
        </div>

        {loading && (
          <div className="rf-loading">
            <div className="progress"><span style={{ width: pct(job?.progress || 0.05) }} /></div>
            <p className="muted">{job?.message || 'Preparando previsualización del tramo…'}</p>
          </div>
        )}
        {err && <div className="error">⚠️ {err}</div>}

        {prep && (
          <>
            {/* ÁREA DE TRABAJO PRINCIPAL (2 COLUMNAS MAXIMIZADAS) */}
            <div className="ed-grid-workspace">
              {/* COLUMNA 1: VÍDEO DE TRABAJO + STAGE */}
              <div className="ed-col-main">
                <div className="rf-stage-wrap">
                  <div className="rf-stage" ref={stageRef} style={{ aspectRatio: `${prep.width} / ${prep.height}` }}>
                    <video
                      ref={videoRef}
                      src={prep.proxy_url}
                      preload="auto"
                      onTimeUpdate={onTime}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onClick={playing ? pauseVideo : playVideo}
                    />
                    {face && (
                      <div className="rf-facebox" style={{
                        left: pct(face.cx - face.w / 2), top: pct(face.cy - face.h / 2),
                        width: pct(face.w), height: pct(face.h),
                      }}><span className="rf-facedot" /></div>
                    )}

                    {/* CAJA ENCUADRE 1 */}
                    <div
                      className={`rf-cropbox crop1-box ${activeCropTab === 1 ? 'active' : ''} ${dragging && drag.current.cropIndex === 1 ? 'drag' : ''}`}
                      style={{
                        left: pct(center1.cx - geom1.widthFrac / 2), top: pct(center1.cy - geom1.heightFrac / 2),
                        width: pct(geom1.widthFrac), height: pct(geom1.heightFrac),
                      }}
                      onPointerDown={(e) => onBoxDown(e, 1)} onPointerMove={onBoxMove} onPointerUp={onBoxUp}
                    >
                      <span className="rf-cbadge crop1-badge">Encuadre 1</span>
                    </div>

                    {/* CAJA ENCUADRE 2 (si doble encuadre está activo) */}
                    {dualCrop && (
                      <div
                        className={`rf-cropbox crop2-box ${activeCropTab === 2 ? 'active' : ''} ${dragging && drag.current.cropIndex === 2 ? 'drag' : ''}`}
                        style={{
                          left: pct(center2.cx - geom2.widthFrac / 2), top: pct(center2.cy - geom2.heightFrac / 2),
                          width: pct(geom2.widthFrac), height: pct(geom2.heightFrac),
                        }}
                        onPointerDown={(e) => onBoxDown(e, 2)} onPointerMove={onBoxMove} onPointerUp={onBoxUp}
                      >
                        <span className="rf-cbadge crop2-badge">Encuadre 2</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* TRANSPORTE (PLAY / PAUSA / STOP) */}
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

                    <button className="ghost small" onClick={stopVideo} title="Stop (reiniciar al inicio del recorte)">
                      <Icon name="stop" size={16} /> Stop
                    </button>

                    <button className="ghost small icon-only" onClick={() => seek(t - 0.5)} title="Atrás 0,5s">
                      <Icon name="fast_rewind" size={15} />
                    </button>
                    <button className="ghost small icon-only" onClick={() => seek(t + 0.5)} title="Adelante 0,5s">
                      <Icon name="fast_forward" size={15} />
                    </button>
                  </div>

                  <span className="rf-time">{fmt(t)} / {fmt(dur)}</span>
                </div>

                {/* TIMELINE DE RECORTE Y KEYFRAMES */}
                <div className="ed-timeline" ref={tlRef} onPointerDown={onTlDown}>
                  <div className="ed-trim-dim" style={{ left: 0, width: pct(dur ? trimIn / dur : 0) }} />
                  <div className="ed-trim-dim" style={{ right: 0, width: pct(dur ? 1 - trimOut / dur : 0) }} />
                  <div className="ed-trim-range" style={{ left: pct(dur ? trimIn / dur : 0), width: pct(dur ? (trimOut - trimIn) / dur : 0) }} />
                  <div className="ed-handle in" style={{ left: pct(dur ? trimIn / dur : 0) }}
                    onPointerDown={(e) => onTrimDown(e, 'in')} onPointerMove={onTrimMove} onPointerUp={onTrimUp} title="Inicio del recorte" />
                  <div className="ed-handle out" style={{ left: pct(dur ? trimOut / dur : 0) }}
                    onPointerDown={(e) => onTrimDown(e, 'out')} onPointerMove={onTrimMove} onPointerUp={onTrimUp} title="Fin del recorte" />
                  <div className="rf-playhead" style={{ left: pct(dur ? t / dur : 0) }} />

                  {activeKfs.map((k) => (
                    <button key={k.id} className={`rf-dot ${k.id === selId ? 'sel' : ''}`}
                      style={{ left: pct(dur ? k.t / dur : 0) }} title={`Punto ${fmt(k.t)} (Tab para navegar)`}
                      onPointerDown={(e) => onDotDown(e, k)} onPointerMove={onDotMove} onPointerUp={onDotUp} />
                  ))}
                </div>
              </div>

              {/* COLUMNA 2: RESULTADO EN VIVO 9:16 + HERRAMIENTAS DE PANEO */}
              <div className="ed-col-preview">
                <div className="ed-result-head">
                  <span>Resultado 9:16</span>
                  <span className="muted small">{dualCrop ? `Doble (${splitOrientation})` : 'En vivo'}</span>
                </div>

                <div className="canvas-wrapper">
                  <canvas ref={canvasRef} width={270} height={480} className="ed-result-canvas" />
                </div>

                {/* BOTONES DE PANEO Y KEYFRAMES DE ENCUADRE ACTIVO */}
                <div className="ed-pan-tools-row">
                  <button className="primary alt small" onClick={addHere} title="Agregar punto en tiempo actual">
                    <Icon name="add_location_alt" size={15} /> + Punto ({activeCropTab})
                  </button>

                  <button className="ghost small" onClick={delSel} disabled={selId == null} title="Quitar punto seleccionado (Delete)">
                    <Icon name="delete" size={15} /> Quitar
                  </button>

                  <button
                    className="ghost small danger"
                    onClick={() => setConfirmClearPoints(true)}
                    disabled={!activeKfs.length}
                    title="Eliminar todos los puntos del encuadre seleccionado"
                  >
                    <Icon name="delete_sweep" size={15} /> Borrar todos
                  </button>

                  <button className="ghost small" onClick={reseed} title="Restablecer posiciones del tracking automático">
                    <Icon name="auto_fix_high" size={15} /> Auto
                  </button>
                </div>

                <label className="rf-zoom-slider">
                  <span>Zoom / Tamaño #{activeCropTab}</span>
                  <input
                    type="range"
                    min="0.35"
                    max="1"
                    step="0.01"
                    value={activeZoom}
                    onChange={(e) => activeCropTab === 1 ? setZoom(Number(e.target.value)) : setZoom2(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            {/* BARRA INFERIOR DE GUARDADO (NOMBRE + DESCRIPCIÓN + ACCIONES) */}
            <div className="ed-bottom-bar">
              <div className="save-mode-selector">
                <button
                  className={`ghost small ${saveMode === 'overwrite' ? 'active-save' : ''}`}
                  onClick={() => setSaveMode('overwrite')}
                >
                  Sobrescribir clip
                </button>
                <button
                  className={`ghost small ${saveMode === 'new' ? 'active-save' : ''}`}
                  onClick={() => setSaveMode('new')}
                >
                  + Guardar como nuevo
                </button>
              </div>

              <div className="save-fields-row">
                <input
                  className="time-input clip-name-input"
                  placeholder="Nombre / Etiqueta del clip…"
                  value={clipLabel}
                  onChange={(e) => setClipLabel(e.target.value)}
                />
                <input
                  className="time-input clip-desc-input"
                  placeholder="Descripción del clip…"
                  value={clipDescription}
                  onChange={(e) => setClipDescription(e.target.value)}
                />
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
                    <button className="primary small" onClick={generate}>
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

      {/* CONFIRMACIÓN DE BORRADO DE PUNTOS */}
      <ConfirmModal
        open={confirmClearPoints}
        title={`¿Eliminar todos los puntos del Encuadre ${activeCropTab}?`}
        message={`Se eliminarán los ${activeKfs.length} puntos de posicionamiento del Encuadre ${activeCropTab}. El otro encuadre no se verá afectado.`}
        confirmText="Eliminar puntos"
        cancelText="Cancelar"
        danger
        onConfirm={clearAllActivePoints}
        onCancel={() => setConfirmClearPoints(false)}
      />
    </div>
  )
}
