import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { listRecipes } from '../../services/api'
import { recipeReady } from './recipeReady'

// Recetas en un clic (#21): los trucos del vídeo montados de una vez. La lista viene
// del backend (backend/app/recipes.py), que es quien las aplica.
export default function EdRecipes({ selected, busy, onApply }) {
  const [recipes, setRecipes] = useState([])
  useEffect(() => {
    let alive = true
    listRecipes().then((r) => { if (alive) setRecipes(r.recipes || []) }).catch(() => {})
    return () => { alive = false }
  }, [])
  if (!recipes.length) return null
  return (
    <div className="ed-recipes">
      <div className="ed-fx-label">Recetas en un clic</div>
      {recipes.map((r) => {
        const ready = recipeReady(r, selected)
        return (
          <div key={r.id} className={`ed-recipe${ready.ok ? '' : ' off'}`}>
            <b>{r.label}<small>truco {r.trick}</small></b>
            <button type="button" className="ghost small" disabled={!ready.ok || !!busy}
              onClick={() => onApply?.(r)} title={ready.ok ? 'Aplicar (se deshace con Ctrl+Z)' : ready.why}>
              <Icon name={busy === r.id ? 'hourglass_top' : 'auto_awesome'} size={15} /> {busy === r.id ? 'Aplicando…' : 'Aplicar'}
            </button>
            <p>{r.desc}{!ready.ok && ` — ${ready.why}.`}</p>
          </div>
        )
      })}
    </div>
  )
}
