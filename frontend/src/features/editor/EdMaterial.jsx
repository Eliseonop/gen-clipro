import { useState, useEffect, useCallback, useRef } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { FAV_CAT } from '../../lib/favorites'
import { listSfx, setSfxFolder, pickFolder, listLibrary, saveLibraryItem, unsaveLibraryItem, uploadImages } from '../../services/api'
import MaterialClipGrid, { dragPayload, useToggle, useExclusiveMedia, Empty, ImageCard } from './MaterialClipGrid'
import SfxClassifyModal from './SfxClassifyModal'

const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/i

function isImageFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('image/')) return true
  return IMAGE_FILE_RE.test(file.name || '')
}

function hasOsImageDrag(e) {
  const types = [...(e.dataTransfer?.types || [])]
  return types.includes('Files') && !types.includes('application/x-material')
}

function pickDefaultSfxCat(categories, current) {
  const cats = (categories || []).filter((c) => c.id && c.id !== FAV_CAT)
  if (current && cats.some((c) => c.id === current)) return current
  const other = cats.find((c) => c.id === '13_OTHER')
  return (other || cats[0] || {}).id || ''
}

function ScopeFilter({ value, onChange }) {
  return (
    <div className="ed-scope-filter">
      <button type="button" className={`ed-tab ${value === 'all' ? 'on' : ''}`} onClick={() => onChange('all')}>Todos</button>
      <button type="button" className={`ed-tab ${value === 'saved' ? 'on' : ''}`} onClick={() => onChange('saved')}>Guardados</button>
    </div>
  )
}

