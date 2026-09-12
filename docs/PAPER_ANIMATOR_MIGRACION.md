# Paper Animator — migración a tab nativo del editor

Estado: **implementado**. Sustituye al modal con iframe (`PaperAnimatorModal.jsx` +
`frontend/paper-animator/`), ambos eliminados.

Objetivo: que Paper Animator deje de ser una herramienta externa embebida y pase a
ser un **modo del editor** (como Motion Studio): tab propio en la columna central,
propiedades en el inspector derecho, materiales en el panel izquierdo y su
animación sobre la **timeline del editor**.

---

## 1. Arquitectura actual de Paper Animator

Vanilla JS, entrada de Vite propia (`frontend/paper-animator/index.html`), cargada
en un `<iframe src="/paper-animator/index.html?embed=1">` dentro de un modal.

| Módulo | Líneas | Qué es | Destino |
|---|---|---|---|
| `index.html` | 1566 | Todo el DOM de la UI (paneles, acordeones, popups) | **Eliminar** → JSX |
| `styles.css` | 2232 | Tema propio + Tailwind (único consumidor de Tailwind del repo) | **Eliminar** → `editor.css` |
| `edit-mode.js` | 702 | Overlay a pantalla completa: pincel / borrado por color / recorte con pan+zoom | **Refactor** → capa sobre el stage |
| `export-module.js` | 625 | Mediabunny (mp4/mov/mkv/webm) + PNG/JPG; progreso por DOM | **Refactor** → función pura + `Toast` |
| `events-global.js` | 500 | Listeners por `getElementById` | **Eliminar** (JSX) |
| `renderer.js` | 535 | `draw()` canvas 2D + caché de bordes rasgados | **Portar** (des-DOM-ificar) |
| `keyframes.js` | 354 | Datos de keyframes + render de listas/paneles por `innerHTML` | **Partir**: datos → modelo; DOM → JSX |
| `ui-controls.js` | 340 | `skinSlider`, `syncSliderAndInput`, notificaciones, confirmación | **Eliminar** → `InspSlider` / `Toast` / `ConfirmModal` |
| `layout.js` | 248 | Tabs, resizer de panel, layout móvil | **Eliminar** → `usePanelLayout` |
| `ui-sync.js` | 244 | Empuja `state` → DOM | **Eliminar** (React re-renderiza) |
| `eraser.js` | 196 | Cableado DOM del borrador | **Eliminar** → panel JSX |
| `translations.js` | 193 | i18n `data-translate-key` | **Eliminar** (editor es solo ES) |
| `animation.js` | 183 | Bucle rAF, jitter de movimiento, ciclo de pliegue, FPS/debug | **Portar** al hook |
| `embed.js` | 173 | Puente postMessage + cirugía del DOM | **Eliminar** (ya no hay iframe) |
| `state.js` | 171 | Singleton `state` + preferencias en localStorage | **Portar** → estado React |
| `events-object.js` | 151 | Listeners | **Eliminar** |
| `image-handler.js` | 149 | Carga/resample/padding de la imagen | **Portar** |
| `constants.js` | 147 | `DEFAULT_STATE`, `EASING`, URLs de texturas, mapas de resolución | **Portar** |
| `exportBridge.js` | 115 | Llama al export con **25 argumentos posicionales** | **Eliminar** (API con objeto) |
| `scripts.js` | 93 | Bootstrap `DOMContentLoaded` | **Eliminar** → `useEffect` |
| `transforms.js` | 79 | `getAdvancedTransform`, `getVisualStateAtTime` — **puro** | **Portar tal cual** |
| `erase-utils.js` | 74 | `brushErase`, `colorErase` — **puro** | **Portar tal cual** |
| `utils.js` | 68 | `lerp`, `hexToRgba`, `seededRandom`, `throttle` | **Portar parcial** (el editor ya tiene algunos) |
| `events-background.js` | 76 | Listeners | **Eliminar** |

**Total ~9.4k líneas → se conserva el motor (~1.6k) y se tira el andamiaje (~7.8k).**

### Estado
`state` es un **singleton mutable** (`state.js`), clonado de `DEFAULT_STATE`:

