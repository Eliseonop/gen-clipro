import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import { clipPose } from '../../lib/clipAnim'
import { APPEAR_OPTIONS, COLOR_FX, EXIT_OPTIONS, fxNum } from '../../lib/clipFx'
import { canKeyframe, keyframeIdAt } from '../../lib/clipKeyframes'
import { isVisualClip } from './editorModel'
import EdShape from './EdShape'
import EdText, { TextFxPanel } from './EdText'
import EdTransform, { InspSection, InspSlider } from './EdTransform'
import { AudioFxGrid, KfTransitionSelect, VolumePanel } from './EdEffects'

function navsFor(clip, textMode, audioMode) {
  if (textMode || clip?.kind === 'text') return ['texto', 'animacion']
  if (audioMode === 'track' || clip?.kind === 'audio') return ['audio']
  if (clip?.kind === 'shape') return ['video', 'animacion']
  if (isVisualClip(clip)) {
    if (clip.kind === 'video') return ['video', 'animacion', 'audio']
    return ['video', 'animacion']
  }
  return []
}

function navLabel(id) {
  if (id === 'animacion') return 'Animación'
  if (id === 'texto') return 'Texto'
  if (id === 'audio') return 'Audio'
  return 'Video'
}

function opacityOf(clip, playhead) {
  const t = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const n = Number(clipPose(clip, t).opacity)
  return Number.isFinite(n) ? n : 1
}