function SaveMark({ on, onToggle, title }) {
  return (
    <button
      type="button"
      className={`ed-fav-btn ${on ? 'on' : ''}`}
      title={title || (on ? 'Quitar de guardados' : 'Guardar')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
    >
      <Icon name={on ? 'bookmark' : 'bookmark_border'} size={15} />
    </button>
  )
}

function withProjectScope(items, kind) {
  return (items || []).map((it) => ({
    ...it,
    scope: 'project',
    is_saved: false,
    resource_type: kind,
    id: kind === 'clip' ? it.id || String(it.index) : it.id,
  }))
}

export default function EdMaterial({ project, onAdd, onDragInfo, onBack, onOpenVideo, onOpenAudio, onRefresh, fav }) {
  const [tab, setTab] = useState('video')
  const [videoFilter, setVideoFilter] = useState('all')
  const [audioFilter, setAudioFilter] = useState('all')
  const [imageFilter, setImageFilter] = useState('all')
  const [library, setLibrary] = useState({ clips: [], audios: [], images: [] })
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const [fileDrop, setFileDrop] = useState(false)
  const fileRef = useRef(null)
  const dropDepth = useRef(0)
  const clips = project.clips || []
  const audios = project.audios || []
  const images = project.images || []
  const onPlayMedia = useExclusiveMedia()
  const di = onDragInfo || (() => {})

  const reloadLibrary = useCallback(() => {
    listLibrary().then(setLibrary).catch(() => {})
  }, [])

  useEffect(() => { reloadLibrary() }, [reloadLibrary, project.id, clips.length, audios.length, images.length])

  async function toggleSave(resourceType, item) {
    setErr('')
    try {
      if (item.scope === 'library' || item.is_saved) {
        await unsaveLibraryItem(item.id)
      } else {
        await saveLibraryItem({
          project_id: project.id,
          resource_type: resourceType,
          ident: resourceType === 'clip' ? String(item.index) : String(item.id),
        })
      }
      reloadLibrary()
      onRefresh?.()
    } catch (e) {
      setErr(e.message)
    }
  }

  const projectClips = withProjectScope(clips, 'clip')
  const projectAudios = withProjectScope(audios, 'audio')
  const projectImages = withProjectScope(images, 'image')
  const shownClips = videoFilter === 'saved' ? (library.clips || []) : [...projectClips, ...(library.clips || [])]
  const shownAudios = audioFilter === 'saved' ? (library.audios || []) : [...projectAudios, ...(library.audios || [])]
  const shownImages = imageFilter === 'saved' ? (library.images || []) : [...projectImages, ...(library.images || [])]

  async function ingestFiles(fileList) {
    const files = [...(fileList || [])].filter(isImageFile)
    if (!files.length) {
      setErr('Suelta un PNG, JPG, WebP o GIF.')
      return
    }
    setTab('image')
    setUploading(true)
    setErr('')
    try {
      await uploadImages(project.id, files)
      onRefresh?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setUploading(false)
    }
  }

  function onFileDragEnter(e) {
    if (!hasOsImageDrag(e)) return
    e.preventDefault()
    dropDepth.current += 1
    setFileDrop(true)
  }
  function onFileDragOver(e) {
    if (!hasOsImageDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  function onFileDragLeave(e) {
    if (!hasOsImageDrag(e)) return
    dropDepth.current = Math.max(0, dropDepth.current - 1)
    if (dropDepth.current === 0) setFileDrop(false)
  }
  function onFileDrop(e) {
    if (!hasOsImageDrag(e)) return
    e.preventDefault()
    dropDepth.current = 0
    setFileDrop(false)
    ingestFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={`ed-material${fileDrop ? ' file-drop' : ''}`}
      onDragEnter={onFileDragEnter}
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onFileDrop}
    >
      <div className="ed-mat-head">
        <div className="ed-mat-title">
          <button className="ed-back" onClick={onBack} type="button" title="Volver a proyectos">
            <Icon name="arrow_back" size={22} />
          </button>
          <span className="ed-mat-label" title={project.name}></span>
        </div>
        <div className="ed-mat-actions">
          <button className="ghost small" onClick={onOpenVideo} type="button">
            <Icon name="add" size={15} /> Cargar video
          </button>
          <button className="ghost small" onClick={() => fileRef.current?.click()} type="button" disabled={uploading}>
            <Icon name="add" size={15} /> {uploading ? 'Subiendo…' : 'Imagen'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files || [])]
              e.target.value = ''
              if (!files.length) return
              await ingestFiles(files)
            }}
          />
          <button className="ghost small" onClick={onOpenAudio} type="button">
            <Icon name="add" size={15} /> Audio
          </button>
        </div>
      </div>
      <div className="ed-mat-tabs">
        <button className={`ed-tab ${tab === 'video' ? 'on' : ''}`} onClick={() => setTab('video')}>
          <Icon name="movie" size={15} /> Video <span className="ed-count">{clips.length + (library.clips || []).length}</span>
        </button>
        <button className={`ed-tab ${tab === 'image' ? 'on' : ''}`} onClick={() => setTab('image')}>
          <Icon name="image" size={15} /> Imagen <span className="ed-count">{images.length + (library.images || []).length}</span>
        </button>
        <button className={`ed-tab ${tab === 'audio' ? 'on' : ''}`} onClick={() => setTab('audio')}>
          <Icon name="mic" size={15} /> Audio <span className="ed-count">{audios.length + (library.audios || []).length}</span>
        </button>
        <button className={`ed-tab ${tab === 'sfx' ? 'on' : ''}`} onClick={() => setTab('sfx')}>
          <Icon name="graphic_eq" size={15} /> SFX
        </button>
      </div>
      {err && <div className="ed-mat-err">{err}</div>}

      {tab === 'video' && (
        <div className="ed-mat-list">
          <ScopeFilter value={videoFilter} onChange={setVideoFilter} />
          <MaterialClipGrid
            clips={shownClips}
            onAdd={(c) => onAdd('clips', c)}
            onPlay={onPlayMedia}
            di={di}
            onToggleSave={(c) => toggleSave('clip', c)}
            emptyText={videoFilter === 'saved' ? 'No hay clips guardados.' : 'Sin clips. Pulsa Cargar video para añadir material.'}
          />
        </div>
      )}

      {tab === 'image' && (
        <div className="ed-mat-list">
          <ScopeFilter value={imageFilter} onChange={setImageFilter} />
          {shownImages.length === 0
            ? <Empty text={imageFilter === 'saved' ? 'No hay imágenes guardadas.' : 'Sin imágenes. Suelta un archivo aquí o pulsa Imagen.'} />
            : (
              <div className="ed-mat-grid">
                {shownImages.map((im) => (
                  <ImageCard
                    key={`${im.scope}-${im.id}`}
                    image={im}
                    onAdd={() => onAdd('images', im)}
                    di={di}
                    saved={im.scope === 'library' || !!im.is_saved}
                    onToggleSave={() => toggleSave('image', im)}
                  />
                ))}
              </div>
            )}
        </div>
      )}

      {tab === 'audio' && (
        <div className="ed-mat-list">
          <ScopeFilter value={audioFilter} onChange={setAudioFilter} />
          {shownAudios.length === 0
            ? <Empty text={audioFilter === 'saved' ? 'No hay audios guardados.' : 'Sin audios. Pulsa Audio para generar narración.'} />
            : shownAudios.map((a) => (
              <AudioCard
                key={`${a.scope}-${a.id}`}
                audio={a}
                onAdd={() => onAdd('audios', a)}
                onPlay={onPlayMedia}
                di={di}
                saved={a.scope === 'library' || !!a.is_saved}
                onToggleSave={() => toggleSave('audio', a)}
              />
            ))}
        </div>
      )}

      {tab === 'sfx' && <SfxTab onAdd={onAdd} onPlay={onPlayMedia} di={di} fav={fav} />}
    </div>
  )
}