```
state
├── aspectRatio, previewResolution, canvasDisplayResolution
├── language / displayMode / uiSize / accentColor / debugScreenEnabled   ← app standalone
├── background { element, color, file, transform{mode,size,rotation,offset}, effects{colorCorrection,blur,vignette} }
├── export { duration, fps, filename, format, jpgQuality, transparentBackground }
└── object
    ├── image { element, originalElement, uneditedElement, cropFrac, size, offset, rotation, isSVG }
    ├── stroke { enabled, width, roughness, detail, seed }        ← borde rasgado (filtro SVG)
    ├── shadow { enabled, offsetX, offsetY, blur, color, opacity }
    ├── color  { enabled, hue, saturation, brightness, colorize }
    ├── movement { enabled, mode, simpelSpeed/Strength, rotationSpeed/Strength, positionSpeed/Strength, … }
    ├── paperFoldOverlay { enabled, currentImageIndex, opacity, speed, blendMode }
    ├── eraser { enabled, mode, brushSize, colorTolerance, dirty }
    └── animation { mode: simple|advanced, simple{open,close}, isPlaying, previewTime,
                    activeKeyframeId, keyframes[{id,time,x,y,scale,rotation,easing,paperAnim}] }
```

Más estado suelto fuera del objeto: `animationStartTime`, `pauseStartTime`,
`keyframeClipboard`, `needsRedraw`, `tornEdgeCache`, `isGeneratingCache`,
`isLiveTornEdgePreview` (todos en variables de módulo).

### Render
`renderer.js::draw()` es canvas 2D puro **salvo** por tres acoplamientos:
1. `canvas`/`ctx` vienen de `getElementById('main-canvas')`.
2. El borde rasgado usa `ctx.filter = 'url(#combined-filter)'`, que referencia un
   `<filter>` SVG inline del `index.html` cuyos nodos (`torn-dilate`, `torn-turbulence`,
   `torn-displacement`, `torn-flood`) se mutan por `setAttribute`.
3. `updateInternalCanvasResolution()` lee `document.getElementById('image-size').max`.

Pipeline: fondo (color → imagen con fill/stretch → viñeta) → objeto
(`drawFinalObject`: imagen + overlay de pliegue whitened + capa de papel →
`destination-in` con el borde rasgado → máscara de papel) → sombra + rotación → stamp.

### Animación
Bucle rAF propio con flag `needsRedraw`. Tres relojes distintos:
`animationStartTime` (reproducción), `previewTime` (scrub/keyframe seleccionado),
`pauseStartTime` (pausa). El jitter de movimiento y el ciclo de pliegue avanzan con
el mismo `elapsedTime`.

### Export
Cliente, con **mediabunny** (`CanvasSource` → mp4/mov/mkv/webm) o `toBlob` para
PNG/JPG. En modo embed no descarga: llama a `window.__paperimaOnExport(blob,…)`,
que `embed.js` reenvía por `postMessage` al modal, que hace `uploadVideo()`.

---

## 2. Arquitectura actual del editor principal

```
VideoEditor.jsx (3020 líneas)  ── .veditor (flex column)
├── EdTopBar                    undo/redo, export, guardar clip, chat, ajustes
├── .veditor-workspace (flex row)
│   ├── EdMaterial              panel izq. · rail de iconos MAT_TABS
│   ├── EdSplit x "materials"
│   ├── .ed-canvas-col
│   │   ├── .ed-col-tabs        ← Main Editor | Clip Editor | Motion Studio
│   │   ├── stage según modo    (.ed-canvas-stage | .ed-motion-canvas)
│   │   └── .ed-transport       play/seek/tiempo + EdViewerTools (zoom/formato)
│   ├── EdSplit x "inspector"
│   └── EdInspector | MotionProps   panel der.
├── EdSplit y "bottom"
└── .veditor-bottom → EdTimeline
```

### Piezas reutilizables (inventario)

