import Icon from '../../components/Icon'
import { saveLibraryItem } from '../../services/api'

export default function AudioProjectList({ audios, projectId, onSaved }) {
  async function save(a) {
    try {
      await saveLibraryItem({ project_id: projectId, resource_type: 'audio', ident: a.id })
      onSaved?.()
    } catch (e) {
      window.alert(e.message)
    }
  }

  return (
    <section className="card">
      <h3>Audios del proyecto</h3>
      {(!audios || audios.length === 0)
        ? <div className="empty">Aún no hay audios. Genera el primero.</div>
        : (
          <div className="audio-list">
            {audios.slice().reverse().map((a) => (
              <div className="audio-item" key={a.id}>
                <div className="audio-meta">
                  <strong>{a.label || a.filename}</strong>
                  <span className="muted">
                    {a.origin === 'youtube' ? 'YouTube' : (a.voice || a.engine || 'audio')}
                    {a.duration != null ? ` · ${a.duration}s` : ''}
                  </span>
                </div>
                <audio src={a.url} controls preload="metadata" />
                <div className="audio-item-actions">
                  <button className="ghost small" type="button" onClick={() => save(a)} title="Guardar en la biblioteca">
                    <Icon name="bookmark_border" size={16} /> Guardar
                  </button>
                  <a className="ghost small dl" href={a.url} download><Icon name="download" size={16} /> Descargar</a>
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}
