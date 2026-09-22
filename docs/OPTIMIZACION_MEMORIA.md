# Optimización de memoria del editor web

> Estado: **plan, nada implementado** (2026-09-18).
> Objetivo: que la RAM del editor deje de crecer mientras se edita (una meseta estable en vez de un
> crecimiento sin fin), para no tener que recargar la página, **sin perder ninguna funcionalidad
> de UI/UX actual**.

---

## 1. Síntoma

La memoria de la pestaña sube durante la sesión de edición y solo baja al recargar. Ese patrón apunta
a dos causas: **recursos que se crean y nunca se sueltan** y **cachés sin límite**, no a un pico
puntual.

> Aviso: el diagnóstico sale de leer el código. **Todavía no se ha medido en el navegador**. La Fase 0
> existe precisamente para confirmar cuánto pesa cada foco antes de tocar nada.

---

## 2. Diagnóstico: focos identificados

Ordenados de más a menos probable como causa principal.

| # | Foco | Dónde | Por qué pesa |
|---|------|-------|--------------|
| 1 | **Un `<video preload="auto">` por cada clip de la timeline**, todos montados siempre | `features/editor/VideoEditor.jsx` → `HiddenMedia` (≈L99) y `mediaPool` (≈L3288) | Cada elemento tiene su decodificador, su buffer de red y sus texturas. Al dividir un clip en 5, el mismo archivo se carga 5 veces. Con 30–60 clips probablemente es la mayor parte del consumo. |
| 2 | **Caché de GIF sin límite** | `features/editor/gifPlayer.js` (`cache`, `MAX_FRAMES = 600`) | Guarda hasta 600 `<canvas>` por GIF y nunca los borra. Un GIF de 480×480 con 200 fotogramas ocupa unos 180 MB y sigue ahí aunque se borre el clip. |
| 3 | **Cachés de "Quitar fondo"** | `features/editor/bgCutout.js` (`alphaCache`, `cutCache`, `blurCache`, `grayCache`, `matteImgs`) | Hasta 4 canvas de hasta 1280 px por clip, que solo se vacían al invalidar. `matteImgs` retiene hasta 260 imágenes decodificadas (en el peor caso cerca de 1 GB). El límite cuenta elementos, no bytes. |
| 4 | **Historial de undo con 80 copias completas de la timeline** | `features/editor/hooks/useEditorHistory.js` | Cada instantánea es el JSON entero de `{tracks, clips}`, con keyframes de face tracking, palabras de subtítulos y trazos de pincel o máscara. El límite cuenta instantáneas, no bytes. |
| 5 | **Sondeo MCP del chat cada 1 s** | `features/editor/EdChat.jsx` (`setInterval(load, 1000)`) → `onMcpAudit` → `setMcpAudit` en `VideoEditor` | Crea un objeto nuevo cada segundo aunque nada cambie, y eso vuelve a renderizar entero `VideoEditor` (más de 4000 líneas), incluido el `mediaPool` con closures nuevas. No es una fuga, pero genera mucha basura y presión constante del GC. |
| 6 | **Rejillas de material sin virtualizar** | `MaterialClipGrid.jsx`, `EdLibrary.jsx`, `EdExplore.jsx`, `EdStickMenu.jsx` | Hay un `<video>` por tarjeta aunque no se vea, y los que ya se han previsualizado conservan su decodificador. |
| 7 | **Cachés de Paper y Motion** | `features/paper/usePaperComp.js` (`bitmapsRef`, `glyphCacheRef`), iframes de `MotionCanvas` y `MotionTemplates` | Se quedan vivas al salir de esos modos. |

### Lo que ya está bien (no tocar)

- `addEventListener` y `removeEventListener` están equilibrados en todos los módulos.
- Todos los `setInterval` se limpian en el cleanup del efecto.
- `lib/clipMask.js` ya usa una caché de trabajo acotada (`_scratch`, máximo 6).
- `bgMagic.js` ya limita su `store` a 24 entradas.

---

## 3. Plan por fases

### Fase 0: medir primero (½ día)

**Objetivo:** tener números antes y después de cada fase.

- **Panel de diagnóstico** que solo se active con `?debug=mem`. Mostraría:
  - cuántos `<video>` y `<audio>` hay vivos (en `mediaEls` y en el DOM);
  - el tamaño estimado en MB de cada caché: GIF, bgCutout (por mapa), `matteImgs` e historial de undo;
  - `performance.memory` (heap de JS) y, si está disponible, `performance.measureUserAgentSpecificMemory()`.
