import { useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import {
  FONTS, FONT_SIZE_REF, LETTER_SPACING_RANGE, LINE_HEIGHT_DEFAULT, LINE_HEIGHT_RANGE, SHADOW_DEFAULTS,
  TEXT_LOOKS, activeLookId, cssFont, lineHeightOf, lookPatch, lookPreviewStyle, selectedSubtitleThemeId, themePreviewStyle,
  GLOW_DEFAULTS, glowColor,
} from '../../lib/textstyles'
import { SUBTITLE_THEMES, WORD_FX_OPTIONS, BLOCK_APPEAR_OPTIONS, WORDS_PER_BOX, themeById } from '../../lib/subtitleThemes'
import { hasWordFx, toggleWordFx, styleOpacity, splitCaptionWords, wordsPerBoxOptions, activeWordsPerBox } from '../../lib/textKaraoke'
import { InspCheckSection, InspSection, InspSlider, KfDia, NumberStepper, Switch } from './EdTransform'
import { TEXT_KF_SECTIONS } from '../../lib/clipKeyframes'

// Panel de Texto con el orden y los controles del Básico de CapCut: contenido,
// Fuente, Tamaño, Diseño, May./min., Color, Carácter / Línea, Alineación y
// Estilo preestablecido; después (en el inspector) Transformación y Mezcla, y
// aquí Trazo / Fondo / Brillo / Sombra y Mis estilos. Los subtítulos (estilos,
// palabras por cuadro, karaoke) van en su propia pestaña: SubtitlesPanel.

const parseNum = (raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))
const numOr = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d)
const pct = (v) => `${Math.round(v)}`
const hasBg = (st) => !!st.bg && st.bg !== 'none'
const BG_DEFAULT = '#111318'
const BG_OPACITY_DEFAULT = 0.55
const BORDER_DEFAULT = 4
const BORDER_MAX = 20
const SIZE_PX_DEFAULT = 60
const SIZE_PX_RANGE = [6, 300]

function Row({ label, title, children }) {
  return (
    <div className="ed-trow" title={title}>
      <span className="ed-trow-lab">{label}</span>
      <div className="ed-trow-ctrl">{children}</div>
    </div>
  )
}

function Swatch({ value, onChange, title }) {
  return <input className="ed-trow-color" type="color" value={value} title={title} onChange={(e) => onChange(e.target.value)} />
}

function Toggle({ on, title, onClick, children }) {
  return (
    <button type="button" className={on ? 'on' : ''} aria-pressed={!!on} title={title} onClick={onClick}>{children}</button>
  )
}

const ALIGNS = [
  { value: 'left', icon: 'format_align_left', title: 'Alinear a la izquierda' },
  { value: 'center', icon: 'format_align_center', title: 'Centrar' },
  { value: 'right', icon: 'format_align_right', title: 'Alinear a la derecha' },
]
const CASES = [
  { value: 'upper', label: 'TT', title: 'MAYÚSCULAS' },
  { value: 'lower', label: 'tt', title: 'minúsculas' },
  { value: 'title', label: 'Tt', title: 'Primera Letra En Mayúscula' },
]

