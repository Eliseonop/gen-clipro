# Checklist de paridad — Editor vs. CapCut Desktop (base)

> **Objetivo:** verificar que el editor cubre lo *básico* de CapCut.
> No reemplazar funcionalidad propia: si ya existe algo equivalente → **adaptar**, no duplicar.

**Leyenda**

| Marca | Significado |
|---|---|
| `[ ]` | No existe → implementar |
| `[~]` | Existe algo similar → adaptar/renombrar/completar |
| `[x]` | Cumple |
| `[!]` | Funcionalidad propia relacionada → **no tocar**, solo reubicar en la UI |
| `[-]` | Revisado y **descartado** (no es necesario) |

**Regla de adaptación:** funciones extra propias (ej. *paper animation* sobre imágenes) se conservan tal cual y se exponen como una entrada más dentro de la sección equivalente de CapCut (ej. **Efectos** o **Animación**), sin modificar su comportamiento.

---

## 1. Proyecto y arranque

- [x] 1.1 Pantalla de inicio con botón **Nuevo proyecto** — ya existe (`features/projects/Home.jsx`)
- [~] 1.2 Lista de **proyectos recientes** (abrir, renombrar, duplicar, eliminar)
  - **Decisión:** solo añadir **renombrar** y **duplicar** en las tarjetas de Home. Sin rediseño ni cambio de orden.
- [-] 1.3 Autoguardado / recuperación de sesión — el autoguardado actual (debounce 800 ms en modo Main) basta
- [-] 1.4 Propiedades de proyecto al deseleccionar todo — no es necesario
- [~] 1.5 Renombrar proyecto — se cubre desde Home (1.2)
- [~] 1.6 **Relación de aspecto**: original, 16:9, 9:16, 1:1, 4:3, 3:4 + personalizada
  - **Decisión:** separar aspecto y resolución. Aspecto: original, 16:9, 9:16, 1:1, 4:3, 3:4, 4:5, personalizado.
  - Hoy: `FORMATS` en `editorModel.js` (espejo en backend `timeline_ops.FORMATS`), selector en `EdViewerTools.jsx`.
- [~] 1.7 **Resolución**: adaptada / personalizada
  - **Decisión:** selector propio 480p / 720p / 1080p / 4K + ancho×alto manual (junto al de aspecto).
- [~] 1.8 **FPS** del proyecto (24 / 25 / 30 / 50 / 60)
  - **Decisión:** FPS **por proyecto** (`timeline.fps`), con selector junto a aspecto y resolución. El valor de Configuración→Exportar pasa a ser solo el predeterminado de los proyectos nuevos.
- [~] 1.9 Espacio de color
  - **Decisión:** sin UI. El export etiqueta siempre **BT.709** (`-colorspace`/`-color_primaries`/`-color_trc bt709`).
- [-] 1.10 **Proxy** / redimensionamiento para equipos lentos — no es necesario

## 2. Layout de la interfaz

- [x] 2.1 Panel de **medios** (izquierda) — `EdMaterial` en el panel `materials` (redimensionable)
- [x] 2.2 **Reproductor** / previsualización (centro) — `.ed-canvas-col` → canvas + `.ed-transport`
- [x] 2.3 Panel de **propiedades** contextual (derecha) — `EdInspector` cambia según selección (clip / audio / texto / pista / efecto)
- [x] 2.4 **Línea de tiempo** (abajo) con indicador (playhead) — `EdTimeline` + `playhead`
- [x] 2.5 Paneles redimensionables — `EdSplit` + `usePanelLayout` (materials / inspector / bottom / crops, persistidos en localStorage)
- [x] 2.6 Modo **pantalla completa** del reproductor — botón en el transporte; `requestFullscreen` sobre `.ed-canvas-col` (conserva controles), Esc sale
- [x] 2.7 Tiempo actual + duración total visibles — `.ed-time` en el transporte (`playhead / duration`)
- [ ] 2.8 **Medidor de volumen (VU)** en reproducción — **aplazado**. El `ed-vol-meter` actual solo refleja el *valor* del slider, no el nivel real. Un VU real necesita grafo Web Audio (AudioContext + AnalyserNode) enrutando los `<video>`/`<audio>`: se aborda al entrar en audio a fondo (secciones 14–15).

