import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import FlipSelect from '../../components/FlipSelect'
import PanModeToggle from '../../components/PanModeToggle'
import { fmt } from '../../lib/utils'
import { kfColor } from '../../lib/panning'
import { APPEAR_OPTIONS, EXIT_OPTIONS, LOOK_OPTIONS } from '../../lib/clipFx'
import { FRAME_OPTIONS, frameOf } from '../../lib/clipLayout'

// Panel junto a la timeline: recorte (keyframes) y propiedades del clip.
export default function EdCrops({ clip, selKfId, hiddenKf, onSelect, onToggleHidden, onDelete, onSeek, onPanMode, onChangeFx, onChangeFrame }) {
  const [tab, setTab] = useState('crop')
  const [track, setTrack] = useState(1)
  const dual = !!(clip?.kind === 'video' && clip.reframe?.dual_crop)
  const isVideo = clip?.kind === 'video'
  const isAudio = clip?.kind === 'audio'
  const hasClip = isVideo || isAudio
  useEffect(() => { setTrack(1) }, [clip?.id])
  useEffect(() => {
    if (clip?.kind === 'audio') setTab('props')
  }, [clip?.id, clip?.kind])
  const kfs = isVideo
    ? [...((dual && track === 2 ? clip.reframe?.keyframes2 : clip.reframe?.keyframes) || [])].sort((a, b) => a.t - b.t)
    : []
  const typeLabel = clip?.frame === 'top'
    ? 'Mitad superior'
    : clip?.frame === 'bottom'
      ? 'Mitad inferior'
      : clip?.layout === 'overlay'
        ? 'Superpuesto'
        : dual
          ? (clip.reframe.split_layout === 'horizontal'
            || (clip.reframe.split_layout !== 'auto' && clip.reframe.split_orientation === 'horizontal')
            ? 'Dividido L/R'
            : clip.reframe.split_layout === 'auto' ? 'Dividido auto' : 'Dividido T/B')
          : 'Vertical'

  return (
    <div className="ed-crops">
      <div className="ed-crops-tabs">
        <button type="button" className={`ed-tab ${tab === 'crop' ? 'on' : ''}`} onClick={() => setTab('crop')}>
          Recorte
        </button>
        <button type="button" className={`ed-tab ${tab === 'props' ? 'on' : ''}`} onClick={() => setTab('props')}>
          Propiedades
        </button>
      </div>

      {tab === 'props' ? (
        !hasClip ? (
          <div className="ed-crops-empty">Selecciona un clip para ver sus propiedades.</div>
        ) : (
          <div className="ed-props">
            <button
              type="button"
              className={`ed-mute ${clip.muted ? 'on' : ''}`}
              onClick={() => onChangeFx({ muted: !clip.muted })}
              title="Silenciar solo este clip (la pista sigue igual)">
              <Icon name={clip.muted ? 'volume_off' : 'volume_up'} size={15} />
              Mute
            </button>
            {isVideo && (
              <>
                <label className="ed-prop">
                  Encuadre
                  <FlipSelect
                    value={frameOf(clip)}
                    options={FRAME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => onChangeFrame(v)}
                  />
                </label>
                <label className="ed-prop">
                  Aparición
                  <FlipSelect
                    value={clip.appear || 'none'}
                    options={APPEAR_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => onChangeFx({ appear: v })}
                  />
                </label>
                <label className="ed-prop">
                  Salida
                  <FlipSelect
                    value={clip.exit || 'none'}
                    options={EXIT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => onChangeFx({ exit: v })}
                  />
                </label>
                <label className="ed-prop">
                  Filtros
                  <FlipSelect
                    value={clip.look || 'none'}
                    options={LOOK_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => onChangeFx({ look: v })}
                  />
                </label>
              </>
            )}
          </div>
        )
      ) : !isVideo ? (
        <div className="ed-crops-empty">{isAudio ? 'El recorte aplica a clips de vídeo.' : 'Selecciona un clip de vídeo para ver sus encuadres.'}</div>
      ) : (
        <>
          {dual && (
            <div className="ed-crops-tabs" role="tablist" aria-label="Pista de encuadre">
              <button type="button" className={`ed-tab ${track === 1 ? 'on' : ''}`} onClick={() => setTrack(1)}>
                Pista 1
              </button>
              <button type="button" className={`ed-tab ${track === 2 ? 'on' : ''}`} onClick={() => setTrack(2)}>
                Pista 2
              </button>
            </div>
          )}
          <div className="ed-crops-count">{kfs.length} encuadre{kfs.length === 1 ? '' : 's'}</div>
          <div className="ed-crops-list">
            {kfs.length === 0 && <div className="ed-crops-empty">Sin encuadres. Arrastra el recuadro en el Main o pulsa Encuadre en la timeline.</div>}
            {kfs.map((k, i) => {
              const local = k.t - clip.in_point
              const hidden = hiddenKf?.has(k.id)
              const panMode = k.pan_mode === 'direct' ? 'direct' : 'smooth'
              return (
                <div key={k.id || i}
                  className={`ed-crop-row ${selKfId === k.id ? 'sel' : ''} ${panMode}`}
                  style={{ borderLeftColor: kfColor(i) }}
                  onClick={() => { onSelect(k.id); onSeek(clip.start + local) }}>
                  <span className={`ed-crop-swatch ${panMode}`} style={{ background: kfColor(i) }} />
                  <div className="ed-crop-info">
                    <span className="ed-crop-time">{fmt(local)}</span>
                    <span className="ed-crop-type">{typeLabel}</span>
                  </div>
                  <PanModeToggle
                    value={panMode}
                    onChange={(mode) => { onSelect(k.id); onPanMode?.(k, mode) }}
                  />
                  <button className="icon-btn" title={hidden ? 'Mostrar en Main' : 'Ocultar en Main'}
                    onClick={(e) => { e.stopPropagation(); onToggleHidden(k.id) }}>
                    <Icon name={hidden ? 'visibility_off' : 'visibility'} size={14} />
                  </button>
                  <button className="icon-btn" title="Eliminar encuadre"
                    onClick={(e) => { e.stopPropagation(); onDelete(k) }}>
                    <Icon name="delete" size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
