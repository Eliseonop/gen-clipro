import Icon from '../../components/Icon'
import {
  FILTERS, FILTER_GROUPS, SWATCH, applyMatrix, clipFilters, filterMatrix,
} from '../../lib/clipFilters'

// Filtros de color (#18): galería + pila aplicada en orden, cada uno con su
// intensidad. Clic en un filtro lo añade (o lo quita si ya está).
const hex = (rgb) => `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`
const LABEL = Object.fromEntries(FILTERS.map((f) => [f.id, f.label]))

function Swatch({ id, amount = 1 }) {
  const m = filterMatrix(id, amount)
  return (
    <span className="ed-filter-swatch" aria-hidden="true">
      {SWATCH.map((c, i) => <i key={i} style={{ background: hex(applyMatrix(m, c)) }} />)}
    </span>
  )
}

export default function EdFilters({ clip, onChangeFx }) {
  const stack = clipFilters(clip)
  const set = (next) => onChangeFx?.({ filters: next, look: 'none' })
  const idx = (id) => stack.findIndex((f) => f.id === id)

  function toggle(id) {
    const i = idx(id)
    set(i >= 0 ? stack.filter((_, j) => j !== i) : [...stack, { id, amount: 1 }])
  }
  function patch(i, amount) {
    set(stack.map((f, j) => (j === i ? { ...f, amount } : f)))
  }
  function move(i, d) {
    const j = i + d
    if (j < 0 || j >= stack.length) return
    const next = [...stack]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }

  return (
    <div className="ed-filters">
      {FILTER_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="ed-fx-label">Filtros · {g.label}</div>
          <div className="ed-filter-grid">
            {FILTERS.filter((f) => f.group === g.id).map((f) => {
              const i = idx(f.id)
              return (
                <button key={f.id} type="button" className={`ed-filter-card${i >= 0 ? ' on' : ''}`}
                  onClick={() => toggle(f.id)} title={i >= 0 ? 'Quitar' : 'Añadir'}>
                  <Swatch id={f.id} />
                  <span>{f.label}</span>
                  {i >= 0 && <b className="ed-filter-order">{i + 1}</b>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {stack.length > 0 && (
        <div className="ed-filter-stack">
          <div className="ed-fx-label">Aplicados (en este orden)</div>
          {stack.map((f, i) => (
            <div key={f.id} className="ed-filter-row">
              <Swatch id={f.id} amount={f.amount} />
              <span className="ed-filter-name">{LABEL[f.id]}</span>
              <input type="range" min="0" max="100" step="1" value={Math.round(f.amount * 100)}
                aria-label={`Intensidad de ${LABEL[f.id]}`}
                onChange={(e) => patch(i, Number(e.target.value) / 100)} />
              <em>{Math.round(f.amount * 100)} %</em>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Antes">
                <Icon name="arrow_upward" size={14} />
              </button>
              <button type="button" className="icon-btn" disabled={i === stack.length - 1} onClick={() => move(i, 1)} title="Después">
                <Icon name="arrow_downward" size={14} />
              </button>
              <button type="button" className="icon-btn" onClick={() => toggle(f.id)} title="Quitar">
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
