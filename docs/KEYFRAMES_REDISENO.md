# Rediseño del sistema de keyframes

Estado: **Fases A y B implementadas**. C, D y E siguen siendo propuesta.
Fecha: 2026-09-12 · Rama: `bgremove`

> **Desviaciones respecto al plan original**, decididas al implementar:
>
> 1. `upsertKeyframeAt` **conserva** su contrato (sigue activando la animación).
>    En vez de cambiarlo, la regla se aplica en los llamantes a través de
>    `shouldKeyframe(clip, patch)`. Así `animate_clip` (MCP) y `applyVolumeFade`
>    siguen funcionando sin tocarlos, que era el riesgo señalado en §5.
> 2. **El encuadre (`cx`/`cy`) es una excepción**: no tiene campo estático — sus
>    keyframes *son* el almacenamiento (`snapshotProps` → `frameAt`). Mover el
>    recorte sigue escribiendo keyframe. Queda pendiente de unificar en Fase C/D.
> 3. Atajos elegidos: **Alt+C / Alt+V / Alt+D** para keyframes, dejando
>    `Ctrl+C` / `Ctrl+V` intactos para clips.

---

## 0. Resumen de la decisión

Hay tres cosas distintas mezcladas en la petición, y conviene separarlas porque tienen
coste y riesgo muy diferentes:

| # | Qué | Coste | Riesgo | Dónde toca |
|---|-----|-------|--------|-----------|
| A | **Reglas de creación de keyframes** (no crear KF al mover si la propiedad no está animada) | Bajo | Bajo | 3 funciones del frontend |
| B | **Copiar / pegar / duplicar keyframes** | Bajo-medio | Bajo | Frontend + 1 helper |
| C | **Registro declarativo de propiedades animables** | Medio | Bajo | `clipKeyframes.js` + espejo Python |
| D | **Keyframes por propiedad con tiempos independientes** | Alto | Medio | Modelo, preview, export, MCP, migración |
| E | **Catálogo ampliado (color, blur, texto, speed, blend…)** | Alto y *abierto* | **Alto** | Export FFmpeg, uno a uno |

Recomendación: **A → B → C → D → E**, en ese orden, y **E siempre gobernado por lo que
el export puede realmente animar** (§4). A y B ya arreglan el problema de UX que
describiste primero. C es la inversión barata que evita rehacer el motor. D es el
refactor de verdad. E no es un refactor: es trabajo incremental sin fin, propiedad
a propiedad, y el cuello de botella no es el modelo sino FFmpeg.

### Una objeción que conviene dejar por escrito

El segundo mensaje lista ~150 propiedades repartidas en 20 categorías. De esas,
**tu editor hoy tiene 23 propiedades animables** y muchas de las listadas **no existen
en ningún sitio del proyecto**: no hay anchor point, ni skew, ni 3D, ni máscaras Bézier
con vértices, ni ruedas de color (lift/gamma/gain), ni curvas RGB, ni cámara virtual,
ni time remapping, ni pan de audio, ni motion blur, ni glow, ni distorsión.

Declarar animable una propiedad que no existe no produce nada: no hay UI que la muestre,
ni preview que la pinte, ni filtro FFmpeg que la exporte. El valor real del registro
declarativo (punto C) **no** es precargarlo con 150 entradas; es que cuando *sí* implementes
Glow, añadir su animación sea una línea y no un refactor. Ese es el argumento correcto de
tu mensaje, y lo recojo. Lo que propongo es poblar el registro con lo que existe hoy y
dejar la puerta abierta, en vez de escribir 150 entradas muertas.

---

## 1. Estado actual

### 1.1 El modelo: snapshots globales, no pistas por propiedad

Un clip guarda:

```js
keyframes: {
  enabled: true,
  items: [
    { id: 'k...', t: 0.0, interpolation: 'linear',      props: { x, y, scale, rotation, opacity, cx, cy, zoom, mx..mfeather, volume, eq, ... } },
    { id: 'k...', t: 2.0, interpolation: 'ease-in-out', props: { ...las 23 otra vez... } },
  ]
}
```

Es decir: **cada keyframe es una foto completa de las 23 propiedades**, y hay **un solo
flag `enabled` para el clip entero**. No existe "Position animada pero Opacity no".

