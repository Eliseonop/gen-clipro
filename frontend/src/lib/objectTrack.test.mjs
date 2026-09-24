import assert from 'node:assert/strict'
import { applyFollowKeys, followObjectKeys } from './objectTrack.js'
import { sourcePointToOutput } from './clipLayout.js'
import { clipPropsAt } from './clipKeyframes.js'

const near = (a, b, msg, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} ≠ ${b}`)

// Mismo caso que backend/tests/test_object_track.py.
const VIDEO = {
  id: 'v', kind: 'video', layout: 'overlay', start: 2, in_point: 1, out_point: 5, speed: 2, flip_h: true,
  transform: { x: 0.5, y: 0.45, scale: 0.4, rotation: 15 }, reframe: { zoom: 1, crop_w: 1, crop_h: 1 },
}
const FOLLOWER = { id: 't', kind: 'text', start: 2.2, in_point: 0, out_point: 3, style: { x: 0.3, y: 0.7, scale: 1.2, rotation: 5 } }
const TRACK = [
  { t: 1.0, cx: 0.30, cy: 0.40, s: 1.0, rot: 0, ok: true },
  { t: 1.5, cx: 0.35, cy: 0.42, s: 1.1, rot: 4, ok: true },
  { t: 2.0, cx: 0.42, cy: 0.45, s: 1.25, rot: 9, ok: true },
  { t: 2.5, cx: 0.50, cy: 0.50, s: 1.4, rot: 15, ok: true },
  { t: 3.0, cx: 0.58, cy: 0.52, s: 1.5, rot: 22, ok: true },
  { t: 4.0, cx: 0.70, cy: 0.55, s: 1.6, rot: 30, ok: true },
]
const DIMS = { srcW: 1920, srcH: 1080, outW: 720, outH: 1280 }

// --- Punto de la fuente → salida (overlay recortado, volteado, fill y keyframes) --
{
  const cases = [
    [{ kind: 'video', layout: 'overlay', in_point: 0, out_point: 10, start: 0, transform: { x: 0.4, y: 0.6, scale: 0.5, rotation: 20 }, reframe: { zoom: 1, crop_w: 0.6, crop_h: 0.8, keyframes: [{ t: 0, cx: 0.4, cy: 0.5 }] } }, [0.3, 0.7], 2, [0.223405, 0.653635]],
    [{ kind: 'video', layout: 'overlay', flip_h: true, in_point: 0, out_point: 10, start: 0, transform: { x: 0.5, y: 0.5, scale: 0.3, rotation: -35 }, reframe: { zoom: 1 } }, [0.8, 0.2], 1, [0.225971, 0.515228]],
    [{ kind: 'video', layout: 'overlay', in_point: 1, out_point: 9, start: 3, transform: { x: 0.5, y: 0.5, scale: 0.4, rotation: 0 }, reframe: { zoom: 1, crop_w: 1, crop_h: 1 }, keyframes: { enabled: true, items: [{ id: 'a', t: 0, interpolation: 'linear', props: { x: 0.3, scale: 0.4, rotation: 0 } }, { id: 'b', t: 4, interpolation: 'ease-in-out', props: { x: 0.7, scale: 0.8, rotation: 45 } }] } }, [0.25, 0.75], 3, [0.085072, 0.443870]],
  ]
  for (const [clip, [nx, ny], local, [ex, ey]] of cases) {
    const o = sourcePointToOutput(clip, nx, ny, 1920, 1080, 720, 1280, 720 / 1280, clip.in_point + local, local)
    near(o.x, ex, 'x')
    near(o.y, ey, 'y')
  }
  // Fill: el centro del recorte cae en el centro de la pose.
  const fill = { kind: 'video', layout: 'fill', in_point: 0, out_point: 10, start: 0, transform: { x: 0.55, y: 0.45, scale: 1.3, rotation: 10 }, reframe: { zoom: 0.7 } }
  const c = sourcePointToOutput(fill, 0.5, 0.5, 1920, 1080, 720, 1280, 720 / 1280, 1, 1)
  near(c.x, 0.55, 'fill x')
  near(c.y, 0.45, 'fill y')
}

// --- Keyframes del clip que acompaña ------------------------------------------------
{
  const keys = followObjectKeys(VIDEO, FOLLOWER, TRACK, DIMS, 0.1, 2.5, 'position_scale_rotation', 0.1)
  assert.deepEqual(keys.map((k) => k.t), [0.05, 0.3, 0.55, 0.8, 1.3])
  assert.deepEqual(keys[1], { t: 0.3, x: 0.3, y: 0.7, scale: 1.2, rotation: 5 }, 'en el instante marcado conserva su pose')
  assert.deepEqual(keys[0], { t: 0.05, x: 0.37678, y: 0.70109, scale: 1.056, rotation: 10 })
  assert.equal(keys[4].x, -0.00402, 'vídeo volteado: el texto va hacia el otro lado')
  assert.equal(keys[4].rotation, -16)
  assert.ok(followObjectKeys(VIDEO, FOLLOWER, TRACK, DIMS, 0.1, 2.5, 'position').every((k) => !('scale' in k)))

  const withOld = {
    ...FOLLOWER,
    keyframes: { enabled: true, items: [
      { id: 'old', t: 0.6, interpolation: 'linear', props: { opacity: 0.2 } },
      { id: 'keep', t: 2.5, interpolation: 'linear', props: { opacity: 0.5 } },
    ] },
  }
  const out = applyFollowKeys(withOld, keys, 30)
  const ids = out.keyframes.items.map((k) => k.id)
  assert.ok(!ids.includes('old'), 'los keyframes del tramo seguido se sustituyen')
  assert.ok(ids.includes('keep'), 'los de fuera se quedan')
  near(clipPropsAt(out, 0.3).x, 0.3, 'x en el anclaje')
  near(clipPropsAt(out, 0.8).x, 0.12428, 'x siguiendo')
  near(clipPropsAt(out, 0.8).rotation, -8, 'giro siguiendo')
}

console.log('objectTrack ok')
