import { useState, useRef, useCallback } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import './editor.css'

export function dragPayload(assetKind, item) {
  return JSON.stringify({
    asset_kind: assetKind,
    asset_id: assetKind === 'clips' ? String(item.index) : String(item.id),
    filename: assetKind === 'sfx' ? item.id : item.filename,
    name: item.label || item.name || item.filename,
    url: item.url,
    duration: assetKind === 'clips' ? (item.end - item.start) : (item.duration || 0),
    kind: assetKind === 'clips' ? 'video' : 'audio',
  })
}

export function useExclusiveMedia() {
  const activeMedia = useRef(null)
  return useCallback((el) => {
    if (activeMedia.current && activeMedia.current !== el) {
      try { activeMedia.current.pause() } catch { /* noop */ }
    }
    activeMedia.current = el
  }, [])
}

export function useToggle(onPlay) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const toggle = (e) => {
    e?.stopPropagation()
    const m = ref.current
    if (!m) return
    if (m.paused) { onPlay?.(m); m.play().catch(() => {}) } else m.pause()
  }
  return { ref, playing, setPlaying, toggle }
}

export function Empty({ text }) {
  return <div className="ed-mat-empty grid-full">{text}</div>
}

export function VideoCard({
  clip, onAdd, onPlay, di, draggable = true,
  addTitle = 'Agregar al proyecto',
}) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const title = clip.label || `Clip #${clip.index}`
  const desc = (clip.description || '').trim()

  function onPlayClick(e) {
    e?.stopPropagation()
    toggle(e)
  }

  return (
    <div
      className={`ed-card grid video${draggable ? '' : ' no-drag'}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData('application/x-material', dragPayload('clips', clip))
        di?.({ kind: 'video', duration: clip.end - clip.start, name: title })
      } : undefined}
      onDragEnd={draggable ? () => di?.(null) : undefined}
    >
      <div className="ed-card-media">
        <video ref={ref} src={clip.url} preload="metadata" playsInline muted
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        <button className="ed-play-ov" onClick={onPlayClick} title={playing ? 'Pausa' : 'Reproducir'}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
        </button>
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd() }} title={addTitle}>
          <Icon name="add" size={16} />
        </button>
        <span className="ed-card-dur">{fmt(clip.end - clip.start)}</span>
      </div>
      <div className="ed-card-name" title={title}>{title}</div>
      {desc ? <div className="ed-card-desc" title={desc}>{desc}</div> : null}
    </div>
  )
}

/** Rejilla de clips de vídeo (misma card que el panel Materiales del editor). */
export default function MaterialClipGrid({
  clips = [],
  onAdd,
  onPlay,
  di,
  draggable = true,
  addTitle = 'Agregar al proyecto',
  emptyText = 'Sin clips. Pulsa Cargar video para añadir material.',
}) {
  const internalPlay = useExclusiveMedia()
  const play = onPlay || internalPlay
  return (
    <div className="ed-mat-grid">
      {clips.length === 0
        ? <Empty text={emptyText} />
        : clips.map((c) => (
          <VideoCard
            key={c.index}
            clip={c}
            onAdd={() => onAdd(c)}
            onPlay={play}
            di={di}
            draggable={draggable}
            addTitle={addTitle}
          />
        ))}
    </div>
  )
}
