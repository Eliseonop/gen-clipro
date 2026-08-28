import Icon from '../../components/Icon'

// Campo numérico etiquetado (opciones avanzadas del heatmap).
function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} {...rest} />
    </label>
  )
}

// Formulario de carga: URL de YouTube + opciones avanzadas + botón de análisis.
export default function VideoAnalyzeForm({ url, setUrl, analyzing, onAnalyze, showAdvanced, setShowAdvanced, opts, setOpts }) {
  return (
    <section className="card">
      <div className="card-header">
        <h3><Icon name="movie" size={18} /> Vídeo de YouTube</h3>
      </div>
      <div className="row">
        <input
          className="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
        />
      </div>
      <div className="actions">
        <button className="primary" onClick={onAnalyze} disabled={analyzing}>
          {analyzing ? 'Cargando…' : '▶ Cargar vídeo'}
        </button>
      </div>
      <button className="link" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '▾' : '▸'} Opciones avanzadas (heatmap)
      </button>
      {showAdvanced && (
        <div className="advanced">
          <Field label="Umbral heatmap" value={opts.min_score} min={0} max={1} step={0.05}
            onChange={(v) => setOpts({ ...opts, min_score: v })} />
          <Field label="Máx. clips" value={opts.max_clips} min={1} max={50} step={1}
            onChange={(v) => setOpts({ ...opts, max_clips: v })} />
          <Field label="Duración máx (s)" value={opts.max_duration} min={5} max={600} step={5}
            onChange={(v) => setOpts({ ...opts, max_duration: v })} />
          <Field label="Padding (s)" value={opts.padding} min={0} max={60} step={1}
            onChange={(v) => setOpts({ ...opts, padding: v })} />
        </div>
      )}
    </section>
  )
}
