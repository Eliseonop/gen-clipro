import assert from 'node:assert/strict'
import { placeMenu, placeAnchoredMenu } from './placeMenu.js'

// Clic con espacio debajo: el menú crece hacia abajo desde el punto
{
  const p = placeMenu(100, 100, 200, 120, 800, 600)
  assert.equal(p.left, 100)
  assert.equal(p.top, 100)
}

// Clic abajo del todo: no cabe debajo → se abre hacia arriba
{
  const p = placeMenu(100, 560, 200, 120, 800, 600)
  assert.equal(p.top, 560 - 120)
  assert.ok(p.top + 120 <= 600)
}

// Clic a la derecha: no se sale del viewport
{
  const p = placeMenu(720, 40, 200, 80, 800, 600)
  assert.ok(p.left + 200 <= 800 - 8)
  assert.ok(p.left >= 8)
}

// Ancla abajo: el desplegable va arriba del botón
{
  const anchor = { left: 40, top: 520, right: 160, bottom: 548, width: 120, height: 28 }
  const p = placeAnchoredMenu(anchor, 180, 140, 800, 600)
  assert.ok(p.top + 140 <= anchor.top)
  assert.equal(p.placement, 'up')
}

// Ancla arriba: el desplegable va debajo del botón
{
  const anchor = { left: 40, top: 20, right: 160, bottom: 48, width: 120, height: 28 }
  const p = placeAnchoredMenu(anchor, 180, 140, 800, 600)
  assert.ok(p.top >= anchor.bottom)
  assert.equal(p.placement, 'down')
}

console.log('placeMenu ok')
