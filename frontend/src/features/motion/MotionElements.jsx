import { newTextLayer, newCircleLayer, newLineLayer } from './motionModel'
import MotionAIChat from './MotionAIChat'

// Panel izquierdo de Motion integrado en el editor ("Motion · Elementos"):
// crear composición, lista de capas seleccionable y chat IA. Reutiliza el mismo
// modelo (motionModel) y el hook useMotionComposition (pasado como `m`).
export default function MotionElements({ pid, m, format, onReloadTimeline, onBack }) {
  const { comp, selLayerId, setSelLayerId, addLayer, deleteLayer,
          templates, error, addJob, addToProject, setName, setDuration,
          loadComp, createBlank, createFromTemplate } = m

  if (!comp) {
    return (
      <div className="motion-elements-panel motion-start">
        <div className="motion-panel-title">Motion · Elementos</div>
        <p className="motion-start-hint">Crea un motion graphic con IA, una plantilla o desde cero.</p>
        <div className="motion-start-actions">
          <button type="button" className="motion-btn primary" onClick={() => createBlank(format)}>Crear en blanco</button>
          {templates.map((t) => (
            <button key={t.key} type="button" className="motion-btn" onClick={() => createFromTemplate(t.key)}>{t.name}</button>
          ))}
        </div>
        {error && <div className="motion-err">{error}</div>}
        <div className="motion-panel-title">IA</div>
        <MotionAIChat projectId={pid} compId={null}
          onCompositionChanged={loadComp} onReloadTimeline={onReloadTimeline} />
      </div>
    )
  }

  return (
    <div className="motion-elements-panel">
      <div className="motion-el-head">
        {onBack && (
          <button type="button" className="motion-btn" title="Volver a crear/plantillas" onClick={onBack}>← Regresar</button>
        )}
        <input className="motion-name" value={comp.name} onChange={(e) => setName(e.target.value)} />
        <label className="motion-dur">Dur
          <input type="number" min="0.1" max="120" step="0.1" value={comp.duration}
            onChange={(e) => setDuration(e.target.value)} />s
        </label>
        {addJob
          ? <span className="motion-addjob">{addJob.message} {Math.round((addJob.progress || 0) * 100)}%</span>
          : <button type="button" className="motion-btn primary" onClick={addToProject}>Agregar al proyecto</button>}
      </div>

      <div className="motion-panel-title">Elementos</div>
      <div className="motion-elem-btns">
        <button type="button" className="motion-btn" onClick={() => addLayer(newTextLayer)}>+ Texto</button>
        <button type="button" className="motion-btn" onClick={() => addLayer(newCircleLayer)}>+ Círculo</button>
        <button type="button" className="motion-btn" onClick={() => addLayer(newLineLayer)}>+ Línea</button>
      </div>
      <div className="motion-layer-list">
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

      <div className="motion-panel-title">IA</div>
      <MotionAIChat projectId={pid} compId={comp.id}
        onCompositionChanged={loadComp} onReloadTimeline={onReloadTimeline} />
      {error && <div className="motion-err">{error}</div>}
    </div>
  )
}
