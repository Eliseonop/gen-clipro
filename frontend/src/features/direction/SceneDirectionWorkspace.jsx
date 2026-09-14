import { useEffect, useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import MaterialInfoModal from '../editor/MaterialInfoModal'
import {
  MODE_META, SOURCE_LABEL, STATUS_META, directedCount, filterMaterials, fmtTime, hasMaterial, overlapsOf,
  primaryAction, toggleMaterial,
} from './directionModel'
import { useSceneDirection } from './useSceneDirection'

// "Dirección de escena": recorrer el guion tramo a tramo y decir qué debe pasar en
// pantalla. Pantalla completa: escaleta · tramo (guion, dirección, materiales) · lo que
// recibe la IA + acciones. Ver app/scene_direction.py.
export default function SceneDirectionWorkspace({
  projectId, focus, markRange, reloadKey, onClose, onGenerate, onGoToSegment, onOpenComposition, onToast,
}) {
  const d = useSceneDirection(projectId, { focus })
  const { info, segments, selected, pack } = d
  const [busy, setBusy] = useState('')
  const [matQ, setMatQ] = useState('')
  const [matKind, setMatKind] = useState('all')
  const [infoTarget, setInfoTarget] = useState(null)
  const [showPack, setShowPack] = useState(true)

  // La escena generada desde el modal enlaza el tramo en el backend: recargar al volver.
  useEffect(() => { if (reloadKey) d.reload() }, [reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (infoTarget) return
      if (e.key === 'Escape') onClose?.()
      if (e.target.closest?.('input, textarea, select')) return
      const idx = segments.findIndex((s) => s.id === d.selId)
      if (e.key === 'ArrowDown' && idx < segments.length - 1) { e.preventDefault(); d.setSelId(segments[idx + 1].id) }
      if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); d.setSelId(segments[idx - 1].id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const materials = useMemo(() => filterMaterials(info?.materials, { q: matQ, kind: matKind }), [info, matQ, matKind])
  const modes = info?.modes || []
  const hasMark = markRange?.in != null && markRange?.out != null && markRange.out > markRange.in
  const overlaps = selected ? overlapsOf(segments, selected) : []
  const action = primaryAction(selected, segments)
  const refSeg = selected?.reference_id ? segments.find((s) => s.id === selected.reference_id) : null

  async function run(label, fn) {
    setBusy(label)
    d.setError('')
    try { return await fn() } catch (e) { d.setError(e.message || 'Algo falló.') } finally { setBusy('') }
  }

  async function doPrimary() {
    if (!selected || !action) return
    if (action.id === 'place') {
      const out = await run('place', () => d.place(selected.id))
      if (out) onToast?.({ type: 'success', message: out.shorter ? 'Clip colocado (es más corto que el tramo).' : 'Material colocado en el tramo.' })
      return
    }
    if (action.id === 'reuse') {
      const out = await run('reuse', () => d.reuse(selected.id))
      if (out) { onToast?.({ type: 'success', message: 'Escena reutilizada como borrador.' }); onOpenComposition?.(out.composition_id) }
      return
    }
    await run('generate', async () => {
      await d.flush()
      onGenerate?.(selected, pack)
    })
  }

  return (
    <div className="sd-overlay" role="dialog" aria-label="Dirección de escena">
      <div className="sd-shell">
        <header className="sd-head">
          <h2><Icon name="theaters" size={22} /> Dirección de escena</h2>
          <span className="sd-progress">
            {directedCount(segments)}/{segments.length} tramos dirigidos
            {info && <em> · guion desde {SOURCE_LABEL[info.script_source] || info.script_source}</em>}
          </span>
          <span className="sd-saving">{d.saving ? 'Guardando…' : ''}</span>
          <div className="sd-head-actions">
            <button className="ghost" onClick={() => d.autoSplit()} title="Divide el guion en tramos por frases (conserva los ya dirigidos)">
              <Icon name="splitscreen" size={16} /> Dividir guion en tramos
            </button>
            <button className="ghost" disabled={!hasMark} onClick={() => d.add({ start: markRange.in, end: markRange.out })}
              title={hasMark ? 'Añade un tramo con el rango marcado (I/O)' : 'Marca un rango con I / O en la timeline'}>
              <Icon name="add" size={16} /> Tramo del rango marcado
            </button>
            <button className="icon-btn" onClick={onClose} title="Cerrar (Esc)"><Icon name="close" size={20} /></button>
          </div>
        </header>
        {d.error && <div className="gm-error sd-error">{d.error}</div>}

        <div className="sd-body">
          {/* Escaleta */}
          <aside className="sd-col sd-list">
            {d.loading && <div className="gm-muted">Cargando…</div>}
            {!d.loading && segments.length === 0 && (
              <div className="sd-empty">
                <Icon name="subtitles" size={28} />
                <p>Aún no hay tramos.</p>
                <button className="primary" onClick={() => d.autoSplit()}>Dividir guion en tramos</button>
                <p className="gm-muted">o marca un rango con <kbd>I</kbd>/<kbd>O</kbd> y añádelo. Funciona también sin subtítulos.</p>
              </div>
            )}
            <ol>
              {segments.map((s, i) => {
                const meta = MODE_META[s.mode]
                const st = STATUS_META[s.status] || STATUS_META.empty
                return (
                  <li key={s.id}>
                    <button className={`sd-row ${s.id === d.selId ? 'on' : ''} ${s.mode ? `t-${meta.tone}` : ''}`}
                      onClick={() => d.setSelId(s.id)}>
                      <span className="sd-row-top">
                        <span className="sd-row-n">{i + 1}</span>
                        <span className="sd-row-tc">{fmtTime(s.start)} – {fmtTime(s.end)}</span>
                        <span className={`sd-st st-${s.status}`} title={st.label}><Icon name={st.icon} size={15} /></span>
                      </span>
                      <span className={`sd-row-text ${s.text ? '' : 'none'}`}>{s.text || 'Sin voz ni subtítulos en este tramo'}</span>
                      {(s.mode || s.instruction) && (
                        <span className="sd-row-dir">
                          {meta && <Icon name={meta.icon} size={13} />}
                          {modes.find((m) => m.key === s.mode)?.label}{s.instruction ? ` · ${s.instruction}` : ''}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* Tramo */}
          <main className="sd-col sd-main">
            {!selected && !d.loading && <div className="sd-empty"><p>Elige un tramo de la escaleta.</p></div>}
            {selected && (
              <>
                <section className="sd-card">
                  <div className="sd-range">
                    <TimeInput label="Inicio" value={selected.start} onCommit={(v) => d.retime(selected.id, { start: v })} />
                    <TimeInput label="Fin" value={selected.end} onCommit={(v) => d.retime(selected.id, { end: v })} />
                    <span className="gm-chip">{(selected.end - selected.start).toFixed(1)} s</span>
                    {hasMark && (
                      <button className="ghost sc-mini" onClick={() => d.retime(selected.id, { start: markRange.in, end: markRange.out })}>
                        Usar rango marcado
                      </button>
                    )}
                    <span className="sd-range-actions">
                      <button className="ghost sc-mini" onClick={() => onGoToSegment?.(selected)} title="Cierra y marca este tramo en la timeline">
                        <Icon name="my_location" size={14} /> Ver en la timeline
                      </button>
                      <button className="icon-btn" onClick={() => d.remove(selected.id)} title="Quitar tramo"><Icon name="delete" size={16} /></button>
                    </span>
                  </div>
                  {overlaps.length > 0 && (
                    <div className="gm-warn"><Icon name="warning" size={14} /> Se solapa con {overlaps.length === 1 ? 'otro tramo' : `${overlaps.length} tramos`}.</div>
                  )}

                  <div className="sd-script">
                    <div className="gm-label">Lo que dice la voz</div>
                    {pack?.pack?.script?.before && <p className="sd-side">…{pack.pack.script.before}</p>}
                    {pack?.pack?.script?.current || selected.text
                      ? <p className="sd-current">{pack?.pack?.script?.current || selected.text}</p>
                      : <p className="sd-current none">Nadie habla en este tramo. La IA trabajará con tu dirección y los materiales.</p>}
                    {pack?.pack?.script?.after && <p className="sd-side">{pack.pack.script.after}…</p>}
                    <div className="gm-label">Subtítulos del tramo</div>
                    {pack?.pack?.captions?.length
                      ? (
                        <ul className="sd-captions">
                          {pack.pack.captions.map((c, i) => (
                            <li key={i}><span>{c.start.toFixed(1)}–{c.end.toFixed(1)}s</span>{c.text}</li>
                          ))}
                        </ul>
                      )
                      : <p className="gm-muted">Sin subtítulos en este tramo.</p>}
                  </div>
                </section>

                <section className="sd-card">
                  <div className="gm-label">Qué debe pasar en pantalla</div>
                  <div className="sd-modes">
                    {modes.map((m) => {
                      const meta = MODE_META[m.key] || {}
                      return (
                        <button key={m.key} type="button" className={`sd-mode t-${meta.tone} ${selected.mode === m.key ? 'on' : ''}`}
                          onClick={() => d.patch(selected.id, { mode: selected.mode === m.key ? null : m.key })}>
                          <Icon name={meta.icon} size={18} />
                          <strong>{m.label}</strong>
                          <span>{meta.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                  <label className="gm-check">
                    <input type="checkbox" checked={!!selected.strict} onChange={(e) => d.patch(selected.id, { strict: e.target.checked })} />
                    Seguir el guion estrictamente <span className="gm-muted">(un beat por frase, sin añadir ideas)</span>
                  </label>
                  <textarea
                    className="gm-hint sd-instruction" rows={3} value={selected.instruction}
                    onChange={(e) => d.patch(selected.id, { instruction: e.target.value })}
                    placeholder="Instrucción visual: “Watney contando las papas en su diario”, “gráfico: 687 días de misión frente a 400 kg de comida”…"
                  />
                  {selected.mode === 'reinforce' && (
                    <div className="sd-ref">
                      <span className="gm-label">Tramo de referencia</span>
                      <select value={selected.reference_id || ''} onChange={(e) => d.patch(selected.id, { reference_id: e.target.value || null })}>
                        <option value="">Elige el tramo a reforzar…</option>
                        {segments.filter((s) => s.id !== selected.id).map((s) => (
                          <option key={s.id} value={s.id}>
                            {fmtTime(s.start)} · {(s.text || 'sin voz').slice(0, 60)}{s.composition_id ? ' · con escena' : ''}
                          </option>
                        ))}
                      </select>
                      {refSeg && !refSeg.composition_id && <span className="gm-muted">Ese tramo aún no tiene escena: se generará una nueva inspirada en él.</span>}
                    </div>
                  )}
                </section>

                <section className="sd-card sd-materials">
                  <div className="sd-mat-head">
                    <span className="gm-label">Materiales {selected.materials?.length ? `· ${selected.materials.length} elegido${selected.materials.length > 1 ? 's' : ''}` : ''}</span>
                    <input type="search" placeholder="Buscar en títulos y descripciones…" value={matQ} onChange={(e) => setMatQ(e.target.value)} />
                    <div className="sc-seg">
                      {[['all', 'Todos'], ['clips', 'Vídeos'], ['images', 'Imágenes']].map(([k, l]) => (
                        <button key={k} type="button" className={matKind === k ? 'on' : ''} onClick={() => setMatKind(k)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  {materials.length === 0 && <p className="gm-muted">No hay materiales visuales{matQ ? ' que coincidan' : ''}.</p>}
                  <div className="sd-mat-grid">
                    {materials.map((m) => {
                      const on = hasMaterial(selected, m)
                      return (
                        <div key={`${m.scope}:${m.kind}:${m.id}`} className={`sd-mat ${on ? 'on' : ''}`}>
                          <button type="button" className="sd-mat-pick" onClick={() => d.patch(selected.id, { materials: toggleMaterial(selected, m) })}>
                            <span className="sd-mat-thumb">
                              {m.kind === 'images'
                                ? <img src={m.url} alt="" loading="lazy" />
                                : <video src={`${m.url}#t=0.5`} muted preload="metadata" />}
                              {on && <span className="sd-mat-check"><Icon name="check_circle" size={20} /></span>}
                              <span className="sd-mat-kind">{m.kind === 'clips' ? `vídeo${m.duration ? ` · ${m.duration.toFixed(1)}s` : ''}` : 'imagen'}{m.scope === 'library' ? ' · guardado' : ''}</span>
                            </span>
                            <strong>{m.title}</strong>
                            <span className={m.description ? '' : 'none'}>{m.description || 'Sin descripción: la IA no sabrá qué muestra'}</span>
                          </button>
                          <button type="button" className="icon-btn sd-mat-edit" title="Editar título y descripción"
                            onClick={() => setInfoTarget(m)}><Icon name="edit_note" size={16} /></button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </>
            )}
          </main>

          {/* IA */}
          <aside className="sd-col sd-ai">
            {selected && (
              <>
                <div className="sd-actions">
                  {action && (
                    <button className="primary sd-primary" disabled={!!busy} onClick={doPrimary}>
                      <Icon name={action.id === 'place' ? 'input' : action.id === 'reuse' ? 'replay' : 'auto_awesome'} size={18} />
                      {busy ? 'Trabajando…' : action.label}
                    </button>
                  )}
                  {action?.id !== 'generate' && (
                    <button className="ghost" disabled={!!busy} onClick={() => run('generate', async () => { await d.flush(); onGenerate?.(selected, pack) })}>
                      <Icon name="auto_awesome" size={16} /> Generar escena con IA
                    </button>
                  )}
                  {selected.composition_id && (
                    <button className="ghost" onClick={() => onOpenComposition?.(selected.composition_id)}>
                      <Icon name="tune" size={16} /> Abrir escena en Motion Studio
                    </button>
                  )}
                </div>

                <section className="sd-card sd-pack">
                  <button type="button" className="sd-pack-head" onClick={() => setShowPack((v) => !v)}>
                    <Icon name={showPack ? 'expand_less' : 'expand_more'} size={18} />
                    <span className="gm-label">Lo que recibe la IA</span>
                    {pack && <span className="gm-chip">≈{pack.tokens} tokens</span>}
                  </button>
                  <p className="gm-muted">Solo este tramo: la app ya eligió el guion, los subtítulos y los materiales. Así funciona también con modelos pequeños.</p>
                  {showPack && (pack ? <pre className="sd-pack-text">{pack.text}</pre> : <div className="gm-muted">Preparando…</div>)}
                  {showPack && pack?.skeleton?.length > 0 && (
                    <div className="sd-skeleton">
                      <div className="gm-label">Beats del guion (si sigues las frases)</div>
                      <ol>{pack.skeleton.map((b, i) => <li key={i}><span>{b.start.toFixed(1)}–{b.end.toFixed(1)}s</span>{b.text || '(sin voz)'}</li>)}</ol>
                    </div>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      </div>

      {infoTarget && (
        <MaterialInfoModal
          projectId={projectId} kind={infoTarget.kind}
          item={{ ...infoTarget, label: infoTarget.title, index: infoTarget.id, filename: infoTarget.url?.split('/').pop() }}
          onClose={() => setInfoTarget(null)}
          onSaved={() => { d.reload(); onToast?.({ type: 'success', message: 'Información del material guardada.' }) }}
        />
      )}
    </div>
  )
}

function TimeInput({ label, value, onCommit }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const v = parseFloat(String(text).replace(',', '.'))
    if (Number.isFinite(v) && v >= 0 && Math.abs(v - value) > 1e-3) onCommit(v)
    else setText(String(value))
  }
  return (
    <label className="sd-time">
      {label}
      <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      s
    </label>
  )
}
