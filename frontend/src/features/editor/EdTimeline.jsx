import { useRef, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipPopover from '../../components/FlipPopover'
import { fmt } from '../../lib/utils'
import { pseudoWaveform, clamp, kfColor } from '../../lib/panning'
import { clipDur, clipSourceDur, clipSpeed, displayTracks, isGeneratedDurationClip, isVisualClip, laneKindForAsset, resizeGeneratedClip, trackKindForClip } from './editorModel'
import { stackViewForTrack } from './clipStack.js'
import { headerScrollPad, timelineWheelAction } from './timelineWheel'

const MIN_DUR = 0.15

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

const laneKindFor = laneKindForAsset

export default function EdTimeline({
  tracks, clips, pps, setPps, duration, playhead, rowH, setRowH,
  selectedClipId, selectedClipIds, selectedTrackId, selectedClip, selKfId, dragInfo,
  onSeek, onSelectClip, onSelectTrack, onDoubleClip, onMutateClip, onMoveGroup, onSplit, onDeleteClip,
  previewVol, onPreviewVol,
  onDropAsset, onTrackToggle, onTrackCompact, onAddTrack, onAddTextTrack, onMoveKeyframe, onSelectKf, onAddKf, onDeleteKf, onContextClip, onContextTrack,
}) {
  const lanesRef = useRef(null)
  const bodyRef = useRef(null)
  const headersRef = useRef(null)
  const drag = useRef(null)
  const [dropHint, setDropHint] = useState(null)   // { trackId, time }
  const [expandedClusterId, setExpandedClusterId] = useState(null)

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
      setPps((p) => {
        const np = clamp(e.deltaY < 0 ? p * 1.15 : p / 1.15, 8, 500)
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
  }, [pps])

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
    drag.current = { mode, startX, orig: { ...clip }, origs, waitDrag }
    const move = (ev) => {
      const d = drag.current
      if (!d) return
      if (d.waitDrag && Math.abs(ev.clientX - d.startX) < 5) return
      d.waitDrag = false
      const deltaT = (ev.clientX - d.startX) / pps
      const o = d.orig
      if (d.mode === 'move') {
        if (d.origs.length > 1 && onMoveGroup) {
          onMoveGroup(d.origs, deltaT)
          return
        }
        const ns = Math.max(0, o.start + deltaT)
        const patch = { start: +ns.toFixed(3) }
        const tid = trackUnderPointer(ev.clientX, ev.clientY)
        if (tid && tid !== o.track_id) {
          const tt = tracks.find((t) => t.id === tid)
          if (tt && trackKindForClip(o.kind) === tt.kind && !tt.locked) patch.track_id = tid
        }
        onMutateClip(o.id, patch)
      } else if (isGeneratedDurationClip(o) && (d.mode === 'trim-left' || d.mode === 'trim-right')) {
        onMutateClip(o.id, resizeGeneratedClip(o, d.mode, deltaT))
      } else if (d.mode === 'trim-left') {
        const sp = clipSpeed(o)
        const minSrc = MIN_DUR * sp
        const ni = clamp(o.in_point + deltaT * sp, 0, o.out_point - minSrc)
        const ns = Math.max(0, o.start + (ni - o.in_point) / sp)
        onMutateClip(o.id, { in_point: +ni.toFixed(3), start: +ns.toFixed(3) })
      } else if (d.mode === 'trim-right') {
        const sp = clipSpeed(o)
        const minSrc = MIN_DUR * sp
        const maxOut = o.source_duration > 0 ? o.source_duration : o.out_point + 3600
        const no = clamp(o.out_point + deltaT * sp, o.in_point + minSrc, maxOut)
        onMutateClip(o.id, { out_point: +no.toFixed(3) })
      }
    }
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function startKfDrag(e, clip, kf, idx) {
    e.stopPropagation()
    onSelectKf(kf.id)
    const startX = e.clientX
    const orig = kf.t
    const move = (ev) => {
      const deltaT = (ev.clientX - startX) / pps
      const nt = clamp(orig + deltaT, clip.in_point, clip.out_point)
      onMoveKeyframe(clip.id, idx, +nt.toFixed(3))
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
          <button className="ghost small danger" onClick={() => onDeleteClip(selectedClipId)} disabled={!selectedIds.length} title="Eliminar clip (Supr)">
            <Icon name="delete" size={15} /> Eliminar
          </button>
          <span className="ed-tl-sep" />
          <PreviewVolButton value={previewVol} onChange={onPreviewVol} />
          {isVideoSel && (
            <>
              <span className="ed-tl-sep" />
              <button className="ghost small" onClick={onAddKf} title="Añadir encuadre en el cursor">
                <Icon name="add_location_alt" size={15} /> Encuadre
              </button>
              <button className="ghost small" onClick={onDeleteKf} disabled={selKfId == null} title="Eliminar encuadre seleccionado">
                <Icon name="wrong_location" size={15} /> Quitar
              </button>
            </>
          )}
        </div>
        <div className="ed-tl-tools-right">
          <button className="ghost small" onClick={() => onAddTrack('video')} title="Añadir pista de vídeo"><Icon name="add" size={14} /> V</button>
          <button className="ghost small" onClick={() => onAddTrack('audio')} title="Añadir pista de audio"><Icon name="add" size={14} /> A</button>
          <button className="ghost small" onClick={onAddTextTrack} title="Añadir pista de texto"><Icon name="add" size={14} /> Texto</button>
          <span className="ed-zoom">
            <button className="icon-btn" onClick={() => setPps((p) => Math.max(8, p / 1.4))} title="Alejar"><Icon name="zoom_out" size={17} /></button>
            <button className="icon-btn" onClick={() => setPps((p) => Math.min(500, p * 1.4))} title="Acercar"><Icon name="zoom_in" size={17} /></button>
          </span>
        </div>
      </div>

      <div className="ed-tl-body" ref={bodyRef}>
        <div className="ed-tl-headers" ref={headersRef}>
          <div className="ed-ruler-corner">{fmt(playhead)}</div>
          {rows.map((t) => {
            const view = viewsByTrack.get(t.id)
            const vh = view.height
            return (
              <div key={t.id}
                className={`ed-track-head ${t.kind} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''} ${vh > rowH ? 'stack-open' : ''}`}
                style={{ height: vh, minHeight: vh, maxHeight: vh }}
                onClick={() => onSelectTrack(t.id)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextTrack?.(e, t) }}>
                <span className="ed-th-name">{t.name}</span>
                <span className="ed-th-btns">
                  <button className={`ed-th-btn ${t.hidden ? 'off' : ''}`} title="Visibilidad"
                    onClick={(e) => { e.stopPropagation(); onTrackToggle(t.id, 'hidden') }} disabled={t.kind === 'audio'}>
                    <Icon name={t.hidden ? 'visibility_off' : 'visibility'} size={14} />
                  </button>
                  <button className={`ed-th-btn ${t.muted ? 'off' : ''}`} title="Silenciar"
                    onClick={(e) => { e.stopPropagation(); onTrackToggle(t.id, 'muted') }} disabled={t.kind === 'text'}>
                    <Icon name={t.muted ? 'volume_off' : 'volume_up'} size={14} />
                  </button>
                  <button className="ed-th-btn" title="Juntar clips (sin huecos ni solapes)"
                    onClick={(e) => { e.stopPropagation(); onTrackCompact(t.id) }} disabled={t.locked}>
                    <Icon name="compress" size={14} />
                  </button>
                  <button className={`ed-th-btn ${t.locked ? 'on' : ''}`} title="Bloquear"
                    onClick={(e) => { e.stopPropagation(); onTrackToggle(t.id, 'locked') }}>
                    <Icon name={t.locked ? 'lock' : 'lock_open'} size={14} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>

        <div className="ed-tl-scroll" ref={lanesRef}>
          <div className="ed-tl-inner" style={{ width: totalW }}>
            <div className="ed-ruler" title="Rueda: zoom de tiempo" onPointerDown={onRulerDown}>
              {buildTicks(duration + 4, pps).map((tk) => (
                <span key={tk.t} className="ed-tick" style={{ left: tk.t * pps }}><i />{tk.major ? <em>{fmt(tk.t)}</em> : null}</span>
              ))}
            </div>

            {rows.map((t) => {
              const view = viewsByTrack.get(t.id)
              const vh = view.height
              return (
                <div key={t.id}
                  className={`ed-lane ${t.kind} ${t.locked ? 'locked' : ''} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''} ${vh > rowH ? 'stack-open' : ''}`}
                  style={{ height: vh, minHeight: vh }}
                  data-track={t.id}
                  onPointerDown={(e) => {
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
                      <ClipBlock key={c.id} clip={c} pps={pps} layout={lay}
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

            <div className="ed-playhead" style={{ left: playhead * pps }}><span className="ed-playhead-knob" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClipBlock({ clip, pps, layout, selected, selKfId, onDown, onKfDown, onContext, onDouble }) {
  const dur = clipDur(clip)
  const srcDur = clipSourceDur(clip)
  const sp = clipSpeed(clip)
  const w = Math.max(6, dur * pps)
  const left = clip.start * pps
  const isVideo = isVisualClip(clip)
  const isText = clip.kind === 'text'
  const kfs = isVideo ? [...(clip.reframe?.keyframes || [])].sort((a, b) => a.t - b.t) : []
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
      {clip.kind === 'audio' && (
        <div className="ed-clip-wave">
          {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
          <span className="ed-clip-label audio"><Icon name={clip.muted ? 'volume_off' : 'graphic_eq'} size={12} /> {clip.name}{speedBadge}</span>
        </div>
      )}

      {selected && isVideo && kfs.map((k, i) => {
        const kl = ((k.t - clip.in_point) / (srcDur || 1)) * w
        if (kl < -3 || kl > w + 3) return null
        return (
          <span key={k.id || i} className={`ed-kf-dot ${k.pan_mode === 'direct' ? 'direct' : ''} ${k.id === selKfId ? 'sel' : ''}`}
            style={{ left: kl, background: kfColor(i) }} title={`${k.pan_mode === 'direct' ? 'Directo' : 'Suave'} · ${fmt(k.t - clip.in_point)}`}
            onPointerDown={(e) => { e.stopPropagation(); onKfDown(e, k, i) }} />
        )
      })}
    </div>
  )
}

function buildTicks(maxT, pps) {
  const targetPx = 90
  const rawStep = targetPx / pps
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const step = steps.find((s) => s >= rawStep) || 600
  const ticks = []
  for (let t = 0; t <= maxT; t += step) ticks.push({ t: +t.toFixed(2), major: true })
  return ticks
}
