// Tests del texto de Paper Animator (partes sin DOM): resolución de letras,
// layout, elementos (letras / grupos / frase), cambio de modo y su encaje con la
// selección, el render y la timeline.
//
// Ejecutar: node src/features/paper/paperText.test.mjs

import assert from 'node:assert/strict'
import {
  DEFAULT_OBJECT, hasContent, newPaperState, resetPath, selectedObject, selectedObjectPath,
  setPath, viewOf, withSelectedObject, addKeyframe,
} from './paperModel.js'
import {
  applyObjectToAll, chooseGlyph, cycleGlyph, elementAt, elementLabel, elementSlot, glyphsSig,
  groupElements, indexLibrary, lastKeyframeTime, layoutGlyphs, lettersElements, phraseElements,
  removeElementChars, resolveGlyphs, switchMode, syncElements, ungroupElement,
} from './paperText.js'
import { objectFrame } from './paperTransforms.js'
import { paperClipTarget, paperElementClipId, paperStateToTimeline, paperTimelineSig, PAPER_OBJECT_CLIP } from './paperTimeline.js'

// Biblioteca de juguete: dos estilos, varias variantes, minúsculas incompletas.
const g = (char, style, n, w = 100, h = 200) => ({ file: `${style}_${char}_${n}.png`, char, style, w, h })
const LIB = {
  styles: ['AAA', 'BBB'],
  glyphs: [
    g('H', 'AAA', 1), g('H', 'BBB', 2),
    g('E', 'AAA', 3), g('E', 'AAA', 4), g('E', 'BBB', 5),
    g('L', 'AAA', 6), g('L', 'AAA', 7), g('L', 'BBB', 8),
    g('O', 'BBB', 9),                         // O solo existe en BBB
    g('W', 'AAA', 10, 180), g('R', 'AAA', 11), g('D', 'AAA', 12),
    g('1', 'AAA', 13), g('2', 'BBB', 14),
    g('e', 'AAA', 15),                        // única minúscula
  ],
}
const IDX = indexLibrary(LIB)
const STYLE_A = { assign: 'style', style: 'AAA', seed: 1 }

function textState(content, opts = STYLE_A, mode = 'letters') {
  const glyphs = resolveGlyphs(content, IDX, opts)
  const text = { ...newPaperState().text, ...opts, content, glyphs, mode }
  text.elements = mode === 'phrase' ? phraseElements(glyphs) : lettersElements(glyphs)
  return text
}

// 1. una sola letra
{
  const [h] = resolveGlyphs('H', IDX, STYLE_A)
  assert.equal(h.style, 'AAA')
  assert.ok(h.file)
  const t = textState('H')
  assert.equal(t.elements.length, 1)
  assert.equal(elementLabel(t.glyphs, t.elements[0]), 'H')
}

// 2-4. palabra y frase con espacios: los espacios conservan el hueco
{
  const t = textState('HELLO WORLD')
  assert.equal(t.glyphs.length, 11)
  assert.ok(t.glyphs[5].space, 'el espacio se guarda como espacio')
  assert.equal(t.elements.length, 10, 'un elemento por letra, ninguno para el espacio')
  const layout = layoutGlyphs(t.glyphs)
  const o = layout.slots[4]
  const w = layout.slots[6]
  const gapWithSpace = w.x - (o.x + o.w)
  const l3 = layout.slots[3]
  const gapLetters = o.x - (l3.x + l3.w)
  assert.ok(gapWithSpace > gapLetters * 3, '"HELLO WORLD" no se pega en "HELLOWORLD"')
  assert.equal(layout.slots[5], null)
}

// 5. números
{
  const gl = resolveGlyphs('H1 2', IDX, STYLE_A)
  assert.equal(gl[1].file, 'AAA_1_13.png')
  assert.equal(gl[3].style, 'BBB', 'si el estilo no tiene el carácter se usa otro antes que dejar hueco')
}

// 6. caracteres no disponibles: no rompen, dejan hueco y no generan elemento
{
  const t = textState('H€L?')
  assert.ok(t.glyphs[1].missing && t.glyphs[3].missing)
  assert.equal(t.elements.length, 2)
  const layout = layoutGlyphs(t.glyphs)
  assert.ok(layout.slots[2].x > layout.slots[0].x + layout.slots[0].w + 20, 'el hueco del € se conserva')
  assert.doesNotThrow(() => textState('¿¿¿'))
  assert.equal(textState('¿¿¿').elements.length, 0)
}

// minúsculas: exacta si existe, si no cae a la mayúscula
{
  const gl = resolveGlyphs('he', IDX, STYLE_A)
  assert.equal(gl[0].ch, 'h')
  assert.equal(gl[0].file.split('_')[1], 'H', 'h → H (no hay h)')
  assert.equal(gl[1].file, 'AAA_e_15.png', 'e existe tal cual')
}

// 7. modo estilo: todo del estilo cuando lo tiene
{
  const gl = resolveGlyphs('HELL', IDX, { assign: 'style', style: 'BBB', seed: 3 })
  assert.deepEqual(gl.map((x) => x.style), ['BBB', 'BBB', 'BBB', 'BBB'])
}

