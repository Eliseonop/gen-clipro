import { useRef, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipPopover from '../../components/FlipPopover'
import { fmt } from '../../lib/utils'
import { pseudoWaveform, clamp, kfColor } from '../../lib/panning'
import { TRACK_NAME_MAX, clampStartNoOverlap, clampTrimDelta, clipCopyText, clipDur, clipSourceDur, clipSpeed, displayTracks, isVisualClip, laneKindForAsset, linkedPartnerName, shortTrackName, trackKindForClip, trimClipPatch, trimPreviewHead } from './editorModel'
import { alignOthers, alignThresholdSec, asAlignClip, snapClipGroup, snapClipMove, snapClipTrim, timelineAlignHits } from './timelineAlign'
import { keyframesEnabled, normalizeItems, clipVolumeAt, clampVolume, sampleVolumeCurve, VOL_MAX, hasVolumeControls } from '../../lib/clipKeyframes'
import { snapToFrame } from '../../lib/projectFps'
import { clipBeatTimes, snapTargets } from '../../lib/beats'
import { stackViewForTrack } from './clipStack.js'
import { stepRowHeight, trackRowHeight } from './trackRows'
import { dropIntent, insertEdge, insertSlot, slotBoundary } from './dropIntent'
import { headerScrollPad, timelineWheelAction } from './timelineWheel'
import { anchorScroll, buildTicks, clampPps, fmtRuler, tickStep, zoomByDrag } from './timelineScale'
import { isStackTrack } from './trackStack'

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
        <Icon name={icon} size={15} />
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
        <Icon name="auto_fix_high" size={14} />
      </button>
      <FlipPopover open={open} anchorRef={btnRef} onClose={() => setOpen(false)} className="ed-face-track-pop">
        <button type="button" onClick={() => { onPick?.('smooth'); setOpen(false) }}>Suave</button>
        <button type="button" onClick={() => { onPick?.('direct'); setOpen(false) }}>Salto directo</button>
      </FlipPopover>
    </div>
  )
}

const laneKindFor = laneKindForAsset
const NEW_TRACK_LABEL = { text: 'Nueva pista de texto', video: 'Nueva pista de vídeo', audio: 'Nueva pista de audio' }

function TrackName({ track, onRename }) {
  const [draft, setDraft] = useState(null)
  const editing = draft != null

  function commit() {
    const name = (draft ?? '').trim()
    setDraft(null)
    if (name && name !== track.name) onRename?.(track.id, name)
  }

  if (editing) {
    return (
      <input
        className="ed-th-name-input"
        value={draft}
        autoFocus
        maxLength={TRACK_NAME_MAX}
        aria-label="Nombre de la pista"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(null) }
        }}
      />
    )
  }
  return (
    <span
      className="ed-th-name"
      title={`${track.name} — doble clic para renombrar (${TRACK_NAME_MAX} letras)`}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDraft(shortTrackName(track.name))
      }}
    >
      {shortTrackName(track.name)}
    </span>
  )
}