## 3. Medios e importación

- [x] 3.1 Importar archivos (video, imagen, audio) desde disco — `importMedia` + `uploadVideo/uploadAudio/uploadImages`, input `accept` en tabs Video/Audio
- [x] 3.2 Drag & drop desde el SO — `onFileDrop`/`onVidDrop` leyendo `dataTransfer.files`
- [x] 3.3 Biblioteca local con miniaturas — tabs Video/Imagen/Audio (`MaterialClipGrid`/`ImageCard`/`AudioCard`)
- [x] 3.4 Añadir a timeline por **arrastre** o botón **+** — drag `application/x-material` + botón `.ed-add-corner`
- [x] 3.5 Previsualización del medio antes de insertar (scrub en miniatura) — preview por botón *play* (clic) + **hover-scrub** en `MaterialClipGrid` (mover el ratón sobre la miniatura busca el frame); stock (`EdExplore`) previsualiza al hover
- [x] 3.6 Biblioteca de recursos integrada (stock) — `EdExplore`: Pexels (imagen+vídeo) + Giphy (GIF) con búsqueda, hover-preview e import (requiere API keys). Música stock → sección 15
- [ ] 3.7 Assets con **pantalla verde** — **pendiente**: filtro/categoría "green screen" dentro de `EdExplore` cuando se amplíe el stock. El editor ya tiene chroma key propio (sección 12.3)
- [-] 3.8 Assets de **marca** (brand kit) — **descartado**: no imprescindible para un editor de uso personal
- [~] 3.9 Carpetas / organización de medios — la organización por **tipo (tabs) + scope (proyecto/guardados/todos) + favoritos** cubre lo básico; sin carpetas jerárquicas

## 4. Línea de tiempo — herramientas

- [~] 4.1 **Seleccionar** (flecha) — hay selección por clic + lazo (`VideoEditor.jsx`, marquee en `EdTimeline.jsx`), pero **sin modo "herramienta" ni atajo `A`**. Decisión: dejar la selección directa; no añadir modos de herramienta.
- [~] 4.2 **Dividir / cortar** (navaja) — existe: tecla **`S`** en el playhead + **"Dividir aquí"** en el menú contextual (`splitClip`). Falta el modo navaja y el atajo `B`. Decisión: mantener `S` + menú; opcional añadir botón navaja.
- [-] 4.3 **Seleccionar hacia la izquierda** — descartado (poco usado; con lazo basta)
- [-] 4.4 **Seleccionar hacia la derecha** — descartado (ídem)
- [~] 4.5 Dividir en el playhead (botón + `Ctrl/Cmd+B`) — cubierto por `S` y el menú; **falta botón dedicado en la barra**. Decisión: añadir botón navaja en la timeline (reusa `splitClip`).
- [-] 4.6 **Borrar a la izquierda** del playhead — descartado (poco usado)
- [-] 4.7 **Borrar a la derecha** del playhead — descartado
- [x] 4.8 **Trim** arrastrando extremos del clip — `previewTrim`/`trimClipPatch`/`snapClipTrim` (`EdTimeline.jsx` + `timelineAlign.js`)
- [x] 4.9 Reordenar clips arrastrando — arrastre con `snapClipMove`/`onMoveGroup`
- [x] 4.10 Eliminar clip (papelera / `Supr`) — `Delete`/`Backspace` + "Eliminar" en el menú (`deleteClip`)
- [x] 4.11 **Deshacer / Rehacer** — `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` (`useEditorHistory`, `applyHistSnap`); botones en `EdTopBar`
- [x] 4.12 Copiar / cortar / pegar clips — `Ctrl+C` / `Ctrl+X` / `Ctrl+V` (`copySelectedClips`/`pasteClips`)
- [x] 4.13 Selección múltiple — `Ctrl/Cmd+clic` y **lazo** con arrastre (`.ed-marquee`, `selIds`)

## 5. Línea de tiempo — comportamiento

