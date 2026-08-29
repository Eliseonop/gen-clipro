import { useRef, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { pseudoWaveform, clamp, kfColor } from '../../lib/panning'
import { clipDur, displayTracks } from './editorModel'

const MIN_DUR = 0.15

const laneKindFor = (assetKind) => (assetKind === 'clips' || assetKind === 'video' ? 'video' : 'audio')

export default function EdTimeline({
  tracks, clips, pps, setPps, duration, playhead, rowH, setRowH,
  selectedClipId, selectedTrackId, selectedClip, selKfId, dragInfo,
  onSeek, onSelectClip, onSelectTrack, onDoubleClip, onMutateClip, onSplit, onDeleteClip,
  onDropAsset, onTrackToggle, onTrackCompact, onAddTrack, onAddTextTrack, onMoveKeyframe, onSelectKf, onAddKf, onDeleteKf, onContextClip,
}) {
  const lanesRef = useRef(null)
  const bodyRef = useRef(null)
  const drag = useRef(null)
  const [dropHint, setDropHint] = useState(null)   // { trackId, time }

  const rows = displayTracks(tracks)
  const totalW = Math.max(duration + 4, 12) * pps
  const isVideoSel = selectedClip?.kind === 'video'
  const dragKind = dragInfo?.kind || null

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

  // --- Rueda: zoom temporal (anclado al cursor); ctrl=alto de pista; shift=scroll ---
  useEffect(() => {
    const body = bodyRef.current
    const scroll = lanesRef.current
    if (!body || !scroll) return
    const onWheel = (e) => {
      e.preventDefault()
      if (e.ctrlKey) {
        setRowH((h) => clamp(Math.round(h * (e.deltaY < 0 ? 1.1 : 0.9)), 34, 120))
        return
      }
      if (e.shiftKey) { scroll.scrollLeft += e.deltaY; return }
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
    onSeek(xToTime(e.clientX))
    const move = (ev) => onSeek(xToTime(ev.clientX))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function startClipDrag(e, clip, mode) {
    if (e.button !== 0) return
    e.stopPropagation()
    const track = tracks.find((t) => t.id === clip.track_id)
    if (track?.locked) { onSelectClip(clip.id); return }
    onSelectClip(clip.id)
    const startX = e.clientX
    drag.current = { mode, startX, orig: { ...clip } }
    const move = (ev) => {
      const d = drag.current
      if (!d) return
      const deltaT = (ev.clientX - d.startX) / pps
      const o = d.orig
      if (d.mode === 'move') {
        const ns = Math.max(0, o.start + deltaT)
        const patch = { start: +ns.toFixed(3) }
        const tid = trackUnderPointer(ev.clientX, ev.clientY)
        if (tid && tid !== o.track_id) {
          const tt = tracks.find((t) => t.id === tid)
          if (tt && tt.kind === o.kind && !tt.locked) patch.track_id = tid
        }
        onMutateClip(o.id, patch)
      } else if (d.mode === 'trim-left') {
        const ni = clamp(o.in_point + deltaT, 0, o.out_point - MIN_DUR)
        const ns = Math.max(0, o.start + (ni - o.in_point))
        onMutateClip(o.id, { in_point: +ni.toFixed(3), start: +ns.toFixed(3) })
      } else if (d.mode === 'trim-right') {
        const maxOut = o.source_duration > 0 ? o.source_duration : o.out_point + 3600
        const no = clamp(o.out_point + deltaT, o.in_point + MIN_DUR, maxOut)
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
          <button className="ghost small" onClick={() => onSplit(selectedClipId, playhead)} disabled={!selectedClipId} title="Dividir en el cursor (S)">
            <Icon name="content_cut" size={15} /> Dividir
          </button>
          <button className="ghost small danger" onClick={() => onDeleteClip(selectedClipId)} disabled={!selectedClipId} title="Eliminar clip (Supr)">
            <Icon name="delete" size={15} /> Eliminar
          </button>
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
        <div className="ed-tl-headers">
          <div className="ed-ruler-corner">{fmt(playhead)}</div>
          {rows.map((t) => (
            <div key={t.id}
              className={`ed-track-head ${t.kind} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''}`}
              onClick={() => onSelectTrack(t.id)}>
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
          ))}
        </div>

        <div className="ed-tl-scroll" ref={lanesRef}>
          <div className="ed-tl-inner" style={{ width: totalW }}>
            <div className="ed-ruler" onPointerDown={onRulerDown}>
              {buildTicks(duration + 4, pps).map((tk) => (
                <span key={tk.t} className="ed-tick" style={{ left: tk.t * pps }}><i />{tk.major ? <em>{fmt(tk.t)}</em> : null}</span>
              ))}
            </div>

            {rows.map((t) => (
              <div key={t.id}
                className={`ed-lane ${t.kind} ${t.locked ? 'locked' : ''} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''}`}
                data-track={t.id}
                onPointerDown={() => onSelectTrack(t.id)}
                onDragOver={(e) => onLaneDragOver(e, t)}
                onDragLeave={() => setDropHint((h) => (h?.trackId === t.id ? null : h))}
                onDrop={(e) => onLaneDrop(e, t)}>
                {clips.filter((c) => c.track_id === t.id).map((c) => (
                  <ClipBlock key={c.id} clip={c} pps={pps}
                    selected={c.id === selectedClipId} selKfId={selKfId}
                    onDown={(e, mode) => startClipDrag(e, c, mode)}
                    onKfDown={(e, kf, idx) => startKfDrag(e, c, kf, idx)}
                    onContext={(e) => onContextClip?.(e, c)}
                    onDouble={() => onDoubleClip?.(c)} />
                ))}
                {dropHint?.trackId === t.id && dragInfo && (
                  <div className="ed-drop-ghost" style={{ left: dropHint.time * pps, width: Math.max(20, (dragInfo.duration || 1) * pps) }}>
                    <span>{dragInfo.name}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="ed-playhead" style={{ left: playhead * pps }}><span className="ed-playhead-knob" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClipBlock({ clip, pps, selected, selKfId, onDown, onKfDown, onContext, onDouble }) {
  const dur = clipDur(clip)
  const w = Math.max(6, dur * pps)
  const left = clip.start * pps
  const isVideo = clip.kind === 'video'
  const isText = clip.kind === 'text'
  const kfs = isVideo ? [...(clip.reframe?.keyframes || [])].sort((a, b) => a.t - b.t) : []
  const bars = clip.kind === 'audio' ? pseudoWaveform(clip.asset_id, Math.max(16, Math.round(w / 5))) : null

  return (
    <div className={`ed-clip ${clip.kind} ${selected ? 'sel' : ''}`}
      style={{ left, width: w }} title={clip.name}
      onPointerDown={(e) => onDown(e, 'move')} onContextMenu={onContext} onDoubleClick={onDouble}>
      <div className="ed-clip-handle left" onPointerDown={(e) => onDown(e, 'trim-left')} />
      <div className="ed-clip-handle right" onPointerDown={(e) => onDown(e, 'trim-right')} />

      {isVideo && <div className="ed-clip-label"><Icon name="movie" size={12} /> {clip.name}</div>}
      {isText && <div className="ed-clip-label"><Icon name="title" size={12} /> {clip.text || clip.name}</div>}
      {clip.kind === 'audio' && (
        <div className="ed-clip-wave">
          {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
          <span className="ed-clip-label audio"><Icon name="graphic_eq" size={12} /> {clip.name}</span>
        </div>
      )}

      {selected && isVideo && kfs.map((k, i) => {
        const kl = ((k.t - clip.in_point) / (dur || 1)) * w
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