export default function EdTimeline({
  tracks, clips, pps, setPps, duration, playhead, rowH, setRowH, fps = 30, onMoveToNewTrack, onMoveClip,
  selectedClipId, selectedClipIds, selectedTrackId, selKfId, dragInfo,
  onSeek, onScrub, onSelectClip, onSelectTrack, onDoubleClip, onMutateClip, onMoveGroup, onMatchDuration, onSplit, onDuplicate, onCrop, cropDisabled, onFreeze, freezeDisabled, freezeBusy, onDeleteClip,
  previewVol, onPreviewVol,
  onDropAsset, onTrackToggle, onTrackCompact, onAddTrack, onAddTextTrack, onRenameTrack, onReorderTrack, onMoveKeyframe, onSelectKf, onAddKf, onDeleteKf, onContextClip, onContextTrack,
  onFaceTrack, faceTrackBusy, faceTrackDisabled,
  linkPick, onPickLinkTrack, onCancelLinkPick, onCopyDesc, audioMaterials,
  mcpBusyIds, onMarqueeSelect,
  markRange, onContextLane, onSceneDirection, onGenerateResource,
  onMarkChange, onCreateSegment, segmentBusy, segmentLabelText, markKeys = ['I', 'O'],
  markers, onMarkerChange, onToggleMarker,
}) {
  const lanesRef = useRef(null)
  const bodyRef = useRef(null)
  const headersRef = useRef(null)
  const innerRef = useRef(null)
  const drag = useRef(null)
  const [dropHint, setDropHint] = useState(null)   // { trackId, action, start, slot? }
  // Pista nueva anunciada (clip movido o material soltado): { y, kind, start, w, h, src, key }
  const [insertView, setInsertView] = useState(null)
  // Clip movido: fantasma bajo el puntero y dónde caerá. { clip, x, y, w, h, landing }
  const [moveView, setMoveView] = useState(null)
  const [expandedClusterId, setExpandedClusterId] = useState(null)
  const [trimGuide, setTrimGuide] = useState(null) // { t, dur }
  const [alignTimes, setAlignTimes] = useState(null) // number[] mientras se mueve/recorta
  const [scrollX, setScrollX] = useState(0)
  const [viewW, setViewW] = useState(900)
  const [marquee, setMarquee] = useState(null)   // { x, y, w, h } en coords del contenido
  const [trackDrop, setTrackDrop] = useState(null) // { id, targetId, place } al arrastrar una cabecera
  const trackDragged = useRef(false)
  const rulerStep = tickStep(pps, fps, !!trimGuide)
  const rulerLong = duration >= 3600

  const markIn = Number.isFinite(markRange?.in) ? markRange.in : null
  const markOut = Number.isFinite(markRange?.out) ? markRange.out : null

  const rows = displayTracks(tracks)
  const totalW = Math.max(duration + 4, 12) * pps
  const dragKind = dragInfo?.kind || null
  const selectedIds = selectedClipIds?.length ? selectedClipIds : (selectedClipId ? [selectedClipId] : [])
  const viewsByTrack = new Map()
  for (const t of rows) {
    // Cada tipo de pista tiene su alto: la de texto es ~la mitad que vídeo/audio.
    viewsByTrack.set(t.id, stackViewForTrack(clips, t.id, selectedIds, expandedClusterId, trackRowHeight(t.kind, rowH)))
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
  // Pista bajo el puntero y a qué altura de ella está (0 = borde superior).
  function laneUnderPointer(clientX, clientY) {
    for (const node of document.elementsFromPoint(clientX, clientY)) {
      const lane = node.closest?.('.ed-lane')
      if (!lane) continue
      const r = lane.getBoundingClientRect()
      return { id: lane.getAttribute('data-track'), yRatio: r.height ? clamp((clientY - r.top) / r.height, 0, 1) : 0.5, h: r.height }
    }
    return null
  }

  // Línea de pista nueva de `slot` en px del contenido (el hueco entre dos filas).
  // Va en .ed-tl-inner y no dentro de la pista: el hueco del clip la cruza entera.
  function insertViewFor(slot, kind, start, dur, src) {
    const inner = innerRef.current
    const lane = inner && [...inner.querySelectorAll('.ed-lane')].find((el) => el.getAttribute('data-track') === slot.targetId)
    if (!lane) return null
    const r = lane.getBoundingClientRect()
    const y = (slot.place === 'below' ? r.bottom : r.top) - inner.getBoundingClientRect().top
    return {
      y, kind, start, src,
      w: Math.max(6, dur * pps),
      h: Math.round(trackRowHeight(kind, rowH) * 0.62),
      key: `${slotBoundary(tracks, slot)}`,
    }
  }

  /**
   * ¿El puntero se ha salido por arriba o por abajo del bloque de pistas de
   * `kind`? Es la señal de "quiero una pista nueva aquí". Se mide con la
   * geometría real de las calles, así que las alturas distintas dan igual.
   * Devuelve el hueco como insertSlot: encima de la primera o debajo de la última.
   */
  function laneEdgeUnderPointer(clientY, kind) {
    const scroll = lanesRef.current
    if (!scroll) return null
    // Vídeo y texto son un solo bloque (la pila de capas); el audio va aparte.
    const lanes = [...scroll.querySelectorAll(kind === 'audio' ? '.ed-lane.audio' : '.ed-lane.video, .ed-lane.text')]
    if (!lanes.length) return null
    const first = lanes[0]
    const last = lanes[lanes.length - 1]
    if (clientY < first.getBoundingClientRect().top) return { targetId: first.getAttribute('data-track'), place: 'above' }
    if (clientY > last.getBoundingClientRect().bottom) return { targetId: last.getAttribute('data-track'), place: 'below' }
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

  // Rueda: NO hace zoom (el zoom es por arrastre del tirador ↔). En la regla
  // desplaza en horizontal; en las pistas, en vertical. ctrl=alto; shift=horizontal.
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
        setRowH((h) => stepRowHeight(h, e.deltaY))
        return
      }
      // scrollX: la rueda vertical y horizontal desplazan la línea de tiempo.
      scroll.scrollLeft += (e.deltaX || e.deltaY)
    }
    body.addEventListener('wheel', onWheel, { passive: false })
    return () => body.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pps, duration, fps])

  // Regla estilo Filmora: pulsa sobre un punto y ARRASTRA EN HORIZONTAL (cursor ↔)
  // para hacer zoom asistido justo en ese punto. Derecha = acercar, izquierda =
  // alejar. El instante donde pulsaste se queda fijo bajo el cursor. Un clic sin
  // arrastre solo mueve el cabezal a ese punto (sigue funcionando el scrub por clic).
  function onRulerDown(e) {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()   // evita que el arrastre seleccione el texto de las marcas
    setExpandedClusterId(null)
    const scroll = lanesRef.current
    const rect = scroll?.getBoundingClientRect()
    const w = scroll?.clientWidth || viewW
    const anchorScreenX = rect ? e.clientX - rect.left : 0   // px dentro de la vista
    const anchorT = xToTime(e.clientX)                       // instante bajo el cursor
    const startX = e.clientX
    const startPps = pps
    onSeek(anchorT)
    let zooming = false
    const move = (ev) => {
      const dx = ev.clientX - startX
      if (!zooming) {
        if (Math.abs(dx) < 4) return
        zooming = true
        document.body.classList.add('ed-zooming')
      }
      const np = zoomByDrag(startPps, dx, duration, w, fps)
      setPps(np)
      if (scroll) scroll.scrollLeft = anchorScroll(anchorT, np, anchorScreenX)
    }
    const up = () => {
      document.body.classList.remove('ed-zooming')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
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
    const startY = e.clientY
    const waitDrag = !!(e.ctrlKey || e.metaKey || e.shiftKey)
    // Dónde se agarró el clip: el fantasma sigue al puntero con ese desfase.
    const clipBox = (e.currentTarget.closest?.('.ed-clip') || e.currentTarget).getBoundingClientRect()
    const grab = { dx: e.clientX - clipBox.left, dy: e.clientY - clipBox.top, w: clipBox.width, h: clipBox.height }
    const originAlone = clips.filter((c) => c.track_id === clip.track_id).length === 1
    const movingIds = mode === 'move' && origs.length > 1 ? new Set(origs.map((c) => c.id)) : new Set([clip.id])
    // Imán: bordes de otras pistas + marcadores y beats (#12). Al mover no cuentan
    // los beats de los clips que se mueven; al recortar sí (no se desplazan).
    const others = [
      ...alignOthers(clips, movingIds),
      ...snapTargets(markers, clips, mode === 'move' ? movingIds : []),
    ]
    drag.current = { mode, startX, startY, orig: { ...clip }, origs, waitDrag, others, trackId: clip.track_id }
    const thresh = () => alignThresholdSec(pps)
    const previewTrim = (rawDelta, doSnap) => {
      const which = mode === 'trim-left' ? 'start' : 'end'
      // El borde se para en el vecino: estirar un clip tampoco puede montarlo.
      const deltaT = clampTrimDelta(clips, clip, mode, rawDelta)
      const snap = doSnap ? snapClipTrim(clip, mode, deltaT, others, thresh()) : null
      // …y el imán de alineación tampoco puede saltárselo.
      const snapped = snap && clampTrimDelta(clips, clip, mode, snap.deltaT) === snap.deltaT ? snap : null
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
        // Como CapCut: el clip se levanta y va bajo el puntero (fantasma); un
        // hueco gris marca dónde caerá. Nada cambia hasta soltar.
        if (!d.moving) {
          if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 3) return
          d.moving = true
        }
        const kind = trackKindForClip(o.kind)
        // Manda el CENTRO del fantasma, no el puntero: agarrarlo por la etiqueta
        // (arriba) no pide pista nueva al primer movimiento.
        const centerY = ev.clientY - grab.dy + grab.h / 2
        const lane = laneUnderPointer(ev.clientX, centerY)
        // Pista nueva: sobre una pista que no es de su tipo (un texto sobre un
        // vídeo), en el borde entre dos pistas, o fuera de ellas por encima o
        // por debajo del bloque. La pista se crea al soltar.
        let slot = null
        if (onMoveToNewTrack) {
          slot = lane
            ? insertSlot(tracks, kind, lane.id, lane.yRatio, o.track_id, { edge: insertEdge(lane.h), originAlone })
            : laneEdgeUnderPointer(centerY, kind)
          if (slot && !lane && originAlone) {
            const b = slotBoundary(tracks, slot)
            const oi = rows.findIndex((t) => t.id === o.track_id)
            if (b === oi || b === oi + 1) slot = null
          }
        }
        // La pista viva del arrastre, no la de origen: así el clip puede VOLVER
        // a su pista inicial sin soltarlo.
        let trackId = d.trackId || o.track_id
        if (lane && !slot && lane.id !== trackId) {
          const tt = tracks.find((t) => t.id === lane.id)
          if (tt && kind === tt.kind && !tt.locked) trackId = lane.id
        }
        d.trackId = trackId   // fuera de las pistas se mantiene la última válida
        const snapped = snapClipMove(o, deltaT, d.others, thresh(), slot ? '__new__' : trackId)
        // Los clips no se montan ni hacen escalones: se PEGAN al vecino. El
        // snap de alineación propone; esto acota al hueco libre más cercano.
        const start = slot ? snapped.start : clampStartNoOverlap(clips, trackId, snapped.start, clipDur(o), { excludeIds: [o.id] })
        d.landing = slot ? { slot, start } : { trackId, start }
        const inner = innerRef.current?.getBoundingClientRect()
        setMoveView({
          clip: o, w: grab.w, h: grab.h, landing: d.landing,
          x: inner ? ev.clientX - inner.left - grab.dx : 0,
          y: inner ? ev.clientY - inner.top - grab.dy : 0,
        })
        setInsertView(slot ? insertViewFor(slot, kind, start, clipDur(o), 'move') : null)
        setAlignTimes(snapped.times)
      } else if (d.mode === 'trim-left' || d.mode === 'trim-right') {
        previewTrim(deltaT, true)
      }
    }
    const up = () => {
      const d = drag.current
      drag.current = null
      setTrimGuide(null)
      setAlignTimes(null)
      setInsertView(null)
      setMoveView(null)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      // Se aplica aquí, al soltar: la pista nueva se crea ahora, no en cada pointermove.
      const land = d?.moving ? d.landing : null
      if (!land) return
      if (land.slot) onMoveToNewTrack?.(clip.id, land.slot, land.start)
      else if (land.trackId !== d.orig.track_id || land.start !== d.orig.start) {
        (onMoveClip || onMutateClip)(clip.id, { start: land.start, track_id: land.trackId })
      }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // Arrastrar una cabecera arriba/abajo cambia el orden de las capas (como CapCut):
  // una pista de texto puede quedar debajo de una de vídeo. Solo dentro de su
  // grupo (pila vídeo+texto o audio); la línea marca dónde caerá.
  function startTrackDrag(e, track) {
    if (!onReorderTrack || linkPick || e.button !== 0 || e.target.closest?.('button, input')) return
    const startY = e.clientY
    let drop = null
    trackDragged.current = false
    const move = (ev) => {
      if (!trackDragged.current && Math.abs(ev.clientY - startY) < 4) return
      if (!trackDragged.current) {
        trackDragged.current = true
        document.body.classList.add('ed-track-dragging')
      }
      const heads = [...(headersRef.current?.querySelectorAll('.ed-track-head') || [])]
      const head = heads.find((h) => {
        const r = h.getBoundingClientRect()
        return ev.clientY >= r.top && ev.clientY < r.bottom
      })
      const target = head && tracks.find((t) => t.id === head.getAttribute('data-track'))
      drop = null
      if (target && target.id !== track.id && isStackTrack(target) === isStackTrack(track)) {
        const r = head.getBoundingClientRect()
        drop = { id: track.id, targetId: target.id, place: ev.clientY < r.top + r.height / 2 ? 'above' : 'below' }
      }
      setTrackDrop((p) => (p?.targetId === drop?.targetId && p?.place === drop?.place ? p : drop))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('ed-track-dragging')
      setTrackDrop(null)
      if (drop) onReorderTrack(drop.id, drop.targetId, drop.place)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Arrastrar la marca de inicio/fin del rango (Z / X). El cabezal la sigue para
  // ver en el preview el fotograma exacto donde empieza o acaba el clip.
  function startMarkDrag(e, which) {
    if (!onMarkChange || (e.button != null && e.button !== 0)) return
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.add('ed-mark-dragging')
    const move = (ev) => {
      const t = snapToFrame(xToTime(ev.clientX), fps)
      onMarkChange(which, t)
      ;(onScrub || onSeek)?.(t)
    }
    const up = () => {
      document.body.classList.remove('ed-mark-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Marcador (#12): arrastrar lo mueve; un clic sin arrastrar lleva el cursor ahí.
  function startMarkerDrag(e, m) {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    let moved = false
    document.body.classList.add('ed-mark-dragging')
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return
      moved = true
      onMarkerChange?.(m.id, { t: snapToFrame(Math.max(0, xToTime(ev.clientX)), fps) })
    }
    const up = () => {
      document.body.classList.remove('ed-mark-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!moved) onSeek?.(m.t)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startKfDrag(e, clip, kf) {
    e.stopPropagation()
    onSelectKf(kf.id)
    const startX = e.clientX
    const startY = e.clientY
    const orig = kf.t
    const origVol = hasVolumeControls(clip) && (clip.kind === 'audio' || clip.keyframes?.enabled)
      ? clampVolume(kf.props?.volume ?? clipVolumeAt(clip, kf.t))
      : null
    const hostH = e.currentTarget.parentElement?.clientHeight || 28
    const move = (ev) => {
      const deltaT = (ev.clientX - startX) / pps
      const dur = clipDur(clip)
      const nt = clip.keyframes?.enabled
        ? clamp(orig + deltaT, 0, dur)
        : clamp(orig + deltaT, clip.in_point, clip.out_point)
      let extra
      if (origVol != null && hostH > 0) {
        extra = { props: { volume: clampVolume(origVol + ((startY - ev.clientY) / hostH) * VOL_MAX) } }
      }
      onMoveKeyframe(clip.id, kf.id, snapToFrame(nt, fps), extra)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // Posición del puntero dentro de la pista (0 = borde superior, 1 = inferior).
  // Es lo que distingue "ponlo aquí" de "ponlo en una pista nueva encima".
  function laneYRatio(e) {
    const box = e.currentTarget?.getBoundingClientRect?.()
    if (!box || !box.height) return 0.5
    return clamp((e.clientY - box.top) / box.height, 0, 1)
  }

  // Material de `kind` soltado en esta pista. Pista nueva, igual que al mover
  // clips: sobre una pista que no es de su tipo (un vídeo sobre una de texto),
  // en el borde entre dos pistas, sobre la franja alta de un clip o un texto
  // encima de otro (CapCut). Si no, lo decide dropIntent. null = no se admite.
  function laneIntent(e, track, dur, kind) {
    const time = +xToTime(e.clientX).toFixed(3)
    const h = e.currentTarget?.getBoundingClientRect?.().height
    const slot = insertSlot(tracks, kind, track.id, laneYRatio(e), null, { edge: insertEdge(h) })
    if (slot) return { action: 'insertTrack', start: time, targetId: null, slot }
    const intent = dropIntent(clips, track.id, time, Math.max(0.1, dur || 1), laneYRatio(e))
    if (intent.action === 'newTrack' || (kind === 'text' && intent.action === 'replace')) {
      return { action: 'insertTrack', start: time, targetId: null, slot: { targetId: track.id, place: 'above' } }
    }
    return intent
  }

  function onLaneDragOver(e, track) {
    if (!dragKind) return
    const kind = laneKindFor(dragKind)
    const intent = laneIntent(e, track, dragInfo?.duration, kind)
    if (!intent) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropHint({ trackId: track.id, ...intent })
    const view = intent.slot ? insertViewFor(intent.slot, kind, intent.start, Math.max(0.1, dragInfo?.duration || 1), 'asset') : null
    setInsertView((v) => (view && v?.key === view.key && v.start === view.start ? v : view))
  }
  function onLaneDrop(e, track) {
    e.preventDefault()
    setDropHint(null)
    setInsertView(null)
    const rawExplore = e.dataTransfer.getData('application/x-explore')
    if (rawExplore) {
      let ex
      try { ex = JSON.parse(rawExplore) } catch { return }
      const intent = laneIntent(e, track, ex.duration || 3, laneKindFor(ex.kind === 'video' ? 'video' : 'image'))
      if (intent) onDropAsset({ ...ex, _explore: true }, track.id, intent.start, intent)
      return
    }
    const raw = e.dataTransfer.getData('application/x-material')
    if (!raw) return
    let payload
    try { payload = JSON.parse(raw) } catch { return }
    const intent = laneIntent(e, track, payload.duration, laneKindFor(payload.asset_kind))
    if (intent) onDropAsset(payload, track.id, intent.start, intent)
  }

  // Selección por área (rubber band estilo Windows). Arranca en un hueco de una
  // pista, dibuja un rectángulo y selecciona todos los clips que intersecta —
  // en cualquier pista. Ctrl/Cmd suma a la selección actual. Un clic sin
  // arrastre limpia la selección (salvo con Ctrl). No interfiere con arrastres
  // de clip/handle: esos hacen stopPropagation antes de llegar aquí.
  function startMarquee(e) {
    if (e.button !== 0 || linkPick || !onMarqueeSelect) return
    const scroll = lanesRef.current
    if (!scroll) return
    e.preventDefault()
    const additive = !!(e.ctrlKey || e.metaKey)
    const baseIds = additive ? [...selectedIds] : []
    const rect = scroll.getBoundingClientRect()
    const ox = e.clientX
    const oy = e.clientY
    let moved = false
    const apply = (curX, curY) => {
      const left = Math.min(ox, curX), right = Math.max(ox, curX)
      const top = Math.min(oy, curY), bottom = Math.max(oy, curY)
      setMarquee({
        x: left - rect.left + scroll.scrollLeft,
        y: top - rect.top + scroll.scrollTop,
        w: right - left,
        h: bottom - top,
      })
      const hits = []
      scroll.querySelectorAll('.ed-clip[data-clip-id]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (right < r.left || left > r.right || bottom < r.top || top > r.bottom) return
        hits.push(el.getAttribute('data-clip-id'))
      })
      onMarqueeSelect(additive ? [...new Set([...baseIds, ...hits])] : hits)
    }
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - ox, ev.clientY - oy) < 4) return
      moved = true
      apply(ev.clientX, ev.clientY)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setMarquee(null)
      if (!moved && !additive) onMarqueeSelect([])   // clic en vacío: limpia
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="ed-timeline-wrap" style={{ '--ed-row-h': `${rowH}px` }}>
      <div className="ed-tl-toolbar">
        <div className="ed-tl-tools-left">
          <button className="ghost small ed-tl-ico" onClick={() => onSplit(selectedClipId, playhead)} disabled={!selectedIds.length} title="Dividir en el cursor (S)">
            <Icon name="content_cut" size={14} />
          </button>
          <button className="ghost small ed-tl-ico" onClick={() => onDuplicate?.()} disabled={!selectedIds.length} title="Duplicar en una pista nueva">
            <Icon name="content_copy" size={14} />
          </button>
          {onCrop && (
            <button className="ghost small ed-tl-ico" onClick={() => onCrop()} disabled={cropDisabled} title="Recortar el clip seleccionado">
              <Icon name="crop" size={14} />
            </button>
          )}
          {onToggleMarker && (
            <button className="ghost small ed-tl-ico" onClick={() => onToggleMarker(playhead)}
              title="Marcador en el cursor (M) · , y . saltan entre marcadores y beats">
              <Icon name="bookmark_add" size={14} />
            </button>
          )}
          {onFreeze && (
            <button className="ghost small ed-tl-ico" onClick={() => onFreeze()} disabled={freezeDisabled || freezeBusy}
              title="Congelar fotograma: inserta una imagen fija del fotograma del cursor (3 s)">
              <Icon name={freezeBusy ? 'hourglass_top' : 'ac_unit'} size={14} />
            </button>
          )}
          <button className="ghost small ed-tl-ico danger" onClick={() => onDeleteClip(selectedClipId)} disabled={!selectedIds.length} title="Eliminar clip (Supr)">
            <Icon name="delete" size={14} />
          </button>
          {onFaceTrack && (
            <FaceTrackButton onPick={onFaceTrack} disabled={faceTrackDisabled} busy={faceTrackBusy} />
          )}
          {onCreateSegment && (
            <>
              <span className="ed-tl-sep" />
              <button
                className="ghost small ed-tl-ico accent ed-create-seg"
                onClick={() => onCreateSegment()}
                disabled={markIn == null || markOut == null || markOut <= markIn || segmentBusy}
                title="Revisa título y descripción del rango marcado (Z inicio · X fin) y confírmalo para añadirlo a Mis materiales (Enter)"
              >
                <Icon name={segmentBusy ? 'hourglass_top' : 'add_to_photos'} size={14} />
                {markIn != null && markOut != null && markOut > markIn && (
                  <em className="ed-create-seg-dur">{fmt(markOut - markIn)}</em>
                )}
              </button>
              {segmentLabelText && <span className="ed-tl-hint">{segmentLabelText}</span>}
            </>
          )}
          <span className="ed-tl-sep" />
          <PreviewVolButton value={previewVol} onChange={onPreviewVol} />
          {selKfId != null && (
            <>
              <span className="ed-tl-sep" />
              <button className="ghost small ed-tl-ico" onClick={onDeleteKf} title="Eliminar keyframe seleccionado">
                <Icon name="wrong_location" size={14} />
              </button>
            </>
          )}
        </div>
        <div className="ed-tl-tools-right">
          {onGenerateResource && (
            <button className="ghost small ed-tl-ico accent" onClick={onGenerateResource}
              title="Genera un recurso visual para el tramo marcado (o 5 s desde el cursor): la IA lee el guion y propone qué dibujar">
              <Icon name="auto_awesome" size={14} />
            </button>
          )}
          {onSceneDirection && (
            <button className="ghost small ed-tl-ico" onClick={onSceneDirection}
              title="Dirección de escena: recorre el guion entero tramo a tramo y decide qué se ve en cada uno">
              <Icon name="theaters" size={14} />
            </button>
          )}
          {(onGenerateResource || onSceneDirection) && <span className="ed-tl-sep" />}
          <button className="ghost small ed-tl-ico" onClick={() => onMatchDuration?.()} disabled={selectedIds.length < 2} title="Copiar el rango de tiempo del primer clip (mismo inicio y mismo fin). Cada uno se queda en su pista. Un vídeo o audio no se alarga más que su fuente.">
            <Icon name="straighten" size={14} />
          </button>
          <span className="ed-tl-sep" />
          <button className="ghost small ed-tl-ico" onClick={() => onAddTrack('video')} title="Añadir pista de vídeo"><Icon name="video_call" size={15} /></button>
          <button className="ghost small ed-tl-ico" onClick={() => onAddTrack('audio')} title="Añadir pista de audio"><Icon name="library_music" size={14} /></button>
          <button className="ghost small ed-tl-ico" onClick={onAddTextTrack} title="Añadir pista de texto"><Icon name="text_fields" size={14} /></button>
          <span className="ed-zoom">
            <button className="icon-btn" onClick={() => setPps((p) => clampPps(p / 1.4, duration, viewW, fps))} title="Alejar"><Icon name="zoom_out" size={15} /></button>
            <button className="icon-btn" onClick={() => setPps((p) => clampPps(p * 1.4, duration, viewW, fps))} title="Acercar (o arrastra ↔ sobre la regla)"><Icon name="zoom_in" size={15} /></button>
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
                data-track={t.id}
                className={`ed-track-head ${t.kind} ${selectedTrackId === t.id ? 'sel' : ''} ${dragKind && laneKindFor(dragKind) === t.kind ? 'drop-ok' : ''} ${vh > rowH ? 'stack-open' : ''}${isTarget ? ' link-target' : ''}${isSource ? ' link-source' : ''}${trackDrop?.id === t.id ? ' track-moving' : ''}${trackDrop?.targetId === t.id ? ` drop-${trackDrop.place}` : ''}`}
                style={{ height: vh, minHeight: vh, maxHeight: vh }}
                title={onReorderTrack ? 'Arrastra arriba/abajo para cambiar el orden de las capas' : undefined}
                onPointerDown={(e) => {
                  if (!picking) { startTrackDrag(e, t); return }
                  if (t.kind === 'text') onPickLinkTrack?.(t)
                  else onCancelLinkPick?.()
                }}
                onClick={() => {
                  if (trackDragged.current) { trackDragged.current = false; return }
                  if (picking) return
                  onSelectTrack(t.id)
                }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextTrack?.(e, t) }}>
                <TrackName track={t} onRename={onRenameTrack} />
                {partner && (
                  <span className="ed-th-link" title={`Relacionada con ${partner}`}>
                    <Icon name="link" size={11} />
                  </span>
                )}
                <span className="ed-th-btns">
                  <button className={`ed-th-btn ${t.hidden ? 'off' : ''}`} title="Visibilidad"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackToggle(t.id, 'hidden') }} disabled={t.kind === 'audio'}>
                    <Icon name={t.hidden ? 'visibility_off' : 'visibility'} size={13} />
                  </button>
                  <button className={`ed-th-btn ${t.muted ? 'off' : ''}`} title="Silenciar"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackToggle(t.id, 'muted') }} disabled={t.kind === 'text'}>
                    <Icon name={t.muted ? 'volume_off' : 'volume_up'} size={13} />
                  </button>
                  <button className="ed-th-btn" title="Juntar clips al inicio (sin huecos ni solapes)"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackCompact(t.id) }} disabled={t.locked}>
                    <Icon name="compress" size={13} />
                  </button>
                  <button className={`ed-th-btn ${t.locked ? 'on' : ''}`} title="Bloquear"
                    onClick={(e) => { e.stopPropagation(); if (picking) return; onTrackToggle(t.id, 'locked') }}>
                    <Icon name={t.locked ? 'lock' : 'lock_open'} size={13} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>

        <div className="ed-tl-scroll" ref={lanesRef}
          onDragLeave={(e) => {
            // Solo al salir del todo de las pistas (no al pasar de una a otra).
            if (e.currentTarget.contains(e.relatedTarget)) return
            setDropHint(null)
            setInsertView(null)
          }}>
          <div className="ed-tl-inner" ref={innerRef} style={{ width: totalW }}>
            <div className={`ed-ruler${trimGuide ? ' live' : ''}`} title="Clic: mover el cursor · Arrastra ↔ para hacer zoom en ese punto · I / O: marcar rango"
              onPointerDown={onRulerDown}
              onContextMenu={onContextLane ? (e) => { e.preventDefault(); onContextLane(e, null, xToTime(e.clientX)) } : undefined}>
              {markIn != null && (
                <span className={`ed-mark-range${markOut == null ? ' open' : ''}`} aria-hidden="true"
                  style={{ left: markIn * pps, width: markOut != null ? Math.max(2, (markOut - markIn) * pps) : 2 }} />
              )}
              {markIn == null && markOut != null && (
                <span className="ed-mark-range open" aria-hidden="true" style={{ left: markOut * pps, width: 2 }} />
              )}
              {buildTicks(duration + 4, pps, { fps, dense: !!trimGuide, scrollX, viewW }).map((tk) => (
                <span key={`${tk.minor ? 'm' : 'M'}-${tk.t}`} className={`ed-tick${tk.minor ? ' minor' : ''}`} style={{ left: tk.t * pps }}><i />{tk.major ? <em>{fmtRuler(tk.t, { step: tk.step, fps, long: rulerLong })}</em> : null}</span>
              ))}
              {(markers || []).map((m) => (
                <span key={m.id} className="ed-marker-flag" style={{ left: m.t * pps, ...(m.color ? { '--mk': m.color } : {}) }}
                  title={`${m.label ? `${m.label} · ` : ''}${fmtRuler(m.t, { step: rulerStep, fps, long: rulerLong })} · arrastra para mover · doble clic: nombre · clic derecho: quitar`}
                  onPointerDown={(e) => startMarkerDrag(e, m)}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    const label = window.prompt('Nombre del marcador', m.label || '')
                    if (label != null) onMarkerChange?.(m.id, { label: label.trim() || undefined })
                  }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMarkerChange?.(m.id, null) }}>
                  {m.label ? <em>{m.label}</em> : null}
                </span>
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
                    if (e.target === e.currentTarget) {
                      setExpandedClusterId(null)
                      startMarquee(e)
                    }
                  }}
                  onContextMenu={onContextLane ? (e) => {
                    // Solo el hueco de la pista: el menú de un clip lo abre el propio clip.
                    if (e.target !== e.currentTarget) return
                    e.preventDefault()
                    onContextLane(e, t, xToTime(e.clientX))
                  } : undefined}
                  onDragOver={(e) => onLaneDragOver(e, t)}
                  onDragLeave={() => setDropHint((h) => (h?.trackId === t.id ? null : h))}
                  onDrop={(e) => onLaneDrop(e, t)}>
                  {clips.filter((c) => c.track_id === t.id).map((c) => {
                    const lay = view.layouts.get(c.id)
                    if (!lay || lay.variant === 'hidden') return null
                    return (
                      <ClipBlock key={c.id} clip={c} pps={pps} layout={lay} fps={fps}
                        lifted={moveView?.clip.id === c.id}
                        selected={selectedIds.includes(c.id)} selKfId={selKfId}
                        mcpBusy={mcpBusyIds?.includes(c.id)}
                        onDown={(e, mode) => startClipDrag(e, c, mode)}
                        onKfDown={(e, kf) => startKfDrag(e, c, kf)}
                        onContext={(e) => onContextClip?.(e, c, xToTime(e.clientX))}
                        onDouble={() => onDoubleClip?.(c)}
                        onCopyDesc={onCopyDesc}
                        audioMaterials={audioMaterials} />
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
                  {dropHint?.trackId === t.id && dragInfo && dropHint.action !== 'insertTrack' && (
                    // El hueco se pinta donde el material va a CAER de verdad
                    // (detrás del que estorba, o alineado si se reemplaza).
                    <div
                      className={`ed-drop-skel ${dropHint.action}`}
                      style={{ left: dropHint.start * pps, width: Math.max(6, (dragInfo.duration || 1) * pps) }}
                    >
                      <span>{dropHint.action === 'replace' ? `Reemplazar · ${dragInfo.name}` : dragInfo.name}</span>
                    </div>
                  )}
                  {moveView?.landing.trackId === t.id && (
                    <div className="ed-drop-skel" aria-hidden="true"
                      style={{ left: moveView.landing.start * pps, width: moveView.w }} />
                  )}
                </div>
              )
            })}

            {insertView && (insertView.src === 'move' || dragInfo) && (
              // Pista nueva: línea en el hueco entre filas y, encima, el hueco del clip.
              <div className="ed-insert-line" style={{ top: insertView.y }} aria-hidden="true">
                <span style={{ left: scrollX + 8 }}>{NEW_TRACK_LABEL[insertView.kind] || 'Nueva pista'}</span>
                <i className="ed-drop-skel" style={{ left: insertView.start * pps, width: insertView.w, height: insertView.h, top: -insertView.h / 2 }} />
              </div>
            )}
            {moveView && (
              <div className="ed-clip-ghost" style={{ left: moveView.x, top: moveView.y, width: moveView.w, height: moveView.h }} aria-hidden="true">
                <ClipBlock clip={{ ...moveView.clip, start: 0 }} pps={pps} fps={fps}
                  layout={{ variant: 'solo', top: 0, height: moveView.h, z: 1 }}
                  onDown={() => {}} onKfDown={() => {}} />
              </div>
            )}
            {(alignTimes || []).map((t) => (
              <div key={t} className="ed-align-guide" style={{ left: t * pps }} aria-hidden="true" />
            ))}
            {(markers || []).map((m) => (
              <div key={m.id} className="ed-marker-line" style={{ left: m.t * pps, ...(m.color ? { '--mk': m.color } : {}) }} aria-hidden="true" />
            ))}
            {marquee && (
              <div className="ed-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} aria-hidden="true" />
            )}
            {markIn != null && markOut != null && (
              <div className="ed-mark-shade" style={{ left: markIn * pps, width: (markOut - markIn) * pps }} aria-hidden="true" />
            )}
            {onMarkChange && [['in', markIn], ['out', markOut]].map(([which, t]) => (t == null ? null : (
              <div
                key={which}
                className={`ed-mark-handle ${which}`}
                style={{ left: t * pps }}
                onPointerDown={(e) => startMarkDrag(e, which)}
                title={`${which === 'in' ? 'Inicio' : 'Fin'} (${which === 'in' ? markKeys[0] : markKeys[1]}) · ${fmtRuler(t, { step: rulerStep, fps, long: rulerLong })} · arrastra para ajustar`}
              >
                <span className="ed-mark-flag">{which === 'in' ? markKeys[0] : markKeys[1]}</span>
                <span className="ed-mark-line" />
              </div>
            )))}
            <div className="ed-playhead" style={{ left: playhead * pps }}><span className="ed-playhead-knob" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function VolumeCurve({ clip, width, height }) {
  const dur = clipDur(clip)
  const h = Math.max(4, height)
  const w = Math.max(4, width)
  const pts = sampleVolumeCurve(clip, dur, Math.max(16, Math.round(w / 6)))
  if (!pts.length) return null
  const d = pts.map((p, i) => {
    const x = (p.t / dur) * w
    const y = (1 - clampVolume(p.v) / VOL_MAX) * (h - 2) + 1
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className="ed-clip-vol" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function ClipBlock({ clip, pps, layout, selected, selKfId, onDown, onKfDown, onContext, onDouble, onCopyDesc, audioMaterials, fps = 30, mcpBusy, lifted }) {
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
  const audioDesc = clip.kind === 'audio' ? clipCopyText(clip, audioMaterials) : ''

  return (
    <div className={`ed-clip ${clip.kind} ${layout.variant !== 'solo' ? layout.variant : ''} ${selected ? 'sel' : ''} ${clip.muted ? 'muted' : ''} ${clip.disabled ? 'disabled' : ''} ${mcpBusy ? 'mcp-busy' : ''}${lifted ? ' lifted' : ''}`}
      style={{ left, width: w, top: layout.top, height: layout.height, zIndex: layout.z }}
      title={clip.note ? `${clip.name}

${clip.note}` : clip.name}
      data-clip-id={clip.id}
      data-cluster-id={layout.clusterId || undefined}
      onPointerDown={(e) => onDown(e, 'move')}
      onContextMenu={onContext} onDoubleClick={onDouble}>
      <div className="ed-clip-handle left" onPointerDown={(e) => onDown(e, 'trim-left')} />
      <div className="ed-clip-handle right" onPointerDown={(e) => onDown(e, 'trim-right')} />
      {/* Indicador de nota de contexto: el texto va en el title del clip. */}
      {clip.note && <span className="ed-clip-note" aria-hidden="true"><Icon name="sticky_note_2" size={11} /></span>}
      {/* Desactivado (#10, tecla V): no se ve, no suena ni se exporta. */}
      {/* Beats (#12): un punto por golpe detectado (dentro del recorte). */}
      {clipBeatTimes(clip).map((t) => (
        <span key={t} className="ed-beat" style={{ left: (t - clip.start) * pps }} aria-hidden="true" />
      ))}
      {clip.disabled && <span className="ed-clip-off" title="Clip desactivado (V para activarlo)"><Icon name="visibility_off" size={11} /></span>}

      {isVideo && <div className="ed-clip-label"><Icon name={clip.kind === 'image' ? 'image' : (clip.muted ? 'volume_off' : 'movie')} size={12} /> {clip.name}{speedBadge}</div>}
      {isText && <div className="ed-clip-label"><Icon name="title" size={12} /> {clip.text || clip.name}</div>}
      {clip.kind === 'shape' && <div className="ed-clip-label"><Icon name="category" size={12} /> {clip.name}</div>}
      {clip.kind === 'adjustment' && <div className="ed-clip-label"><Icon name="tune" size={12} /> {clip.name || 'Capa de ajuste'}</div>}
      {clip.kind === 'audio' && (
        <div className="ed-clip-wave">
          {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
          <span className="ed-clip-label audio"><Icon name={clip.muted ? 'volume_off' : 'graphic_eq'} size={12} /> {clip.name}{speedBadge}</span>
          {onCopyDesc && w >= 36 && (
            <button
              type="button"
              className="ed-clip-copy"
              disabled={!audioDesc}
              title={audioDesc ? 'Copiar descripción' : 'Sin descripción'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onCopyDesc(clip) }}
            >
              <Icon name="content_copy" size={12} />
            </button>
          )}
        </div>
      )}
      {hasVolumeControls(clip) && <VolumeCurve clip={clip} width={w} height={layout.height} />}

      {selected && kfs.map((k, i) => {
        const kl = animKfs
          ? (k.t / (dur || 1)) * w
          : ((k.t - clip.in_point) / (srcDur || 1)) * w
        if (kl < -3 || kl > w + 3) return null
        const hold = (k.interpolation === 'hold' || k.pan_mode === 'direct')
        const vol = hasVolumeControls(clip) && (clip.kind === 'audio' || animKfs)
          ? clampVolume(k.props?.volume ?? clipVolumeAt(clip, k.t))
          : null
        const top = vol == null ? undefined : `${(1 - vol / VOL_MAX) * 100}%`
        const volHint = vol == null ? '' : ` · ${Math.round(vol * 100)}%`
        return (
          <span key={k.id || i} className={`ed-kf-dot ${hold ? 'direct' : ''} ${k.id === selKfId ? 'sel' : ''} ${vol != null ? 'vol' : ''}`}
            style={{ left: kl, top, background: kfColor(i) }}
            title={`Keyframe ${i + 1} · ${fmtRuler(animKfs ? k.t : k.t - clip.in_point, { step: 1 / Math.max(fps, 1), fps })}${volHint}`}
            onPointerDown={(e) => { e.stopPropagation(); onKfDown(e, k) }}>{i + 1}</span>
        )
      })}
    </div>
  )
}