- **Escenario reproducible** con un proyecto de copia (nunca uno real; ver backend aislado en :8766 y
  Vite en :5199):
  1. abrir un proyecto con unos 40 clips;
  2. dividir clips, mover y hacer undo y redo;
  3. quitar el fondo a 2–3 clips;
  4. añadir un GIF de Explorar;
  5. 15 minutos de edición y reproducción.
- Anotar la memoria del proceso de la pestaña (Administrador de tareas de Chrome) y hacer heap
  snapshots al principio y al final.

**Criterio de salida:** sabemos qué foco aporta más, y en función de eso se ajusta el orden de las
fases 1–3 si hace falta.

### Fase 1: arreglos rápidos de bajo riesgo (1 día)

Ninguno cambia el comportamiento visible.

1. **Caché de GIF (`gifPlayer.js`)**
   - LRU con tope por bytes (`w × h × 4 × fotogramas`), por ejemplo 150 MB.
   - Función `releaseGif(src)` que se llama cuando ningún clip de la timeline usa ese `src`.
   - Cerrar `image.close()` (el `VideoFrame` de cada fotograma) y `dec.close()` en cuanto termina la
     decodificación.
2. **Cachés de bgCutout (`bgCutout.js`)**
   - `matteImgs`: límite por bytes estimados en lugar de por número de imágenes.
   - `alphaCache`, `cutCache`, `blurCache` y `grayCache`: LRU de unos 8 clips.
   - Purga inmediata cuando un clip desaparece de la timeline (efecto sobre `clips` que compara los
     ids vivos con los ids en caché, igual que ya hace `usePaperComp` con `alive`).
3. **Sondeo MCP (`EdChat.jsx`)**
   - Solo llamar a `setAudit`, `setLive` y `onMcpAudit` si cambió el `ts` más reciente o la lista de
     activos. Así se acaba el render completo del editor cada segundo.
4. **Historial de undo (`useEditorHistory.js`)**
   - Mantener el máximo de 80 instantáneas y añadir un **tope de bytes** (por ejemplo 40 MB en total,
     sumando `snap.length`). Si se supera, se descartan las más antiguas.
   - Undo y redo se comportan igual. Solo en sesiones enormes se pierden los pasos más antiguos.

**Criterio de salida:** el escenario de la Fase 0 muestra que las cachés se estabilizan y no crecen
con el tiempo.

### Fase 2: pool de medios con ventana (2–3 días; el cambio de más impacto)

**Idea:** tener montados solo los vídeos y audios que hacen falta ahora, sin que se note.

- **Ventana activa**: clips que se solapan con `[cabezal − 2 s, cabezal + 8 s]`, más:
  - el clip seleccionado;
  - el clip en modo Recortar, quitar fondo o máscara;
  - durante la reproducción, el siguiente clip de cada pista (precarga antes de llegar a su inicio).
  Esos llevan `preload="auto"` como ahora.
- **Fuera de la ventana**: se desmonta el elemento y se libera el decodificador explícitamente con
  `el.pause(); el.removeAttribute('src'); el.load()` en el callback ref de desmontaje de `HiddenMedia`.
  Se añade histéresis para que un elemento no se monte y desmonte en bucle en los bordes.
- **Elementos compartidos por archivo**: los trozos del mismo archivo cuyos rangos en la timeline no
  se solapan usan un solo elemento. `mediaEls` pasa de "id de clip → elemento" a
  "id de clip → elemento compartido".
  - Con cuidado: `syncPreviewMedia` y el `tick` fijan `currentTime`, `playbackRate` y volumen por clip.
    Dos clips del mismo archivo que suenan a la vez **no** pueden compartir elemento.
- **Dimensiones sin depender del elemento**: `mediaSize()` se usa para la maquetación
  (`originalMediaSize`, `applyFreeLayout`, `selSrcH`, `bakedReframeForCut`). Pasaría a leer un mapa de
  metadatos persistente (`w`, `h` y `duration` por archivo), ampliando el `registerMediaMeta` que ya
  existe, para que la maquetación no necesite el elemento montado.
- **Para que no se note al hacer scrub o saltar lejos:**
  - mientras un elemento recién montado carga, `canvas.js` dibuja el último fotograma que tenemos del
    clip (una miniatura pequeña en caché, por ejemplo de 320 px de ancho) en vez de negro;
  - al pausar, se guarda esa miniatura del fotograma actual de los clips visibles.
- **Pruebas de regresión específicas** (en navegador headless):
  - reproducción continua cruzando cortes y cambios de pista;
  - scrub rápido de un extremo a otro;
  - paso de fotograma en fotograma;
  - audio simultáneo de varias pistas y tracks vinculados;
  - clips con `reverse`, con velocidad y con `preservesPitch`;
  - quitar fondo en vivo, máscaras y recorte en un clip fuera de la ventana al seleccionarlo.

