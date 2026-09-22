import { useState } from 'react'
import { foundryChat, foundryGenerate } from '../../services/api'
import Icon from '../../components/Icon'

// Panel "Foundry": capa de IA GENERATIVA del editor (Microsoft Foundry).
// Complementa Azure Speech/Vision, no los reemplaza. Todas las credenciales y
// llamadas viven en el backend; aquí solo se pide el resultado y se muestra para
// que el usuario decida (Aplicar / Copiar / Regenerar / Descartar). Ninguna
// operación modifica el proyecto automáticamente.
//
// Contexto: se envía el guion/tema/título que escribe el usuario + el contexto
// del editor (project_id, clip/tiempo seleccionados). No se llama a la IA en
// cada cambio: solo con acciones explícitas.

const ACTIONS = [
  { id: 'assistant', icon: 'smart_toy', label: 'Asistente' },
  { id: 'improve_script', icon: 'auto_fix_high', label: 'Mejorar guion' },
  { id: 'generate_hooks', icon: 'bolt', label: 'Hooks' },
  { id: 'generate_titles', icon: 'title', label: 'Títulos' },
  { id: 'generate_description', icon: 'description', label: 'Descripción' },
  { id: 'suggest_resources', icon: 'lightbulb', label: 'Sugerir recursos' },
  { id: 'visual_prompt', icon: 'image', label: 'Prompt visual' },
  { id: 'analyze_scene', icon: 'insights', label: 'Analizar escena' },
]

const IMPROVE_MODES = [
  { id: 'improve', label: 'Mejorar' },
  { id: 'shorten', label: 'Acortar' },
  { id: 'natural', label: 'Más natural' },
  { id: 'direct', label: 'Más directo' },
]

