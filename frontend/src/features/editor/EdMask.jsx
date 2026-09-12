// Panel Video → Máscara. Edita masks[0] del clip; el resto de la lista queda
// para cuando se expongan varias máscaras (el motor ya las compone todas).
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { clipMasksAt } from '../../lib/clipAnim'
import { kfState } from '../../lib/clipKeyframes'
import { MASK_FEATHER_MAX, MASK_TYPES } from '../../lib/clipMask'
import { FONTS } from '../../lib/textstyles'
import { InspSection, InspSlider, KfDia, NumberStepper } from './EdTransform'

const pct = (v) => `${Math.round(v)}`
const parsePct = (raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))

function MaskXY({ label, value, onChange, onKf, kfSt }) {
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

export default function EdMask({
  clip, playhead, fps = 30, maskMode, onMaskMode, drawMode, onDrawMode,
  onAddMask, onRemoveMask, onDuplicateMask, onChangeMask, onCommitMask, onAddKf,
}) {
  const localT = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const mask = clipMasksAt(clip, localT)[0] || null
  const stored = Array.isArray(clip?.masks) ? clip.masks : []
  const kfSt = kfState(clip, localT, fps)

  return (
    <>
      <InspSection title="Máscara" onAddKf={mask ? onAddKf : undefined} kfSt={kfSt}>
        <div className="ed-insp-pos-lab">Tipo de máscara</div>
        <div className="ed-mask-grid">
          {MASK_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ed-pos-btn${mask?.type === t.id ? ' on' : ''}`}
              title={t.label}
              onClick={() => (mask ? onChangeMask?.({ type: t.id }) : onAddMask?.(t.id))}
            >
              <Icon name={t.icon} size={18} />
              <em>{t.label}</em>
            </button>
          ))}
        </div>

        {!mask && (
          <p className="ed-insp-hint">
            Elige una forma para añadir una máscara. Solo se verá la parte del clip
            que quede dentro de ella; el archivo original no se modifica.
          </p>
        )}

        {mask && (
          <>
            <div className="ed-insp-tools ed-mask-tools">
              <label className={`ed-mode-toggle ${maskMode ? 'on' : ''}`} title="Mostrar y manipular la máscara sobre el reproductor">
                <input type="checkbox" checked={!!maskMode} onChange={(e) => onMaskMode?.(e.target.checked)} />
                <Icon name="open_with" size={15} />
                Editar en el preview
              </label>
              <label className={`ed-mode-toggle ${mask.invert ? 'on' : ''}`} title="Invertir: se ve lo de FUERA de la máscara">
                <input type="checkbox" checked={!!mask.invert} onChange={(e) => onChangeMask?.({ invert: e.target.checked })} />
                <Icon name="flip" size={15} />
                Invertir
              </label>
              <label className={`ed-mode-toggle ${mask.enabled ? 'on' : ''}`} title="Activar o desactivar la máscara sin borrarla">
                <input type="checkbox" checked={!!mask.enabled} onChange={(e) => onChangeMask?.({ enabled: e.target.checked })} />
                <Icon name={mask.enabled ? 'visibility' : 'visibility_off'} size={15} />
                Activa
              </label>
              <button type="button" className="ed-insp-ico" title="Duplicar máscara" onClick={() => onDuplicateMask?.()}>
                <Icon name="content_copy" size={15} />
              </button>
              <button type="button" className="ed-insp-ico" title="Eliminar máscara" onClick={() => onRemoveMask?.()}>
                <Icon name="delete" size={15} />
              </button>
            </div>
            {stored.length > 1 && (
              <p className="ed-insp-hint">
                {stored.length} máscaras en este clip: se combinan por intersección.
                Aquí se edita la primera (es la que anima con keyframes).
              </p>
            )}

            <div className="ed-insp-pair">
              <div className="ed-insp-row-lab">Posición</div>
              <MaskXY label="X" value={mask.x * 100} onChange={(n) => onCommitMask?.({ mx: n / 100 })} onKf={onAddKf} kfSt={kfSt} />
              <MaskXY label="Y" value={mask.y * 100} onChange={(n) => onCommitMask?.({ my: n / 100 })} />
            </div>

            {mask.type !== 'linear' && (
              <>
                <InspSlider
                  label="Ancho" value={Math.round(mask.w * 100)} min={1} max={300} step={1}
                  format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onCommitMask?.({ mw: v / 100 })} onKf={onAddKf} kfSt={kfSt} stepper
                />
                <InspSlider
                  label="Alto" value={Math.round(mask.h * 100)} min={1} max={300} step={1}
                  format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onCommitMask?.({ mh: v / 100 })} onKf={onAddKf} kfSt={kfSt} stepper
                />
              </>
            )}

            <InspSlider
              label="Escala X" value={Math.round(mask.scale_x * 100)} min={5} max={400} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onCommitMask?.({ msx: v / 100 })} onKf={onAddKf} kfSt={kfSt} stepper
            />
            <InspSlider
              label="Escala Y" value={Math.round(mask.scale_y * 100)} min={5} max={400} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onCommitMask?.({ msy: v / 100 })} onKf={onAddKf} kfSt={kfSt} stepper
            />
            <InspSlider
              label="Girar" value={+(mask.rotation || 0).toFixed(1)} min={-180} max={180} step={1}
              format={(v) => Number(v).toFixed(1)} suffix="°" parse={parsePct}
              onChange={(v) => onCommitMask?.({ mrot: v })} onKf={onAddKf} kfSt={kfSt} stepper
            />
            <InspSlider
              label="Pluma" value={Math.round((mask.feather / MASK_FEATHER_MAX) * 100)}
              min={0} max={100} step={1} format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onCommitMask?.({ mfeather: (v / 100) * MASK_FEATHER_MAX })}
              onKf={onAddKf} kfSt={kfSt} stepper
            />
            <InspSlider
              label="Opacidad" value={Math.round(mask.opacity * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeMask?.({ opacity: v / 100 })}
            />
            {mask.type === 'rectangle' && (
              <InspSlider
                label="Esquinas" value={Math.round(mask.radius * 200)} min={0} max={100} step={1}
                format={pct} suffix="%" parse={parsePct}
                onChange={(v) => onChangeMask?.({ radius: v / 200 })}
              />
            )}
          </>
        )}
      </InspSection>

      {mask?.type === 'text' && (
        <InspSection title="Texto de la máscara">
          <label className="ed-insp-select">
            Contenido
            <textarea
              className="ed-mask-text"
              rows={2}
              value={mask.text?.content ?? ''}
              onChange={(e) => onChangeMask?.({ text: { ...mask.text, content: e.target.value } })}
            />
          </label>
          <label className="ed-insp-select">
            Fuente
            <FlipSelect
              value={mask.text?.font || 'Anton'}
              options={FONTS.map((f) => ({ value: f, label: f }))}
              onChange={(v) => onChangeMask?.({ text: { ...mask.text, font: v } })}
            />
          </label>
          <InspSlider
            label="Tamaño" value={Math.round((mask.text?.size ?? 0.22) * 100)} min={2} max={120} step={1}
            format={pct} suffix="%" parse={parsePct}
            onChange={(v) => onChangeMask?.({ text: { ...mask.text, size: v / 100 } })}
          />
          <InspSlider
            label="Grosor" value={Math.round(mask.text?.weight ?? 700)} min={100} max={900} step={100}
            format={(v) => `${Math.round(v)}`} parse={parsePct}
            onChange={(v) => onChangeMask?.({ text: { ...mask.text, weight: v } })}
          />
          <div className="ed-insp-align">
            {[['left', 'format_align_left'], ['center', 'format_align_center'], ['right', 'format_align_right']].map(([id, icon]) => (
              <button
                key={id}
                type="button"
                className={`ed-insp-ico${(mask.text?.align || 'center') === id ? ' on' : ''}`}
                title={id}
                onClick={() => onChangeMask?.({ text: { ...mask.text, align: id } })}
              >
                <Icon name={icon} size={15} />
              </button>
            ))}
          </div>
        </InspSection>
      )}

      {mask?.type === 'brush' && (
        <InspSection title="Pincel">
          <div className="ed-insp-tools ed-mask-tools">
            <label className={`ed-mode-toggle ${drawMode ? 'on' : ''}`} title="Arrastra sobre el reproductor para pintar la máscara">
              <input type="checkbox" checked={!!drawMode} onChange={(e) => onDrawMode?.(e.target.checked)} />
              <Icon name="brush" size={15} />
              Dibujar
            </label>
            <button
              type="button"
              className="ed-insp-ico"
              title="Borrar el trazo"
              onClick={() => onChangeMask?.({ brush: { ...mask.brush, points: [] } })}
            >
              <Icon name="restart_alt" size={15} />
            </button>
          </div>
          <InspSlider
            label="Grosor" value={Math.round((mask.brush?.size ?? 0.12) * 100)} min={1} max={60} step={1}
            format={pct} suffix="%" parse={parsePct}
            onChange={(v) => onChangeMask?.({ brush: { ...mask.brush, size: v / 100 } })}
          />
          <p className="ed-insp-hint">
            {(mask.brush?.points || []).length} puntos. Activa “Dibujar” y arrastra sobre
            el reproductor; el trazo se guarda con el proyecto.
          </p>
        </InspSection>
      )}
    </>
  )
}
