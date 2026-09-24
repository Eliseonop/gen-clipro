import { useState } from 'react'
import Icon from '../../components/Icon'
import Hint from '../../components/Hint'
import FlipSelect from '../../components/FlipSelect'
import { BLEND_MODES, clipBlend } from '../../lib/clipBlend'
import { clipPose } from '../../lib/clipAnim'
import { canKeyframe, clipPropsAt, kfState } from '../../lib/clipKeyframes'
import { PERSPECTIVE_DEFAULT, TEXT3D_MAX_ANGLE } from '../../lib/text3d'
import { CLIP_POS_MAX, CLIP_POS_MIN, isOverlay } from '../../lib/clipLayout'
import { clamp } from '../../lib/panning'
import { isVisualClip } from './editorModel'

// Escala máxima de un texto (×): libass lo dibuja como vector, así que no pierde
// calidad ni pesa. Figuras e imágenes se exportan como imagen escalada: tope ×8.
export const TEXT_SCALE_MAX = 100

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

const KF_TITLES = {
  off: 'Animar esta propiedad (crea el primer keyframe)',
  empty: 'Añadir keyframe en el cabezal',
  on: 'Quitar el keyframe del cabezal',
}

/** `state`: 'off' (sin animar) · 'empty' (animada, sin KF aquí) · 'on' (KF aquí). */
export function KfDia({ state = 'off', onClick, title }) {
  const st = state === true ? 'on' : (state || 'off')
  return (
    <button
      type="button"
      className={`ed-kf-dia kf-${st}`}
      title={title || KF_TITLES[st]}
      onClick={onClick}
      disabled={!onClick}
    />
  )
}

export function InspSection({ title, hint, children, defaultOpen = true, onReset, kfSt, onAddKf }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`ed-insp-sec${open ? ' open' : ''}`}>
      <div className="ed-insp-sec-h">
        <span className="ed-insp-sec-title">
          <button type="button" className="ed-insp-sec-tog" onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? 'expand_more' : 'chevron_right'} size={18} />
            <span>{title}</span>
          </button>
          {hint && <Hint>{hint}</Hint>}
        </span>
        <span className="ed-insp-sec-tools">
          {onReset && (
            <button type="button" className="ed-insp-ico" title="Restablecer" onClick={onReset}>
              <Icon name="restart_alt" size={15} />
            </button>
          )}
          {onAddKf && <KfDia state={kfSt} onClick={onAddKf} />}
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

// `typeMax`: tope al ESCRIBIR el valor (puede superar el del deslizador: escala
// extrema de textos, #5).
export function InspSlider({ label, hint, value, min, max, typeMax, step, format, parse, suffix, onChange, onKf, kfSt, stepper }) {
  return (
    <div className="ed-insp-row">
      <div className="ed-insp-row-lab">{label}{hint && <Hint>{hint}</Hint>}</div>
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
            max={typeMax ?? max}
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
        {onKf ? <KfDia state={kfSt} onClick={onKf} /> : <span className="ed-kf-dia spacer" />}
      </div>
    </div>
  )
}

function InspXY({ label, value, onChange, onKf, kfSt }) {
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
      {onKf ? <KfDia state={kfSt} onClick={onKf} /> : <span className="ed-kf-dia spacer" />}
    </div>
  )
}

// Modo de fusión (#8): cómo se mezcla el clip con lo que tiene debajo.
const BLEND_OPTIONS = BLEND_MODES.map((m) => ({ value: m.id, label: m.label }))
export function BlendRow({ clip, onBlend }) {
  return (
    <label className="ed-insp-select">
      Modo de fusión
      <FlipSelect value={clipBlend(clip)} options={BLEND_OPTIONS} onChange={onBlend} title="Modo de fusión" />
    </label>
  )
}

// Voltear (#7): espejo en los ejes del clip (no se anima, como en CapCut).
export function FlipRow({ clip, onFlip }) {
  return (
    <div className="ed-insp-row">
      <div className="ed-insp-row-lab">Voltear</div>
      <div className="ed-insp-flip">
        <button
          type="button"
          className={`ed-insp-ico${clip.flip_h ? ' on' : ''}`}
          title="Voltear en horizontal (espejo)"
          aria-pressed={!!clip.flip_h}
          onClick={() => onFlip('h')}
        >
          <Icon name="flip" size={16} />
        </button>
        <button
          type="button"
          className={`ed-insp-ico ed-flip-v${clip.flip_v ? ' on' : ''}`}
          title="Voltear en vertical (reflejo)"
          aria-pressed={!!clip.flip_v}
          onClick={() => onFlip('v')}
        >
          <Icon name="flip" size={16} />
        </button>
      </div>
    </div>
  )
}

