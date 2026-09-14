import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { fmtMoment, withDuration } from '../editor/motionTarget'
import MotionCanvas from './MotionCanvas'
import SceneBrief from './SceneBrief'
import ScenePlan from './ScenePlan'
import {
  FALLBACK_BRIEF, KIND_BY_KEY, answersPayload, applyPreset, beatsToRows, pickPresetFields, rowsToBeats,
} from './sceneModel'
import { useGenerateMotion } from './useGenerateMotion'
import { useSceneCatalog, useSceneDraft, useScenePlan, useSceneQuestions } from './useScene'

const STEPS = [
  { key: 'brief', label: 'Escena' },
  { key: 'questions', label: 'Preguntas' },
  { key: 'plan', label: 'Plan' },
  { key: 'preview', label: 'Vista previa' },
]
const LAST_BRIEF_KEY = 'sceneBriefLast'

function loadLastBrief() {
  try { return JSON.parse(localStorage.getItem(LAST_BRIEF_KEY) || 'null') } catch { return null }
}

// "Generar Escena" para UN tramo: brief → preguntas de la IA → plan por beats → escena.
// Ver docs/GENERAR_ESCENA.md.
export default function GenerateSceneModal({
  projectId, target, onChangeTarget, onClose, onEditInStudio, onAddToTimeline, direction = null,
}) {
  // direction = { segment, pack } cuando se abre desde Dirección de escena: el tramo manda
  // (rango fijo) y la IA recibe el paquete compacto del tramo en vez del contexto genérico.
  const directionId = direction?.segment?.id || null
  const duration = +(target.end - target.start).toFixed(2)
  const range = useMemo(() => ({
    start: target.start, end: target.end, playhead: target.playhead, clipId: target.clipId, directionId,
  }), [target.start, target.end, target.playhead, target.clipId, directionId])
  const { ctx } = useGenerateMotion(projectId, target)
  const catalog = useSceneCatalog(projectId)
  const questions = useSceneQuestions(projectId, range)
  const planner = useScenePlan(projectId, range)
  const draft = useSceneDraft(projectId, range)

  const [step, setStep] = useState('brief')
  const [brief, setBrief] = useState(() => {
    const base = { ...FALLBACK_BRIEF, ...(loadLastBrief() || {}), idea: '', script: '', structure: 'free' }
    const def = direction?.pack?.brief_defaults
    if (!def) return base
    return { ...base, ...def, resources: { ...base.resources, ...(def.resources || {}), video: 'off' },
      notes: [base.notes, def.notes].filter(Boolean).join(' ') }
  })
  const [presetId, setPresetId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [meta, setMeta] = useState({})
  const [rows, setRows] = useState([])
  const scriptFilled = useRef(false)
  const ctrlRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  // Guion precargado del contexto del tramo (una vez; luego manda el usuario).
  useEffect(() => {
    if (scriptFilled.current || !ctx || direction) return
    scriptFilled.current = true
    const cur = ctx.scriptContext?.current
    if (cur) setBrief((b) => (b.script ? b : { ...b, script: cur }))
  }, [ctx])

  // Fuentes de las direcciones para que el selector se vea con su tipografía real.
  useEffect(() => {
    const fams = [...new Set(catalog.directions.flatMap((d) => d.font_families || []))]
    if (!fams.length) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f}`).join('&')}&display=swap`
    document.head.appendChild(link)
    return () => link.remove()
  }, [catalog.directions])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const payloadBrief = { ...brief, duration, must_include: (brief.must_include || []).map((x) => x.trim()).filter(Boolean) }
  const images = (ctx?.availableAssets || []).filter((a) => a.kind === 'image')

  function rememberBrief() {
    try { localStorage.setItem(LAST_BRIEF_KEY, JSON.stringify(pickPresetFields(brief))) } catch { /* noop */ }
  }

  function handleClose() {
    draft.discard()
    onClose?.()
  }

  function loadPreset(preset, { keepBrief = false } = {}) {
    setPresetId(preset?.id || null)
    if (preset && !keepBrief) setBrief((b) => applyPreset(b, preset.brief))
  }

  async function goQuestions() {
    rememberBrief()
    setStep('questions')
    setAnswers({})
    const qs = await questions.ask(payloadBrief)
    if (Array.isArray(qs) && qs.length === 0) goPlan([])
  }

  async function goPlan(answerList) {
    rememberBrief()
    setStep('plan')
    const list = answerList ?? answersPayload(questions.result, answers)
    const plan = await planner.plan(payloadBrief, list)
    if (plan) {
      setMeta({ title: plan.title, logline: plan.logline, rationale: plan.rationale, warnings: plan.warnings })
      setRows(beatsToRows(plan.beats))
    }
  }

  function currentAnswers() {
    return answersPayload(questions.result, answers)
  }

  function buildPlan() {
    return { title: meta.title, logline: meta.logline, rationale: meta.rationale, beats: rowsToBeats(rows) }
  }

  function goBuild() {
    setStep('preview')
    setPlaying(false)
    setTime(0)
    draft.build({ brief: payloadBrief, answers: currentAnswers(), plan: buildPlan() })
  }

  function togglePlay() {
    const c = ctrlRef.current
    if (!c) return
    if (playing) { c.pause(); setPlaying(false) } else { c.play(time >= (draft.comp?.duration || 0) - 0.05 ? 0 : time); setPlaying(true) }
  }

  function editInStudio() {
    if (!draft.draftId) return
    draft.keep()
    onEditInStudio?.(draft.draftId)
    onClose?.()
  }

  function addToTimeline() {
    if (!draft.draftId || !onAddToTimeline) return
    draft.keep()
    onAddToTimeline({ draftId: draft.draftId, target: { ...target, directionId }, comp: draft.comp })
    onClose?.()
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const qList = questions.result || []

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal gm-modal sc-modal" role="dialog" aria-label="Generar Escena">
        <div className="modal-head">
          <h3><Icon name="auto_awesome_motion" size={20} /> Generar Escena</h3>
          <ol className="sc-steps">
            {STEPS.map((s, i) => (
              <li key={s.key} className={i === stepIndex ? 'on' : i < stepIndex ? 'done' : ''}>{s.label}</li>
            ))}
          </ol>
          <button className="icon-btn" onClick={handleClose} title="Cerrar (Esc)"><Icon name="close" size={18} /></button>
        </div>

        <div className="sc-moment">
          <span className="gm-tc">{fmtMoment(target.start)} – {fmtMoment(target.end)}</span>
          {direction && <span className="gm-chip sc-directed"><Icon name="theaters" size={13} /> Tramo dirigido</span>}
          <label className="gm-dur">
            Duración
            <input
              type="text" inputMode="decimal" value={duration} disabled={step !== 'brief' || !!direction}
              onChange={(e) => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (v > 0) onChangeTarget?.(withDuration(target, v)) }}
            />
            s
          </label>
          {!target.explicit && step === 'brief' && (
            <span className="gm-note">Sin rango marcado: {duration} s desde el cursor (<kbd>I</kbd>/<kbd>O</kbd> para marcar).</span>
          )}
        </div>

        <div className="sc-layout">
        <ContextPanel ctx={ctx} direction={direction} />
        <div className="sc-work">

        {step === 'brief' && (
          <>
            <div className="gm-body">
              {catalog.error && <div className="gm-error">{catalog.error}</div>}
              <SceneBrief
                brief={brief} onChange={setBrief} catalog={catalog}
                presetId={presetId} onPresetId={loadPreset} ctx={ctx}
              />
            </div>
            <div className="modal-actions gm-actions">
              <button className="ghost" onClick={handleClose}>Cancelar</button>
              <button className="ghost" disabled={!catalog.directions.length} onClick={() => goPlan([])}
                title="Pasa directamente al plan">
                Planificar sin preguntas
              </button>
              <button className="primary" disabled={!catalog.directions.length} onClick={goQuestions}>
                <Icon name="forum" size={16} /> Siguiente
              </button>
            </div>
          </>
        )}

        {step === 'questions' && (
          <>
            <div className="gm-body">
              {questions.running && (
                <div className="gm-proposing"><span className="gm-spin"><Icon name="auto_awesome" size={16} /></span> {questions.status || 'La IA está leyendo el guion…'}</div>
              )}
              {questions.error && <div className="gm-error">{questions.error}</div>}
              {qList.map((q) => (
                <section key={q.id} className="gm-card sc-question">
                  <div className="sc-q">{q.question}</div>
                  {q.why && <div className="gm-muted">{q.why}</div>}
                  <div className="sc-chips">
                    {q.options.map((o) => {
                      const cur = answers[q.id]
                      const on = q.multi ? (cur || []).includes(o) : cur === o
                      return (
                        <button key={o} type="button" className={`sc-chip ${on ? 'on' : ''}`}
                          onClick={() => setAnswers((a) => ({
                            ...a,
                            [q.id]: q.multi ? (on ? (cur || []).filter((x) => x !== o) : [...(cur || []), o]) : (on ? '' : o),
                          }))}>{o}</button>
                      )
                    })}
                  </div>
                  <input
                    type="text" className="sc-free" placeholder="Otra respuesta…"
                    value={Array.isArray(answers[q.id]) ? '' : (q.options.includes(answers[q.id]) ? '' : (answers[q.id] || ''))}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                </section>
              ))}
            </div>
            <div className="modal-actions gm-actions">
              <button className="ghost" onClick={() => { questions.reset(); setStep('brief') }}><Icon name="arrow_back" size={16} /> Atrás</button>
              <button className="ghost" disabled={questions.running} onClick={() => goPlan([])}>Saltar</button>
              <button className="primary" disabled={questions.running} onClick={() => goPlan()}>
                <Icon name="view_list" size={16} /> Diseñar escena
              </button>
            </div>
          </>
        )}

        {step === 'plan' && (
          <>
            <div className="gm-body">
              {planner.running && (
                <div className="gm-proposing"><span className="gm-spin"><Icon name="auto_awesome" size={16} /></span> {planner.status || 'Diseñando la escena…'}</div>
              )}
              {planner.error && <div className="gm-error">{planner.error}</div>}
              {!planner.running && rows.length > 0 && (
                <ScenePlan
                  meta={meta} onMeta={setMeta} rows={rows} onRows={setRows} images={images}
                  duration={duration} resources={brief.resources}
                />
              )}
            </div>
            <div className="modal-actions gm-actions">
              <button className="ghost" disabled={planner.running} onClick={() => setStep(qList.length ? 'questions' : 'brief')}>
                <Icon name="arrow_back" size={16} /> Atrás
              </button>
              <button className="ghost" disabled={planner.running} onClick={() => goPlan()}>
                <Icon name="refresh" size={16} /> Otra propuesta
              </button>
              <button className="primary" disabled={planner.running || !rows.length} onClick={goBuild}>
                <Icon name="movie_filter" size={16} /> Generar escena
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="gm-body sc-preview">
              <ol className="sc-progress">
                {rows.map((r, i) => {
                  const st = draft.progress[r.id]
                  return (
                    <li key={r.id} className={st || 'pending'}>
                      <span className={st === 'working' ? 'gm-spin' : ''}>
                        <Icon name={st === 'working' ? 'autorenew' : st === 'done' ? 'check_circle' : st === 'fallback' ? 'error' : KIND_BY_KEY[r.kind]?.icon || 'radio_button_unchecked'} size={15} />
                      </span>
                      <span>{i + 1}. {KIND_BY_KEY[r.kind]?.label}</span>
                      <em>{r.purpose || r.content}</em>
                      {st === 'fallback' && <span className="sc-fb" title="La IA no logró un bloque válido: se usó una tarjeta tipográfica">respaldo</span>}
                    </li>
                  )
                })}
              </ol>
              {draft.error && <div className="gm-error">{draft.error}</div>}
              {draft.building && <div className="gm-muted">{draft.status}</div>}
              {draft.comp && !draft.building && (
                <div className="gm-preview">
                  <div className="gm-preview-canvas sc-canvas">
                    <MotionCanvas
                      projectId={projectId} comp={draft.comp}
                      onControls={(c) => { ctrlRef.current = c }}
                      onTime={(t) => { setTime(t); setPlaying(!!ctrlRef.current?.isPlaying?.()) }}
                    />
                  </div>
                  <div className="gm-transport">
                    <button className="icon-btn" onClick={togglePlay} title={playing ? 'Pausa' : 'Reproducir'}>
                      <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
                    </button>
                    <input type="range" min="0" max={draft.comp.duration || 0} step="0.03" value={time}
                      onChange={(e) => { const t = +e.target.value; setTime(t); ctrlRef.current?.seek(t) }} />
                    <span className="gm-el-tc">{time.toFixed(1)} / {(draft.comp.duration || 0).toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions gm-actions gm-actions-preview">
              <button className="ghost" disabled={draft.building} onClick={() => setStep('plan')}>
                <Icon name="arrow_back" size={16} /> Plan
              </button>
              <button className="ghost" disabled={draft.building} onClick={goBuild} title="Reconstruye sobre el mismo borrador">
                <Icon name="refresh" size={16} /> Regenerar
              </button>
              <button className="ghost" disabled={!draft.draftId || draft.building} onClick={editInStudio}>
                <Icon name="tune" size={16} /> Editar en Motion Studio
              </button>
              <button className="primary" disabled={!draft.draftId || draft.building || !onAddToTimeline} onClick={addToTimeline}>
                <Icon name="add" size={16} /> Agregar al timeline
              </button>
            </div>
          </>
        )}
        </div>
        </div>
      </div>
    </div>
  )
}

const SOURCE_TXT = {
  captions: 'subtítulos', transcript: 'transcripción', audio_text_estimate: 'texto del audio (estimado)', none: 'sin guion',
}

// Columna fija de contexto: lo que la IA sabe de este tramo (mismo texto que recibe).
function ContextPanel({ ctx, direction }) {
  const pack = direction?.pack
  const script = ctx?.scriptContext
  return (
    <aside className="sc-context">
      <div className="gm-label">Contexto del tramo</div>
      {pack ? (
        <>
          <span className="gm-chip">≈{pack.tokens} tokens</span>
          <pre className="sd-pack-text">{pack.text}</pre>
        </>
      ) : (
        <>
          {!script && <div className="gm-muted">Leyendo el tramo…</div>}
          {script && (
            <>
              <div className="gm-muted">Guion desde {SOURCE_TXT[script.source] || script.source}</div>
              {script.previous && <p className="sd-side">…{script.previous}</p>}
              <p className={`sd-current ${script.current ? '' : 'none'}`}>{script.current || 'Nadie habla en este tramo.'}</p>
              {script.next && <p className="sd-side">{script.next}…</p>}
            </>
          )}
          {ctx?.timelineContext?.existingElements?.length > 0 && (
            <>
              <div className="gm-label">En pantalla</div>
              <ul className="sc-onscreen">
                {ctx.timelineContext.existingElements.slice(0, 8).map((el) => (
                  <li key={el.id}><Icon name={el.kind === 'video' ? 'movie' : el.kind === 'image' ? 'image' : 'title'} size={13} /> {el.name || el.kind}</li>
                ))}
              </ul>
            </>
          )}
          {ctx?.availableAssets?.length > 0 && (
            <>
              <div className="gm-label">Materiales</div>
              <ul className="sc-onscreen">
                {ctx.availableAssets.slice(0, 10).map((a) => (
                  <li key={`${a.kind}:${a.id}`} className={a.match ? 'match' : ''}><Icon name={a.kind === 'video' ? 'movie' : a.kind === 'image' ? 'image' : 'animation'} size={13} /> {a.label}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </aside>
  )
}