| Qué | Dónde | Uso en Paper Animator |
|---|---|---|
| `InspSection` | `EdTransform.jsx` | Acordeón con título, reset y diamante de keyframe → **sustituye los `accordion-section` de PA** |
| `InspSlider` | `EdTransform.jsx` | Label + range + `NumberStepper` + KF → **sustituye `syncSliderAndInput`/`skinSlider`** |
| `NumberStepper` | `EdTransform.jsx` | Input numérico con flechas |
| `KfDia` | `EdTransform.jsx` | Diamante de keyframe |
| `ed-mode-toggle` | `editor.css` | Toggle compacto con checkbox → **sustituye los switches de PA** |
| `ed-btn` / `.primary` / `.danger` | `editor.css` | Botones compactos |
| `ed-insp-nav` / `ed-insp-sub` | `editor.css` | Navegación del inspector → **sustituye las tabs Fondo/Objeto/Animación** |
| `FlipSelect` | `components/` | Select con popover → formato de export, blend mode |
| `FlipPopover`, `AnchoredMenu` | `components/` | Popovers/menús |
| `Icon` | `components/` | Material icons → **sustituye los SVG inline de PA** |
| `Toast` | `components/` | → **sustituye `showTopNotification`** |
| `ConfirmModal` | `components/` | → **sustituye `showConfirmationPopup`** |
| `JobStatusBar` | `components/` | Progreso → **sustituye el popup de export** |
| `EdTimeline` | `features/editor/` | Regla + zoom + playhead + pistas + keyframes → **timeline de PA** |
| `timelineScale.js` | `features/editor/` | `buildTicks`, `fmtRuler`, `clampPps`, `zoomByDrag` |
| `useEditorHistory` | `hooks/` | Undo/redo por snapshot → **undo de PA** |
| `usePanelLayout` + `panelLayout.js` | — | Paneles redimensionables persistidos → **sustituye `layout.js` entero** |
| `uploadVideo` | `services/api.js` | Subir el resultado al material |
| `lib/utils.js`, `lib/panning.js` | — | `fmt`, `clamp` |

### Patrón de referencia: Motion Studio
Motion es exactamente el molde a copiar:
- Estado en un hook (`useMotionComp`) que vive en `VideoEditor`.
- `mainColTab === 'motion'` activa el modo; `motionModeRef` bloquea el autosave de la
  timeline del proyecto.
- **Sus capas se convierten en pistas/clips** (`motionLayersToTimeline`) para reutilizar
  `EdTimeline` sin escribir una timeline nueva; dos `useEffect` sincronizan en ambos
  sentidos (clips→capas por tiempos, capas→clips por estructura).
- El inspector derecho se **sustituye** por `MotionProps` cuando el modo está activo.
- El panel izquierdo tiene una tab propia (`matTab === 'motion'` → `MotionElements`).

---

## 3. Puntos de integración

| # | Punto | Cómo |
|---|---|---|
| 1 | Tab central | `mainColTab`: `main \| clip \| motion` → **`+ 'paper'`**; botón en `.ed-col-tabs` |
| 2 | Stage | `.ed-paper-canvas` con `<PaperCanvas>`; `.veditor.paper-mode .ed-canvas-stage{display:none}` |
| 3 | Inspector | `mainColTab === 'paper'` → `<PaperProps>` en lugar de `<EdInspector>` |
| 4 | Panel izq. | `MAT_TABS` += `{ id:'paper', icon:'draw', label:'Paper' }` → `<PaperElements>` |
| 5 | Timeline | `paperStateToTimeline(paper)` → `tracks`/`clips` de `EdTimeline` |
| 6 | Transporte | `.ed-transport` propio dentro de `.ed-paper-canvas` (como motion) |
| 7 | Undo/redo | Segunda instancia de `useEditorHistory` sobre el estado de PA |
| 8 | Formato | `aspectRatio` deriva de `outW/outH` del proyecto (ya no es un enum propio) |
| 9 | Entrada | Imagen del material → `paper.loadImage(...)`; también el botón de la tarjeta de imagen |
| 10 | Salida | `exportPaperVideo()` → `uploadVideo()` → `onRefresh()` (igual que hoy) |

---

## 4. Componentes duplicados y decisión

| Paper Animator | Editor | Decisión |
|---|---|---|
| `skinSlider` + `syncSliderAndInput` + `initContinuousSlider` | `InspSlider` + `NumberStepper` | **Gana el editor.** Se borran los 3. |
| `accordion-section` (CSS + JS) | `InspSection` | **Gana el editor.** |
| `showTopNotification` | `Toast` | **Gana el editor.** |
| `showConfirmationPopup` | `ConfirmModal` | **Gana el editor.** |
| Popup de progreso de export | `JobStatusBar` / `Toast` | **Gana el editor.** |
| `layout.js` (resizer, tabs, móvil) | `usePanelLayout` | **Gana el editor.** |
| `translations.js` | — (español fijo) | **Se borra.** |
| SVG inline por icono | `Icon` (material-icons) | **Gana el editor.** |
| Tailwind | `editor.css` (variables propias) | **Gana el editor.** Se quita Tailwind del build. |
| `utils.lerp` / `hexToRgba` | — | Se quedan (el editor no los tiene). |
| `erase-utils.brushErase/colorErase` | `bgCutout.paintEdits` | **Conviven.** Modelos distintos: PA hornea el alfa en la imagen fuente (lo exige el borde rasgado y las máscaras de papel); el editor guarda una lista de trazos no destructiva por clip. No se fusionan; se documenta la diferencia. |
| `edit-mode.js` (recorte con pan/zoom) | `EdCrops` (recorte de clip) | **Conviven.** El de PA recorta la imagen **fuente**; el del editor encuadra en la salida. Se reutiliza el *patrón de UI* de `EdBgRemove` (panel abierto ⇒ pincel activo sobre el stage), no el código. |
| Bucle rAF de PA | `requestAnimationFrame` del preview del editor | **Conviven.** PA necesita su reloj (jitter + ciclo de pliegue + `needsRedraw`). Se aísla en `usePaperComp`. |
| Export cliente (mediabunny) | Export backend (FFmpeg) | **Conviven.** PA renderiza canvas 2D en el navegador; portarlo a FFmpeg sería reescribir el producto. Se mantiene mediabunny (ya es dependencia npm). |

