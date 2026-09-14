// Edición inmutable del storyboard de una historia con stickman (metadata.stick).
// Espejo mínimo de backend/app/motion/stick.py: los planos son CONTIGUOS y la
// duración total es la suma de sus longitudes.

const round = (v) => Math.round(v * 1000) / 1000
const SHIRTS = ['#2563eb', '#f97316', '#16a34a', '#db2777', '#7c3aed', '#0891b2']
const PANTS = ['#334155', '#3b5b8c', '#1f2937', '#57534e', '#475569', '#3f3f46']

export const shotLength = (s) => Math.max(0.5, round((s.end ?? 0) - (s.start ?? 0)) || 2)

// Recalcula start/end a partir de las longitudes (tras cambiar/añadir/quitar planos).
export function retime(sb, lengths) {
  let t = 0
  const shots = sb.shots.map((s, i) => {
    const len = Math.max(0.5, Math.min(20, Number(lengths?.[i] ?? shotLength(s)) || 2))
    const out = { ...s, start: round(t), end: round(t + len) }
    t += len
    return out
  })
  return { ...sb, shots, duration: round(t) }
}

const uid = (prefix, taken) => {
  let i = taken.length + 1
  while (taken.includes(`${prefix}${i}`)) i += 1
  return `${prefix}${i}`
}

export function patchShot(sb, idx, patch) {
  const shots = sb.shots.map((s, i) => (i === idx ? { ...s, ...patch } : s))
  return { ...sb, shots }
}

export function setShotLength(sb, idx, len) {
  const lengths = sb.shots.map((s, i) => (i === idx ? len : shotLength(s)))
  return retime(sb, lengths)
}

export function addShot(sb) {
  const last = sb.shots[sb.shots.length - 1]
  const id = uid('s', sb.shots.map((s) => s.id))
  // Continúa desde el último plano: mismos personajes y posiciones finales, en reposo.
  const actors = (last?.actors || []).map((a) => ({
    id: a.id, pose: a.pose === 'fall' ? 'lie' : (['walk', 'run'].includes(a.pose) ? 'idle' : a.pose),
    expression: a.expression, x: a.to_x ?? a.x, ...(a.facing ? { facing: a.facing } : {}),
  }))
  const shot = { id, start: 0, end: 2, description: '', caption: '', camera: 'wide', actors, fx: [] }
  return retime({ ...sb, shots: [...sb.shots, shot] }, [...sb.shots.map(shotLength), 2])
}

export function duplicateShot(sb, idx) {
  const src = sb.shots[idx]
  const copy = { ...structuredClone(src), id: uid('s', sb.shots.map((s) => s.id)) }
  const shots = [...sb.shots.slice(0, idx + 1), copy, ...sb.shots.slice(idx + 1)]
  return retime({ ...sb, shots })
}

export function removeShot(sb, idx) {
  if (sb.shots.length <= 1) return sb
  return retime({ ...sb, shots: sb.shots.filter((_, i) => i !== idx) })
}

export function moveShot(sb, idx, dir) {
  const j = idx + dir
  if (j < 0 || j >= sb.shots.length) return sb
  const shots = [...sb.shots]
  ;[shots[idx], shots[j]] = [shots[j], shots[idx]]
  return retime({ ...sb, shots })
}

export function patchActor(sb, shotIdx, actorId, patch) {
  return patchShot(sb, shotIdx, {
    actors: sb.shots[shotIdx].actors.map((a) => {
      if (a.id !== actorId) return a
      const next = { ...a, ...patch }
      // to_x igual a x = quieto (el motor lo trata igual, pero deja el JSON limpio).
      if (next.to_x == null || Math.abs(next.to_x - next.x) < 0.001) delete next.to_x
      return next
    }),
  })
}

export function addActor(sb, shotIdx, charId) {
  const shot = sb.shots[shotIdx]
  if (shot.actors.some((a) => a.id === charId) || shot.actors.length >= 4) return sb
  const used = shot.actors.map((a) => a.x)
  const x = [0.3, 0.7, 0.5, 0.15, 0.85].find((c) => used.every((u) => Math.abs(u - c) > 0.15)) ?? 0.5
  return patchShot(sb, shotIdx, { actors: [...shot.actors, { id: charId, pose: 'idle', expression: 'neutral', x }] })
}

export function removeActor(sb, shotIdx, actorId) {
  const shot = sb.shots[shotIdx]
  return patchShot(sb, shotIdx, {
    actors: shot.actors.filter((a) => a.id !== actorId),
    ...(shot.focus === actorId ? { focus: undefined } : {}),
    fx: (shot.fx || []).filter((f) => f.target !== actorId),
  })
}

export function toggleFx(sb, shotIdx, type, target) {
  const fx = sb.shots[shotIdx].fx || []
  const has = fx.some((f) => f.type === type)
  const next = has ? fx.filter((f) => f.type !== type) : [...fx, { type, ...(target ? { target } : {}) }]
  return patchShot(sb, shotIdx, { fx: next })
}

export function patchCharacter(sb, id, patch) {
  return { ...sb, characters: sb.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
}

export function newCharacter(sb, base = {}) {
  const i = sb.characters.length
  return {
    id: uid('char', sb.characters.map((c) => c.id)), name: `Personaje ${i + 1}`, role: '',
    body: 'man', hair: 'short', hair_color: null, outfit: 'shirt_pants',
    shirt: SHIRTS[i % SHIRTS.length], pants: PANTS[i % PANTS.length],
    accessory: 'none', accent_color: null, description: '', ...base,
  }
}

export function addCharacter(sb, base) {
  if (sb.characters.length >= 6) return sb
  if (base?.id && sb.characters.some((c) => c.id === base.id)) return sb
  return { ...sb, characters: [...sb.characters, newCharacter(sb, base)] }
}

export function removeCharacter(sb, id) {
  let next = { ...sb, characters: sb.characters.filter((c) => c.id !== id) }
  next.shots.forEach((_, i) => { next = removeActor(next, i, id) })
  return next
}

export const shotAt = (sb, t) => {
  let idx = 0
  sb.shots.forEach((s, i) => { if (t >= s.start - 1e-3) idx = i })
  return idx
}
