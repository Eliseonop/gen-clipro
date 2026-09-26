import Icon from '../../components/Icon'
import EdFilters from './EdFilters'
import EdRecipes from './EdRecipes'
import { CINEMA_RATIOS } from '../../lib/shapes'
import {
  APPEAR_OPTIONS, EXIT_OPTIONS, VIDEO_FX_TOGGLES, fxOn, fxNum,
} from '../../lib/clipFx'
import { SUBTITLE_THEMES } from '../../lib/subtitleThemes'
import { themePreviewStyle } from '../../lib/textstyles'
import { DEFAULT_TEXT, TEXT_DEFAULT_DUR, dragTextPayload, isVisualClip } from './editorModel'

function NeedClip({ text }) {
  return (
    <div className="ed-mat-empty">
      <Icon name="touch_app" size={22} />
      <span>{text}</span>
    </div>
  )
}

export default function EdFxLibrary({
  mode = 'effects',
  clip,
  onChangeFx,
  onAddText,
  onApplyPreset,
  onNeedClip,
  onAddAdjustment,
  onAddCinemaBars,
  onApplyRecipe,
  recipeBusy,
  selectedClips,
  onDragInfo,
}) {
  const visual = isVisualClip(clip)
  const effects = clip?.effects && typeof clip.effects === 'object' ? clip.effects : {}

  function patchEffects(next) {
    if (!visual) { onNeedClip?.(); return }
    onChangeFx?.({ effects: { ...effects, ...next } })
  }

  function toggleVideo(item) {
    if (!visual) { onNeedClip?.(); return }
    if (item.kind === 'toggle') {
      patchEffects({ [item.id]: !fxOn(effects, item.id) })
      return
    }
    patchEffects({ [item.id]: fxOn(effects, item.id) ? 0 : item.def })
  }

  // Ficha de texto → timeline: mismo camino que las figuras (application/x-material).
  function dragText(e, theme) {
    e.dataTransfer.setData('application/x-material', dragTextPayload(theme))
    e.dataTransfer.effectAllowed = 'copy'
    onDragInfo?.({ kind: 'text', duration: TEXT_DEFAULT_DUR, name: theme?.name || DEFAULT_TEXT })
  }

  if (mode === 'text') {
    return (
      <div className="ed-mat-list ed-fx-lib">
        <div className="ed-fx-label">Añadir texto</div>
        <div className="ed-text-tiles">
          <button
            type="button"
            className="ed-text-tile"
            title="Arrástralo a la timeline, o clic para añadirlo en el cursor"
            draggable
            onDragStart={(e) => dragText(e)}
            onDragEnd={() => onDragInfo?.(null)}
            onClick={() => onAddText?.()}
          >
            <span>{DEFAULT_TEXT}</span>
            <span className="ed-text-tile-add"><Icon name="add" size={15} /></span>
          </button>
        </div>
        <div className="ed-fx-label">Temas</div>
        <div className="ed-theme-grid">
          {SUBTITLE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ed-theme-card"
              title={t.name}
              draggable
              onDragStart={(e) => dragText(e, t)}
              onDragEnd={() => onDragInfo?.(null)}
              onClick={() => {
                if (clip?.kind === 'text') onApplyPreset?.(t)
                else onAddText?.(t)
              }}
            >
              <span className="ed-theme-chip" style={themePreviewStyle(t)}>
                <span className="idle">Aa</span>
                <span className="hot" style={{ color: t.style.highlight_color }}>Aa</span>
              </span>
              <span className="ed-theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (mode === 'transitions') {
    if (!clip || (clip.kind !== 'video' && clip.kind !== 'image' && clip.kind !== 'text')) {
      return <NeedClip text="Selecciona un clip o un texto para aplicar una transición." />
    }
    return (
      <div className="ed-mat-list ed-fx-lib">
        <div className="ed-fx-label">Aparición</div>
        <div className="ed-fx-grid">
          {APPEAR_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`ed-fx-card-btn ed-lib-card ${(clip.appear || 'none') === o.id ? 'on' : ''}`}
              onClick={() => onChangeFx?.({ appear: o.id })}
            >
              <Icon name="login" size={18} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
        <div className="ed-fx-label">Salida</div>
        <div className="ed-fx-grid">
          {EXIT_OPTIONS.map((o) => (
            <button
              key={`x-${o.id}`}
              type="button"
              className={`ed-fx-card-btn ed-lib-card ${(clip.exit || 'none') === o.id ? 'on' : ''}`}
              onClick={() => onChangeFx?.({ exit: o.id })}
            >
              <Icon name="logout" size={18} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Capa de ajuste (#19): no necesita un clip seleccionado.
  const adjustBtn = onAddAdjustment && (
    <button type="button" className="ed-shape-pen" onClick={onAddAdjustment}
      title="Un clip que filtra todo lo que tiene debajo durante su tramo">
      <Icon name="tune" size={18} />
      <span>Capa de ajuste</span>
      <em>filtros y color para todo lo de debajo</em>
    </button>
  )
  // Barras de cine (#20): un clic por proporción.
  const barsRow = onAddCinemaBars && (
    <div className="ed-cinema-bars">
      <span><Icon name="crop_7_5" size={16} /> Barras de cine</span>
      {CINEMA_RATIOS.map((r) => (
        <button key={r.id} type="button" className="ed-fx-chip" onClick={() => onAddCinemaBars(r.id)}
          title={`Barras negras arriba y abajo: lo visible queda en ${r.label}`}>
          {r.label}
        </button>
      ))}
    </div>
  )
  const recipesBlock = onApplyRecipe && (
    <EdRecipes selected={selectedClips || []} busy={recipeBusy} onApply={onApplyRecipe} />
  )
  if (!visual) {
    return (
      <div className="ed-mat-list ed-fx-lib">
        {recipesBlock}
        {adjustBtn}
        {barsRow}
        <NeedClip text="Selecciona un vídeo o una imagen para aplicar efectos." />
      </div>
    )
  }

  return (
    <div className="ed-mat-list ed-fx-lib">
      {recipesBlock}
      {adjustBtn}
      {barsRow}
      <EdFilters clip={clip} onChangeFx={onChangeFx} />
      <div className="ed-fx-label">Efectos</div>
      <div className="ed-fx-grid">
        {VIDEO_FX_TOGGLES.map((item) => {
          const on = fxOn(effects, item.id)
          return (
            <div key={item.id} className={`ed-fx-card ${on ? 'on' : ''}`}>
              <button type="button" className="ed-fx-card-btn" onClick={() => toggleVideo(item)}>
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
              {on && item.kind === 'range' && (
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={fxNum(effects, item.id)}
                  aria-label={`Intensidad ${item.label}`}
                  onChange={(e) => patchEffects({ [item.id]: Number(e.target.value) })}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