**Criterio de salida:** el número de `<video>` vivos queda acotado (unos 3–8) sin importar el tamaño
de la timeline, y no hay fotogramas negros ni cortes de audio en las pruebas anteriores.

### Fase 3: rejillas de material (1 día)

- Usar `IntersectionObserver` en `MaterialClipGrid`, `EdLibrary`, `EdExplore` y `EdStickMenu`:
  - la tarjeta muestra el póster o la miniatura (`thumb_url` o un fotograma generado);
  - el `<video>` solo se monta al pasar el ratón o al empezar un scrub (`onPointerMove`);
  - al salir de pantalla, o tras unos segundos sin interacción, se libera con la misma técnica
    (`removeAttribute('src'); load()`).
- El scrub, el arrastre a la timeline, los badges (corte y cara), el menú contextual y la vista previa
  al pasar el ratón se ven exactamente igual.
- Las dimensiones para `aspectRatio` salen de los metadatos del material, no del `<video>`.

### Fase 4: menos renderizados (1–2 días)

- Memorizar el `mediaPool` (con `useMemo`) y usar un manejador `onLoadedMetadata` estable (ahora se
  crea una función nueva por clip en cada render).
- Sacar a componentes con estado propio lo que cambia a menudo: el estado de auditoría MCP, la
  etiqueta "Guardado" y el reloj del cabezal donde sea posible. Así esos cambios no vuelven a
  renderizar todo `VideoEditor`.
- Revisar con React Profiler qué partes se renderizan en cada tick de reproducción.

### Fase 5: liberar recursos al cambiar de modo (½ día)

- Al salir de Paper: vaciar `bitmapsRef` y `glyphCacheRef` y llamar a `invalidateTornCache()`.
- Al salir de Motion: desmontar los iframes de plantillas y de preview.
- Al volver, todo se regenera bajo demanda (ya ocurre así la primera vez).

---

## 4. Validación: cómo sabemos que no se pierde nada

1. **Tests unitarios existentes** (`editorModel.test.mjs`, `clipKeyframes.test.mjs`, `paperText.test.mjs`…),
   que deben seguir pasando.
2. **Tests nuevos** de funciones puras:
   - cálculo de la ventana del pool (qué clips entran o salen según el cabezal, la selección y el modo);
   - LRU por bytes (GIF, bgCutout, historial).
3. **Escenario de la Fase 0**, repetido tras cada fase, con este objetivo: que la memoria forme una
   meseta y no crezca sin límite.
4. **Checklist de UX** en navegador headless: reproducción, scrub, cortes, quitar fondo en vivo, GIF
   animado, undo y redo, recorte, máscaras, rejilla de material (scrub y arrastre), Paper y Motion.

---

## 5. Orden recomendado y esfuerzo

| Fase | Esfuerzo | Riesgo | Impacto esperado |
|------|----------|--------|------------------|
| 0. Medir | ½ día | nulo | permite decidir con datos |
| 1. Cachés y sondeo | 1 día | muy bajo | alto si se usan GIFs o quitar fondo; frena el crecimiento continuo |
| 2. Pool de medios con ventana | 2–3 días | medio | **el mayor**, en timelines con muchos clips |
| 3. Rejillas de material | 1 día | bajo | medio-alto con mucho material |
| 4. Renderizados | 1–2 días | bajo | menos presión del GC y más fluidez |
| 5. Cambio de modo | ½ día | muy bajo | medio si se alterna con Paper o Motion |

**Orden:** 0 → 1 → 2 → 3, y después 4 y 5. Las Fases 0 y 1 dan una mejora visible casi sin riesgo.
La Fase 2 es la que más memoria recupera y la más delicada.

---

## 6. Alternativas consideradas y descartadas (por ahora)

- **Decodificar con WebCodecs (`VideoDecoder`) en lugar de elementos `<video>`**: daría control total
  de la memoria de fotogramas, pero exige demuxing propio (mp4box.js), sincronización de audio
  aparte y reescribir el `tick`. Mucho más riesgo para la UX actual. Solo tendría sentido si la Fase 2
  no bastara.
- **Un único `<video>` que salta entre fuentes**: rompe la reproducción simultánea de overlays, PIP y
  varias pistas de audio. No es compatible con la funcionalidad actual.
- **Rebajar la resolución de los mattes o de los proxies en el backend**: reduciría memoria, pero
  empeora la calidad visible del preview. Solo como opción configurable, no por defecto.
- **Recargar la página automáticamente**: esconde el problema y rompe el flujo de trabajo.
