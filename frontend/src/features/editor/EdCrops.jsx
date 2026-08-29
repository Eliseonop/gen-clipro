import { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import PanModeToggle from '../../components/PanModeToggle'
import { fmt } from '../../lib/utils'
import { kfColor } from '../../lib/panning'
import { APPEAR_OPTIONS, EXIT_OPTIONS, LOOK_OPTIONS } from '../../lib/clipFx'
import { FRAME_OPTIONS, frameOf } from '../../lib/clipLayout'

// Panel junto a la timeline: recorte (keyframes) y propiedades del clip de vídeo.
export default function EdCrops({ clip, selKfId, hiddenKf, onSelect, onToggleHidden, onDelete, onSeek, onPanMode, onChangeFx, onChangeFrame }) {
  const [tab, setTab] = useState('crop')
  const [track, setTrack] = useState(1)
  const dual = !!(clip?.kind === 'video' && clip.reframe?.dual_crop)
  useEffect(() => { setTrack(1) }, [clip?.id])
  const kfs = clip?.kind === 'video'
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
  const isVideo = clip?.kind === 'video'

  return (
    <div className="ed-crops">
      <div className="ed-crops-tabs">
        <button type="button" className={`ed-tab ${tab === 'crop' ? 'on' : ''}`} onClick={() => setTab('crop')}>
          Posición de recorte
        </button>
        <button type="button" className={`ed-tab ${tab === 'props' ? 'on' : ''}`} onClick={() => setTab('props')}>
          Propiedades
        </button>
      </div>

      {tab === 'props' ? (
        !isVideo ? (
          <div className="ed-crops-empty">Selecciona un clip de vídeo para ver sus propiedades.</div>
        ) : (
          <div className="ed-props">
            <label className="ed-prop">
              Encuadre
              <select className="select" value={frameOf(clip)} onChange={(e) => onChangeFrame(e.target.value)}>
                {FRAME_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="ed-prop">
              Aparición
              <select className="select" value={clip.appear || 'none'} onChange={(e) => onChangeFx({ appear: e.target.value })}>
                {APPEAR_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="ed-prop">
              Salida
              <select className="select" value={clip.exit || 'none'} onChange={(e) => onChangeFx({ exit: e.target.value })}>
                {EXIT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="ed-prop">
              Filtros
              <select className="select" value={clip.look || 'none'} onChange={(e) => onChangeFx({ look: e.target.value })}>
                {LOOK_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>
        )
      ) : !isVideo ? (
        <div className="ed-crops-empty">Selecciona un clip de vídeo para ver sus encuadres.</div>
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
