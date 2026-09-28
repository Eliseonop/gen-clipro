// Imagen de arrastre del material (tarjeta → timeline).
//
// Por defecto el navegador pinta la miniatura ENTERA de la tarjeta, desplazada
// del puntero: uno apunta con la imagen y la timeline mide la punta del cursor,
// así que el clip caía en otra pista. Aquí se sustituye por una pastilla con
// el nombre cuyo borde IZQUIERDO está en el puntero, a media altura: justo
// donde empezará el clip.
//
// Va en un único listener de `dragstart` en el documento (después de los de
// React, que ya han puesto el payload): vale para todas las tarjetas, las de
// hoy y las que vengan.

const ICON = { clips: 'movie', video: 'movie', images: 'image', image: 'image', audios: 'music_note', sfx: 'graphic_eq', text: 'title', shape: 'category' }

function payloadOf(dt) {
  const types = [...(dt?.types || [])]
  const type = types.includes('application/x-material') ? 'application/x-material'
    : types.includes('application/x-explore') ? 'application/x-explore' : null
  if (!type) return null
  try { return JSON.parse(dt.getData(type) || 'null') } catch { return null }
}

export function installDragChip(doc = typeof document === 'undefined' ? null : document) {
  if (!doc) return () => {}
  const onStart = (e) => {
    const p = payloadOf(e.dataTransfer)
    if (!p) return
    const chip = doc.createElement('div')
    chip.className = 'ed-drag-chip'
    const icon = doc.createElement('span')
    icon.className = 'material-icons'
    icon.textContent = ICON[p.asset_kind] || ICON[p.kind] || 'movie'
    const name = doc.createElement('b')
    name.textContent = p.name || p.title || p.filename || p.provider || 'Material'
    chip.append(icon, name)
    const dur = Number(p.duration)
    if (dur > 0) {
      const em = doc.createElement('em')
      em.textContent = `${dur < 10 ? dur.toFixed(1) : Math.round(dur)} s`
      chip.append(em)
    }
    doc.body.appendChild(chip)
    try { e.dataTransfer.setDragImage(chip, 0, Math.round(chip.offsetHeight / 2)) } catch { /* se queda la del navegador */ }
    // El navegador ya ha hecho la foto: se puede quitar.
    setTimeout(() => chip.remove(), 0)
  }
  doc.addEventListener('dragstart', onStart)
  return () => doc.removeEventListener('dragstart', onStart)
}