function FavStar({ on, onToggle, title }) {
  return (
    <button
      type="button"
      className={`ed-fav-btn ${on ? 'on' : ''}`}
      title={title || (on ? 'Quitar de favoritos' : 'Favorito')}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle?.() }}
    >
      <Icon name={on ? 'star' : 'star_border'} size={15} />
    </button>
  )
}

function SfxCard({ sfx, onAdd, onPlay, di, favOn, onToggleFav, onEdit }) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const [dur, setDur] = useState(null)
  return (
    <div className="ed-card sfx-rect"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-material', dragPayload('sfx', { ...sfx, duration: dur || 0 })); di?.({ kind: 'audio', duration: dur || 1, name: sfx.name }) }}
      onDragEnd={() => di?.(null)}>
      <audio ref={ref} src={sfx.url} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.target.duration)} />
      <span className="ed-sfx-name" title={sfx.name}>{sfx.name}</span>
      <div className="ed-sfx-row">
        <button className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={18} />
        </button>
        <span className="ed-sfx-sub">{sfx.category}{dur != null ? ` · ${fmt(dur)}` : ''}</span>
        <FavStar on={favOn} onToggle={onToggleFav} />
        <button type="button" className="ed-add-btn" title="Editar" onClick={(e) => { e.stopPropagation(); onEdit?.() }}>
          <Icon name="edit" size={14} />
        </button>
        <button className="ed-add-btn" onClick={(e) => { e.stopPropagation(); onAdd() }} title="Agregar al proyecto">
          <Icon name="add" size={15} />
        </button>
      </div>
    </div>
  )
}

function AudioCard({ audio, onAdd, onPlay, di, saved, onToggleSave }) {
  const { ref, playing, toggle, setPlaying } = useToggle(onPlay)
  return (
    <div className="ed-card audio row"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-material', dragPayload('audios', audio)); di?.({ kind: 'audio', duration: audio.duration || 1, name: audio.label || audio.filename }) }}
      onDragEnd={() => di?.(null)}>
      <audio ref={ref} src={audio.url} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <button className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
        <Icon name={playing ? 'pause' : 'play_arrow'} size={17} />
      </button>
      <span className="ed-card-name" title={audio.filename}>{audio.label || audio.filename}</span>
      <span className="ed-card-dur">{fmt(audio.duration || 0)}</span>
      <SaveMark on={saved} onToggle={onToggleSave} />
      <button className="ed-add-btn" onClick={onAdd} title="Agregar al proyecto"><Icon name="add" size={15} /></button>
    </div>
  )
}

