import Icon from '../../components/Icon'
import { BEAT_KINDS, KIND_BY_KEY, moveRow, newBeatId, parseSeconds, rowsTotal } from './sceneModel'

// Paso 3 de "Generar Escena": el plan por beats, editable antes de construir.
export default function ScenePlan({ meta, onMeta, rows, onRows, images, duration, resources }) {
  const total = rowsTotal(rows)
  const patchRow = (i, patch) => onRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const allowed = BEAT_KINDS.filter((k) => resources?.[k.key] !== 'off' && (k.key !== 'image' || images.length))

  function addBeat() {
    const kind = allowed.find((k) => k.key === 'text') ? 'text' : (allowed[0]?.key || 'text')
    onRows([...rows, { id: newBeatId(rows), kind, duration: 2, purpose: '', content: '', visual: '', asset_id: null, action: '' }])
  }

  return (
    <div className="sc-plan">
      <div className="gm-card">
        <div className="gm-field">
          <label>Título de la escena</label>
          <input type="text" value={meta.title || ''} onChange={(e) => onMeta({ ...meta, title: e.target.value })} />
        </div>
        <div className="gm-field">
          <label>Qué cuenta</label>
          <input type="text" value={meta.logline || ''} onChange={(e) => onMeta({ ...meta, logline: e.target.value })} />
        </div>
        {meta.rationale && <p className="sc-rationale"><Icon name="psychology" size={15} /> {meta.rationale}</p>}
        {meta.warnings?.length > 0 && (
          <ul className="sc-warnings">
            {meta.warnings.map((w) => <li key={w}><Icon name="info" size={13} /> {w}</li>)}
          </ul>
        )}
      </div>

      <div className="sc-strip" title="Reparto del tiempo">
        {rows.map((r) => (
          <span key={r.id} className={`sc-strip-seg k-${r.kind}`} style={{ flexGrow: Math.max(0.1, Number(r.duration) || 0) }}>
            <Icon name={KIND_BY_KEY[r.kind]?.icon || 'crop_square'} size={13} />
          </span>
        ))}
      </div>
      <div className={`gm-muted sc-total ${Math.abs(total - duration) > 0.05 ? 'warn' : ''}`}>
        Beats: {total.toFixed(1)} s · tramo: {duration.toFixed(1)} s
        {Math.abs(total - duration) > 0.05 && ' — se reescalará al tramo al construir'}
      </div>

      <ol className="sc-beats">
        {rows.map((r, i) => (
          <li key={r.id} className={`sc-beat k-${r.kind}`}>
            <div className="sc-beat-head">
              <span className="sc-beat-n">{i + 1}</span>
              <select value={r.kind} onChange={(e) => patchRow(i, { kind: e.target.value,
                asset_id: e.target.value === 'image' ? (r.asset_id || images[0]?.id || null) : null })}>
                {BEAT_KINDS.map((k) => (
                  <option key={k.key} value={k.key} disabled={!allowed.some((a) => a.key === k.key)}>{k.label}</option>
                ))}
              </select>
              <label className="sc-secs">
                <input
                  type="text" inputMode="decimal" value={r.duration}
                  onChange={(e) => patchRow(i, { duration: e.target.value })}
                  onBlur={(e) => patchRow(i, { duration: Math.max(0.5, parseSeconds(e.target.value) ?? 2) })}
                />s
              </label>
              <span className="sc-beat-tools">
                <button className="icon-btn" type="button" disabled={i === 0} onClick={() => onRows(moveRow(rows, i, -1))} title="Subir"><Icon name="arrow_upward" size={15} /></button>
                <button className="icon-btn" type="button" disabled={i === rows.length - 1} onClick={() => onRows(moveRow(rows, i, 1))} title="Bajar"><Icon name="arrow_downward" size={15} /></button>
                <button className="icon-btn" type="button" disabled={rows.length <= 1} onClick={() => onRows(rows.filter((_, k) => k !== i))} title="Quitar beat"><Icon name="close" size={15} /></button>
              </span>
            </div>
            <input className="sc-beat-purpose" type="text" value={r.purpose || ''} placeholder="Propósito del beat"
              onChange={(e) => patchRow(i, { purpose: e.target.value })} />
            <input type="text" value={r.content || ''} placeholder="Texto en pantalla (corto) — “Etiqueta: texto” para antetítulo"
              onChange={(e) => patchRow(i, { content: e.target.value })} />
            {r.kind === 'stick' && (
              <textarea rows={2} value={r.action || ''} placeholder="Qué hacen los personajes"
                onChange={(e) => patchRow(i, { action: e.target.value })} />
            )}
            {r.kind === 'image' && (
              <select value={r.asset_id || ''} onChange={(e) => patchRow(i, { asset_id: e.target.value })}>
                {images.map((im) => <option key={im.id} value={im.id}>{im.label}</option>)}
              </select>
            )}
            {(r.kind === 'graphic' || r.kind === 'text') && (
              <textarea rows={2} value={r.visual || ''} placeholder="Qué se ve y cómo se mueve"
                onChange={(e) => patchRow(i, { visual: e.target.value })} />
            )}
          </li>
        ))}
      </ol>
      <button className="ghost sc-add" type="button" onClick={addBeat} disabled={rows.length >= 10}>
        <Icon name="add" size={16} /> Añadir beat
      </button>
    </div>
  )
}
