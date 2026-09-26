import { useState, useEffect, useCallback, useRef } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import {
  setCollectionsRoot, searchCollections, updateCollection, pickFolder, listCollections, createCollection,
  uploadCollectionFiles, listSticks, getStick, createStick, uploadStickFiles, setStickItemExpression,
} from '../../services/api'
import { dragPayload, useToggle, bustUrl, Empty, clampAspect, AR_PLACEHOLDER, useMasonrySpan } from './MaterialClipGrid'
import EdLibraryStick, { FileDropZone, UploadButton } from './EdLibraryStick'

// Biblioteca = carpetas de material reutilizable bajo una raíz (ver collections.py).
// La raíz muestra CARPETAS; al entrar en una se ve su contenido y se le pueden
// soltar archivos del explorador. Una carpeta con stick.json es un personaje
// STICK: se abre agrupada por expresión (EdLibraryStick). La búsqueda recorre
// toda la biblioteca (o solo la carpeta abierta).

const KIND_CHIPS = [
  { id: '', label: 'Todo', countKey: 'all' },
  { id: 'video', label: 'Vídeos', countKey: 'video' },
  { id: 'image', label: 'Imágenes', countKey: 'image' },
  { id: 'gif', label: 'GIF', countKey: 'gif' },
  { id: 'audio', label: 'Audio', countKey: 'audio' },
]
const STICK_CHIPS = KIND_CHIPS.slice(0, 3)

// Item de colección → item que entienden dragPayload/addAsset. La duración medida
// en el cliente (vídeo/audio) se inyecta aquí para que el clip nazca con su largo real.
function assetItem(it, duration) {
  const animated = it.kind === 'gif'
  return {
    ...it,
    scope: 'collection',
    label: it.name,
    duration: duration || it.duration || 0,
    end: duration || it.duration || 0,
    ...(animated ? { animated: true, loop: true } : {}),
  }
}

function LibVideoCard({ item, onAdd, onPlay, di }) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const { ref: msRef, recalc: msRecalc } = useMasonrySpan()
  const [dur, setDur] = useState(0)
  const [ar, setAr] = useState(null)
  const assetKind = 'clips'
  return (
    <div
      ref={msRef}
      className="ed-card grid video"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-material', dragPayload(assetKind, assetItem(item, dur)))
        di?.({ kind: 'video', duration: dur || 1, name: item.name })
      }}
      onDragEnd={() => di?.(null)}
    >
      <div className="ed-card-media" style={{ aspectRatio: ar || AR_PLACEHOLDER }}>
        <video ref={ref} src={bustUrl(item.url, item)} preload="metadata" playsInline muted
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) setAr(clampAspect(v.videoWidth, v.videoHeight))
            if (v.duration && Number.isFinite(v.duration)) setDur(v.duration)
            requestAnimationFrame(msRecalc)
          }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        <button className="ed-play-ov" onClick={(e) => { e.stopPropagation(); toggle(e) }} title={playing ? 'Pausa' : 'Reproducir'}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
        </button>
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd(assetKind, assetItem(item, dur)) }} title="Agregar al proyecto">
          <Icon name="add" size={16} />
        </button>
        {dur > 0 && <span className="ed-card-dur">{fmt(dur)}</span>}
      </div>
      <div className="ed-card-name" title={item.name}>{item.name}</div>
    </div>
  )
}

function LibImageCard({ item, onAdd, di }) {
  const assetKind = 'images'
  const isGif = item.kind === 'gif'
  const [ar, setAr] = useState(() => clampAspect(item.width, item.height))
  const { ref: msRef, recalc: msRecalc } = useMasonrySpan()
  return (
    <div
      ref={msRef}
      className="ed-card grid image"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-material', dragPayload(assetKind, assetItem(item)))
        di?.({ kind: 'image', duration: 3, name: item.name })
      }}
      onDragEnd={() => di?.(null)}
    >
      <div className="ed-card-media" style={{ aspectRatio: ar || AR_PLACEHOLDER }}>
        <img src={bustUrl(item.url, item)} alt={item.name} loading="lazy" draggable={false}
          onLoad={(e) => {
            if (!ar) setAr(clampAspect(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight))
            requestAnimationFrame(msRecalc)
          }} />
        {isGif && <span className="ed-card-badge gif-badge">GIF</span>}
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd(assetKind, assetItem(item)) }} title="Agregar al proyecto">
          <Icon name="add" size={16} />
        </button>
      </div>
      <div className="ed-card-name" title={item.name}>{item.name}</div>
    </div>
  )
}