- [x] 5.1 **Zoom** con `Ctrl/Cmd + scroll` — `timelineWheel.js` / `timelineZoom` / `zoomFromCorner`
- [~] 5.2 Zoom con `Ctrl/Cmd + / -` y slider — hay zoom por rueda/pellizco; **faltan atajos `+`/`-` y slider visible**
- [ ] 5.3 **Ajustar a ventana** (ver toda la timeline) — pendiente
- [~] 5.4 **Imán global** (sin huecos / ripple) — hay **snap** entre clips (5.5), pero **no** modo imán/ripple global que cierre huecos. Decisión: evaluar interruptor de ripple.
- [x] 5.5 **Snap entre clips** con guía visual — `timelineAlign.js` (`snapClip*`) + guías `.ed-align-guide`
- [~] 5.6 **Vincular / desvincular** — existe a nivel de **pista** (`link_tracks`: la pista de texto sigue a la base), no por clip individual
- [ ] 5.7 **Preview al pasar el mouse** sobre la timeline — pendiente
- [x] 5.8 Reproducir con `Espacio` — `togglePlay`
- [ ] 5.9 **Marcadores** — pendiente (no existen)
- [ ] 5.10 **Rango I/O** para exportar un segmento — pendiente (no existe)

## 6. Pistas (canales)

- [x] 6.1 Pistas ilimitadas de video apiladas (overlay) — multipista en `EdTimeline.jsx` (`tracks`)
- [~] 6.2 Crear pista al soltar un clip encima — al soltar se asigna a la pista compatible (`trackKindForClip`); **verificar creación automática de nueva pista overlay**
- [x] 6.3 Pistas de audio independientes — pistas `kind: 'audio'`
- [ ] 6.4 Pista dedicada de **efectos** — no existe (los efectos van al clip)
- [ ] 6.5 Pista dedicada de **filtros / capa de ajuste** — no existe
- [x] 6.6 **Bloquear** pista — `t.locked` (botón candado en el header)
- [x] 6.7 **Ocultar / mostrar** pista — `t.hidden` (botón visibilidad)
- [x] 6.8 **Silenciar** pista — `t.muted` (botón volumen)
- [~] 6.9 Mostrar / ocultar forma de onda — la onda se dibuja (`pseudoWaveform`); hay botón **compactar** la pista, pero **no** un toggle explícito de onda

## 7. Transiciones (entre clips)

> **Nota:** el "Transiciones" del inspector NO es esto: es la **interpolación de keyframes** (easing → sección 24.9). Las **animaciones de entrada/salida** (sección 17) cubren buena parte del efecto de transición sobre un clip.

- [ ] 7.1 Biblioteca de transiciones por categorías — pendiente
- [ ] 7.2 Arrastrar transición al punto de corte — pendiente
- [ ] 7.3 Sustituir transición arrastrando otra encima — pendiente
- [ ] 7.4 Ajustar **duración** arrastrando en la timeline — pendiente
- [ ] 7.5 Ajustar duración desde propiedades — pendiente
- [-] 7.6 **Aplicar a todos** los cortes — descartado (depende de 7.1)

## 8. Transformación del clip (panel Básico) — `EdTransform.jsx`

- [x] 8.1 **Escala** — slider + `NumberStepper` (%) y handles en el reproductor (`interactions.js`)
- [x] 8.2 **Posición X / Y** — numérica (`InspXY`) + arrastre en el lienzo
- [x] 8.3 **Rotación** — slider "Girar" + valor (°)
- [ ] 8.4 Doble clic en un valor = **reset de ese valor** — no (solo reset de sección)
- [x] 8.5 Botón de **reset** de toda la sección — `onReset` en `InspSection`
- [x] 8.6 **Alineación** en el lienzo — 6 botones (izq/centro H/der/arriba/centro V/abajo)
- [ ] 8.7 **Distribución** entre 3+ elementos — no existe
- [x] 8.8 **Mezcla**: opacidad — sección "Mezcla" → Opacidad (`EdInspector.jsx`)
- [ ] 8.9 **Modos de fusión** (multiplicar, pantalla…) — no existe

## 9. Operaciones rápidas sobre el clip (barra de herramientas)

- [ ] 9.1 **Congelar fotograma** (freeze frame) — no existe
- [x] 9.2 **Reversa** — toggle `reverse` en el panel de velocidad (`EdCrops.jsx`, `clip.reverse`)
- [ ] 9.3 **Espejo / flip** horizontal y vertical del clip — no (el flip existe en máscara y en eliminar-fondo, no del clip)
- [ ] 9.4 **Rotar 90°** por pasos — no (hay rotación libre, no pasos de 90°)
- [~] 9.5 **Recortar (crop)** — recorte de fuente con recuadro (handles) y scrub del frame (modo "Recortar" en `EdInspector`/`interactions.js`); **faltan presets de relación e inclinación**