---

## 5. Estructura final propuesta

```
frontend/src/features/paper/
├── paperModel.js        DEFAULT_PAPER_STATE, EASING, texturas, keyframe ops (puro)
├── paperTransforms.js   getAdvancedTransform, getVisualStateAtTime (puro, tal cual)
├── paperErase.js        brushErase, colorErase, paintDot, parseClampedInt (puro, tal cual)
├── paperAssets.js       carga de las 16 texturas .webp (una vez por sesión)
├── paperImage.js        carga/resample/padding + vista recortada (cropView)
├── paperBg.js           puente con Eliminar fondo del editor (job + bgCutout)
├── paperRender.js       createPaperRenderer(): draw/drawFinalObject/caché de bordes
├── paperTimeline.js     paperStateToTimeline() + clips→keyframes
├── paperExport.js       exportPaperVideo({state, …, onProgress, signal}) → Blob
├── usePaperComp.js      hook: estado + rAF + undo/redo + acciones
├── PaperCanvas.jsx      stage: <canvas> + <defs> del filtro SVG + marco de transformación
├── PaperEditLayer.jsx   pincel / borrado por color / recorte sobre el stage
├── PaperElements.jsx    panel IZQUIERDO (tab "Paper" del material)
└── PaperProps.jsx       panel DERECHO (Objeto | Fondo | Animación | Salida)
```

Cambios en archivos existentes:

| Archivo | Cambio |
|---|---|
| `VideoEditor.jsx` | `mainColTab 'paper'`, `usePaperComp`, `goPaperTab`, stage, transporte, inspector, sincronía con la timeline |
| `EdMaterial.jsx` | `MAT_TABS` += `paper`; monta `PaperElements`; **quita** `PaperAnimatorModal` |
| `EdInspector.jsx` | sin cambios (se sustituye desde fuera, como motion) |
| `editor.css` | bloque `PAPER ANIMATOR` (stage, capa de edición, mini-piezas) |
| `vite.config.js` | fuera la entrada `paper-animator` y el plugin de Tailwind |
| `package.json` | fuera `tailwindcss`, `postcss`, `autoprefixer` |
| `hooks/useEditorHistory.js` | generalizado a `useEditorHistory(snapshot, enabled)` |

Se borran:
```
frontend/paper-animator/**                              (26 ficheros, ~9.4k líneas)
frontend/src/features/editor/PaperAnimatorModal.jsx
```
Se conservan: `frontend/public/paper-animator/assets/texture/*.webp` (16 texturas),
ahora referenciadas con ruta absoluta `/paper-animator/assets/texture/…`.

---

## 6. Flujo de datos

```
       material (imagen)                 EdMaterial → PaperElements
                │  loadImage(File|url)
                ▼
        usePaperComp  ── paperState (React) ──┬─→ PaperProps    (lee/escribe propiedades)
                │                             ├─→ paperStateToTimeline() ─→ EdTimeline
          rAF loop (propio)                   └─→ PaperCanvas   (ref al <canvas>)
                │                                      │
                │  draw(ctx, state, t)                 │ puntero: mover objeto / pincel / recorte
                ▼                                      ▼
          canvas 2D  ←──────────── paperRender ──── paperErase / recorte
                │
                │  exportPaperVideo()   (mediabunny, frame a frame)
                ▼
              Blob  ─→ uploadVideo(projectId, File) ─→ material "Vídeo"
```

Dirección de la sincronía con la timeline (igual que motion):
- **estado → timeline**: un `useEffect` re-deriva `tracks`/`clips` cuando cambian los
  keyframes, la duración o el modo.