`t` es tiempo **local** del clip (0 = inicio de la barra), no tiempo de timeline.

Las 23 claves están en `KF_PROP_KEYS` (`frontend/src/lib/clipKeyframes.js:22`):

| Grupo | Claves |
|---|---|
| Transformación | `x`, `y`, `scale`, `rotation`, `opacity` |
| Encuadre | `cx`, `cy`, `zoom` |
| Máscara | `mx`, `my`, `mw`, `mh`, `msx`, `msy`, `mrot`, `mfeather` |
| Audio | `volume`, `eq`, `compressor`, `reverb`, `echo`, `denoise`, `distortion` |

### 1.2 El motor

- Frontend: `frontend/src/lib/clipKeyframes.js`
- Backend: `backend/app/clip_keyframes.py` — **espejo exacto**, función por función

Piezas clave (mismas en ambos lados):

| Función | Qué hace |
|---|---|
| `staticProps(clip)` | Valores estáticos según `kind` (shape→`shape`, text→`style`, resto→`transform`+`reframe`) |
| `clipPropsAt(clip, t)` | Valor efectivo en `t`: estático si no hay animación, interpolado si la hay |
| `interpItems(items, t, fb)` | Interpolación por tramos con easing (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `hold`) |
| `upsertKeyframeAt(...)` | Crea **o actualiza** el KF en `t` |
| `patchKeyframe` / `deleteKeyframeItem` | Editar / borrar un item |
| `ffmpeg_envelope(clip, key, def)` | *(solo backend)* Genera la expresión FFmpeg por tramos para una propiedad |

Nota importante: el módulo **ya está escrito de forma genérica**. El comentario de
`clipKeyframes.js:20` dice literalmente:

> *"Para añadir volumen, blur, color, etc. basta con incluir la clave aquí y guardarla
> en cada snapshot; interpItems la interpolará."*

O sea: el principio de "no hagas `if property == 'position'`" **ya lo aplicaste** en el
interpolador. No hay ramas por propiedad en `interpItems`. Lo que falta no es la
genericidad del interpolador, es todo lo demás: metadatos, per-property, tipos no
numéricos y export.

### 1.3 El export

`compose.py` no reproduce el interpolador: **traduce los keyframes a expresiones FFmpeg**
que se evalúan por fotograma. Cada propiedad está **cableada a mano**:

| Propiedad | Cómo se exporta | Ref |
|---|---|---|
| `x`, `y` | `overlay=x='...':y='...':eval=frame` | `compose.py:288` |
| `scale` | `scale=w='...':h='...':eval=frame` | `compose.py:294` |
| `rotation` | `rotate=` con expresión por tramos | `compose.py:161` |
| `cx`, `cy`, `zoom` | `crop=x='...':y='...'` | `compose.py:274` |
| `opacity` | `geq=...:a='255*...'` (expresión **por píxel**) | `compose.py:182` |
| `volume` | `volume='...':eval=frame` vía `ffmpeg_envelope` | `clip_keyframes.py:240` |

**`ffmpeg_envelope` es genérico pero hoy solo lo usa `volume`.** Es la pieza reutilizable
para cualquier propiedad futura cuyo filtro acepte expresiones.

### 1.4 La UI

| Componente | Rol |
|---|---|
| `EdTransform.jsx` | Panel Transformación + `KfDia` (el rombo ◆) + `InspSection` |
| `EdEffects.jsx` | Pestañas de efectos, volumen, FX de audio, selector de interpolación |
| `EdCrops.jsx` | Lista numerada de keyframes junto a la timeline, con borrar |
| `EdTimeline.jsx` | Rombos en la barra del clip, arrastre temporal (`startKfDrag`, `:363`) |
| `EdMask.jsx` | Controles de máscara con su propio ◆ |

`KfDia` ya existe y ya se pinta encendido/apagado según haya KF en el cabezal
(`keyframeIdAt`). La base visual para el punto 1 de la spec **ya está puesta**.

### 1.5 El MCP

