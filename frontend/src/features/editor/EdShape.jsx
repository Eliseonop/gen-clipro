import { fmt } from '../../lib/utils'
import FlipSelect from '../../components/FlipSelect'
import EdLayer from './EdLayer'
import {
  normalizeShape, shapeNeedsFill, shapeNeedsRadius, shapeNeedsSides, shapeNeedsArrow,
} from '../../lib/shapes'

export default function EdShape({ clip, onChangeShape, onChangeDur, layer, onMoveLayer }) {
  const st = normalizeShape(clip?.shape)
  const set = (patch) => onChangeShape?.(patch)
  const dur = clip ? clip.out_point - clip.in_point : 0
  const fillOn = st.fill && st.fill !== 'none'
  const type = st.type

  return (
    <div className="ed-text-panel">
      <div className="ed-crops-tabs">
        <button type="button" className="ed-tab on">Propiedades</button>
      </div>
      <div className="ed-text-body">
        <p className="muted small">Figura vectorial. Arrástrala en el canvas; no pierde calidad al escalar.</p>
        {layer && <EdLayer info={layer} onMove={onMoveLayer} />}
        <div className="ed-text-dense three">
          <label className="ed-mini" title="Posición X">
            <span>X {Math.round(st.x * 100)}</span>
            <input type="range" min="0" max="1" step="0.01" value={st.x} onChange={(e) => set({ x: Number(e.target.value) })} />
          </label>
          <label className="ed-mini" title="Posición Y">
            <span>Y {Math.round(st.y * 100)}</span>
            <input type="range" min="0" max="1" step="0.01" value={st.y} onChange={(e) => set({ y: Number(e.target.value) })} />
          </label>
          <label className="ed-mini" title="Rotación">
            <span>Rot {Math.round(st.rotation)}°</span>
            <input type="range" min="-180" max="180" step="1" value={st.rotation} onChange={(e) => set({ rotation: Number(e.target.value) })} />
          </label>
        </div>
        <div className="ed-text-dense three">
          <label className="ed-mini" title="Ancho">
            <span>Ancho {Math.round(st.w * 100)}</span>
            <input type="range" min="0.04" max="1" step="0.01" value={st.w} onChange={(e) => set({ w: Number(e.target.value) })} />
          </label>
          <label className="ed-mini" title="Alto">
            <span>Alto {Math.round(st.h * 100)}</span>
            <input type="range" min="0.03" max="1" step="0.01" value={st.h} onChange={(e) => set({ h: Number(e.target.value) })} />
          </label>
          <label className="ed-mini" title="Duración">
            <span>Dur {fmt(dur)}</span>
            <input type="number" min="0.15" step="0.1" value={+dur.toFixed(1)}
              onChange={(e) => onChangeDur?.(Number(e.target.value))} />
          </label>
        </div>
        <div className="ed-text-dense four">
          {shapeNeedsFill(type) && (
            <label className="ed-mini ed-swatch" title="Relleno">
              <span>Relleno</span>
              <input type="color" value={fillOn ? st.fill : '#e53935'}
                onChange={(e) => set({ fill: e.target.value })} />
            </label>
          )}
          <label className="ed-mini ed-swatch" title="Borde">
            <span>Borde</span>
            <input type="color" value={st.stroke} onChange={(e) => set({ stroke: e.target.value })} />
          </label>
          <label className="ed-mini" title="Grosor del borde">
            <span>Grosor {st.strokeWidth}</span>
            <input type="range" min="0" max="20" step="1" value={st.strokeWidth}
              onChange={(e) => set({ strokeWidth: Number(e.target.value) })} />
          </label>
          <label className="ed-mini" title="Opacidad">
            <span>Opacidad {Math.round(st.opacity * 100)}%</span>
            <input type="range" min="0" max="100" step="1" value={Math.round(st.opacity * 100)}
              onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
          </label>
        </div>
        {shapeNeedsFill(type) && (
          <label className="ed-chip">
            <input type="checkbox" checked={fillOn} onChange={(e) => set({ fill: e.target.checked ? (fillOn ? st.fill : '#e53935') : 'none' })} />
            Relleno
          </label>
        )}
        {shapeNeedsRadius(type) && (
          <label className="ed-mini" title="Radio de esquinas">
            <span>Esquinas {Math.round(st.cornerRadius * 100)}</span>
            <input type="range" min="0" max="0.5" step="0.01" value={st.cornerRadius}
              onChange={(e) => set({ cornerRadius: Number(e.target.value) })} />
          </label>
        )}
        {shapeNeedsSides(type) && (
          <label className="ed-mini" title="Puntas o lados">
            <span>{type === 'star' ? 'Puntas' : 'Lados'} {st.sides}</span>
            <input type="range" min="3" max="12" step="1" value={st.sides}
              onChange={(e) => set({ sides: Number(e.target.value) })} />
          </label>
        )}
        {shapeNeedsArrow(type) && (
          <label className="ed-prop">
            Tipo de flecha
            <FlipSelect
              value={st.arrowHead}
              options={[
                { value: 'filled', label: 'Rellena' },
                { value: 'line', label: 'Línea' },
                { value: 'none', label: 'Sin punta' },
              ]}
              onChange={(v) => set({ arrowHead: v })}
            />
          </label>
        )}
      </div>
    </div>
  )
}
