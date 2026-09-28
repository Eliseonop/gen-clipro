import assert from 'node:assert/strict'
import { fmtBytes, qualityMeta, qualityShort, qualityTag, upgradeMessage, usedUpgrades, videoQualities } from './ytQuality.js'

assert.equal(qualityShort(2160), '4K')
assert.equal(qualityShort(4320), '8K')
assert.equal(qualityShort(1080), '1080p')
assert.equal(qualityShort(720), '720p')

assert.equal(qualityTag(1080), 'Full HD')
assert.equal(qualityTag(480), '')

assert.equal(fmtBytes(0), '')
assert.equal(fmtBytes(null), '')
assert.equal(fmtBytes(268 * 1024 ** 2), '268 MB')
assert.equal(fmtBytes(1.3 * 1024 ** 3), '1.3 GB')
assert.equal(fmtBytes(1000), '1 MB')

assert.equal(qualityMeta({ quality: 2160, fps: 60, size: 1.3 * 1024 ** 3 }), '60 fps · ≈ 1.3 GB')
assert.equal(qualityMeta({ quality: 720, fps: 30, size: null }), '', '30 fps no aporta')

assert.deepEqual(videoQualities(null), [])
assert.deepEqual(videoQualities({ video: {} }), [])
assert.deepEqual(
  videoQualities({ video: { qualities: [{ quality: 720 }, { quality: 2160 }, null, { quality: 1080 }] } })
    .map((x) => x.quality),
  [2160, 1080, 720],
)

console.log('ytQuality ok')

{
  const v = [
    { index: 1, label: 'Tráiler', quality: 720, timeline_uses: 6, compatible: true },
    { index: 2, label: 'Otro', quality: 480, timeline_uses: 0, compatible: true },
    { index: 3, label: 'Vertical', quality: 720, timeline_uses: 2, compatible: false },
  ]
  assert.deepEqual(usedUpgrades(v).map((x) => x.index), [1])
  assert.deepEqual(usedUpgrades(null), [])
  const msg = upgradeMessage(v, 1080)
  assert.ok(msg.startsWith('La timeline usa «Tráiler» en 720p en 6 clips.'), msg)
  assert.ok(msg.includes('la versión 1080p'))
  assert.ok(upgradeMessage([v[0], { ...v[1], timeline_uses: 1 }], 2160).includes('2 versiones de menos calidad de este vídeo en 7 clips'))
  console.log('ytQuality upgrades ok')
}
