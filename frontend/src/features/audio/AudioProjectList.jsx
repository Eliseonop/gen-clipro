import Icon from '../../components/Icon'

// Lista de audios generados del proyecto (reproducción + descarga).
export default function AudioProjectList({ audios }) {
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
                  <strong>{a.filename}</strong>
                  <span className="muted">{a.voice} · {a.speed}× · {a.duration}s</span>
                </div>
                <audio src={a.url} controls preload="metadata" />
                <a className="ghost small dl" href={a.url} download><Icon name="download" size={16} /> Descargar</a>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}
