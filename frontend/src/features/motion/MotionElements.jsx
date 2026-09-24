import { useCallback, useEffect, useState } from 'react'
import JobProgress from '../../components/JobProgress'
import { deleteMotion, listMotion } from '../../services/api'
import { newTextLayer, newCircleLayer, newLineLayer } from './motionModel'
import MotionAIChat from './MotionAIChat'
import MotionTemplates from './MotionTemplates'
import StickStory from './StickStory'

// Composiciones "en este proyecto" (no borrador): listado con duración e insignia
// "en timeline", clic para abrirlas en Motion Studio y eliminar.
function ProjectCompositions({ pid, timelineCompIds, onOpen }) {
  const [comps, setComps] = useState([])
  const refresh = useCallback(() => {
    if (!pid) return
    listMotion(pid)
      .then((r) => setComps((r.compositions || []).filter((c) => !(c.metadata || {}).draft)))
      .catch(() => setComps([]))
  }, [pid])
  useEffect(() => { refresh() }, [refresh])

  if (comps.length === 0) return <p className="motion-start-hint">Aún no has agregado ningún motion a este proyecto.</p>
  return (
    <div className="motion-comp-list">
      {comps.map((c) => (
        <div key={c.id} className="motion-comp-item" onClick={() => onOpen?.(c)} title="Editar en Motion Studio">
          <span className="motion-comp-name">{c.name}</span>
          <span className="motion-comp-dur">{Number(c.duration || 0).toFixed(1)}s</span>
          {timelineCompIds?.has(c.id) && <span className="motion-comp-badge">en timeline</span>}
          <button type="button" className="motion-layer-del" title="Eliminar composición"
            onClick={(e) => {
              e.stopPropagation()
              if (!window.confirm(`¿Eliminar "${c.name}"?`)) return
              deleteMotion(pid, c.id).then(refresh).catch(() => {})
            }}>×</button>
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'plantillas', label: 'Plantillas' },
  { id: 'historia', label: 'Historia' },
  { id: 'editar', label: 'Editar' },
  { id: 'elementos', label: 'Capas' },
  { id: 'ia', label: 'IA' },
  { id: 'proyecto', label: 'Proyecto' },
]

// Panel izquierdo de Motion, organizado en pestañas:
//  · Plantillas: galería de estilos con previews animados.
//  · Editar: ajustes de la composición (nombre, duración, fondo) + chat IA.
//  · Elementos: añadir capas (texto/forma/línea) y lista de capas.
//  · Proyecto: agregar al proyecto y motions ya guardados.
export default function MotionElements({ pid, m, format, onReloadTimeline, onBack, timelineCompIds, onSeek, timeRef }) {
  const { comp, selLayerId, setSelLayerId, addLayer, deleteLayer, edit,
          templates, reloadTemplates, removeUserTemplate, error, addJob, addToProject, setName, setDuration,
          loadComp, createBlank, createFromTemplate } = m

  const isStory = !!comp?.metadata?.stick
  const [tab, setTab] = useState(comp ? (isStory ? 'historia' : 'editar') : 'plantillas')
  const [galleryTheme, setGalleryTheme] = useState('light')

  // Al volver a la galería se recargan: puede haber plantillas nuevas del usuario.
  useEffect(() => { if (tab === 'plantillas') reloadTemplates?.() }, [tab, reloadTemplates])

  // Al crear/abrir una composición, salta a su pestaña natural (una historia se
  // edita en "Historia"; el resto en "Editar") si estabas en Plantillas.
  useEffect(() => {
    if (comp?.id) setTab((t) => (t === 'plantillas' || (isStory && t === 'editar') ? (isStory ? 'historia' : 'editar') : t))
  }, [comp?.id, isStory])

  const pickTemplate = useCallback(async (key, theme) => {
    await createFromTemplate(key, { theme, width: format?.width, height: format?.height })
    setTab(key === 'stick_scene' ? 'historia' : 'editar')
  }, [createFromTemplate, format])

  const makeBlank = useCallback(async () => {
    await createBlank(format)
    setTab('elementos')
  }, [createBlank, format])

  const openComp = useCallback((c) => { loadComp(c.id); setTab('editar') }, [loadComp])

  const setBackground = useCallback((opaque) => {
    if (!comp) return
    const bg = opaque ? (comp.metadata?.theme?.bg || '#ffffff') : 'transparent'
    edit({ ...comp, background: bg })
  }, [comp, edit])

  const needComp = <p className="motion-start-hint">Elige una plantilla o crea un motion en blanco desde la pestaña <b>Plantillas</b>.</p>

  return (
    <div className="motion-elements-panel">
      <div className="motion-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab"
            className={`motion-tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'plantillas' && (
        <div className="motion-tabpane">
          <MotionTemplates pid={pid} templates={templates} format={format}
            theme={galleryTheme} onThemeChange={setGalleryTheme}
            onPick={pickTemplate} onBlank={makeBlank} onDeleteUser={removeUserTemplate} />
        </div>
      )}

      {tab === 'historia' && (
        <div className="motion-tabpane">
          <StickStory pid={pid} m={m} format={format} onSeek={onSeek} timeRef={timeRef} />
        </div>
      )}

      {tab === 'editar' && (
        <div className="motion-tabpane">
          {!comp ? needComp : (
            <>
              <label className="motion-field wide">Nombre
                <input className="motion-name" value={comp.name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="motion-field-row">
                <label className="motion-field">Duración
                  <input type="number" min="0.1" max="120" step="0.1" value={comp.duration}
                    onChange={(e) => setDuration(e.target.value)} />
                </label>
                <label className="motion-field">Fondo
                  <select value={comp.background === 'transparent' ? 'transparent' : 'opaque'}
                    onChange={(e) => setBackground(e.target.value === 'opaque')}>
                    <option value="transparent">Transparente</option>
                    <option value="opaque">Con color</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'ia' && (
        <div className="motion-tabpane">
          {!comp ? needComp : (
            <>
              <div className="motion-panel-title">Editar con IA</div>
              <MotionAIChat projectId={pid} compId={comp.id}
                onCompositionChanged={loadComp} onReloadTimeline={onReloadTimeline} />
            </>
          )}
        </div>
      )}

      {tab === 'elementos' && (
        <div className="motion-tabpane">
          {!comp ? needComp : (
            <>
              <div className="motion-elem-btns">
                <button type="button" className="motion-btn" onClick={() => addLayer(newTextLayer)}>+ Texto</button>
                <button type="button" className="motion-btn" onClick={() => addLayer(newCircleLayer)}>+ Círculo</button>
                <button type="button" className="motion-btn" onClick={() => addLayer(newLineLayer)}>+ Línea</button>
              </div>
              <div className="motion-panel-title">Capas</div>
              <div className="motion-layer-list">
                {(comp.layers || []).length === 0 && <p className="motion-start-hint">Sin capas todavía.</p>}
                {(comp.layers || []).map((l) => (
                  <div key={l.id}
                    className={`motion-layer-item ${l.id === selLayerId ? 'on' : ''}`}
                    onClick={() => setSelLayerId(l.id)}>
                    <span className="motion-layer-type">{l.type === 'shape' ? (l.shape?.kind || 'forma') : l.type}</span>
                    <span className="motion-layer-name">{l.type === 'shape' ? (l.shape?.kind || l.id) : (l.content || l.id)}</span>
                    <button type="button" className="motion-layer-del"
                      onClick={(e) => { e.stopPropagation(); deleteLayer(l.id) }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'proyecto' && (
        <div className="motion-tabpane">
          {comp && (
            <>
              <div className="motion-panel-title">Motion actual</div>
              {addJob
                ? (
                  <JobProgress job={addJob} progress={addJob.progress || 0} className="motion-addjob" />
                )
                : <button type="button" className="motion-btn primary block" onClick={addToProject}>Agregar al proyecto</button>}
              {onBack && (
                <button type="button" className="motion-btn block" title="Cerrar este motion y volver a las plantillas"
                  onClick={onBack}>Cerrar motion</button>
              )}
            </>
          )}
          <div className="motion-panel-title">En este proyecto</div>
          <ProjectCompositions pid={pid} timelineCompIds={timelineCompIds} onOpen={openComp} />
        </div>
      )}

      {error && <div className="motion-err">{error}</div>}
    </div>
  )
}