- **timeline → estado**: mover un punto de keyframe llama a `paper.moveKeyframe(id, t)`;
  mover el playhead llama a `paper.seek(t)`.

---

## 7. Gestión de estado

`usePaperComp(projectId, { format })` devuelve un objeto plano (mismo contrato que
`useMotionComp`):

```js
{
  st,                       // el estado serializable de PA
  imgRef,                   // HTMLImageElement (fuera del estado: no serializable)
  patch(path, value),       // set inmutable por ruta ('object.stroke.width')
  patchMany(obj),
  // animación
  time, playing, play(), pause(), seek(t), setDuration(d),
  // keyframes
  addKeyframe(), removeKeyframe(id), selectKeyframe(id),
  patchKeyframe(id, patch), moveKeyframe(id, t),
  copyKf(), pasteKf(), clipboard,
  // imagen
  loadImage(fileOrUrl, name), clearImage(),
  // edición destructiva
  applyErase(canvas), applyCrop(rect), resetImage(),
  // salida
  exporting, progress, exportToMaterial(), cancelExport(),
  // undo/redo
  hist,
}
```

Reglas:
- Todo lo **serializable** va al estado de React (entra en undo/redo).
- Los `HTMLImageElement`/`HTMLCanvasElement` viven en refs (no son clonables por JSON);
  el estado guarda solo una **firma** (`imageSig`) para que el render sepa que cambió.
- Se elimina todo el estado de "app standalone": `language`, `displayMode`, `uiSize`,
  `accentColor`, `debugScreenEnabled`, preferencias en `localStorage`.
- `aspectRatio` deja de ser un enum propio: el canvas usa el formato del proyecto.

---

## 7 bis. Gestión de la imagen

La imagen del objeto se maneja en tres capas, y la diferencia entre ellas es lo
que decide qué es reversible y cómo:

| Capa | Dónde vive | Reversible con |
|---|---|---|
| `originalRef` | ref (Image del archivo, sin margen) | — es la fuente de verdad |
| `imgRef` | ref (re-muestreada + margen del 25 %) | **Restablecer imagen** (rehace desde `originalRef`) |
| `viewRef` | ref (derivada: `cropView(imgRef, crop)`) | **Restablecer recorte** (`crop: null`) |

Reglas:

- **El recorte no crea una imagen nueva.** `object.image.crop` es un rect
  normalizado (0-1) sobre la región útil; de él se deriva `viewRef`, que es lo que
  dibujan el preview y el export. Cambiarlo o quitarlo no toca un solo píxel de
  `imgRef`, y entra en el undo como cualquier otra propiedad.
- **El pincel y el borrado por color sí hornean el alfa** en `imgRef`: el borde
  rasgado y las máscaras de papel se calculan a partir de esos píxeles. Cada
  trazo bumpea `imageSig`, y `imgHistRef` guarda `{el, original}` por firma para
  que Ctrl+Z devuelva estado **y** píxeles a la vez.
- **Quitar fondo reutiliza Eliminar fondo del editor** (`paperBg.js`): el mismo
  job del backend (`/api/projects/{id}/bg-removal`, con su caché por `base_key`) y
  la misma derivación del alfa en el navegador (`editor/bgCutout.cutoutDrawable`).
  Lo único propio de PA es el final: el matte se aplica sobre `originalRef` (la
  geometría del archivo, sin margen) y se rehace el pipeline de papel. Si la
  imagen solo estaba en memoria, se sube antes al material — el job trabaja sobre
  el archivo.

Todas las herramientas cuelgan de `st.edit.tool` (`none | crop | brush | color`),
que **no** entra en el historial: deshacer no debería cambiarle el pincel al
usuario. Cada una se activa desde el panel; no hay un "Editar imagen" genérico
que haya que abrir primero.

Mover, escalar y girar se hacen sobre el lienzo con el marco de `PaperCanvas`
(DOM, no pintado en el canvas: el renderer es el mismo que el del export). El
marco se coloca con `objectFrame()` — la MISMA función que usa `paperRender.draw`,
para que tiradores e imagen no puedan desalinearse. En modo simple escribe
`object.image.*`; en avanzado, el keyframe activo.

---

## 8. Integración del timeline

**Se reutiliza `EdTimeline` completo.** Se escribe solo un adaptador
(`paperTimeline.js`), igual que `motionLayersToTimeline`:

