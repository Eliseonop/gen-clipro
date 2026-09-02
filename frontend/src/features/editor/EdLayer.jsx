import Icon from '../../components/Icon'

const ACTIONS = [
  { id: 'back', icon: 'flip_to_back', label: 'Al fondo', title: 'Detrás de todos en esta pista' },
  { id: 'backward', icon: 'arrow_downward', label: 'Atrás', title: 'Una capa atrás' },
  { id: 'forward', icon: 'arrow_upward', label: 'Adelante', title: 'Una capa adelante' },
  { id: 'front', icon: 'flip_to_front', label: 'Al frente', title: 'Delante de todos en esta pista' },
]

export default function EdLayer({ info, onMove }) {
  const count = info?.count || 1
  const index = info?.index || 1
  return (
    <div className="ed-layer">
      <div className="ed-layer-head">
        <span>Capa</span>
        <strong>{index} de {count}</strong>
      </div>
      <p className="ed-layer-hint">1 es el fondo de esta pista. El número más alto queda delante en el resultado.</p>
      <div className="ed-layer-btns">
        {ACTIONS.map((a) => {
          const disabled = a.id === 'back' || a.id === 'backward' ? !info?.canBack : !info?.canFront
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              title={a.title}
              onClick={() => onMove?.(a.id)}>
              <Icon name={a.icon} size={15} />
              {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
