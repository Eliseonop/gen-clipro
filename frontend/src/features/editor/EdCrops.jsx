import Icon from '../../components/Icon'
import { fmt } from '../../lib/utils'
import { kfColor } from '../../lib/panning'

// Panel "Posiciones del recorte": lista administrable de los encuadres
// (keyframes) del clip seleccionado. Va pegado a la timeline.
export default function EdCrops({ clip, selKfId, hiddenKf, onSelect, onToggleHidden, onDelete, onSeek, onAdd }) {
  const kfs = clip?.kind === 'video' ? [...(clip.reframe?.keyframes || [])].sort((a, b) => a.t - b.t) : []
  const typeLabel = clip?.reframe?.dual_crop
    ? (clip.reframe.split_orientation === 'horizontal' ? 'Dividido L/R' : 'Dividido T/B')
    : 'Vertical'

  return (
    <div className="ed-crops">
      <div className="ed-crops-head">
        <div className="ed-crops-title">Posiciones del recorte</div>
        <button className="ed-add-btn" title="Añadir encuadre en el cursor" onClick={onAdd} disabled={!clip || clip.kind !== 'video'}>
          <Icon name="add_location_alt" size={15} />
        </button>
      </div>

      {!clip || clip.kind !== 'video' ? (
        <div className="ed-crops-empty">Selecciona un clip de vídeo para ver sus encuadres.</div>
      ) : (
        <>
          <div className="ed-crops-count">{kfs.length} encuadre{kfs.length === 1 ? '' : 's'}</div>
          <div className="ed-crops-list">
            {kfs.length === 0 && <div className="ed-crops-empty">Sin encuadres. Pulsa “+” o arrastra el recuadro en el Main.</div>}
            {kfs.map((k, i) => {
              const local = k.t - clip.in_point
              const hidden = hiddenKf?.has(k.id)
              return (
                <div key={k.id || i}
                  className={`ed-crop-row ${selKfId === k.id ? 'sel' : ''}`}
                  style={{ borderLeftColor: kfColor(i) }}
                  onClick={() => { onSelect(k.id); onSeek(clip.start + local) }}>
                  <span className="ed-crop-swatch" style={{ background: kfColor(i) }} />
                  <div className="ed-crop-info">
                    <span className="ed-crop-time">{fmt(local)}</span>
                    <span className="ed-crop-type">{typeLabel}</span>
                  </div>
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
