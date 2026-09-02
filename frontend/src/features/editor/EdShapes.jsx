import Icon from '../../components/Icon'
import { SHAPE_CATALOG, SHAPE_DEFAULT_DUR, dragShapePayload, svgPreview } from '../../lib/shapes'

export default function EdShapes({ onAdd, onDragInfo }) {
  const di = onDragInfo || (() => {})
  return (
    <div className="ed-mat-list ed-shape-lib">
      {SHAPE_CATALOG.map((cat) => (
        <section key={cat.id} className="ed-shape-cat">
          <div className="ed-fx-label">{cat.label}</div>
          <div className="ed-shape-grid">
            {cat.items.map((item) => (
              <button
                key={item.type}
                type="button"
                className="ed-shape-card"
                title={item.label}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-material', dragShapePayload(item))
                  e.dataTransfer.effectAllowed = 'copy'
                  di({ kind: 'shape', duration: SHAPE_DEFAULT_DUR, name: item.label })
                }}
                onDragEnd={() => di(null)}
                onClick={() => onAdd?.('shape', item)}
              >
                <span
                  className="ed-shape-thumb"
                  dangerouslySetInnerHTML={{ __html: `<svg viewBox="-8 -8 116 116" overflow="visible" aria-hidden="true">${svgPreview(item.type)}</svg>` }}
                />
                <span className="ed-shape-name">
                  <Icon name={item.icon} size={13} /> {item.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
