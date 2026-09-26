import { useRef, useState } from 'react'
import Icon from '../../components/Icon'
import Hint from '../../components/Hint'
import FlipSelect from '../../components/FlipSelect'
import { BLEND_MODES, clipBlend } from '../../lib/clipBlend'
import { clipPose } from '../../lib/clipAnim'
import { TEXT_KF_SECTIONS, canKeyframe, clipPropsAt, kfState } from '../../lib/clipKeyframes'
import { PERSPECTIVE_DEFAULT, TEXT3D_MAX_ANGLE } from '../../lib/text3d'
import { CLIP_POS_MAX, CLIP_POS_MIN, TEXT_SCALE_MAX, fromCapcutPos, isOverlay, toCapcutPos } from '../../lib/clipLayout'
import { stretchOf } from '../../lib/textstyles'
import { clamp } from '../../lib/panning'
import { isVisualClip } from './editorModel'

export { TEXT_SCALE_MAX }

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

const parseNum = (raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))

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

// ‹ ◇ › de la cabecera, como CapCut: saltar al keyframe anterior / siguiente.
// `kfNav` = { prev, next } (funciones o null si no hay); sin kfNav, solo el rombo.
function KfTools({ kfSt, onAddKf, kfNav }) {
  if (!onAddKf) return null
  return (
    <span className="ed-kf-tools">
      {kfNav && (
        <button type="button" className="ed-kf-nav" title="Keyframe anterior" disabled={!kfNav.prev} onClick={kfNav.prev || undefined}>
          <Icon name="chevron_left" size={14} />
        </button>
      )}
      <KfDia state={kfSt} onClick={onAddKf} />
      {kfNav && (
        <button type="button" className="ed-kf-nav" title="Keyframe siguiente" disabled={!kfNav.next} onClick={kfNav.next || undefined}>
          <Icon name="chevron_right" size={14} />
        </button>
      )}
    </span>
  )
}

// Cabecera de sección como CapCut: [casilla] Título ▴ … ↺ ‹◇›.
function SecHead({ title, hint, open, onToggleOpen, check, onReset, kfSt, onAddKf, kfNav }) {
  return (
    <div className="ed-insp-sec-h">
      <span className="ed-insp-sec-title">
        {check}
        <button type="button" className="ed-insp-sec-tog" onClick={onToggleOpen} aria-expanded={open}>
          <span>{title}</span>
          <Icon name={open ? 'arrow_drop_up' : 'arrow_drop_down'} size={18} />
        </button>
        {hint && <Hint>{hint}</Hint>}
      </span>
      <span className="ed-insp-sec-tools">
        {onReset && (
          <button type="button" className="ed-insp-ico flat" title="Restablecer" onClick={onReset}>
            <Icon name="restart_alt" size={15} />
          </button>
        )}
        <KfTools kfSt={kfSt} onAddKf={onAddKf} kfNav={kfNav} />
      </span>
    </div>
  )
}

export function InspSection({ title, hint, children, defaultOpen = true, onReset, kfSt, onAddKf, kfNav }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`ed-insp-sec${open ? ' open' : ''}`}>
      <SecHead title={title} hint={hint} open={open} onToggleOpen={() => setOpen((v) => !v)}
        onReset={onReset} kfSt={kfSt} onAddKf={onAddKf} kfNav={kfNav} />
      {open && <div className="ed-insp-sec-b">{children}</div>}
    </section>
  )
}

// Sección con casilla, como Trazo / Fondo / Sombra de CapCut: la casilla activa
// el efecto y solo entonces se ven sus controles (que además se pueden plegar).
// `disabled` (+ `disabledHint`): no se puede activar ahora mismo.
export function InspCheckSection({
  title, hint, checked, onToggle, onReset, disabled, disabledHint, kfSt, onAddKf, kfNav, children,
}) {
  const [open, setOpen] = useState(true)
  const check = (
    <input type="checkbox" className="ed-insp-check-box" checked={!!checked} disabled={disabled && !checked}
      title={disabled && !checked ? disabledHint : undefined} aria-label={title}
      onChange={(e) => onToggle?.(e.target.checked)} />
  )
  return (
    <section className={`ed-insp-sec ed-insp-check${checked ? ' on' : ''}${open ? ' open' : ''}`}>
      <SecHead title={title} hint={hint} open={open} onToggleOpen={() => setOpen((v) => !v)} check={check}
        onReset={checked ? onReset : undefined} kfSt={checked ? kfSt : undefined}
        onAddKf={checked ? onAddKf : undefined} kfNav={checked ? kfNav : undefined} />
      {checked && open && children ? <div className="ed-insp-sec-b">{children}</div> : null}
    </section>
  )
}