/** Estilo preestablecido: la rejilla "Aa" de CapCut (⊘ = texto liso). */
function LookGrid({ st, set }) {
  const on = activeLookId(st)
  return (
    <>
      <div className="ed-look-title">Estilo preestablecido</div>
      <div className="ed-look-grid">
        <button type="button" className={`ed-look none${on === 'none' ? ' on' : ''}`} title="Ninguno"
          onClick={() => set(lookPatch(null))}>
          <Icon name="block" size={22} />
        </button>
        {TEXT_LOOKS.map((lk) => (
          <button key={lk.id} type="button" className={`ed-look${on === lk.id ? ' on' : ''}`} title={lk.id}
            onClick={() => set(lookPatch(lk))}>
            <span className="ed-look-aa" style={lookPreviewStyle(lk)}>Aa</span>
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * Rombo ‹◇› de una sección de estilo animable (`kf` = { state(keys), toggle(keys),
 * nav } desde el inspector; sin él, la sección no se anima: pista de texto).
 */
function kfProps(kf, section) {
  if (!kf) return {}
  const keys = TEXT_KF_SECTIONS[section]
  return { kfSt: kf.state(keys), onAddKf: () => kf.toggle(keys), kfNav: kf.nav }
}

export function TextFxPanel({ section = 'look', style, mode = 'clip', onChangeStyle, kf }) {
  const st = style || {}
  const set = (patch) => onChangeStyle?.(patch)
  // Casillas y ↺: valen para todo el clip, nunca crean keyframes.
  const setFixed = (patch) => onChangeStyle?.(patch, { fixed: true })

  if (section === 'appear') {
    return (
      <label className="ed-prop">
        Aparición
        <FlipSelect
          value={st.block_appear || 'none'}
          options={BLOCK_APPEAR_OPTIONS}
          onChange={(v) => set({ block_appear: v })}
        />
      </label>
    )
  }

  const bw = numOr(st.border_width, 0)
  return (
    <>
      {/* La pista de texto no tiene Mezcla propia: su opacidad vive aquí. En un
          clip, Mezcla va con Transformación (con keyframes), como en CapCut. */}
      {mode === 'track' && (
        <InspSection title="Mezcla" onReset={() => set({ opacity: 1 })}>
          <InspSlider label="Opacidad" value={Math.round(styleOpacity(st) * 100)} min={0} max={100} step={1}
            format={pct} suffix="%" parse={parseNum} stepper
            onChange={(v) => set({ opacity: Math.max(0, Math.min(1, v / 100)) })} defaultValue={100} />
        </InspSection>
      )}

      <InspCheckSection title="Trazo" checked={bw > 0} {...kfProps(kf, 'stroke')}
        onToggle={(on) => setFixed({ border_width: on ? BORDER_DEFAULT : 0 })}
        onReset={() => setFixed({ border_width: BORDER_DEFAULT, border_color: '#000000' })}>
        <Row label="Color"><Swatch value={st.border_color || '#000000'} onChange={(v) => set({ border_color: v })} title="Color del trazo" /></Row>
        <InspSlider label="Grosor" value={bw} min={1} max={BORDER_MAX} step={1} format={pct} parse={parseNum} stepper
          onChange={(v) => set({ border_width: Math.max(1, Math.min(BORDER_MAX, Math.round(v))) })} defaultValue={BORDER_DEFAULT} />
      </InspCheckSection>

      <InspCheckSection title="Fondo" checked={hasBg(st)} {...kfProps(kf, 'bg')}
        disabled={!!st.curve_on} disabledHint="Quita la Curva para poner Fondo (como en CapCut)"
        onToggle={(on) => setFixed({ bg: on ? BG_DEFAULT : 'none' })}
        onReset={() => setFixed({
          bg: BG_DEFAULT, bg_opacity: BG_OPACITY_DEFAULT, bg_style: 'line',
          bg_radius: 0, bg_pad_x: 0, bg_pad_y: 0, bg_dx: 0, bg_dy: 0,
        })}>
        <div className="ed-bg-styles" role="radiogroup" aria-label="Estilo del fondo">
          {BG_STYLES.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={(st.bg_style || 'line') === o.value}
              className={`ed-bg-style ${o.value}${(st.bg_style || 'line') === o.value ? ' on' : ''}`} title={o.title}
              onClick={() => setFixed({ bg_style: o.value })}>
              <i /><i />
            </button>
          ))}
        </div>
        <Row label="Color"><Swatch value={hasBg(st) ? st.bg : BG_DEFAULT} onChange={(v) => set({ bg: v })} title="Color del fondo" /></Row>
        <InspSlider label="Opacidad" value={Math.round(numOr(st.bg_opacity, BG_OPACITY_DEFAULT) * 100)} min={0} max={100} step={1}
          format={pct} suffix="%" parse={parseNum} stepper
          onChange={(v) => set({ bg_opacity: Math.max(0, Math.min(1, v / 100)) })} defaultValue={Math.round(BG_OPACITY_DEFAULT * 100)} />
        <BgShapeControls st={st} set={set} />
      </InspCheckSection>

      <InspCheckSection title="Brillo" checked={!!st.glow} onToggle={(on) => setFixed({ glow: on })}
        onReset={() => setFixed({
          glow_color: '#ffffff', glow_style: 'soft', glow_intensity: GLOW_DEFAULTS.intensity,
          glow_range: GLOW_DEFAULTS.range, glow_dx: 0, glow_dy: 0,
        })} {...kfProps(kf, 'glow')}
        hint="Halo alrededor de las letras. Con el brillo activado no se dibuja la sombra paralela.">
        <GlowControls st={st} set={set} setFixed={setFixed} />
      </InspCheckSection>

      <InspCheckSection title="Sombra" checked={!!st.shadow} onToggle={(on) => setFixed({ shadow: on })}
        {...kfProps(kf, 'shadow')}
        onReset={() => setFixed({
          shadow_color: '#000000', shadow_opacity: SHADOW_DEFAULTS.opacity, shadow_blur: SHADOW_DEFAULTS.blur,
          shadow_distance: SHADOW_DEFAULTS.distance, shadow_angle: SHADOW_DEFAULTS.angle,
        })}>
        {st.glow
          ? <p className="ed-insp-meta">Con Brillo activado no se ve la sombra paralela.</p>
          : <ShadowControls st={st} set={set} />}
      </InspCheckSection>

      <InspCheckSection title="Curva" checked={!!st.curve_on} {...kfProps(kf, 'curve')}
        onToggle={(on) => setFixed(on ? { curve_on: true, curve: numOr(st.curve, 0) || CURVE_DEFAULT } : { curve_on: false })}
        onReset={() => setFixed({ curve: CURVE_DEFAULT })}
        disabled={hasBg(st)} disabledHint="Quita el Fondo para usar la Curva (como en CapCut)"
        hint="Dobla el texto en arco: Fuerza positiva hacia arriba, negativa hacia abajo.">
        <InspSlider label="Fuerza" value={Math.round(numOr(st.curve, CURVE_DEFAULT) * 100)} min={-100} max={100} step={1}
          format={pct} parse={parseNum} stepper
          onChange={(v) => set({ curve: Math.max(-100, Math.min(100, Math.round(v))) / 100 })} defaultValue={CURVE_DEFAULT * 100} />
      </InspCheckSection>
    </>
  )
}

const CURVE_DEFAULT = 0.5

const BG_STYLES = [
  { value: 'line', title: 'Una caja por línea' },
  { value: 'block', title: 'Una caja para todo el texto' },
]

// Forma del Fondo (CapCut): esquinas, Alto / Ancho (margen, 0–100 = 0–1 em) y
// Desplazamiento X / Y (−100…100 = ±1 em, Y hacia arriba).
function BgShapeControls({ st, set }) {
  const pctOf = (k) => Math.round(numOr(st[k], 0) * 100)
  const slider = (label, key, title) => (
    <InspSlider label={label} hint={title} value={pctOf(key)} min={0} max={100} step={1} format={pct} parse={parseNum} stepper
      onChange={(v) => set({ [key]: Math.max(0, Math.min(100, v)) / 100 })} defaultValue={0} />
  )
  return (
    <>
      {slider('Rectángulo redondeado', 'bg_radius', 'Redondeo de las esquinas de la caja')}
      {slider('Alto', 'bg_pad_y', 'Margen de la caja por arriba y por abajo')}
      {slider('Ancho', 'bg_pad_x', 'Margen de la caja a los lados')}
      <ShiftRow st={st} set={set} kx="bg_dx" ky="bg_dy" what="la caja" />
    </>
  )
}

// Desplazamiento X / Y (−100…100 = ±1 em, Y hacia arriba) de la caja o del halo.
function ShiftRow({ st, set, kx, ky, what }) {
  const val = (k) => Math.round(numOr(st[k], 0) * 100)
  const shift = (key, v) => set({ [key]: Math.max(-100, Math.min(100, Math.round(Number(v) || 0))) / 100 })
  return (
    <div className="ed-insp-row ed-insp-inline">
      <div className="ed-insp-row-lab" title={`Mueve ${what} respecto al texto (Y hacia arriba)`}>Desplazamiento</div>
      <div className="ed-insp-row-ctrl ed-insp-xy2">
        <span className="ed-insp-axis" title="Doble clic: 0" onDoubleClick={() => shift(kx, 0)}>X</span>
        <NumberStepper value={val(kx)} min={-100} max={100} step={1} format={(v) => `${Math.round(v)}`}
          onChange={(n) => shift(kx, n)} ariaLabel={`Desplazamiento X de ${what}`} />
        <span className="ed-insp-axis" title="Doble clic: 0" onDoubleClick={() => shift(ky, 0)}>Y</span>
        <NumberStepper value={val(ky)} min={-100} max={100} step={1} format={(v) => `${Math.round(v)}`}
          onChange={(n) => shift(ky, n)} ariaLabel={`Desplazamiento Y de ${what}`} />
      </div>
    </div>
  )
}

const GLOW_STYLES = [
  { value: 'soft', title: 'Brillo suave' },
  { value: 'strong', title: 'Brillo intenso (halo más lleno)' },
]

// Brillo (CapCut): estilo, Color, Intensidad, Intervalo (tamaño del halo) y desplazamiento.
function GlowControls({ st, set, setFixed }) {
  const color = glowColor(st)
  const style = st.glow_style === 'strong' ? 'strong' : 'soft'
  return (
    <>
      <div className="ed-bg-styles" role="radiogroup" aria-label="Estilo del brillo">
        {GLOW_STYLES.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={style === o.value}
            className={`ed-bg-style ed-glow-style${style === o.value ? ' on' : ''}`} title={o.title}
            onClick={() => setFixed({ glow_style: o.value })}>
            <span style={{ textShadow: o.value === 'strong'
              ? `0 0 3px ${color}, 0 0 6px ${color}, 0 0 10px ${color}` : `0 0 8px ${color}` }}>Aa</span>
          </button>
        ))}
      </div>
      <Row label="Color"><Swatch value={color} onChange={(v) => set({ glow_color: v })} title="Color del brillo" /></Row>
      <InspSlider label="Intensidad" hint="Opacidad del halo"
        value={Math.round(numOr(st.glow_intensity, GLOW_DEFAULTS.intensity) * 100)} min={0} max={100} step={1}
        format={pct} parse={parseNum} stepper
        onChange={(v) => set({ glow_intensity: Math.max(0, Math.min(100, v)) / 100 })} defaultValue={Math.round(GLOW_DEFAULTS.intensity * 100)} />
      <InspSlider label="Intervalo" hint="Tamaño del halo alrededor de las letras"
        value={Math.round(numOr(st.glow_range, GLOW_DEFAULTS.range) * 100)} min={0} max={100} step={1}
        format={pct} parse={parseNum} stepper
        onChange={(v) => set({ glow_range: Math.max(0, Math.min(100, v)) / 100 })} defaultValue={Math.round(GLOW_DEFAULTS.range * 100)} />
      <ShiftRow st={st} set={set} kx="glow_dx" ky="glow_dy" what="el brillo" />
    </>
  )
}

// Sombra paralela (estilo CapCut): distancia y desenfoque en "em" del texto.
// Distancia 0–100 → 0–1 em; desenfoque 0–100 → 0–0,5 em.
function ShadowControls({ st, set }) {
  const opacity = Math.round(numOr(st.shadow_opacity, SHADOW_DEFAULTS.opacity) * 100)
  const dist = Math.round(numOr(st.shadow_distance, SHADOW_DEFAULTS.distance) * 100)
  const blur = Math.round(numOr(st.shadow_blur, SHADOW_DEFAULTS.blur) * 200)
  const angle = Math.round(numOr(st.shadow_angle, SHADOW_DEFAULTS.angle))
  return (
    <>
      <Row label="Color"><Swatch value={st.shadow_color || '#000000'} onChange={(v) => set({ shadow_color: v })} title="Color de la sombra" /></Row>
      <InspSlider label="Opacidad" value={opacity} min={0} max={100} step={1} format={pct} suffix="%" parse={parseNum} stepper
        onChange={(v) => set({ shadow_opacity: Math.max(0, Math.min(100, v)) / 100 })}
        defaultValue={Math.round(SHADOW_DEFAULTS.opacity * 100)} />
      <InspSlider label="Desenfoque" value={blur} min={0} max={100} step={1} format={pct} suffix="%" parse={parseNum} stepper
        onChange={(v) => set({ shadow_blur: Math.max(0, Math.min(100, v)) / 200 })}
        defaultValue={Math.round(SHADOW_DEFAULTS.blur * 200)} />
      <InspSlider label="Distancia" value={dist} min={0} max={100} step={1} format={pct} parse={parseNum} stepper
        onChange={(v) => set({ shadow_distance: Math.max(0, Math.min(100, v)) / 100 })}
        defaultValue={Math.round(SHADOW_DEFAULTS.distance * 100)} />
      <InspSlider label="Ángulo" hint="0° derecha, 90° abajo" value={angle} min={-180} max={180} step={1} format={pct} suffix="°" parse={parseNum} stepper
        onChange={(v) => set({ shadow_angle: Math.max(-180, Math.min(180, v)) })}
        defaultValue={Math.round(SHADOW_DEFAULTS.angle)} />
    </>
  )
}

function WordsPerBox({ options, value, onChange, onFragment, disableFragment, hint }) {
  if (!options?.length) return null
  const active = activeWordsPerBox(options, value)
  return (
    <>
      <div className="ed-words-row">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={`ed-words-n ${active === n ? 'on' : ''}`}
            title={`${n} palabra${n === 1 ? '' : 's'} por cuadro`}
            onClick={() => onChange?.(n)}
          >
            {n}
          </button>
        ))}
        {onFragment && (
          <button
            type="button"
            className="ghost small"
            disabled={disableFragment}
            title={disableFragment ? 'Este cuadro ya tiene ese máximo de palabras' : 'Partir el texto según el máximo'}
            onClick={() => onFragment?.()}
          >
            Fragmentar
          </button>
        )}
      </div>
      {hint ? <p className="ed-insp-meta">{hint}</p> : null}
    </>
  )
}

