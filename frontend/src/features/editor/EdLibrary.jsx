import { useState, useEffect, useCallback } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { setCollectionsRoot, searchCollections, updateCollection, pickFolder } from '../../services/api'
import { dragPayload, useToggle, bustUrl, Empty, clampAspect, AR_PLACEHOLDER, useMasonrySpan } from './MaterialClipGrid'

const KIND_CHIPS = [
  { id: '', label: 'Todo', countKey: 'all' },
  { id: 'video', label: 'Vídeos', countKey: 'video' },
  { id: 'image', label: 'Imágenes', countKey: 'image' },
  { id: 'gif', label: 'GIF', countKey: 'gif' },
  { id: 'audio', label: 'Audio', countKey: 'audio' },
]

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

export default function EdLibrary({ onAdd, onDragInfo, onPlay }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [data, setData] = useState({ available: true, root: null, counts: {}, items: [], collections: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [manage, setManage] = useState(false)
  const [err, setErr] = useState('')
  const di = onDragInfo || (() => {})

  const refresh = useCallback(async (query, k, quiet = false) => {
    if (!quiet) setLoading(true)
    try { setData(await searchCollections({ q: query, kind: k })) } catch { /* backend */ } finally { if (!quiet) setLoading(false) }
  }, [])

  useEffect(() => { refresh('', '') }, [refresh])
  useEffect(() => {
    const id = setTimeout(() => refresh(q, kind, true), 250)
    return () => clearTimeout(id)
  }, [q, kind, refresh])

  async function chooseRoot() {
    setErr('')
    setBusy(true)
    let path = null
    try { path = (await pickFolder()).path } catch { /* manual */ }
    if (!path) path = window.prompt('Pega la ruta de la carpeta raíz de material:', '')
    if (path) {
      try {
        await setCollectionsRoot(path)
        await refresh(q, kind, true)
      } catch (e) { setErr(e.message || 'Carpeta no válida.') }
    }
    setBusy(false)
  }

  async function toggleCollection(cid, patch) {
    try {
      await updateCollection(cid, patch)
      await refresh(q, kind, true)
    } catch (e) { setErr(e.message || 'No se pudo actualizar.') }
  }

  const cols = data.collections || []
  const counts = data.counts || {}

  if (!loading && !data.available) {
    return (
      <div className="ed-library">
        <div className="ed-mat-empty">
          <p>No hay carpeta raíz de material.</p>
          <button className="ghost small" onClick={chooseRoot} disabled={busy}>
            <Icon name="folder_open" size={15} /> {busy ? 'Elige…' : 'Seleccionar carpeta'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ed-library">
      <div className="ed-sfx-search">
        <Icon name="search" size={16} />
        <input placeholder="Buscar en toda la biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar material" />
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

      <div className="ed-scope-filter">
        {KIND_CHIPS.map((c) => {
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

      {err && <div className="ed-mat-err">{err}</div>}

      {manage && (
        <div className="ed-lib-folders">
          <div className="ed-lib-folders-head">
            <span>Carpetas de material</span>
            <button className="ghost small" onClick={chooseRoot} disabled={busy} title="Cambiar la carpeta raíz">
              <Icon name="folder_open" size={14} /> Raíz
            </button>
          </div>
          {data.root && <div className="ed-lib-root" title={data.root}>{data.root}</div>}
          {cols.length === 0
            ? <div className="ed-lib-empty">No hay subcarpetas. Crea carpetas dentro de la raíz (scientist_stick, fondos, fx…).</div>
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
                <span className="ed-lib-folder-name" title={c.path}>{c.name}</span>
                <span className="ed-lib-folder-count">{c.count}</span>
                <label className="ed-lib-toggle" title={c.enabled ? 'Activa' : 'Oculta'}>
                  <input type="checkbox" checked={c.enabled} onChange={() => toggleCollection(c.id, { enabled: !c.enabled })} />
                  <Icon name={c.enabled ? 'visibility' : 'visibility_off'} size={15} />
                </label>
              </div>
            ))}
        </div>
      )}

      <div className="ed-mat-grid ed-lib-grid adaptive">
        {loading ? <Empty text="Cargando…" />
          : (data.items || []).length === 0 ? <Empty text={q ? 'Sin resultados.' : 'Sin material. Añade carpetas dentro de la raíz.'} />
            : data.items.map((it) => (
              <CardFor key={it.id} item={it} onAdd={onAdd} onPlay={onPlay} di={di} />
            ))}
      </div>
      {!loading && (data.items || []).length > 0 && (
        <div className="ed-sfx-count">{data.total} recursos{kind ? '' : ` · ${cols.filter((c) => c.enabled).length} carpetas activas`}</div>
      )}
    </div>
  )
}