export default function EdInspector({
  selectedClip,
  textMode,
  audioMode,
  cropMode,
  onCropMode,
  overlayOn,
  onToggleOverlay,
  effectsProps,
  shapeProps,
  clipMode,
}) {
  const clip = selectedClip
  const hasTarget = !!(clip || textMode || audioMode)
  const visual = isVisualClip(clip)
  const isShape = clip?.kind === 'shape'
  const navs = navsFor(clip, textMode, audioMode)
  const [nav, setNav] = useState(navs[0] || 'video')
  const [sub, setSub] = useState('basic')
  const activeNav = navs.includes(nav) ? nav : (navs[0] || 'video')
  const p = effectsProps || {}
  const localT = Math.max(0, (p.playhead ?? 0) - (clip?.start || 0))
  const kfOn = !!(clip && canKeyframe(clip) && keyframeIdAt(clip, localT, p.fps || 30))
  const effects = clip?.effects && typeof clip.effects === 'object' ? clip.effects : {}

  useEffect(() => {
    const next = navsFor(clip, textMode, audioMode)
    setNav((cur) => (next.includes(cur) ? cur : (next[0] || 'video')))
    setSub('basic')
  }, [clip?.id, clip?.kind, textMode, audioMode])

  function patchEffects(next) {
    p.onChangeFx?.({ effects: { ...effects, ...next } })
  }

  const videoSubs = activeNav === 'video' && (visual || isShape)

  return (
    <aside className="ed-inspector">
      {hasTarget && navs.length > 0 && (
        <nav className="ed-insp-nav" aria-label="Propiedades">
          {navs.map((id) => (
            <button
              key={id}
              type="button"
              className={activeNav === id ? 'on' : ''}
              onClick={() => { setNav(id); setSub('basic') }}
            >
              {navLabel(id)}
            </button>
          ))}
          {clipMode && <em>Clip</em>}
        </nav>
      )}
      {hasTarget && videoSubs && (
        <nav className="ed-insp-sub" aria-label="Secciones">
          <button type="button" className={sub === 'basic' ? 'on' : ''} onClick={() => setSub('basic')}>Básico</button>
          {visual && (
            <button type="button" className={sub === 'adjust' ? 'on' : ''} onClick={() => setSub('adjust')}>Ajustar</button>
          )}
        </nav>
      )}

      <div className="ed-insp-body">
        {!hasTarget && (
          <div className="ed-insp-empty">
            <Icon name="tune" size={28} />
            <p>Selecciona un elemento para editar sus propiedades.</p>
          </div>
        )}

        {hasTarget && activeNav === 'video' && sub === 'basic' && visual && (
          <div className="ed-insp-tools">
            <button
              type="button"
              className={`ed-insp-tool ${cropMode ? 'on' : ''}`}
              onClick={() => onCropMode?.(!cropMode)}
              title="Ver el vídeo completo y mover el recuadro de encuadre"
            >
              <Icon name="crop_free" size={16} /> Encuadre
            </button>
            <label className="ed-chip" title="Colocar este clip encima del canvas sin rellenar el formato de salida">
              <input
                type="checkbox"
                checked={!!overlayOn}
                onChange={(e) => onToggleOverlay?.(e.target.checked)}
              /> Superponer
            </label>
          </div>
        )}

        {hasTarget && activeNav === 'video' && sub === 'basic' && (
          <>
            {isShape && shapeProps && <EdShape {...shapeProps} />}
            {!isShape && (
            <EdTransform
              clip={clip}
              playhead={p.playhead}
              onPose={p.onPose}
              onChangeFrame={p.onChangeFrame}
              onAddKf={p.onAddKf}
              fps={p.fps}
            />
            )}
            {canKeyframe(clip) && clip?.kind !== 'audio' && (
              <InspSection title="Mezcla" kfOn={kfOn} onAddKf={p.onAddKf}>
                <InspSlider
                  label="Opacidad"
                  value={Math.round(opacityOf(clip, p.playhead) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  format={(v) => `${Math.round(v)}`}
                  suffix="%"
                  parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
                  onChange={(pct) => p.onPose?.({ opacity: pct / 100 })}
                  onKf={p.onAddKf}
                  kfOn={kfOn}
                />
              </InspSection>
            )}
          </>
        )}

        {hasTarget && activeNav === 'video' && sub === 'adjust' && visual && (
          <InspSection title="Color">
            {COLOR_FX.map((item) => (
              <InspSlider
                key={item.id}
                label={item.label}
                value={Math.round(fxNum(effects, item.id) * 100)}
                min={Math.round(item.min * 100)}
                max={Math.round(item.max * 100)}
                step={Math.max(1, Math.round((item.step || 0.05) * 100))}
                format={(v) => `${Math.round(v)}`}
                parse={(raw) => parseFloat(String(raw).replace(/[^\d.-]/g, ''))}
                onChange={(pct) => patchEffects({ [item.id]: pct / 100 })}
              />
            ))}
          </InspSection>
        )}

        {hasTarget && activeNav === 'animacion' && (
          <InspSection title="Entrada y salida">
            <KfTransitionSelect clip={clip} selKfId={p.selKfId} playhead={p.playhead} onInterp={p.onInterpKf} fps={p.fps} />
            {(clip?.kind === 'video' || clip?.kind === 'image' || clip?.kind === 'text') && (
              <>
                <label className="ed-insp-select">
                  Aparición
                  <FlipSelect
                    value={clip.appear || 'none'}
                    options={APPEAR_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => p.onChangeFx?.({ appear: v })}
                  />
                </label>
                <label className="ed-insp-select">
                  Salida
                  <FlipSelect
                    value={clip.exit || 'none'}
                    options={EXIT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => p.onChangeFx?.({ exit: v })}
                  />
                </label>
              </>
            )}
          </InspSection>
        )}

        {hasTarget && activeNav === 'audio' && (
          <InspSection title="Audio" defaultOpen>
            {p.trackEmpty ? (
              <p className="ed-insp-hint">Esta pista no tiene clips. Añade un audio para editar volumen y efectos.</p>
            ) : (
              <>
                <VolumePanel
                  clip={clip}
                  playhead={p.playhead}
                  onChangeFx={p.onChangeFx}
                  onPose={p.onPose}
                  onAddKf={p.onAddKf}
                  onFade={p.onFade}
                  trackMode={audioMode === 'track'}
                />
                <AudioFxGrid
                  clip={clip}
                  playhead={p.playhead}
                  onChangeFx={p.onChangeFx}
                  onPose={p.onPose}
                  trackMode={audioMode === 'track'}
                />
              </>
            )}
          </InspSection>
        )}

        {hasTarget && activeNav === 'texto' && (
          <>
            <EdText
              mode={textMode === 'track' ? 'track' : 'segment'}
              clip={p.textEditor?.clip || (clip?.kind === 'text' ? clip : null)}
              style={p.textStyle ?? clip?.style ?? {}}
              selectionCount={p.textEditor?.selectionCount || 1}
              onChangeText={p.textEditor?.onChangeText}
              onChangeStyle={p.onChangeTextStyle}
              onApplyPreset={p.onApplyTextPreset}
              onChangeDur={p.textEditor?.onChangeDur}
              onApplyAsGlobalTemplate={p.textEditor?.onApplyAsGlobalTemplate}
              framing={p.textEditor?.framing}
              onStartFraming={p.textEditor?.onStartFraming}
              onSaveFraming={p.textEditor?.onSaveFraming}
              onCancelFraming={p.textEditor?.onCancelFraming}
              textFavorites={p.textEditor?.textFavorites}
              onSaveFavorite={p.textEditor?.onSaveFavorite}
              onApplyFavorite={p.textEditor?.onApplyFavorite}
              onDeleteFavorite={p.textEditor?.onDeleteFavorite}
              onFragment={p.textEditor?.onFragment}
            />
            <TextFxPanel
              section="look"
              style={p.textStyle ?? clip?.style ?? {}}
              mode={textMode || 'clip'}
              onChangeStyle={p.onChangeTextStyle}
              onApplyPreset={p.onApplyTextPreset}
            />
          </>
        )}
      </div>
    </aside>
  )
}