## 10. Corrección y mejora de video

- [ ] 10.1 **Estabilización** — no existe
- [ ] 10.2 **Reducción de ruido** de imagen — no (hay denoise de **audio**, no de imagen)
- [ ] 10.3 **Eliminar parpadeo (deflicker)** — no existe
- [ ] 10.4 **Desenfoque de movimiento (motion blur)** — no existe
- [ ] 10.5 **Iluminación añadida** — no existe
- [~] 10.6 **Auto-enmarcado** — **función propia**: `reframe_clip` reencuadra a 9:16 con **seguimiento de cara** y paneo (keyframes en tiempo de fuente). Falta la UI genérica de relación destino/estabilidad/velocidad. Decisión: exponer el reframe como el "auto-enmarcado" de esta sección.

## 11. Lienzo / fondo (del reproductor)

> El lienzo por defecto es negro. Nada de esto existe todavía; es el fondo del canvas, distinto de "eliminar fondo" (sección 12).

- [ ] 11.1 **Desenfoque** de fondo con niveles — pendiente
- [ ] 11.2 **Color** sólido personalizable — pendiente
- [ ] 11.3 **Estilos / patrones** predefinidos — pendiente
- [-] 11.4 Fondo de **marca** — descartado
- [ ] 11.5 **Aplicar a todos** los clips — pendiente

## 12. Recorte de fondo y composición

- [x] 12.1 **Recorte automático** — `EdBgRemove` + `clipBg.js`: U²-Net (auto) y **SAM 2.1** (asistido por puntos)
- [ ] 12.2 **Trazo / borde** del recorte — no existe (sí opacidad, pluma y expansión del sujeto)
- [x] 12.3 **Chroma key** — cuentagotas de color, `similarity`, `blend`, despill (`spill`), `edge`, `shrink` (`clipBg.js`)
- [~] 12.4 **Máscaras** — círculo, rectángulo, estrella, corazón (`clipMask.js`, `MASK_SHAPES`). **Faltan** horizontal y doble línea/espejo.
- [x] 12.5 Máscara: posición X/Y, rotación, tamaño, **pluma (feather)**, esquinas redondeadas — `mx/my/mw/mh/msx/msy/mrot/mfeather` + `roundRect`
- [x] 12.6 Invertir máscara — `mask.invert`

## 13. Retoque (Mejorar) — retoque facial/corporal por IA

> Ninguno existe. Alta carga de IA; **candidatos a descartar** para un editor personal.

- [ ] 13.1 Suavizado de rostro
- [ ] 13.2 Iluminación de rostro
- [ ] 13.3 Blanqueado de dientes
- [ ] 13.4 Belleza facial
- [ ] 13.5 Maquillaje (presets)
- [ ] 13.6 Ajuste corporal

## 14. Audio — propiedades del clip — `EdEffects.jsx` (`VolumePanel`, `AudioFxGrid`)

- [~] 14.1 **Volumen** — control en **%** (0–VOL_MAX), no en dB; **sin** indicador de saturación en la onda
- [~] 14.2 **Fade in** — botón "Fade in" (`onFade('in')`); **sin** handle en la onda
- [~] 14.3 **Fade out** — botón "Fade out"; sin handle
- [~] 14.4 **Normalización de intensidad** (loudness) — existe a nivel de **export** (dB objetivo en `EdSettings`), no por clip
- [ ] 14.5 **Mejorar voz** — no (hay EQ genérico, no "mejorar voz" dedicado)
- [x] 14.6 **Reducción de ruido** — `denoise` en `AUDIO_FX_TOGGLES`
- [ ] 14.7 **Aislamiento vocal** — no
- [ ] 14.8 **Canales** (izq↔der, mono/estéreo) — no
- [~] 14.9 **Modificador de voz** por categorías — hay `reverb`/`echo`/`distortion` como fx sueltos; sin catálogo de voces
- [-] 14.10 Voz a canción — descartado
- [x] 14.11 Panel idéntico para clip de vídeo con audio y para audio puro — `VolumePanel`/`AudioFxGrid` compartidos (`trackMode`)

