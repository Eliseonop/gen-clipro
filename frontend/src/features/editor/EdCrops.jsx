import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { kfColor } from '../../lib/panning'
import { SPEED_MAX, SPEED_MIN, SPEED_PRESETS, clipKeepPitch, clipSpeed, isVisualClip } from './editorModel'
import EdLayer from './EdLayer'
import {
  canKeyframe, clampVolume, hasVolumeControls, keyframesEnabled, normalizeItems,
} from '../../lib/clipKeyframes'
import { fmtRuler } from './timelineScale'
import { frameDuration } from '../../lib/projectFps'

function speedLabel(n) {
  return n % 1 === 0 ? `${n}x` : `${n.toFixed(1)}x`
}

function kfList(clip) {
  if (keyframesEnabled(clip) || (clip?.keyframes?.items || []).length) {
    return normalizeItems(clip.keyframes.items)
  }
  if (isVisualClip(clip)) {
    return [...(clip.reframe?.keyframes || [])].sort((a, b) => a.t - b.t)
  }
  return []
}

function kfTime(clip, k, snapshots) {
  return snapshots ? k.t : k.t - (clip.in_point || 0)
}

// Panel junto a la timeline: keyframes numerados y velocidad del clip.
export default function EdCrops({
  clip, selKfId, onChangeFx, layer, onMoveLayer,
  onSelectKf, onDeleteKf, fps = 30, onAddKf,
}) {
  const [tab, setTab] = useState('kf')
  const isVideo = isVisualClip(clip)
  const isImage = clip?.kind === 'image'
  const isAudio = clip?.kind === 'audio'
  const isText = clip?.kind === 'text'
  const hasClip = isVideo || isAudio
  const snapshots = keyframesEnabled(clip) || (clip?.keyframes?.items || []).length > 0
  const items = kfList(clip)
  const propsTab = isText ? 'Capas' : 'Clip'
  const kfEmpty = isAudio
    ? 'Ajusta el volumen en Efectos o pulsa Agregar keyframe en el cabezal.'
    : isText
      ? 'Mueve el texto en el Main para crear un keyframe en el cabezal.'
      : 'Mueve el encuadre para crear un keyframe en el cabezal.'

  useEffect(() => {
    if (clip?.kind === 'audio') setTab('props')
    else if (canKeyframe(clip) || isVisualClip(clip)) setTab('kf')
  }, [clip?.id, clip?.kind])

  return (
    <div className="ed-crops">
      <div className="ed-crops-tabs">
        <button type="button" className={`ed-tab ${tab === 'kf' ? 'on' : ''}`} onClick={() => setTab('kf')}>
          Keyframes
        </button>
        <button type="button" className={`ed-tab ${tab === 'props' ? 'on' : ''}`} onClick={() => setTab('props')}>
          {propsTab}
        </button>
      </div>

      {tab === 'props' ? (
        isText ? (
          layer ? (
            <div className="ed-props">
              <EdLayer info={layer} onMove={onMoveLayer} />
            </div>
          ) : (
            <div className="ed-crops-empty">Selecciona un texto para ordenar sus capas.</div>
          )
        ) : !hasClip ? (
          <div className="ed-crops-empty">Selecciona un clip para ver sus propiedades.</div>
        ) : (
          <div className="ed-props">
            {layer && <EdLayer info={layer} onMove={onMoveLayer} />}
            {isImage && (
              <div className="ed-prop" style={{ fontSize: 12, color: 'var(--muted)' }}>Tipo: Imagen</div>
            )}
            {!isImage && (
            <div className="ed-speed">
              <div className="ed-speed-head">
                <span>Velocidad</span>
                <strong>{speedLabel(clipSpeed(clip))}</strong>
              </div>
              <div className="ed-speed-presets">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={clipSpeed(clip) === p ? 'on' : ''}
                    onClick={() => onChangeFx({ speed: p })}>
                    {speedLabel(p)}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step="0.1"
                value={clipSpeed(clip)}
                aria-label="Velocidad del clip"
                onChange={(e) => onChangeFx({ speed: Number(e.target.value) })}
              />
              <div className="ed-speed-toggles">
                <button
                  type="button"
                  className={`ed-mute ${clipKeepPitch(clip) ? 'on' : ''}`}
                  title="Mantener el tono de la voz"
                  onClick={() => onChangeFx({ keep_pitch: !clipKeepPitch(clip) })}>
                  Tono
                </button>
                <button
                  type="button"
                  className={`ed-mute ${clip.reverse ? 'on' : ''}`}
                  title="Reproducir hacia atrás"
                  onClick={() => onChangeFx({ reverse: !clip.reverse })}>
                  Reversa
                </button>
              </div>
            </div>
            )}
          </div>
        )
      ) : (
        !canKeyframe(clip) && !isVideo ? (
          <div className="ed-crops-empty">Selecciona un clip, imagen, figura o texto.</div>
        ) : items.length === 0 ? (
          <div className="ed-crops-empty">
            {kfEmpty}
            {canKeyframe(clip) && (
              <button type="button" className="ed-mute" style={{ marginTop: 10 }} onClick={() => onAddKf?.()}>
                Agregar keyframe
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="ed-crops-count">{items.length} keyframe{items.length === 1 ? '' : 's'}</div>
            <div className="ed-crops-list">
              {items.map((k, i) => (
                <div
                  key={k.id || i}
                  className={`ed-crop-row ${selKfId === k.id ? 'sel' : ''}`}
                  style={{ borderLeftColor: kfColor(i) }}
                  onClick={() => onSelectKf?.(k)}
                >
                  <span className="ed-crop-swatch" style={{ background: kfColor(i) }} />
                  <div className="ed-crop-info">
                    <span className="ed-crop-time">Keyframe {i + 1}</span>
                    <span className="ed-crop-type">
                      {fmtRuler(kfTime(clip, k, snapshots), { step: frameDuration(fps), fps })}
                      {hasVolumeControls(clip) && k.props?.volume != null
                        ? ` · ${Math.round(clampVolume(k.props.volume) * 100)}%`
                        : ''}
                    </span>
                  </div>
                  <button className="icon-btn" title="Eliminar keyframe"
                    onClick={(e) => { e.stopPropagation(); onDeleteKf?.(k) }}>
                    <Icon name="delete" size={14} />
                  </button>
                </div>
              ))}
            </div>
            {canKeyframe(clip) && (
              <div className="ed-crops-add">
                <button type="button" className="ed-mute" onClick={() => onAddKf?.()}>
                  Agregar keyframe
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