- `set_clip_keyframes(project_id, clip_id, keyframes)` — escape hatch crudo, `tools_edit.py:219`
- `animate_clip(...)` — el servidor genera los items (`zoom_in`, `spin`, `slide_*`, `fade_*`,
  `pop`, `pulse`, y `follow_audio_id` para seguir el RMS de un audio), `timeline_ops.py:641`

---

## 2. Diagnóstico frente a la spec

### 2.1 Lo que YA cumple

**Punto 3 — "si ya está animado, modificar crea KF en ese instante"**: sí.
**Punto 4 — "si estás sobre un KF existente, se modifica, no se duplica"**: sí.

Ambos salen de `upsertKeyframeAt` (`clipKeyframes.js:213`):

```js
const j = items.findIndex((k) => Math.abs(k.t - t) < snap)   // snap = 1 frame
if (j >= 0) { items[j] = { ...items[j], t, props, ... } }    // actualiza
else { items.push({ id: kfId(), t, ... }) }                  // crea
```

Además hay 5 modos de interpolación **por keyframe**, que es más de lo que pedía la spec
(contempla `easing` pero no lo desarrolla).

### 2.2 Lo que NO cumple — el bug de UX

**Puntos 1 y 2 — "mover no debe crear keyframe hasta que el usuario lo decida"**:
hace exactamente lo contrario.

`commitPose` (`VideoEditor.jsx:1332`):

```js
function commitPose(id, patch) {
  setClips((prev) => prev.map((c) => {
    if (!ids.has(c.id) || !canKeyframe(c)) return c
    let next = applyStaticPose(c, patch)   // ← ya actualiza el valor estático
    const t = localTOf(next)
    next = upsertKf(next, t, patch)        // ← …y ADEMÁS crea keyframe, siempre
    if (c.id === id) markKf(next, t)
    return next
  }))
}
```

Y `upsertKeyframeAt` devuelve incondicionalmente `keyframes: { enabled: true, items }`.
Resultado: **arrastrar un clip una sola vez enciende la animación y siembra un keyframe**,
aunque el usuario solo quisiera recolocarlo.

El mismo patrón en:

- `changeTransform` (`VideoEditor.jsx:1361`)
- `applyClipFrame` (`VideoEditor.jsx:1371`)
- el commit de encuadre `cx/cy/zoom` (`VideoEditor.jsx:~1465`)

Detalle afortunado: **`applyStaticPose` ya existe y ya escribe el valor estático**
(`VideoEditor.jsx:1285`). El arreglo consiste en *condicionar* la segunda mitad, no en
escribir un camino nuevo.

### 2.3 Lo que no existe

- **Copiar / pegar / duplicar keyframes**: nada. `Ctrl+C` / `Ctrl+V` (`VideoEditor.jsx:2250`)
  operan sobre **clips**, no sobre keyframes.
- **Copiar propiedades seleccionadas** entre keyframes: nada.
- **Copiar animación de una propiedad a otra**: nada (y con snapshots globales es
  conceptualmente imposible; requiere la Fase D-2).
- **Animado por propiedad**: nada. Un solo `enabled` para el clip.
- **Propiedades discretas** (`visibility`, `blend mode`, `mute`): nada. El interpolador
  asume `float` y hace `pa + (pb - pa) * u` sobre todas las claves.

---

## 3. Arquitectura propuesta

### 3.1 Registro declarativo de propiedades (Fase C)

Lo que pides como "no hagas `if property ==`". Un único sitio donde se declara todo:

```js
// frontend/src/lib/propRegistry.js  (+ espejo backend/app/prop_registry.py)
export const PROP_REGISTRY = {
  x:        { group: 'transform',   label: 'Posición X', type: 'number', def: 0.5, min: -2,   max: 3,    step: 0.001, export: 'overlay_x' },
  y:        { group: 'transform',   label: 'Posición Y', type: 'number', def: 0.5, min: -2,   max: 3,    step: 0.001, export: 'overlay_y' },
  scale:    { group: 'transform',   label: 'Escala',     type: 'number', def: 1,   min: 0.05, max: 8,    step: 0.001, export: 'scale' },
  rotation: { group: 'transform',   label: 'Rotación',   type: 'angle',  def: 0,   min: -3600, max: 3600, step: 0.1,  export: 'rotate' },
  opacity:  { group: 'compositing', label: 'Opacidad',   type: 'unit',   def: 1,   min: 0,    max: 1,    step: 0.01,  export: 'geq_alpha', cost: 'high' },
  volume:   { group: 'audio',       label: 'Volumen',    type: 'number', def: 1,   min: 0,    max: 2,    step: 0.01,  export: 'envelope:volume' },
  visible:  { group: 'compositing', label: 'Visible',    type: 'bool',   def: true, interpolate: 'step', export: null },
  // …
}
```