## 15. Audio — biblioteca y grabación

- [ ] 15.1 **Música** por categorías + búsqueda — pendiente (el stock de `EdExplore` es imagen/vídeo/GIF; falta música)
- [ ] 15.2 Filtro de uso **comercial** — pendiente
- [x] 15.3 **Efectos de sonido** por categorías + búsqueda — `search_sfx` + `SfxClassifyModal` + biblioteca SFX
- [x] 15.4 **Favoritos** (estrella) — `useFavorites` + `fav.toggleClipFav` (SFX)
- [~] 15.5 Previsualización con onda antes de insertar — hay preview de audio; onda previa parcial
- [~] 15.6 **Audios extraídos** (historial) — se puede extraer audio de un vídeo al material; falta un "historial" como tal
- [ ] 15.7 **Grabar voz en off** — no existe (sin `getUserMedia`/`MediaRecorder`)
- [-] 15.8 Verificador de **copyright** — descartado

## 16. Velocidad — `EdCrops.jsx` (`editorModel.js` `SPEED_*`)

- [x] 16.1 Velocidad **normal**: multiplicador — `SPEED_PRESETS` + slider (`SPEED_MIN`–`SPEED_MAX`)
- [ ] 16.2 Velocidad por **duración objetivo** — no
- [x] 16.3 **Cambiar tono** al variar velocidad — toggle `keep_pitch` ("Mantener el tono de la voz")
- [ ] 16.4 **Velocidad en curva** con presets — no (existe el campo `speed_curve` en el modelo, sin UI)
- [ ] 16.5 Curva **personalizada** — no
- [ ] 16.6 **Cámara lenta fluida** (flujo óptico) — no
- [x] 16.7 El clip se alarga/acorta al cambiar velocidad — remapeo de tiempo por `speed` (`editorModel.js`)

## 17. Animaciones predefinidas — `clipFx.js` (`APPEAR_OPTIONS`/`EXIT_OPTIONS`)

- [~] 17.1 Animación de **entrada** + duración — 8 opciones (fade, dissolve, wipe, zoom, slide, pop); **duración fija** (`FX_DUR`), no ajustable
- [~] 17.2 Animación de **salida** + duración — 8 opciones; duración fija
- [~] 17.3 Animación **combinada** (loop/in-out) — entrada+salida combinables; **sin** bucle
- [ ] 17.4 Handles de duración sobre el propio clip — no (duración fija)
- [x] 17.5 Opción **Ninguno** — `none`
- [!] 17.6 *Paper animation* (propia, sobre imágenes) — `features/paper/`, mantener intacta; exponer como preset

## 18. Color y ajuste — `clipFx.js` (`COLOR_FX`, `LOOK_OPTIONS`)

- [ ] 18.1 **LUT** (`.cube`) — no
- [~] 18.2 Básico — hay **brillo, contraste, saturación** (`COLOR_FX`, pestaña "Ajustar"). **Faltan** temperatura, tono, iluminaciones, sombras, blancos, negros, nitidez, viñeta
- [ ] 18.3 **HSL** por color — no
- [ ] 18.4 **Curvas** — no
- [ ] 18.5 **Scopes** (waveform/parade/vectorscopio) — no
- [~] 18.6 Reset por sección y por valor — reset de sección en transform; en color parcial
- [ ] 18.7 **Guardar preset** de ajuste con nombre — no (los favoritos existen solo en texto)
- [~] 18.8 Biblioteca de **predefinidos** — `LOOK_OPTIONS` (b/n, cinematic, vintage, warm, cool…) actúan como looks predefinidos

## 19. Filtros y capas de ajuste

- [~] 19.1 **Filtros** por categorías con intensidad — `LOOK_OPTIONS` (looks, sin intensidad/categorías) + `VIDEO_FX_TOGGLES` (con intensidad)
- [~] 19.2 Filtro **al clip** o como **capa** — al clip sí; como capa/pista no
- [ ] 19.3 **Capa de ajuste** que afecta a lo de debajo — no
- [ ] 19.4 Aplicar LUT desde la capa — no

