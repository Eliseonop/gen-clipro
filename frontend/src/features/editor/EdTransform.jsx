import { useState } from 'react'
import Icon from '../../components/Icon'
import { clipPose } from '../../lib/clipAnim'
import { canKeyframe, keyframeIdAt } from '../../lib/clipKeyframes'
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

export function KfDia({ on, onClick, title = 'Keyframe en el cabezal' }) {
  return (
    <button
      type="button"
      className={`ed-kf-dia${on ? ' on' : ''}`}
      title={title}
      onClick={onClick}
      disabled={!onClick}
    />
  )
}

export function InspSection({ title, children, defaultOpen = true, onReset, kfOn, onAddKf }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`ed-insp-sec${open ? ' open' : ''}`}>
      <div className="ed-insp-sec-h">
        <button type="button" className="ed-insp-sec-tog" onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'expand_more' : 'chevron_right'} size={18} />
          <span>{title}</span>
        </button>
        <span className="ed-insp-sec-tools">
          {onReset && (
            <button type="button" className="ed-insp-ico" title="Restablecer" onClick={onReset}>
              <Icon name="restart_alt" size={15} />
            </button>
          )}
          {onAddKf && <KfDia on={kfOn} onClick={onAddKf} />}
        </span>
      </div>
      {open && <div className="ed-insp-sec-b">{children}</div>}
    </section>
  )
}

export function InspSlider({ label, value, min, max, step, format, parse, suffix, onChange, onKf, kfOn }) {
  return (
    <div className="ed-insp-row">
      <div className="ed-insp-row-lab">{label}</div>
      <div className="ed-insp-row-ctrl">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          className="ed-insp-num"
          type="text"
          inputMode="decimal"
          value={format(value)}
          aria-label={`${label} valor`}
          onChange={(e) => {
            const n = parse ? parse(e.target.value) : parseFloat(String(e.target.value).replace(/[^\d.-]/g, ''))
            if (!Number.isFinite(n)) return
            onChange(n)
          }}
        />
        {suffix ? <em className="ed-insp-suf">{suffix}</em> : null}
        {onKf ? <KfDia on={kfOn} onClick={onKf} /> : <span className="ed-kf-dia spacer" />}
      </div>
    </div>
  )
}

function InspXY({ label, value, onChange, onKf, kfOn }) {
  return (
    <div className="ed-insp-xy">
      <span>{label}</span>
      <input
        className="ed-insp-num"
        type="number"
        step="1"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {onKf ? <KfDia on={kfOn} onClick={onKf} /> : <span className="ed-kf-dia spacer" />}
    </div>
  )
}

export default function EdTransform({
  clip, playhead, onPose, onChangeFrame, onAddKf, fps = 30,
}) {
  if (!canKeyframe(clip) || clip.kind === 'audio') return null
  const localT = Math.max(0, (playhead ?? 0) - (clip.start || 0))
  const pose = clipPose(clip, localT)
  const overlay = isOverlay(clip)
  const shape = clip.kind === 'shape'
  const text = clip.kind === 'text'
  const visual = isVisualClip(clip)
  const fill = visual && !overlay
  const showXY = overlay || shape || text || fill
  const showScale = overlay || shape || text
  const showZoomScale = fill
  const showRot = overlay || shape || visual
  const panX = fill ? (pose.cx ?? 0.5) : (pose.x ?? 0.5)
  const panY = fill ? (pose.cy ?? 0.5) : (pose.y ?? 0.5)
  const setPan = (x, y) => onPose?.(fill ? { cx: x, cy: y } : { x, y })
  const kfOn = !!keyframeIdAt(clip, localT, fps)
  const scalePct = Math.round((showZoomScale ? zoomToScale(pose.zoom) : (pose.scale || 1)) * 100)

  function reset() {
    onPose?.({
      x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1,
      cx: 0.5, cy: 0.5, zoom: 1,
    })
  }

  return (
    <InspSection title="Transformación" onReset={reset} kfOn={kfOn} onAddKf={onAddKf}>
      {(showScale || showZoomScale) && (
        <InspSlider
          label="Escala"
          value={scalePct}
          min={showZoomScale ? 100 : 5}
          max={showZoomScale ? 1000 : 400}
          step={1}
          format={(v) => `${Math.round(v)}`}
          suffix="%"
          parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
          onChange={(pct) => {
            const s = pct / 100
            if (showZoomScale) onPose?.({ zoom: scaleToZoom(s) })
            else onPose?.({ scale: +clamp(s, 0.05, 8).toFixed(4) })
          }}
          onKf={onAddKf}
          kfOn={kfOn}
        />
      )}
      {(showScale || showZoomScale) && (
        <label className="ed-insp-toggle">
          <span>Escala uniforme</span>
          <input type="checkbox" checked onChange={() => {}} title="La escala se aplica por igual en X e Y" />
        </label>
      )}
      {showXY && (
        <div className="ed-insp-pair">
          <div className="ed-insp-row-lab">Posición</div>
          <InspXY
            label="X"
            value={panX * 100}
            onChange={(n) => setPan(clamp(n / 100, 0, 1), panY)}
            onKf={onAddKf}
            kfOn={kfOn}
          />
          <InspXY
            label="Y"
            value={panY * 100}
            onChange={(n) => setPan(panX, clamp(n / 100, 0, 1))}
          />
        </div>
      )}
      {showRot && (
        <InspSlider
          label="Girar"
          value={+(pose.rotation || 0).toFixed(1)}
          min={-180}
          max={180}
          step={1}
          format={(v) => Number(v).toFixed(1)}
          suffix="°"
          parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
          onChange={(rotation) => onPose?.({ rotation })}
          onKf={onAddKf}
          kfOn={kfOn}
        />
      )}
      {showXY && (
        <div className="ed-insp-align">
          <button type="button" className="ed-insp-ico" title="Izquierda" onClick={() => setPan(0, panY)}><Icon name="format_align_left" size={15} /></button>
          <button type="button" className="ed-insp-ico" title="Centrar X" onClick={() => setPan(0.5, panY)}><Icon name="format_align_center" size={15} /></button>
          <button type="button" className="ed-insp-ico" title="Derecha" onClick={() => setPan(1, panY)}><Icon name="format_align_right" size={15} /></button>
          <button type="button" className="ed-insp-ico" title="Arriba" onClick={() => setPan(panX, 0)}><Icon name="vertical_align_top" size={15} /></button>
          <button type="button" className="ed-insp-ico" title="Centrar Y" onClick={() => setPan(panX, 0.5)}><Icon name="vertical_align_center" size={15} /></button>
          <button type="button" className="ed-insp-ico" title="Abajo" onClick={() => setPan(panX, 1)}><Icon name="vertical_align_bottom" size={15} /></button>
        </div>
      )}
      {visual && onChangeFrame && (
        <label className="ed-insp-select">
          Encuadre
          <FlipSelect
            value={frameOf(clip)}
            options={FRAME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(v) => onChangeFrame(v)}
          />
        </label>
      )}
    </InspSection>
  )
}
