// Panel IZQUIERDO de Paper Animator: la tab "Paper" del material.
// Equivalente a MotionElements — es donde se elige QUÉ se anima; el cómo está en
// el panel derecho.
//
// Sustituye a la "drop zone" del motor original, que solo aceptaba archivos
// locales: aquí lo primero son las imágenes que ya están en el proyecto, que era
// el caso de uso real (el botón ✨ de la tarjeta de imagen abría el modal).

import { useRef } from 'react'
import Icon from '../../components/Icon'
import { bustUrl } from '../editor/MaterialClipGrid'

export default function PaperElements({ project, paper, onGoPaper }) {
  const { st, loadImage, clearImage, busy, error, setError, exportJob, exportToMaterial } = paper
  const fileRef = useRef(null)
  const images = project.images || []

  // Se pasa también el descriptor del material: "Quitar fondo" trabaja sobre el
  // ARCHIVO del proyecto (el job del backend), no sobre los píxeles del lienzo.
  function pick(image) {
    onGoPaper?.()
    loadImage(bustUrl(image.url, image), image.label || image.name || image.filename, {
      asset_id: String(image.id),
      filename: image.filename,
    })
  }

  return (
    <div className="ed-mat-list paper-elements">
      <div className="motion-panel-title">Paper · Imagen</div>

      {st.hasImage ? (
        <div className="paper-current">
          <Icon name="draw" size={16} />
          <span className="paper-current-name" title={st.imageName}>{st.imageName || 'Imagen'}</span>
          <button type="button" className="ed-btn" title="Quitar la imagen y su animación" onClick={clearImage}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : (
        <p className="motion-start-hint">
          Elige una imagen del proyecto o sube una. La original no se modifica:
          el resultado se guarda como un vídeo nuevo en el material.
        </p>
      )}

      <div className="paper-actions">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { onGoPaper?.(); loadImage(f) }
            e.target.value = ''
          }}
        />
        <button type="button" className="ed-btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> Subir imagen
        </button>
        {st.hasImage && (
          exportJob?.status === 'running'
            ? <span className="ed-bg-status run"><Icon name="progress_activity" size={14} /><span>{exportJob.message}</span></span>
            : (
              <button type="button" className="ed-btn primary" onClick={exportToMaterial}>
                <Icon name="save" size={14} /> Guardar en el material
              </button>
            )
        )}
      </div>

      {busy && <div className="ed-bg-status run"><Icon name="progress_activity" size={14} /><span>{busy}</span></div>}
      {error && (
        <div className="ed-bg-status err">
          <Icon name="error" size={14} />
          <span>{error}</span>
          <button type="button" className="ed-btn" onClick={() => setError('')}>Cerrar</button>
        </div>
      )}

      <div className="motion-panel-title">Imágenes del proyecto</div>
      {images.length === 0 ? (
        <p className="motion-start-hint">No hay imágenes todavía. Añádelas desde la pestaña <b>Imagen</b>.</p>
      ) : (
        <div className="paper-img-grid">
          {images.map((im) => (
            <button
              key={im.id}
              type="button"
              className="paper-img-cell"
              title={im.label || im.name || im.filename}
              onClick={() => pick(im)}
            >
              <img src={bustUrl(im.url, im)} alt="" draggable={false} />
              <span>{im.label || im.name || im.filename}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