| Concepto de PA | Representación en la timeline |
|---|---|
| Objeto animado | 1 pista `video` "Objeto" con 1 clip que ocupa `0 → duration` |
| Keyframes (modo avanzado) | `clip.keyframes = { enabled:true, items:[{id, t, interpolation, props{x,y,scale,rotation}}] }` → puntos en la barra del clip |
| Easing de PA | `linear/easeIn/easeOut/easeInOut → linear/ease-in/ease-out/ease-in-out`; `instant → hold`; `backIn/backOut/backInOut` → se conservan en el estado de PA y se muestran solo en el panel (la timeline los pinta como `linear`) |
| Apertura/cierre (modo simple) | Pista `Papel` con clips de 1 s no editables en `0` y `duration-1` |
| `previewTime` / reproducción | `playhead` de la timeline |
| `export.duration` | `duration` de la timeline |

Qué se reutiliza tal cual: regla con ticks, zoom por arrastre (`timelineScale.js`),
playhead, scrub, puntos de keyframe con selección y arrastre, zoom con rueda,
cabeceras de pista, altura de fila.

Qué se adapta: `onMutateClip` ignora los clips de papel; `onSelectKf`/`onMoveKeyframe`
enrutan a las acciones de PA; `onDropAsset` se desactiva en modo paper.

Qué **no** se reutiliza: cortar/dividir/duplicar (no aplica a un objeto único)
— los botones se ocultan con `paper-mode`.

**Eliminar sí se reutiliza** (`onDeleteClip` → `paper.removeTimelineClip`):

| Clip borrado | Efecto en el estado de PA |
|---|---|
| `paper_object_clip` | `clearImage()`: imagen, recorte, matte, transformaciones, animación y keyframes vuelven a cero (`DEFAULT_OBJECT`) |
| `paper_fold_open` / `paper_fold_close` | apaga `animation.simple.open` / `.close` |

Tras el borrado, `paperStateToTimeline` deja de proyectar ese clip y el `useEffect`
de la firma limpia la selección — no hay estado residual que apuntar.

---

## 9. Integración del panel de propiedades

`PaperProps` reproduce la estructura de `EdInspector`: `ed-insp-nav` arriba y
`InspSection` dentro.

```
ed-insp-nav:  Objeto │ Fondo │ Animación │ Salida
```

| Nav | Secciones (`InspSection`) | Controles |
|---|---|---|
| **Objeto** | Imagen · Herramientas de imagen · Borde rasgado · Sombra · Color · Movimiento · Pliegue de papel | `InspSlider` para tamaño/rotación/offset, grosor/rugosidad/detalle, desenfoque/opacidad, tono/saturación/brillo, velocidades y fuerzas, opacidad/velocidad del pliegue; `ed-mode-toggle` para cada `enabled`; `FlipSelect` para el modo de fusión y el modelo de fondo |
| **Fondo** | Imagen y color · Transformación · Corrección de color · Desenfoque · Viñeta | Idem + selector de color |
| **Animación** | Modo · Animación simple · Keyframes · Propiedades del keyframe | Segmentado simple/avanzado, switches apertura/cierre, lista de keyframes compacta, y para el keyframe activo: escala/X/Y/rotación (`InspSlider` con stepper), easing (`FlipSelect`), animación de papel (segmentado) |
| **Salida** | Formato · Vídeo · Imagen | Duración, FPS, formato (`FlipSelect`), calidad JPG, fondo transparente, botón **Guardar en el material** |

Compactación aplicada: el panel de PA usaba `p-4` (16 px) por acordeón, `gap-3`,
`text-sm` y sliders de 20 px de alto. El inspector del editor usa `padding: 2px 10px 10px`,
`gap: 8px`, `font-size: 11px` en etiquetas y sliders nativos con `accent-color`.
**No se añade ningún patrón visual nuevo.**

---

## 10. Integración del canvas / renderizado

- `PaperCanvas` monta un `<canvas>` y el `<svg><defs><filter id="paper-torn-filter">`
  (mismos nodos `feMorphology`/`feTurbulence`/`feDisplacementMap`/`feFlood`), porque
  `ctx.filter = 'url(#…)'` necesita el filtro en el documento. Antes vivía en el
  `index.html` del iframe.
- `paperRender.js` expone `createPaperRenderer()`: encapsula los canvas offscreen
  (`objectCanvas`, `contentCanvas`, `finalObjectCanvas`, `tempOverlayCanvas`), la caché
  de bordes rasgados y el `needsRedraw`. `draw()` pasa a recibir `(ctx, canvas, state, timeMs, assets)`
  en lugar de leer variables de módulo → **misma lógica de dibujo, cero `getElementById`**.