function LibAudioCard({ item, onAdd, onPlay, di }) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  const { ref: msRef } = useMasonrySpan()
  const [dur, setDur] = useState(0)
  const assetKind = 'audios'
  return (
    <div
      ref={msRef}
      className="ed-card grid audio-tile"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-material', dragPayload(assetKind, assetItem(item, dur)))
        di?.({ kind: 'audio', duration: dur || 1, name: item.name })
      }}
      onDragEnd={() => di?.(null)}
    >
      <div className="ed-card-media ed-audio-media" style={{ aspectRatio: 16 / 10 }}>
        <audio ref={ref} src={item.url} preload="metadata"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        <Icon name="graphic_eq" size={26} />
        <button className="ed-play-ov" onClick={(e) => { e.stopPropagation(); toggle(e) }} title={playing ? 'Pausa' : 'Reproducir'}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={18} />
        </button>
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd(assetKind, assetItem(item, dur)) }} title="Agregar al proyecto">
          <Icon name="add" size={16} />
        </button>
        {dur > 0 && <span className="ed-card-dur">{fmt(dur)}</span>}
      </div>
      <div className="ed-card-name" title={item.name}>{item.name}</div>
    </div>
  )
}

function CardFor({ item, onAdd, onPlay, di }) {
  if (item.kind === 'video') return <LibVideoCard item={item} onAdd={onAdd} onPlay={onPlay} di={di} />
  if (item.kind === 'audio') return <LibAudioCard item={item} onAdd={onAdd} onPlay={onPlay} di={di} />
  return <LibImageCard item={item} onAdd={onAdd} di={di} />
}

// Carpeta en la raíz de la Biblioteca. Las de stick muestran su emoji y portada.
function FolderCard({ col, stick, onOpen }) {
  const cover = stick?.cover_url || col.cover_url
  const name = col.stick ? (stick?.name || col.name) : col.name
  return (
    <button type="button" className={`ed-lib-fcard${col.stick ? ' stick' : ''}`} onClick={onOpen} title={col.path}>
      <div className="ed-lib-fcard-cover">
        {cover ? <img src={cover} alt="" loading="lazy" draggable={false} />
          : <Icon name={col.stick ? 'accessibility_new' : 'folder'} size={34} />}
        {col.stick && <span className="ed-lib-fcard-badge">{stick?.emoji || '🎭'} Stick</span>}
        {col.favorite && <span className="ed-lib-fcard-fav"><Icon name="star" size={13} /></span>}
      </div>
      <span className="ed-lib-fcard-name">{name}</span>
      <span className="ed-lib-fcard-count">{col.count} recursos</span>
    </button>
  )
}

// Formulario en línea para crear una carpeta o un stick (nombre, emoji, croma).
function CreateForm({ mode, onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#00ff00')
  const [saving, setSaving] = useState(false)
  const isStick = mode === 'stick'
  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try { await onCreate({ name: name.trim(), emoji: emoji.trim(), chroma_color: color }) } finally { setSaving(false) }
  }
  return (
    <form className="ed-lib-create" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      <div className="ed-lib-create-h">
        <Icon name={isStick ? 'accessibility_new' : 'create_new_folder'} size={15} />
        {isStick ? 'Nuevo stick (personaje)' : 'Nueva carpeta'}
      </div>
      <div className="ed-lib-create-row">
        {isStick && (
          <input className="ed-lib-create-emoji" value={emoji} maxLength={4} placeholder="🙂"
            onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        )}
        <input autoFocus value={name} placeholder={isStick ? 'Nombre (p. ej. Robot)' : 'Nombre de la carpeta'}
          onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
        {isStick && (
          <label className="ed-lib-create-color" title="Color del croma (el fondo que se quita al agregarlo)">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        )}
      </div>
      {isStick && <div className="ed-lib-create-note">Se crea su carpeta con una subcarpeta por expresión (feliz, triste…).</div>}
      <div className="ed-lib-create-actions">
        <button type="button" className="ghost small" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="small" disabled={!name.trim() || saving}>{saving ? 'Creando…' : 'Crear'}</button>
      </div>
    </form>
  )
}

