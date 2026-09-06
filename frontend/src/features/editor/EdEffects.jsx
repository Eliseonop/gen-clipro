import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import {
  APPEAR_OPTIONS, AUDIO_FX_TOGGLES, COLOR_FX, EXIT_OPTIONS, LOOK_OPTIONS,
  VIDEO_FX_TOGGLES, fxNum, fxOn,
} from '../../lib/clipFx'
import { isVisualClip } from './editorModel'
import EdText, { TextFxPanel } from './EdText'
import EdTransform from './EdTransform'
import {
  canKeyframe, clipPropsAt, clipVolumeAt, clampVolume, KF_INTERPS, keyframesEnabled,
  normalizeInterp, targetInterpItem, VOL_MAX,
} from '../../lib/clipKeyframes'

function fxTabs(clip, textMode, audioMode) {
  if (textMode === 'clip' || textMode === 'track' || clip?.kind === 'text') return ['text', 'transitions']
  if (audioMode === 'track') return ['audio']
  if (!clip) return []
  if (isVisualClip(clip)) {
    if (clip.kind === 'video') return ['video', 'audio', 'transitions']
    return ['video', 'transitions']
  }
  if (clip.kind === 'audio') return ['audio']
  return []
}

function tabLabel(id) {
  if (id === 'text') return 'Texto'
  if (id === 'transitions') return 'Transiciones'
  if (id === 'video') return 'Video'
  return 'Audio'
}

export function KfTransitionSelect({ clip, selKfId, playhead, onInterp, fps }) {
  const localT = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const target = targetInterpItem(clip, selKfId, localT, fps)
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

export function VolumePanel({ clip, playhead, onChangeFx, onPose, onAddKf, onFade, trackMode }) {
  const localT = Math.max(0, (playhead ?? 0) - (clip.start || 0))
  const keyed = !trackMode && keyframesEnabled(clip)
  const vol = keyed ? clipVolumeAt(clip, localT) : clampVolume(clip?.volume ?? 1)
  const pct = Math.round(vol * 100)

  function setVolume(next) {
    const v = clampVolume(next)
    if (keyed) onPose?.({ volume: v })
    else onChangeFx?.({ volume: v })
  }

  return (
    <div className="ed-speed ed-vol">
      <div className="ed-speed-head">
        <span>{trackMode ? 'Volumen de la pista' : 'Volumen'}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="ed-vol-meter" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (vol / VOL_MAX) * 100)}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={Math.round(VOL_MAX * 100)}
        step="1"
        value={pct}
        aria-label="Volumen"
        aria-valuemin={0}
        aria-valuemax={Math.round(VOL_MAX * 100)}
        aria-valuenow={pct}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
      />
      <label className="ed-vol-num">
        Valor
        <input
          type="number"
          min={0}
          max={Math.round(VOL_MAX * 100)}
          step="1"
          value={pct}
          aria-label="Volumen en porcentaje"
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            setVolume(n / 100)
          }}
        />
        <em>%</em>
      </label>
      <div className="ed-speed-toggles">
        <button type="button" className="ed-mute" title="Subir de 0 al volumen actual" onClick={() => onFade?.('in')}>
          Fade in
        </button>
        <button type="button" className="ed-mute" title="Bajar del volumen actual a 0" onClick={() => onFade?.('out')}>
          Fade out
        </button>
      </div>
      <button
        type="button"
        className={`ed-mute ${clip?.muted ? 'on' : ''}`}
        onClick={() => onChangeFx?.({ muted: !clip?.muted })}
        title={trackMode ? 'Silenciar todos los clips de la pista' : 'Silenciar solo este clip'}
      >
        <Icon name={clip?.muted ? 'volume_off' : 'volume_up'} size={15} />
        Mute
      </button>
      {!trackMode && canKeyframe(clip) && (
        <button
          type="button"
          className="ed-mute"
          title="Keyframe de volumen en el cabezal"
          onClick={() => onAddKf?.()}
        >
          <Icon name="timeline" size={15} />
          Keyframe
        </button>
      )}
    </div>
  )
}

