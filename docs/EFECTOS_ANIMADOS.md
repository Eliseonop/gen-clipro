# Efectos animados (VFX) y Paper Animator como efecto

> Estado: **plan, nada implementado** (2026-09-28).
> Objetivo: un **motor de efectos único** que permita crecer hasta una biblioteca grande de
> efectos animados (cientos), escribiendo **cada efecto una sola vez**, y convertir Paper Animator
> en el primer gran efecto de esa biblioteca («Papel recortado») aplicable a cualquier clip.
> Relacionado: [OPTIMIZACION_MEMORIA.md](OPTIMIZACION_MEMORIA.md) (el motor nace con presupuesto de
> RAM), [PAPER_ANIMATOR_MIGRACION.md](PAPER_ANIMATOR_MIGRACION.md), [CAPA_AJUSTE.md](CAPA_AJUSTE.md),
> [RECETAS.md](RECETAS.md), [KEYFRAMES_REDISENO.md](KEYFRAMES_REDISENO.md).

---

## 1. Cómo se llaman

Lo que buscas se llama **efectos de vídeo** (en inglés *video effects* o *VFX*). En CapCut está en la
pestaña **Efectos**. Junto a ellos hay otras tres familias con nombre propio:

| Familia | Qué hace | En CapCut | Ejemplos |
|---|---|---|---|
| **Efectos de vídeo** | Cambian los píxeles del clip con el tiempo | Efectos → Efectos de vídeo | glitch, temblor, VHS, destello, zoom borroso, papel recortado |
| **Animaciones** | Mueven el clip al entrar, al salir o en bucle | Animación → Entrada / Salida / Combo | rebote, giro, latido, deslizar, elástico |
| **Superposiciones (generadores)** | Pintan algo nuevo encima, sin partir de un clip | Efectos → Partículas / Luz / Marcos, Stickers animados | confeti, nieve, fugas de luz, polvo de película, marcos |
| **Transiciones** | Pasan de un clip al siguiente | Transiciones | barrido, zoom, glitch, fundido de tinta |

