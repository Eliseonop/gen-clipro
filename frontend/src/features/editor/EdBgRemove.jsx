// Panel Video → Eliminar fondo. Edita `clip.bg_removal` (ver lib/clipBg.js).
//
// Tres bloques independientes y combinables:
//   1. Eliminación automática  → matte de IA (job + caché en el backend)
//   2. Eliminación personalizada → pincel que corrige el matte de la IA
//   3. Chroma key              → filtro puro, sin job ni archivos
//
// Nada de esto toca el archivo original: todo son propiedades del clip, así que
// entra por el undo/redo del editor y viaja con el proyecto.
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import {
  BG_PROVIDERS, CHROMA_PRESETS, MATTE_FEATHER_MAX, autoActive, clipBg,
  isInteractiveProvider,
} from '../../lib/clipBg'
import { InspSection, InspSlider } from './EdTransform'

const pct = (v) => `${Math.round(v)}`
const parsePct = (raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))

function StatusLine({ auto, job }) {
  if (job && (job.status === 'pending' || job.status === 'running')) {
    return (
      <div className="ed-bg-status run">
        <Icon name="progress_activity" size={14} />
        <span>{job.message || 'Procesando…'}</span>
        <b>{Math.round((job.progress || 0) * 100)}%</b>
      </div>
    )
  }
  if (job?.status === 'error') {
    return (
      <div className="ed-bg-status err">
        <Icon name="error" size={14} />
        <span>{job.error || 'No se pudo eliminar el fondo.'}</span>
      </div>
    )
  }
  if (auto.status === 'ready' && auto.base_key) {
    return (
      <div className="ed-bg-status ok">
        <Icon name="check_circle" size={14} />
        <span>Fondo separado{auto.device ? ` · ${auto.device}` : ''}. Se reutiliza sin recalcular.</span>
      </div>
    )
  }
  return null
}

