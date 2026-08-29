// Radio de dos modos: suave (círculo) / directo (cuadrado). Sin letras.
export default function PanModeToggle({ value, onChange, disabled }) {
  const mode = value === 'direct' ? 'direct' : 'smooth'
  return (
    <div className="pan-mode-tog" role="radiogroup" aria-label="Cómo se llega a este encuadre">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'smooth'}
        disabled={disabled}
        className={`pan-mode-btn ${mode === 'smooth' ? 'on' : ''}`}
        title="Suave: interpola hasta este encuadre"
        onClick={(e) => { e.stopPropagation(); onChange('smooth') }}
      >
        <span className="pan-glyph circle" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'direct'}
        disabled={disabled}
        className={`pan-mode-btn ${mode === 'direct' ? 'on' : ''}`}
        title="Directo: salta a este encuadre"
        onClick={(e) => { e.stopPropagation(); onChange('direct') }}
      >
        <span className="pan-glyph square" />
      </button>
    </div>
  )
}