export function AudioFxGrid({ clip, playhead, onChangeFx, onPose, trackMode }) {
  const audioFx = clip?.audio_fx && typeof clip.audio_fx === 'object' ? clip.audio_fx : {}
  const localT = Math.max(0, (playhead ?? 0) - (clip?.start || 0))
  const live = !trackMode && keyframesEnabled(clip) ? clipPropsAt(clip, localT) : null

  function valueOf(id) {
    if (live) return Math.min(1, Math.max(0, Number(live[id]) || 0))
    return fxNum(audioFx, id)
  }

  function setFx(id, val) {
    const n = Math.min(1, Math.max(0, Number(val) || 0))
    if (!trackMode && keyframesEnabled(clip)) onPose?.({ [id]: n })
    else onChangeFx?.({ audio_fx: { ...audioFx, [id]: n } })
  }

  function toggle(item) {
    const on = valueOf(item.id) > 0
    setFx(item.id, on ? 0 : (item.def ?? 1))
  }

  return (
    <div className="ed-fx-grid">
      {AUDIO_FX_TOGGLES.map((item) => {
        const v = valueOf(item.id)
        const on = v > 0
        return (
          <div key={item.id} className={`ed-fx-card ${on ? 'on' : ''}`}>
            <button type="button" className="ed-fx-card-btn" onClick={() => toggle(item)}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
            {on && (
              <input
                type="range"
                min={item.min ?? 0}
                max={item.max ?? 1}
                step={item.step ?? 0.05}
                value={v}
                aria-label={`Intensidad ${item.label}`}
                onChange={(e) => setFx(item.id, Number(e.target.value))}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function EdEffects({
  clip, onChangeFx, textStyle, textMode, onChangeTextStyle, onApplyTextPreset,
  playhead, onPose, onChangeFrame, selKfId, onInterpKf, textEditor, fps = 30,
  audioMode, trackLabel, onAddKf, onFade, trackEmpty,
}) {
  const trackMode = audioMode === 'track'
  const tabs = fxTabs(clip, textMode, audioMode)
  const isTextFx = tabs[0] === 'text'
  const [tab, setTab] = useState(tabs[0] || 'video')
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] || 'video')
  const showKf = canKeyframe(clip) && !trackMode

  useEffect(() => {
    setTab((t) => {
      const next = fxTabs(clip, textMode, audioMode)
      return next.includes(t) ? t : (next[0] || 'video')
    })
  }, [clip?.id, clip?.kind, textMode, audioMode])

  const kfBlock = showKf ? (
    <EdTransform
      clip={clip}
      playhead={playhead}
      onPose={onPose}
      onChangeFrame={onChangeFrame}
    />
  ) : null

  if (trackMode && trackEmpty) {
    return (
      <div className="ed-mat-list">
        <div className="ed-mat-empty">Esta pista no tiene clips. Añade un audio para editar volumen y efectos.</div>
      </div>
    )
  }

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
          <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} fps={fps} />
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
            <>
              <EdText
                mode={mode === 'track' ? 'track' : 'segment'}
                clip={textEditor?.clip || (clip?.kind === 'text' ? clip : null)}
                style={st}
                selectionCount={textEditor?.selectionCount || 1}
                onChangeText={textEditor?.onChangeText}
                onChangeStyle={onChangeTextStyle}
                onApplyPreset={onApplyTextPreset}
                onChangeDur={textEditor?.onChangeDur}
                onApplyAsGlobalTemplate={textEditor?.onApplyAsGlobalTemplate}
                framing={textEditor?.framing}
                onStartFraming={textEditor?.onStartFraming}
                onSaveFraming={textEditor?.onSaveFraming}
                onCancelFraming={textEditor?.onCancelFraming}
                textFavorites={textEditor?.textFavorites}
                onSaveFavorite={textEditor?.onSaveFavorite}
                onApplyFavorite={textEditor?.onApplyFavorite}
                onDeleteFavorite={textEditor?.onDeleteFavorite}
                onFragment={textEditor?.onFragment}
              />
              <TextFxPanel
                section="look"
                style={st}
                mode={mode}
                onChangeStyle={onChangeTextStyle}
                onApplyPreset={onApplyTextPreset}
              />
            </>
          )}
          {activeTab === 'transitions' && (
            <>
              {kfBlock}
              <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} fps={fps} />
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

  const showVolume = trackMode || clip?.kind === 'video' || clip?.kind === 'audio'
  const volumeBlock = showVolume ? (
    <VolumePanel
      clip={clip}
      playhead={playhead}
      onChangeFx={onChangeFx}
      onPose={onPose}
      onAddKf={onAddKf}
      onFade={onFade}
      trackMode={trackMode}
    />
  ) : null

  const effects = clip?.effects && typeof clip.effects === 'object' ? clip.effects : {}

  function patchEffects(next) {
    onChangeFx?.({ effects: { ...effects, ...next } })
  }

  function toggleVideo(item) {
    if (item.kind === 'toggle') {
      patchEffects({ [item.id]: !fxOn(effects, item.id) })
      return
    }
    patchEffects({ [item.id]: fxOn(effects, item.id) ? 0 : item.def })
  }

  const audioBlock = (
    <>
      {trackMode && (
        <p className="ed-key-hint">
          Se aplica a todos los clips de esta pista{trackLabel ? ` (${trackLabel})` : ''}.
        </p>
      )}
      <div className="ed-fx-label">Efectos</div>
      <AudioFxGrid
        clip={clip}
        playhead={playhead}
        onChangeFx={onChangeFx}
        onPose={onPose}
        trackMode={trackMode}
      />
      {!trackMode && (
        <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} fps={fps} />
      )}
    </>
  )

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
        {volumeBlock}
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
            <KfTransitionSelect clip={clip} selKfId={selKfId} playhead={playhead} onInterp={onInterpKf} fps={fps} />
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

        {activeTab === 'audio' && audioBlock}
      </div>
    </div>
  )
}
