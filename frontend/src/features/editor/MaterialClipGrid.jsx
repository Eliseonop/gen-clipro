import { useState, useRef, useCallback, useEffect } from 'react'
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
    description: item.description || null,
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

export function MaterialMenuBtn({ onOpen, className = 'ed-menu-corner' }) {
  return (
    <button
      type="button"
      className={className}
      title="Opciones"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(e) }}
    >
      <Icon name="more_vert" size={15} />
    </button>
  )
}

function openCardMenu(e, onMenu) {
  e.preventDefault()
  e.stopPropagation()
  onMenu?.(e)
}

export function VideoCard({
  clip, onAdd, onPlay, di, draggable = true,
  addTitle = 'Agregar al proyecto',
  onEdit, onMenu,
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
      onContextMenu={onMenu ? (e) => openCardMenu(e, onMenu) : undefined}
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
        {onEdit && (
          <button
            type="button"
            className="ed-edit-corner"
            title="Editar en Clip Editor"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit() }}
          >
            <Icon name="movie_edit" size={15} />
          </button>
        )}
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd() }} title={addTitle}>
          <Icon name="add" size={16} />
        </button>
        {onMenu && <MaterialMenuBtn onOpen={(e) => openCardMenu(e, onMenu)} />}
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
  onMenu,
  onSaveDescription,
}) {
  const title = image.label || image.name || image.filename || 'Imagen'
  const desc = (image.description || '').trim()
  const dim = image.width && image.height ? `${image.width}×${image.height}` : ''
  const savedDesc = image.description || ''
  const [draft, setDraft] = useState(savedDesc)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(image.description || '')
  }, [image.id, image.description])

  const dirty = draft !== savedDesc
  const showActions = Boolean(onSaveDescription) && (editing || dirty)

  async function saveDesc() {
    if (!onSaveDescription || saving) return
    setSaving(true)
    try {
      await onSaveDescription(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancelDesc() {
    setDraft(savedDesc)
    setEditing(false)
  }

  return (
    <div
      className={`ed-card grid image${draggable && !editing ? '' : ' no-drag'}`}
      draggable={draggable && !editing}
      onContextMenu={onMenu ? (e) => openCardMenu(e, onMenu) : undefined}
      onDragStart={draggable && !editing ? (e) => {
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
        {onMenu && <MaterialMenuBtn onOpen={(e) => openCardMenu(e, onMenu)} />}
        {dim ? <span className="ed-card-dur">{dim}</span> : null}
      </div>
      <div className="ed-card-name" title={title}>{title}</div>
      {onSaveDescription ? (
        <div
          className="ed-card-desc-edit"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            className="ed-card-desc-input"
            value={draft}
            placeholder="Descripción"
            aria-label="Descripción de la imagen"
            onFocus={() => setEditing(true)}
            onClick={() => setEditing(true)}
            onChange={(e) => { setEditing(true); setDraft(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveDesc() }
              if (e.key === 'Escape') { e.preventDefault(); cancelDesc() }
            }}
          />
          {showActions && (
            <>
              <button type="button" className="ed-card-desc-btn" title="Cancelar" onClick={cancelDesc}>
                <Icon name="close" size={14} />
              </button>
              <button type="button" className="ed-card-desc-btn ok" title="Guardar" onClick={saveDesc} disabled={saving}>
                <Icon name="check" size={14} />
              </button>
            </>
          )}
        </div>
      ) : (
        desc ? <div className="ed-card-desc" title={desc}>{desc}</div> : null
      )}
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
  onEdit,
  onMenu,
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
            onEdit={onEdit ? () => onEdit(c) : undefined}
            onMenu={onMenu ? (e) => onMenu(e, c) : undefined}
          />
        ))}
    </div>
  )
}
