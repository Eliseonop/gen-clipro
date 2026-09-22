import { useEffect, useMemo, useRef, useState } from 'react'
import { motionTemplatePreviewUrl } from '../../services/api'

// Árbol de categorías de la biblioteca (orden + etiqueta + nota). Las que aún no
// tienen plantillas se muestran como "Próximamente" para dejar ver la estructura
// y dónde entrarán las siguientes tandas de componentes.
// Las visuales van primero: son las que se quieren por defecto (el recurso es la
// composición, no el texto). Las claves salen de templates/visual.py.
const CATEGORIES = [
  { key: 'user', label: 'Mis plantillas', note: 'Composiciones que guardaste desde Generar recurso' },
  { key: 'list', label: 'Listas', note: 'Pilas que caen, cuadrículas y filas editoriales' },
  { key: 'compare', label: 'Comparaciones', note: 'Cara a cara y antes / después' },
  { key: 'diagram', label: 'Diagramas', note: 'Procesos, árboles y mapas conceptuales' },
  { key: 'time', label: 'Tiempo', note: 'Timelines e hitos fechados' },
  { key: 'asset', label: 'Assets', note: 'Tus PNG e imágenes como protagonistas' },
  { key: 'concept', label: 'Conceptuales', note: 'Anotaciones, piezas que se ensamblan' },
  { key: 'story', label: 'Historias', note: 'Stickman animados a partir de tu guion (pestaña Historia)' },
  { key: 'captions', label: 'Subtítulos', note: 'Texto sincronizado con la voz' },
  { key: 'titles', label: 'Títulos', note: 'Titulares, antetítulos e introducciones' },
  { key: 'text', label: 'Texto', note: 'Listas, citas y bloques de texto' },
  { key: 'callouts', label: 'Llamadas', note: 'Flechas, círculos, resaltados y punteros' },
  { key: 'data', label: 'Datos', note: 'Cifras, contadores y gráficos' },
  { key: 'science', label: 'Ciencia', note: 'Ecuaciones, papers, diagramas y líneas de tiempo' },
  { key: 'code', label: 'Código / UI', note: 'Ventanas de código, terminal e interfaces' },
  { key: 'social', label: 'Social / Rótulos', note: 'CTAs, lower-thirds e identificación' },
  { key: 'images', label: 'Imágenes', note: 'Zoom, paneo, parallax y reveals (requiere capa de imagen)' },
  { key: 'transitions', label: 'Transiciones', note: 'Entre clips (subsistema del timeline)' },
  { key: 'vfx', label: 'VFX', note: 'Grano, viñeta y luz (superposición)' },
  { key: 'experimental', label: 'Experimental', note: 'Glitch, neón y estilos llamativos' },
]

const THEME_OPTIONS = [
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Oscuro' },
  { key: 'editorial', label: 'Editorial' },
]

// Preview en vivo de UNA plantilla: iframe con el motor real (mismo HTML que el
// render → fiel), reproducido en bucle. El lienzo (1080×1920) se escala para caber
// en la tarjeta (mismo origen → lo ajustamos desde aquí). Se pausa mientras no
// está visible para no saturar la CPU con varios iframes a la vez.
function TemplatePreview({ pid, tkey, theme, w, h }) {
  const ref = useRef(null)
  const [ready, setReady] = useState(false)
  const url = motionTemplatePreviewUrl(pid, tkey, { theme, w, h })

  const fitStage = () => {
    const el = ref.current
    const doc = el?.contentDocument
    const stage = doc?.getElementById('stage')
    if (!el || !doc || !stage) return
    doc.documentElement.style.height = '100%'
    doc.body.style.height = '100%'
    doc.body.style.display = 'flex'
    doc.body.style.alignItems = 'center'
    doc.body.style.justifyContent = 'center'
    const cw = el.clientWidth || 1, ch = el.clientHeight || 1
    const cW = Number(stage.style.width.replace('px', '')) || w
    const cH = Number(stage.style.height.replace('px', '')) || h
    const s = Math.min(cw / cW, ch / cH)
    stage.style.flex = '0 0 auto'
    stage.style.transform = `scale(${s > 0 && isFinite(s) ? s : 1})`
    stage.style.transformOrigin = 'center center'
  }

  const onLoad = () => {
    const win = ref.current?.contentWindow
    if (!win) return
    let n = 60
    const wait = () => {
      if (win.__motionReady) {
        fitStage()
        try { win.__loop = true; win.__play(0) } catch { /* noop */ }
        setReady(true)
      } else if (n-- > 0) setTimeout(wait, 30)
    }
    wait()
  }

  // Reajuste al redimensionar + pausa/reanuda según visibilidad de la tarjeta.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => fitStage())
    ro.observe(el)
    const io = new IntersectionObserver((entries) => {
      const win = el.contentWindow
      if (!win || !win.__play) return
      try {
        if (entries[0].isIntersecting) { win.__loop = true; win.__play() }
        else win.__pause?.()
      } catch { /* noop */ }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <div className="mtpl-preview">
      <iframe
        ref={ref} src={url} title={`Plantilla ${tkey}`} onLoad={onLoad}
        loading="lazy" sandbox="allow-scripts allow-same-origin"
      />
      {!ready && <span className="mtpl-preview-loading" />}
    </div>
  )
}

// Galería de plantillas agrupada por categoría con previews animados. Al pulsar
// una tarjeta se crea la composición desde esa plantilla (con el tema elegido).
export default function MotionTemplates({ pid, templates, format, theme, onThemeChange, onPick, onBlank, onDeleteUser }) {
  const w = format?.width || 1080
  const h = format?.height || 1920

  const byCat = useMemo(() => {
    const by = {}
    for (const t of templates || []) (by[t.category] = by[t.category] || []).push(t)
    return by
  }, [templates])

  return (
    <div className="mtpl">
      <div className="mtpl-bar">
        <div className="mtpl-themes">
          {THEME_OPTIONS.map((t) => (
            <button key={t.key} type="button"
              className={`mtpl-theme ${theme === t.key ? 'on' : ''}`}
              onClick={() => onThemeChange?.(t.key)}>{t.label}</button>
          ))}
        </div>
        <button type="button" className="motion-btn" onClick={onBlank}>Crear en blanco</button>
      </div>

      {CATEGORIES.map(({ key, label, note }) => {
        const items = byCat[key] || []
        return (
          <div key={key} className={`mtpl-group ${items.length ? '' : 'empty'}`}>
            <div className="mtpl-grouphead">
              <span className="motion-panel-title">{label}</span>
              {items.length === 0 && <span className="mtpl-soon">{key === 'user' ? 'Vacía' : 'Próximamente'}</span>}
            </div>
            <div className="mtpl-note">{note}</div>
            {items.length > 0 && (
              <div className="mtpl-grid">
                {items.map((t) => (
                  <button key={t.key} type="button" className="mtpl-card"
                    title={t.description} onClick={() => onPick?.(t.key, theme)}>
                    <TemplatePreview pid={pid} tkey={t.key} theme={theme} w={w} h={h} />
                    <span className="mtpl-name">{t.name}</span>
                    {t.category === 'user' && onDeleteUser && (
                      <span role="button" tabIndex={0} className="mtpl-del" title="Borrar esta plantilla"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`¿Borrar la plantilla "${t.name}"?`)) onDeleteUser(t.key)
                        }}>×</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