Campos y para qué sirve cada uno:

| Campo | Para qué |
|---|---|
| `group` | Agrupar en la UI (TRANSFORM / COMPOSITING / CROP / MASK / COLOR / AUDIO / TEXT / EFFECTS) |
| `type` | `number` · `unit` (0–1) · `angle` · `bool` · `enum` · `opaque` (curvas, vértices) |
| `min` / `max` / `step` | Los controles de la UI se generan solos; y el clamp deja de estar repartido por el código |
| `interpolate` | `linear` (por defecto) · `step` (discretas, **nunca** se interpolan) · `custom` |
| `export` | **El contrato con FFmpeg** (§4). `null` = animable en preview pero **no** en export |
| `cost` | Aviso de rendimiento (`geq` es por píxel) |

Ganancias inmediatas, sin tocar el storage:

- `KF_PROP_KEYS` pasa a derivarse: `Object.keys(PROP_REGISTRY)`.
- `staticProps` deja de tener tres ramas por `kind` con los mismos valores repetidos.
- `interpItems` consulta `interpolate` y deja de interpolar las discretas.
- La UI puede pintar el control de una propiedad sin código específico.
- Añadir Glow → Intensity = una entrada en el registro + su `export`.

### 3.2 Animado por propiedad — dos escalones

**Escalón 1 (barato, retrocompatible): conjunto `animated`.**

```js
keyframes: {
  enabled: true,
  animated: ['x', 'y'],    // NUEVO — qué propiedades están realmente animadas
  items: [ /* sin cambios */ ]
}
```

`interpItems` interpola **solo** las claves de `animated`; el resto sale de `staticProps`.
Si `animated` falta (proyectos guardados) se asume "todas" → **comportamiento idéntico al
actual, migración cero**. Esto da los puntos 1 y 2 de la spec *por propiedad*, y el ◆ de
cada `InspSection` puede encenderse y apagarse individualmente.

Limitación honesta: **todas las propiedades animadas comparten la misma rejilla de tiempos**.
Un keyframe en `t=2` existe para todas. No puedes tener Position moviéndose en 0–2 s
mientras Opacity hace fade en 3–4 s con keyframes independientes.

**Escalón 2 (el de verdad): pistas por propiedad.**

```js
keyframes: {
  tracks: {
    x:       { animated: true, items: [{ t: 0, v: 0.5, interpolation: 'linear' }, { t: 2, v: 0.9, interpolation: 'ease-in-out' }] },
    opacity: { animated: true, items: [{ t: 3, v: 1 }, { t: 4, v: 0 }] },
  }
}
```

Esto sí es el modelo del mensaje, y es lo que habilita "copiar la animación de una
propiedad a otra". Coste: reescribir `interpItems`, `upsertKeyframeAt`, `ffmpeg_envelope`,
los 6 cableados de `compose.py`, el dibujo de rombos de `EdTimeline` (¿una fila por
propiedad?), `set_clip_keyframes`, `animate_clip`, y una **migración de proyectos**
(snapshot → N pistas: se convierte fielmente, cada propiedad hereda todos los `t`, y luego
se simplifica quitando keyframes redundantes).

Recomendación: **haz el Escalón 1 primero**. Cubre la mayor parte de lo que se siente como
"editor profesional" en un editor de shorts, y no rompe nada. Salta al 2 solo cuando falte
de verdad la independencia temporal.

### 3.3 Propiedades discretas

El punto 20 del mensaje es correcto y barato de soportar en cuanto exista el registro:
`interpolate: 'step'` → `interpItems` devuelve el valor del keyframe **anterior**, sin lerp.
Ya existe el precedente: la interpolación `hold` hace exactamente eso (`easeT` devuelve 0
para `hold`, `clipKeyframes.js:83`). La diferencia es que `hold` es una decisión *por
keyframe* y `step` sería una propiedad *del tipo*.

