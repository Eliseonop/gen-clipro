import assert from 'node:assert/strict'
import { clipFxAt, effectsCss, FX_DUR, lookCss, typingReveal } from './clipFx.js'

const dur = 4
const mid = { appear: 'none', exit: 'none', look: 'none' }

// Sin propiedades (clips viejos): identidad
const id = clipFxAt({}, 1, dur)
assert.equal(id.opacity, 1)
assert.equal(id.scale, 1)
assert.equal(id.tx, 0)
assert.equal(id.ty, 0)
assert.equal(id.cssFilter, 'none')

const id2 = clipFxAt(mid, 2, dur)
assert.equal(id2.opacity, 1)
assert.equal(id2.scale, 1)

// Fade in: opacidad 0 al empezar, 1 al terminar la ventana
const fadeIn = { appear: 'fade', exit: 'none', look: 'none' }
assert.equal(clipFxAt(fadeIn, 0, dur).opacity, 0)
assert.equal(clipFxAt(fadeIn, FX_DUR, dur).opacity, 1)
assert.ok(Math.abs(clipFxAt(fadeIn, FX_DUR / 2, dur).opacity - 0.5) < 1e-9)
assert.equal(clipFxAt(fadeIn, 2, dur).opacity, 1)

// Fade out independiente: a mitad del clip sigue a 1; al final, 0
const fadeOut = { appear: 'none', exit: 'fade', look: 'none' }
assert.equal(clipFxAt(fadeOut, 2, dur).opacity, 1)
assert.equal(clipFxAt(fadeOut, dur, dur).opacity, 0)
assert.ok(Math.abs(clipFxAt(fadeOut, dur - FX_DUR / 2, dur).opacity - 0.5) < 1e-9)

// Aparición y salida a la vez no se pisan en un clip largo
const both = { appear: 'fade', exit: 'fade', look: 'none' }
assert.equal(clipFxAt(both, 0, dur).opacity, 0)
assert.equal(clipFxAt(both, 2, dur).opacity, 1)
assert.equal(clipFxAt(both, dur, dur).opacity, 0)

// Zoom in: arranca agrandado y acaba en 1
const zoomIn = { appear: 'zoom', exit: 'none', look: 'none' }
assert.ok(clipFxAt(zoomIn, 0, dur).scale > 1.1)
assert.equal(clipFxAt(zoomIn, FX_DUR, dur).scale, 1)
assert.equal(clipFxAt(zoomIn, 0, dur).opacity, 1)

// Slide left: entra desde la derecha (tx > 0) y acaba en 0
const slide = { appear: 'slide_left', exit: 'none', look: 'none' }
assert.equal(clipFxAt(slide, 0, dur).tx, 1)
assert.equal(clipFxAt(slide, FX_DUR, dur).tx, 0)
assert.equal(clipFxAt(slide, 0, dur).ty, 0)

// Pop: escala pequeña al inicio
const pop = { appear: 'pop', exit: 'none', look: 'none' }
assert.ok(clipFxAt(pop, 0, dur).scale < 0.8)
assert.equal(clipFxAt(pop, FX_DUR, dur).scale, 1)

// Clip corto: las ventanas no se solapan (mitad y mitad)
const short = { appear: 'fade', exit: 'fade', look: 'none' }
assert.equal(clipFxAt(short, 0, 0.5).opacity, 0)
assert.equal(clipFxAt(short, 0.25, 0.5).opacity, 1)
assert.equal(clipFxAt(short, 0.5, 0.5).opacity, 0)

// Dissolve se comporta como fade
const dissolveIn = { appear: 'dissolve', exit: 'none', look: 'none' }
assert.equal(clipFxAt(dissolveIn, 0, dur).opacity, 0)
assert.equal(clipFxAt(dissolveIn, FX_DUR, dur).opacity, 1)

// Wipe: revela de izquierda a derecha
const wipeIn = { appear: 'wipe', exit: 'none', look: 'none' }
assert.equal(clipFxAt(wipeIn, 0, dur).wipe, 0)
assert.equal(clipFxAt(wipeIn, FX_DUR, dur).wipe, 1)
assert.equal(clipFxAt(wipeIn, 0, dur).opacity, 1)

// Efectos apilados sobre el look
assert.match(effectsCss({ look: 'none', effects: { grayscale: true, blur: 2 } }), /grayscale/)
assert.match(effectsCss({ look: 'none', effects: { grayscale: true, blur: 2 } }), /blur\(2px\)/)
assert.equal(effectsCss({ look: 'none', effects: {} }), 'none')

// Filtro visual constante en todo el clip
assert.match(lookCss('bw'), /grayscale/)
assert.equal(lookCss('none'), 'none')
assert.match(clipFxAt({ look: 'bw' }, 1, dur).cssFilter, /grayscale/)

// Typing: revela caracteres de izquierda a derecha; no muta el original.
assert.equal(typingReveal('Hola mundo', 0), '')
assert.equal(typingReveal('Hola mundo', 1), 'Hola mundo')
assert.equal(typingReveal('Hola mundo', 0.5), 'Hola ')     // ceil(0.5*10)=5
assert.equal(typingReveal('Hi', 0.01), 'H')                // 1er carácter en cuanto arranca
assert.equal(typingReveal('', 0.5), '')                     // texto vacío
assert.equal(typingReveal('abc', 2), 'abc')                 // p fuera de rango se satura
// Textos cortos y largos completan al final (p=1)
assert.equal(typingReveal('a'.repeat(120), 1).length, 120)

console.log('clipFx ok')