export default function FoundryPanel({ project, editorContext, foundry, onGoSettings, setToast }) {
  const [op, setOp] = useState('assistant')
  const [script, setScript] = useState('')
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState('improve')
  const [language, setLanguage] = useState('es')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const configured = !!foundry?.available
  const action = ACTIONS.find((a) => a.id === op)

  function buildContext() {
    const ctx = { vertical: true }
    if (script.trim()) ctx.script = script.trim()
    if (topic.trim()) ctx.topic = topic.trim()
    if (title.trim()) ctx.title = title.trim()
    if (editorContext?.current_time != null) ctx.current_time = editorContext.current_time
    if (project?.format) ctx.format = { aspect: '9:16', ...project.format }
    return ctx
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text || '')
      setToast?.({ type: 'success', message: 'Copiado.' })
    } catch { setToast?.({ type: 'error', message: 'No se pudo copiar.' }) }
  }

  async function run() {
    if (!configured) { setError(foundry?.reason || 'Configura Microsoft Foundry en Configuración.'); return }
    setBusy(true); setError(''); setResult(null)
    try {
      const projectId = project?.id
      const context = buildContext()
      let res
      if (op === 'assistant') {
        if (!question.trim()) { setError('Escribe una pregunta.'); setBusy(false); return }
        res = await foundryChat({ projectId, message: question.trim(), context, language })
      } else if (op === 'improve_script') {
        if (!script.trim()) { setError('Pega o escribe el texto a mejorar.'); setBusy(false); return }
        res = await foundryGenerate({ op, text: script.trim(), mode, language, project_id: projectId, context })
      } else {
        res = await foundryGenerate({ op, language, project_id: projectId, context })
      }
      setResult(res)
    } catch (e) {
      setError(e.message || 'Error al generar.')
    }
    setBusy(false)
  }

  return (
    <div className="ai-block foundry-panel">
      <div className="ai-block-head"><Icon name="smart_toy" size={16} /> Microsoft Foundry — IA generativa</div>
      {!configured && (
        <div className="warn">
          {foundry?.reason || 'Configura el endpoint, el deployment y la clave de Foundry.'}
          {onGoSettings && (
            <button type="button" className="ghost small" onClick={onGoSettings} style={{ marginLeft: 8 }}>
              Ir a Configuración
            </button>
          )}
        </div>
      )}

      <div className="foundry-actions">
        {ACTIONS.map((a) => (
          <button key={a.id} type="button"
            className={`ed-tab ${op === a.id ? 'on' : ''}`}
            onClick={() => { setOp(a.id); setResult(null); setError('') }}>
            <Icon name={a.icon} size={14} /> {a.label}
          </button>
        ))}
      </div>

      {/* Entradas según la acción */}
      {op === 'assistant' && (
        <label className="field"><span>Pregunta</span>
          <textarea className="tts-text" rows={3} value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="¿Qué recurso visual pongo aquí? Resume esta escena. Dame 3 hooks…" />
        </label>
      )}

      {(op === 'assistant' || op === 'improve_script' || op === 'generate_hooks'
        || op === 'generate_titles' || op === 'generate_description'
        || op === 'suggest_resources' || op === 'visual_prompt' || op === 'analyze_scene') && (
        <label className="field"><span>Guion / texto {op === 'improve_script' ? '(obligatorio)' : '(contexto)'}</span>
          <textarea className="tts-text" rows={4} value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Pega aquí el guion, la escena o el texto seleccionado." />
        </label>
      )}

      {(op === 'generate_hooks' || op === 'generate_titles' || op === 'generate_description'
        || op === 'suggest_resources' || op === 'visual_prompt' || op === 'analyze_scene') && (
        <div className="ai-btn-row">
          <label className="field" style={{ flex: 1 }}><span>Tema</span>
            <input className="time-input" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="Tema del vídeo (opcional)" />
          </label>
          {(op === 'generate_description') && (
            <label className="field" style={{ flex: 1 }}><span>Título</span>
              <input className="time-input" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Título (opcional)" />
            </label>
          )}
        </div>
      )}

      <div className="ai-btn-row">
        {op === 'improve_script' && (
          <label className="field"><span>Variante</span>
            <select className="time-input" value={mode} onChange={(e) => setMode(e.target.value)}>
              {IMPROVE_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>Idioma</span>
          <select className="time-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="pt">Portugués</option>
            <option value="fr">Francés</option>
          </select>
        </label>
        <button className="primary" type="button" onClick={run} disabled={busy || !configured}
          style={{ alignSelf: 'flex-end' }}>
          {busy ? 'Generando…' : (result ? 'Regenerar' : action?.label || 'Generar')}
        </button>
      </div>

      {error && <div className="ed-mat-err">{error}</div>}

      {result && (
        <FoundryResult op={op} result={result}
          onCopy={copy}
          onApplyScript={(t) => { setScript(t); setToast?.({ type: 'success', message: 'Aplicado al texto.' }) }}
          onDiscard={() => setResult(null)} />
      )}
    </div>
  )
}

// Render del resultado según la operación. Cada bloque ofrece Copiar y, donde
// tiene sentido, Aplicar (al área de texto local) / Descartar.
function FoundryResult({ op, result, onCopy, onApplyScript, onDiscard }) {
  const usage = result?.usage?.total_tokens
  return (
    <div className="ai-result">
      <div className="ai-result-meta">
        {result?.model || 'Foundry'}{usage ? ` · ${usage} tokens` : ''}
        <button type="button" className="ghost small" onClick={onDiscard} style={{ marginLeft: 'auto' }}>Descartar</button>
      </div>

      {op === 'assistant' && <ResultText text={result.text} onCopy={onCopy} />}

      {op === 'improve_script' && (
        <div className="foundry-variant">
          <textarea className="tts-text" rows={5} readOnly value={result.result || ''} />
          <div className="ai-btn-row">
            <button type="button" className="primary small" onClick={() => onApplyScript(result.result)}>Aplicar</button>
            <button type="button" className="ghost small" onClick={() => onCopy(result.result)}>Copiar</button>
          </div>
        </div>
      )}

      {op === 'generate_description' && <ResultText text={result.description} onCopy={onCopy} />}

      {op === 'generate_hooks' && (
        <ResultList items={result.hooks} onCopy={onCopy} empty="Sin hooks." />
      )}
      {op === 'generate_titles' && (
        <ResultList items={result.titles} onCopy={onCopy} empty="Sin títulos." />
      )}

      {op === 'suggest_resources' && (
        <div className="foundry-suggestions">
          {(result.suggestions || []).length === 0 && <p className="ed-caja-hint">Sin sugerencias.</p>}
          {(result.suggestions || []).map((s, i) => (
            <div key={i} className="foundry-suggestion">
              <div className="ai-result-meta">
                <span className="ai-chip">{s.type}</span> {s.title} · {s.duration}s
              </div>
              {s.description && <p className="ed-caja-hint">{s.description}</p>}
              {s.reason && <p className="ed-caja-hint"><em>{s.reason}</em></p>}
              {s.prompt && (
                <div className="foundry-variant">
                  <textarea className="tts-text" rows={2} readOnly value={s.prompt} />
                  <button type="button" className="ghost small" onClick={() => onCopy(s.prompt)}>Copiar prompt</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {op === 'visual_prompt' && (
        <div className="foundry-suggestions">
          <PromptField label={`Imagen (${result.aspect || '9:16'})`} value={result.image_prompt} onCopy={onCopy} />
          <PromptField label="Vídeo" value={result.video_prompt} onCopy={onCopy} />
          {result.negative_prompt && <PromptField label="Negativo" value={result.negative_prompt} onCopy={onCopy} />}
        </div>
      )}

      {op === 'analyze_scene' && (
        <div className="foundry-analysis">
          {result.summary && <p><strong>Resumen:</strong> {result.summary}</p>}
          {result.concept && <p><strong>Concepto:</strong> {result.concept}</p>}
          {result.intent && <p><strong>Intención:</strong> {result.intent}</p>}
          <AnalysisList title="Recursos posibles" items={result.resources} />
          <AnalysisList title="Sugerencias de edición" items={result.edits} />
          <AnalysisList title="Mejoras" items={result.improvements} />
        </div>
      )}
    </div>
  )
}

function ResultText({ text, onCopy }) {
  return (
    <div className="foundry-variant">
      <textarea className="tts-text" rows={6} readOnly value={text || ''} />
      <button type="button" className="ghost small" onClick={() => onCopy(text)}>Copiar</button>
    </div>
  )
}

function ResultList({ items, onCopy, empty }) {
  if (!items || items.length === 0) return <p className="ed-caja-hint">{empty}</p>
  return (
    <ul className="foundry-list">
      {items.map((it, i) => (
        <li key={i} className="foundry-list-item">
          <span>{it}</span>
          <button type="button" className="ghost small" onClick={() => onCopy(it)}>Copiar</button>
        </li>
      ))}
    </ul>
  )
}

function PromptField({ label, value, onCopy }) {
  return (
    <div className="foundry-variant">
      <div className="ai-result-meta">{label}</div>
      <textarea className="tts-text" rows={3} readOnly value={value || ''} />
      <button type="button" className="ghost small" onClick={() => onCopy(value)}>Copiar</button>
    </div>
  )
}

function AnalysisList({ title, items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="foundry-analysis-list">
      <div className="ai-result-meta">{title}</div>
      <ul className="foundry-list">
        {items.map((it, i) => <li key={i} className="foundry-list-item"><span>{it}</span></li>)}
      </ul>
    </div>
  )
}
