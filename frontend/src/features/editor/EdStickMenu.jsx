import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { listSticks, getStick } from '../../services/api'

// Menú "Agregar Stick" desde la línea de tiempo (§1-§5 del flujo pedido):
//   personaje  →  Vídeo / Imagen  →  galería de expresiones (variantes en
//   horizontal, hover para previsualizar). Al elegir una, el clip se agrega con
//   croma ya configurado. Todo sin salir de la timeline ni abrir la Biblioteca.
//
// props: { x, y, onPick(item), onClose }
//   onPick recibe un item de colección + { chromaColor, duration } para makeClip.

const KIND_LABEL = { video: 'Vídeo', image: 'Imagen' }
const KIND_ICON = { video: 'movie', image: 'image' }

// Tarjeta de una expresión: miniatura (vídeo con autoplay al pasar el cursor) +
// título. Al hacer clic la agrega.
function StickCard({ item, chromaColor, onPick }) {
  const vidRef = useRef(null)
  const [dur, setDur] = useState(0)
  const isVideo = item.kind === 'video'

  function enter() {
    const v = vidRef.current
    if (v) { try { v.currentTime = 0 } catch { /* not ready */ } ; v.play().catch(() => {}) }
  }
  function leave() {
    const v = vidRef.current
    if (v) { v.pause() }
  }

  return (
    <button
      type="button"
      className="ed-stick-card"
      title={item.title}
      onMouseEnter={isVideo ? enter : undefined}
      onMouseLeave={isVideo ? leave : undefined}
      onFocus={isVideo ? enter : undefined}
      onBlur={isVideo ? leave : undefined}
      onClick={() => onPick({ ...item, label: item.title, duration: dur || item.duration || 0, end: dur || item.duration || 0, chromaColor })}
    >
      <div className="ed-stick-thumb">
        {isVideo ? (
          <video
            ref={vidRef}
            src={item.url}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d) }}
          />
        ) : (
          <img src={item.url} alt={item.title} loading="lazy" draggable={false} />
        )}
        {isVideo && dur > 0 && <span className="ed-stick-dur">{fmt(dur)}</span>}
      </div>
      <span className="ed-stick-card-title">{item.title}</span>
    </button>
  )
}

export default function EdStickMenu({ x, y, onPick, onClose }) {
  const [sticks, setSticks] = useState(null)   // null = cargando
  const [stickId, setStickId] = useState('')
  const [kind, setKind] = useState('')
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const cache = useRef(new Map())

  // Personajes disponibles (colecciones con stick.json). Autoselecciona el primero.
  useEffect(() => {
    let alive = true
    listSticks()
      .then((r) => {
        if (!alive) return
        const list = r.sticks || []
        setSticks(list)
        if (list[0]) setStickId(list[0].id)
        else setError(r.available ? 'No hay sticks. Crea uno en Biblioteca → «Nuevo stick».' : 'No hay carpeta de biblioteca configurada.')
      })
      .catch((e) => { if (alive) setError(e?.message || 'No se pudieron cargar los sticks.') })
    return () => { alive = false }
  }, [])

  // Detalle del stick elegido (cacheado). Autoselecciona el tipo con más recursos.
  useEffect(() => {
    if (!stickId) return undefined
    let alive = true
    const cached = cache.current.get(stickId)
    if (cached) {
      setDetail(cached)
      setKind((cached.kinds.video ? 'video' : 'image'))
      return undefined
    }
    setLoadingDetail(true)
    getStick(stickId)
      .then((d) => {
        if (!alive) return
        cache.current.set(stickId, d)
        setDetail(d)
        setKind(d.kinds.video ? 'video' : 'image')
      })
      .catch((e) => { if (alive) setError(e?.message || 'No se pudo cargar el stick.') })
      .finally(() => { if (alive) setLoadingDetail(false) })
    return () => { alive = false }
  }, [stickId])

  const groups = detail && kind ? (detail[kind] || []) : []
  const chromaColor = detail?.chroma_color || '#00FF00'

  // Ancla el menú pero sin salirse de la ventana (es ancho: 3 columnas).
  const MENU_W = 600
  const MENU_H = 440
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const left = Math.max(8, Math.min(x, vw - MENU_W - 12))
  const top = Math.max(8, Math.min(y, vh - MENU_H - 12))

  // Cierra con Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <>
      <div
        className="ed-ctx-backdrop"
        onPointerDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose?.() }}
      />
      <div className="ed-stick-menu" style={{ left, top }} role="dialog" aria-label="Agregar Stick">
        {/* Columna 1: personajes */}
        <div className="ed-stick-col ed-stick-chars">
          <div className="ed-stick-col-h">Stick</div>
          {sticks == null && <div className="ed-stick-loading">Cargando…</div>}
          {sticks && sticks.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ed-stick-row${s.id === stickId ? ' on' : ''}`}
              onClick={() => setStickId(s.id)}
              onMouseEnter={() => setStickId(s.id)}
            >
              <span className="ed-stick-emoji">{s.emoji || '🎭'}</span>
              <span className="ed-stick-row-name">{s.name}</span>
              <span className="ed-stick-row-count">{s.count}</span>
            </button>
          ))}
          {error && <div className="ed-stick-err">{error}</div>}
        </div>

        {/* Columna 2: tipo de recurso */}
        {detail && (
          <div className="ed-stick-col ed-stick-kinds">
            <div className="ed-stick-col-h">Tipo</div>
            {['video', 'image'].filter((k) => detail.kinds[k] > 0).map((k) => (
              <button
                key={k}
                type="button"
                className={`ed-stick-row${k === kind ? ' on' : ''}`}
                onClick={() => setKind(k)}
                onMouseEnter={() => setKind(k)}
              >
                <Icon name={KIND_ICON[k]} size={16} />
                <span className="ed-stick-row-name">{KIND_LABEL[k]}</span>
                <span className="ed-stick-row-count">{detail.kinds[k]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Columna 3: galería de expresiones */}
        <div className="ed-stick-col ed-stick-gallery">
          <div className="ed-stick-col-h">
            {detail ? `${detail.name} · ${KIND_LABEL[kind] || ''}` : 'Expresiones'}
          </div>
          <div className="ed-stick-gallery-body">
            {loadingDetail && <div className="ed-stick-loading">Cargando expresiones…</div>}
            {!loadingDetail && groups.length === 0 && detail && (
              <div className="ed-stick-loading">Sin {KIND_LABEL[kind]?.toLowerCase() || 'recursos'} en este stick.</div>
            )}
            {!loadingDetail && groups.map((g) => (
              <div key={g.id} className="ed-stick-group">
                <div className="ed-stick-group-h">
                  <span className="ed-stick-emoji">{g.emoji}</span> {g.label}
                  <span className="ed-stick-group-count">{g.items.length}</span>
                </div>
                <div className="ed-stick-variants">
                  {g.items.map((it) => (
                    <StickCard key={it.id} item={it} chromaColor={chromaColor} onPick={onPick} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="ed-stick-foot">
            <Icon name="auto_fix_high" size={13} /> Se agrega con fondo por croma ya activado
          </div>
        </div>
      </div>
    </>
  )
}
