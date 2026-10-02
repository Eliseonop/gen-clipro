// Catálogo de ANIMACIONES de clip (entrada, salida, bucle y combo), como las de
// CapCut. Son DATOS: cada una es un conjunto de pistas con claves normalizadas.
// El evaluador (core/animEval.js) y su espejo en Python (backend/app/fx_anims.py)
// las interpretan igual; `npm run fx:build` copia este catálogo al backend.
//
// Pistas: x, y (desplazamiento en fracción del cuadro de salida), scale y opacity
// (multiplican), rotation (grados, se suma). Clave = [u, valor, curva], con u de 0
// a 1 a lo largo de la animación; la curva es la de llegada a esa clave.
// Ranuras: in (al principio), out (al final), loop (se repite con periodo `dur`
// durante todo el clip), combo (una vez, a lo largo de todo el clip).

const A = (id, name, slot, dur, tracks, tags = []) => ({ id, name, slot, dur, tracks, tags })

export const ANIMS = [
  // --- Entrada ---------------------------------------------------------------
  A('fade_in', 'Aparecer', 'in', 0.5, { opacity: [[0, 0], [1, 1, 'outQuad']] }, ['fundido']),
  A('zoom_in', 'Acercar', 'in', 0.5, { scale: [[0, 0.6], [1, 1, 'outCubic']], opacity: [[0, 0], [0.6, 1, 'outQuad']] }, ['zoom']),
  A('zoom_out_in', 'Alejar', 'in', 0.5, { scale: [[0, 1.5], [1, 1, 'outCubic']], opacity: [[0, 0], [0.6, 1, 'outQuad']] }, ['zoom']),
  A('pop_in', 'Pop', 'in', 0.45, { scale: [[0, 0], [1, 1, 'outBack']] }, ['rebote', 'pop']),
  A('elastic_in', 'Elástico', 'in', 0.9, { scale: [[0, 0.2], [1, 1, 'outElastic']], opacity: [[0, 0], [0.15, 1]] }, ['muelle', 'rebote']),
  A('bounce_in', 'Rebote', 'in', 0.8, { y: [[0, -0.6], [1, 0, 'outBounce']], opacity: [[0, 0], [0.1, 1]] }, ['caer', 'rebotar']),
  A('drop_in', 'Caer', 'in', 0.5, { y: [[0, -0.4], [1, 0, 'outCubic']], opacity: [[0, 0], [0.4, 1]] }, ['arriba']),
  A('rise_in', 'Subir', 'in', 0.5, { y: [[0, 0.4], [1, 0, 'outCubic']], opacity: [[0, 0], [0.4, 1]] }, ['abajo']),
  A('slide_left_in', 'Entrar por la derecha', 'in', 0.5, { x: [[0, 1], [1, 0, 'outCubic']] }, ['deslizar']),
  A('slide_right_in', 'Entrar por la izquierda', 'in', 0.5, { x: [[0, -1], [1, 0, 'outCubic']] }, ['deslizar']),
  A('slide_up_in', 'Entrar por abajo', 'in', 0.5, { y: [[0, 1], [1, 0, 'outCubic']] }, ['deslizar']),
  A('slide_down_in', 'Entrar por arriba', 'in', 0.5, { y: [[0, -1], [1, 0, 'outCubic']] }, ['deslizar']),
  A('spin_in', 'Girar', 'in', 0.6, { rotation: [[0, -180], [1, 0, 'outCubic']], scale: [[0, 0.2], [1, 1, 'outCubic']], opacity: [[0, 0], [0.3, 1]] }, ['rotar']),
  A('swing_in', 'Balanceo', 'in', 0.8, { rotation: [[0, -25], [0.45, 12, 'outQuad'], [0.75, -5, 'inOutSine'], [1, 0, 'inOutSine']], opacity: [[0, 0], [0.2, 1]] }, ['péndulo']),
  A('twist_in', 'Torsión', 'in', 0.6, { rotation: [[0, 90], [1, 0, 'outBack']], scale: [[0, 0.5], [1, 1, 'outBack']], opacity: [[0, 0], [0.3, 1]] }, ['giro']),
  A('stretch_in', 'Estirar', 'in', 0.5, { scale: [[0, 1.6], [0.6, 0.92, 'outQuad'], [1, 1, 'inOutSine']], opacity: [[0, 0], [0.3, 1]] }, ['golpe']),
  A('shake_in', 'Sacudida', 'in', 0.6, { x: [[0, 0.05], [0.15, -0.05], [0.3, 0.04], [0.45, -0.03], [0.6, 0.02], [0.8, -0.01], [1, 0]], opacity: [[0, 0], [0.15, 1]] }, ['temblor']),

  // --- Salida ----------------------------------------------------------------
  A('fade_out', 'Desvanecer', 'out', 0.5, { opacity: [[0, 1], [1, 0, 'inQuad']] }, ['fundido']),
  A('zoom_out', 'Alejar y salir', 'out', 0.5, { scale: [[0, 1], [1, 0.6, 'inCubic']], opacity: [[0, 1], [0.4, 1], [1, 0, 'inQuad']] }, ['zoom']),
  A('zoom_in_out', 'Acercar y salir', 'out', 0.5, { scale: [[0, 1], [1, 1.5, 'inCubic']], opacity: [[0, 1], [0.4, 1], [1, 0, 'inQuad']] }, ['zoom']),
  A('pop_out', 'Pop (salida)', 'out', 0.4, { scale: [[0, 1], [0.35, 1.12, 'outQuad'], [1, 0, 'inBack']] }, ['pop']),
  A('drop_out', 'Caer (salida)', 'out', 0.6, { y: [[0, 0], [1, 0.8, 'inBack']], rotation: [[0, 0], [1, 12, 'inQuad']] }, ['caer']),
  A('fly_up_out', 'Salir volando', 'out', 0.5, { y: [[0, 0], [1, -1, 'inCubic']] }, ['subir']),
  A('slide_left_out', 'Salir por la izquierda', 'out', 0.5, { x: [[0, 0], [1, -1, 'inCubic']] }, ['deslizar']),
  A('slide_right_out', 'Salir por la derecha', 'out', 0.5, { x: [[0, 0], [1, 1, 'inCubic']] }, ['deslizar']),
  A('slide_down_out', 'Salir por abajo', 'out', 0.5, { y: [[0, 0], [1, 1, 'inCubic']] }, ['deslizar']),
  A('spin_out', 'Girar (salida)', 'out', 0.6, { rotation: [[0, 0], [1, 180, 'inCubic']], scale: [[0, 1], [1, 0.2, 'inCubic']], opacity: [[0, 1], [0.7, 1], [1, 0]] }, ['rotar']),
  A('shrink_out', 'Encoger', 'out', 0.4, { scale: [[0, 1], [1, 0, 'inBack']] }, ['desaparecer']),

  // --- Bucle -----------------------------------------------------------------
  A('pulse', 'Pulso', 'loop', 0.8, { scale: [[0, 1], [0.5, 1.06, 'inOutSine'], [1, 1, 'inOutSine']] }, ['latido']),
  A('breathe', 'Respirar', 'loop', 2.4, { scale: [[0, 1], [0.5, 1.035, 'inOutSine'], [1, 1, 'inOutSine']] }, ['suave']),
  A('heartbeat_loop', 'Latido', 'loop', 0.9, { scale: [[0, 1], [0.1, 1.1, 'outQuad'], [0.2, 1, 'inQuad'], [0.3, 1.07, 'outQuad'], [0.45, 1, 'inQuad'], [1, 1]] }, ['corazón']),
  A('float', 'Flotar', 'loop', 2.6, { y: [[0, 0], [0.5, -0.02, 'inOutSine'], [1, 0, 'inOutSine']] }, ['levitar']),
  A('sway', 'Vaivén', 'loop', 2, { rotation: [[0, -4], [0.5, 4, 'inOutSine'], [1, -4, 'inOutSine']] }, ['balanceo']),
  A('wiggle', 'Menearse', 'loop', 0.5, { rotation: [[0, 0], [0.25, 3, 'inOutSine'], [0.75, -3, 'inOutSine'], [1, 0, 'inOutSine']] }, ['nervioso']),
  A('jelly', 'Gelatina', 'loop', 0.9, { scale: [[0, 1], [0.25, 1.05, 'inOutSine'], [0.5, 0.97, 'inOutSine'], [0.75, 1.02, 'inOutSine'], [1, 1, 'inOutSine']] }, ['blandito']),
  A('shake_loop', 'Temblar', 'loop', 0.3, { x: [[0, 0], [0.25, 0.008], [0.5, -0.008], [0.75, 0.005], [1, 0]], y: [[0, 0], [0.3, -0.005], [0.6, 0.006], [1, 0]] }, ['frío', 'miedo']),
  A('spin_loop', 'Girar sin parar', 'loop', 3, { rotation: [[0, 0], [1, 360]] }, ['rotar']),
  A('bob', 'Saltito', 'loop', 0.7, { y: [[0, 0], [0.5, -0.025, 'outQuad'], [1, 0, 'inQuad']], rotation: [[0, -2], [0.5, 2, 'inOutSine'], [1, -2, 'inOutSine']] }, ['saltar']),

  // --- Combo (todo el clip) ----------------------------------------------------
  A('ken_burns_in', 'Ken Burns (acercar)', 'combo', 0, { scale: [[0, 1], [1, 1.15, 'inOutSine']] }, ['zoom lento', 'documental']),
  A('ken_burns_out', 'Ken Burns (alejar)', 'combo', 0, { scale: [[0, 1.15], [1, 1, 'inOutSine']] }, ['zoom lento', 'documental']),
  A('drift_left', 'Deriva a la izquierda', 'combo', 0, { x: [[0, 0.03], [1, -0.03, 'inOutSine']], scale: [[0, 1.06], [1, 1.06]] }, ['paneo']),
  A('pop_hold_out', 'Pop, quieto y fuera', 'combo', 0, { scale: [[0, 0], [0.12, 1.08, 'outBack'], [0.2, 1, 'inOutSine'], [0.85, 1], [1, 0, 'inBack']] }, ['entrada y salida']),
]

export const ANIM_SLOTS = [
  { id: 'in', label: 'Entrada' },
  { id: 'out', label: 'Salida' },
  { id: 'loop', label: 'Bucle' },
  { id: 'combo', label: 'Combo' },
]
