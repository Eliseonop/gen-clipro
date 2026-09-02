import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import {
  APPEAR_OPTIONS, AUDIO_FX_TOGGLES, COLOR_FX, EXIT_OPTIONS, LOOK_OPTIONS,
  VIDEO_FX_TOGGLES, fxNum, fxOn,
} from '../../lib/clipFx'
import { isVisualClip } from './editorModel'
import { TextFxPanel } from './EdText'
import EdTransform from './EdTransform'
import { canKeyframe, KF_INTERPS, normalizeInterp, targetInterpItem } from '../../lib/clipKeyframes'

function fxTabs(clip, textMode) {
  if (textMode === 'clip' || textMode === 'track' || clip?.kind === 'text') return ['text', 'transitions']
  if (!clip) return []
  if (isVisualClip(clip)) return ['video', 'transitions']
  if (clip.kind === 'audio') return ['audio']
  return []
}

function tabLabel(id) {
  if (id === 'text') return 'Texto'
  if (id === 'transitions') return 'Transiciones'
  if (id === 'video') return 'Video'
  return 'Audio'
}

function KfTransitionSelect({ clip, selKfId, playhead, onInterp }) {
  const localT = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const target = targetInterpItem(clip, selKfId, localT)
  if (!target) return null
  return (
    <>
      <label className="ed-prop">
        Tipo de transición
        <FlipSelect
          value={normalizeInterp(target.interpolation)}
          options={KF_INTERPS.map((o) => ({ value: o.id, label: o.label }))}
          onChange={(v) => onInterp?.(target, v)}
        />
      </label>
      <p className="ed-key-hint">Cómo llega el encuadre a este punto de la timeline.</p>
    </>
  )
}

export default function EdEffects({
  clip, onChangeFx, textStyle, textMode, onChangeTextStyle, onApplyTextPreset,
  playhead, onPose, onChangeFrame, selKfId, onInterpKf,
}) {
  const tabs = fxTabs(clip, textMode)
  const isTextFx = tabs[0] === 'text'
  const [tab, setTab] = useState(tabs[0] || 'video')
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] || 'video')
  const showKf = canKeyframe(clip)

  useEffect(() => {
    setTab((t) => {
      const next = fxTabs(clip, textMode)
      return next.includes(t) ? t : (next[0] || 'video')
    })
  }, [clip?.id, clip?.kind, textMode])

  const kfBlock = showKf ? (
    <EdTransform
      clip={clip}
      playhead={playhead}
      onPose={onPose}
      onChangeFrame={onChangeFrame}
    />
  ) : null

  if (!tabs.length && !showKf) {
    return (
      <div className="ed-mat-list">
        <div className="ed-mat-empty">Selecciona un clip en la timeline.</div>
      </div>
    )
  }

  if (!tabs.length && showKf) {
    return (
      <div className="ed-fx">
        <div className="ed-fx-body">
          {kfBlock}
          <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} />
        </div>
      </div>
    )
  }

  if (isTextFx) {
    const st = textStyle ?? clip?.style ?? {}
    const mode = textMode || 'clip'
    return (
      <div className="ed-fx">
        <div className="ed-scope-filter">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              className={`ed-tab ${activeTab === id ? 'on' : ''}`}
              onClick={() => setTab(id)}
            >
              {tabLabel(id)}
            </button>
          ))}
        </div>
        <div className="ed-fx-body">
          {activeTab === 'text' && (
            <TextFxPanel
              section="look"
              style={st}
              mode={mode}
              onChangeStyle={onChangeTextStyle}
              onApplyPreset={onApplyTextPreset}
            />
          )}
          {activeTab === 'transitions' && (
            <>
              {kfBlock}
              <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} />
              <TextFxPanel
                section="appear"
                style={st}
                mode={mode}
                onChangeStyle={onChangeTextStyle}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  const effects = clip.effects && typeof clip.effects === 'object' ? clip.effects : {}
  const audioFx = clip.audio_fx && typeof clip.audio_fx === 'object' ? clip.audio_fx : {}

  function patchEffects(next) {
    onChangeFx?.({ effects: { ...effects, ...next } })
  }
  function patchAudio(next) {
    onChangeFx?.({ audio_fx: { ...audioFx, ...next } })
  }

  function toggleVideo(item) {
    if (item.kind === 'toggle') {
      patchEffects({ [item.id]: !fxOn(effects, item.id) })
      return
    }
    patchEffects({ [item.id]: fxOn(effects, item.id) ? 0 : item.def })
  }

  return (
    <div className="ed-fx">
      <div className="ed-scope-filter">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            className={`ed-tab ${activeTab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {tabLabel(id)}
          </button>
        ))}
      </div>

      <div className="ed-fx-body">
        {activeTab === 'video' && (
          <>
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

            <div className="ed-fx-label">Color</div>
            {COLOR_FX.map((item) => (
              <label key={item.id} className="ed-fx-slider">
                <span>{item.label}</span>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={fxNum(effects, item.id)}
                  onChange={(e) => patchEffects({ [item.id]: Number(e.target.value) })}
                />
              </label>
            ))}

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
                        onChange={(e) => patchEffects({ [item.id]: Number(e.target.value) })}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {activeTab === 'transitions' && (
          <>
            {kfBlock}
            <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} />
            <label className="ed-prop">
              Aparición
              <FlipSelect
                value={clip.appear || 'none'}
                options={APPEAR_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                onChange={(v) => onChangeFx?.({ appear: v })}
              />
            </label>
            <label className="ed-prop">
              Salida
              <FlipSelect
                value={clip.exit || 'none'}
                options={EXIT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                onChange={(v) => onChangeFx?.({ exit: v })}
              />
            </label>
          </>
        )}

        {activeTab === 'audio' && (
          <div className="ed-fx-grid">
            {AUDIO_FX_TOGGLES.map((item) => {
              const on = fxOn(audioFx, item.id)
              return (
                <div key={item.id} className={`ed-fx-card ${on ? 'on' : ''}`}>
                  <button type="button" className="ed-fx-card-btn" onClick={() => patchAudio({ [item.id]: !on })}>
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
