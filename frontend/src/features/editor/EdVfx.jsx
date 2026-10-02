// Efectos de vídeo animados (fx/) y animaciones de clip en la interfaz:
//   · EdVfxLibrary — biblioteca (pestaña Efectos del material): buscar, filtrar
//     por categoría y añadir al clip seleccionado.
//   · EdVfxStack   — la pila del clip en el inspector: activar, ordenar, tramo y
//     propiedades (los controles salen del esquema de cada efecto).
//   · EdAnimPicker / EdAnimGrid — animaciones de entrada, salida, bucle y combo.
// Ver docs/EFECTOS_ANIMADOS.md.

import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { FX_CATEGORIES, getEffect, listEffects } from '../../fx/registry'
import { ANIMS, ANIM_SLOTS } from '../../fx/anims'
import { InspSection, InspSlider, NumberStepper } from './EdTransform'

// --- Biblioteca -------------------------------------------------------------------

function FxThumb({ id, category }) {
  const [err, setErr] = useState(false)
  const icon = FX_CATEGORIES.find((c) => c.id === category)?.icon || 'auto_awesome'
  if (err) {
    return <span className="ed-vfx-thumb ph"><Icon name={icon} size={20} /></span>
  }
  return <img className="ed-vfx-thumb" src={`/fx-thumbs/${id}.webp`} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} />
}

export function EdVfxLibrary({ clip, onAdd }) {
  const [cat, setCat] = useState(null)
  const [q, setQ] = useState('')
  const list = useMemo(
    () => listEffects({ category: cat, query: q }).filter((e) => e.engine !== 'generator'),
    [cat, q],
  )
  const active = new Set((Array.isArray(clip?.vfx) ? clip.vfx : []).map((e) => e.effect))
  return (
    <div className="ed-vfx-lib">
      <div className="ed-fx-label">Efectos animados</div>
      <input
        className="ed-vfx-search"
        type="search"
        placeholder="Buscar: glitch, papel, temblor…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ed-fx-chips">
        {[{ id: null, label: 'Todos' }, ...FX_CATEGORIES].map((c) => (
          <button key={c.id || 'all'} type="button" className={`ed-fx-chip ${cat === c.id ? 'on' : ''}`}
            onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="ed-vfx-grid">
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`ed-vfx-card ${active.has(e.id) ? 'on' : ''}`}
            title={`${e.description}\nClic: añadir al clip seleccionado`}
            onClick={() => onAdd?.(e.id)}
          >
            <FxThumb id={e.id} category={e.category} />
            <span>{e.name}</span>
          </button>
        ))}
        {!list.length && <p className="ed-insp-meta">Ningún efecto coincide.</p>}
      </div>
    </div>
  )
}

// --- Pila del clip (inspector) --------------------------------------------------------