// 8. aleatorio: reproducible con la misma semilla y reparte estilos
{
  const opts = { assign: 'random', seed: 7 }
  const a = resolveGlyphs('HELLO HELLO HELLO', IDX, opts)
  const b = resolveGlyphs('HELLO HELLO HELLO', IDX, opts)
  assert.equal(glyphsSig(a), glyphsSig(b), 'misma semilla → mismas letras')
  const styles = new Set(a.filter((x) => x.file).map((x) => x.style))
  assert.equal(styles.size, 2, 'mezcla estilos')
  const c = resolveGlyphs('HELLO HELLO HELLO', IDX, { ...opts, seed: 8 })
  assert.notEqual(glyphsSig(a), glyphsSig(c), 'otra semilla → otro sorteo')
  // escribir al final no re-sortea lo ya elegido
  const more = resolveGlyphs('HELLO HELLO HELLO!', IDX, { ...opts, seed: 99 }, a)
  assert.equal(glyphsSig(more.slice(0, a.length)), glyphsSig(a))
}

// variantes a mano
{
  const gl = resolveGlyphs('E', IDX, STYLE_A)
  const next = cycleGlyph(gl, 0, IDX, { dir: 1 })
  assert.notEqual(next[0].file, gl[0].file)
  assert.equal(next[0].style, 'AAA')
  assert.equal(cycleGlyph(next, 0, IDX, { dir: 1 })[0].file, gl[0].file, 'da la vuelta')
  assert.equal(cycleGlyph(gl, 0, IDX, { style: 'BBB' })[0].file, 'BBB_E_5.png')
}

// 9-10. letras individuales / frase completa + slots coherentes
{
  const letters = textState('HELLO')
  const phrase = textState('HELLO', STYLE_A, 'phrase')
  assert.equal(phrase.elements.length, 1)
  assert.deepEqual([phrase.elements[0].from, phrase.elements[0].to], [0, 4])

  const layout = layoutGlyphs(letters.glyphs)
  const ps = elementSlot(layout, phrase.elements[0])
  assert.equal(ps.dx, 0)
  assert.equal(ps.dy, 0)
  assert.equal(ps.w, ps.fitW, 'la frase ocupa su propio encaje')

  // En pose neutra, las letras caen exactamente dentro del marco de la frase.
  const pose = { x: 0, y: 0, scale: 80, rotation: 0 }
  const pf = objectFrame(1080, 1920, 1, 1, pose, ps)
  const first = objectFrame(1080, 1920, 1, 1, pose, elementSlot(layout, letters.elements[0]))
  const last = objectFrame(1080, 1920, 1, 1, pose, elementSlot(layout, letters.elements[4]))
  const k = pf.w / ps.w // píxeles por unidad
  assert.ok(Math.abs((first.cx - (layout.slots[0].w / 2) * k) - (pf.cx - (ps.box.w / 2) * k)) < 1e-6,
    'el borde izquierdo de la H coincide con el de la frase')
  assert.ok(Math.abs((last.cx + (layout.slots[4].w / 2) * k) - (pf.cx + (ps.box.w / 2) * k)) < 1e-6,
    'el borde derecho de la O coincide con el de la frase')
  assert.equal(first.h, last.h, 'todas las letras comparten escala')

  // Sin slot, objectFrame es la cuenta de siempre (la imagen no cambia).
  assert.deepEqual(
    objectFrame(1000, 1000, 500, 250, { x: 10, y: 0, scale: 100, rotation: 0 }),
    { w: 1000, h: 500, cx: 600, cy: 500, rotation: 0 },
  )
}

// cambio de modo sin destruir + grupos
{
  let t = textState('HELLO WORLD')
  t.elements[0].object.stroke.width = 44
  const ids = t.elements.map((e) => e.id)

  const phrase = switchMode(t, 'phrase', t.elements[0].id)
  assert.equal(phrase.elements.length, 1)
  assert.equal(phrase.elements[0].object.stroke.width, 44, 'la frase hereda el object de lo seleccionado')
  const back = switchMode(phrase, 'letters', phrase.elements[0].id)
  assert.deepEqual(back.elements.map((e) => e.id), ids, 'volver recupera las letras tal cual estaban')

  // grupos: HEL + LO WORLD
  let r = groupElements(back, [0, 2])
  assert.ok(r.id)
  t = r.text
  assert.deepEqual([t.elements[0].from, t.elements[0].to], [0, 2])
  assert.equal(t.elements.length, 8)
  r = groupElements(t, [3, 10])
  t = r.text
  assert.equal(t.elements.length, 2, '"HEL" y "LO WORLD"')
  assert.equal(elementLabel(t.glyphs, t.elements[1]), 'LO WORLD')
  assert.equal(elementAt(t.elements, 5).id, r.id, 'el espacio cae dentro del grupo')
  assert.equal(groupElements(t, [0, 1]).id, null, 'agrupar dentro de un solo elemento no hace nada')
  const un = ungroupElement(t, r.id)
  assert.equal(un.elements.length, 1 + 7, 'desagrupar vuelve a letras (sin el espacio)')

  // editar el texto conserva ids y objects de lo que sigue existiendo
  const glyphs = resolveGlyphs('HELLO WORLD!!', IDX, STYLE_A, t.glyphs)
  const synced = syncElements({ ...t, glyphs }, glyphs)
  assert.equal(synced[0].id, t.elements[0].id)
  assert.equal(synced[1].id, t.elements[1].id)

  // borrar un elemento desde la timeline quita sus caracteres
  const hello = textState('HELLO')
  const removed = removeElementChars(hello, hello.elements[0].id)
  assert.equal(removed.content, 'ELLO')
  assert.deepEqual(removed.elements.map((e) => e.from), [0, 1, 2, 3], 'los siguientes se desplazan')
}

