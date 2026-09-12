import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { uploadVideo } from '../../services/api'
import { bustUrl } from './MaterialClipGrid'

// Paper Animator: abre la herramienta (paperima recortado) embebida en un
// iframe. El editor solo le pasa la imagen seleccionada y recibe de vuelta el
// vídeo/animación exportado, que sube al material (Vídeos). La imagen original
// no se toca. Comunicación por postMessage (ver src/modules/embed.js en paperima):
//   iframe -> { source:'paperima', type:'ready' }
//   host   -> { source:'paperima-host', type:'load-image', blob, name, aspectRatio }
//   iframe -> { source:'paperima', type:'result', blob, ext, mime, name }
export default function PaperAnimatorModal({ projectId, image, onClose, onDone }) {
  const iframeRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | uploading | error
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function onMsg(ev) {
      const data = ev.data
      if (!data || data.source !== 'paperima') return

      if (data.type === 'ready') {
        try {
          const res = await fetch(bustUrl(image.url, image))
          const blob = await res.blob()
          if (!alive) return
          const name = image.filename || image.name || 'imagen.png'
          iframeRef.current?.contentWindow?.postMessage(
            { source: 'paperima-host', type: 'load-image', blob, name, aspectRatio: '9/16' },
            '*',
          )
          setStatus('ready')
        } catch {
          if (alive) { setError('No se pudo cargar la imagen en la herramienta.'); setStatus('error') }
        }
      } else if (data.type === 'result') {
        setStatus('uploading')
        try {
          const ext = String(data.ext || '.webm').replace(/^\./, '')
          const base = String(image.label || image.name || image.filename || 'paper')
            .replace(/\.[^.]+$/, '')
          const file = new File([data.blob], `${base}-paper.${ext}`, {
            type: data.mime || data.blob.type || 'video/webm',
          })
          await uploadVideo(projectId, file)
          if (!alive) return
          onDone?.()
          onClose?.()
        } catch (e) {
          if (alive) { setError(e?.message || 'No se pudo guardar el vídeo.'); setStatus('error') }
        }
      }
    }

    window.addEventListener('message', onMsg)
    return () => { alive = false; window.removeEventListener('message', onMsg) }
  }, [image, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const overlayMsg = status === 'uploading' ? 'Guardando en el material…' : (status === 'error' ? error : '')

  return (
    <div className="modal-overlay" onPointerDown={(e) => e.target === e.currentTarget && status !== 'uploading' && onClose?.()}>
      <div className="modal" style={{ width: '95vw', maxWidth: 1200, height: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <h3><Icon name="auto_awesome" size={20} /> Paper Animator</h3>
          <button className="icon-btn" onClick={() => status !== 'uploading' && onClose?.()} title="Cerrar">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, marginTop: 10 }}>
          <iframe
            ref={iframeRef}
            src="/paper-animator/index.html?embed=1"
            title="Paper Animator"
            style={{ width: '100%', height: '100%', border: 0, borderRadius: 8, background: '#0b0e17', display: 'block' }}
          />
          {overlayMsg && (
            <div
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(8,10,16,0.72)', borderRadius: 8, textAlign: 'center', padding: 24,
                color: status === 'error' ? '#f87171' : '#e5e7eb', fontSize: 15, gap: 10,
              }}
            >
              {status === 'uploading' && <Icon name="progress_activity" size={20} />}
              <span>{overlayMsg}</span>
              {status === 'error' && (
                <button className="ghost" style={{ marginLeft: 12 }} onClick={() => onClose?.()}>Cerrar</button>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Ajusta la animación y pulsa <b>Guardar en el editor</b>. La imagen original no se modifica.
          </span>
          <button className="ghost" onClick={() => status !== 'uploading' && onClose?.()} disabled={status === 'uploading'}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