function ParamControl({ spec, value, onChange }) {
  if (spec.type === 'range') {
    const dec = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : 2
    return (
      <InspSlider
        label={spec.label}
        value={value}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        defaultValue={spec.def}
        format={(v) => Number(v).toFixed(dec)}
        onChange={(v) => onChange(Number(v))}
      />
    )
  }
  if (spec.type === 'toggle') {
    return (
      <label className="ed-vfx-toggle">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{spec.label}</span>
      </label>
    )
  }
  if (spec.type === 'color') {
    return (
      <label className="ed-vfx-color">
        <span>{spec.label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  if (spec.type === 'select') {
    return (
      <label className="ed-insp-select">
        {spec.label}
        <FlipSelect value={value} options={spec.options.map((o) => ({ value: o.id, label: o.label }))} onChange={onChange} />
      </label>
    )
  }
  // seed
  return (
    <div className="ed-vfx-seed">
      <span>{spec.label}</span>
      <NumberStepper value={value} min={1} max={9999} step={1} onChange={(v) => onChange(Math.round(v))} ariaLabel={spec.label} />
      <button type="button" className="ghost small" title="Otra variación" onClick={() => onChange(1 + Math.floor(Math.random() * 9998))}>
        <Icon name="casino" size={15} />
      </button>
    </div>
  )
}

function clipDurOf(clip) {
  const src = Math.max(0, (Number(clip?.out_point) || 0) - (Number(clip?.in_point) || 0))
  const s = Number(clip?.speed)
  return clip?.kind === 'image' || !(s > 0) ? src : src / s
}

export function EdVfxStack({ clip, onChange }) {
  const list = Array.isArray(clip?.vfx) ? clip.vfx : []
  const dur = clipDurOf(clip)
  const [open, setOpen] = useState(null)

  function patch(i, p) { onChange(list.map((e, j) => (j === i ? { ...e, ...p } : e))) }
  function patchParam(i, id, v) { patch(i, { params: { ...(list[i].params || {}), [id]: v } }) }
  function move(i, d) {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function remove(i) { onChange(list.filter((_, j) => j !== i)) }

  if (!list.length) {
    return (
      <InspSection title="Efectos animados">
        <p className="ed-insp-meta">Este clip no tiene efectos. Añádelos desde la pestaña <strong>Efectos</strong> del panel de material.</p>
      </InspSection>
    )
  }
  return (
    <InspSection title="Efectos animados" hint="Se aplican de arriba abajo">
      <div className="ed-vfx-stack">
        {list.map((e, i) => {
          const fx = getEffect(e.effect)
          const isOpen = open === (e.uid || i) || list.length === 1
          return (
            <div key={e.uid || i} className={`ed-vfx-item ${e.enabled === false ? 'off' : ''}`}>
              <div className="ed-vfx-head">
                <button type="button" className="ed-vfx-name" onClick={() => setOpen(isOpen ? null : (e.uid || i))}>
                  <Icon name={isOpen ? 'expand_more' : 'chevron_right'} size={16} />
                  {fx ? fx.name : `Desconocido (${e.effect})`}
                </button>
                <button type="button" className="ghost small" title={e.enabled === false ? 'Activar' : 'Desactivar'}
                  onClick={() => patch(i, { enabled: e.enabled === false })}>
                  <Icon name={e.enabled === false ? 'visibility_off' : 'visibility'} size={15} />
                </button>
                <button type="button" className="ghost small" title="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="arrow_upward" size={15} />
                </button>
                <button type="button" className="ghost small" title="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="arrow_downward" size={15} />
                </button>
                <button type="button" className="ghost small" title="Quitar" onClick={() => remove(i)}>
                  <Icon name="delete" size={15} />
                </button>
              </div>
              {isOpen && fx && (
                <div className="ed-vfx-body">
                  <div className="ed-vfx-range">
                    <span>Desde</span>
                    <NumberStepper value={Number(e.from) || 0} min={0} max={dur} step={0.1}
                      format={(v) => `${Number(v).toFixed(1)} s`} parse={(s) => parseFloat(s)}
                      onChange={(v) => patch(i, { from: Math.max(0, Math.min(dur, v)) })} ariaLabel="Desde" />
                    <span>hasta</span>
                    <NumberStepper value={e.to == null ? dur : Number(e.to)} min={0} max={dur} step={0.1}
                      format={(v) => `${Number(v).toFixed(1)} s`} parse={(s) => parseFloat(s)}
                      onChange={(v) => patch(i, { to: v >= dur - 0.01 ? null : Math.max(Number(e.from) || 0, v) })} ariaLabel="Hasta" />
                  </div>
                  {fx.paramList.map((spec) => (
                    <ParamControl key={spec.id} spec={spec} value={e.params?.[spec.id] ?? spec.def}
                      onChange={(v) => patchParam(i, spec.id, v)} />
                  ))}
                  <button type="button" className="ghost small" onClick={() => patch(i, { params: {} })}>
                    <Icon name="restart_alt" size={15} /> Valores por defecto
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </InspSection>
  )
}

// --- Animaciones --------------------------------------------------------------------

const BY_SLOT = Object.fromEntries(ANIM_SLOTS.map((s) => [s.id, ANIMS.filter((a) => a.slot === s.id)]))

/** Selectores por ranura (inspector). `onChange(slot, value|null)`. */
export function EdAnimPicker({ clip, onChange }) {
  const cur = clip?.animations && typeof clip.animations === 'object' ? clip.animations : {}
  return (
    <div className="ed-anim-picker">
      {ANIM_SLOTS.map((slot) => {
        const entry = cur[slot.id]
        const anim = entry && ANIMS.find((a) => a.id === entry.id)
        return (
          <div key={slot.id} className="ed-anim-slot">
            <label className="ed-insp-select">
              {slot.label}
              <FlipSelect
                value={anim ? anim.id : ''}
                options={[{ value: '', label: 'Ninguna' }, ...BY_SLOT[slot.id].map((a) => ({ value: a.id, label: a.name }))]}
                onChange={(v) => {
                  const a = ANIMS.find((x) => x.id === v)
                  onChange(slot.id, a ? { id: a.id, ...(slot.id === 'combo' ? {} : { dur: entry?.dur ?? a.dur }) } : null)
                }}
              />
            </label>
            {anim && slot.id !== 'combo' && (
              <div className="ed-vfx-range">
                <span>{slot.id === 'loop' ? 'Cada' : 'Duración'}</span>
                <NumberStepper value={Number(entry.dur ?? anim.dur)} min={0.1} max={slot.id === 'loop' ? 8 : 4} step={0.1}
                  format={(v) => `${Number(v).toFixed(1)} s`} parse={(s) => parseFloat(s)}
                  onChange={(v) => onChange(slot.id, { id: anim.id, dur: Math.max(0.1, v) })} ariaLabel="Duración" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Rejilla de la biblioteca (pestaña Animación del material). */
export function EdAnimGrid({ clip, onChange }) {
  const cur = clip?.animations && typeof clip.animations === 'object' ? clip.animations : {}
  return (
    <>
      {ANIM_SLOTS.map((slot) => (
        <div key={slot.id}>
          <div className="ed-fx-label">{slot.label}</div>
          <div className="ed-fx-grid">
            {BY_SLOT[slot.id].map((a) => {
              const on = cur[slot.id]?.id === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`ed-fx-card-btn ed-lib-card ${on ? 'on' : ''}`}
                  title={on ? 'Clic para quitarla' : `Aplicar «${a.name}»`}
                  onClick={() => onChange(slot.id, on ? null : { id: a.id, ...(slot.id === 'combo' ? {} : { dur: a.dur }) })}
                >
                  <Icon name={slot.id === 'in' ? 'login' : slot.id === 'out' ? 'logout' : slot.id === 'loop' ? 'loop' : 'animation'} size={18} />
                  <span>{a.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