Los filtros de color que ya tienes (#18) y los ajustes (brillo, temperatura…) **no** son efectos
animados: son estáticos. Este plan trata de las cuatro familias de la tabla.

---

## 2. Punto de partida (lo que hay hoy)

| Pieza | Dónde | Limitación |
|---|---|---|
| Efectos «básicos» (blur, enfoque, glow, B/N, sepia, pixelar, VHS, grano) | `lib/clipFx.js` (`effectsCss`) ↔ `backend/app/clip_fx.py` (`effects_ffmpeg`) | Estáticos. **Cada efecto se escribe dos veces**: filtro CSS del canvas y filtro de FFmpeg. |
| Aparición y salida (fade, zoom, slide, pop, wipe) | `clipFx.js` (`clipFxAt`) ↔ `clip_fx.py` (`video_fx_chain`) | 7 opciones fijas de 0,4 s, también duplicadas. |
| `animate_clip` (MCP) | `backend/app/clip_motion.py` | Escribe keyframes en el clip: se mezclan con los del usuario y no se pueden quitar como «un efecto». |
| Paper Animator | `features/paper/` (modo aparte con pestaña propia) | Motor Canvas 2D + filtro SVG (`feTurbulence`, `feDisplacementMap`, `feMorphology`) que **FFmpeg no puede reproducir**; exporta un WebM en el navegador (mediabunny) que luego se importa al material; su estado es efímero. |
| Motor HyperFrames | `backend/app/motion/renderer/hyperframes.py` | Ya renderiza HTML en Chromium headless (Playwright) fotograma a fotograma, con alfa. **Es la pieza que falta reutilizar.** |

**El problema de fondo**: el preview (canvas del navegador) y el export (FFmpeg) son dos motores
distintos. Con 8 efectos se puede mantener la paridad a mano; con 200 no, y la mayoría de efectos
animados interesantes (partículas, glitch por bloques, papel rasgado, ondas) **no se pueden expresar
en FFmpeg**.

---

## 3. Decisión de arquitectura: un solo motor, en JavaScript

Cada efecto se escribe **una vez**, en JS (GLSL o Canvas 2D), y ese mismo código se ejecuta:

- en el **preview**, dentro del editor, en tiempo real;
- en el **export**, en un Chromium headless (Playwright, el mismo que ya usa Motion), que «hornea»
  el clip con su efecto a un archivo intermedio que `compose.py` usa como si fuera el material.

Así la paridad preview = export sale **por construcción**, no por disciplina.

| Alternativa | Veredicto |
|---|---|
| Seguir duplicando (JS + FFmpeg) | No escala y no permite efectos complejos. Solo se mantiene para los 8 básicos que ya existen. |
| GLSL en Python (`moderngl`) para el export | Rápido, pero no está instalado, no hay garantía de ruedas para Python 3.14 y **no cubre Canvas 2D** (Paper, partículas). Queda como plan B **solo** para efectos de shader si Chromium resultara lento. |
| Hornear en el navegador del usuario (como hace Paper hoy) | Falla si el export lo lanza el MCP o el chat sin el editor abierto. Descartado. |
| **Chromium headless con el mismo runtime** | **Elegida**: un solo código, sirve para shaders y Canvas 2D, funciona desde el MCP y reutiliza infraestructura existente. |

---

## 4. Los cuatro motores de efecto

| Motor | Qué recibe → qué produce | Preview | Export |
|---|---|---|---|
| **`anim`** (animaciones) | tiempo → delta de pose (x, y, escala, giro, opacidad) | se suma en `clipPropsAt` | **sin horneado**: el export ya muestrea la pose (`clip_keyframes.pose_sample_times`) |
| **`filter`** (efectos de vídeo) | fotograma del clip + tiempo → fotograma nuevo | etapa nueva en `drawSourceFor` | horneado del clip (`fx_bake.py`) |
| **`generator`** (superposiciones) | tiempo → fotograma propio con alfa | clip propio `kind:"vfx"` | horneado a WebM con alfa, compuesto **igual que un clip de Motion** |
| **`transition`** | dos fotogramas + progreso → fotograma | en el solape de dos clips | horneado del tramo de solape (fase posterior) |

### Por qué las animaciones van aparte

Una animación solo mueve el clip: no toca píxeles. Se describe como **datos** (curvas normalizadas
0–1 sobre su duración) que interpreta un evaluador pequeño, espejado en JS y Python con **vectores de
prueba compartidos** (el patrón que ya usa `audioFx.test.mjs`). Añadir una animación nueva = añadir un
JSON, sin código nuevo en ninguno de los dos lados.

```json
{ "id": "bounce_in", "name": "Rebote", "slot": "in", "dur": 0.6,
  "tracks": {
    "scale": [[0, 0.3, "outBack"], [1, 1]],
    "y":     [[0, 0.15, "outQuad"], [0.7, -0.02, "inOutSine"], [1, 0]],
    "opacity": [[0, 0], [0.25, 1]] } }
```

Las aparición/salida actuales (`appear`/`exit`) pasan a ser animaciones de este catálogo, con
compatibilidad hacia atrás (`appear:"zoom"` se lee como `zoom_in` de 0,4 s).

---

## 5. Modelo de datos

Un campo nuevo en el clip, **sin tocar** el `effects` actual (filtros estáticos):

```js
clip.vfx = [
  { uid: 'v1a2', effect: 'glitch_rgb', v: 1, enabled: true,
    params: { amount: 0.6, speed: 1.2, seed: 7 },
    from: 0, to: null },           // tramo dentro del clip (s locales; null = hasta el final)
  { uid: 'v9f0', effect: 'paper_cutout', v: 1, enabled: true, params: { … } },
]
clip.anim = { in: { id: 'bounce_in', dur: 0.6 }, out: null, loop: null }
```

- **Orden de la pila = orden del array** (se aplican de arriba abajo, como en CapCut).
- `v` = versión del efecto. Si más adelante se cambia el código de un efecto, se sube la versión y los
  proyectos viejos siguen renderizando con la anterior (o se migran a propósito). La versión entra en
  la clave de caché del horneado.
- Parámetros animables: fase posterior, con el modelo **por propiedad** que ya usa el estilo de texto
  (cada parámetro con sus propios keyframes), no con la instantánea de pose.
- Esquema Pydantic en `schemas.py` (`TimelineClip.vfx`, `TimelineClip.anim`); sin eso el backend los
  descartaría al recargar (misma trampa que tuvo `media_version`).

---

## 6. Anatomía de un efecto (el «SDK»)

Un efecto = **un archivo**. Todo lo demás (panel de propiedades, validación, MCP, miniatura, tests)
se deriva del manifiesto.

```js
// frontend/src/fx/effects/glitch/glitch_rgb.js
import { defineEffect } from '../../core/define.js'

export default defineEffect({
  id: 'glitch_rgb',
  v: 1,
  name: 'Glitch RGB',
  category: 'glitch',
  tags: ['glitch', 'rgb', 'digital', 'error'],
  engine: 'shader',            // 'shader' | 'canvas'
  pad: 0,                      // margen extra (0–0.5) si el efecto se sale del borde
  params: {
    amount: { type: 'range', min: 0, max: 1, step: 0.01, def: 0.5, label: 'Intensidad' },
    speed:  { type: 'range', min: 0.1, max: 4, step: 0.1, def: 1, label: 'Velocidad' },
    seed:   { type: 'seed', label: 'Variación' },
  },
  // uniforms automáticos: uSrc, uRes, uTime, uDur, uFrame + u_<param>
  frag: /* glsl */ `
    uniform float u_amount; uniform float u_speed;
    void main() { … }
  `,
})
```

Un efecto `canvas` exporta `render({ ctx, src, w, h, t, dur, frame, params, rand, assets })` en lugar
de `frag`.

**Reglas del SDK** (las comprueba un test automático sobre todos los efectos registrados):

1. **Determinista**: prohibidos `Math.random`, `Date.now` y `performance.now`. El azar sale de
   `rand(seed, frame)`. El mismo `t` debe dar el mismo fotograma (el export lo necesita).
2. **Tiempo local** del clip (0 = inicio de la barra), igual que el resto de `lib/`.
3. **Sin estado entre fotogramas**: el export puede pedir fotogramas en cualquier orden y en paralelo.
4. **Sin contextos propios**: el runtime presta el WebGL y los canvas (ver §7, presupuesto de RAM).
5. **Licencia**: solo código propio, MIT, BSD o CC0. Nada de Shadertoy (la mayoría es CC BY-NC-SA).
6. Cada efecto lleva su miniatura generada por script (§10) y aparece solo en la biblioteca.

**Catálogo compartido con el backend**: `npm run fx:build` (esbuild, ya viene con Vite) genera
`backend/app/fx/runtime.bundle.js` (lo que carga el Chromium del export) y
`backend/app/fx/catalog.json` (ids, parámetros y versiones, que usa el MCP para validar). Un test
comprueba que ambos están al día respecto a `frontend/src/fx/`. Así el export **no depende** de que
el servidor de Vite esté arrancado.

---

## 7. Preview (frontend)

- Carpeta nueva `frontend/src/fx/`:
  - `core/`: `define.js`, `registry.js`, `params.js` (valores por defecto y clamp), `rand.js`,
    `gl.js` (contexto WebGL2 compartido), `runtime.js` (`applyVfx(drawable, clip, t)`);
  - `effects/<categoría>/<id>.js`, `anims/*.json`, `generators/<id>.js`.
- **Gancho**: `render/canvas.js::drawSourceFor` ya encadena GIF → recorte de fondo. Se añade una
  tercera etapa: **GIF → recorte → vfx**. Para el resto del dibujo (recorte, pose, máscaras, fusión)
  el resultado «es» la fuente, igual que hoy con el recorte. Si el efecto tiene `pad`, el canvas
  resultante es mayor y la geometría usa el rectángulo de contenido (mismo problema que ya resolvió
  Paper con su margen: `contentRect`).
- **Un único contexto WebGL2** para todo el editor. Por clip visible: subir el fotograma como
  textura, pasar el shader y copiar a un canvas de salida (LRU de canvas **solo de clips visibles**,
  con tope en MB). Los navegadores limitan unos 16 contextos WebGL: uno por clip sería inviable y
  además multiplicaría la RAM.
- Durante la reproducción, los efectos `canvas` caros (Paper sobre vídeo) pueden calcularse a la
  escala del preview; en pausa, a resolución completa.
- Texto y figuras: fase posterior. Su entrada es la capa ya pintada (en el export, la capa renderizada
  por libass sobre fondo transparente), no un archivo.

---

## 8. Export (backend)

Módulo nuevo `backend/app/fx_bake.py`, siguiendo el patrón de `bg/cutout_export.py` (que ya hornea
el recorte de fondo a un intermedio):

1. **Clave de caché** = hash de (archivo + `mtime`, in/out, velocidad, fps del proyecto, tamaño,
   firma del recorte de fondo, pila `vfx` con versiones). Los horneados viven en `data/fxcache/`, con
   limpieza por antigüedad y tamaño total.
2. **Entrada**: FFmpeg prepara el tramo exacto que usaría `compose.py` (recorte temporal, velocidad,
   fps y alfa del recorte de fondo, reutilizando `compose._bg_source_chain`).
3. **Proceso**: una página `fx-render` en Chromium headless carga `runtime.bundle.js`, recibe los
   fotogramas, aplica la pila y devuelve RGBA.
4. **Salida**: intermedio sin pérdida con alfa (FFV1 `gbrap` en MKV, o PNG en MOV).
5. **Composición**: `compose._clip_path` sustituye el material por el horneado (in_point 0, velocidad
   1, alfa ya aplicado). **Pose, recorte, máscaras, fusión y filtros siguen en FFmpeg**, sin cambios.
6. Un solo navegador por export, reutilizado para todos los clips; progreso por el job del export.

Los generadores (`kind:"vfx"`) no tienen entrada: se hornean a WebM VP9 con alfa y `compose.py` los
trata como un clip de Motion.

### Spike técnico obligatorio (Fase E0)

Antes de construir nada encima hay que **medir** en la máquina de Edu, con 720×1280:

| Qué | Criterio de éxito |
|---|---|
| Transporte de fotogramas al Chromium y de vuelta: (a) `page.screenshot` como Motion, (b) `fetch`/`POST` binario contra un endpoint local, (c) decodificar y codificar dentro de la página con mediabunny (lo que ya hace `paperExport.js`) | el más rápido de los tres |
| Shader sencillo (glitch RGB) | ≥ 15 fps de horneado |
| Canvas 2D con filtro SVG (borde de Paper) sobre vídeo | ≥ 6 fps de horneado |
| WebGL en headless: ¿GPU (`--use-angle=d3d11`) o SwiftShader (CPU)? | saber cuál se usa y su velocidad |
| Paridad | diferencia de píxeles preview/export ≤ 2 niveles de media en 5 fotogramas |

Si no se llega a los mínimos: `moderngl` solo para los efectos `shader` (§3), manteniendo Chromium
para los `canvas`.

---

## 9. Paper Animator → efecto «Papel recortado»

Hoy Paper es un **modo** con su propia pestaña, timeline proyectada, keyframes propios y export
aparte. La propuesta es **sacar el motor** (`paperRender.js`) y dejar que cada pieza vaya a su sitio:

| Paper hoy | Pasa a ser |
|---|---|
| Borde blanco rasgado (grosor, rugosidad, detalle) | parámetros del efecto `paper_cutout` |
| Sombra (desplazamiento, desenfoque, color, opacidad) | parámetros del efecto |
| Textura de arrugas y ciclo de pliegue (opacidad, velocidad, modo de fusión) | parámetros del efecto (las 16 texturas de `public/paper-animator/assets/texture/` son sus assets) |
| Movimiento «stop-motion» (vibración de giro y posición) | parámetros del efecto (`movementAt` ya es función pura del tiempo) |
| Abrir / cerrar (pliegue de 1 s) | animaciones `paper_unfold_in` / `paper_fold_out` del catálogo |
| Corrección de color | **se elimina**: ya existen filtros y ajustes en el editor |
| Recorte de la imagen | el recorte del editor (`EdCropModal`) |
| Pincel y borrado por color | Eliminar fondo personalizado (pincel) y croma del editor |
| Quitar fondo | Eliminar fondo del editor (Paper ya usaba ese motor) |
| Keyframes x/y/escala/giro | keyframes de pose del editor |
| Fondo (color, imagen, viñeta) | lo que haya debajo en la timeline |
| Exportar WebM al material | innecesario: el efecto se renderiza en el export (se puede ofrecer «Guardar como material») |
| Texto con letras recortadas (`assets/alfnum`) | **generador** `paper_letters` (clip `kind:"vfx"` con texto, estilo de letras, semilla y el mismo borde/sombra/vibración por letra) |

**Ganancias**: el papel se aplica a **cualquier** clip (imagen, sticker, GIF, vídeo con fondo quitado,
y más adelante texto); se guarda con el proyecto (se acaba el «estado efímero» pendiente); entra en el
undo, en las recetas y en pegar atributos; y el MCP puede aplicarlo.

**Cambios técnicos en el motor**:

- La silueta rasgada hoy se genera 4 veces por imagen con `toDataURL` → `Image` (cadenas base64
  enormes y 4 imágenes a tamaño completo por letra). En el runtime se dibuja **directamente a un
  canvas** del pool, sin `toDataURL`.
- Para vídeo con fondo quitado, la silueta cambia en cada fotograma: se calcula por fotograma (la
  semilla sigue el ciclo de pliegue, que da el aspecto «stop-motion»). Hay que medir su coste en el
  spike.
- El `<filter>` SVG del borde lo monta el runtime (no `PaperCanvas`); es único y se reconfigura por
  semilla antes de cada dibujo, de forma síncrona.
- Margen: el papel sale del borde de la imagen → `pad` ≈ 0,25 (el mismo 1/6 que usa `contentRect`).

**Retirada de la pestaña Paper** (solo cuando haya paridad): se quitan `PaperCanvas`, `PaperProps`,
`PaperEditLayer`, `PaperElements`, `paperTimeline.js`, `paperExport.js`, `usePaperComp.js`, su tab en
`.ed-col-tabs` y en el rail de `EdMaterial`. Se conservan, movidos a `fx/`, el render, los
transforms, `paperText.js` (para el generador de letras) y las texturas. Los WebM «paper-animation…»
ya exportados siguen siendo material normal.

---

## 10. Interfaz

- **Biblioteca** (`EdFxLibrary`, pestaña Efectos): categorías, búsqueda por nombre y etiquetas,
  favoritos (ya existe `useFavorites`) y recientes. Tarjetas con **miniatura estática WebP**
  (generada por `npm run fx:thumbs` con el mismo Chromium) y vista previa **en vivo solo al pasar el
  ratón**, en un único canvas compartido. Rejilla virtualizada: con cientos de efectos no puede haber
  un `<video>` ni un canvas por tarjeta (ver OPTIMIZACION_MEMORIA, Fase 3).
- **Aplicar**: clic = añadir al clip seleccionado; arrastrar = soltar sobre un clip de la timeline;
  los generadores se arrastran a una pista como cualquier material.
- **Inspector**, sección «Efectos»: la pila del clip con activar/desactivar, reordenar, quitar, tramo
  (desde/hasta) y los parámetros generados desde el esquema con los componentes que ya existen
  (`InspSlider`, `NumberStepper`, `FlipSelect`, selector de color).
- **Inspector**, sección «Animación»: Entrada / Salida / Bucle con su duración (sustituye a la
  pestaña de transiciones actual, que solo ofrece aparición y salida).
- **Timeline**: un distintivo «fx» en el clip con efectos; los generadores son clips normales.
- **Capa de efectos** (fase posterior): como la capa de ajuste (#19), un clip que aplica un efecto a
  **todo lo de debajo**. En el export obliga a una pasada intermedia (componer lo de debajo en su
  tramo, hornear el efecto y seguir), así que va después de tener el horneado por clip estable.

---

## 11. MCP e IA

- `list_effects(category?, query?)` (lectura) y `apply_effect(project, clip_ids, effect, params?,
  from?, to?, remove?)` (escritura, 1 undo). Recurso `effects://catalog` para `describe_capabilities`.
- `animate_clip` pasa a escribir `clip.anim` (no keyframes) cuando la animación exista en el
  catálogo; los keyframes quedan para lo que sea realmente a medida.
- Recetas (#21) y pegar atributos (#13, grupo nuevo «Efectos animados») incluyen `vfx` y `anim`.
- La validación usa `catalog.json`: un efecto o parámetro inexistente devuelve un error estructurado
  (`MCPError`), no un clip roto.
- Cada efecto nuevo se documenta en su categoría de `docs/EFECTOS_CATALOGO.md` y en `NOVEDADES.md`.

---

## 12. Hoja de ruta de la biblioteca

Primer lote propuesto (≈45), elegido para cubrir las categorías de CapCut con poco código por efecto:

| Categoría | Efectos | Motor |
|---|---|---|
| Animaciones de entrada/salida | rebote, elástico, giro, zoom, deslizar ×4, caer, desenfoque de entrada, balanceo, abrir/cerrar papel | `anim` |
| Animaciones en bucle | latido, temblor, flotar, péndulo, respirar, sacudida de cámara | `anim` |
| Glitch | RGB split, bloques, líneas de escaneo, interferencia, pantalla rota digital | `filter` shader |
| Retro | VHS con desplazamiento, película 8 mm, CRT, grano + polvo + rayas | `filter` shader |
| Distorsión | ondas, ojo de pez, remolino, espejo ×2/×4, caleidoscopio, pantalla dividida ×3/×4 | `filter` shader |
| Luz | destello (flash), estroboscopio, fuga de luz, brillo pulsante, bokeh | `filter` / `generator` |
| Lente | zoom borroso, desenfoque radial, aberración cromática pulsante, viñeta pulsante | `filter` shader |
| Estilo | papel recortado, contorno de neón, cómic (semitono), boceto, recorte con borde blanco (sticker) | `filter` canvas/shader |
| Partículas | confeti, nieve, lluvia, chispas, corazones, polvo flotante | `generator` |
| Marcos | película, polaroid, cámara grabando (REC), visor | `generator` |
| Transiciones | ~40 de gl-transitions (licencia MIT, verificar una por una) | `transition` |

Después, crecer por lotes de 10–20 con un **laboratorio de efectos** (página de desarrollo que
muestra un efecto sobre material de prueba con sus sliders, y genera miniatura y tests). Como un
efecto es un archivo pequeño con un esquema fijo, también lo puede escribir la IA del chat o Claude
Code siguiendo el SDK.

---

## 13. Fases

| Fase | Contenido | Esfuerzo | Criterio de salida |
|---|---|---|---|
| **E0. Spike** | medidas del §8 en la máquina de Edu | 1 día | se elige el transporte y se confirma que Chromium llega |
| **E1. Núcleo** | `fx/core`, modelo `vfx`/`anim` + esquema, etapa en `drawSourceFor`, WebGL compartido, `fx_bake.py` + caché + sustitución en `compose.py`, `fx:build`, 3 efectos piloto (1 `anim`, 1 shader, 1 canvas), tests de determinismo y de paridad | 4–5 días | los 3 pilotos se ven igual en preview y export, desde el editor y desde el MCP |
| **E2. Interfaz** | biblioteca con miniaturas, inspector de pila, sección Animación, migración de `appear`/`exit` | 2–3 días | aplicar, editar y quitar sin tocar código |
| **E3. Papel recortado** | efecto `paper_cutout` + animaciones de pliegue, sobre imagen/GIF/vídeo con fondo quitado | 3 días | un clip con papel se ve y exporta igual que en Paper hoy |
| **E4. Generadores** | `kind:"vfx"`, partículas y marcos, generador `paper_letters` | 3 días | letras recortadas funcionan sin la pestaña Paper |
| **E5. Retirar la pestaña Paper** | borrar el modo y documentar las equivalencias | 1 día | nada de Paper queda sin equivalente |
| **E6. MCP** | `list_effects`, `apply_effect`, recetas, pegar atributos | 1–2 días | la IA aplica efectos |
| **E7. Biblioteca** | primer lote del §12, por lotes | continuo | ~45 efectos |
| **E8. Transiciones y capa de efectos** | dos entradas; pasada intermedia en el export | 4–5 días | — |

**Orden conjunto con la RAM**: primero las Fases 0–1 de OPTIMIZACION_MEMORIA (lo que duele hoy y
deja listas las utilidades de caché por bytes que usará el runtime), luego E0–E3, después la Fase 2
de memoria (pool de medios), y el resto en paralelo.

---

## 14. Riesgos y trampas conocidas

- **Tiempo de export**: cada clip con efecto añade un horneado. La caché lo paga una sola vez por
  combinación; hay que mostrar el progreso por clip en el job.
- **Precisión de fotograma**: la entrada del horneado la prepara FFmpeg con la misma cadena que
  `compose.py` (no se busca por `currentTime` en un `<video>`), para evitar desfases con VFR (ver
  `test_vfr_trim.py`).
- **`pad` y geometría**: un efecto que se sale del borde agranda la fuente; recorte, pose y máscaras
  deben seguir refiriéndose al contenido original. Test específico.
- **Códecs en Chromium headless**: el Chromium de Playwright no trae H.264; la entrada no puede ser un
  mp4 H.264 decodificado en la página (usar fotogramas crudos, VP9 o FFV1).
- **Filtros SVG en canvas**: `ctx.filter = 'url(#id)'` busca el id en el documento; si el `<filter>`
  no está montado, el borde desaparece **sin error** (trampa ya vista en Paper).
- **Invariantes del export de overlays** (memoria `overlay-export-invariantes`): el horneado sustituye
  el archivo, pero la cadena de pose sigue igual; no introducir `format` tras `scale=eval=frame`.
- **RAM**: el runtime no crea contextos WebGL por clip ni cachés sin tope; todas sus cachés usan la
  utilidad de LRU por bytes de OPTIMIZACION_MEMORIA, Fase 1.

---

## 15. Decisiones pendientes

1. **Motor del export**: Chromium headless (recomendado) frente a `moderngl`. Se confirma con el
   spike E0.
2. **Pestaña Paper**: retirarla del todo cuando haya paridad (recomendado) o mantenerla solo para las
   letras recortadas.
3. **Alcance del primer lote**: el del §12 o priorizar categorías concretas para tus shorts (por
   ejemplo glitch, temblor y destellos para los tráileres).