// aplicar a todos + escalonado (animación letra a letra)
{
  const t = textState('HEL')
  const src = t.elements[1]
  src.object.animation.mode = 'advanced'
  src.object.shadow.blur = 30
  const out = applyObjectToAll(t, src.id, 0.25)
  assert.deepEqual(out.elements.map((e) => e.object.shadow.blur), [30, 30, 30])
  assert.deepEqual(out.elements.map((e) => e.object.animation.keyframes[0].time), [0, 0.25, 0.5])
  assert.equal(lastKeyframeTime(out), 1.5)
  assert.notEqual(out.elements[0].object, out.elements[2].object, 'objects independientes')
}

// selección: los paneles editan el object seleccionado (11-14 comparten este camino)
{
  let st = newPaperState()
  st = setPath(st, 'text', textState('HELLO'))
  const el = st.text.elements[2]
  st = { ...st, selected: el.id }
  assert.ok(hasContent(st))
  assert.equal(selectedObjectPath(st), 'text.elements.2.object')
  assert.equal(viewOf(st).object, el.object)

  // una propiedad cualquiera (Foli = pliegue de papel) solo afecta a esa letra
  const folded = withSelectedObject(st, (v) => setPath(v, 'object.paperFoldOverlay.opacity', 12))
  assert.equal(folded.text.elements[2].object.paperFoldOverlay.opacity, 12)
  assert.equal(folded.text.elements[1].object.paperFoldOverlay.opacity, DEFAULT_OBJECT.paperFoldOverlay.opacity)
  assert.equal(folded.object, st.object, 'la imagen no se toca')

  // Paper Unfolding por keyframes: mismas operaciones que la imagen
  let adv = withSelectedObject(st, (v) => setPath(v, 'object.animation.mode', 'advanced'))
  adv = withSelectedObject(adv, (v) => addKeyframe(v))
  assert.equal(selectedObject(adv).animation.keyframes.length, 3)
  assert.equal(adv.object.animation.keyframes.length, 2, 'la imagen conserva los suyos')
  assert.equal(withSelectedObject(adv, (v) => resetPath(v, 'object.animation')).text.elements[2].object.animation.keyframes.length, 2)

  // animación de frase: un único object para todo el texto
  const ph = { ...st, text: switchMode(st.text, 'phrase', el.id) }
  const phSel = { ...ph, selected: ph.text.elements[0].id }
  const opened = withSelectedObject(phSel, (v) => setPath(v, 'object.animation.simple.open', true))
  assert.equal(opened.text.elements[0].object.animation.simple.open, true)

  // 15. la imagen sigue por el camino de siempre
  const img = { ...newPaperState(), hasImage: true }
  assert.equal(selectedObjectPath(img), 'object')
  assert.equal(viewOf(img), img, 'con la imagen seleccionada la vista ES el estado')
  assert.equal(withSelectedObject(img, (v) => setPath(v, 'object.stroke.width', 3)).object.stroke.width, 3)
}

// timeline: una pista por elemento, keyframes de cada uno, ids reversibles
{
  let st = { ...newPaperState(), hasImage: true, imageName: 'a.png' }
  st = setPath(st, 'text', textState('HI'))
  const tl = paperStateToTimeline(st)
  assert.equal(tl.clips[0].id, PAPER_OBJECT_CLIP)
  const textClips = tl.clips.filter((c) => paperClipTarget(c.id) && paperClipTarget(c.id) !== 'image')
  assert.equal(textClips.length, 1, 'H (la I no existe en la biblioteca)')
  assert.equal(paperClipTarget(paperElementClipId(st.text.elements[0].id)), st.text.elements[0].id)
  assert.equal(paperClipTarget('paper_fold_open'), null)

  const sig = paperTimelineSig(st)
  assert.equal(paperTimelineSig(withSelectedObject({ ...st, selected: st.text.elements[0].id },
    (v) => setPath(v, 'object.shadow.blur', 9))).replace(st.text.elements[0].id, ''), sig.replace('image', ''),
  'tocar la sombra de una letra no rehace la timeline')

  // solo texto: sigue habiendo timeline
  const onlyText = setPath(newPaperState(), 'text', textState('HEL'))
  assert.equal(paperStateToTimeline(onlyText).tracks.length, 3)
}

// resolución directa de un carácter
assert.deepEqual(chooseGlyph(IDX, '#', 0, STYLE_A), { ch: '#', missing: true })

console.log('paper text ok')
