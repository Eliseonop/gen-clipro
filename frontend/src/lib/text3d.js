// Texto 3D: giro en X (inclinar) e Y (girar) alrededor del centro de la caja,
// con perspectiva. Espejo de backend/app/text3d.py (mismas convenciones y
// números: el preview deforma la capa del texto con WebGL y el export con el
// filtro `perspective` de FFmpeg usando las mismas esquinas proyectadas).
//
// y hacia abajo, como la pantalla: rot_x > 0 aleja la parte de ARRIBA del texto
// (se "tumba" hacia el fondo); rot_y > 0 aleja la DERECHA.

export const TEXT3D_MAX_ANGLE = 75
export const PERSPECTIVE_DEFAULT = 0.5

const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d)

/** Distancia de la cámara al plano. 0 = casi plano, 0.5 = el alto del cuadro, 1 = muy marcada. */
export function focalOf(frameH, perspective) {
  const p = Math.min(1, Math.max(0, num(perspective, PERSPECTIVE_DEFAULT)))
  return frameH / (0.25 + 1.5 * p)
}

/** [rot_x, rot_y] limitados, o null si el texto no está girado en 3D. */
export function text3dAngles(props) {
  const lim = (v) => Math.min(TEXT3D_MAX_ANGLE, Math.max(-TEXT3D_MAX_ANGLE, num(v, 0)))
  const rx = lim(props?.rot_x)
  const ry = lim(props?.rot_y)
  if (Math.abs(rx) < 0.05 && Math.abs(ry) < 0.05) return null
  return [rx, ry]
}

/** Punto (X, Y) del plano del texto → { x, y, w, hx, hy }.
 *  w = (f + z)/f (> 0 delante de la cámara); hx/hy = x·w, y·w (coordenadas
 *  homogéneas para WebGL, válidas aunque el punto quede detrás). */
export function planeProject(cx, cy, rx, ry, f, X, Y) {
  const x = X - cx
  const y = Y - cy
  const a = (rx * Math.PI) / 180
  const b = (ry * Math.PI) / 180
  const y1 = y * Math.cos(a)
  const z1 = -y * Math.sin(a)
  const x2 = x * Math.cos(b) - z1 * Math.sin(b)
  const z2 = x * Math.sin(b) + z1 * Math.cos(b)
  let w = (f + z2) / f
  if (Math.abs(w) < 1e-3) w = w >= 0 ? 1e-3 : -1e-3
  return { x: cx + x2 / w, y: cy + y1 / w, w, hx: cx * w + x2, hy: cy * w + y1 }
}
