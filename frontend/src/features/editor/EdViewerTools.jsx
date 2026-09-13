import { useState } from 'react'
import FlipSelect from '../../components/FlipSelect'
import { FPS_CHOICES } from '../../lib/projectFps'
import {
  ASPECTS, RESOLUTIONS, DIM_MAX, DIM_MIN, aspectOf, evenDim, resolutionOf,
  withAspect, withMediaAspect, withResolution,
} from '../../lib/projectFormat'
import { NumberStepper } from './EdTransform'

const ZOOM_MIN = 25
const ZOOM_MAX = 400
const ZOOM_STEP = 5

// Controles del área de visualización, en la fila del reproductor (.ed-transport):
// formato de salida (aspecto, resolución, fps) y zoom visual (el zoom no toca el
// clip ni el export). Cada editor (Main / Clip) tiene su propio estado.
export default function EdViewerTools({
  zoom, onZoom, width, height, onSize, fps, onFps, originalSize,
}) {
  const [custom, setCustom] = useState(null)   // {w, h} mientras se edita el tamaño a mano
  const pct = Math.round((zoom ?? 1) * 100)
  const setPct = (n) => {
    const v = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Number(n) || 0)))
    onZoom(v / 100)
  }

  const aspectId = aspectOf(width, height)
  const resId = resolutionOf(width, height)
  const sizeLabel = `${width}×${height}`

  const aspectOptions = [
    ...(originalSize ? [{ value: 'original', label: 'Original' }] : []),
    ...ASPECTS.map((a) => ({ value: a.id, label: a.id })),
    ...(aspectId === 'custom' ? [{ value: 'custom', label: sizeLabel }] : []),
    { value: 'edit', label: 'Personalizado…' },
  ]
  const resOptions = [
    ...RESOLUTIONS.map((r) => ({ value: r.id, label: r.label })),
    ...(resId === 'custom' ? [{ value: 'custom', label: `${Math.min(width, height)}p` }] : []),
    { value: 'edit', label: 'Personalizado…' },
  ]

  function apply(size) {
    if (size.w !== width || size.h !== height) onSize(size.w, size.h)
  }

  function pickAspect(v) {
    if (v === 'edit') { setCustom({ w: width, h: height }); return }
    if (v === 'original') {
      const m = originalSize?.()
      if (m) apply(withMediaAspect(m.w, m.h, width, height))
      return
    }
    if (v !== 'custom') apply(withAspect(v, width, height))
  }

  function pickRes(v) {
    if (v === 'edit') { setCustom({ w: width, h: height }); return }
    if (v !== 'custom') apply(withResolution(Number(v), width, height))
  }

  function commitCustom() {
    apply({ w: evenDim(custom.w), h: evenDim(custom.h) })
    setCustom(null)
  }

  return (
    <div className="ed-viewer-tools" onPointerDown={(e) => e.stopPropagation()}>
      {onSize && (custom ? (
        <div className="ed-vt-custom" title={`Tamaño de salida (${DIM_MIN}–${DIM_MAX} px, se redondea a par)`}>
          <input
            type="number" min={DIM_MIN} max={DIM_MAX} step={2} value={custom.w} autoFocus
            aria-label="Ancho"
            onChange={(e) => setCustom((c) => ({ ...c, w: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCustom(); else if (e.key === 'Escape') setCustom(null) }}
          />
          <span>×</span>
          <input
            type="number" min={DIM_MIN} max={DIM_MAX} step={2} value={custom.h}
            aria-label="Alto"
            onChange={(e) => setCustom((c) => ({ ...c, h: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCustom(); else if (e.key === 'Escape') setCustom(null) }}
          />
          <button type="button" className="ed-vt-reset" onClick={commitCustom}>OK</button>
          <button type="button" className="ed-vt-reset" onClick={() => setCustom(null)} aria-label="Cancelar">✕</button>
        </div>
      ) : (
        <>
          <FlipSelect
            className="mini ed-vt-sel"
            value={aspectId}
            onChange={pickAspect}
            title={`Relación de aspecto (${sizeLabel})`}
            options={aspectOptions}
          />
          <FlipSelect
            className="mini ed-vt-sel"
            value={resId}
            onChange={pickRes}
            title={`Resolución de salida (${sizeLabel})`}
            options={resOptions}
          />
        </>
      ))}
      {onFps && (
        <FlipSelect
          className="mini ed-vt-sel"
          value={fps}
          onChange={(v) => onFps(Number(v))}
          title="Fotogramas por segundo del proyecto"
          options={FPS_CHOICES.map((n) => ({ value: n, label: `${n} fps` }))}
        />
      )}
      <div className="ed-vt-zoom" title="Zoom del canvas (solo visual, no afecta a la exportación)">
        <NumberStepper
          value={pct}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          suffix="%"
          ariaLabel="Zoom del canvas"
          onChange={setPct}
        />
        <button
          type="button"
          className="ed-vt-reset"
          title="Restablecer a 100%"
          aria-label="Restablecer zoom a 100%"
          onClick={() => onZoom(1)}
        >
          100%
        </button>
      </div>
    </div>
  )
}
