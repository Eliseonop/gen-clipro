import { useState, useRef, useCallback } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import './editor.css'
import { IMAGE_DEFAULT_DUR } from './editorModel.js'

export function dragPayload(assetKind, item) {
  const fromLibrary = item?.scope === 'library' || String(item?.id || '').startsWith('lib_')
  const isImage = assetKind === 'images'
  return JSON.stringify({
    asset_kind: assetKind,
    asset_id: fromLibrary
      ? String(item.id)
      : (assetKind === 'clips' ? String(item.index) : String(item.id)),
    filename: assetKind === 'sfx' ? item.id : item.filename,
    name: item.label || item.name || item.filename,
    url: item.url,
    duration: isImage
      ? IMAGE_DEFAULT_DUR
      : (assetKind === 'clips' ? ((item.end ?? item.duration ?? 0) - (item.start ?? 0)) : (item.duration || 0)),
    kind: isImage ? 'image' : (assetKind === 'clips' ? 'video' : 'audio'),
    reframe: item.reframe || null,
    scope: fromLibrary ? 'library' : 'project',
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
  saved = false, onToggleSave,
}) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const title = clip.label || (clip.scope === 'library' ? (clip.filename || 'Guardado') : `Clip #${clip.index}`)
  const desc = (clip.description || '').trim()
  const dur = (clip.end != null && clip.start != null) ? (clip.end - clip.start) : (clip.duration || 0)

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
        di?.({ kind: 'video', duration: dur || 1, name: title })
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
        {onToggleSave && (
          <button
            type="button"
            className={`ed-save-corner ${saved ? 'on' : ''}`}
            title={saved ? 'Quitar de guardados' : 'Guardar'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleSave() }}
          >
            <Icon name={saved ? 'bookmark' : 'bookmark_border'} size={15} />
          </button>
        )}
        <span className="ed-card-dur">{fmt(dur)}</span>
      </div>
      <div className="ed-card-name" title={title}>{title}</div>
      {desc ? <div className="ed-card-desc" title={desc}>{desc}</div> : null}
    </div>
  )
}

export function ImageCard({
  image, onAdd, di, draggable = true,
  addTitle = 'Agregar al proyecto',
  saved = false, onToggleSave,
}) {
  const title = image.label || image.name || image.filename || 'Imagen'
  const desc = (image.description || '').trim()
  const dim = image.width && image.height ? `${image.width}×${image.height}` : ''

  return (
    <div
      className={`ed-card grid image${draggable ? '' : ' no-drag'}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData('application/x-material', dragPayload('images', image))
        di?.({ kind: 'image', duration: IMAGE_DEFAULT_DUR, name: title })
      } : undefined}
      onDragEnd={draggable ? () => di?.(null) : undefined}
    >
      <div className="ed-card-media">
        <img src={image.url} alt="" draggable={false} />
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd() }} title={addTitle}>
          <Icon name="add" size={16} />
        </button>
        {onToggleSave && (
          <button
            type="button"
            className={`ed-save-corner ${saved ? 'on' : ''}`}
            title={saved ? 'Quitar de guardados' : 'Guardar'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleSave() }}
          >
            <Icon name={saved ? 'bookmark' : 'bookmark_border'} size={15} />
          </button>
        )}
        {dim ? <span className="ed-card-dur">{dim}</span> : null}
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
  emptyText = 'Sin clips. Pulsa Cargar clips o Caja video.',
  onToggleSave,
}) {
  const internalPlay = useExclusiveMedia()
  const play = onPlay || internalPlay
  return (
    <div className="ed-mat-grid">
      {clips.length === 0
        ? <Empty text={emptyText} />
        : clips.map((c) => (
          <VideoCard
            key={c.scope === 'library' ? c.id : c.index}
            clip={c}
            onAdd={() => onAdd(c)}
            onPlay={play}
            di={di}
            draggable={draggable}
            addTitle={addTitle}
            saved={c.scope === 'library' || !!c.is_saved}
            onToggleSave={onToggleSave ? () => onToggleSave(c) : undefined}
          />
        ))}
    </div>
  )
}