export default function EdTransform({
  clip, playhead, onPose, onAddKf, onTextStyle, onFlip, fps = 30, heightScale = 1,
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
  const kfSt = kfState(clip, localT, fps)
  const rawScale = showZoomScale
    ? zoomToScale(pose.zoom)
    : heightFit ? ((pose.scale || 0) / hs) : (pose.scale || 1)
  const scalePct = Math.round(rawScale * 100)

  function reset() {
    onPose?.({
      x: 0.5, y: 0.5, scale: heightFit ? hs : 1, rotation: 0, opacity: 1,
      cx: 0.5, cy: 0.5, zoom: 1, ...(text ? { rot_x: 0, rot_y: 0 } : {}),
    })
  }
  // Texto 3D (#4): giro en X/Y con perspectiva, keyframeable (ver lib/text3d.js).
  const props3d = text ? clipPropsAt(clip, localT) : null
  const rotX = +(props3d?.rot_x || 0).toFixed(1)
  const rotY = +(props3d?.rot_y || 0).toFixed(1)
  const persp = Number.isFinite(Number(clip?.style?.perspective)) ? Number(clip.style.perspective) : PERSPECTIVE_DEFAULT

  return (
    <InspSection title="Transformación" onReset={reset} kfSt={kfSt} onAddKf={onAddKf}>
      {(showScale || showZoomScale) && (
        <InspSlider
          label="Escala"
          value={scalePct}
          min={showZoomScale ? 100 : 5}
          max={showZoomScale ? 1000 : 400}
          // Textos: hasta 10 000 % escribiendo el valor ("texto que atraviesas").
          typeMax={text ? TEXT_SCALE_MAX * 100 : undefined}
          step={1}
          format={(v) => `${Math.round(v)}`}
          suffix="%"
          parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
          onChange={(pct) => {
            const s = pct / 100
            if (showZoomScale) onPose?.({ zoom: scaleToZoom(s) })
            else if (heightFit) onPose?.({ scale: +clamp(s * hs, 0.0005, 100).toFixed(5) })
            else onPose?.({ scale: +clamp(s, 0.05, text ? TEXT_SCALE_MAX : 8).toFixed(4) })
          }}
          onKf={onAddKf}
          kfSt={kfSt}
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
            kfSt={kfSt}
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
          kfSt={kfSt}
          stepper
        />
      )}
      {text && (
        <>
          <InspSlider
            label="Inclinar 3D"
            value={rotX}
            min={-TEXT3D_MAX_ANGLE}
            max={TEXT3D_MAX_ANGLE}
            step={1}
            format={(v) => Number(v).toFixed(1)}
            suffix="°"
            parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
            onChange={(v) => onPose?.({ rot_x: clamp(v, -TEXT3D_MAX_ANGLE, TEXT3D_MAX_ANGLE) })}
            onKf={onAddKf}
            kfSt={kfSt}
            stepper
          />
          <InspSlider
            label="Girar 3D"
            value={rotY}
            min={-TEXT3D_MAX_ANGLE}
            max={TEXT3D_MAX_ANGLE}
            step={1}
            format={(v) => Number(v).toFixed(1)}
            suffix="°"
            parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
            onChange={(v) => onPose?.({ rot_y: clamp(v, -TEXT3D_MAX_ANGLE, TEXT3D_MAX_ANGLE) })}
            onKf={onAddKf}
            kfSt={kfSt}
            stepper
          />
          {(rotX || rotY) && onTextStyle ? (
            <InspSlider
              label="Perspectiva"
              value={Math.round(persp * 100)}
              min={0}
              max={100}
              step={1}
              format={(v) => `${Math.round(v)}`}
              suffix="%"
              parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
              onChange={(v) => onTextStyle({ perspective: clamp(v, 0, 100) / 100 })}
            />
          ) : null}
        </>
      )}
      {onFlip && <FlipRow clip={clip} onFlip={onFlip} />}
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
