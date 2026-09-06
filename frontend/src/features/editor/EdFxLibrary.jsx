import Icon from '../../components/Icon'
import {
  APPEAR_OPTIONS, EXIT_OPTIONS, LOOK_OPTIONS, VIDEO_FX_TOGGLES, fxOn, fxNum,
} from '../../lib/clipFx'
import { SUBTITLE_THEMES } from '../../lib/subtitleThemes'
import { cssFont } from '../../lib/textstyles'
import { isVisualClip } from './editorModel'

function themePreviewStyle(theme) {
  const s = theme.style || {}
  return {
    fontFamily: cssFont(s.font),
    fontWeight: s.bold ? 800 : 600,
    color: s.color,
    background: s.bg && s.bg !== 'none' ? s.bg : 'transparent',
    textShadow: s.glow
      ? `0 0 8px ${s.shadow_color || s.highlight_color}`
      : s.border_width
        ? `0 1px 0 ${s.border_color || '#000'}, 0 -1px 0 ${s.border_color || '#000'}, 1px 0 0 ${s.border_color || '#000'}, -1px 0 0 ${s.border_color || '#000'}`
        : 'none',
  }
}

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

  if (mode === 'text') {
    return (
      <div className="ed-mat-list ed-fx-lib">
        <button type="button" className="primary alt small" onClick={() => onAddText?.()}>
          <Icon name="title" size={15} /> Agregar texto
        </button>
        <div className="ed-fx-label">Temas</div>
        <div className="ed-theme-grid">
          {SUBTITLE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="ed-theme-card"
              title={t.name}
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

  if (!visual) {
    return <NeedClip text="Selecciona un vídeo o una imagen para aplicar efectos." />
  }

  return (
    <div className="ed-mat-list ed-fx-lib">
      <div className="ed-fx-label">Estilo</div>
      <div className="ed-fx-chips">
        {LOOK_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`ed-fx-chip ${(clip.look || 'none') === o.id ? 'on' : ''}`}
            onClick={() => onChangeFx?.({ look: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>
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
