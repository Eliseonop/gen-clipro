import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import {
  compileStick, getStickCast, getStickLibrary, getStickPrompts, streamStickStoryboard,
} from '../../services/api'
import {
  addActor, addCharacter, addShot, duplicateShot, moveShot, patchActor, patchCharacter,
  patchShot, removeActor, removeCharacter, removeShot, setShotLength, shotAt, toggleFx,
} from './stickModel'

const DURATIONS = [6, 10, 15, 20]
const STYLE_SWATCH = { clean: '#ffffff', paper: '#faf7f0', chalk: '#1e293b', transparent: 'transparent' }
const EXAMPLE = 'Leo va al trabajo en bus. El bus frena de golpe, Leo se cae al suelo y una señora con polo naranja no puede aguantar la risa.'

const labelOf = (opts, key) => (opts || []).find((o) => o.key === key)?.label || key

// ---------------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------------
function Segmented({ options, value, onChange, small }) {
  return (
    <div className={`stk-seg ${small ? 'small' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key}
          className={value === o.key ? 'on' : ''} title={o.title || o.label}
          onClick={() => onChange(o.key)}>{o.icon ? <Icon name={o.icon} size={15} /> : o.label}</button>
      ))}
    </div>
  )
}

function Section({ title, meta, open, onToggle, children }) {
  return (
    <section className={`stk-section ${open ? 'open' : ''}`}>
      <button type="button" className="stk-section-head" onClick={onToggle} aria-expanded={open}>
        <Icon name="expand_more" size={18} />
        <span className="stk-section-title">{title}</span>
        {meta != null && <span className="stk-section-meta">{meta}</span>}
      </button>
      {open && <div className="stk-section-body">{children}</div>}
    </section>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="stk-toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="stk-toggle-track"><span /></span>
      <span>{label}</span>
    </label>
  )
}

function PoseSelect({ lib, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {(lib.pose_groups || []).map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.keys.map((k) => <option key={k} value={k}>{labelOf(lib.poses, k)}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function Spinner() { return <span className="stk-spin" aria-hidden="true" /> }

// Duración editable sin flechas nativas (en una fila clicable se pulsaban sin querer):
// se escribe libremente y se confirma con Enter o al salir; Esc descarta.
function SecondsInput({ value, onCommit, min = 0.5, max = 20 }) {
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft == null) return
    const v = Number(String(draft).replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(v) && Math.abs(v - value) > 1e-6) onCommit(Math.min(max, Math.max(min, v)))
  }
  return (
    <label className="stk-len" title="Duración del plano (segundos)">
      <input type="text" inputMode="decimal" value={draft ?? String(value)}
        onFocus={(e) => { setDraft(String(value)); e.target.select() }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
        }} />s
    </label>
  )
}

// ---------------------------------------------------------------------------
// Crear historia (guion → IA → storyboard → composición)
// ---------------------------------------------------------------------------
function useStoryboardAI(pid) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(async (body) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true); setError(''); setStatus('Leyendo tu guion…')
    let storyboard = null
    try {
      await streamStickStoryboard(pid, body, (ev) => {
        if (ev.type === 'status') setStatus(ev.message)
        else if (ev.type === 'storyboard') storyboard = ev.storyboard
        else if (ev.type === 'error') setError(ev.message || 'No se pudo crear la historia.')
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'No se pudo crear la historia.')
    } finally {
      if (abortRef.current === ctrl) { setBusy(false); setStatus(''); abortRef.current = null }
    }
    return ctrl.signal.aborted ? null : storyboard
  }, [pid])

  const cancel = useCallback(() => { abortRef.current?.abort() }, [])
  return { busy, status, error, setError, run, cancel }
}

function StoryCreate({ pid, lib, format, m, cast, onCreated, onCancel }) {
  const [script, setScript] = useState('')
  const [duration, setDuration] = useState(10)
  const [style, setStyle] = useState('clean')
  const [environment, setEnvironment] = useState('auto')
  const [useCast, setUseCast] = useState(true)
  const ai = useStoryboardAI(pid)

  const create = async () => {
    const sb = await ai.run({ script, duration, style, environment: environment === 'auto' ? null : environment, use_cast: useCast })
    if (!sb) return
    try {
      const comp = await compileStick(pid, { storyboard: sb, width: format?.width, height: format?.height })
      m.openComp(comp)
      onCreated?.()
    } catch (e) { ai.setError(e.message) }
  }

  const tryExample = async () => {
    await m.createFromTemplate('stick_scene', { width: format?.width, height: format?.height })
    onCreated?.()
  }

  return (
    <div className="stk-create">
      <div className="stk-hero">
        <span className="stk-hero-icon"><Icon name="theaters" size={20} /></span>
        <div>
          <div className="stk-hero-title">Historia con stickman</div>
          <div className="stk-hero-sub">Cuenta lo que pasa y la IA crea el reparto, los planos y la animación. Luego lo ajustas plano a plano.</div>
        </div>
      </div>

      <label className="motion-field wide">¿Qué pasa en la escena?
        <textarea className="stk-script" rows={5} value={script} maxLength={2000}
          placeholder={`Ej.: ${EXAMPLE}`} disabled={ai.busy}
          onChange={(e) => setScript(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && script.trim()) create() }} />
      </label>

      <div className="stk-row">
        <span className="stk-label">Duración</span>
        <Segmented small value={duration} onChange={setDuration}
          options={DURATIONS.map((d) => ({ key: d, label: `${d}s` }))} />
      </div>

      <div className="stk-row">
        <span className="stk-label">Estilo</span>
        <div className="stk-styles">
          {(lib.styles || []).map((s) => (
            <button key={s.key} type="button" className={`stk-style ${style === s.key ? 'on' : ''}`}
              onClick={() => setStyle(s.key)} disabled={ai.busy}>
              <span className={`stk-style-sw ${s.key}`} style={{ background: STYLE_SWATCH[s.key] }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <label className="motion-field wide">Escenario
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={ai.busy}>
          <option value="auto">Automático (según el guion)</option>
          {(lib.environments || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>

      {cast.length > 0 && (
        <div className="stk-castnote">
          <Toggle checked={useCast} onChange={setUseCast} label="Mantener el reparto del proyecto" />
          <div className="stk-chips">
            {cast.map((c) => (
              <span key={c.id} className={`stk-chip ${useCast ? '' : 'off'}`}>
                <span className="stk-dot" style={{ background: c.shirt }} />{c.name}
              </span>
            ))}
          </div>
          <div className="stk-hint">Si aparecen en el guion, conservan su ropa y aspecto.</div>
        </div>
      )}

      {ai.busy ? (
        <div className="stk-busy">
          <Spinner /><span>{ai.status || 'Creando…'}</span>
          <button type="button" className="stk-link" onClick={ai.cancel}>Cancelar</button>
        </div>
      ) : (
        <button type="button" className="motion-btn primary block stk-cta" disabled={!script.trim()} onClick={create}>
          <Icon name="auto_awesome" size={16} /> Crear historia
        </button>
      )}
      {ai.error && <div className="motion-err">{ai.error}</div>}

      <div className="stk-foot">
        {!ai.busy && <button type="button" className="stk-link" onClick={tryExample}>Ver un ejemplo</button>}
        {onCancel && !ai.busy && <button type="button" className="stk-link" onClick={onCancel}>Volver a la historia</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor del storyboard
// ---------------------------------------------------------------------------
function ActorRow({ lib, sb, shotIdx, actor, onChange }) {
  const ch = sb.characters.find((c) => c.id === actor.id)
  const moving = actor.to_x != null
  const set = (patch) => onChange(patchActor(sb, shotIdx, actor.id, patch))
  return (
    <div className="stk-actor">
      <div className="stk-actor-head">
        <span className="stk-dot" style={{ background: ch?.shirt }} />
        <span className="stk-actor-name">{ch?.name || actor.id}</span>
        <Segmented small value={actor.facing === -1 ? -1 : 1} onChange={(v) => set({ facing: v })}
          options={[{ key: -1, icon: 'west', title: 'Mira a la izquierda' }, { key: 1, icon: 'east', title: 'Mira a la derecha' }]} />
        <button type="button" className="stk-icon-btn" title="Quitar del plano"
          onClick={() => onChange(removeActor(sb, shotIdx, actor.id))}><Icon name="close" size={15} /></button>
      </div>
      <div className="motion-field-row">
        <label className="motion-field">Pose<PoseSelect lib={lib} value={actor.pose} onChange={(v) => set({ pose: v })} /></label>
        <label className="motion-field">Cara
          <select value={actor.expression} onChange={(e) => set({ expression: e.target.value })}>
            {(lib.expressions || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <div className="stk-slider">
        <span>{moving ? 'Desde' : 'Posición'}</span>
        <input type="range" min={-0.2} max={1.2} step={0.01} value={actor.x}
          onChange={(e) => set({ x: Number(e.target.value) })} />
      </div>
      {moving && (
        <div className="stk-slider">
          <span>Hasta</span>
          <input type="range" min={-0.2} max={1.2} step={0.01} value={actor.to_x}
            onChange={(e) => set({ to_x: Number(e.target.value) })} />
        </div>
      )}
      <Toggle checked={moving} label="Se desplaza durante el plano"
        onChange={(v) => set({ to_x: v ? Math.min(1.1, Math.max(-0.1, actor.x + (actor.x < 0.5 ? 0.35 : -0.35))) : null,
          ...(v && !['walk', 'run'].includes(actor.pose) ? { pose: 'walk' } : {}) })} />
    </div>
  )
}

function ShotCard({ lib, sb, idx, open, playing, onOpen, onChange }) {
  const shot = sb.shots[idx]
  const len = Math.round((shot.end - shot.start) * 10) / 10
  const inShot = new Set(shot.actors.map((a) => a.id))
  const addable = sb.characters.filter((c) => !inShot.has(c.id))
  const set = (patch) => onChange(patchShot(sb, idx, patch))
  const fxOn = new Set((shot.fx || []).map((f) => f.type))
  const stop = (e) => e.stopPropagation()
  const cardRef = useRef(null)
  // Al abrir, el plano queda a la vista (cerrar el anterior mueve el contenido).
  useEffect(() => {
    if (open) requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [open])

  return (
    <div ref={cardRef} className={`stk-shot ${open ? 'open' : ''} ${playing ? 'playing' : ''}`}>
      <div className="stk-shot-head" onClick={onOpen} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
        <span className="stk-shot-num">{idx + 1}</span>
        <div className="stk-shot-main">
          <span className="stk-shot-time">{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</span>
          {!open && <span className="stk-shot-desc">{shot.description || shot.caption || shot.actors.map((a) => labelOf(lib.poses, a.pose)).join(' · ') || 'Plano vacío'}</span>}
        </div>
        <div className="stk-shot-actions" onClick={stop}>
          <SecondsInput value={len} onCommit={(v) => onChange(setShotLength(sb, idx, v))} />
          {open && (
            <>
              <button type="button" className="stk-icon-btn" title="Subir" disabled={idx === 0}
                onClick={() => onChange(moveShot(sb, idx, -1))}><Icon name="arrow_upward" size={15} /></button>
              <button type="button" className="stk-icon-btn" title="Bajar" disabled={idx === sb.shots.length - 1}
                onClick={() => onChange(moveShot(sb, idx, 1))}><Icon name="arrow_downward" size={15} /></button>
              <button type="button" className="stk-icon-btn" title="Duplicar plano"
                onClick={() => onChange(duplicateShot(sb, idx))}><Icon name="content_copy" size={14} /></button>
              <button type="button" className="stk-icon-btn danger" title="Eliminar plano" disabled={sb.shots.length <= 1}
                onClick={() => onChange(removeShot(sb, idx))}><Icon name="delete_outline" size={15} /></button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="stk-shot-body">
          <label className="motion-field wide">Qué pasa
            <textarea rows={2} value={shot.description} placeholder="Describe la acción del plano"
              onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="motion-field wide">Texto en pantalla
            <input value={shot.caption} maxLength={80} placeholder="Opcional (ej. ¡Frenazo!)"
              onChange={(e) => set({ caption: e.target.value })} />
          </label>

          <div className="stk-row">
            <span className="stk-label">Cámara</span>
            <Segmented small value={shot.camera} onChange={(v) => set({ camera: v })} options={lib.cameras || []} />
          </div>
          {shot.camera !== 'wide' && shot.actors.length > 1 && (
            <label className="motion-field wide">Enfocar a
              <select value={shot.focus || shot.actors[0]?.id} onChange={(e) => set({ focus: e.target.value })}>
                {shot.actors.map((a) => <option key={a.id} value={a.id}>{sb.characters.find((c) => c.id === a.id)?.name || a.id}</option>)}
              </select>
            </label>
          )}
          {sb.environment?.preset === 'bus' && (
            <Toggle checked={shot.moving !== false} onChange={(v) => set({ moving: v })} label="El bus va en marcha" />
          )}

          <div className="stk-subtitle">Efectos</div>
          <div className="stk-chips">
            {(lib.fx || []).map((o) => (
              <button key={o.key} type="button" className={`stk-chip btn ${fxOn.has(o.key) ? 'on' : ''}`}
                onClick={() => onChange(toggleFx(sb, idx, o.key, shot.focus || shot.actors[0]?.id))}>{o.label}</button>
            ))}
          </div>

          <div className="stk-subtitle">Personajes en el plano</div>
          {shot.actors.length === 0 && <div className="stk-hint">Nadie en este plano.</div>}
          {shot.actors.map((a) => (
            <ActorRow key={a.id} lib={lib} sb={sb} shotIdx={idx} actor={a} onChange={onChange} />
          ))}
          {addable.length > 0 && shot.actors.length < 4 && (
            <select className="stk-add-select" value="" onChange={(e) => e.target.value && onChange(addActor(sb, idx, e.target.value))}>
              <option value="">+ Añadir personaje al plano</option>
              {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

function CharacterCard({ lib, sb, ch, onChange }) {
  const set = (patch) => onChange(patchCharacter(sb, ch.id, patch))
  const dress = ch.outfit === 'dress'
  return (
    <div className="stk-char">
      <div className="stk-char-head">
        <span className="stk-avatar" style={{ '--shirt': ch.shirt, '--pants': dress ? ch.shirt : ch.pants }} />
        <input className="stk-char-name" value={ch.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
        <button type="button" className="stk-icon-btn danger" title="Eliminar personaje"
          onClick={() => { if (window.confirm(`¿Eliminar a ${ch.name} de la historia?`)) onChange(removeCharacter(sb, ch.id)) }}>
          <Icon name="delete_outline" size={15} />
        </button>
      </div>
      <div className="stk-grid2">
        <label className="motion-field">Cuerpo
          <select value={ch.body} onChange={(e) => set({ body: e.target.value })}>
            {(lib.bodies || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="motion-field">Pelo
          <select value={ch.hair} onChange={(e) => set({ hair: e.target.value })}>
            {(lib.hairs || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="motion-field">Ropa
          <select value={ch.outfit} onChange={(e) => set({ outfit: e.target.value })}>
            {(lib.outfits || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="motion-field">Accesorio
          <select value={ch.accessory} onChange={(e) => set({ accessory: e.target.value })}>
            {(lib.accessories || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <div className="stk-colors">
        <label className="stk-color"><input type="color" value={ch.shirt || '#2563eb'} onChange={(e) => set({ shirt: e.target.value })} />{dress ? 'Vestido' : 'Camisa'}</label>
        {!dress && <label className="stk-color"><input type="color" value={ch.pants || '#334155'} onChange={(e) => set({ pants: e.target.value })} />{ch.outfit === 'shirt_skirt' ? 'Falda' : 'Pantalón'}</label>}
        <label className="stk-color"><input type="color" value={ch.hair_color || '#0f172a'} onChange={(e) => set({ hair_color: e.target.value })} />Pelo</label>
      </div>
      <label className="motion-field wide">Descripción para prompts
        <input value={ch.description} maxLength={300} placeholder="Edad, rasgos, estilo… (solo texto)"
          onChange={(e) => set({ description: e.target.value })} />
      </label>
    </div>
  )
}

function PromptBlock({ label, text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }).catch(() => {})
  }
  return (
    <div className="stk-prompt">
      <div className="stk-prompt-head">
        <span>{label}</span>
        <button type="button" className="stk-link" onClick={copy}>
          <Icon name={copied ? 'check' : 'content_copy'} size={13} /> {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  )
}

function PromptsPanel({ pid, sb }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => { getStickPrompts(pid, sb).then(setP).catch(() => setP(null)) }, 500)
    return () => clearTimeout(t)
  }, [pid, sb])
  if (!p) return <div className="stk-busy"><Spinner /><span>Preparando prompts…</span></div>
  return (
    <>
      <div className="stk-hint">Para generar el boceto o el vídeo en otra IA (Midjourney, Veo, Kling…) con el mismo reparto y continuidad.</div>
      <PromptBlock label="Imagen (boceto)" text={p.image} />
      <PromptBlock label="Vídeo" text={p.video} />
      <PromptBlock label="Negativo" text={p.negative} />
    </>
  )
}

function StoryEditor({ pid, lib, format, m, cast, onSeek, timeRef, onNew }) {
  const sb = m.comp.metadata.stick
  const [openShot, setOpenShot] = useState(0)
  const [sections, setSections] = useState({ shots: true, cast: false, scene: false, rewrite: false, prompts: false })
  const [playIdx, setPlayIdx] = useState(-1)
  const [script, setScript] = useState(sb.script || '')
  const [undoSb, setUndoSb] = useState(null)
  const ai = useStoryboardAI(pid)
  const toggle = (k) => setSections((s) => ({ ...s, [k]: !s[k] }))
  const change = m.setStoryboard

  // Plano bajo el cursor de reproducción (sondeo ligero del reloj del preview).
  const sbRef = useRef(sb)
  useEffect(() => { sbRef.current = sb }, [sb])
  useEffect(() => {
    if (!timeRef) return undefined
    const iv = setInterval(() => setPlayIdx(shotAt(sbRef.current, timeRef.current || 0)), 200)
    return () => clearInterval(iv)
  }, [timeRef])

  useEffect(() => { setOpenShot((i) => Math.min(i, sb.shots.length - 1)) }, [sb.shots.length])

  const openAndSeek = (i) => {
    setOpenShot((cur) => (cur === i ? -1 : i))
    onSeek?.(sb.shots[i].start + 0.01)
  }

  const missingCast = cast.filter((c) => !sb.characters.some((x) => x.id === c.id))

  const rewrite = async () => {
    const prev = sb
    const next = await ai.run({ script, duration: sb.duration, style: sb.style.preset,
      environment: sb.environment.preset, use_cast: true })
    if (!next) return
    try {
      const comp = await compileStick(pid, { storyboard: next, composition_id: m.comp.id,
        width: format?.width, height: format?.height })
      m.openComp(comp)
      setUndoSb(prev)
      setOpenShot(0)
      setSections((s) => ({ ...s, rewrite: false, shots: true }))
    } catch (e) { ai.setError(e.message) }
  }

  return (
    <div className="stk-editor">
      <div className="stk-edit-head">
        <input className="stk-title" value={sb.title} maxLength={80} aria-label="Título de la historia"
          onChange={(e) => { change({ ...sb, title: e.target.value }); m.setName(e.target.value) }} />
        <button type="button" className="motion-btn" onClick={onNew} title="Crear otra historia desde un guion">
          <Icon name="add" size={15} /> Nueva
        </button>
      </div>
      <div className="stk-edit-meta">
        {sb.shots.length} planos · {sb.duration.toFixed(1)}s · {sb.characters.length} personajes
      </div>
      {undoSb && (
        <div className="stk-undo">
          Historia reescrita con IA.
          <button type="button" className="stk-link" onClick={() => { change(undoSb); setUndoSb(null) }}>Deshacer</button>
          <button type="button" className="stk-icon-btn" title="Cerrar" onClick={() => setUndoSb(null)}><Icon name="close" size={14} /></button>
        </div>
      )}

      <Section title="Planos" meta={sb.shots.length} open={sections.shots} onToggle={() => toggle('shots')}>
        <div className="stk-shots">
          {sb.shots.map((s, i) => (
            <ShotCard key={s.id} lib={lib} sb={sb} idx={i} open={openShot === i} playing={playIdx === i}
              onOpen={() => openAndSeek(i)} onChange={change} />
          ))}
        </div>
        <button type="button" className="motion-btn block" onClick={() => { change(addShot(sb)); setOpenShot(sb.shots.length) }}>
          <Icon name="add" size={15} /> Añadir plano
        </button>
      </Section>

      <Section title="Reparto" meta={sb.characters.length} open={sections.cast} onToggle={() => toggle('cast')}>
        <div className="stk-hint">El aspecto de cada personaje es fijo en todos los planos.</div>
        {sb.characters.map((c) => <CharacterCard key={c.id} lib={lib} sb={sb} ch={c} onChange={change} />)}
        <div className="stk-row wrap">
          <button type="button" className="motion-btn" disabled={sb.characters.length >= 6}
            onClick={() => change(addCharacter(sb))}><Icon name="person_add" size={15} /> Personaje</button>
          {missingCast.length > 0 && sb.characters.length < 6 && (
            <select className="stk-add-select" value="" onChange={(e) => {
              const c = cast.find((x) => x.id === e.target.value)
              if (c) change(addCharacter(sb, c))
            }}>
              <option value="">Traer del proyecto…</option>
              {missingCast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </Section>

      <Section title="Escena y estilo" open={sections.scene} onToggle={() => toggle('scene')}>
        <label className="motion-field wide">Escenario
          <select value={sb.environment.preset}
            onChange={(e) => change({ ...sb, environment: { ...sb.environment, preset: e.target.value } })}>
            {(lib.environments || []).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <div className="stk-styles">
          {(lib.styles || []).map((s) => (
            <button key={s.key} type="button" className={`stk-style ${sb.style.preset === s.key ? 'on' : ''}`}
              onClick={() => change({ ...sb, style: { ...sb.style, preset: s.key } })}>
              <span className={`stk-style-sw ${s.key}`} style={{ background: STYLE_SWATCH[s.key] }} />
              {s.label}
            </button>
          ))}
        </div>
        <Toggle checked={sb.style.captions !== false} label="Mostrar textos en pantalla"
          onChange={(v) => change({ ...sb, style: { ...sb.style, captions: v } })} />
        <label className="stk-color">
          <input type="color" value={sb.style.accent || '#4f46e5'}
            onChange={(e) => change({ ...sb, style: { ...sb.style, accent: e.target.value } })} />
          Color de acento (¡!, ¿?)
        </label>
      </Section>

      <Section title="Reescribir con IA" open={sections.rewrite} onToggle={() => toggle('rewrite')}>
        <label className="motion-field wide">Guion
          <textarea className="stk-script" rows={4} value={script} disabled={ai.busy}
            placeholder="Cambia el guion y regenera los planos (se mantiene el reparto)"
            onChange={(e) => setScript(e.target.value)} />
        </label>
        {ai.busy ? (
          <div className="stk-busy"><Spinner /><span>{ai.status}</span>
            <button type="button" className="stk-link" onClick={ai.cancel}>Cancelar</button></div>
        ) : (
          <button type="button" className="motion-btn primary block" disabled={!script.trim()} onClick={rewrite}>
            <Icon name="auto_awesome" size={15} /> Regenerar planos
          </button>
        )}
        {ai.error && <div className="motion-err">{ai.error}</div>}
        <div className="stk-hint">Sustituye los planos actuales. Podrás deshacerlo.</div>
      </Section>

      <Section title="Prompts para IA de vídeo" open={sections.prompts} onToggle={() => toggle('prompts')}>
        {sections.prompts && <PromptsPanel pid={pid} sb={sb} />}
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pestaña "Historia"
// ---------------------------------------------------------------------------
export default function StickStory({ pid, m, format, onSeek, timeRef }) {
  const [lib, setLib] = useState(null)
  const [cast, setCast] = useState([])
  const isStory = !!m.comp?.metadata?.stick
  const [creating, setCreating] = useState(!isStory)

  useEffect(() => {
    if (!pid) return
    getStickLibrary(pid).then(setLib).catch(() => setLib({}))
  }, [pid])

  // El reparto del proyecto se refresca al cambiar de composición (puede haber nuevos personajes).
  useEffect(() => {
    if (pid) getStickCast(pid).then((r) => setCast(r.characters || [])).catch(() => setCast([]))
  }, [pid, m.comp?.id])

  useEffect(() => { setCreating(!isStory) }, [m.comp?.id, isStory])

  const libReady = useMemo(() => lib && Object.keys(lib).length > 0, [lib])
  if (!lib) return <div className="stk-busy"><Spinner /><span>Cargando…</span></div>
  if (!libReady) return <div className="motion-err">No se pudo cargar el editor de historias. ¿Está el backend actualizado?</div>

  if (creating || !isStory) {
    return (
      <StoryCreate pid={pid} lib={lib} format={format} m={m} cast={cast}
        onCreated={() => setCreating(false)}
        onCancel={isStory ? () => setCreating(false) : null} />
    )
  }
  return (
    <StoryEditor key={m.comp.id} pid={pid} lib={lib} format={format} m={m} cast={cast}
      onSeek={onSeek} timeRef={timeRef} onNew={() => setCreating(true)} />
  )
}
