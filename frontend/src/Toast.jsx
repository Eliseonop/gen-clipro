import { useEffect } from 'react'
import Icon from './Icon'

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => onClose?.(), toast.duration || 4000)
    return () => clearTimeout(id)
  }, [toast, onClose])

  if (!toast) return null

  const isError = toast.type === 'error'
  const isSuccess = toast.type === 'success'

  return (
    <div className={`toast-notification ${isError ? 'error' : isSuccess ? 'success' : 'info'}`}>
      <Icon name={isError ? 'error_outline' : isSuccess ? 'check_circle' : 'info'} size={18} />
      <span className="toast-msg">{toast.message}</span>
      <button className="icon-btn" onClick={onClose} title="Cerrar"><Icon name="close" size={16} /></button>
    </div>
  )
}
