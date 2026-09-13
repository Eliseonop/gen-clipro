import { ENTRANCE_TYPES, EXIT_TYPES, SLIDE_DIRS, EASES, EFFECT_TYPES,
         FONTS, TEXT_EFFECTS, textEffectPatch, textEffectOf } from './motionModel'

// Propiedades de la capa de Motion seleccionada. Va en el panel derecho del editor
// (equivalente a "Motion · Propiedades"). onChange recibe un patch (deepMerge en updateLayer).
export default function MotionProps({ comp, layer, onChange }) {
  if (!comp) return <div className="motion-props-empty">Crea o abre un motion graphic.</div>
  if (!layer) return <div className="motion-props-empty">Selecciona un elemento.</div>
  const ent = layer.animation?.entrance || {}
  const ex = layer.animation?.exit || {}
  const num = (v) => (v === '' || v == null ? 0 : Number(v))
  return (
    <div className="motion-fields">
      {layer.type === 'text' && (
        <label className="motion-field wide">Texto
          <textarea rows={2} value={layer.content}
            onChange={(e) => onChange({ content: e.target.value })} />
        </label>
      )}
      <div className="motion-field-row">
        <label className="motion-field">X<input type="number" value={layer.x} onChange={(e) => onChange({ x: num(e.target.value) })} /></label>
        <label className="motion-field">Y<input type="number" value={layer.y} onChange={(e) => onChange({ y: num(e.target.value) })} /></label>
      </div>
      <div className="motion-field-row">
        <label className="motion-field">Escala<input type="number" step="0.05" value={layer.scale} onChange={(e) => onChange({ scale: num(e.target.value) })} /></label>
        <label className="motion-field">Rotación<input type="number" value={layer.rotation} onChange={(e) => onChange({ rotation: num(e.target.value) })} /></label>
        <label className="motion-field">Opacidad<input type="number" step="0.05" min="0" max="1" value={layer.opacity} onChange={(e) => onChange({ opacity: num(e.target.value) })} /></label>
      </div>
      {layer.type === 'text' && (
        <>
          <label className="motion-field wide">Fuente
            <select value={layer.style?.font || FONTS[0].value}
              onChange={(e) => onChange({ style: { font: e.target.value } })}>
              {FONTS.every((f) => f.value !== layer.style?.font) && layer.style?.font && (
                <option value={layer.style.font}>Actual (plantilla)</option>
              )}
              {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <div className="motion-field-row">
            <label className="motion-field">Tamaño<input type="number" value={layer.style?.fontSize || 96} onChange={(e) => onChange({ style: { fontSize: num(e.target.value) } })} /></label>
            <label className="motion-field">Color<input type="color" value={layer.style?.color || '#ffffff'} onChange={(e) => onChange({ style: { color: e.target.value } })} /></label>
          </div>
          <label className="motion-field wide">Efecto de texto
            <select value={textEffectOf(layer.style)}
              onChange={(e) => onChange({ style: textEffectPatch(e.target.value, layer) })}>
              {TEXT_EFFECTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {textEffectOf(layer.style) === 'degradado' && (
            <div className="motion-field-row">
              <label className="motion-field">Color 1<input type="color" value={layer.style?.gradientFrom || '#4f46e5'} onChange={(e) => onChange({ style: { gradientFrom: e.target.value } })} /></label>
              <label className="motion-field">Color 2<input type="color" value={layer.style?.gradientTo || '#06b6d4'} onChange={(e) => onChange({ style: { gradientTo: e.target.value } })} /></label>
              <label className="motion-field">Ángulo<input type="number" value={layer.style?.gradientAngle ?? 90} onChange={(e) => onChange({ style: { gradientAngle: num(e.target.value) } })} /></label>
            </div>
          )}
          {textEffectOf(layer.style) === 'contorno' && (
            <div className="motion-field-row">
              <label className="motion-field">Grosor<input type="number" value={layer.style?.outlineWidth ?? 3} onChange={(e) => onChange({ style: { outlineWidth: num(e.target.value) } })} /></label>
              <label className="motion-field">Color<input type="color" value={layer.style?.outlineColor || '#0f172a'} onChange={(e) => onChange({ style: { outlineColor: e.target.value } })} /></label>
            </div>
          )}
          {textEffectOf(layer.style) === 'resaltado' && (
            <label className="motion-field wide">Color del resaltado<input type="color" value={layer.style?.background && layer.style.background.startsWith('#') ? layer.style.background : '#fde047'} onChange={(e) => onChange({ style: { background: e.target.value } })} /></label>
          )}
        </>
      )}
      {layer.type === 'shape' && layer.shape?.kind === 'circle' && (
        <div className="motion-field-row">
          <label className="motion-field">Radio<input type="number" value={layer.shape?.radius ?? 40} onChange={(e) => onChange({ shape: { radius: num(e.target.value) } })} /></label>
          <label className="motion-field">Relleno<input type="color" value={layer.shape?.fill && layer.shape.fill !== 'none' ? layer.shape.fill : '#4f46e5'} onChange={(e) => onChange({ shape: { fill: e.target.value } })} /></label>
          <label className="motion-field">Glow<input type="number" value={layer.shape?.glow ?? 0} onChange={(e) => onChange({ shape: { glow: num(e.target.value) } })} /></label>
        </div>
      )}
      {layer.type === 'shape' && layer.shape?.kind === 'line' && (
        <>
          <div className="motion-field-row">
            <label className="motion-field">X fin<input type="number" value={layer.shape?.x2 ?? 0} onChange={(e) => onChange({ shape: { x2: num(e.target.value) } })} /></label>
            <label className="motion-field">Y fin<input type="number" value={layer.shape?.y2 ?? 0} onChange={(e) => onChange({ shape: { y2: num(e.target.value) } })} /></label>
          </div>
          <div className="motion-field-row">
            <label className="motion-field">Grosor<input type="number" value={layer.shape?.thickness ?? 2} onChange={(e) => onChange({ shape: { thickness: num(e.target.value) } })} /></label>
            <label className="motion-field">Color<input type="color" value={layer.shape?.stroke && layer.shape.stroke !== 'none' ? layer.shape.stroke : '#4f46e5'} onChange={(e) => onChange({ shape: { stroke: e.target.value } })} /></label>
            <label className="motion-field">Glow<input type="number" value={layer.shape?.glow ?? 0} onChange={(e) => onChange({ shape: { glow: num(e.target.value) } })} /></label>
          </div>
        </>
      )}
      <div className="motion-field-row">
        <label className="motion-field">Inicio<input type="number" step="0.1" min="0" max={comp.duration} value={layer.start || 0} onChange={(e) => onChange({ start: num(e.target.value) })} /></label>
        <label className="motion-field">Fin<input type="number" step="0.1" min="0" max={comp.duration} value={layer.end != null ? layer.end : comp.duration} onChange={(e) => onChange({ end: num(e.target.value) })} /></label>
      </div>

      <div className="motion-panel-subtitle">Animación de entrada</div>
      <TweenFields tween={ent} onChange={(p) => onChange({ animation: { entrance: p } })} types={ENTRANCE_TYPES} />
      <div className="motion-panel-subtitle">Animación de salida</div>
      <TweenFields tween={ex} onChange={(p) => onChange({ animation: { exit: p } })} types={EXIT_TYPES} />

      <div className="motion-panel-subtitle">Efecto continuo</div>
      <div className="motion-field-row wrap">
        <label className="motion-field">Tipo
          <select value={layer.effect?.type || 'none'} onChange={(e) => onChange({ effect: { type: e.target.value } })}>
            {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {layer.effect?.type && layer.effect.type !== 'none' && (
          <>
            <label className="motion-field">Periodo
              <input type="number" step="0.1" min="0.1" value={layer.effect?.duration ?? 1} onChange={(e) => onChange({ effect: { duration: Number(e.target.value) } })} />
            </label>
            <label className="motion-field">Desfase
              <input type="number" step="0.1" min="0" value={layer.effect?.delay ?? 0} onChange={(e) => onChange({ effect: { delay: Number(e.target.value) } })} />
            </label>
          </>
        )}
      </div>
    </div>
  )
}

function TweenFields({ tween, onChange, types }) {
  return (
    <div className="motion-field-row wrap">
      <label className="motion-field">Tipo
        <select value={tween.type || 'none'} onChange={(e) => onChange({ type: e.target.value })}>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {tween.type === 'slide' && (
        <label className="motion-field">Dirección
          <select value={tween.direction || 'right'} onChange={(e) => onChange({ direction: e.target.value })}>
            {SLIDE_DIRS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      )}
      <label className="motion-field">Duración
        <input type="number" step="0.1" min="0" value={tween.duration ?? 0.6} onChange={(e) => onChange({ duration: Number(e.target.value) })} />
      </label>
      <label className="motion-field">Ease
        <select value={tween.ease || 'power3.out'} onChange={(e) => onChange({ ease: e.target.value })}>
          {EASES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
    </div>
  )
}