Ojo con el storage: hoy en `props` todo se guarda como número, y `_merge` filtra por
`Number.isFinite` en ambos lados. Opciones: `bool` → 0/1 y `enum` → índice (no toca nada),
o ampliar el esquema a `props: { [key]: number | string | boolean }` (toca `_merge` en JS y
Python). La primera es suficiente para `visibility` y `mute`; la segunda hace falta para
`blend mode` y estilos de texto.

---

## 4. El limitador real: el export

**Esta sección debería gobernar el catálogo de propiedades, no la lista de deseos.**

El preview (canvas 2D en `render/canvas.js`) puede animar cualquier cosa: es JS por
fotograma. El export es un **grafo de filtros FFmpeg**, y ahí solo se puede animar una
propiedad si su filtro acepta **expresiones evaluadas por fotograma**. Y existe el
invariante del proyecto: *el export debe replicar el preview*. Una propiedad animable en
preview pero no en export es un bug garantizado.

### 4.1 Vías disponibles, de barata a cara

| Vía | Cómo | Suavidad | Coste |
|---|---|---|---|
| **Expresión nativa** | El filtro acepta `t` y `eval=frame` (`overlay`, `scale`, `crop`, `rotate`, `volume`, `eq`, `hue`) | Continua | Nulo |
| **`ffmpeg_envelope`** | El generador de expresiones por tramos que ya tienes | Continua, con easing | Nulo |
| **`sendcmd`** | Órdenes a un filtro en instantes dados | **Escalonada** (no interpola) | Bajo |
| **`geq`** | Expresión **por píxel** | Continua | **Alto** (ya se paga en `opacity`) |
| **Render por fotogramas** | Sacar PNGs y recomponer | Total | Muy alto |

### 4.2 Viabilidad por propiedad

Leyenda: ✅ viable ya · 🟡 viable, hay que cablearlo · ⚠️ solo escalonado o caro · ❌ no realista hoy