function SfxTab({ onAdd, onPlay, di, fav }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState({ available: true, items: [], categories: [], total: 0 })
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editSfx, setEditSfx] = useState(null)

  const refresh = useCallback(async (query, cat, quiet = false) => {
    if (!quiet) setLoading(true)
    try { setData(await listSfx(query, cat)) } catch { /* backend */ } finally { if (!quiet) setLoading(false) }
  }, [])

  useEffect(() => { refresh('', '') }, [refresh])
  useEffect(() => {
    const id = setTimeout(() => refresh(q, category), 250)
    return () => clearTimeout(id)
  }, [q, category, refresh])

  async function chooseFolder() {
    setBusy(true)
    let path = null
    try { path = (await pickFolder()).path } catch { /* manual */ }
    if (!path) path = window.prompt('Pega la ruta de la carpeta de SFX:', '')
    if (path) { try { setData(await setSfxFolder(path)) } catch { /* noop */ } }
    setBusy(false)
  }

  async function toggleSfxFav(id) {
    await fav?.toggleSfx(id)
    await refresh(q, category)
  }

  if (!loading && !data.available) {
    return (
      <div className="ed-sfx">
        <div className="ed-mat-empty">
          <p>No se encontró la biblioteca de sonidos.</p>
          <button className="ghost small" onClick={chooseFolder} disabled={busy}>
            <Icon name="folder_open" size={15} /> {busy ? 'Elige…' : 'Seleccionar carpeta'}
          </button>
        </div>
      </div>
    )
  }

  const cats = data.categories || []
  const hasFavOption = cats.some((c) => c.id === FAV_CAT)

  return (
    <div className="ed-sfx">
      <div className="ed-sfx-search">
        <Icon name="search" size={16} />
        <input placeholder="Buscar (explosion, laugh…)" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="icon-btn" onClick={() => setQ('')}><Icon name="close" size={15} /></button>}
      </div>
      <div className="ed-sfx-cat-row">
        <select className="select mini ed-sfx-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {!hasFavOption && <option value={FAV_CAT}>Favoritos</option>}
          {cats.map((c) => <option key={c.id} value={c.id}>{c.label}{c.count != null ? ` (${c.count})` : ''}</option>)}
        </select>
        <button
          type="button"
          className={`ed-fav-filter ${category === FAV_CAT ? 'on' : ''}`}
          title="Mostrar favoritos"
          onClick={() => setCategory((c) => (c === FAV_CAT ? '' : FAV_CAT))}
        >
          <Icon name={category === FAV_CAT ? 'star' : 'star_border'} size={16} />
        </button>
        <button
          type="button"
          className="ed-sfx-add"
          title="Agregar sonido"
          onClick={() => { setEditSfx(null); setAddOpen(true) }}
        >
          <Icon name="add" size={16} />
        </button>
      </div>

      <div className="ed-mat-grid ed-sfx-grid">
        {loading ? <Empty text="Cargando…" />
          : data.items.length === 0 ? <Empty text="Sin resultados." />
            : data.items.map((s) => (
              <SfxCard
                key={s.id}
                sfx={s}
                onAdd={() => onAdd('sfx', s)}
                onPlay={onPlay}
                di={di}
                favOn={!!fav?.isSfxFav(s.id)}
                onToggleFav={() => toggleSfxFav(s.id)}
                onEdit={() => { setAddOpen(true); setEditSfx(s) }}
              />
            ))}
      </div>
      {!loading && <div className="ed-sfx-count">{data.total} sonidos</div>}
      {(addOpen || editSfx) && (
        <SfxClassifyModal
          categories={cats}
          defaultCategory={pickDefaultSfxCat(cats, category)}
          editSfx={editSfx}
          onClose={() => { setAddOpen(false); setEditSfx(null) }}
          onChanged={() => refresh(q, category, true)}
        />
      )}
    </div>
  )
}
