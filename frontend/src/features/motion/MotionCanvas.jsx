import { useEffect, useRef, useState, useCallback } from 'react'
import { motionPreviewUrl } from '../../services/api'

// Preview del motion graphic: carga el HTML autocontenido del backend (mismo que
// usa el render → paridad) en un iframe y lo reconstruye en vivo con __rebuild(comp)
// al editar, sin recargar GSAP/fuente. Encima dibuja una capa de selección/arrastre
// (como un editor gráfico) que lee __hitboxes() del runtime. Expone seek/play/pause.
export default function MotionCanvas({
  projectId, comp, onTime, onControls,
  selLayerId = null, onSelectLayer, onMoveLayer,
}) {
  const wrapRef = useRef(null)
  const frameRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState(1)
  const [boxes, setBoxes] = useState([])
  const compRef = useRef(comp)
  compRef.current = comp
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const dragRef = useRef(null)

  const cid = comp?.id || null

  // Carga inicial del iframe (una vez por composición id).
  useEffect(() => {
    if (!projectId || !cid) return
    let cancelled = false
    setReady(false)
    fetch(motionPreviewUrl(projectId, cid))
      .then((r) => r.text())
      .then((html) => {
        if (cancelled || !frameRef.current) return
        frameRef.current.srcdoc = html
      })
      .catch(() => { /* noop */ })
    return () => { cancelled = true }
  }, [projectId, cid])

  const win = () => frameRef.current?.contentWindow

  const refreshBoxes = useCallback(() => {
    try {
      const hb = win()?.__hitboxes?.()
      if (Array.isArray(hb)) setBoxes(hb)
    } catch { /* noop */ }
  }, [])

  const onLoad = useCallback(() => {
    const w = win()
    if (!w) return
    const wait = (n) => {
      if (w.__motionReady) {
        try { w.__rebuild(compRef.current) } catch { /* noop */ }
        setReady(true)
        refreshBoxes()
      } else if (n > 0) {
        setTimeout(() => wait(n - 1), 30)
      }
    }
    wait(60)
  }, [refreshBoxes])

  // Reconstrucción en vivo al cambiar la composición.
  useEffect(() => {
    if (!ready) return
    const w = win()
    if (w && w.__rebuild) { try { w.__rebuild(comp) } catch { /* noop */ } }
    refreshBoxes()
  }, [comp, ready, refreshBoxes])

  // Escala el lienzo (p.ej. 1080×1920) para que quepa en el contenedor.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !comp) return
    const fit = () => {
      const rect = el.getBoundingClientRect()
      const s = Math.min(rect.width / comp.width, rect.height / comp.height)
      setScale(s > 0 && isFinite(s) ? s : 1)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [comp?.width, comp?.height])

  // Eventos de tiempo desde el iframe.
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data
      if (d && d.type === 'motion' && d.event === 'time') onTime?.(d.time, d.duration)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onTime])

  // Expone controles al padre.
  useEffect(() => {
    if (!onControls) return
    onControls({
      seek: (t) => { try { win()?.__seek(t) } catch { /* noop */ } finally { refreshBoxes() } },
      play: (from) => { try { win()?.__play(from) } catch { /* noop */ } },
      pause: () => { try { win()?.__pause() } catch { /* noop */ } finally { refreshBoxes() } },
      isPlaying: () => { try { return !!win()?.__isPlaying?.() } catch { return false } },
      setLoop: (v) => { try { win().__loop = !!v } catch { /* noop */ } },
      ready,
    })
  }, [onControls, ready, refreshBoxes])

  // --- Arrastre de una capa (delta de pantalla / escala → px de lienzo) ---
  const beginDrag = useCallback((e, id) => {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer?.(id)
    dragRef.current = { id, lastX: e.clientX, lastY: e.clientY, moved: false }
    const move = (ev) => {
      const d = dragRef.current
      if (!d) return
      const s = scaleRef.current || 1
      const ddx = (ev.clientX - d.lastX) / s
      const ddy = (ev.clientY - d.lastY) / s
      if (!d.moved && Math.abs(ev.clientX - d.lastX) + Math.abs(ev.clientY - d.lastY) < 2) return
      d.moved = true
      d.lastX = ev.clientX
      d.lastY = ev.clientY
      onMoveLayer?.(d.id, ddx, ddy)
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      refreshBoxes()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [onSelectLayer, onMoveLayer, refreshBoxes])

  const editable = !!onMoveLayer || !!onSelectLayer

  return (
    <div className="motion-canvas-wrap" ref={wrapRef}>
      <div
        className="motion-canvas-frame"
        style={{
          width: comp?.width, height: comp?.height,
          transform: `scale(${scale})`,
        }}
      >
        <iframe
          ref={frameRef}
          title="Motion preview"
          onLoad={onLoad}
          style={{ width: comp?.width, height: comp?.height, border: 0, display: 'block', background: 'transparent' }}
          sandbox="allow-scripts allow-same-origin"
        />
        {editable && ready && (
          <div
            className="motion-select-layer"
            style={{ width: comp?.width, height: comp?.height }}
            onPointerDown={() => onSelectLayer?.(null)}
          >
            {boxes.filter((b) => b.on !== false).map((b) => (
              <div
                key={b.id}
                className={`motion-hitbox ${b.id === selLayerId ? 'sel' : ''}`}
                style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                onPointerDown={(e) => beginDrag(e, b.id)}
              />
            ))}
          </div>
        )}
      </div>
      {!ready && <div className="motion-canvas-loading">Cargando preview…</div>}
    </div>
  )
}
