import FlipSelect from '../../components/FlipSelect'
import { FORMATS } from './editorModel'
import { NumberStepper } from './EdTransform'

const ZOOM_MIN = 25
const ZOOM_MAX = 400
const ZOOM_STEP = 5

// Controles del área de visualización, en la fila del reproductor (.ed-transport):
// formato de salida y zoom visual (el zoom no toca el clip ni el export).
// Cada editor (Main / Clip) tiene su propio estado. Solo botones, sin etiquetas.
export default function EdViewerTools({
  zoom, onZoom, formatId, onFormat, formatCustomLabel,
}) {
  const pct = Math.round((zoom ?? 1) * 100)
  const setPct = (n) => {
    const v = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Number(n) || 0)))
    onZoom(v / 100)
  }
  const formatOptions = FORMATS.map((f) => ({ value: f.id, label: f.id }))
  if (formatId === 'custom') {
    formatOptions.push({ value: 'custom', label: formatCustomLabel || 'Personalizado' })
  }
  return (
    <div className="ed-viewer-tools" onPointerDown={(e) => e.stopPropagation()}>
      {onFormat && (
        <FlipSelect
          className="mini ed-vt-sel"
          value={formatId}
          onChange={onFormat}
          title="Formato de salida (define el encuadre)"
          options={formatOptions}
        />
      )}
      <div className="ed-vt-zoom" title="Zoom del canvas (solo visual, no afecta a la exportación)">
        <NumberStepper
          value={pct}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          suffix="%"
          ariaLabel="Zoom del canvas"
          onChange={setPct}
        />
        <button
          type="button"
          className="ed-vt-reset"
          title="Restablecer a 100%"
          aria-label="Restablecer zoom a 100%"
          onClick={() => onZoom(1)}
        >
          100%
        </button>
      </div>
    </div>
  )
}