export default function EdBgRemove({
  clip, job, providers, device,
  onToggleAuto, onApplyAuto, onCancelAuto, onChangeAuto,
  brush, onBrush, onClearEdits, onUndoEdit,
  onToggleChroma, onChangeChroma, onResetChroma, onPickColor, picking,
  bgPreview, onBgPreview,
}) {
  const bg = clipBg(clip)
  const auto = bg?.auto || { enabled: false, status: 'idle', edits: [], provider: 'u2net' }
  const chroma = bg?.chroma || { enabled: false, color: '#00FF00' }
  const running = job && (job.status === 'pending' || job.status === 'running')
  const ready = autoActive(bg)
  const isSam = isInteractiveProvider(auto.provider)
  const strokes = auto.edits?.length || 0
  const provList = (providers?.length ? providers : BG_PROVIDERS.map((p) => ({ ...p, available: true })))

  return (
    <>
      {/* --- 1. Eliminación automática ---------------------------------- */}
      <InspSection title="Eliminación automática">
        <div className="ed-insp-tools">
          <label className={`ed-mode-toggle ${auto.enabled ? 'on' : ''}`}
                 title="Detecta el sujeto principal y separa el fondo con IA">
            <input type="checkbox" checked={!!auto.enabled}
                   onChange={(e) => onToggleAuto?.(e.target.checked)} />
            <Icon name="auto_fix_high" size={15} />
            Activada
          </label>
          {ready && (
            <label className={`ed-mode-toggle ${auto.invert ? 'on' : ''}`}
                   title="Invertir: se conserva el fondo y desaparece el sujeto">
              <input type="checkbox" checked={!!auto.invert}
                     onChange={(e) => onChangeAuto?.({ invert: e.target.checked })} />
              <Icon name="flip" size={15} />
              Invertir
            </label>
          )}
        </div>

        {auto.enabled && (
          <>
            <label className="ed-insp-select">
              Modelo
              <FlipSelect
                value={auto.provider}
                options={provList.map((p) => ({
                  value: p.id,
                  label: p.available === false ? `${p.label} (se descarga)` : p.label,
                }))}
                onChange={(v) => onChangeAuto?.({ provider: v })}
              />
            </label>
            <p className="ed-insp-hint">
              {provList.find((p) => p.id === auto.provider)?.hint || ''}
              {device ? ` Se ejecuta en ${device}.` : ''}
            </p>
            {clip?.kind === 'video' && (
              <>
                <InspSlider
                  label="Estabilizar" value={Math.round((auto.stabilize ?? 0) * 100)}
                  min={0} max={100} step={1} format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ stabilize: v / 100 })} stepper
                />
                <p className="ed-insp-hint">
                  Suaviza la máscara entre fotogramas para evitar parpadeo del
                  borde. Cambia el cálculo: pulsa <b>{ready ? 'Recalcular' : 'Aplicar'}</b> tras ajustarlo.
                </p>
              </>
            )}

            <div className="ed-bg-actions">
              {running ? (
                <button type="button" className="ed-btn danger" onClick={() => onCancelAuto?.()}>
                  <Icon name="stop_circle" size={15} /> Cancelar
                </button>
              ) : (
                <button type="button" className="ed-btn primary" onClick={() => onApplyAuto?.()}>
                  <Icon name="auto_fix_high" size={15} />
                  {ready ? 'Recalcular' : 'Aplicar'}
                </button>
              )}
            </div>
            <StatusLine auto={auto} job={job} />

            {ready && (
              <>
                <InspSlider
                  label="Umbral" value={Math.round(auto.threshold * 100)} min={0} max={100} step={1}
                  format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ threshold: v / 100 })} stepper
                />
                <InspSlider
                  label="Suavizado" value={Math.round(auto.softness * 100)} min={0} max={100} step={1}
                  format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ softness: v / 100 })} stepper
                />
                <InspSlider
                  label="Pluma" value={Math.round((auto.feather / MATTE_FEATHER_MAX) * 100)}
                  min={0} max={100} step={1} format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ feather: (v / 100) * MATTE_FEATHER_MAX })} stepper
                />
                <InspSlider
                  label="Expandir" value={Math.round((auto.expansion ?? 0) * 100)}
                  min={-100} max={100} step={1} format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ expansion: v / 100 })} stepper
                />
                <InspSlider
                  label="Opacidad" value={Math.round((auto.opacity ?? 1) * 100)}
                  min={0} max={100} step={1} format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ opacity: v / 100 })} stepper
                />
                <p className="ed-insp-hint">
                  Estos ajustes se aplican al instante: no vuelven a ejecutar el modelo.
                  <b> Expandir</b> crece (+) o encoge (−) el borde del sujeto.
                </p>
              </>
            )}
          </>
        )}
        {!auto.enabled && (
          <p className="ed-insp-hint">
            Detecta el sujeto y lo separa del fondo. El archivo original no se
            modifica: se guarda una máscara reutilizable en el proyecto.
          </p>
        )}
      </InspSection>

      {/* --- 2. Selección: inteligente (SAM) o corrección manual (U²-Net) - */}
      {(ready || (isSam && auto.enabled)) && (
        <InspSection title={isSam ? 'Selección inteligente' : 'Eliminación personalizada'}>
          <p className="ed-insp-hint">
            {isSam ? (
              <>
                Marca el sujeto con el <b>Pincel inteligente</b> (+) y lo que sobra
                con el <b>Borrador inteligente</b> (−); el modelo interpreta el
                objeto entero. Luego pulsa <b>{ready ? 'Recalcular' : 'Aplicar'}</b>.
              </>
            ) : (
              <>
                Corrige lo que la IA no acertó pintando sobre el reproductor.
                <b> Conservar</b> devuelve zonas visibles; <b>Eliminar</b> las vuelve
                transparentes.
              </>
            )}
          </p>
          <div className="ed-bg-brush">
            <button
              type="button"
              className={`ed-bg-op keep${brush?.on && brush.op === 'keep' ? ' on' : ''}`}
              onClick={() => onBrush?.({ on: !(brush?.on && brush.op === 'keep'), op: 'keep' })}
            >
              <Icon name="add_circle" size={16} /> {isSam ? 'Pincel intel.' : 'Conservar'}
            </button>
            <button
              type="button"
              className={`ed-bg-op erase${brush?.on && brush.op === 'erase' ? ' on' : ''}`}
              onClick={() => onBrush?.({ on: !(brush?.on && brush.op === 'erase'), op: 'erase' })}
            >
              <Icon name="do_not_disturb_on" size={16} /> {isSam ? 'Borrador intel.' : 'Eliminar'}
            </button>
          </div>
          <InspSlider
            label="Tamaño" value={Math.round((brush?.size ?? 0.08) * 100)} min={1} max={50} step={1}
            format={pct} suffix="%" parse={parsePct}
            onChange={(v) => onBrush?.({ size: v / 100 })} stepper
          />
          <div className="ed-bg-actions">
            <button type="button" className="ed-btn" disabled={!strokes}
                    onClick={() => onUndoEdit?.()} title="Deshacer el último trazo">
              <Icon name="undo" size={15} /> {isSam ? 'Último punto' : 'Último trazo'}
            </button>
            <button type="button" className="ed-btn" disabled={!strokes}
                    onClick={() => onClearEdits?.()} title="Quitar todo">
              <Icon name="restart_alt" size={15} /> Limpiar
            </button>
          </div>
          <p className="ed-insp-hint">
            {strokes
              ? (isSam ? `${strokes} marca(s) de prompt guardadas con el clip.`
                       : `${strokes} corrección(es) guardadas con el clip.`)
              : (isSam ? 'Sin marcas. Elige un pincel y toca el sujeto en el reproductor.'
                       : 'Sin correcciones. Elige Conservar o Eliminar y arrastra en el reproductor.')}
            {brush?.on ? ' El zoom y el desplazamiento del reproductor siguen funcionando.' : ''}
          </p>
        </InspSection>
      )}

      {/* --- 3. Chroma key --------------------------------------------- */}
      <InspSection title="Chroma key" onReset={chroma.enabled ? onResetChroma : undefined}>
        <div className="ed-insp-tools">
          <label className={`ed-mode-toggle ${chroma.enabled ? 'on' : ''}`}
                 title="Convierte un color en transparencia (pantalla verde o azul)">
            <input type="checkbox" checked={!!chroma.enabled}
                   onChange={(e) => onToggleChroma?.(e.target.checked)} />
            <Icon name="colorize" size={15} />
            Activado
          </label>
          {chroma.enabled && (
            <label className={`ed-mode-toggle ${picking ? 'on' : ''}`}
                   title="Tomar el color pinchando en el reproductor">
              <input type="checkbox" checked={!!picking}
                     onChange={(e) => onPickColor?.(e.target.checked)} />
              <Icon name="colorize" size={15} />
              Cuentagotas
            </label>
          )}
        </div>

        {chroma.enabled ? (
          <>
            <div className="ed-insp-row">
              <div className="ed-insp-row-lab">Color</div>
              <div className="ed-insp-row-ctrl ed-bg-color">
                <input type="color" value={chroma.color} aria-label="Color del chroma"
                       onChange={(e) => onChangeChroma?.({ color: e.target.value })} />
                <span className="ed-bg-hex">{chroma.color}</span>
              </div>
            </div>
            <div className="ed-bg-presets">
              {CHROMA_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`ed-bg-swatch${chroma.color === p.color ? ' on' : ''}`}
                  style={{ background: p.color }}
                  title={p.label}
                  onClick={() => onChangeChroma?.({ color: p.color })}
                />
              ))}
            </div>
            <InspSlider
              label="Tolerancia" value={Math.round(chroma.similarity * 100)} min={1} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ similarity: v / 100 })} stepper
            />
            <InspSlider
              label="Suavizado" value={Math.round(chroma.blend * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ blend: v / 100 })} stepper
            />
            <InspSlider
              label="Derrame" value={Math.round(chroma.spill * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ spill: v / 100 })} stepper
            />
            <InspSlider
              label="Limpiar borde" value={Math.round((chroma.edge ?? 0) * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ edge: v / 100 })} stepper
            />
            <InspSlider
              label="Expandir" value={Math.round((chroma.shrink ?? 0) * 100)} min={-100} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ shrink: v / 100 })} stepper
            />
            <p className="ed-insp-hint">
              El croma se ve al instante y no genera archivos: es una propiedad del
              clip. Sube <b>Tolerancia</b> hasta que el fondo desaparezca y ajusta
              <b> Suavizado</b> para el borde. <b>Derrame</b> quita el tinte del
              color en la piel y el pelo. <b>Limpiar borde</b> come residuos finos;
              <b> Expandir</b> crece (+) o encoge (−) el recorte.
            </p>
          </>
        ) : (
          <p className="ed-insp-hint">
            Para pantallas verdes o azules y fondos de color uniforme. Es un
            efecto en vivo: no convierte el vídeo a otro archivo.
          </p>
        )}
      </InspSection>

      {/* --- 4. Fondo de vista previa (no afecta al export) ------------- */}
      {onBgPreview && (
        <InspSection title="Fondo de vista previa">
          <div className="ed-bg-preview-modes">
            {[
              { id: 'normal', icon: 'crop_original', label: 'Normal' },
              { id: 'checker', icon: 'grid_view', label: 'Cuadros' },
              { id: 'solid', icon: 'palette', label: 'Color' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                className={`ed-btn${bgPreview?.mode === m.id ? ' primary' : ''}`}
                onClick={() => onBgPreview?.({ mode: m.id })}
              >
                <Icon name={m.icon} size={15} /> {m.label}
              </button>
            ))}
          </div>
          {bgPreview?.mode === 'solid' && (
            <div className="ed-insp-row">
              <div className="ed-insp-row-lab">Color</div>
              <div className="ed-insp-row-ctrl ed-bg-color">
                <input type="color" value={bgPreview.color || '#3B82F6'} aria-label="Color de fondo"
                       onChange={(e) => onBgPreview?.({ color: e.target.value })} />
                <span className="ed-bg-hex">{bgPreview.color}</span>
              </div>
            </div>
          )}
          <div className="ed-bg-preview-modes">
            <label className={`ed-btn${bgPreview?.mode === 'media' && bgPreview?.kind === 'image' ? ' primary' : ''}`}>
              <Icon name="image" size={15} /> Imagen
              <input type="file" accept="image/*" hidden
                     onChange={(e) => { if (e.target.files?.[0]) onBgPreview?.({ file: e.target.files[0] }); e.target.value = '' }} />
            </label>
            <label className={`ed-btn${bgPreview?.mode === 'media' && bgPreview?.kind === 'video' ? ' primary' : ''}`}>
              <Icon name="movie" size={15} /> Vídeo
              <input type="file" accept="video/*" hidden
                     onChange={(e) => { if (e.target.files?.[0]) onBgPreview?.({ file: e.target.files[0] }); e.target.value = '' }} />
            </label>
          </div>
          <p className="ed-insp-hint">
            Coloca un fondo temporal DETRÁS del sujeto para comprobar el recorte.
            <b> Cuadros</b> revela dónde hay transparencia. Es solo vista previa:
            no cambia el vídeo ni la exportación.
          </p>
        </InspSection>
      )}
    </>
  )
}
