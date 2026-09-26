import { useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { dragPayload } from './MaterialClipGrid'

// Vista de una carpeta STICK dentro de la Biblioteca: cada expresión (Feliz,
// Triste…) es un grupo y a la vez una zona donde soltar vídeos/imágenes del
// explorador — se suben a su subcarpeta ya categorizados. Las tarjetas se
// arrastran a la timeline (o «+») y nacen con el croma del personaje; el
// selector de cada tarjeta la recategoriza sin mover el archivo.

// ¿Arrastre de archivos del sistema (no de material interno)?
export function isOsFileDrag(e) {
  const types = [...(e.dataTransfer?.types || [])]
  return types.includes('Files') && !types.includes('application/x-material')
}

// Zona que acepta archivos soltados desde el explorador. Corta la propagación
// para que el panel no los importe también al proyecto ni los suba dos zonas.
export function FileDropZone({ onFiles, hint, className = '', disabled = false, children }) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const take = (e) => !disabled && isOsFileDrag(e)
  return (
    <div
      className={`ed-lib-drop ${className}${over ? ' drop-over' : ''}`}
      onDragEnter={(e) => { if (!take(e)) return; e.preventDefault(); e.stopPropagation(); depth.current += 1; setOver(true) }}
      onDragOver={(e) => { if (!take(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={(e) => {
        if (!take(e)) return
        e.stopPropagation()
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDrop={(e) => {
        if (!take(e)) return
        e.preventDefault()
        e.stopPropagation()
        depth.current = 0
        setOver(false)
        const files = [...(e.dataTransfer.files || [])]
        if (files.length) onFiles(files)
      }}
    >
      {children}
      {over && hint && (
        <div className="ed-lib-drop-hint" aria-hidden="true">
          <Icon name="upload" size={18} /> {hint}
        </div>
      )}
    </div>
  )
}

// Botón «Subir» con selector de archivos (alternativa a arrastrar).
export function UploadButton({ onFiles, title = 'Subir vídeos o imágenes', label = '', accept = 'video/*,image/*', disabled = false }) {
  const input = useRef(null)
  return (
    <>
      <button type="button" className={label ? 'ghost small' : 'icon-btn'} title={title} disabled={disabled}
        onClick={() => input.current?.click()}>
        <Icon name="upload" size={15} />{label ? ` ${label}` : null}
      </button>
      <input ref={input} type="file" multiple accept={accept} hidden
        onChange={(e) => {
          const files = [...(e.target.files || [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }} />
    </>
  )
}

// Recurso de un stick → item que entienden addAsset/dragPayload, con su croma.
export function stickAssetItem(it, duration) {
  const d = duration || it.duration || 0
  return { ...it, scope: 'collection', label: it.title || it.name, duration: d, end: d, chromaColor: it.chroma_color }
}

function StickTile({ item, expressions, onAdd, onRecat, di }) {
  const vid = useRef(null)
  const [dur, setDur] = useState(0)
  const isVideo = item.stick_kind === 'video'
  const assetKind = isVideo ? 'clips' : 'images'
  const play = () => { const v = vid.current; if (v) { try { v.currentTime = 0 } catch { /* aún no */ } v.play().catch(() => {}) } }
  const stop = () => vid.current?.pause()
  return (
    <div
      className="ed-lib-stile"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-material', dragPayload(assetKind, stickAssetItem(item, dur)))
        di?.({ kind: isVideo ? 'video' : 'image', duration: isVideo ? (dur || 1) : 3, name: item.title })
      }}
      onDragEnd={() => di?.(null)}
      onMouseEnter={isVideo ? play : undefined}
      onMouseLeave={isVideo ? stop : undefined}
      title={item.rel}
    >
      <div className="ed-stick-thumb">
        {isVideo ? (
          <video ref={vid} src={item.url} muted loop playsInline preload="metadata"
            onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d) }} />
        ) : (
          <img src={item.url} alt={item.title} loading="lazy" draggable={false} />
        )}
        {isVideo && dur > 0 && <span className="ed-stick-dur">{fmt(dur)}</span>}
        <button type="button" className="ed-add-corner" title="Agregar al proyecto (con croma)"
          onClick={(e) => { e.stopPropagation(); onAdd(assetKind, stickAssetItem(item, dur)) }}>
          <Icon name="add" size={16} />
        </button>
      </div>
      <span className="ed-stick-card-title">{item.title}</span>
      <select className="ed-lib-stile-expr" value={item.expression} title="Cambiar de expresión"
        onChange={(e) => onRecat(item, e.target.value)} onClick={(e) => e.stopPropagation()}>
        {expressions.map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.label}</option>)}
      </select>
    </div>
  )
}

export default function EdLibraryStick({ detail, kind = '', q = '', busy = false, onUpload, onRecat, onAdd, di }) {
  const needle = q.trim().toLowerCase()
  const matches = (it) => (!kind || it.stick_kind === kind)
    && (!needle || needle.split(/\s+/).every((tok) => `${it.title} ${it.name}`.toLowerCase().includes(tok)))
  const groups = (detail.groups || [])
    .map((g) => ({ ...g, items: g.items.filter(matches) }))
    // Buscando, solo los grupos con resultados; si no, todos (los vacíos son zonas donde soltar).
    .filter((g) => !needle || g.items.length)

  if (needle && groups.length === 0) return <div className="ed-lib-empty">Sin resultados en este stick.</div>

  return (
    <div className="ed-lib-xgroups">
      {groups.map((g) => (
        <FileDropZone key={g.id} className="ed-lib-xgroup" disabled={busy}
          hint={`Soltar en ${g.emoji} ${g.label}`} onFiles={(files) => onUpload(files, g.id)}>
          <div className="ed-lib-xgroup-h">
            <span className="ed-stick-emoji">{g.emoji}</span>
            <span className="ed-lib-xgroup-name">{g.label}</span>
            <span className="ed-stick-group-count">{g.items.length}</span>
            <UploadButton disabled={busy} title={`Subir a ${g.label}`} onFiles={(files) => onUpload(files, g.id)} />
          </div>
          {g.items.length ? (
            <div className="ed-lib-xtiles">
              {g.items.map((it) => (
                <StickTile key={it.id} item={it} expressions={detail.expressions || []} onAdd={onAdd} onRecat={onRecat} di={di} />
              ))}
            </div>
          ) : (
            <div className="ed-lib-xempty">Arrastra aquí vídeos o imágenes «{g.label.toLowerCase()}»</div>
          )}
        </FileDropZone>
      ))}
    </div>
  )
}