/** Interruptor de CapCut (Escala uniforme…). */
export function Switch({ checked, onChange, disabled, title }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} disabled={disabled} title={title}
      className={`ed-switch${checked ? ' on' : ''}`} onClick={() => onChange?.(!checked)}>
      <i />
    </button>
  )
}

// Control numérico con flechas ▲▼ siempre visibles y edición manual. Shift
// multiplica el paso por 10 (flechas del teclado y botones).
export function NumberStepper({ value, min, max, step = 1, format, parse, suffix, onChange, ariaLabel }) {
  const fmt = format || ((v) => `${v}`)
  const prs = parse || parseNum
  const clampV = (n) => {
    let v = n
    if (Number.isFinite(min)) v = Math.max(min, v)
    if (Number.isFinite(max)) v = Math.min(max, v)
    return v
  }
  const bump = (dir, big) => onChange(clampV(+((Number(value) || 0) + dir * step * (big ? 10 : 1)).toFixed(6)))
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
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(1, e.shiftKey) }
          else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1, e.shiftKey) }
        }}
      />
      {suffix ? <em className="ed-num-stepper-suf">{suffix}</em> : null}
      <span className="ed-num-stepper-arrows">
        <button type="button" tabIndex={-1} aria-label="Aumentar" onClick={(e) => bump(1, e.shiftKey)}>
          <Icon name="arrow_drop_up" size={16} />
        </button>
        <button type="button" tabIndex={-1} aria-label="Disminuir" onClick={(e) => bump(-1, e.shiftKey)}>
          <Icon name="arrow_drop_down" size={16} />
        </button>
      </span>
    </div>
  )
}

// `typeMax`: tope al ESCRIBIR el valor (puede superar el del deslizador: escala
// extrema de textos, #5). `defaultValue`: doble clic en el nombre lo restablece.
export function InspSlider({ label, hint, value, min, max, typeMax, step, format, parse, suffix, onChange, onKf, kfSt, kfNav, stepper, defaultValue, extra }) {
  const canReset = defaultValue != null
  return (
    <div className="ed-insp-row">
      <div className={`ed-insp-row-lab${canReset ? ' resettable' : ''}`}
        title={canReset ? 'Doble clic: restablecer' : undefined}
        onDoubleClick={canReset ? () => onChange(defaultValue) : undefined}>
        {label}{hint && <Hint>{hint}</Hint>}
      </div>
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
                const n = parse ? parse(e.target.value) : parseNum(e.target.value)
                if (!Number.isFinite(n)) return
                onChange(n)
              }}
            />
            {suffix ? <em className="ed-insp-suf">{suffix}</em> : null}
          </>
        )}
        {extra}
        {onKf ? <KfTools kfSt={kfSt} onAddKf={onKf} kfNav={kfNav} /> : <span className="ed-kf-dia spacer" />}
      </div>
    </div>
  )
}