## 20. Efectos — `EdFxLibrary.jsx` / `clipFx.js` (`VIDEO_FX_TOGGLES`)

- [~] 20.1 **Efectos de video** por categorías — hay catálogo (blur, sharpen, glow, grayscale, sepia, pixelate, VHS, grain) **sin** las categorías de CapCut
- [~] 20.2 **Sobre el clip** o en **pista de efectos** — al clip sí; pista de efectos no
- [x] 20.3 Parámetros propios por efecto — cada fx con su rango (`kind: range`/`toggle`)
- [ ] 20.4 **Editar efectos** apilados desde clic derecho — no
- [x] 20.5 Eliminar efecto — toggle off
- [ ] 20.6 **Efectos corporales** — no
- [!] 20.7 Efectos propios (VIDEO_FX + paper) → integrarlos como categoría propia, sin tocar su lógica

## 21. Texto

> **Texto** — `EdText.jsx` + `TextFxPanel`. Fuerte lado propio: temas de subtítulo (karaoke), palabra activa, favoritos.

- [x] 21.1 Añadir texto / arrastrar a la timeline — clips `kind: 'text'`
- [~] 21.2 Edición inline en el reproductor — edición por `textarea` en el panel + arrastre del texto en el Main; **inline directo en el canvas** no
- [~] 21.3 **Fuente** (buscador + preview), tamaño — selector con preview (`FONTS`) + tamaños (`FONT_SIZES`); **sin buscador**
- [~] 21.4 Negrita, cursiva, subrayado, MAYÚSCULAS — solo **negrita**; faltan cursiva, subrayado, mayúsculas
- [x] 21.5 Color de relleno — `color`
- [ ] 21.6 **Espaciado** e **interlineado** — no
- [~] 21.7 Alineación — horizontal (izq/centro/der); **vertical** no
- [x] 21.8 **Estilos predefinidos** — `SUBTITLE_THEMES` (temas)
- [x] 21.9 Escala, posición, rotación + alineación en el lienzo — vía `EdTransform` (texto) + x/y/w
- [~] 21.10 Opacidad / mezcla — opacidad sí; mezcla/blend no
- [x] 21.11 **Trazo**: grosor y color — `border_width` / `border_color`
- [~] 21.12 **Fondo**: color, opacidad, ancho, alto, redondez, offset — color + opacidad sí; ancho/alto/redondez/offset no
- [~] 21.13 **Brillo / glow** — toggle `glow`; sin color/intensidad
- [~] 21.14 **Sombra** — toggle `shadow`; sin distancia/ángulo/desenfoque
- [ ] 21.15 **Curva** del texto — no
- [ ] 21.16 **Burbujas** (bocadillos) — no
- [~] 21.17 **Efectos de texto** predefinidos — `word_fx` (karaoke) + temas
- [~] 21.18 **Animación** de texto: entrada/salida/bucle — `block_appear` + `word_fx`; salida/bucle parcial
- [~] 21.19 **Plantillas** de texto animadas — temas de subtítulo editables; motion completo vía *paper* ([!])
- [~] 21.20 **Texto a voz** — hay TTS (Gemini/ElevenLabs) para narración de **audio**; no desde el clip de texto con catálogo por idioma
- [~] 21.21 Generación IA de texto/estilo desde prompt — `EdChat` (agente IA que usa el MCP); sin botón dedicado en el panel de texto
- [ ] 21.22 **Seguimiento (tracking)** de texto sobre objeto — no

## 22. Subtítulos

- [x] 22.1 **Subtítulos automáticos** por idioma — `generate_subtitles` / `transcribe` (`useSubtitles`)
- [~] 22.2 **Panel de lista** para editar en bloque — se editan como clips de texto en la pista; **sin** panel de lista dedicado
- [x] 22.3 Editar, borrar y añadir líneas — por clip de texto
- [~] 22.4 **Dividir** pulsando Enter dentro del texto — existe **"Fragmentar"** (por nº de palabras); no la división con Enter
- [x] 22.5 Estilo a **todos** a la vez — estilo de pista / "Aplicar como plantilla global"
- [~] 22.6 Importar / exportar **SRT** — exportar/copiar SRT sí (`copyTrackSrt`); **importar** SRT no

## 23. Stickers y seguimiento