/**
 * Pestaña Subtítulos (junto a Máscara / Animación / Seguimiento): estilos de
 * subtítulo, palabras por cuadro y palabra activa (karaoke). Un estilo se aplica
 * al fragmento seleccionado o, con el interruptor, a toda su pista (como
 * «Aplicar en todos los subtítulos» de CapCut).
 */
export function SubtitlesPanel({ mode = 'segment', clip, style, onChangeStyle, onApplyPreset, onApplyTrackPreset, onFragment }) {
  const [wholeTrack, setWholeTrack] = useState(false)
  const st = style || {}
  const isTrack = mode === 'track'
  const themeId = selectedSubtitleThemeId(st)
  const set = (patch) => onChangeStyle?.(patch)
  const clipWords = splitCaptionWords(clip?.text || '').length
  const clipBoxOpts = wordsPerBoxOptions(clipWords)
  const clipActive = activeWordsPerBox(clipBoxOpts, st.max_words)
  if (!isTrack && !clip) return null
  const toTrack = !isTrack && wholeTrack && onApplyTrackPreset
  const apply = (t) => (toTrack ? onApplyTrackPreset : onApplyPreset)?.(t)
  return (
    <>
      <InspSection
        title="Estilo de subtítulo"
        hint={<>Clic en un estilo para ponerlo; otra vez (o ⊘) para quitarlo. El texto, la posición y el
          tamaño de caja no cambian.</>}
      >
        <div className="ed-sub-grid">
          <button type="button" className={`ed-sub-tile none${themeId ? '' : ' on'}`} title="Sin estilo de subtítulo"
            onClick={() => themeId && apply(themeById(themeId))}>
            <Icon name="block" size={20} />
          </button>
          {SUBTITLE_THEMES.map((t) => (
            <button key={t.id} type="button" className={`ed-sub-tile${themeId === t.id ? ' on' : ''}`} title={t.name}
              onClick={() => apply(t)}>
              <span className="ed-sub-aa" style={themePreviewStyle(t)}>
                A<b style={{ color: t.style.highlight_color }}>a</b>
              </span>
              <span className="ed-sub-name">{t.name}</span>
            </button>
          ))}
        </div>
        {!isTrack && onApplyTrackPreset && (
          <div className="ed-insp-row ed-insp-inline">
            <span className="ed-insp-row-lab">Aplicar a toda la pista</span>
            <span className="ed-insp-grow" />
            <Switch checked={wholeTrack} onChange={setWholeTrack}
              title="Encendido: el estilo se pone en todos los subtítulos de esta pista" />
          </div>
        )}
      </InspSection>
      <InspSection title="Palabras por cuadro">
        {isTrack ? (
          <WordsPerBox
            options={wordsPerBoxOptions(WORDS_PER_BOX.at(-1) || 10, true)}
            value={st.max_words}
            onChange={(n) => set({ max_words: n })}
            onFragment={onFragment}
            hint="Máximo de palabras por cuadro en toda la pista (1–10). Los subtítulos nuevos también se parten así."
          />
        ) : (
          <WordsPerBox
            options={clipBoxOpts}
            value={st.max_words}
            onChange={(n) => set({ max_words: n })}
            onFragment={onFragment}
            disableFragment={clipWords <= 1 || clipActive >= clipWords}
            hint="Fragmentar lo parte en varios clips, conservando los tiempos."
          />
        )}
      </InspSection>
      <InspSection title="Palabra activa" hint="La palabra que se está diciendo (karaoke). Los efectos se pueden combinar.">
        <div className="ed-text-dense four">
          {WORD_FX_OPTIONS.map((o) => (
            <label key={o.value} className="ed-chip" title="Se pueden combinar">
              <input
                type="checkbox"
                checked={hasWordFx(st, o.value)}
                onChange={() => set({ word_fx: toggleWordFx(st.word_fx, o.value) })}
              />
              {o.label}
            </label>
          ))}
        </div>
        <Row label="Resalte"><Swatch value={st.highlight_color || '#ffe566'} onChange={(v) => set({ highlight_color: v })} title="Color de la palabra activa" /></Row>
        <InspSlider label="Opacidad activa" hint="Opacidad de la palabra que se está diciendo"
          value={Math.round(numOr(st.active_opacity, 1) * 100)} min={0} max={100} step={1} format={pct} suffix="%" parse={parseNum}
          onChange={(v) => set({ active_opacity: Math.max(0, Math.min(100, v)) / 100 })} defaultValue={100} />
        <InspSlider label="Opacidad inactiva" hint="Opacidad de las palabras que aún no están activas"
          value={Math.round(numOr(st.inactive_opacity, 1) * 100)} min={0} max={100} step={1} format={pct} suffix="%" parse={parseNum}
          onChange={(v) => set({ inactive_opacity: Math.max(0, Math.min(100, v)) / 100 })} defaultValue={100} />
      </InspSection>
    </>
  )
}

