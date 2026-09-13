// Panel DERECHO de Paper Animator. Ocupa el sitio de EdInspector cuando el tab
// está activo, igual que MotionProps.
//
// Todo está construido con los controles que ya existen en el editor —
// `InspSection`, `InspSlider`, `NumberStepper`, `.ed-mode-toggle`, `.ed-fx-chip`,
// `.ed-btn`, `FlipSelect`, `Icon` — para que no haya un segundo lenguaje visual.
// En el motor original esto eran ~700 líneas de HTML con acordeones propios,
// sliders "skinned" a mano y `p-4` por bloque; aquí el padding y las alturas los
// pone `editor.css`.
//
// Mapa de las tres pestañas del panel original → la navegación del inspector:
//   Objeto    → Imagen · Herramientas · Borde · Sombra · Color · Movimiento · Pliegue
//   Fondo     → Imagen y color · Transformación · Corrección · Desenfoque · Viñeta
//   Animación → Modo · Simple · Keyframes · Propiedades del keyframe
//   Salida    → (era el popup de export) Formato · Vídeo · Imagen
//
// Objeto y Animación editan el object SELECCIONADO: la imagen o un elemento de
// texto (letra, grupo o frase). `paper.st` ya es esa vista, así que los mismos
// controles sirven para los dos; lo único que cambia con texto es que las
// herramientas de píxeles (recorte, pincel, quitar fondo) son solo de la imagen.

import { useRef, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { BG_PROVIDERS, isInteractiveProvider } from '../../lib/clipBg'
import { InspSection, InspSlider } from '../editor/EdTransform'
import {
  BLEND_MODES, EASING_OPTIONS, EXPORT_FORMATS, LIMITS, PAPER_ANIMS, PREVIEW_SCALES,
  TOOL, VIDEO_FORMATS, hasContent, imageEdited, paperExportName,
} from './paperModel'
import { elementLabel } from './paperText.js'

// Los modelos asistidos (SAM) piden clics sobre el sujeto; aquí no hay dónde
// ponerlos, así que se ofrecen solo los automáticos.
const AUTO_PROVIDERS = BG_PROVIDERS.filter((pr) => !isInteractiveProvider(pr.id))

const int = (v) => `${Math.round(v)}`
const one = (v) => Number(v).toFixed(1)
const three = (v) => Number(v).toFixed(3)
const parseNum = (raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))

function Toggle({ label, on, onChange, icon, title }) {
  return (
    <label className={`ed-mode-toggle ${on ? 'on' : ''}`} title={title}>
      <input type="checkbox" checked={!!on} onChange={(e) => onChange(e.target.checked)} />
      {icon && <Icon name={icon} size={14} />}
      <span>{label}</span>
    </label>
  )
}

