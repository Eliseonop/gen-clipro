import assert from 'node:assert/strict'
import {
  isImageFile, extFromMime, filenameFromUrl, imageSrcsFromHtml, imageUrlsFromText,
  dataUrlToFile, collectPastePayload, hasImagePaste, resolvePasteImages,
} from './imagePaste.js'

assert.equal(isImageFile({ type: 'image/png', name: 'x.bin' }), true)
assert.equal(isImageFile({ type: '', name: 'foto.JPG' }), true)
assert.equal(isImageFile({ type: 'text/plain', name: 'a.txt' }), false)
assert.equal(extFromMime('image/jpeg'), 'jpg')
assert.equal(extFromMime('image/png'), 'png')
assert.equal(filenameFromUrl('https://cdn.example.com/path/meme.webp?w=400'), 'meme.webp')
assert.equal(filenameFromUrl('https://cdn.example.com/x'), 'imagen.png')

assert.deepEqual(
  imageSrcsFromHtml('<div><img src="https://i.imgur.com/a.png" alt="x"></div>'),
  ['https://i.imgur.com/a.png'],
)
assert.deepEqual(imageUrlsFromText('mira https://i.imgur.com/a.png luego'), ['https://i.imgur.com/a.png'])
assert.deepEqual(imageUrlsFromText('https://example.com/page'), [])

{
  const tiny = 'data:image/png;base64,iVBORw0KGgo='
  const f = dataUrlToFile(tiny, 'x.bin')
  assert.equal(f.type, 'image/png')
  assert.equal(f.name, 'imagen.png')
}

function fakeCd({ files = [], html = '', plain = '', items = [] }) {
  return {
    files,
    items,
    getData: (t) => {
      if (t === 'text/html') return html
      if (t === 'text/plain' || t === 'text/uri-list') return plain
      return ''
    },
  }
}

{
  const shot = new File([new Uint8Array([1, 2, 3])], 'captura.png', { type: 'image/png' })
  const p = collectPastePayload(fakeCd({ files: [shot] }))
  assert.equal(p.files.length, 1)
  assert.equal(p.files[0].name, 'captura.png')
  assert.deepEqual(p.urls, [])
  assert.equal(hasImagePaste(p), true)
}

{
  const p = collectPastePayload(fakeCd({
    html: '<img src="https://cdn.example.com/pic.jpg">',
    plain: 'https://cdn.example.com/pic.jpg',
  }))
  assert.equal(p.files.length, 0)
  assert.deepEqual(p.urls, ['https://cdn.example.com/pic.jpg'])
}

{
  const p = collectPastePayload(fakeCd({ plain: 'hola mundo' }))
  assert.equal(hasImagePaste(p), false)
}

{
  const local = new File([new Uint8Array([9])], 'a.png', { type: 'image/png' })
  const got = await resolvePasteImages({ files: [local], urls: [] })
  assert.equal(got.length, 1)
}

{
  const remote = new File([new Uint8Array([8])], 'web.png', { type: 'image/png' })
  const got = await resolvePasteImages(
    { files: [], urls: ['https://cdn.example.com/web.png'] },
    async (url) => {
      assert.equal(url, 'https://cdn.example.com/web.png')
      return remote
    },
  )
  assert.equal(got[0].name, 'web.png')
}

console.log('imagePaste ok')