- [~] 23.1 Biblioteca de stickers por categorías — `SHAPE_CATALOG` (formas vectoriales) + GIF de stock (Giphy); sin biblioteca de stickers como tal
- [ ] 23.2 Stickers generados con **IA** desde prompt — no
- [-] 23.3 Stickers de marca — descartado
- [x] 23.4 Escala, posición, rotación — pose de shape / `EdTransform`
- [~] 23.5 Animación de entrada / salida / bucle — appear/exit aplican a shapes; bucle no
- [ ] 23.6 **Seguimiento de objeto** — no

## 24. Keyframes — `clipKeyframes.js` + `EdCrops.jsx`

- [x] 24.1 Indicador (rombo) en propiedad animable — `KfDia` (transform, opacidad, volumen, audio fx, máscara)
- [x] 24.2 Añadir keyframe en el playhead — `onAddKf`
- [x] 24.3 Eliminar keyframe (mismo botón cuando está encima) — `kfState` on → quita
- [x] 24.4 Keyframe automático al cambiar un valor — con animación activa, `onPose` crea/mueve el kf
- [x] 24.5 Keyframes visibles y arrastrables en la timeline — numerados en `EdCrops`, arrastrables (`kfDown` → mueve `t`)
- [ ] 24.6 **Navegar** al keyframe anterior / siguiente — no
- [ ] 24.7 `Shift` para restringir a un eje — no confirmado (tratar como pendiente)
- [ ] 24.8 **Panel de curvas de animación** — no
- [x] 24.9 **Presets de easing** — `KF_INTERPS` (linear, ease-in, ease-out, ease-in-out, hold)
- [ ] 24.10 **Curva bézier personalizada** — no (solo presets)
- [~] 24.11 Keyframes en efectos/filtros/textos/stickers/audio — **audio** (volumen/audio fx), **máscara** y **pose** de texto/shape sí; efectos de **color/filtro** no

## 25. Menú contextual (clic derecho)

> **Menú de clip** — `VideoEditor.jsx` (`ctxMenu`). Además de lo de abajo, tiene extras propios: **orden de capas** (adelante/atrás/al frente/al fondo), **generar transcripción/subtítulos**, **aplicar plantilla global** (texto).

- [~] 25.1 Copiar / Cortar / Pegar — por teclado (`Ctrl+C/X/V`) sí; en el **menú** hay Duplicar/Eliminar, no copiar/cortar/pegar clip
- [x] 25.2 **Copiar / Pegar atributos** con selector — `Ctrl+Alt+C` / `Ctrl+Alt+V` (o menú), diálogo con 12 grupos y pegado en varios clips a la vez; ver [PEGAR_ATRIBUTOS.md](PEGAR_ATRIBUTOS.md)
- [x] 25.3 Eliminar — sí
- [ ] 25.4 **Dividir escena** (detección de tomas) — no
- [ ] 25.5 **Crear clip combinado** (anidar) — no
- [ ] 25.6 Deshacer clip combinado — no
- [ ] 25.7 **Agrupar / desagrupar** — no
- [ ] 25.8 **Preprocesar** clip — no
- [ ] 25.9 **Desactivar clip** — no (hay ocultar **pista**, no desactivar clip)
- [~] 25.10 **Extraer audio** — se extrae audio de un vídeo al material (audio); no desde el menú de clip a una pista
- [ ] 25.11 **Sincronizar video con sonido** — no
- [ ] 25.12 **Reemplazar clip** — no
- [~] 25.13 Editar efectos — se editan en el inspector, no desde el menú
- [ ] 25.14 Aislamiento vocal — no
- [~] 25.15 Menú equivalente para audio — el de audio tiene favorito + "copiar descripción"; parcial
- [ ] 25.16 Cada acción muestra su **atajo** en el menú — no

## 26. Atajos de teclado

> Existen atajos **fijos**: `Espacio`, flechas (±0,1s · Shift ±1s), `S` (dividir), `Supr/Backspace` (eliminar), `Ctrl+Z/Y/Shift+Z`, `Ctrl+C/X/V` (clips), `Alt+C/V/D` (keyframes). No hay sistema configurable.