- La resolución interna sale del formato del proyecto (`outW`/`outH`) escalado por
  `previewResolution`; el tamaño en pantalla lo calcula React con un `ResizeObserver`
  (sustituye a `updateCanvasDisplaySize` + `animateCanvasResize`).
- El arrastre del objeto sobre el stage (que en PA no existía: solo sliders) se añade
  reutilizando el patrón de `MotionCanvas.onMoveLayer`.

---

## 11. Undo/redo, keyframes y animación conviviendo

- `useEditorHistory` se generaliza a `useEditorHistory(snapshot, enabled)`.
  `VideoEditor` sigue pasando `{tracks, clips}`; `usePaperComp` pasa su estado.
  En modo paper, `EdTopBar` cablea undo/redo a la instancia de PA.
- Los keyframes **no se fusionan**: los de PA (`{time,x,y,scale,rotation,easing,paperAnim}`)
  siguen siendo la fuente de verdad, y `paperTimeline.js` los proyecta al formato del
  editor solo para pintarlos. Un futuro trabajo puede unificarlos (ver
  `docs/KEYFRAMES_REDISENO.md`); hoy sería un cambio de alcance mayor con riesgo alto.
- El bucle rAF de PA solo corre cuando `mainColTab === 'paper'` (se para al salir del tab).
- El preview del editor se detiene al entrar en paper (`stopPlayback()`), como en motion.

---

## 12. Estrategia por fases

| Fase | Contenido | Verificable |
|---|---|---|
| **1** | Motor portable: `paperModel`, `paperTransforms`, `paperErase`, `paperAssets`, `paperImage`, `paperRender` | Módulos sin DOM global |
| **2** | `usePaperComp` + `PaperCanvas` (stage + filtro SVG + rAF) | El canvas dibuja |
| **3** | Integración: tab, `PaperElements`, `PaperProps`, transporte | Se ve y se edita dentro del editor |
| **4** | `paperTimeline` → `EdTimeline` (keyframes, scrub, duración) | La timeline del editor mueve la animación |
| **5** | `PaperEditLayer`: pincel, borrado por color, recorte | Sin modal |
| **6** | `paperExport` + subida al material | Se guarda el vídeo |
| **7** | Limpieza: borrar `frontend/paper-animator/`, el modal, Tailwind, vite input | `npm run build` limpio |

Las siete fases están hechas. Verificado: `npm run build` (una sola entrada, 181 módulos),
`npx oxlint` (0 errores; solo los mismos avisos que ya tenía el resto del proyecto),
y `node src/features/paper/paperModel.test.mjs` junto a los 17 tests existentes de `src/lib`.
La UI **no** se ha podido probar en el navegador en esta sesión (la extensión de Chrome
no estaba conectada): lo verificado es el build, el lint, los tests de la lógica pura y
que el servidor de desarrollo resuelve y transforma todos los módulos nuevos.

---

## 13. Riesgos y conflictos

| Riesgo | Mitigación |
|---|---|
| `ctx.filter = 'url(#id)'` solo lo soportan Chromium/WebKit; si el filtro no está en el documento el borde rasgado desaparece silenciosamente | Montar los `<defs>` en `PaperCanvas` con id propio (`paper-torn-*`) y verificar que la caché se genera |
| Colisión de ids si alguna vez hubiera dos stages | Ids con prefijo `paper-`; un único stage por editor |
| El singleton `state` se leía desde 8 módulos; al pasar a React hay riesgo de renders en cascada | `draw()` lee el estado por ref (`stRef.current`) dentro del rAF; React solo re-renderiza los paneles |
| `useEditorHistory` con dos instancias podría hacer que Ctrl+Z afecte a la timeline equivocada | `enabled` por modo + el atajo enruta según `mainColTab` |
| El export bloquea el hilo principal frame a frame | Ya era así; se mantiene y se añade cancelación + progreso con `Toast`/`JobStatusBar` |
| Quitar Tailwind rompe el build si algo más lo usa | Verificado: `paper-animator/styles.css` es el **único** consumidor |
| La caché de bordes rasgados (4 seeds a resolución de la imagen) es cara | Se conserva la generación progresiva con `await` entre seeds |
| Perder funcionalidad al compactar | Inventario de los 180+ ids de control de `index.html` mapeado 1:1 en `PaperProps` |

---

## 14. Archivos afectados

