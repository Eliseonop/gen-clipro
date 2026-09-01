// Controles de síntesis de voz: motor, voz, estilo Gemini, mezcla Kokoro y ajustes.
export default function TtsControls({
  engines, engine, setEngine, voices, voice, setVoice, voice2, setVoice2, isKokoro, isGemini,
  style, setStyle, blend, setBlend, speed, setSpeed, pause, setPause, name, setName,
}) {
  return (
    <div className="tts-controls">
      <label className="field"><span>Motor</span>
        <select className="select" value={engine} onChange={(e) => setEngine(e.target.value)}>
          {engines.map((e) => (
            <option key={e.id} value={e.id} disabled={!e.available && e.id !== 'gemini'}>
              {e.label}{e.available || e.id === 'gemini' ? '' : ' — no instalado'}
            </option>
          ))}
        </select>
      </label>
      <label className="field"><span>Voz</span>
        <select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      {isGemini && (
        <label className="field"><span>Estilo</span>
          <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="documentary">Documental</option>
            <option value="close">Cercano</option>
          </select>
        </label>
      )}
      <details className="ed-narrator-more">
        <summary>Ajustes</summary>
        <div className="ed-narrator-more-body">
          {isKokoro && (
            <label className="field"><span>Mezclar con (voz 2)</span>
              <select className="select" value={voice2} onChange={(e) => setVoice2(e.target.value)}>
                <option value="">— sin mezcla —</option>
                {voices.filter((v) => v.id !== voice).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
          )}
          {isKokoro && voice2 && (
            <label className="field"><span>Mezcla: {Math.round(blend * 100)}% / {Math.round((1 - blend) * 100)}%</span>
              <input type="range" min="0" max="1" step="0.05" value={blend}
                onChange={(e) => setBlend(Number(e.target.value))} />
            </label>
          )}
          {!isGemini && (
            <>
              <label className="field"><span>Velocidad: {speed.toFixed(2)}×</span>
                <input type="range" min="0.5" max="1.5" step="0.05" value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))} />
              </label>
              <label className="field"><span>Pausa entre frases: {pause.toFixed(2)}s</span>
                <input type="range" min="0" max="1" step="0.05" value={pause}
                  onChange={(e) => setPause(Number(e.target.value))} />
              </label>
            </>
          )}
          <label className="field"><span>Nombre (opcional)</span>
            <input className="time-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="intro" />
          </label>
        </div>
      </details>
    </div>
  )
}