// Rueda de giro de CapCut: arrastrar alrededor fija el ángulo (0° arriba, sentido horario).
function RotationDial({ value, onChange }) {
  const ref = useRef(null)
  function down(e) {
    if (e.button !== 0) return
    e.preventDefault()
    const r = ref.current.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const move = (ev) => {
      let a = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90)
      if (a > 180) a -= 360
      onChange(a)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    move(e)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <span ref={ref} className="ed-dial" style={{ '--a': `${Number(value) || 0}deg` }} onPointerDown={down}
      title="Arrastra para girar" role="slider" aria-label="Girar" aria-valuenow={Math.round(Number(value) || 0)}>
      <i />
    </span>
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

/**
 * Transformación (panel Básico, como CapCut). La posición de un objeto (texto,
 * figura, vídeo libre) se enseña en unidades de CapCut si se conoce el tamaño
 * del proyecto (`frameW`/`frameH`): centro = 0, borde = ±ancho/±alto, Y hacia
 * arriba y sin tope. El encuadre de un vídeo que llena el cuadro (cx/cy sobre
 * la fuente) sigue en %.
 */
export default function EdTransform({
  clip, playhead, onPose, onAddKf, onTextStyle, onFlip, fps = 30, heightScale = 1, frameW, frameH, kfNav,
  textStyle, styleKf,
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
  const showRot = overlay || shape || visual || text
  const panX = fill ? (pose.cx ?? 0.5) : (pose.x ?? 0.5)
  const panY = fill ? (pose.cy ?? 0.5) : (pose.y ?? 0.5)
  const setPan = (x, y) => onPose?.(fill ? { cx: x, cy: y } : { x, y })
  const capcut = !fill && frameW > 0 && frameH > 0
  const pos = capcut ? toCapcutPos(panX, panY, frameW, frameH) : { X: Math.round(panX * 100), Y: Math.round(panY * 100) }
  const setPos = (X, Y) => {
    if (capcut) {
      const p = fromCapcutPos(X, Y, frameW, frameH)
      setPan(p.x, p.y)
      return
    }
    // El recorte de fuente (fill: cx/cy) vive en 0..1.
    const lo = fill ? 0 : CLIP_POS_MIN
    const hi = fill ? 1 : CLIP_POS_MAX
    setPan(clamp(X / 100, lo, hi), clamp(Y / 100, lo, hi))
  }
  const center = capcut ? 0 : 50
  const kfSt = kfState(clip, localT, fps)
  const rawScale = showZoomScale
    ? zoomToScale(pose.zoom)
    : heightFit ? ((pose.scale || 0) / hs) : (pose.scale || 1)
  const scalePct = Math.round(rawScale * 100)
  const setScalePct = (pct) => {
    const s = pct / 100
    if (showZoomScale) onPose?.({ zoom: scaleToZoom(s) })
    else if (heightFit) onPose?.({ scale: +clamp(s * hs, 0.0005, 100).toFixed(5) })
    else onPose?.({ scale: +clamp(s, 0.05, text ? TEXT_SCALE_MAX : 8).toFixed(4) })
  }
  // Escala uniforme (textos): apagada, Escala X / Y = Escala × estiramiento de cada eje.
  const split = text && !!textStyle?.scale_split
  const [sx, sy] = split ? stretchOf(textStyle) : [1, 1]
  const setUniform = (on) => {
    if (on) {
      onTextStyle?.({ scale_split: false, stretch_x: 1, stretch_y: 1 }, { fixed: true })
      onPose?.({ scale: +clamp((pose.scale || 1) * sx, 0.05, TEXT_SCALE_MAX).toFixed(4) })
    } else onTextStyle?.({ scale_split: true, stretch_x: 1, stretch_y: 1 }, { fixed: true })
  }
  const setAxisPct = (key, pct) => onTextStyle?.({ [key]: +clamp(pct / 100 / (pose.scale || 1), 0.01, 100).toFixed(4) })
  const stretchKf = styleKf ? {
    kfSt: styleKf.state(TEXT_KF_SECTIONS.stretch),
    onKf: () => styleKf.toggle(TEXT_KF_SECTIONS.stretch),
    kfNav: styleKf.nav,
  } : {}
  const rotation = +(pose.rotation || 0).toFixed(1)
  const setRotation = (v) => onPose?.({ rotation: v })

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
  const posTitle = capcut
    ? 'Como CapCut: 0 = centro; el borde está en ±ancho / ±alto del proyecto; Y positiva hacia arriba. Admite valores fuera del cuadro. Doble clic en X o Y: centrar.'
    : 'Encuadre sobre la fuente, en %. Doble clic en X o Y: centrar.'

  return (
    <InspSection title="Transformación" onReset={reset} kfSt={kfSt} onAddKf={onAddKf} kfNav={kfNav}>
      {(showScale || showZoomScale) && !split && (
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
          parse={parseNum}
          onChange={setScalePct}
          onKf={onAddKf}
          kfSt={kfSt}
          kfNav={kfNav}
          stepper
          defaultValue={100}
        />
      )}
      {split && [['Escala X', 'stretch_x', sx], ['Escala Y', 'stretch_y', sy]].map(([label, key, k]) => (
        <InspSlider key={key} label={label} value={Math.round((pose.scale || 1) * k * 100)} min={5} max={400}
          typeMax={TEXT_SCALE_MAX * 100} step={1} format={(v) => `${Math.round(v)}`} suffix="%" parse={parseNum}
          onChange={(pct) => setAxisPct(key, pct)} stepper defaultValue={100} {...stretchKf} />
      ))}
      {showScale && (
        <div className="ed-insp-toggle">
          <span>Escala uniforme</span>
          {text && onTextStyle
            ? <Switch checked={!split} onChange={setUniform}
                title={split ? 'Encendido: una sola Escala para los dos ejes' : 'Apagado: Escala X y Escala Y por separado'} />
            : <Switch checked disabled title="Escala X / Y por separado: de momento solo en textos" />}
        </div>
      )}
      {showXY && (
        <div className="ed-insp-row ed-insp-inline">
          <div className="ed-insp-row-lab" title={posTitle}>Posición</div>
          <div className="ed-insp-row-ctrl ed-insp-xy2">
            <span className="ed-insp-axis" title="Doble clic: centrar" onDoubleClick={() => setPos(center, pos.Y)}>X</span>
            <NumberStepper value={pos.X} step={1} format={(v) => `${Math.round(v)}`}
              onChange={(n) => setPos(Number(n), pos.Y)} ariaLabel="Posición X" />
            <span className="ed-insp-axis" title="Doble clic: centrar" onDoubleClick={() => setPos(pos.X, center)}>Y</span>
            <NumberStepper value={pos.Y} step={1} format={(v) => `${Math.round(v)}`}
              onChange={(n) => setPos(pos.X, Number(n))} ariaLabel="Posición Y" />
            {onAddKf ? <KfTools kfSt={kfSt} onAddKf={onAddKf} kfNav={kfNav} /> : <span className="ed-kf-dia spacer" />}
          </div>
        </div>
      )}
      {showRot && (
        <div className="ed-insp-row ed-insp-inline">
          <div className="ed-insp-row-lab resettable" title="Doble clic: restablecer" onDoubleClick={() => setRotation(0)}>
            {text ? 'Rotación del plano' : 'Girar'}
          </div>
          <div className="ed-insp-row-ctrl">
            <NumberStepper value={rotation} step={1} format={(v) => Number(v).toFixed(2)} suffix="°"
              onChange={(v) => setRotation(Number(v))} ariaLabel="Rotación" />
            <RotationDial value={rotation} onChange={setRotation} />
            <span className="ed-insp-grow" />
            {onAddKf ? <KfTools kfSt={kfSt} onAddKf={onAddKf} kfNav={kfNav} /> : <span className="ed-kf-dia spacer" />}
          </div>
        </div>
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
      {onFlip && <FlipRow clip={clip} onFlip={onFlip} />}
      {text && (
        <>
          <div className="ed-insp-subtitle">Texto 3D</div>
          <InspSlider
            label="Inclinar 3D"
            value={rotX}
            min={-TEXT3D_MAX_ANGLE}
            max={TEXT3D_MAX_ANGLE}
            step={1}
            format={(v) => Number(v).toFixed(1)}
            suffix="°"
            parse={parseNum}
            onChange={(v) => onPose?.({ rot_x: clamp(v, -TEXT3D_MAX_ANGLE, TEXT3D_MAX_ANGLE) })}
            onKf={onAddKf}
            kfSt={kfSt}
            kfNav={kfNav}
            stepper
            defaultValue={0}
          />
          <InspSlider
            label="Girar 3D"
            value={rotY}
            min={-TEXT3D_MAX_ANGLE}
            max={TEXT3D_MAX_ANGLE}
            step={1}
            format={(v) => Number(v).toFixed(1)}
            suffix="°"
            parse={parseNum}
            onChange={(v) => onPose?.({ rot_y: clamp(v, -TEXT3D_MAX_ANGLE, TEXT3D_MAX_ANGLE) })}
            onKf={onAddKf}
            kfSt={kfSt}
            kfNav={kfNav}
            stepper
            defaultValue={0}
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
              parse={parseNum}
              onChange={(v) => onTextStyle({ perspective: clamp(v, 0, 100) / 100 })}
              defaultValue={Math.round(PERSPECTIVE_DEFAULT * 100)}
            />
          ) : null}
        </>
      )}
    </InspSection>
  )
}
