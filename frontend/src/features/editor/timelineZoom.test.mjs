import assert from 'node:assert/strict'
import { zoomByDrag, anchorScroll, clampPps, maxPps, minPps } from './timelineScale.js'

const dur = 120        // 2 min de timeline
const viewW = 900      // ancho visible
const fps = 30
const start = 60       // pps inicial

// Arrastrar a la DERECHA acerca (más px/seg).
const zin = zoomByDrag(start, 80, dur, viewW, fps)
assert.ok(zin > start, `derecha debe acercar: ${zin} > ${start}`)

// Arrastrar a la IZQUIERDA aleja (menos px/seg).
const zout = zoomByDrag(start, -80, dur, viewW, fps)
assert.ok(zout < start, `izquierda debe alejar: ${zout} < ${start}`)

// Simétrico y monótono: más arrastre = más zoom.
assert.ok(zoomByDrag(start, 160, dur, viewW, fps) > zin, 'más arrastre acerca más')
assert.ok(zoomByDrag(start, -160, dur, viewW, fps) < zout, 'más arrastre atrás aleja más')

// Respeta los topes de clampPps (no se pasa del máximo ni del mínimo).
assert.equal(zoomByDrag(start, 100000, dur, viewW, fps), maxPps(fps, dur), 'tope superior')
assert.equal(zoomByDrag(start, -100000, dur, viewW, fps), minPps(dur, viewW), 'tope inferior')

// Ancla: el instante bajo el cursor se queda fijo en su posición de pantalla.
// A pps=np, el instante anchorT cae en x = anchorT*np - scrollLeft; con el
// scrollLeft calculado debe volver a anchorScreenX (salvo recorte en 0).
const anchorT = 40
const anchorScreenX = 300
const np = zoomByDrag(start, 80, dur, viewW, fps)
const sl = anchorScroll(anchorT, np, anchorScreenX)
const screenX = anchorT * np - sl
assert.ok(Math.abs(screenX - anchorScreenX) < 1e-6, `el ancla se mantiene fija (${screenX} ≈ ${anchorScreenX})`)

// Si el ancla queda antes del borde, el scroll se recorta a 0 (sin negativos).
assert.equal(anchorScroll(1, 10, 300), 0, 'sin scroll negativo')

console.log('timelineZoom ok')
