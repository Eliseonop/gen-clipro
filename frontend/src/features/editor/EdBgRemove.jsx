// Panel Video → Eliminar fondo. Edita `clip.bg_removal` (ver lib/clipBg.js).
//
// Tres bloques independientes y combinables:
//   1. Eliminación automática  → matte de IA (job + caché en el backend)
//   2. Eliminación personalizada → pincel que corrige el matte de la IA
//   3. Chroma key              → filtro puro, sin job ni archivos
//
// Nada de esto toca el archivo original: todo son propiedades del clip, así que
// entra por el undo/redo del editor y viaja con el proyecto.
import JobProgress from '../../components/JobProgress'
import Hint from '../../components/Hint'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import {
  BG_PROVIDERS, CHROMA_PRESETS, MATTE_FEATHER_MAX, autoActive, clipBg,
  isInteractiveProvider, normalizeOutline,
} from '../../lib/clipBg'
import { InspSection, InspSlider } from './EdTransform'

const pct = (v) => `${Math.round(v)}`
const parsePct = (raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))

function StatusLine({ auto, job }) {
  if (job && (job.status === 'pending' || job.status === 'running')) {
    return <JobProgress job={job} progress={job.progress || 0} />
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
  clip, job, cutoutJob, providers, device,
  onToggleAuto, onApplyAuto, onCancelAuto, onChangeAuto,
  onExportCutout, onCancelCutout,
  magicMode, magicBusy, onToggleMagic, onConfirmMagic,
  brush, onBrush, onClearEdits, onUndoEdit,
  onToggleChroma, onChangeChroma, onResetChroma, onPickColor, picking,
  onChangeOutline,
  bgPreview, onBgPreview,
}) {
  const bg = clipBg(clip)
  const auto = bg?.auto || { enabled: false, status: 'idle', edits: [], provider: 'u2net' }
  const chroma = bg?.chroma || { enabled: false, color: '#00FF00' }
  const outline = bg?.outline || normalizeOutline(null)
  const hasCut = autoActive(bg) || !!chroma.enabled
  const running = job && (job.status === 'pending' || job.status === 'running')
  const ready = autoActive(bg)
  const isSam = isInteractiveProvider(auto.provider)
  const strokes = auto.edits?.length || 0
  const provList = (providers?.length ? providers : BG_PROVIDERS.map((p) => ({ ...p, available: true })))
  // "Exportar recorte" solo tiene sentido en material ANIMADO (vídeo o GIF): en
  // una imagen fija el resultado sería un único fotograma. Disponible en cuanto
  // hay algo que hornear (matte listo o chroma activo).
  const isAnimated = clip?.kind === 'video' || /\.gif(\?|#|$)/i.test(clip?.filename || '')
  const canExportCutout = isAnimated && (ready || chroma.enabled)
  const cutoutRunning = cutoutJob && (cutoutJob.status === 'pending' || cutoutJob.status === 'running')

  return (
    <>
      {/* --- 1. Eliminación automática ---------------------------------- */}
      <InspSection
        title="Eliminación automática"
        hint={<>Detecta el sujeto y lo separa del fondo con IA. El archivo original no se
          modifica: se guarda una máscara reutilizable en el proyecto.</>}
      >
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
              <span>
                Modelo
                <Hint>
                  {provList.find((p) => p.id === auto.provider)?.hint || ''}
                  {device ? ` Se ejecuta en ${device}.` : ''}
                </Hint>
              </span>
              <FlipSelect
                value={auto.provider}
                options={provList.map((p) => ({
                  value: p.id,
                  label: p.available === false ? `${p.label} (se descarga)` : p.label,
                }))}
                onChange={(v) => onChangeAuto?.({ provider: v })}
              />
            </label>
            {clip?.kind === 'video' && (
              <>
                <InspSlider
                  label="Estabilizar" value={Math.round((auto.stabilize ?? 0) * 100)}
                  min={0} max={100} step={1} format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ stabilize: v / 100 })} stepper
                  hint={<>Suaviza la máscara entre fotogramas para evitar parpadeo del
                    borde. Cambia el cálculo: pulsa <b>{ready ? 'Recalcular' : 'Aplicar'}</b> tras ajustarlo.</>}
                />
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
                  hint="Se aplica al instante: no vuelve a ejecutar el modelo."
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
                  hint="Crece (+) o encoge (−) el borde del sujeto."
                />
                <InspSlider
                  label="Opacidad" value={Math.round((auto.opacity ?? 1) * 100)}
                  min={0} max={100} step={1} format={pct} suffix="%" parse={parsePct}
                  onChange={(v) => onChangeAuto?.({ opacity: v / 100 })} stepper
                />
              </>
            )}
          </>
        )}
      </InspSection>

      {/* --- Exportar recorte: hornea el clip animado a un vídeo transparente - */}
      {canExportCutout && (
        <InspSection
          title="Exportar recorte"
          hint={<>Guarda este {clip?.kind === 'video' ? 'vídeo' : 'GIF'} con el fondo
            eliminado como un <b>vídeo transparente</b> (WebM) en el material,
            con toda su animación. Reutilízalo en el timeline como cualquier clip.</>}
        >
          <div className="ed-bg-actions">
            {cutoutRunning ? (
              <button type="button" className="ed-btn danger" onClick={() => onCancelCutout?.()}>
                <Icon name="stop_circle" size={15} /> Cancelar
              </button>
            ) : (
              <button type="button" className="ed-btn primary" onClick={() => onExportCutout?.()}>
                <Icon name="movie_filter" size={15} /> Exportar recorte
              </button>
            )}
          </div>
          {cutoutRunning && (
            <JobProgress job={cutoutJob} progress={cutoutJob.progress || 0} />
          )}
          {cutoutJob?.status === 'done' && (
            <div className="ed-bg-status ok">
              <Icon name="check_circle" size={14} />
              <span>{cutoutJob.message || 'Recorte añadido a Vídeos.'}</span>
            </div>
          )}
          {cutoutJob?.status === 'error' && (
            <div className="ed-bg-status err">
              <Icon name="error" size={14} />
              <span>{cutoutJob.error || 'No se pudo exportar el recorte.'}</span>
            </div>
          )}
        </InspSection>
      )}

      {/* --- 2. Selección: inteligente (SAM) o corrección manual (U²-Net) - */}
      {(ready || (isSam && auto.enabled)) && (
        <InspSection
          title={isSam ? 'Selección inteligente' : 'Eliminación personalizada'}
          hint={isSam
            ? <>Activa el <b>Lápiz mágico</b> y toca un objeto en el reproductor: el modelo lo
                detecta entero. Añade toques para ampliarlo o usa el <b>Borrador</b> (−) para
                quitar zonas, y confírmalo. Las marcas se guardan con el clip.</>
            : <>Corrige lo que la IA no acertó pintando sobre el reproductor.
                <b> Conservar</b> devuelve zonas visibles; <b>Eliminar</b> las vuelve
                transparentes. El zoom y el desplazamiento del reproductor siguen funcionando.</>}
        >
          {isSam && (
            <>
              <div className="ed-bg-actions">
                <button
                  type="button"
                  className={`ed-btn${magicMode ? ' primary' : ''}`}
                  onClick={() => onToggleMagic?.(!magicMode)}
                  title="Toca un objeto y el modelo lo selecciona entero"
                >
                  <Icon name="auto_fix_high" size={15} />
                  {magicMode ? 'Lápiz mágico activo' : 'Lápiz mágico'}
                </button>
              </div>
              {magicBusy && <JobProgress message="Analizando…" />}
            </>
          )}
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
          {isSam && magicMode && (
            <div className="ed-bg-actions">
              <button type="button" className="ed-btn primary" disabled={!strokes}
                      onClick={() => onConfirmMagic?.()}
                      title="Aplica la eliminación de fondo a todos los fotogramas">
                <Icon name="check_circle" size={15} /> Confirmar selección
              </button>
            </div>
          )}
          {strokes > 0 && (
            <p className="ed-insp-meta">{strokes} {isSam ? 'marca(s)' : 'corrección(es)'}</p>
          )}
        </InspSection>
      )}

      {/* --- 3. Chroma key --------------------------------------------- */}
      <InspSection
        title="Chroma key"
        onReset={chroma.enabled ? onResetChroma : undefined}
        hint="Para pantallas verdes o azules y fondos de color uniforme. Se ve al instante y no genera archivos: es una propiedad del clip."
      >
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
              hint="Súbela hasta que el fondo desaparezca."
            />
            <InspSlider
              label="Suavizado" value={Math.round(chroma.blend * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ blend: v / 100 })} stepper
              hint="Suaviza el borde del recorte."
            />
            <InspSlider
              label="Derrame" value={Math.round(chroma.spill * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ spill: v / 100 })} stepper
              hint="Quita el tinte del color en la piel y el pelo."
            />
            <InspSlider
              label="Limpiar borde" value={Math.round((chroma.edge ?? 0) * 100)} min={0} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ edge: v / 100 })} stepper
              hint="Come residuos finos del borde."
            />
            <InspSlider
              label="Expandir" value={Math.round((chroma.shrink ?? 0) * 100)} min={-100} max={100} step={1}
              format={pct} suffix="%" parse={parsePct}
              onChange={(v) => onChangeChroma?.({ shrink: v / 100 })} stepper
              hint="Crece (+) o encoge (−) el recorte."
            />
          </>
        ) : null}
      </InspSection>

      {/* --- 3b. Contorno / halo del sujeto (#9) ------------------------ */}
      {onChangeOutline && (
        <InspSection
          title="Contorno"
          hint={<>Borde de color alrededor del sujeto recortado; sigue la silueta del recorte.
            Con <b>Difuminado</b> se convierte en un halo.</>}
        >
          <div className="ed-insp-tools">
            <label className={`ed-mode-toggle ${outline.enabled ? 'on' : ''}`}
                   title="Borde de color alrededor del sujeto recortado">
              <input type="checkbox" checked={!!outline.enabled}
                     onChange={(e) => onChangeOutline({ enabled: e.target.checked })} />
              <Icon name="border_outer" size={15} />
              Activado
            </label>
          </div>
          {outline.enabled && (
            <>
              <div className="ed-insp-row">
                <div className="ed-insp-row-lab">Color</div>
                <div className="ed-insp-row-ctrl ed-bg-color">
                  <input type="color" value={outline.color} aria-label="Color del contorno"
                         onChange={(e) => onChangeOutline({ color: e.target.value })} />
                  <span className="ed-bg-hex">{outline.color}</span>
                </div>
              </div>
              <InspSlider
                label="Grosor" value={Math.round(outline.width * 100)} min={0} max={100} step={1}
                format={pct} suffix="%" parse={parsePct}
                onChange={(v) => onChangeOutline({ width: v / 100 })} stepper
              />
              <InspSlider
                label="Difuminado" value={Math.round(outline.soft * 100)} min={0} max={100} step={1}
                format={pct} suffix="%" parse={parsePct}
                onChange={(v) => onChangeOutline({ soft: v / 100 })} stepper
              />
              <InspSlider
                label="Opacidad" value={Math.round(outline.opacity * 100)} min={0} max={100} step={1}
                format={pct} suffix="%" parse={parsePct}
                onChange={(v) => onChangeOutline({ opacity: v / 100 })} stepper
              />
            </>
          )}
          {!hasCut && (
            <p className="ed-insp-meta">Primero elimina el fondo (automático o chroma key).</p>
          )}
        </InspSection>
      )}

      {/* --- 4. Fondo de vista previa (no afecta al export) ------------- */}
      {onBgPreview && (
        <InspSection
          title="Fondo de vista previa"
          hint={<>Coloca un fondo temporal DETRÁS del sujeto para comprobar el recorte.
            <b> Cuadros</b> revela dónde hay transparencia. Es solo vista previa:
            no cambia el vídeo ni la exportación.</>}
        >
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
        </InspSection>
      )}
    </>
  )
}
