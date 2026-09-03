import { useRef, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipPopover from '../../components/FlipPopover'
import { fmt } from '../../lib/utils'
import { pseudoWaveform, clamp, kfColor } from '../../lib/panning'
import { clipDur, clipSourceDur, clipSpeed, displayTracks, isVisualClip, laneKindForAsset, linkedPartnerName, trackKindForClip, trimClipPatch, trimPreviewHead } from './editorModel'
import { alignOthers, alignThresholdSec, asAlignClip, snapClipGroup, snapClipMove, snapClipTrim, timelineAlignHits } from './timelineAlign'
import { keyframesEnabled, normalizeItems } from '../../lib/clipKeyframes'
import { snapToFrame } from '../../lib/projectFps'
import { stackViewForTrack } from './clipStack.js'
import { headerScrollPad, timelineWheelAction } from './timelineWheel'
import { buildTicks, clampPps, fmtRuler, tickStep } from './timelineScale'

function PreviewVolButton({ value = 1, onChange }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const pct = Math.round(value * 100)
  const icon = pct <= 0 ? 'volume_off' : pct < 50 ? 'volume_down' : 'volume_up'
  return (
    <div className={`ed-preview-vol ${open ? 'open' : ''}`}>
      <button
        ref={btnRef}
        type="button"
        className="icon-btn"
        title="Volumen de escucha (solo el editor, no el export)"
        aria-expanded={open}
        aria-label="Volumen de escucha"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={icon} size={17} />
      </button>
      <FlipPopover open={open} anchorRef={btnRef} onClose={() => setOpen(false)} className="ed-preview-vol-pop">
        <span className="ed-preview-vol-pct">{pct}</span>
        <div className="ed-preview-vol-track">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Volumen de escucha"
            onChange={(e) => onChange?.(Number(e.target.value) / 100)}
          />
        </div>
      </FlipPopover>
    </div>
  )
}

function FaceTrackButton({ onPick, disabled, busy }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  return (
    <div className="ed-face-track">
      <button
        ref={btnRef}
        type="button"
        className="ghost small icon-only"
        disabled={disabled || busy}
        title="Setear seguimiento de cara"
        aria-label="Setear seguimiento de cara"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="auto_fix_high" size={15} />
      </button>
      <FlipPopover open={open} anchorRef={btnRef} onClose={() => setOpen(false)} className="ed-face-track-pop">
        <button type="button" onClick={() => { onPick?.('smooth'); setOpen(false) }}>Suave</button>
        <button type="button" onClick={() => { onPick?.('direct'); setOpen(false) }}>Salto directo</button>
      </FlipPopover>
    </div>
  )
}

const laneKindFor = laneKindForAsset

export default function EdTimeline({
  tracks, clips, pps, setPps, duration, playhead, rowH, setRowH, fps = 30,
  selectedClipId, selectedClipIds, selectedTrackId, selectedClip, selKfId, dragInfo,
  onSeek, onScrub, onSelectClip, onSelectTrack, onDoubleClip, onMutateClip, onMoveGroup, onMatchDuration, onSplit, onDuplicate, onDeleteClip,
  previewVol, onPreviewVol,
  onDropAsset, onTrackToggle, onTrackCompact, onAddTrack, onAddTextTrack, onMoveKeyframe, onSelectKf, onAddKf, onDeleteKf, onContextClip, onContextTrack,
  onFaceTrack, faceTrackBusy, faceTrackDisabled,
  linkPick, onPickLinkTrack, onCancelLinkPick,
}) {
  const lanesRef = useRef(null)
  const bodyRef = useRef(null)
  const headersRef = useRef(null)
  const drag = useRef(null)
  const [dropHint, setDropHint] = useState(null)   // { trackId, time }
  const [expandedClusterId, setExpandedClusterId] = useState(null)
  const [trimGuide, setTrimGuide] = useState(null) // { t, dur }
  const [alignTimes, setAlignTimes] = useState(null) // number[] mientras se mueve/recorta
  const [scrollX, setScrollX] = useState(0)
  const [viewW, setViewW] = useState(900)
  const rulerStep = tickStep(pps, fps, !!trimGuide)
  const rulerLong = duration >= 3600

  const rows = displayTracks(tracks)
  const totalW = Math.max(duration + 4, 12) * pps
  const isVideoSel = isVisualClip(selectedClip)
  const dragKind = dragInfo?.kind || null
  const selectedIds = selectedClipIds?.length ? selectedClipIds : (selectedClipId ? [selectedClipId] : [])
  const viewsByTrack = new Map()
  for (const t of rows) {
    viewsByTrack.set(t.id, stackViewForTrack(clips, t.id, selectedIds, expandedClusterId, rowH))
  }
  const liveExpandedId = [...viewsByTrack.values()].find((view) => view.liveExpandedId)?.liveExpandedId || null

  useEffect(() => {
    setExpandedClusterId(liveExpandedId)
  }, [liveExpandedId])

  function xToTime(clientX) {
    const el = lanesRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / pps)
  }
  function trackUnderPointer(clientX, clientY) {
    const stack = document.elementsFromPoint(clientX, clientY)
    for (const node of stack) {
      const lane = node.closest?.('.ed-lane')
      if (lane) return lane.getAttribute('data-track')
    }
    return null
  }

  // Las pistas mandan el scroll vertical; las cabeceras copian (A1/A2 si no, se recortan).
  useEffect(() => {
    const lanes = lanesRef.current
    const headers = headersRef.current
    if (!lanes || !headers) return
    const matchPad = () => {
      headers.style.paddingBottom = `${headerScrollPad(lanes.offsetHeight, lanes.clientHeight)}px`
    }
    const follow = () => { headers.scrollTop = lanes.scrollTop }
    matchPad()
    follow()
    lanes.addEventListener('scroll', follow)
    const ro = new ResizeObserver(() => { matchPad(); follow() })
    ro.observe(lanes)
    return () => {
      lanes.removeEventListener('scroll', follow)
      ro.disconnect()
    }
  }, [rows.length, rowH])

  useEffect(() => {
    const el = lanesRef.current
    if (!el) return
    let raf = 0
    const sync = () => {
      setScrollX(el.scrollLeft)
      setViewW(el.clientWidth)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; sync() })
    }
    sync()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [rows.length])

  useEffect(() => {
    const w = lanesRef.current?.clientWidth || viewW
    setPps((p) => clampPps(p, duration, w, fps))
  }, [duration, fps])

  // Rueda: zoom solo sobre la regla; en pistas, scroll vertical. ctrl=alto; shift=horizontal.
  useEffect(() => {
    const body = bodyRef.current
    const scroll = lanesRef.current
    if (!body || !scroll) return
    const onWheel = (e) => {
      const overRuler = !!e.target?.closest?.('.ed-ruler')
      const action = timelineWheelAction(e, { overRuler })
      if (action === 'scrollY') {
        e.preventDefault()
        scroll.scrollTop += e.deltaY
        return
      }
      e.preventDefault()
      if (action === 'rowHeight') {
        setRowH((h) => clamp(Math.round(h * (e.deltaY < 0 ? 1.1 : 0.9)), 34, 120))
        return
      }
      if (action === 'scrollX') { scroll.scrollLeft += e.deltaY; return }
      const t = xToTime(e.clientX)
      const w = scroll.clientWidth || viewW
      setPps((p) => {
        const np = clampPps(e.deltaY < 0 ? p * 1.2 : p / 1.2, duration, w, fps)
        requestAnimationFrame(() => {
          const rect = scroll.getBoundingClientRect()
          scroll.scrollLeft = t * np - (e.clientX - rect.left)
        })
        return np
      })
    }
    body.addEventListener('wheel', onWheel, { passive: false })
    return () => body.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pps, duration, fps])

  function onRulerDown(e) {
    setExpandedClusterId(null)
    onSeek(xToTime(e.clientX))
    const move = (ev) => onSeek(xToTime(ev.clientX))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function startClipDrag(e, clip, mode) {
    if (e.button !== 0) return
    e.stopPropagation()
    const home = clips.find((x) => x.id === clip.id)
    const view = viewsByTrack.get(home?.track_id)
    const lay = view?.layouts.get(clip.id)
    if (liveExpandedId && lay?.clusterId && lay.clusterId !== liveExpandedId) {
      setExpandedClusterId(null)
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey) e.preventDefault()
    const track = tracks.find((t) => t.id === clip.track_id)
    if (track?.locked) { onSelectClip?.(clip, e); return }
    const next = onSelectClip?.(clip, e) || { ids: [clip.id] }
    const idSet = new Set(next.ids || [clip.id])
    const origs = clips.filter((c) => idSet.has(c.id)).map((c) => ({ ...c }))
    const startX = e.clientX
    const waitDrag = !!(e.ctrlKey || e.metaKey || e.shiftKey)
    const movingIds = mode === 'move' && origs.length > 1 ? new Set(origs.map((c) => c.id)) : new Set([clip.id])
    const others = alignOthers(clips, movingIds)
    drag.current = { mode, startX, orig: { ...clip }, origs, waitDrag, others }
    const thresh = () => alignThresholdSec(pps)
    const previewTrim = (deltaT, doSnap) => {
      const which = mode === 'trim-left' ? 'start' : 'end'
      const snapped = doSnap ? snapClipTrim(clip, mode, deltaT, others, thresh()) : null
      const patch = snapped?.patch || trimClipPatch(clip, mode, deltaT)
      if (!patch) return
      const usedDelta = snapped ? snapped.deltaT : deltaT
      onMutateClip(clip.id, patch)
      const t = trimPreviewHead(clip, mode, usedDelta)
      if (t != null) (onScrub || onSeek)?.(t)
      setTrimGuide({ t: t ?? clip.start, dur: clipDur({ ...clip, ...patch }) })
      setAlignTimes(snapped?.times ?? timelineAlignHits([asAlignClip({ ...clip, ...patch })], others, thresh(), which))
    }
    if (mode === 'trim-left' || mode === 'trim-right') previewTrim(0, false)
    const move = (ev) => {
      const d = drag.current
      if (!d) return
      if (d.waitDrag && Math.abs(ev.clientX - d.startX) < 5) return
      d.waitDrag = false
      const deltaT = (ev.clientX - d.startX) / pps
      const o = d.orig
      if (d.mode === 'move') {
        if (d.origs.length > 1 && onMoveGroup) {
          const snapped = snapClipGroup(d.origs, deltaT, d.others, thresh())
          onMoveGroup(d.origs, snapped.deltaT)
          setAlignTimes(snapped.times)
          return
        }
        const tid = trackUnderPointer(ev.clientX, ev.clientY)
        let trackId = o.track_id
        if (tid && tid !== o.track_id) {
          const tt = tracks.find((t) => t.id === tid)
          if (tt && trackKindForClip(o.kind) === tt.kind && !tt.locked) trackId = tid
        }
        const snapped = snapClipMove(o, deltaT, d.others, thresh(), trackId)
        const patch = { start: snapped.start }
        if (trackId !== o.track_id) patch.track_id = trackId
        onMutateClip(o.id, patch)
        setAlignTimes(snapped.times)
      } else if (d.mode === 'trim-left' || d.mode === 'trim-right') {
        previewTrim(deltaT, true)
      }
    }
    const up = () => {
      drag.current = null
      setTrimGuide(null)
      setAlignTimes(null)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function startKfDrag(e, clip, kf, idx) {
    e.stopPropagation()
    onSelectKf(kf.id)
    const startX = e.clientX
    const orig = kf.t
    const move = (ev) => {
      const deltaT = (ev.clientX - startX) / pps
      const dur = clipDur(clip)
      const nt = clip.keyframes?.enabled
        ? clamp(orig + deltaT, 0, dur)
        : clamp(orig + deltaT, clip.in_point, clip.out_point)
      onMoveKeyframe(clip.id, kf.id, snapToFrame(nt, fps))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function onLaneDragOver(e, track) {
    if (!dragKind || laneKindFor(dragKind) !== track.kind) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHint({ trackId: track.id, time: xToTime(e.clientX) })
  }
  function onLaneDrop(e, track) {
    e.preventDefault()
    setDropHint(null)
    const raw = e.dataTransfer.getData('application/x-material')
    if (!raw) return
    let payload
    try { payload = JSON.parse(raw) } catch { return }
    if (laneKindFor(payload.asset_kind) !== track.kind) return
    onDropAsset(payload, track.id, xToTime(e.clientX))
  }

  return (
    <div className="ed-timeline-wrap" style={{ '--ed-row-h': `${rowH}px` }}>
      <div className="ed-tl-toolbar">
        <div className="ed-tl-tools-left">
          <button className="ghost small" onClick={() => onSplit(selectedClipId, playhead)} disabled={!selectedIds.length} title="Dividir en el cursor (S)">
            <Icon name="content_cut" size={15} /> Dividir
          </button>
          <button className="ghost small" onClick={() => onDuplicate?.()} disabled={!selectedIds.length} title="Duplicar en una pista nueva">
            <Icon name="content_copy" size={15} /> Duplicar
          </button>
          <button className="ghost small danger" onClick={() => onDeleteClip(selectedClipId)} disabled={!selectedIds.length} title="Eliminar clip (Supr)">
            <Icon name="delete" size={15} /> Eliminar
          </button>
          {onFaceTrack && (
            <FaceTrackButton onPick={onFaceTrack} disabled={faceTrackDisabled} busy={faceTrackBusy} />
          )}
          <span className="ed-tl-sep" />
          <PreviewVolButton value={previewVol} onChange={onPreviewVol} />
          {selKfId != null && (
            <>
              <span className="ed-tl-sep" />
              <button className="ghost small" onClick={onDeleteKf} title="Eliminar keyframe seleccionado">
                <Icon name="wrong_location" size={15} /> Quitar
              </button>
            </>
          )}
        </div>
        <div className="ed-tl-tools-right">
          <button className="ghost small" onClick={() => onMatchDuration?.()} disabled={selectedIds.length < 2} title="Copiar el rango de tiempo del primer clip (mismo inicio y mismo fin). Cada uno se queda en su pista. Un vídeo o audio no se alarga más que su fuente.">
            <Icon name="straighten" size={15} /> Igualar
          </button>
          <span className="ed-tl-sep" />
          <button className="ghost small" onClick={() => onAddTrack('video')} title="Añadir pista de vídeo"><Icon name="add" size={14} /> V</button>
          <button className="ghost small" onClick={() => onAddTrack('audio')} title="Añadir pista de audio"><Icon name="add" size={14} /> A</button>
          <button className="ghost small" onClick={onAddTextTrack} title="Añadir pista de texto"><Icon name="add" size={14} /> Texto</button>
          <span className="ed-zoom">
            <button className="icon-btn" onClick={() => setPps((p) => clampPps(p / 1.4, duration, viewW, fps))} title="Alejar"><Icon name="zoom_out" size={17} /></button>
            <button className="icon-btn" onClick={() => setPps((p) => clampPps(p * 1.4, duration, viewW, fps))} title="Acercar"><Icon name="zoom_in" size={17} /></button>
          </span>
        </div>
      </div>

      <div className="ed-tl-body" ref={bodyRef}>
        <div className="ed-tl-headers" ref={headersRef}>
          <div className="ed-ruler-corner">{fmtRuler(playhead, { step: rulerStep, fps, long: rulerLong })}</div>
          {rows.map((t) => {
            const view = viewsByTrack.get(t.id)
            const vh = view.height
            const partner = linkedPartnerName(t, tracks)
            const picking = !!linkPick
            const isTarget = picking && t.kind === 'text'
            const isSource = picking && t.id === linkPick
            return (
              <div key={t.id}
                className={`ed-track-head ${t.kind} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''} ${vh > rowH ? 'stack-open' : ''}${isTarget ? ' link-target' : ''}${isSource ? ' link-source' : ''}`}
                style={{ height: vh, minHeight: vh, maxHeight: vh }}
                onPointerDown={() => {
                  if (!picking) return
                  if (t.kind === 'text') onPickLinkTrack?.(t)
                  else onCancelLinkPick?.()
                }}
                onClick={() => {
                  if (picking) return
                  onSelectTrack(t.id)
                }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextTrack?.(e, t) }}>
                {partner && (
                  <span className="ed-th-link" title={`Relacionada con ${partner}`}>
                    <Icon name="link" size={11} /> {partner}
                  </span>
                )}
                <span className="ed-th-name">{t.name}</span>
                <span className="ed-th-btns">
                  <button className={`ed-th-btn ${t.hidden ? 'off' : ''}`} title="Visibilidad"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackToggle(t.id, 'hidden') }} disabled={t.kind === 'audio'}>
                    <Icon name={t.hidden ? 'visibility_off' : 'visibility'} size={14} />
                  </button>
                  <button className={`ed-th-btn ${t.muted ? 'off' : ''}`} title="Silenciar"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackToggle(t.id, 'muted') }} disabled={t.kind === 'text'}>
                    <Icon name={t.muted ? 'volume_off' : 'volume_up'} size={14} />
                  </button>
                  <button className="ed-th-btn" title="Juntar clips al inicio (sin huecos ni solapes)"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackCompact(t.id) }} disabled={t.locked}>
                    <Icon name="compress" size={14} />
                  </button>
                  <button className={`ed-th-btn ${t.locked ? 'on' : ''}`} title="Bloquear"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackToggle(t.id, 'locked') }}>
                    <Icon name={t.locked ? 'lock' : 'lock_open'} size={14} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>

        <div className="ed-tl-scroll" ref={lanesRef}>
          <div className="ed-tl-inner" style={{ width: totalW }}>
            <div className={`ed-ruler${trimGuide ? ' live' : ''}`} title="Rueda: zoom de tiempo" onPointerDown={onRulerDown}>
              {buildTicks(duration + 4, pps, { fps, dense: !!trimGuide, scrollX, viewW }).map((tk) => (
                <span key={`${tk.minor ? 'm' : 'M'}-${tk.t}`} className={`ed-tick${tk.minor ? ' minor' : ''}`} style={{ left: tk.t * pps }}><i />{tk.major ? <em>{fmtRuler(tk.t, { step: tk.step, fps, long: rulerLong })}</em> : null}</span>
              ))}
              {trimGuide && (
                <span className="ed-trim-chip" style={{ left: trimGuide.t * pps }}>
                  {fmtRuler(trimGuide.t, { step: rulerStep, fps, long: rulerLong })}
                  <em>{fmt(trimGuide.dur)}</em>
                </span>
              )}
            </div>

            {rows.map((t) => {
              const view = viewsByTrack.get(t.id)
              const vh = view.height
              return (
                <div key={t.id}
                  className={`ed-lane ${t.kind} ${t.locked ? 'locked' : ''} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''} ${vh > rowH ? 'stack-open' : ''}${linkPick && t.kind === 'text' ? ' link-target' : ''}${linkPick && t.id === linkPick ? ' link-source' : ''}`}
                  style={{ height: vh, minHeight: vh }}
                  data-track={t.id}
                  onPointerDown={(e) => {
                    if (linkPick) {
                      if (t.kind === 'text') onPickLinkTrack?.(t)
                      else onCancelLinkPick?.()
                      return
                    }
                    onSelectTrack(t.id)
                    if (e.target === e.currentTarget) setExpandedClusterId(null)
                  }}
                  onDragOver={(e) => onLaneDragOver(e, t)}
                  onDragLeave={() => setDropHint((h) => (h?.trackId === t.id ? null : h))}
                  onDrop={(e) => onLaneDrop(e, t)}>
                  {clips.filter((c) => c.track_id === t.id).map((c) => {
                    const lay = view.layouts.get(c.id)
                    if (!lay || lay.variant === 'hidden') return null
                    return (
                      <ClipBlock key={c.id} clip={c} pps={pps} layout={lay} fps={fps}
                        selected={selectedIds.includes(c.id)} selKfId={selKfId}
                        onDown={(e, mode) => startClipDrag(e, c, mode)}
                        onKfDown={(e, kf, idx) => startKfDrag(e, c, kf, idx)}
                        onContext={(e) => onContextClip?.(e, c)}
                        onDouble={() => onDoubleClip?.(c)} />
                    )
                  })}
                  {view.toggle && (
                    <button type="button" className="ed-stack-toggle"
                      data-cluster-id={view.toggle.clusterId}
                      style={{ left: view.toggle.start * pps, top: 2 }}
                      title="Cerrar pila"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setExpandedClusterId(null) }}>
                      <Icon name="expand_less" size={14} />
                    </button>
                  )}
                  {dropHint?.trackId === t.id && dragInfo && (
                    <div className="ed-drop-ghost" style={{ left: dropHint.time * pps, width: Math.max(20, (dragInfo.duration || 1) * pps) }}>
                      <span>{dragInfo.name}</span>
                    </div>
                  )}
                </div>
              )
            })}

            {(alignTimes || []).map((t) => (
              <div key={t} className="ed-align-guide" style={{ left: t * pps }} aria-hidden="true" />
            ))}
            <div className="ed-playhead" style={{ left: playhead * pps }}><span className="ed-playhead-knob" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClipBlock({ clip, pps, layout, selected, selKfId, onDown, onKfDown, onContext, onDouble, fps = 30 }) {
  const dur = clipDur(clip)
  const srcDur = clipSourceDur(clip)
  const sp = clipSpeed(clip)
  const w = Math.max(6, dur * pps)
  const left = clip.start * pps
  const isVideo = isVisualClip(clip)
  const isText = clip.kind === 'text'
  const animKfs = keyframesEnabled(clip) ? normalizeItems(clip.keyframes.items) : null
  const kfs = animKfs || (isVideo ? [...(clip.reframe?.keyframes || [])].sort((a, b) => a.t - b.t) : [])
  const bars = clip.kind === 'audio' ? pseudoWaveform(clip.asset_id, Math.max(16, Math.round(w / 5))) : null
  const speedBadge = !isText && sp !== 1 ? (
    <em className="ed-clip-speed">{sp % 1 === 0 ? `${sp}x` : `${sp.toFixed(1)}x`}</em>
  ) : null

  return (
    <div className={`ed-clip ${clip.kind} ${layout.variant !== 'solo' ? layout.variant : ''} ${selected ? 'sel' : ''} ${clip.muted ? 'muted' : ''}`}
      style={{ left, width: w, top: layout.top, height: layout.height, zIndex: layout.z }}
      title={clip.name}
      data-cluster-id={layout.clusterId || undefined}
      onPointerDown={(e) => onDown(e, 'move')}
      onContextMenu={onContext} onDoubleClick={onDouble}>
      <div className="ed-clip-handle left" onPointerDown={(e) => onDown(e, 'trim-left')} />
      <div className="ed-clip-handle right" onPointerDown={(e) => onDown(e, 'trim-right')} />

      {isVideo && <div className="ed-clip-label"><Icon name={clip.kind === 'image' ? 'image' : (clip.muted ? 'volume_off' : 'movie')} size={12} /> {clip.name}{speedBadge}</div>}
      {isText && <div className="ed-clip-label"><Icon name="title" size={12} /> {clip.text || clip.name}</div>}
      {clip.kind === 'shape' && <div className="ed-clip-label"><Icon name="category" size={12} /> {clip.name}</div>}
      {clip.kind === 'audio' && (
        <div className="ed-clip-wave">
          {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
          <span className="ed-clip-label audio"><Icon name={clip.muted ? 'volume_off' : 'graphic_eq'} size={12} /> {clip.name}{speedBadge}</span>
        </div>
      )}

      {selected && kfs.map((k, i) => {
        const kl = animKfs
          ? (k.t / (dur || 1)) * w
          : ((k.t - clip.in_point) / (srcDur || 1)) * w
        if (kl < -3 || kl > w + 3) return null
        const hold = (k.interpolation === 'hold' || k.pan_mode === 'direct')
        return (
          <span key={k.id || i} className={`ed-kf-dot ${hold ? 'direct' : ''} ${k.id === selKfId ? 'sel' : ''}`}
            style={{ left: kl, background: kfColor(i) }}
            title={`Keyframe ${i + 1} · ${fmtRuler(animKfs ? k.t : k.t - clip.in_point, { step: 1 / Math.max(fps, 1), fps })}`}
            onPointerDown={(e) => { e.stopPropagation(); onKfDown(e, k, i) }}>{i + 1}</span>
        )
      })}
    </div>
  )
}