**Nuevos** (13): `frontend/src/features/paper/*`
**Modificados** (6): `VideoEditor.jsx`, `EdMaterial.jsx`, `editor.css`,
`hooks/useEditorHistory.js`, `vite.config.js`, `package.json`
**Borrados** (27): `frontend/paper-animator/**`, `PaperAnimatorModal.jsx`
**Intactos**: `frontend/public/paper-animator/assets/texture/**`


---

## 15. Desviaciones respecto al plan

Cosas que cambiaron al implementar, y por qué:

1. **`useEditorHistory` generalizado, no duplicado.** Pasó de `(tracks, clips, enabled)` a
   `(snapshot, enabled)`. `VideoEditor` le pasa `useMemo(() => ({tracks, clips}))` — mismo
   JSON que antes — y Paper su propio estado. Una sola implementación de undo/redo.

2. **El undo de Paper también restaura los píxeles.** El estado solo puede guardar cosas
   serializables, así que un `Image` no cabe: deshacer un trazo habría restaurado `imageSig`
   dejando la imagen borrada. Se guarda un `Image` por firma en un ref (`imgHistRef`, tope 24)
   y `applyHist` recupera el que toca. Sin esto, la promesa de "cada trazo es un paso de
   Ctrl+Z" era falsa.

3. **`imageSig` sale de un contador propio (`sigRef`), no de `cur.imageSig + 1`.** Calcularlo
   dentro de un updater de React obligaba a tener efectos ahí, y los updaters pueden
   ejecutarse más de una vez.

4. **El rect de contenido y las ediciones trabajan sobre el `element`, no sobre el original.**
   Cada trazo o recorte vuelve a pasar por el pipeline solo una vez (`decodeCanvas` /
   `cropElement`), no por `buildPaperImage` — repetir el re-muestreo degradaría la imagen en
   cada edición. El original se guarda aparte solo para "Restablecer".

5. **Los offscreen se ajustan en `draw()`, no solo en `resize()`.** El preview y el export
   comparten renderer; exportar a resolución completa y volver al preview dejaba los
   offscreen con el tamaño del otro. Ahora manda quien dibuja.

6. **`generateTornCache` devuelve la promesa en vuelo.** Antes ignoraba la llamada si ya
   estaba generando, así que el export podía codificar los primeros fotogramas con la caché
   a medias.

7. **El cabezal en modo Paper no se duplica en el estado.** `paper.time` se pasa directamente
   a `EdTimeline`; el efecto solo escribe `playheadRef`. Mantener además `playhead` habría
   re-renderizado el editor dos veces por fotograma.

8. **Nuevo: WebM con transparencia.** El motor original solo ofrecía fondo transparente en
   PNG. Aquí también en WebM/VP9, porque el editor ya sabe componer overlays con alfa y así
   una animación de papel se superpone sin croma. Requiere `alpha: 'keep'` en el encoder
   (el valor por defecto de mediabunny es `'discard'`) **además** de no pintar el fondo; con
   solo una de las dos cosas saldría opaco sin avisar.

9. **PNG/JPG van a Imágenes, no a Vídeos.** Subirlos con `uploadVideo` habría dejado en el
   material un "vídeo" que no se puede reproducir.

10. **Se cayó `simple.previewing`.** Era código muerto en el motor original: el renderer lo
    leía pero nada lo escribía nunca. No es pérdida de funcionalidad.

11. **La pista "Papel" va bloqueada.** La apertura y el cierre tienen tiempos fijos (0 y
    `duración-1`), así que se muestran pero no se arrastran.

## 16. Lo que queda fuera (posible fase siguiente)

- **Persistencia.** El estado de Paper Animator es efímero, igual que en el modal: al salir
  del proyecto se pierde (lo que se guarda es el vídeo resultante). El estado ya es
  serializable a propósito, así que persistirlo en `Project` como hace Motion con
  `motion_compositions` es un añadido de backend, no un rediseño.
- **Unificar los keyframes** con `lib/clipKeyframes.js` (ver `docs/KEYFRAMES_REDISENO.md`).
  Hoy los de Paper (`{time,x,y,scale,rotation,easing,paperAnim}`) son la fuente de verdad y
  `paperTimeline.js` los proyecta solo para pintarlos. Unificarlos obligaría a meter
  `paperAnim` y los easing `back*` en el modelo compartido.
- **Fondo desde el material.** El fondo se carga desde un archivo local; podría elegirse
  entre las imágenes del proyecto igual que el objeto.
- **Chat IA.** Motion tiene `MotionAIChat` sobre el MCP; Paper no expone tools todavía.