/** Estilos guardados (Favoritos) y "Aplicar a todos". */
export function TextFavorites({
  mode = 'segment', style, textFavorites, onSaveFavorite, onApplyFavorite, onDeleteFavorite, onApplyAsGlobalTemplate,
  onApplyToTrack,
}) {
  const saved = textFavorites || []
  const isTrack = mode === 'track'
  return (
    <InspSection title="Mis estilos" defaultOpen={saved.length > 0}>
      <div className="ed-text-actions">
        <button type="button" className="ghost small" title="Guardar encuadre, estilo y tamaño en Mis estilos"
          onClick={() => onSaveFavorite?.(style || {})}>
          <Icon name="star" size={15} /> Guardar como predefinido
        </button>
        {!isTrack && onApplyToTrack && (
          <button type="button" className="ghost small" title="Pone todo el estilo de este texto (fuente, tamaño, colores, posición, escala…) como general de su pista: se aplica a todos sus textos y a los nuevos"
            onClick={onApplyToTrack}>
            <Icon name="view_stream" size={15} /> Aplicar a la pista
          </button>
        )}
        {!isTrack && onApplyAsGlobalTemplate && (
          <button type="button" className="ghost small" title="Aplica estilo y posición de este texto a todos los textos del Timeline"
            onClick={onApplyAsGlobalTemplate}>
            <Icon name="style" size={15} /> Aplicar a todos
          </button>
        )}
      </div>
      {saved.length === 0 ? (
        <p className="ed-insp-meta">Aún no hay estilos guardados.</p>
      ) : (
        <div className="ed-theme-grid">
          {saved.map((f) => (
            <div key={f.id} className="ed-theme-card ed-fav-style">
              <button type="button" className="ed-fav-apply" onClick={() => onApplyFavorite?.(f)} title={f.name}>
                <span className="ed-theme-chip" style={themePreviewStyle(f)}>
                  <span className="idle">Aa</span>
                  <span className="hot" style={{ color: f.style?.highlight_color }}>Aa</span>
                </span>
                <span className="ed-theme-name">{f.name}</span>
              </button>
              <button type="button" className="ed-fav-del" title="Quitar de Mis estilos" onClick={() => onDeleteFavorite?.(f.id)}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </InspSection>
  )
}

/** Contenido y Básico de CapCut, hasta Estilo preestablecido. */
export default function EdText({
  mode = 'segment', clip, style, onChangeText, onChangeStyle,
  selectionCount = 1, kf,
}) {
  const st = style || {}
  const isTrack = mode === 'track'
  const multi = !isTrack && selectionCount > 1
  const set = (patch) => onChangeStyle?.(patch)
  const ls = Math.round(numOr(st.letter_spacing, 0) * 100)
  const lh = lineHeightOf(st)
  const sizePx = Math.round(numOr(st.size, SIZE_PX_DEFAULT / FONT_SIZE_REF) * FONT_SIZE_REF)
  const align = st.align || 'center'

  return (
    <div className="ed-text-basic">
      {isTrack && <p className="ed-insp-meta">General: todo lo que cambies aquí (fuente, tamaño, estilo, posición…) se aplica a todos los textos de la pista y a los nuevos.</p>}
      {multi && (
        <p className="ed-insp-meta">{selectionCount} textos seleccionados. Estilo y posición se aplican a todos; el contenido, solo al último clic.</p>
      )}
      {!isTrack && (
        <textarea className="ed-text-content" rows={4} value={clip?.text || ''}
          placeholder="Escribe el texto…" onChange={(e) => onChangeText?.(e.target.value)} />
      )}

      <Row label="Fuente">
        <FlipSelect className="mini" title={st.font || 'Arial'} value={st.font || 'Arial'}
          options={FONTS.map((f) => ({ value: f, label: f, previewStyle: { fontFamily: cssFont(f) } }))} onChange={(v) => set({ font: v })} />
      </Row>
      <InspSlider label="Tamaño de la fuente" hint="En px a 1280 de alto. Para agrandar sin límite usa Escala."
        value={sizePx} min={SIZE_PX_RANGE[0]} max={SIZE_PX_RANGE[1]} typeMax={1000} step={1} format={pct} parse={parseNum} stepper
        onChange={(v) => set({ size: +(Math.max(1, v) / FONT_SIZE_REF).toFixed(6) })} defaultValue={SIZE_PX_DEFAULT} />
      <Row label="Diseño">
        <div className="ed-design">
          <Toggle on={st.bold} title="Negrita" onClick={() => set({ bold: !st.bold })}><Icon name="format_bold" size={16} /></Toggle>
          <Toggle on={st.underline} title="Subrayado" onClick={() => set({ underline: !st.underline })}><Icon name="format_underlined" size={16} /></Toggle>
          <Toggle on={st.italic} title="Cursiva" onClick={() => set({ italic: !st.italic })}><Icon name="format_italic" size={16} /></Toggle>
        </div>
      </Row>
      <Row label="May./min.">
        <div className="ed-seg text">
          {CASES.map((c) => (
            <Toggle key={c.value} on={st.text_case === c.value} title={c.title}
              onClick={() => set({ text_case: st.text_case === c.value ? null : c.value })}>{c.label}</Toggle>
          ))}
        </div>
      </Row>
      <Row label="Color">
        <Swatch value={st.color || '#ffffff'} onChange={(v) => set({ color: v })} title="Color del texto" />
        {kf && (
          <span className="ed-trow-kf">
            <KfDia state={kf.state(TEXT_KF_SECTIONS.color)} onClick={() => kf.toggle(TEXT_KF_SECTIONS.color)} />
          </span>
        )}
      </Row>
      <div className="ed-trow-pair" title="Carácter: espacio entre letras (negativo = más juntas). Línea: distancia entre líneas.">
        <span>Carácter</span>
        <NumberStepper value={ls} min={LETTER_SPACING_RANGE[0] * 100} max={LETTER_SPACING_RANGE[1] * 100} step={1}
          format={pct} onChange={(v) => set({ letter_spacing: v / 100 })} ariaLabel="Espacio entre letras" />
        <span>Línea</span>
        <NumberStepper value={+lh.toFixed(2)} min={LINE_HEIGHT_RANGE[0]} max={LINE_HEIGHT_RANGE[1]} step={0.05}
          format={(v) => Number(v).toFixed(2)} onChange={(v) => set({ line_height: +Number(v).toFixed(2) })}
          ariaLabel={`Interlineado (por defecto ${LINE_HEIGHT_DEFAULT})`} />
      </div>
      <Row label="Alineación">
        <div className="ed-seg">
          {ALIGNS.map((a) => (
            <Toggle key={a.value} on={align === a.value} title={a.title} onClick={() => set({ align: a.value })}>
              <Icon name={a.icon} size={16} />
            </Toggle>
          ))}
        </div>
      </Row>
      <InspSlider label="Ancho de caja" hint="Ancho máximo de línea antes de saltar a la siguiente."
        value={Math.round(numOr(st.w, 0.8) * 100)} min={15} max={100} step={1}
        format={pct} suffix="%" parse={parseNum} stepper
        onChange={(v) => set({ w: Math.max(0.15, Math.min(1, v / 100)) })} defaultValue={80} />
      <LookGrid st={st} set={set} />
    </div>
  )
}
