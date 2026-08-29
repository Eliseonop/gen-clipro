import Icon from './Icon'

export default function ToolModal({ title, icon, onClose, children, wide }) {
  return (
    <div
      className="modal-overlay tool-overlay"
      onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={`modal tool-modal${wide ? ' tool-modal-wide' : ''}`}>
        <div className="modal-head">
          <h3>
            {icon ? <Icon name={icon} size={18} /> : null}
            {title}
          </h3>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <Icon name="close" size={22} />
          </button>
        </div>
        <div className="tool-modal-body">{children}</div>
      </div>
    </div>
  )
}