export default function EdLibrary({ onAdd, onDragInfo, onPlay }) {
  const [folder, setFolder] = useState(null)   // carpeta abierta (id) o null = raíz
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [lib, setLib] = useState({ available: true, root: null, collections: [] })
  const [sticks, setSticks] = useState([])
  const [res, setRes] = useState({ items: [], counts: {}, total: 0 })   // búsqueda / carpeta normal
  const [stick, setStick] = useState(null)     // detalle del stick abierto
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')         // mensaje mientras se sube / elige raíz
  const [manage, setManage] = useState(false)
  const [creating, setCreating] = useState(null)   // 'folder' | 'stick' | null
  const [reload, setReload] = useState(0)
  const [err, setErr] = useState('')
  const di = onDragInfo || (() => {})
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const cols = lib.collections || []
  const openCol = folder ? cols.find((c) => c.id === folder) : null
  const isStick = !!openCol?.stick
  const stickOf = useCallback((cid) => sticks.find((s) => s.id === cid), [sticks])

  const loadLib = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([listCollections(), listSticks().catch(() => ({ sticks: [] }))])
      if (!alive.current) return
      setLib(l)
      setSticks(s.sticks || [])
    } catch { /* backend */ } finally { if (alive.current) setLoading(false) }
  }, [])
  useEffect(() => { loadLib() }, [loadLib])

  // Stick abierto → su detalle (agrupado por expresión).
  useEffect(() => {
    if (!folder || !isStick) return undefined
    let on = true
    getStick(folder)
      .then((d) => { if (on) setStick(d) })
      .catch((e) => { if (on) setErr(e?.message || 'No se pudo abrir el stick.') })
    return () => { on = false }
  }, [folder, isStick, reload])

  // Carpeta normal o búsqueda → resultados (con debounce al teclear).
  useEffect(() => {
    if (isStick) return undefined
    if (!folder && !q.trim()) return undefined   // raíz sin búsqueda: se ven carpetas
    let on = true
    const id = setTimeout(() => {
      searchCollections({ q, kind, collection: folder || '' })
        .then((r) => { if (on) setRes(r) })
        .catch(() => {})
    }, q ? 250 : 0)
    return () => { on = false; clearTimeout(id) }
  }, [folder, isStick, q, kind, reload])

  function openFolder(cid) {
    setFolder(cid); setQ(''); setKind(''); setStick(null); setRes({ items: [], counts: {}, total: 0 }); setErr(''); setCreating(null)
  }
  function goRoot() {
    setFolder(null); setQ(''); setKind(''); setStick(null); setRes({ items: [], counts: {}, total: 0 }); setErr('')
  }

  async function chooseRoot() {
    setErr('')
    setBusy('Elige la carpeta…')
    let path = null
    try { path = (await pickFolder()).path } catch { /* manual */ }
    if (!path) path = window.prompt('Pega la ruta de la carpeta raíz de material:', '')
    if (path) {
      try {
        await setCollectionsRoot(path)
        goRoot()
        await loadLib()
      } catch (e) { setErr(e.message || 'Carpeta no válida.') }
    }
    setBusy('')
  }

  async function toggleCollection(cid, patch) {
    try {
      await updateCollection(cid, patch)
      await loadLib()
    } catch (e) { setErr(e.message || 'No se pudo actualizar.') }
  }

  async function create(form) {
    setErr('')
    try {
      if (creating === 'stick') {
        const d = await createStick(form)
        await loadLib()
        openFolder(d.id)
        setStick(d)
      } else {
        const r = await createCollection(form.name)
        setLib(r)
        openFolder(r.id)
      }
    } catch (e) { setErr(e.message || 'No se pudo crear.') }
  }

  // Archivos soltados (o elegidos) → a la carpeta abierta; en un stick, a la
  // subcarpeta de la expresión donde se soltaron.
  async function upload(files, expression) {
    if (!folder || !files?.length) return
    setErr('')
    setBusy(`Subiendo ${files.length} archivo${files.length > 1 ? 's' : ''}…`)
    try {
      const r = isStick
        ? await uploadStickFiles(folder, files, expression)
        : await uploadCollectionFiles(folder, files)
      if (isStick && r.detail) setStick(r.detail)
      else setReload((n) => n + 1)
      if (r.errors?.length) setErr(`${r.errors.length} archivo(s) no se subieron: ${r.errors[0].error}`)
      loadLib()
    } catch (e) { setErr(e.message || 'No se pudo subir.') } finally { setBusy('') }
  }

  async function recategorize(item, expression) {
    if (!folder || item.expression === expression) return
    try { setStick(await setStickItemExpression(folder, item.rel, expression)) } catch (e) { setErr(e.message || 'No se pudo cambiar.') }
  }

  // En la raíz, la búsqueda sigue viendo los sticks con su croma.
  const withChroma = (it) => {
    const s = stickOf(it.collection)
    return s ? { ...it, chromaColor: s.chroma_color } : it
  }

  if (!loading && !lib.available) {
    return (
      <div className="ed-library">
        <div className="ed-mat-empty">
          <p>No hay carpeta raíz de material.</p>
          <button className="ghost small" onClick={chooseRoot} disabled={!!busy}>
            <Icon name="folder_open" size={15} /> {busy ? 'Elige…' : 'Seleccionar carpeta'}
          </button>
        </div>
      </div>
    )
  }

  const searching = !!q.trim()
  const visibleCols = cols.filter((c) => c.enabled)
  const chips = isStick ? STICK_CHIPS : KIND_CHIPS
  const counts = isStick
    ? { all: (stick?.kinds?.video || 0) + (stick?.kinds?.image || 0), video: stick?.kinds?.video || 0, image: stick?.kinds?.image || 0 }
    : (res.counts || {})
  const folderName = isStick ? `${stick?.emoji || stickOf(folder)?.emoji || '🎭'} ${stick?.name || stickOf(folder)?.name || openCol?.name}` : openCol?.name

  return (
    <div className="ed-library">
      <div className="ed-sfx-search">
        <Icon name="search" size={16} />
        <input
          placeholder={folder ? `Buscar en ${isStick ? (stick?.name || openCol?.name || '') : (openCol?.name || '')}…` : 'Buscar en toda la biblioteca…'}
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar material" />
        {q && <button className="icon-btn" onClick={() => setQ('')}><Icon name="close" size={15} /></button>}
        <button
          type="button"
          className={`ed-fav-filter ${manage ? 'on' : ''}`}
          title="Gestionar carpetas"
          onClick={() => setManage((m) => !m)}
        >
          <Icon name="tune" size={16} />
        </button>
      </div>

      {manage && (
        <div className="ed-lib-folders">
          <div className="ed-lib-folders-head">
            <span>Carpetas de material</span>
            <button className="ghost small" onClick={chooseRoot} disabled={!!busy} title="Cambiar la carpeta raíz">
              <Icon name="folder_open" size={14} /> Raíz
            </button>
          </div>
          {lib.root && <div className="ed-lib-root" title={lib.root}>{lib.root}</div>}
          {cols.length === 0
            ? <div className="ed-lib-empty">No hay carpetas todavía.</div>
            : cols.map((c) => (
              <div key={c.id} className={`ed-lib-folder${c.enabled ? '' : ' off'}`}>
                <button
                  type="button"
                  className={`ed-lib-fav ${c.favorite ? 'on' : ''}`}
                  title={c.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                  onClick={() => toggleCollection(c.id, { favorite: !c.favorite })}
                >
                  <Icon name={c.favorite ? 'star' : 'star_border'} size={15} />
                </button>
                <span className="ed-lib-folder-name" title={c.path}>{c.stick ? `${stickOf(c.id)?.emoji || '🎭'} ` : ''}{c.name}</span>
                <span className="ed-lib-folder-count">{c.count}</span>
                <label className="ed-lib-toggle" title={c.enabled ? 'Activa' : 'Oculta'}>
                  <input type="checkbox" checked={c.enabled} onChange={() => toggleCollection(c.id, { enabled: !c.enabled })} />
                  <Icon name={c.enabled ? 'visibility' : 'visibility_off'} size={15} />
                </label>
              </div>
            ))}
        </div>
      )}

      {folder ? (
        <div className="ed-lib-crumb">
          <button type="button" className="icon-btn" onClick={goRoot} title="Volver a la Biblioteca"><Icon name="arrow_back" size={16} /></button>
          <button type="button" className="ed-lib-crumb-root" onClick={goRoot}>Biblioteca</button>
          <Icon name="chevron_right" size={14} />
          <span className="ed-lib-crumb-cur" title={openCol?.path}>{folderName}</span>
          {isStick && stick?.chroma_color && (
            <span className="ed-lib-chroma" style={{ background: stick.chroma_color }} title={`Croma ${stick.chroma_color}: se quita al agregarlo`} />
          )}
          {!isStick && <UploadButton label="Subir" accept="video/*,image/*,audio/*" disabled={!!busy} title={`Subir archivos a ${openCol?.name || 'la carpeta'}`} onFiles={(f) => upload(f)} />}
        </div>
      ) : !searching && (
        <div className="ed-lib-actions">
          <button type="button" className="ghost small" onClick={() => setCreating('folder')}>
            <Icon name="create_new_folder" size={15} /> Carpeta
          </button>
          <button type="button" className="ghost small" onClick={() => setCreating('stick')}>
            <Icon name="accessibility_new" size={15} /> Nuevo stick
          </button>
        </div>
      )}

      {creating && !folder && <CreateForm mode={creating} onCreate={create} onCancel={() => setCreating(null)} />}

      {(folder || searching) && (
        <div className="ed-scope-filter">
          {chips.map((c) => {
            const n = counts[c.countKey]
            return (
              <button
                key={c.id || 'all'}
                type="button"
                className={`ed-tab ${kind === c.id ? 'on' : ''}`}
                onClick={() => setKind(c.id)}
              >
                {c.label}{n != null ? ` (${n})` : ''}
              </button>
            )
          })}
        </div>
      )}

      {busy && <div className="ed-lib-busy"><Icon name="hourglass_top" size={14} /> {busy}</div>}
      {err && <div className="ed-mat-err">{err}</div>}

      {/* Raíz: carpetas */}
      {!folder && !searching && (
        <FileDropZone className="ed-lib-scroll" hint="Entra en una carpeta para añadirle archivos"
          onFiles={() => setErr('Abre una carpeta (o crea una) y suelta ahí los archivos.')}>
          {loading ? <Empty text="Cargando…" />
            : visibleCols.length === 0 ? <Empty text="No hay carpetas. Crea una o un stick." />
              : (
                <div className="ed-lib-folder-grid">
                  {visibleCols.map((c) => (
                    <FolderCard key={c.id} col={c} stick={c.stick ? stickOf(c.id) : null} onOpen={() => openFolder(c.id)} />
                  ))}
                </div>
              )}
        </FileDropZone>
      )}

      {/* Carpeta stick: grupos por expresión (cada uno es zona de suelta) */}
      {folder && isStick && (
        <div className="ed-lib-scroll">
          {!stick || stick.id !== folder ? <Empty text="Cargando…" />
            : <EdLibraryStick detail={stick} kind={kind} q={q} busy={!!busy} onUpload={upload} onRecat={recategorize} onAdd={onAdd} di={di} />}
        </div>
      )}

      {/* Carpeta normal o búsqueda global */}
      {((folder && !isStick) || (!folder && searching)) && (
        <FileDropZone className="ed-lib-scroll" disabled={!folder || !!busy}
          hint={`Suelta para añadir a ${openCol?.name || 'la carpeta'}`} onFiles={(f) => upload(f)}>
          <div className="ed-mat-grid ed-lib-grid adaptive">
            {(res.items || []).length === 0
              ? <Empty text={searching ? 'Sin resultados.' : 'Carpeta vacía. Arrastra aquí vídeos, imágenes o audio.'} />
              : res.items.map((it) => (
                <CardFor key={it.id} item={withChroma(it)} onAdd={onAdd} onPlay={onPlay} di={di} />
              ))}
          </div>
          {(res.items || []).length > 0 && (
            <div className="ed-sfx-count">{res.total} recursos{!folder && !kind ? ` · ${visibleCols.length} carpetas activas` : ''}</div>
          )}
        </FileDropZone>
      )}
    </div>
  )
}