| Categoría | Propiedad | ¿Existe hoy? | Export | Nota |
|---|---|---|---|---|
| 1 Transform | Position X/Y | ✅ | ✅ | `overlay eval=frame` |
| 1 | Scale uniforme | ✅ | ✅ | `scale eval=frame` |
| 1 | Scale X / Y por separado | ❌ | 🟡 | `scale` admite w/h independientes |
| 1 | Rotation (Z) | ✅ | ✅ | `rotate` |
| 1 | Anchor Point X/Y | ❌ | 🟡 | Cambia la matemática de `overlay`; afecta también al preview |
| 1 | Skew X/Y | ❌ | ❌ | FFmpeg no tiene shear 2D directo; haría falta `perspective` |
| 1 | Position Z, Rotation X/Y, Perspective | ❌ | ❌ | Requiere motor 3D. Fuera de alcance |
| 2 Compositing | Opacity | ✅ | ✅ | `geq` — **caro**, ya se paga |
| 2 | Blend Mode | ❌ | ❌ | Cambiar de `blend` a mitad de clip exige partir el grafo |
| 2 | Visibility | ❌ | 🟡 | Discreta; se puede resolver como opacity 0/1 con `step` |
| 3 Crop | Crop X/Y (pan) | ✅ (`cx`,`cy`) | ✅ | `crop=x:y` |
| 3 | Crop Width/Height | parcial (`zoom`) | ⚠️ | **El tamaño de salida no puede variar por frame.** Tu propio comentario en `clip_fx.py:303` dice que *FFmpeg 9 revienta (Win 0xC0000005) si `crop` cambia de tamaño cada fotograma*. Se emula con `scale`, como ya haces |
| 3 | Crop Top/Bottom/Left/Right | ❌ | ⚠️ | Igual: reformular como scale+pad |
| 4 Máscara | Pos / Size / Scale / Rot / Feather | ✅ (8 claves) | ✅ | Ya animables |
| 4 | Mask Opacity / Expansion | ❌ | 🟡 | |
| 4 | Vértices Bézier | ❌ | ❌ | No hay máscaras Bézier en el editor |
| 5/6 Color | Brightness / Contrast / Saturation | ✅ estático (`eq`) | 🟡 | `eq` acepta expresiones con `eval=frame` — **lo más rentable que puedes animar a continuación**. *Verificar con un render de prueba antes de prometerlo* |
| 5/6 | Hue | ✅ parcial | 🟡 | `hue` acepta expresiones con `t`. *Verificar* |
| 5/6 | Exposure, Gamma, Gain, Lift, Vibrance, Temperature, Tint, Highlights, Shadows, Whites, Blacks | ❌ | ⚠️/❌ | No existen. Algunos caben en `eq`/`curves`; `curves` **no** acepta expresiones |
| 5/6 | Curvas RGB | ❌ | ❌ | `curves` es estático; animarlo obliga a re-render |
| 5 Efectos | Blur amount | ✅ estático (`gblur`) | ⚠️ | `gblur.sigma` no es expresión. Vía `sendcmd` → **escalonado**, no suave |
| 5 | Sharpen / Grain / Pixelate | ✅ estáticos | ⚠️ | Igual que blur |
| 5 | Glow / Distorsión / Motion Blur | ❌ | ⚠️/❌ | No existen; varios no tienen filtro directo |
| 7 Audio | Volume | ✅ | ✅ | `ffmpeg_envelope`, ya hecho |
| 7 | EQ, Compressor, Reverb, Echo, Denoise, Distortion | ✅ (0–1) | 🟡 | Están en `KF_PROP_KEYS` pero **el export no genera envolvente para ellos**. Ver §4.4 |
| 7 | Pan | ❌ | 🟡 | `pan` / `stereotools` |
| 7 | Mute | ❌ | 🟡 | Discreta = volume 0 con `step` |
| 8 Velocidad | Playback Speed | ✅ estático + `speed_curve` | ⚠️ | `setpts` admite expresión, pero **cambia la duración** → rompe `start`/`out_point` y todo lo que va detrás. Y `atempo` no rampea suave. Es un subproyecto propio |
| 8 | Time Remapping | ❌ | ❌ | Obliga a repensar el modelo de tiempo del clip |
| 9/10 Texto | Position / Scale / Rotation / Opacity | ✅ (vía transform) | ✅ | |
| 9/10 | Font Size, Letter Spacing, Line Height, Stroke, Shadow, Text Reveal | ❌ animables | 🟡 | **Caso especial**: el texto sale por ASS (`text_ass.py`), no por `drawtext`. ASS tiene animación nativa (`\t`, `\move`, `\fad`, `\clip`) — **es la vía más barata de todo el documento** para animar texto, y no pasa por el motor de expresiones de FFmpeg |
| 17 Transiciones | Progress / Amount | parcial (`appear`/`exit`) | 🟡 | Ya hay `fade`, `pop`, `dissolve` y wipes con ventanas |
| 19 Cámara | Camera X/Y/Zoom/Rotation | ❌ | — | Conceptualmente es el `reframe` que ya existe, pero a nivel de proyecto en vez de clip |

### 4.3 La regla que sale de la tabla

> El **modelo** puede declarar animable cualquier propiedad.
> La **UI** solo debe ofrecer el ◆ en las que el registro declare un `export` no nulo.
> Una propiedad con `export: null` se anima en el preview y **miente** en el resultado final.

Por eso el campo `export` del registro no es decorativo: es el contrato que impide que el
catálogo crezca por delante de lo que el render puede cumplir.

### 4.4 Deuda ya existente que conviene mirar

Los 6 FX de audio (`eq`, `compressor`, `reverb`, `echo`, `denoise`, `distortion`) **están en
`KF_PROP_KEYS`** y se interpolan en el preview, pero `audio_fx_chain` (`clip_fx.py:172`) los
lee como valor **constante**. Si el usuario los anima, el export no lo refleja. Es un bug
pequeño y aislado, y es el caso de prueba perfecto para generalizar `ffmpeg_envelope` más
allá de `volume`.

---

## 5. Plan por fases

### Fase A — Reglas de creación *(el arreglo de UX)*

**Objetivo:** puntos 1 y 2 de la spec. Mover ≠ animar.