- [ ] 26.1 Panel con **lista completa** de atajos — no
- [~] 26.2 Atajos visibles en botones/tooltips — algunos tooltips; sin sistema
- [ ] 26.3 **Personalizar** cualquier atajo — no
- [ ] 26.4 Detección de **conflictos** — no
- [ ] 26.5 **Restablecer predeterminados** — no
- [ ] 26.6 **Perfiles / esquemas** — no

## 27. Portada / miniatura

> Nada implementado.

- [ ] 27.1 Elegir frame como portada — no
- [ ] 27.2 Subir imagen propia como portada — no
- [ ] 27.3 **Editor de portada** — no
- [ ] 27.4 Exportar la portada junto al video — no

## 28. Exportación — `useExportJob.js` + `EdSettings.jsx`

> El export actual es simple: preset de **Calidad** (estándar/alta) + **FPS del proyecto**; la resolución sale del **formato** del proyecto (secciones 1.6–1.8). El diálogo no ofrece más opciones.

- [~] 28.1 Nombre y carpeta de destino — exporta a la carpeta del proyecto; sin selector de nombre/carpeta
- [~] 28.2 **Resolución** (480p – 4K) — la fija el formato del proyecto, no el diálogo de export
- [~] 28.3 **Tasa de bits** + estimación de peso — presets "Estándar/Alta"; sin bitrate manual ni estimación
- [ ] 28.4 **Códec** — no (H.264 fijo)
- [ ] 28.5 **Formato** (MP4/MOV) — no (MP4)
- [~] 28.6 **FPS** de salida — el FPS del proyecto (sección 1.8)
- [ ] 28.7 Exportar **solo audio** — no
- [ ] 28.8 Exportar **GIF** — no
- [ ] 28.9 Exportar solo el **rango I/O** — no (depende de 5.10)
- [~] 28.10 Barra de progreso + abrir carpeta — progreso por sondeo del job; "abrir carpeta al terminar" parcial
- [-] 28.11 Compartir a plataformas — descartado

## 29. Configuración global — `EdSettings.jsx`

- [~] 29.1 **Duración por defecto** de imágenes — hay valores por defecto en código; sin UI
- [~] 29.2 Duración por defecto de transiciones / textos — por defecto en código; sin UI
- [~] 29.3 Opciones de **rendimiento** (HW accel, caché) — la aceleración GPU (whisper CUDA / NVENC) vive en el backend con sonda + fallback; **sin** UI de opciones
- [ ] 29.4 **Idioma** de la interfaz — no (español fijo)
- [ ] 29.5 Carpeta de proyectos y de caché — no (UI)

---

## 30. Decisiones de adaptación (rellenar)

| Función CapCut | Equivalente actual en mi editor | Decisión |
|---|---|---|
| Animación (entrada/salida/combinado) | Paper animation sobre imágenes (`features/paper/`) | Mantener intacta; exponerla como preset dentro de Animación/Efectos |
| Auto-enmarcado (10.6) | `reframe_clip`: 9:16 con seguimiento de cara + paneo | Exponer el reframe como el "auto-enmarcado" de la sección 10 |
| Recorte automático / chroma (12.1–12.3) | `EdBgRemove` + `clipBg.js`: U²-Net, **SAM 2.1** asistido, chroma con despill | Ya cubre y supera lo básico; solo falta trazo/borde (12.2) |
| Estilos de texto (21.8/21.17/21.19) | Temas de subtítulo (karaoke), palabra activa, favoritos | Función propia fuerte; mantener como "estilos/efectos de texto" |
| Efectos de video (20.1) | `VIDEO_FX_TOGGLES` (blur, glow, VHS, grain…) | Integrarlos como catálogo propio; añadir categorías después |
| Transiciones entre clips (7) | No hay; entrada/salida (17) + interpolación de keyframes (24.9) | Cubrir el hueco con animaciones; transiciones reales = trabajo nuevo |

## 31. Orden sugerido de implementación

1. **Base imprescindible:** secciones 1–7 (proyecto, layout, medios, timeline, pistas, transiciones)
2. **Edición de clip:** 8, 9, 14, 16, 17, 25
3. **Texto y subtítulos:** 21, 22
4. **Color y efectos:** 18, 19, 20, 11, 12
5. **Avanzado:** 24 (keyframes), 23 (tracking), 10, 13
6. **Salida y calidad de vida:** 27, 28, 26, 29, 15
