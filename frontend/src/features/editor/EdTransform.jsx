import { useState } from 'react'
import Icon from '../../components/Icon'
import { clipPose } from '../../lib/clipAnim'
import { canKeyframe, keyframeIdAt } from '../../lib/clipKeyframes'
import { CLIP_POS_MAX, CLIP_POS_MIN, isOverlay } from '../../lib/clipLayout'
import { clamp } from '../../lib/panning'
import { isVisualClip } from './editorModel'

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

// Control numérico con flechas ▲▼ siempre visibles y edición manual.
// Se usa en el panel Encuadre (Zoom, Escala, Posición). Reemplaza a los
// input[type=number], cuyas flechas no permanecen visibles.
export function NumberStepper({ value, min, max, step = 1, format, parse, suffix, onChange, ariaLabel }) {
  const fmt = format || ((v) => `${v}`)
  const prs = parse || ((raw) => parseFloat(String(raw).replace(/[^\d.-]/g, '')))
  const clampV = (n) => {
    let v = n
    if (Number.isFinite(min)) v = Math.max(min, v)
    if (Number.isFinite(max)) v = Math.min(max, v)
    return v
  }
  const bump = (dir) => onChange(clampV((Number(value) || 0) + dir * step))
  return (
    <div className="ed-num-stepper">
      <input
        className="ed-num-stepper-val"
        type="text"
        inputMode="decimal"
        value={fmt(value)}
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = prs(e.target.value)
          if (!Number.isFinite(n)) return
          onChange(clampV(n))
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(1) }
          else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1) }
        }}
      />
      {suffix ? <em className="ed-num-stepper-suf">{suffix}</em> : null}
      <span className="ed-num-stepper-arrows">
        <button type="button" tabIndex={-1} aria-label="Aumentar" onClick={() => bump(1)}>
          <Icon name="arrow_drop_up" size={16} />
        </button>
        <button type="button" tabIndex={-1} aria-label="Disminuir" onClick={() => bump(-1)}>
          <Icon name="arrow_drop_down" size={16} />
        </button>
      </span>
    </div>
  )
}

export function InspSlider({ label, value, min, max, step, format, parse, suffix, onChange, onKf, kfOn, stepper }) {
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
        {stepper ? (
          <NumberStepper
            value={value}
            min={min}
            max={max}
            step={step}
            format={format}
            parse={parse}
            suffix={suffix}
            onChange={onChange}
            ariaLabel={`${label} valor`}
          />
        ) : (
          <>
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
          </>
        )}
        {onKf ? <KfDia on={kfOn} onClick={onKf} /> : <span className="ed-kf-dia spacer" />}
      </div>
    </div>
  )
}

function InspXY({ label, value, onChange, onKf, kfOn }) {
  return (
    <div className="ed-insp-xy">
      <span>{label}</span>
      <NumberStepper
        value={Math.round(value)}
        step={1}
        format={(v) => `${Math.round(v)}`}
        onChange={(n) => onChange(Number(n))}
        ariaLabel={label}
      />
      {onKf ? <KfDia on={kfOn} onClick={onKf} /> : <span className="ed-kf-dia spacer" />}
    </div>
  )
}

export default function EdTransform({
  clip, playhead, onPose, onAddKf, fps = 30, heightScale = 1,
}) {
  if (!canKeyframe(clip) || clip.kind === 'audio') return null
  const localT = Math.max(0, (playhead ?? 0) - (clip.start || 0))
  const pose = clipPose(clip, localT)
  const overlay = isOverlay(clip)
  const shape = clip.kind === 'shape'
  const text = clip.kind === 'text'
  const visual = isVisualClip(clip)
  const fill = visual && !overlay
  // Vídeo/imagen en objeto libre: Escala 100% = altura del clip = altura del cuadro
  // (heightScale = outH/srcH). Figuras/texto conservan su escala nativa.
  const heightFit = overlay && visual
  const hs = heightFit && heightScale > 0 ? heightScale : 1
  const showXY = overlay || shape || text || fill
  const showScale = overlay || shape || text
  const showZoomScale = fill
  const showRot = overlay || shape || visual
  const panX = fill ? (pose.cx ?? 0.5) : (pose.x ?? 0.5)
  const panY = fill ? (pose.cy ?? 0.5) : (pose.y ?? 0.5)
  const setPan = (x, y) => onPose?.(fill ? { cx: x, cy: y } : { x, y })
  // El recorte de fuente (fill: cx/cy) vive en 0..1; la posición del objeto libre
  // puede salir del cuadro (animar entradas/salidas).
  const posMin = fill ? 0 : CLIP_POS_MIN
  const posMax = fill ? 1 : CLIP_POS_MAX
  const kfOn = !!keyframeIdAt(clip, localT, fps)
  const rawScale = showZoomScale
    ? zoomToScale(pose.zoom)
    : heightFit ? ((pose.scale || 0) / hs) : (pose.scale || 1)
  const scalePct = Math.round(rawScale * 100)

  function reset() {
    onPose?.({
      x: 0.5, y: 0.5, scale: heightFit ? hs : 1, rotation: 0, opacity: 1,
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
            else if (heightFit) onPose?.({ scale: +clamp(s * hs, 0.0005, 100).toFixed(5) })
            else onPose?.({ scale: +clamp(s, 0.05, 8).toFixed(4) })
          }}
          onKf={onAddKf}
          kfOn={kfOn}
          stepper
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
            onChange={(n) => setPan(clamp(n / 100, posMin, posMax), panY)}
            onKf={onAddKf}
            kfOn={kfOn}
          />
          <InspXY
            label="Y"
            value={panY * 100}
            onChange={(n) => setPan(panX, clamp(n / 100, posMin, posMax))}
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
          stepper
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
    </InspSection>
  )
}
