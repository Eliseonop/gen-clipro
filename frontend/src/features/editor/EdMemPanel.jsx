// Panel de diagnóstico de memoria. Solo aparece con `?debug=mem` en la URL.
//
// Suma lo que el editor retiene (cachés registradas en lib/lruBytes, historial de
// undo, elementos <video>/<audio> vivos) y lo que retiene el backend (RSS del
// proceso y modelos de IA cargados), para medir antes y después de cada cambio
// (docs/OPTIMIZACION_MEMORIA.md, Fase 0).
import { useEffect, useState } from 'react'
import { cacheStats } from '../../lib/lruBytes'
import { getMemoryDiagnostics, unloadModels } from '../../services/api'

const mb = (b) => `${((b || 0) / (1024 * 1024)).toFixed(1)} MB`

function snapshot(mediaEls) {
  const heap = performance?.memory
  return {
    heap: heap ? { used: heap.usedJSHeapSize, total: heap.totalJSHeapSize } : null,
    videos: document.querySelectorAll('video').length,
    audios: document.querySelectorAll('audio').length,
    pool: mediaEls?.current?.size || 0,
    filters: document.querySelectorAll('filter[id^="vy-adj-"]').length,
    caches: cacheStats(),
  }
}

export default function EdMemPanel({ mediaEls }) {
  const [front, setFront] = useState(() => snapshot(mediaEls))
  const [back, setBack] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      setFront(snapshot(mediaEls))
      try { const r = await getMemoryDiagnostics(); if (alive) setBack(r) } catch { if (alive) setBack(null) }
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => { alive = false; clearInterval(id) }
  }, [mediaEls])

  async function unload() {
    setBusy(true)
    try { setBack(await unloadModels()) } catch { /* el panel es solo diagnóstico */ }
    setBusy(false)
  }

  const cacheTotal = front.caches.reduce((s, c) => s + c.bytes, 0)
  return (
    <div className="ed-mem-panel" role="status">
      <strong>Memoria</strong>
      {front.heap && <div>Heap JS: {mb(front.heap.used)} / {mb(front.heap.total)}</div>}
      <div>Medios: {front.videos} vídeo · {front.audios} audio · pool {front.pool}</div>
      <div>Filtros SVG: {front.filters}</div>
      <div>Cachés: {mb(cacheTotal)}</div>
      <ul>
        {front.caches.map((c) => (
          <li key={c.name}>
            {c.name}: {c.entries} · {mb(c.bytes)}{c.maxBytes ? ` / ${mb(c.maxBytes)}` : ''}
          </li>
        ))}
      </ul>
      <strong>Backend</strong>
      {back ? (
        <>
          <div>RSS: {mb(back.rss_bytes)} · descarga tras {back.idle_minutes} min</div>
          <ul>
            {back.models.map((m) => (
              <li key={m.name}>
                {m.name}{m.heavy ? ' (pesado)' : ''}{m.busy ? ' · en uso' : ` · ${Math.round(m.idle_s)} s sin uso`}
              </li>
            ))}
            {!back.models.length && <li>ningún modelo cargado</li>}
          </ul>
          <button type="button" className="ed-btn" disabled={busy} onClick={unload}>Descargar modelos</button>
        </>
      ) : <div>sin datos</div>}
    </div>
  )
}
