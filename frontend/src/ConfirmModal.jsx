import Icon from './Icon'

export default function ConfirmModal({
  open,
  title = '¿Estás seguro?',
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = true,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className="modal modal-confirm">
        <div className="modal-head">
          <h3><Icon name={danger ? 'warning' : 'help_outline'} size={20} /> {title}</h3>
          <button className="icon-btn" onClick={onCancel} title="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        {message && (
          <div className="modal-body" style={{ marginTop: 8 }}>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{message}</p>
          </div>
        )}
        <div className="modal-actions" style={{ justifyContent: 'flex-end', marginTop: 20, gap: 10 }}>
          <button className="ghost" onClick={onCancel}>{cancelText}</button>
          <button className={`primary ${danger ? 'danger-btn' : ''}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
