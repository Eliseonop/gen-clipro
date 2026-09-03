import { clipPose } from '../../lib/clipAnim'
import { canKeyframe } from '../../lib/clipKeyframes'
import { FRAME_OPTIONS, frameOf, isOverlay } from '../../lib/clipLayout'
import { clamp } from '../../lib/panning'
import { isVisualClip } from './editorModel'
import FlipSelect from '../../components/FlipSelect'

function zoomToScale(zoom) {
  const z = Number(zoom)
  if (!Number.isFinite(z) || z <= 0) return 1
  return +clamp(1 / z, 1, 10).toFixed(4)
}

function scaleToZoom(scale) {
  const s = Number(scale)
  if (!Number.isFinite(s) || s <= 0) return 1
  return +clamp(1 / s, 0.1, 1).toFixed(4)
}

function Slider({ label, value, min, max, step, format, onChange }) {
  return (
    <label className="ed-fx-slider">
      <span>{label} {format(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function EdTransform({
  clip, playhead, onPose, onChangeFrame,
}) {
  if (!canKeyframe(clip) || clip.kind === 'audio') return null
  const localT = Math.max(0, (playhead ?? 0) - (clip.start || 0))
  const pose = clipPose(clip, localT)
  const overlay = isOverlay(clip)
  const shape = clip.kind === 'shape'
  const text = clip.kind === 'text'
  const visual = isVisualClip(clip)
  const showXY = overlay || shape || text
  const showScale = overlay || shape || text
  const showZoomScale = visual && !overlay
  const showRot = overlay || shape

  return (
    <div className="ed-fx-section">
      <div className="ed-fx-label">Transformación</div>
      {visual && <p className="ed-key-hint">Al mover el encuadre se crea un keyframe en el cabezal.</p>}
      {showXY && (
        <div className="ed-text-dense two">
          <Slider label="X" value={pose.x} min={0} max={1} step={0.01} format={(v) => Math.round(v * 100)}
            onChange={(x) => onPose?.({ x })} />
          <Slider label="Y" value={pose.y} min={0} max={1} step={0.01} format={(v) => Math.round(v * 100)}
            onChange={(y) => onPose?.({ y })} />
        </div>
      )}
      {showScale && (
        <div className="ed-text-dense two">
          <Slider label="Escala" value={pose.scale} min={0.05} max={4} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(scale) => onPose?.({ scale })} />
          {showRot && (
            <Slider label="Rotación" value={pose.rotation} min={-180} max={180} step={1} format={(v) => `${Math.round(v)}°`}
              onChange={(rotation) => onPose?.({ rotation })} />
          )}
        </div>
      )}
      {showZoomScale && (
        <Slider
          label="Escala"
          value={zoomToScale(pose.zoom)}
          min={1}
          max={10}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(scale) => onPose?.({ zoom: scaleToZoom(scale) })}
        />
      )}
      <Slider label="Opacidad" value={pose.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
        onChange={(opacity) => onPose?.({ opacity })} />
      {visual && onChangeFrame && (
        <label className="ed-prop">
          Encuadre
          <FlipSelect
            value={frameOf(clip)}
            options={FRAME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(v) => onChangeFrame(v)}
          />
        </label>
      )}
    </div>
  )
}