1. `upsertKeyframeAt` deja de forzar `enabled: true`. Se promueve `enableKeyframes` (que ya
   existe) al rol explícito de "activar animación", en vez de ser un efecto colateral.
2. `commitPose` pasa a:
   ```js
   let next = applyStaticPose(c, patch)
   if (keyframesEnabled(c)) {
     const t = localTOf(next)
     next = upsertKf(next, t, patch)
     if (c.id === id) markKf(next, t)
   }
   ```
   Idéntico en `changeTransform`, `applyClipFrame` y el commit de encuadre.
3. `KfDia` (el rombo) pasa de dos estados a tres:
   - **○ apagado** — propiedad no animada. Clic = "activar animación" → siembra el primer KF
     con el valor actual (punto 2 de la spec).
   - **◆ lleno** — animada y hay KF en el cabezal. Clic = borrar ese KF.
   - **◇ hueco** — animada pero sin KF en el cabezal. Clic = crear KF aquí.
4. Acción "Desactivar animación" que hornee el valor del cabezal como estático.
   `disableKeyframes` ya existe, pero hoy conserva `items` sin hornear: hay que decidir si
   al apagar se congela el valor visible (recomendado) o se vuelve al estático anterior.

Archivos: `VideoEditor.jsx` (4 funciones), `clipKeyframes.js`, `EdTransform.jsx` (`KfDia`).
Backend: `clip_keyframes.py` **solo si** `upsert_keyframe_at` debe seguir la misma regla. El
MCP normalmente quiere crear+activar en un paso, así que lo más probable es dejarlo como
está y documentar la asimetría.

Tests nuevos en `clipKeyframes.test.mjs`:

- clip sin animar + `commitPose` → `keyframes.enabled === false`, `items.length === 0`,
  `transform.x` cambiado
- clip animado + `commitPose` en `t` nuevo → un item más
- clip animado + `commitPose` sobre KF existente → mismo número de items, valores actualizados
- activar animación → un item con los valores estáticos actuales

**Riesgo de regresión (el único punto delicado de la fase):** `animate_clip` del MCP y
`applyVolumeFade` dependen de que `upsertKeyframeAt` active la animación. Ambos deben pasar
a llamar explícitamente a `enableKeyframes` primero.

### Fase B — Copiar / pegar / duplicar keyframes

Portapapeles nuevo (`kfClipboardRef`, junto al `clipClipboardRef` de `VideoEditor.jsx:242`):

```js
{ type: 'keyframe', props: { ... }, interpolation: 'ease-in-out', srcClipKind: 'video' }
```

Operaciones:

| Op | Comportamiento |
|---|---|
| **Copiar KF** | Serializa `props` + `interpolation` del KF seleccionado |
| **Pegar KF** | `upsertKeyframeAt(clip, playheadLocal, props, interpolation)` — hereda la regla de "si ya existe, actualiza" |
| **Copiar propiedades seleccionadas** | Diálogo con checkboxes por `group` del registro; filtra `props` antes de pegar |
| **Duplicar KF** | Copiar + pegar en `t + 1 s` (o en el cabezal si está en otro sitio) |

Atajos: el handler de teclado (`VideoEditor.jsx:2240`) ya intercepta `Ctrl+C/X/V` para clips.
Dos opciones:

- **Desambiguar por contexto**: si hay keyframe seleccionado (`selKfId != null`) y el foco
  está en la timeline, `Ctrl+C` copia el keyframe; si no, el clip.
- **Atajos propios**: `Alt+C` / `Alt+V` para keyframes.

Recomiendo la segunda: no rompe el muscle memory de copiar clips y evita un modo oculto.

UI: menú contextual sobre el rombo en `EdTimeline` + botones en la lista de `EdCrops`.

### Fase C — Registro de propiedades

Crear `propRegistry.js` + `prop_registry.py` (espejo, como ya se hace con
`clipKeyframes`/`clip_keyframes`). Poblarlo con **las 23 claves que existen hoy**, con el
`export` correcto de cada una. Derivar `KF_PROP_KEYS` del registro. Refactorizar
`staticProps` para leer los defaults del registro. **Sin cambios de storage → sin migración.**

