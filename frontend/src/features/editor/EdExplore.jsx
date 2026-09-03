import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import AnchoredMenu from '../../components/AnchoredMenu'
import { getSettings, searchExplore, importExplore, suggestExploreKeywords } from '../../services/api'
import {
  MEDIA_FILTERS, PROVIDER_FILTERS,
  kindLabel, providerLabel, formatExploreMeta, filterExploreItems,
  readRecent, pushRecent, readExploreSession, writeExploreSession,
  collectThemeText, themeSuggestions,
} from './exploreModel.js'

function ChipRow({ items, value, onChange }) {
  return (
    <div className="ed-scope-filter">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`ed-tab ${value === it.id ? 'on' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

function ExploreCard({ item, onView, onAdd, onMenu, adding }) {
  const [hover, setHover] = useState(false)
  const vidRef = useRef(null)
  const isVideo = item.kind === 'video'
  const isGif = item.kind === 'gif'
  const playPreview = hover && isVideo && item.preview_url
  const gifSrc = (hover && item.preview_url) || item.thumb_url || item.preview_url
  const meta = formatExploreMeta(item)

  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    if (playPreview) {
      v.currentTime = 0
      v.play().catch(() => {})
    } else {
      try { v.pause() } catch { /* noop */ }
    }
  }, [playPreview])

  return (
    <div
      className="ed-card grid ed-explore-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onView(item)}
    >
      <div className="ed-card-media">
        {playPreview ? (
          <video ref={vidRef} src={item.preview_url} poster={item.thumb_url || undefined} muted loop playsInline preload="metadata" />
        ) : (
          <img src={isGif ? gifSrc : (item.thumb_url || item.preview_url)} alt="" draggable={false} />
        )}
        {isGif && <span className="ed-explore-badge">GIF</span>}
        <div className="ed-explore-actions">
          <button type="button" className="ed-play-ov" title="Ver" onClick={(e) => { e.stopPropagation(); onView(item) }}>
            <Icon name="play_arrow" size={18} />
          </button>
          <button
            type="button"
            className="ed-add-corner"
            title="Agregar al proyecto"
            disabled={adding}
            onClick={(e) => { e.stopPropagation(); onAdd(item) }}
          >
            <Icon name={adding ? 'hourglass_empty' : 'add'} size={16} />
          </button>
          <button
            type="button"
            className="ed-menu-corner"
            title="Opciones"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(e, item) }}
          >
            <Icon name="more_vert" size={15} />
          </button>
        </div>
      </div>
      <div className="ed-card-name" title={`${providerLabel(item.provider)} · ${kindLabel(item.kind)}`}>
        {providerLabel(item.provider)} · {kindLabel(item.kind)}
      </div>
      {meta ? <div className="ed-card-desc" title={meta}>{meta}</div> : null}
    </div>
  )
}

function ExplorePreview({ item, onClose, onAdd, adding }) {
  const isVideo = item.kind === 'video'
  const src = item.preview_url || item.download_url || item.thumb_url
  const meta = formatExploreMeta(item)
  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ed-explore-preview" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{item.title || `${providerLabel(item.provider)} · ${kindLabel(item.kind)}`}</h3>
          <button type="button" className="icon-btn" onClick={onClose} title="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <div className="ed-explore-preview-media">
          {isVideo ? (
            <video src={src} poster={item.thumb_url || undefined} controls playsInline muted autoPlay />
          ) : (
            <img src={item.preview_url || item.download_url || item.thumb_url} alt="" />
          )}
        </div>
        <p className="muted ed-explore-preview-meta">
          {providerLabel(item.provider)} · {kindLabel(item.kind)}
          {meta ? ` · ${meta}` : ''}
          {item.author ? ` · ${item.author}` : ''}
        </p>
        {item.license_info ? <p className="muted ed-explore-preview-meta">{item.license_info}</p> : null}
        <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="ghost" onClick={onClose}>Cerrar</button>
          <button type="button" className="primary" disabled={adding} onClick={() => onAdd(item)}>
            <Icon name="add" size={16} /> Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EdExplore({
  projectId, project, timelineClips, onImported, onToast, onOpenSettings, active = true,
}) {
  const boot = useRef(readExploreSession())
  const [draft, setDraft] = useState(boot.current.draft)
  const [q, setQ] = useState(boot.current.q)
  const [media, setMedia] = useState(boot.current.media)
  const [provider, setProvider] = useState(boot.current.provider)
  const [items, setItems] = useState(boot.current.items)
  const [page, setPage] = useState(boot.current.page)
  const [hasMore, setHasMore] = useState(boot.current.hasMore)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [warning, setWarning] = useState(boot.current.warning)
  const [searched, setSearched] = useState(boot.current.searched)
  const [recent, setRecent] = useState(() => readRecent())
  const [configured, setConfigured] = useState(boot.current.configured)
  const [preview, setPreview] = useState(null)
  const [addingId, setAddingId] = useState(null)
  const [menu, setMenu] = useState(null)
  const inputRef = useRef(null)
  const reqRef = useRef(0)
  const skipFilterSearch = useRef(true)
  const themeText = useMemo(
    () => collectThemeText({ project, timelineClips }),
    [project, timelineClips],
  )
  const localChips = useMemo(() => themeSuggestions(themeText), [themeText])
  const [chips, setChips] = useState(localChips)

  useEffect(() => { setChips(localChips) }, [localChips])

  useEffect(() => {
    if (!active || !themeText.trim()) return undefined
    let cancelled = false
    const t = setTimeout(() => {
      suggestExploreKeywords(projectId, themeText).then((res) => {
        if (cancelled || !Array.isArray(res?.keywords) || !res.keywords.length) return
        if (res.source === 'classic') return
        setChips(res.keywords)
      }).catch(() => {})
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [active, projectId, themeText])

  useEffect(() => {
    getSettings().then((s) => {
      const keys = s.api_keys && typeof s.api_keys === 'object' ? s.api_keys : {}
      setConfigured({ pexels: !!keys.pexels, giphy: !!keys.giphy })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    writeExploreSession({
      draft, q, media, provider, items, page, hasMore, warning, searched, configured,
    })
  }, [draft, q, media, provider, items, page, hasMore, warning, searched, configured])

  useEffect(() => {
    if (active) return
    setPreview(null)
    setMenu(null)
  }, [active])

  const runSearch = useCallback(async ({ query, mediaType, providerId, pageNum = 1, append = false } = {}) => {
    const text = String(query ?? '').trim()
    if (!text) return
    const id = ++reqRef.current
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await searchExplore({
        q: text,
        page: pageNum,
        media: mediaType,
        provider: providerId,
      })
      if (id !== reqRef.current) return
      const next = res.items || []
      setItems((prev) => append ? [...prev, ...next.filter((n) => !prev.some((p) => p.id === n.id))] : next)
      setHasMore(!!res.has_more)
      setPage(pageNum)
      setWarning(res.warning || (res.partial ? 'Algunas fuentes no están disponibles.' : null))
      if (res.configured) setConfigured(res.configured)
      setSearched(true)
      setQ(text)
      setRecent(pushRecent(text))
    } catch (e) {
      if (id !== reqRef.current) return
      setItems([])
      setHasMore(false)
      setSearched(true)
      setWarning(e.message || 'No se pudo buscar.')
    } finally {
      if (id === reqRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  function submit(text = draft) {
    const query = String(text || '').trim()
    if (!query) return
    setDraft(query)
    runSearch({ query, mediaType: media, providerId: provider, pageNum: 1 })
  }

  useEffect(() => {
    if (skipFilterSearch.current) {
      skipFilterSearch.current = false
      return
    }
    if (!searched || !q) return
    runSearch({ query: q, mediaType: media, providerId: provider, pageNum: 1 })
  }, [media, provider]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = filterExploreItems(items, media, provider)
  const noKeys = !configured.pexels && !configured.giphy

  async function addItem(item) {
    if (!projectId || addingId) return
    setAddingId(item.id)
    try {
      const res = await importExplore(projectId, item)
      const kind = res.kind === 'clips' ? 'Vídeo' : (item.kind === 'gif' ? 'GIF' : 'Imagen')
      onToast?.({ type: 'success', message: `${kind} agregado al proyecto.` })
      onImported?.(res)
      setMenu(null)
    } catch (e) {
      onToast?.({ type: 'error', message: e.message || 'No se pudo agregar.' })
    } finally {
      setAddingId(null)
    }
  }

  async function copyLink(item) {
    setMenu(null)
    const url = item.source_url || item.download_url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      onToast?.({ type: 'success', message: 'Enlace copiado.' })
    } catch {
      onToast?.({ type: 'error', message: 'No se pudo copiar.' })
    }
  }

  return (
    <div className="ed-explore">
      <div className="ed-explore-head">
        <form className="ed-sfx-search" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Buscar fotos, videos o GIFs..."
            aria-label="Buscar material"
          />
          <button type="submit" className="ghost small" disabled={loading || !draft.trim()}>Buscar</button>
        </form>
        <ChipRow items={MEDIA_FILTERS} value={media} onChange={setMedia} />
        <ChipRow items={PROVIDER_FILTERS} value={provider} onChange={setProvider} />
        {warning && searched && shown.length > 0 && (
          <div className="ed-explore-warn"><Icon name="warning" size={14} /> {warning}</div>
        )}
      </div>

      <div className="ed-explore-results">
        {loading && (
          <div className="ed-explore-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="ed-card grid ed-explore-skel">
                <div className="ed-card-media" />
                <div className="ed-card-name"> </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !searched && (
          <div className="ed-mat-empty ed-explore-empty">
            <Icon name="travel_explore" size={28} />
            <strong>Busca material para tu proyecto</strong>
            <span>Fotos, videos y GIFs</span>
            {noKeys && (
              <button type="button" className="ghost small" onClick={onOpenSettings}>
                Configura Pexels y GIPHY en Ajustes
              </button>
            )}
            <p className="ed-explore-hint">Prueba con:</p>
            <div className="ed-explore-chips">
              {chips.map((s) => (
                <button key={s} type="button" className="ed-chip" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
            {recent.length > 0 && (
              <>
                <p className="ed-explore-hint">Búsquedas recientes</p>
                <div className="ed-explore-chips">
                  {recent.map((s) => (
                    <button key={s} type="button" className="ed-chip" onClick={() => submit(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!loading && searched && shown.length === 0 && (
          <div className="ed-mat-empty ed-explore-empty">
            {warning ? (
              <>
                <Icon name="warning" size={22} />
                <strong>{warning}</strong>
                {noKeys && (
                  <button type="button" className="ghost small" onClick={onOpenSettings}>
                    Abrir Ajustes
                  </button>
                )}
              </>
            ) : (
              <>
                <strong>No encontramos material para '{q}'.</strong>
                <span>Prueba con otra búsqueda.</span>
              </>
            )}
            <div className="ed-explore-chips">
              {chips.filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 5).map((s) => (
                <button key={s} type="button" className="ed-chip" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {!loading && shown.length > 0 && (
          <>
            <div className="ed-explore-grid">
              {shown.map((item) => (
                <ExploreCard
                  key={item.id}
                  item={item}
                  adding={addingId === item.id}
                  onView={setPreview}
                  onAdd={addItem}
                  onMenu={(e, it) => setMenu({ x: e.clientX, y: e.clientY, item: it })}
                />
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                className="ghost small ed-explore-more"
                disabled={loadingMore}
                onClick={() => runSearch({ query: q, mediaType: media, providerId: provider, pageNum: page + 1, append: true })}
              >
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            )}
          </>
        )}
      </div>

      {preview && (
        <ExplorePreview
          item={preview}
          adding={addingId === preview.id}
          onClose={() => setPreview(null)}
          onAdd={addItem}
        />
      )}

      {menu && (
        <>
          <div className="ed-ctx-backdrop" onPointerDown={() => setMenu(null)} />
          <AnchoredMenu className="ed-ctx-menu" x={menu.x} y={menu.y}>
            <button type="button" onClick={() => { setPreview(menu.item); setMenu(null) }}>
              <Icon name="play_arrow" size={15} /> Ver
            </button>
            <button type="button" onClick={() => addItem(menu.item)}>
              <Icon name="add" size={15} /> Agregar
            </button>
            <button type="button" onClick={() => copyLink(menu.item)}>
              <Icon name="content_copy" size={15} /> Copiar enlace
            </button>
            {menu.item.source_url && (
              <button type="button" onClick={() => { window.open(menu.item.source_url, '_blank', 'noopener'); setMenu(null) }}>
                <Icon name="open_in_new" size={15} /> Abrir origen
              </button>
            )}
          </AnchoredMenu>
        </>
      )}
    </div>
  )
}