function Chips({ value, options, onChange }) {
  return (
    <div className="ed-fx-chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ed-fx-chip ${value === o.value ? 'on' : ''}`}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ColorRow({ label, value, onChange }) {
  return (
    <div className="ed-insp-row paper-color-row">
      <div className="ed-insp-row-lab">{label}</div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </div>
  )
}

/** Slider con los valores del estado: ahorra repetir `patch(path, …)` 60 veces. */
function P({ paper, path, label, min, max, step = 1, format = int, suffix, onPointerDown, onPointerUp }) {
  const value = path.split('.').reduce((o, k) => o?.[k], paper.st)
  return (
    <div onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <InspSlider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parse={parseNum}
        suffix={suffix}
        onChange={(v) => paper.patch(path, v)}
        stepper
      />
    </div>
  )
}

// --- Objeto ---------------------------------------------------------------

/**
 * Herramientas de la imagen seleccionada. Están siempre disponibles (no hay que
 * abrir antes ningún "Editar imagen"): cada una activa su modo sobre el lienzo.
 */
function ImageTools({ paper }) {
  const { st, setTool, resetCrop, resetImage, removeBackground, cancelBackground, bgJob, patch } = paper
  const tool = st.edit.tool
  const cropped = !!st.object.image.crop
  const running = bgJob?.status === 'running'

  return (
    <>
      <div className="ed-fx-chips paper-tools">
        {[
          { value: TOOL.crop, label: 'Recortar', icon: 'crop' },
          { value: TOOL.brush, label: 'Pincel', icon: 'brush' },
          { value: TOOL.color, label: 'Por color', icon: 'colorize' },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            className={`ed-fx-chip ${tool === t.value ? 'on' : ''}`}
            disabled={!st.hasImage}
            title={tool === t.value ? 'Terminar (Esc)' : undefined}
            onClick={() => setTool(tool === t.value ? TOOL.none : t.value)}
          >
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Los ajustes de cada herramienta, solo mientras está activa. */}
      {tool === TOOL.brush && (
        <P paper={paper} path="edit.brushSize" label="Tamaño del pincel"
          min={LIMITS.brushSize.min} max={LIMITS.brushSize.max} suffix="px" />
      )}
      {tool === TOOL.color && (
        <P paper={paper} path="edit.colorTolerance" label="Tolerancia"
          min={LIMITS.colorTolerance.min} max={LIMITS.colorTolerance.max} />
      )}

      <div className="paper-actions">
        <button type="button" className="ed-btn" onClick={resetCrop} disabled={!cropped}
          title="Devolver la imagen entera (el recorte es una propiedad, no una imagen nueva)">
          <Icon name="crop_free" size={14} /> Restablecer recorte
        </button>
        <button type="button" className="ed-btn" onClick={resetImage} disabled={!imageEdited(st)}
          title="Deshacer borrados y matte: vuelve a la imagen original">
          <Icon name="restart_alt" size={14} /> Restablecer imagen
        </button>
      </div>

      <label className="ed-prop">
        Modelo de fondo
        <FlipSelect
          value={st.edit.bgProvider}
          options={AUTO_PROVIDERS.map((pr) => ({ value: pr.id, label: pr.label }))}
          onChange={(v) => patch('edit.bgProvider', v)}
        />
      </label>
      <div className="paper-actions">
        {running ? (
          <>
            <span className="ed-bg-status run">
              <Icon name="progress_activity" size={14} />
              <span>{bgJob.message}</span>
              <b>{Math.round((bgJob.progress || 0) * 100)}%</b>
            </span>
            <button type="button" className="ed-btn danger" onClick={cancelBackground}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="ed-btn" onClick={removeBackground} disabled={!st.hasImage}>
            <Icon name="auto_fix_high" size={14} /> Quitar fondo
          </button>
        )}
        {bgJob?.status === 'done' && (
          <span className="ed-bg-status ok"><Icon name="check_circle" size={14} /><span>{bgJob.message}</span></span>
        )}
      </div>
      <p className="ed-key-hint">
        Quitar fondo usa el mismo motor que <b>Vídeo → Eliminar fondo</b> del editor
        (se calcula una vez y queda en caché). Si la imagen no estaba en el
        material, se sube al proyecto para poder procesarla.
      </p>
      {(cropped || imageEdited(st)) && (
        <p className="ed-key-hint">
          Imagen{cropped ? ' recortada' : ''}{cropped && imageEdited(st) ? ' ·' : ''}
          {st.erased ? ' con borrados' : ''}{st.bgRemoved ? ' sin fondo' : ''}.
          Ctrl+Z la devuelve al paso anterior.
        </p>
      )}
    </>
  )
}

/** Qué object se está editando (solo cuando hay texto: con la imagen sola es obvio). */
function SelectedLabel({ paper }) {
  const { raw } = paper
  if (!raw.text.elements.length) return null
  const el = raw.text.elements.find((e) => e.id === raw.selected)
  let label = raw.imageName || 'Imagen'
  if (el) {
    const kind = raw.text.mode === 'phrase' ? 'Frase' : el.from === el.to ? 'Letra' : 'Grupo'
    label = `${kind} · ${elementLabel(raw.text.glyphs, el)}`
  }
  return (
    <div className="paper-selected">
      <Icon name={el ? 'text_fields' : 'image'} size={14} />
      <span>{label}</span>
    </div>
  )
}

/**
 * Llevar la configuración del elemento seleccionado al resto del texto. Con
 * retardo, los keyframes de cada letra se desplazan: animación letra a letra.
 */
function TextObjectTools({ paper }) {
  const { raw, applySelectedToAll } = paper
  const [stagger, setStagger] = useState(0.15)
  if (raw.text.elements.length < 2) return null
  const advanced = paper.st.object.animation.mode === 'advanced'
  return (
    <InspSection title="Todo el texto">
      <p className="ed-key-hint">
        Copia borde, sombra, color, movimiento, pliegue y animación de este elemento a
        los demás. Cada uno mantiene su sitio en la frase.
      </p>
      <div className="paper-actions">
        <button type="button" className="ed-btn" onClick={() => applySelectedToAll(0)}>
          <Icon name="select_all" size={14} /> Aplicar a todos
        </button>
      </div>
      {advanced ? (
        <>
          <InspSlider label="Retardo por elemento" value={stagger} min={0} max={2} step={0.05}
            format={(v) => Number(v).toFixed(2)} parse={parseNum} suffix="s" onChange={setStagger} stepper />
          <div className="paper-actions">
            <button type="button" className="ed-btn" onClick={() => applySelectedToAll(stagger)}>
              <Icon name="animation" size={14} /> Aplicar escalonado
            </button>
          </div>
        </>
      ) : (
        <p className="ed-key-hint">En modo <b>Avanzado</b> puedes escalonar los keyframes letra a letra.</p>
      )}
    </InspSection>
  )
}

function ObjectPanel({ paper }) {
  const { st, raw, patch, reset, setStrokeLive } = paper
  const obj = st.object
  const advanced = obj.animation.mode === 'advanced'
  const isImage = raw.selected === 'image'
  // Los sliders del borde regeneran una caché de 4 siluetas filtradas; mientras se
  // arrastran se pinta el filtro en vivo y la caché se rehace solo al soltar.
  const live = { onPointerDown: () => setStrokeLive(true), onPointerUp: () => setStrokeLive(false) }

  return (
    <>
      <SelectedLabel paper={paper} />
      <InspSection title={isImage ? 'Imagen' : 'Transformación'} onReset={() => reset('object.image')}>
        {advanced ? (
          <p className="ed-key-hint">
            En modo avanzado la posición y la escala las mandan los keyframes.
            Cámbialas en <b>Animación → Propiedades del keyframe</b>.
          </p>
        ) : (
          <>
            <P paper={paper} path="object.image.size" label="Tamaño" min={LIMITS.imageSize.min} max={LIMITS.imageSize.max} suffix="%" />
            <P paper={paper} path="object.image.offset.x" label="Posición X" min={LIMITS.imageOffset.min} max={LIMITS.imageOffset.max} />
            <P paper={paper} path="object.image.offset.y" label="Posición Y" min={LIMITS.imageOffset.min} max={LIMITS.imageOffset.max} />
            <P paper={paper} path="object.image.rotation" label="Girar" min={-180} max={180} format={one} suffix="°" />
          </>
        )}
        <p className="ed-key-hint">
          {isImage
            ? 'También puedes mover, escalar y girar la imagen arrastrándola en el lienzo.'
            : 'La posición es relativa a su sitio en la frase (0, 0 = en su sitio). También se arrastra en el lienzo.'}
        </p>
      </InspSection>

      {isImage ? (
        <InspSection title="Herramientas de imagen">
          <ImageTools paper={paper} />
        </InspSection>
      ) : (
        <TextObjectTools paper={paper} />
      )}

      <InspSection title="Borde rasgado" onReset={() => reset('object.stroke')}>
        <Toggle label="Activar" on={obj.stroke.enabled} onChange={(v) => patch('object.stroke.enabled', v)} />
        {obj.stroke.enabled && (
          <>
            <P paper={paper} path="object.stroke.width" label="Grosor" min={LIMITS.strokeWidth.min} max={LIMITS.strokeWidth.max} {...live} />
            <P paper={paper} path="object.stroke.roughness" label="Rugosidad" min={LIMITS.strokeRoughness.min} max={LIMITS.strokeRoughness.max} {...live} />
            <P paper={paper} path="object.stroke.detail" label="Detalle" min={LIMITS.strokeDetail.min} max={LIMITS.strokeDetail.max} step={0.001} format={three} {...live} />
          </>
        )}
      </InspSection>

      <InspSection title="Sombra" defaultOpen={false} onReset={() => reset('object.shadow')}>
        <Toggle label="Activar" on={obj.shadow.enabled} onChange={(v) => patch('object.shadow.enabled', v)} />
        {obj.shadow.enabled && (
          <>
            <P paper={paper} path="object.shadow.offsetX" label="Desplazamiento X" min={LIMITS.shadowOffset.min} max={LIMITS.shadowOffset.max} />
            <P paper={paper} path="object.shadow.offsetY" label="Desplazamiento Y" min={LIMITS.shadowOffset.min} max={LIMITS.shadowOffset.max} />
            <P paper={paper} path="object.shadow.blur" label="Desenfoque" min={LIMITS.shadowBlur.min} max={LIMITS.shadowBlur.max} />
            <P paper={paper} path="object.shadow.opacity" label="Opacidad" min={LIMITS.shadowOpacity.min} max={LIMITS.shadowOpacity.max} suffix="%" />
            <ColorRow label="Color" value={obj.shadow.color} onChange={(v) => patch('object.shadow.color', v)} />
          </>
        )}
      </InspSection>

      <InspSection title="Color" defaultOpen={false} onReset={() => reset('object.color')}>
        <Toggle label="Activar" on={obj.color.enabled} onChange={(v) => patch('object.color.enabled', v)} />
        {obj.color.enabled && (
          <>
            <Toggle label="Colorizar" on={obj.color.colorize} onChange={(v) => patch('object.color.colorize', v)}
              title="Pasa a sepia antes de aplicar el tono: tiñe la imagen con un solo color" />
            <P paper={paper} path="object.color.hue" label="Tono" min={LIMITS.hue.min} max={LIMITS.hue.max} suffix="°" />
            <P paper={paper} path="object.color.saturation" label="Saturación" min={LIMITS.saturation.min} max={LIMITS.saturation.max} />
            <P paper={paper} path="object.color.brightness" label="Brillo" min={LIMITS.brightness.min} max={LIMITS.brightness.max} />
          </>
        )}
      </InspSection>

      <InspSection title="Movimiento" defaultOpen={false} onReset={() => reset('object.movement')}>
        <Toggle label="Activar" on={obj.movement.enabled} onChange={(v) => patch('object.movement.enabled', v)}
          title="Vibración sutil continua, al margen de los keyframes" />
        {obj.movement.enabled && (
          <>
            <Chips
              value={obj.movement.mode}
              options={[{ value: 'simpel', label: 'Simple' }, { value: 'lengkap', label: 'Completo' }]}
              onChange={(v) => patch('object.movement.mode', v)}
            />
            {obj.movement.mode === 'simpel' ? (
              <>
                <P paper={paper} path="object.movement.simpelSpeed" label="Velocidad" min={0} max={5} step={0.1} format={one} />
                <P paper={paper} path="object.movement.simpelStrength" label="Intensidad" min={0} max={5} step={0.1} format={one} />
              </>
            ) : (
              <>
                <P paper={paper} path="object.movement.rotationSpeed" label="Velocidad de giro" min={LIMITS.movementSpeed.min} max={LIMITS.movementSpeed.max} step={0.1} format={one} />
                <P paper={paper} path="object.movement.rotationStrength" label="Fuerza de giro" min={LIMITS.movementStrength.min} max={LIMITS.movementStrength.max} step={0.1} format={one} />
                <P paper={paper} path="object.movement.positionSpeed.x" label="Velocidad X" min={LIMITS.movementSpeed.min} max={LIMITS.movementSpeed.max} step={0.1} format={one} />
                <P paper={paper} path="object.movement.positionStrength.x" label="Fuerza X" min={LIMITS.movementStrength.min} max={LIMITS.movementStrength.max} step={0.1} format={one} />
                <P paper={paper} path="object.movement.positionSpeed.y" label="Velocidad Y" min={LIMITS.movementSpeed.min} max={LIMITS.movementSpeed.max} step={0.1} format={one} />
                <P paper={paper} path="object.movement.positionStrength.y" label="Fuerza Y" min={LIMITS.movementStrength.min} max={LIMITS.movementStrength.max} step={0.1} format={one} />
              </>
            )}
          </>
        )}
      </InspSection>

      <InspSection title="Pliegue de papel" defaultOpen={false} onReset={() => reset('object.paperFoldOverlay')}>
        <Toggle label="Activar" on={obj.paperFoldOverlay.enabled} onChange={(v) => patch('object.paperFoldOverlay.enabled', v)}
          title="Textura de arrugas que cambia de fotograma para dar sensación de papel" />
        {obj.paperFoldOverlay.enabled && (
          <>
            <P paper={paper} path="object.paperFoldOverlay.opacity" label="Opacidad" min={LIMITS.overlayOpacity.min} max={LIMITS.overlayOpacity.max} suffix="%" />
            <P paper={paper} path="object.paperFoldOverlay.speed" label="Velocidad" min={LIMITS.overlaySpeed.min} max={LIMITS.overlaySpeed.max} step={0.5} format={one} />
            <label className="ed-prop">
              Modo de fusión
              <FlipSelect
                value={obj.paperFoldOverlay.blendMode}
                options={BLEND_MODES}
                onChange={(v) => patch('object.paperFoldOverlay.blendMode', v)}
              />
            </label>
          </>
        )}
      </InspSection>
    </>
  )
}

// --- Fondo ----------------------------------------------------------------

function BackgroundPanel({ paper }) {
  const { st, patch, reset, loadBackground, clearBackground } = paper
  const bg = st.background
  const fileRef = useRef(null)
  const stretch = bg.transform.mode === 'stretch'

  return (
    <>
      <InspSection title="Imagen y color">
        <ColorRow label="Color de fondo" value={bg.color} onChange={(v) => patch('background.color', v)} />
        <p className="ed-key-hint">
          Verde puro (#00ff00) si vas a usarlo como croma en la timeline; o exporta
          en WebM con fondo transparente desde <b>Salida</b>.
        </p>
        <div className="paper-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadBackground(f); e.target.value = '' }}
          />
          <button type="button" className="ed-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={14} /> Cargar imagen
          </button>
          {bg.hasImage && (
            <button type="button" className="ed-btn danger" onClick={clearBackground}>Quitar</button>
          )}
        </div>
      </InspSection>

      {bg.hasImage && (
        <>
          <InspSection title="Transformación" onReset={() => reset('background.transform')}>
            <Chips
              value={bg.transform.mode}
              options={[{ value: 'fill', label: 'Rellenar' }, { value: 'stretch', label: 'Estirar' }]}
              onChange={(v) => patch('background.transform.mode', v)}
            />
            {stretch ? (
              <p className="ed-key-hint">Estirar deforma la imagen al cuadro; no admite tamaño ni desplazamiento.</p>
            ) : (
              <>
                <P paper={paper} path="background.transform.size" label="Tamaño" min={LIMITS.bgSize.min} max={LIMITS.bgSize.max} suffix="%" />
                <P paper={paper} path="background.transform.rotation" label="Girar" min={-180} max={180} format={one} suffix="°" />
                <P paper={paper} path="background.transform.offset.x" label="Desplazamiento X" min={LIMITS.bgOffset.min} max={LIMITS.bgOffset.max} />
                <P paper={paper} path="background.transform.offset.y" label="Desplazamiento Y" min={LIMITS.bgOffset.min} max={LIMITS.bgOffset.max} />
              </>
            )}
          </InspSection>

          <InspSection title="Corrección de color" defaultOpen={false} onReset={() => reset('background.effects.colorCorrection')}>
            <Toggle label="Activar" on={bg.effects.colorCorrection.enabled} onChange={(v) => patch('background.effects.colorCorrection.enabled', v)} />
            {bg.effects.colorCorrection.enabled && (
              <>
                <Toggle label="Colorizar" on={bg.effects.colorCorrection.colorize} onChange={(v) => patch('background.effects.colorCorrection.colorize', v)} />
                <P paper={paper} path="background.effects.colorCorrection.hue" label="Tono" min={LIMITS.hue.min} max={LIMITS.hue.max} suffix="°" />
                <P paper={paper} path="background.effects.colorCorrection.saturation" label="Saturación" min={LIMITS.saturation.min} max={LIMITS.saturation.max} />
                <P paper={paper} path="background.effects.colorCorrection.brightness" label="Brillo" min={LIMITS.brightness.min} max={LIMITS.brightness.max} />
              </>
            )}
          </InspSection>

          <InspSection title="Desenfoque" defaultOpen={false} onReset={() => reset('background.effects.blur')}>
            <Toggle label="Activar" on={bg.effects.blur.enabled} onChange={(v) => patch('background.effects.blur.enabled', v)} />
            {bg.effects.blur.enabled && (
              <P paper={paper} path="background.effects.blur.intensity" label="Intensidad" min={LIMITS.bgBlur.min} max={LIMITS.bgBlur.max} suffix="px" />
            )}
          </InspSection>
        </>
      )}

      <InspSection title="Viñeta" defaultOpen={false} onReset={() => reset('background.effects.vignette')}>
        <Toggle label="Activar" on={bg.effects.vignette.enabled} onChange={(v) => patch('background.effects.vignette.enabled', v)} />
        {bg.effects.vignette.enabled && (
          <>
            <P paper={paper} path="background.effects.vignette.opacity" label="Opacidad" min={LIMITS.vignette.min} max={LIMITS.vignette.max} suffix="%" />
            <P paper={paper} path="background.effects.vignette.radius" label="Radio" min={LIMITS.vignette.min} max={LIMITS.vignette.max} suffix="%" />
            <P paper={paper} path="background.effects.vignette.feather" label="Suavizado" min={LIMITS.vignette.min} max={LIMITS.vignette.max} suffix="%" />
            <ColorRow label="Color" value={bg.effects.vignette.color} onChange={(v) => patch('background.effects.vignette.color', v)} />
          </>
        )}
      </InspSection>
    </>
  )
}

// --- Animación ------------------------------------------------------------

function KeyframeList({ paper }) {
  const { kfs, st, selectKeyframe, removeKeyframe, patchKeyframe, addKeyframe } = paper
  const activeId = st.object.animation.activeKeyframeId

  return (
    <>
      <div className="paper-kf-list">
        {kfs.map((kf, i) => (
          <div
            key={kf.id}
            className={`paper-kf-item ${kf.id === activeId ? 'on' : ''}`}
            onClick={() => selectKeyframe(kf.id)}
          >
            <Icon
              name={kf.paperAnim === 'open' ? 'unfold_more' : kf.paperAnim === 'close' ? 'unfold_less' : 'square'}
              size={14}
            />
            <span className="paper-kf-n">{i + 1}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={kf.time}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => patchKeyframe(kf.id, { time: Math.max(0, parseFloat(e.target.value) || 0) })}
              aria-label={`Tiempo del keyframe ${i + 1}`}
            />
            <em>s</em>
            <button
              type="button"
              className="paper-kf-del"
              title="Eliminar keyframe"
              disabled={kfs.length <= 1}
              onClick={(e) => { e.stopPropagation(); removeKeyframe(kf.id) }}
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="paper-actions">
        <button type="button" className="ed-btn primary" onClick={addKeyframe}>
          <Icon name="add" size={14} /> Añadir keyframe
        </button>
      </div>
    </>
  )
}

function KeyframeProps({ paper }) {
  const { selKf, kfs, patchKeyframe, copyKeyframe, pasteKeyframe, clipboard } = paper
  if (!selKf) {
    return <p className="ed-key-hint">Selecciona un keyframe en la lista o en la timeline.</p>
  }
  const index = kfs.findIndex((k) => k.id === selKf.id)
  const set = (patch) => patchKeyframe(selKf.id, patch)

  // "Abrir" solo tiene sentido si el papel viene cerrado (o es el primero), y
  // "cerrar" solo si viene abierto. Se calcula igual que en el motor original.
  const stateBefore = kfs.slice(0, index).reduce((acc, k) => (
    k.paperAnim === 'open' ? 'open' : k.paperAnim === 'close' ? 'closed' : acc
  ), 'open')
  const animOptions = PAPER_ANIMS.map((o) => ({
    ...o,
    disabled: (o.value === 'open' && !(stateBefore === 'closed' || index === 0))
      || (o.value === 'close' && stateBefore !== 'open'),
  }))

  return (
    <>
      <div className="paper-actions">
        <span className="paper-kf-title">Keyframe {index + 1}</span>
        <button type="button" className="ed-btn" onClick={copyKeyframe} title="Copiar posición, escala y giro">
          <Icon name="content_copy" size={14} />
        </button>
        <button type="button" className="ed-btn" onClick={pasteKeyframe} disabled={!clipboard} title="Pegar">
          <Icon name="content_paste" size={14} />
        </button>
        <button type="button" className="ed-btn" title="Restablecer"
          onClick={() => set({ x: 0, y: 0, scale: 80, rotation: 0 })}>
          <Icon name="restart_alt" size={14} />
        </button>
      </div>
      <InspSlider label="Escala" value={selKf.scale} min={LIMITS.kfScale.min} max={LIMITS.kfScale.max} step={1}
        format={int} parse={parseNum} suffix="%" onChange={(v) => set({ scale: v })} stepper />
      <InspSlider label="Posición X" value={selKf.x} min={LIMITS.kfOffset.min} max={LIMITS.kfOffset.max} step={1}
        format={int} parse={parseNum} onChange={(v) => set({ x: v })} stepper />
      <InspSlider label="Posición Y" value={selKf.y} min={LIMITS.kfOffset.min} max={LIMITS.kfOffset.max} step={1}
        format={int} parse={parseNum} onChange={(v) => set({ y: v })} stepper />
      <InspSlider label="Girar" value={selKf.rotation} min={-180} max={180} step={1}
        format={one} parse={parseNum} suffix="°" onChange={(v) => set({ rotation: v })} stepper />
      <label className="ed-prop">
        Transición al siguiente
        <FlipSelect value={selKf.easing} options={EASING_OPTIONS} onChange={(v) => set({ easing: v })} />
      </label>
      <div className="ed-insp-row">
        <div className="ed-insp-row-lab">Animación de papel</div>
        <Chips value={selKf.paperAnim} options={animOptions} onChange={(v) => set({ paperAnim: v })} />
      </div>
      <p className="ed-key-hint">El papel se pliega o despliega durante el tramo hasta el siguiente keyframe.</p>
    </>
  )
}

function AnimationPanel({ paper }) {
  const { st, patch } = paper
  const anim = st.object.animation
  const advanced = anim.mode === 'advanced'

  return (
    <>
      <SelectedLabel paper={paper} />
      <InspSection title="Modo">
        <Chips
          value={anim.mode}
          options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Avanzado' }]}
          onChange={(v) => patch('object.animation.mode', v)}
        />
        <p className="ed-key-hint">
          {advanced
            ? 'La posición, la escala y el giro se animan con keyframes sobre la timeline.'
            : 'El objeto se queda quieto; solo se anima la apertura o el cierre del papel.'}
        </p>
      </InspSection>

      {advanced ? (
        <>
          <InspSection title="Keyframes"><KeyframeList paper={paper} /></InspSection>
          <InspSection title="Propiedades del keyframe"><KeyframeProps paper={paper} /></InspSection>
        </>
      ) : (
        <InspSection title="Animación simple">
          <Toggle label="Abrir al empezar" icon="unfold_more" on={anim.simple.open}
            onChange={(v) => patch('object.animation.simple.open', v)} />
          <Toggle label="Cerrar al terminar" icon="unfold_less" on={anim.simple.close}
            onChange={(v) => patch('object.animation.simple.close', v)} />
          <p className="ed-key-hint">Cada una dura 1 s y se ve en la pista <b>Papel</b> de la timeline.</p>
        </InspSection>
      )}
    </>
  )
}

// --- Salida ---------------------------------------------------------------

function OutputPanel({ paper, format }) {
  const { st, patch, setDuration, exportToMaterial, cancelExport, exportJob } = paper
  const fmt = st.export.format
  const isVideo = VIDEO_FORMATS.includes(fmt)
  const running = exportJob?.status === 'running'

  return (
    <>
      <InspSection title="Formato">
        <label className="ed-prop">
          Archivo
          <FlipSelect value={fmt} options={EXPORT_FORMATS} onChange={(v) => patch('export.format', v)} />
        </label>
        <p className="ed-key-hint">
          El tamaño lo pone el proyecto: {format?.width || 1080}×{format?.height || 1920}.
          Solo WebM conserva la transparencia.
        </p>
        <label className="ed-prop">
          Nombre
          <input
            className="ed-insp-num wide"
            type="text"
            value={st.export.filename}
            placeholder={paperExportName(st)}
            onChange={(e) => patch('export.filename', e.target.value)}
          />
        </label>
      </InspSection>

      {isVideo && (
        <InspSection title="Vídeo">
          <InspSlider label="Duración" value={st.export.duration} min={LIMITS.duration.min} max={LIMITS.duration.max}
            step={0.5} format={one} parse={parseNum} suffix="s" onChange={setDuration} stepper />
          <InspSlider label="FPS" value={st.export.fps} min={12} max={60} step={1}
            format={int} parse={parseNum} onChange={(v) => patch('export.fps', Math.round(v))} stepper />
          {fmt === 'webm' && (
            <Toggle label="Fondo transparente" on={st.export.transparentBackground}
              onChange={(v) => patch('export.transparentBackground', v)}
              title="Exporta con alfa para superponerlo sobre otro clip en la timeline" />
          )}
        </InspSection>
      )}

      {!isVideo && (
        <InspSection title="Imagen">
          <p className="ed-key-hint">Se exporta el fotograma en el que esté el cabezal.</p>
          {fmt === 'jpg' && (
            <InspSlider label="Calidad" value={st.export.jpgQuality} min={40} max={100} step={1}
              format={int} parse={parseNum} suffix="%" onChange={(v) => patch('export.jpgQuality', Math.round(v))} stepper />
          )}
          {fmt === 'png' && (
            <Toggle label="Fondo transparente" on={st.export.transparentBackground}
              onChange={(v) => patch('export.transparentBackground', v)} />
          )}
        </InspSection>
      )}

      <InspSection title="Preview">
        <div className="ed-insp-row">
          <div className="ed-insp-row-lab">Resolución del lienzo</div>
          <Chips
            value={st.previewScale}
            options={PREVIEW_SCALES}
            onChange={(v) => patch('previewScale', v)}
          />
        </div>
        <p className="ed-key-hint">Solo afecta a lo que ves. El export siempre sale a resolución completa.</p>
      </InspSection>

      <div className="paper-actions out">
        {running ? (
          <>
            <span className="ed-bg-status run">
              <Icon name="progress_activity" size={14} />
              <span>{exportJob.message}</span>
              <b>{Math.round((exportJob.progress || 0) * 100)}%</b>
            </span>
            <button type="button" className="ed-btn danger" onClick={cancelExport}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="ed-btn primary" onClick={exportToMaterial} disabled={!hasContent(paper.raw)}>
            <Icon name="save" size={14} /> Guardar en el material
          </button>
        )}
      </div>
    </>
  )
}

// --- Panel ----------------------------------------------------------------

const NAVS = [
  { id: 'object', label: 'Objeto' },
  { id: 'background', label: 'Fondo' },
  { id: 'animation', label: 'Animación' },
  { id: 'output', label: 'Salida' },
]

export default function PaperProps({ paper, format }) {
  const [nav, setNav] = useState('object')

  return (
    <aside className="ed-inspector paper-props">
      <nav className="ed-insp-nav" aria-label="Propiedades de Paper Animator">
        {NAVS.map((n) => (
          <button key={n.id} type="button" className={nav === n.id ? 'on' : ''} onClick={() => setNav(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="paper-props-body">
        {nav === 'object' && <ObjectPanel paper={paper} />}
        {nav === 'background' && <BackgroundPanel paper={paper} />}
        {nav === 'animation' && <AnimationPanel paper={paper} />}
        {nav === 'output' && <OutputPanel paper={paper} format={format} />}
      </div>
    </aside>
  )
}