Test de paridad: comprobar que el registro JS y el Python declaran exactamente las mismas
claves con los mismos defaults. El patrón ya existe en `test_export_preview_parity.py`.

### Fase D — Animado por propiedad

Escalón 1 (`animated: [...]`) como en §3.2. Retrocompatible: la ausencia de `animated`
significa "todas". Test de migración: un proyecto guardado sin `animated` debe renderizar
**idéntico** a antes.

Escalón 2 (pistas reales) solo si hace falta independencia temporal. La migración
snapshot → pistas es mecánica y reversible; conviene ejecutarla tras un `checkpoint` del MCP.

### Fase E — Ampliar catálogo

Orden por relación valor/coste, según §4.2:

1. **FX de audio** (`eq`…`distortion`) — generalizar `ffmpeg_envelope`. Cierra una
   divergencia preview/export que ya existe hoy. Coste mínimo.
2. **Color** (`brightness`, `contrast`, `saturation`, `hue`) — `eq`/`hue` con `eval=frame`.
   Mucho impacto visual, coste bajo. **Verificar con un render real antes de prometerlo.**
3. **Texto vía ASS** (`\t`, `\move`, `\fad`) — Text Reveal, font size, letter spacing. Es un
   camino paralelo que no pasa por las expresiones de FFmpeg.
4. **Scale X/Y separados**, **Mask opacity/expansion** — directos.
5. **Blur / Sharpen / Grain** — solo si aceptas escalones vía `sendcmd`, y lo marcas en la UI
   como "cambia en saltos".
6. **Speed ramping** — proyecto aparte, toca el modelo de tiempo del clip.

---

## 6. Invariantes que no se pueden romper

1. **Paridad preview ↔ export.** `canvas.js` y `compose.py` deben dar el mismo resultado.
   Ver `test_export_preview_parity.py`.
2. **Espejo JS ↔ Python.** `clipKeyframes.js` y `clip_keyframes.py` son función a función.
   Todo lo que se añada a uno va al otro, y el test de paridad debe cubrirlo.
3. **`t` es tiempo local del clip.** Cortar, mover o cambiar la velocidad de un clip no debe
   descolocar los keyframes (`speed` multiplica, ver `clip_speed`).
4. **Todo es deshacible.** Las operaciones nuevas (activar animación, pegar KF) deben entrar
   en `useEditorHistory` y, en el MCP, ser reversibles con `undo`.
5. **Retrocompatibilidad de proyectos.** Los timelines guardados no llevan `animated` ni
   registro. Cualquier campo nuevo es opcional y su ausencia reproduce el comportamiento viejo.
6. **FFmpeg 9.** Sin `*_script`, `rotate` con `c=0x00000000`, y `crop` de tamaño fijo (§4.2).

---

## 7. Lo que NO recomiendo hacer

- **Precargar el registro con las ~150 propiedades del listado.** Entradas sin UI, sin
  preview y sin export son deuda, no arquitectura. El registro vale por ser extensible, no
  por estar lleno.
- **Migrar a pistas por propiedad (D-2) antes de arreglar A.** El bug de UX se arregla en
  tres funciones; el refactor tarda mucho más y no lo arregla por sí solo.
- **Ofrecer el ◆ en propiedades con `export: ⚠️/❌`** sin marcarlo en la UI. Es peor que no
  tenerlas: el usuario ve el movimiento en el preview y no en el vídeo final.
- **Meter 3D, skew, cámara o time remapping** en esta ronda. Cada uno es un proyecto propio.

---

## 8. Resumen para decidir

| Fase | Esfuerzo aprox. | Qué desbloquea |
|---|---|---|
| A | ✅ hecha | Los 4 puntos de UX del primer mensaje |
| B | ✅ hecha | Copiar / pegar / duplicar keyframes |
| C | 1–2 sesiones | La base declarativa del segundo mensaje |
| D-1 | 1–2 sesiones | Animado por propiedad (rejilla de tiempos compartida) |
| D-2 | Varias | Pistas independientes estilo After Effects |
| E | Continuo | Catálogo, propiedad a propiedad, limitado por §4 |

A + B resuelven lo que duele hoy. C es la inversión que evita rehacer el motor. D y E son
crecimiento, no corrección.
