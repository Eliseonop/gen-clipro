import { useState, useEffect, useRef, useCallback } from 'react'
import Icon from './Icon'
import { fmt } from './utils'
import { listSfx, setSfxFolder, pickFolder } from './api'

// Panel izquierdo (biblioteca): Video | Audio | Sound Effects.
export default function EdMaterial({ project, onAdd, onDragInfo }) {
  const [tab, setTab] = useState('video')
  const clips = project.clips || []
  const audios = project.audios || []
  const activeMedia = useRef(null)

  const onPlayMedia = useCallback((el) => {
    if (activeMedia.current && activeMedia.current !== el) {
      try { activeMedia.current.pause() } catch { /* noop */ }
    }
    activeMedia.current = el
  }, [])

  const di = onDragInfo || (() => {})

  return (
    <div className="ed-material">
      <div className="ed-mat-tabs">
        <button className={`ed-tab ${tab === 'video' ? 'on' : ''}`} onClick={() => setTab('video')}>
          <Icon name="movie" size={15} /> Video <span className="ed-count">{clips.length}</span>
        </button>
        <button className={`ed-tab ${tab === 'audio' ? 'on' : ''}`} onClick={() => setTab('audio')}>
          <Icon name="mic" size={15} /> Audio <span className="ed-count">{audios.length}</span>
        </button>
        <button className={`ed-tab ${tab === 'sfx' ? 'on' : ''}`} onClick={() => setTab('sfx')}>
          <Icon name="graphic_eq" size={15} /> SFX
        </button>
      </div>

      {tab === 'video' && (
        <div className="ed-mat-grid">
          {clips.length === 0
            ? <Empty text="Sin clips. Crea clips en la pestaña Vídeo." />
            : clips.map((c) => <VideoCard key={c.index} clip={c} onAdd={() => onAdd('clips', c)} onPlay={onPlayMedia} di={di} />)}
        </div>
      )}

      {tab === 'audio' && (
        <div className="ed-mat-list">
          {audios.length === 0
            ? <Empty text="Sin audios. Genera narración en la pestaña Audio." />
            : audios.map((a) => <AudioCard key={a.id} audio={a} onAdd={() => onAdd('audios', a)} onPlay={onPlayMedia} di={di} />)}
        </div>
      )}

      {tab === 'sfx' && <SfxTab onAdd={onAdd} onPlay={onPlayMedia} di={di} />}
    </div>
  )
}

function dragPayload(assetKind, item) {
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

function useToggle(onPlay) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const toggle = (e) => {
    e?.stopPropagation()
    const m = ref.current
    if (!m) return
    if (m.paused) { onPlay(m); m.play().catch(() => {}) } else m.pause()
  }
  return { ref, playing, setPlaying, toggle }
}

function VideoCard({ clip, onAdd, onPlay, di }) {
  const { ref, playing, setPlaying, toggle } = useToggle(onPlay)
  return (
    <div className="ed-card grid video"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-material', dragPayload('clips', clip)); di?.({ kind: 'video', duration: clip.end - clip.start, name: clip.label || `Clip #${clip.index}` }) }}
      onDragEnd={() => di?.(null)}>
      <div className="ed-card-media">
        <video ref={ref} src={clip.url} preload="metadata" playsInline
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        <button className="ed-play-ov" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
        </button>
        <button className="ed-add-corner" onClick={(e) => { e.stopPropagation(); onAdd() }} title="Agregar al proyecto">
          <Icon name="add" size={16} />
        </button>
        <span className="ed-card-dur">{fmt(clip.end - clip.start)}</span>
      </div>
      <div className="ed-card-name" title={clip.filename}>{clip.label || `Clip #${clip.index}`}</div>
    </div>
  )
}

function SfxCard({ sfx, onAdd, onPlay, di }) {
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
      <button className="ed-play-round" onClick={toggle} title={playing ? 'Pausa' : 'Reproducir'}>
        <Icon name={playing ? 'pause' : 'play_arrow'} size={16} />
      </button>
      <div className="ed-sfx-info">
        <span className="ed-sfx-name" title={sfx.name}>{sfx.name}</span>
        <span className="ed-sfx-sub">{sfx.category}{dur != null ? ` · ${fmt(dur)}` : ''}</span>
      </div>
      <button className="ed-add-btn" onClick={(e) => { e.stopPropagation(); onAdd() }} title="Agregar al proyecto">
        <Icon name="add" size={15} />
      </button>
    </div>
  )
}

function AudioCard({ audio, onAdd, onPlay, di }) {
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
      <button className="ed-add-btn" onClick={onAdd} title="Agregar al proyecto"><Icon name="add" size={15} /></button>
    </div>
  )
}

function SfxTab({ onAdd, onPlay, di }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState({ available: true, items: [], categories: [], total: 0 })
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (query, cat) => {
    setLoading(true)
    try { setData(await listSfx(query, cat)) } catch { /* backend */ } finally { setLoading(false) }
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

  return (
    <div className="ed-sfx">
      <div className="ed-sfx-search">
        <Icon name="search" size={16} />
        <input placeholder="Buscar (explosion, laugh…)" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="icon-btn" onClick={() => setQ('')}><Icon name="close" size={15} /></button>}
      </div>
      <select className="select mini ed-sfx-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">Todas las categorías</option>
        {data.categories.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.count})</option>)}
      </select>

      <div className="ed-mat-grid ed-sfx-grid">
        {loading ? <Empty text="Cargando…" />
          : data.items.length === 0 ? <Empty text="Sin resultados." />
            : data.items.map((s) => <SfxCard key={s.id} sfx={s} onAdd={() => onAdd('sfx', s)} onPlay={onPlay} di={di} />)}
      </div>
      {!loading && <div className="ed-sfx-count">{data.total} sonidos</div>}
    </div>
  )
}

function Empty({ text }) {
  return <div className="ed-mat-empty grid-full">{text}</div>
}
