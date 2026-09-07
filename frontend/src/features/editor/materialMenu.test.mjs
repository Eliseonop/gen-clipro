import assert from 'node:assert/strict'
import { canDeleteMaterial, canDownloadMaterial, materialIdent, materialMenuItems } from './materialMenu.js'

assert.equal(canDeleteMaterial({ scope: 'project' }), true)
assert.equal(canDeleteMaterial({ scope: 'library' }), false)
assert.equal(canDeleteMaterial(null), false)

assert.equal(materialIdent('clips', { index: 3, id: 'x' }), '3')
assert.equal(materialIdent('images', { id: 'img1' }), 'img1')
assert.equal(materialIdent('audios', { id: 'a2' }), 'a2')

{
  const items = materialMenuItems({ saved: false, canDelete: true })
  assert.deepEqual(items.map((x) => x.id), ['save', 'delete'])
  assert.equal(items[0].label, 'Guardar')
  assert.equal(items[1].danger, true)
}

{
  const items = materialMenuItems({ saved: true, canDelete: false })
  assert.deepEqual(items.map((x) => x.id), ['save'])
  assert.equal(items[0].label, 'Quitar de guardados')
}

{
  const items = materialMenuItems({ saved: false, canDelete: true, canDownload: true })
  assert.deepEqual(items.map((x) => x.id), ['save', 'download', 'delete'])
  assert.equal(items[1].label, 'Descargar')
}

assert.equal(canDownloadMaterial({ url: '/api/media/x/video/a.mp4' }), true)
assert.equal(canDownloadMaterial({ filename: 'a.mp4' }), false)
assert.equal(canDownloadMaterial({}), false)
assert.equal(canDownloadMaterial(null), false)

console.log('materialMenu ok')
