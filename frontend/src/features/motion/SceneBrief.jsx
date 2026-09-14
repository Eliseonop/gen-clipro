import { useState } from 'react'
import Icon from '../../components/Icon'
import {
  DENSITY_LABEL, FREEDOM_LABEL, INTENT_LABEL, MODE_LABEL, PACE_LABEL, pickPresetFields, presetDirty,
} from './sceneModel'

// Paso 1 de "Generar Escena": el brief (qué, cómo y con qué) + presets.
export default function SceneBrief({ brief, onChange, catalog, presetId, onPresetId, ctx }) {
  const { directions, options, presets } = catalog
  const set = (patch) => onChange({ ...brief, ...patch })
  const dir = directions.find((d) => d.key === brief.direction) || directions[0]
  const preset = presets.find((p) => p.id === presetId) || null
  const dirty = presetDirty(brief, preset?.brief)
  const intents = options?.intents || []
  const resources = options?.resources || []

  return (
    <div className="sc-brief">
      <div className="sc-col">
        <PresetBar
          presets={presets} preset={preset} dirty={dirty} brief={brief}
          onLoad={(p, opts) => onPresetId(p, opts)} catalog={catalog}
        />

        <section className="gm-sec">
          <div className="gm-label">Qué quieres explicar o representar</div>
          <textarea
            className="gm-hint" rows={2} value={brief.idea} onChange={(e) => set({ idea: e.target.value })}
            placeholder="La idea en una frase: “por qué no podríamos salvar el Sol hoy”…"
          />
        </section>

        <section className="gm-sec">
          <div className="gm-label">
            Guion del tramo
            {ctx?.scriptContext?.source && <em>{ctx.scriptContext.source === 'none' ? 'sin guion con tiempos' : 'precargado; editable'}</em>}
          </div>
          <textarea
            className="gm-hint" rows={3} value={brief.script} onChange={(e) => set({ script: e.target.value })}
            placeholder="Lo que dice la voz en este momento."
          />
        </section>

        <section className="gm-sec">
          <div className="gm-label">Tipo de escena</div>
          <div className="sc-chips">
            {intents.map((it) => (
              <button
                key={it.key} type="button" title={it.note}
                className={`sc-chip ${brief.intent === it.key ? 'on' : ''}`}
                onClick={() => set({ intent: it.key })}
              >{INTENT_LABEL[it.key] || it.key}</button>
            ))}
          </div>
          <div className="gm-muted">{intents.find((i) => i.key === brief.intent)?.note}</div>
        </section>

        <section className="gm-sec">
          <div className="gm-label">Recursos</div>
          <div className="sc-resources">
            {resources.map((r) => (
              <div key={r.key} className={`sc-res ${r.available ? '' : 'disabled'}`}>
                <span className="sc-res-name">{r.label}{!r.available && <em> · fase 2</em>}</span>
                <Segmented
                  value={brief.resources[r.key]} disabled={!r.available}
                  options={(options?.resource_modes || ['auto', 'required', 'off']).map((m) => ({ key: m, label: MODE_LABEL[m] }))}
                  onChange={(m) => set({ resources: { ...brief.resources, [r.key]: m } })}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="gm-sec">
          <div className="gm-label">Elementos obligatorios <em>uno por línea</em></div>
          <textarea
            className="gm-hint" rows={2} value={(brief.must_include || []).join('\n')}
            onChange={(e) => set({ must_include: e.target.value.split('\n') })}
            onBlur={() => set({ must_include: (brief.must_include || []).map((x) => x.trim()).filter(Boolean) })}
            placeholder="“el dato 3,8×10²⁶ W”, “una foto de la Tierra”…"
          />
        </section>

        <section className="gm-sec">
          <div className="gm-label">Estructura de la escena</div>
          <Segmented
            value={brief.structure || 'free'}
            options={[{ key: 'script', label: 'Un beat por frase del guion' }, { key: 'free', label: 'La IA divide el tramo' }]}
            onChange={(structure) => set({ structure })}
          />
          <div className="gm-muted">
            {brief.structure === 'script'
              ? 'La app fija los beats con las frases (y subtítulos si hay); la IA solo decide qué se ve. Recomendado para modelos pequeños.'
              : 'La IA decide cuántos beats hay y cuánto dura cada uno.'}
          </div>
        </section>

        <div className="sc-grid2">
          <Field label="Ritmo">
            <Segmented value={brief.pace} options={Object.entries(PACE_LABEL).map(([key, label]) => ({ key, label }))}
              onChange={(pace) => set({ pace })} />
          </Field>
          <Field label="Texto en pantalla">
            <Segmented value={brief.text_density} options={Object.entries(DENSITY_LABEL).map(([key, label]) => ({ key, label }))}
              onChange={(text_density) => set({ text_density })} />
          </Field>
          <Field label="Libertad de la IA">
            <Segmented value={brief.ai_freedom} options={Object.entries(FREEDOM_LABEL).map(([key, label]) => ({ key, label }))}
              onChange={(ai_freedom) => set({ ai_freedom })} />
          </Field>
          <Field label="Fondo">
            <Segmented value={brief.background}
              options={[{ key: 'opaque', label: 'Escena' }, { key: 'transparent', label: 'Overlay' }]}
              onChange={(background) => set({ background })} />
          </Field>
        </div>
        <label className="gm-check">
          <input type="checkbox" checked={!!brief.transitions} onChange={(e) => set({ transitions: e.target.checked })} />
          Transiciones entre beats en el lenguaje de la dirección
        </label>

        <section className="gm-sec">
          <div className="gm-label">Notas para la IA</div>
          <textarea
            className="gm-hint" rows={2} value={brief.notes} onChange={(e) => set({ notes: e.target.value })}
            placeholder="Qué puede decidir libremente, qué evitar, referencias…"
          />
        </section>
      </div>

      <div className="sc-col">
        <section className="gm-sec">
          <div className="gm-label">Dirección creativa <em>bloqueada: la IA no sale de ella</em></div>
          <div className="sc-dirs">
            {directions.map((d) => (
              <button
                key={d.key} type="button" title={d.summary}
                className={`sc-dir ${brief.direction === d.key ? 'on' : ''}`}
                onClick={() => set({ direction: d.key, direction_overrides: {} })}
                style={{ '--dbg': d.palette.bg, '--dink': d.palette.ink, '--dacc': d.palette.accent }}
              >
                <span className="sc-dir-swatch">
                  <span className="sc-dir-aa" style={{ fontFamily: d.fonts.display }}>Aa</span>
                  <span className="sc-dir-dot" />
                </span>
                <span className="sc-dir-name">{d.label}</span>
                <span className="sc-dir-group">{d.group}</span>
              </button>
            ))}
          </div>
        </section>

        {dir && (
          <section className="sc-dir-detail">
            <div className="sc-dir-title">{dir.label}</div>
            <p>{dir.summary}</p>
            <div className="gm-chips">{dir.materials.map((m) => <span key={m} className="gm-chip">{m}</span>)}</div>
            <div className="gm-muted">Movimiento: {dir.motion}</div>
            <div className="sc-palette">
              {['bg', 'surface', 'ink', 'secondary', 'accent'].map((k) => {
                const val = brief.direction_overrides?.[k] || dir.palette[k]
                return (
                  <label key={k} className="sc-swatch" title={k}>
                    <input
                      type="color" value={val}
                      onChange={(e) => set({ direction_overrides: { ...brief.direction_overrides, [k]: e.target.value } })}
                    />
                    <span>{{ bg: 'fondo', surface: 'superficie', ink: 'tinta', secondary: 'secundario', accent: 'acento' }[k]}</span>
                  </label>
                )
              })}
              {Object.keys(brief.direction_overrides || {}).some((k) => k !== 'notes') && (
                <button className="ghost sc-mini" type="button"
                  onClick={() => set({ direction_overrides: { notes: brief.direction_overrides?.notes } })}>
                  Restaurar colores
                </button>
              )}
            </div>
            <textarea
              className="gm-hint" rows={2} value={brief.direction_overrides?.notes || ''}
              onChange={(e) => set({ direction_overrides: { ...brief.direction_overrides, notes: e.target.value } })}
              placeholder="Matiz del estilo: “más tachones”, “sin fotos en color”…"
            />
          </section>
        )}

        {ctx?.timelineContext?.motionInRange?.length > 0 && (
          <div className="gm-warn">
            <Icon name="warning" size={14} /> Ya hay motion en este tramo ({ctx.timelineContext.motionInRange.map((d) => d.name).join(', ')}).
          </div>
        )}
      </div>
    </div>
  )
}

function PresetBar({ presets: list, preset: cur, dirty: isDirty, brief: b, onLoad, catalog: cat }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function saveAs() {
    const name = window.prompt('Nombre del preset', cur && !cur.builtin ? cur.name : '')
    if (!name?.trim()) return
    setBusy(true)
    try {
      const saved = await cat.savePreset({ name: name.trim(), brief: pickPresetFields(b) })
      onLoad(saved, { keepBrief: true })
      setMsg('Guardado')
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  async function overwrite() {
    if (!cur || cur.builtin) return
    setBusy(true)
    try {
      const saved = await cat.savePreset({ id: cur.id, name: cur.name, brief: pickPresetFields(b) })
      onLoad(saved, { keepBrief: true })
      setMsg('Actualizado')
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!cur || cur.builtin || !window.confirm(`¿Borrar el preset “${cur.name}”?`)) return
    setBusy(true)
    try { await cat.removePreset(cur.id); onLoad(null, { keepBrief: true }) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <section className="sc-presets">
      <Icon name="bookmarks" size={16} />
      <select
        value={cur?.id || ''} disabled={busy}
        onChange={(e) => onLoad(list.find((p) => p.id === e.target.value) || null)}
      >
        <option value="">Sin preset</option>
        <optgroup label="Incluidos">
          {list.filter((p) => p.builtin).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
        {list.some((p) => !p.builtin) && (
          <optgroup label="Mis presets">
            {list.filter((p) => !p.builtin).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        )}
      </select>
      {isDirty && <span className="sc-dirty" title="Has cambiado parámetros del preset">modificado</span>}
      <span className="sc-presets-actions">
        {cur && !cur.builtin && isDirty && (
          <button className="ghost sc-mini" type="button" disabled={busy} onClick={overwrite}>Actualizar</button>
        )}
        <button className="ghost sc-mini" type="button" disabled={busy} onClick={saveAs}>Guardar como…</button>
        {cur && !cur.builtin && (
          <button className="icon-btn" type="button" disabled={busy} onClick={remove} title="Borrar preset">
            <Icon name="delete" size={15} />
          </button>
        )}
      </span>
      {msg && <span className="gm-muted sc-presets-msg">{msg}</span>}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div className="gm-sec">
      <div className="gm-label">{label}</div>
      {children}
    </div>
  )
}

export function Segmented({ value, options, onChange, disabled }) {
  return (
    <div className={`sc-seg ${disabled ? 'disabled' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.key} type="button" role="radio" aria-checked={value === o.key} disabled={disabled}
          className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}
        >{o.label}</button>
      ))}
    </div>
  )
}
