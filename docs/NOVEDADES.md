# Novedades

Registro de funcionalidades añadidas al editor, de la más reciente a la más antigua.
Cada entrada dice **qué** se añadió, **dónde** se usa y enlaza a su documento de detalle.
Toda funcionalidad nueva se documenta aquí y en su `.md` propio.

---

## 2026-09-24 — El pincel de la Eliminación personalizada, como en CapCut

Detalle: [ELIMINAR_FONDO_PERSONALIZADO.md](ELIMINAR_FONDO_PERSONALIZADO.md#qué-se-ve-mientras-marcas-como-capcut).
Ajustado tras analizar fotograma a fotograma el tutorial de CapCut PC.

- **Se ve lo que pintas mientras arrastras**: el trazo inteligente en cian (rojo el del
  borrador inteligente); el pincel y el borrador normales se aplican a la selección al
  instante, sin esperar al backend, y el borrador deja un rastro rojo.
- La IA completa el objeto **al soltar** el trazo, no a mitad del arrastre.
- Mientras editas, el clip se ve **sin recortar** con la selección en cian translúcido
  encima; al Aplicar vuelve a verse el recorte. Cursor: círculo blanco.
- **Análisis en segundo plano** («Analizando el clip…», el *Procesando…* de CapCut): con
  la primera selección se analizan los demás fotogramas mientras sigues marcando, así
  que Aplicar tarda mucho menos. Cede la CPU a la selección del trazo y se puede detener.
- Corregido: tras Aplicar, el preview pintaba las marcas del pincel **fijas en todos los
  fotogramas** encima del recorte (el export no lo hacía).

## 2026-09-24 — Eliminación personalizada del fondo con seguimiento (como CapCut PC)

Detalle: [ELIMINAR_FONDO_PERSONALIZADO.md](ELIMINAR_FONDO_PERSONALIZADO.md).

- **Video → Eliminar fondo → Eliminación personalizada**: las 4 herramientas de CapCut,
  **Pincel inteligente** (pintas una parte del objeto y la IA lo selecciona entero),
  **Borrador inteligente**, **Pincel** y **Borrador** normales. La selección del
  fotograma se ve al momento sobre el reproductor.
- **Aplicar a todo el clip**: la selección **sigue al objeto** fotograma a fotograma
  aunque se mueva (antes, SAM usaba los mismos puntos en todos los fotogramas y perdía
  al sujeto en cuanto se desplazaba). Varios fotogramas marcados = cada tramo se sigue
  desde la marca más cercana; lista **Marcado en** para saltar a ellos.
- El panel queda como el de CapCut: *Eliminación automática* (U²-Net, con *Retocar
  máscara*) y *Eliminación personalizada* (SAM) se excluyen; *Ajustar recorte* sirve
  para las dos. Al activarla se elige un modelo SAM ya descargado.
- Recalcular tras cambiar marcas **no** vuelve a analizar los fotogramas (caché de
  embeddings, ahora en float16: la mitad de disco).

## 2026-09-24 — Diseño de la ventana (variantes estilo CapCut)

Detalle: [DISENO_VENTANA.md](DISENO_VENTANA.md).

- **Barra superior → botón Diseño** (icono de cuadrícula): menú con miniaturas para elegir
  cómo se colocan Materiales, Main (vista previa) e Inspector: *Predeterminado*, *Main a la
  derecha*, *Main a la izquierda*, *Invertido*, *Materiales a toda altura* (la timeline
  queda a la derecha de los materiales) y *Main a toda altura* (el Main pegado a la derecha
  de arriba abajo, la timeline debajo de Materiales e Inspector). Se recuerda entre sesiones.
- Los separadores siguen funcionando en todas las variantes (el sentido del arrastre se
  adapta al lado en que queda cada panel) y los anchos guardados se conservan.

## 2026-09-24 — Paneles más limpios: ayuda al pasar el ratón y progreso compacto

- **Ayuda al pasar el ratón** (`components/Hint.jsx`): los párrafos de ayuda del inspector
  (Eliminar fondo, Máscara, Beats, Seguimiento, Capa de ajuste, Curva), de Paper y de
  Ajustes pasan a un ⓘ junto al control o título de sección. `InspSection` e `InspSlider`
  aceptan `hint`. Los avisos de estado y los errores siguen visibles.
- **Progreso compacto** (`components/JobProgress.jsx`): una línea (spinner · mensaje · %) +
  barra fina, en lugar de la caja naranja. Se usa en Eliminar fondo, Exportar recorte,
  Motion y Paper. Arreglado el icono `progress_activity`, que no existe en Material Icons
  y dejaba un hueco vacío.

## 2026-09-24 — Recetas en un clic

Detalle: [RECETAS.md](RECETAS.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#21, completo).

- **Efectos → Recetas en un clic**: *Etalonaje de cine*, *Texto con reflejo*, *Texto que
  atraviesas*, *Franjas al ritmo* y *Sujeto que se adelanta* (con recorte IA, destello y
  sonido). Cada una se aplica de una vez y se deshace con un Ctrl+Z.
- MCP: tool nueva `apply_recipe`.

## 2026-09-24 — Barras de cine en un clic

Detalle: [BARRAS_CINE.md](BARRAS_CINE.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#20).

- **Efectos → Barras de cine** (2,39:1, 2:1, 1,85:1, 16:9): barras negras de principio a
  fin, encima de todo, con el grosor que corresponde al formato del proyecto. Grosor,
  color y entrada animada en el inspector.
- MCP: tool nueva `add_cinema_bars`.

## 2026-09-24 — Capa de ajuste

Detalle: [CAPA_AJUSTE.md](CAPA_AJUSTE.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#19).

- **Efectos → Capa de ajuste**: un clip en la timeline que da filtros y color (brillo,
  contraste, saturación, exposición, blancos, temperatura, tono) a todo lo que tiene
  debajo mientras dura, con intensidad. Igual en la vista previa y en el export.
- MCP: tool nueva `add_adjustment_layer`.

## 2026-09-24 — Filtros de color con intensidad, apilables

Detalle: [FILTROS_COLOR.md](FILTROS_COLOR.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#18).

- **Filtros** (Efectos → Video): 15 filtros en Color, Cine, Retro y Blanco y negro, con
  muestra de color. Se **apilan** en orden y cada uno tiene su **intensidad**.
- **Arreglado**: los *Estilos* (looks) no se veían igual en la vista previa y en el export
  (p. ej. Vintage solo tenía sepia en la vista previa). Ahora son la misma matriz de
  color en los dos; los proyectos antiguos pueden cambiar un poco de color.
- MCP: `set_clip_effects(filters=[{id, amount}])`.
- No incluye LUT `.cube` (queda pendiente).

## 2026-09-24 — Sonorizar una escena con IA

Detalle: [SONORIZAR_IA.md](SONORIZAR_IA.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#17).

- Clic derecho en un vídeo o imagen → **Sonorizar con IA**: la IA (mirando la escena si
  hay Foundry) propone ambiente y sonidos puntuales, los busca en tu biblioteca de SFX y,
  tras revisarlos (escuchar, marcar), los coloca en pistas **SFX** en su momento.
- Lo que no está en tu biblioteca se avisa en vez de sustituirlo por otra cosa.
- MCP: tool nueva `sound_design`.

## 2026-09-24 — Filtros de sonido y efectos de audio audibles en la vista previa

Detalle: [FILTROS_SONIDO.md](FILTROS_SONIDO.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#16).

- **Filtros de sonido**: Bajo el agua, Teléfono, Radio antigua, Megáfono y Amortiguado,
  con **intensidad animable** por keyframes (la música que se hunde al entrar al agua).
- **Arreglado**: los efectos de audio no se oían en la vista previa y el export ignoraba
  sus keyframes. Ahora suenan igual en los dos (Web Audio en el editor).
- Cambia un poco el sonido de algunos efectos existentes (la intensidad es una mezcla;
  Distorsión ahora satura en vez de reducir bits).
- MCP: `set_clip_audio_fx` acepta los filtros y `ramp` para animarlos; rechaza efectos que
  no existen.

## 2026-09-24 — Seguimiento de objetos

Detalle: [SEGUIMIENTO_OBJETOS.md](SEGUIMIENTO_OBJETOS.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#15).

- **Animación → Seguimiento**: marcas con un recuadro un objeto del vídeo y el clip
  seleccionado (texto, figura, imagen…) lo acompaña: posición, y si quieres escala y giro.
  Se sigue hacia delante y hacia atrás; el resultado son keyframes editables.
- MCP: tool nueva `track_object`.
- **Arreglado**: *Seguir cara* de las máscaras quedaba desplazado en vídeos volteados y
  en clips a pantalla completa (fill).

## 2026-09-24 — Pluma, trazo punteado y «dibujar trazo»

Detalle: [TRAZADO_PLUMA.md](TRAZADO_PLUMA.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#14).

- **Pluma** (Figuras → *Pluma*): clic a clic en el visor se traza una línea o ruta curva
  (doble clic o Enter termina; clic en el primer punto la cierra). *Editar puntos* permite
  moverlos, añadir (clic en la línea) y quitar (Alt+clic).
- **Trazo** continuo, **discontinuo** o **punteado** en todas las figuras.
- **Dibujar trazo**: la línea aparece poco a poco (slider *Dibujado* con keyframes, o
  *Animar: se dibuja al aparecer*). Sale igual en el export.
- MCP: `add_shape(points=…)` para rutas, `shape.dash`, y `animate_clip(motion="draw_in")`.

## 2026-09-24 — Pegar atributos eligiendo qué

Detalle: [PEGAR_ATRIBUTOS.md](PEGAR_ATRIBUTOS.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#13).

- **Copiar atributos** (Ctrl+Alt+C o clic derecho) y **Pegar atributos…** (Ctrl+Alt+V):
  un diálogo deja elegir qué se pega — posición, voltear, opacidad y fusión, animación,
  entrada/salida, recorte, filtro/efectos, máscara, croma y contorno, estilo, velocidad,
  audio — y se aplica a **todos los clips seleccionados** de una vez (un solo deshacer).
- Sustituye a *Copiar / Pegar propiedades*, que pegaba todo y solo en vídeos e imágenes.
- Pegar la animación ya no pisa el volumen ni la posición del clip destino.
- MCP: tool nueva `paste_clip_attributes`.

## 2026-09-24 — Beats automáticos y marcadores

Detalle: [BEATS_MARCADORES.md](BEATS_MARCADORES.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#12).

- **Marcadores** en la timeline: **M** (o botón *Marcador*), arrastrables, con nombre.
- **Detectar beats** en clips de audio/vídeo (clic derecho o Audio → Beats): puntos
  amarillos por golpe, densidad 1 / 2 / 4, tempo en BPM.
- **Imán**: los clips se enganchan a marcadores y beats al moverlos o recortarlos;
  **,** y **.** saltan entre ellos.
- MCP: tools nuevas `detect_beats` y `set_timeline_markers`.

## 2026-09-24 — Congelar fotograma

Detalle: [CONGELAR_FOTOGRAMA.md](CONGELAR_FOTOGRAMA.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#11).

- Botón **Congelar** (o clic derecho): parte el vídeo en el cursor e inserta una imagen
  fija de ese fotograma (3 s) con la misma pose, recorte y efectos.
- MCP: tool nueva `freeze_frame`.
- **Arreglado**: al partir un clip con keyframes, la segunda mitad reiniciaba la
  animación; partir un clip invertido cruzaba entrada y salida; `split_clip` del MCP
  ignoraba la velocidad.

## 2026-09-24 — Desactivar clip (V)

Detalle: [DESACTIVAR_CLIP.md](DESACTIVAR_CLIP.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#10).

- Tecla **V** (o clic derecho → *Desactivar clip*): el clip sigue en la timeline,
  atenuado, pero no se ve, no suena ni se exporta. La duración no cambia.
- MCP: `update_clip` acepta `disabled`.

## 2026-09-24 — Contorno / halo del sujeto recortado

Detalle: [CONTORNO_SUJETO.md](CONTORNO_SUJETO.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#9).

- Eliminar fondo → **Contorno**: borde de color alrededor del sujeto (grosor,
  difuminado para hacerlo halo y opacidad). Sale igual en el export.

## 2026-09-24 — Modos de fusión

Detalle: [MODOS_FUSION.md](MODOS_FUSION.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#8).

- **Modo de fusión** por clip (vídeo, imagen, figura y texto): Multiplicar, Trama,
  Superponer, Luz suave/fuerte, Oscurecer/Aclarar, Subexponer/Sobreexponer color,
  Diferencia y Exclusión. En *Mezcla*, debajo de Opacidad. Mismo resultado en el export.
- MCP: `update_clip` acepta `blend_mode`.
- **Arreglado (todos los proyectos)**: la **opacidad fija** de vídeos e imágenes (sin
  keyframes) no se exportaba: el clip salía opaco.

## 2026-09-24 — Voltear horizontal / vertical

Detalle: [VOLTEAR.md](VOLTEAR.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#7).

- **Voltear** vídeo, imagen, figura o texto (Transformación → *Voltear*, o clic derecho
  sobre el clip en la timeline). Espejo en los ejes del clip; sale igual en el export.
- MCP: `update_clip` acepta `flip_h` / `flip_v`.
- **Arreglado (todos los proyectos)**: los vídeos e imágenes **girados** perdían las
  esquinas en el vídeo exportado (a 20° se perdía el 26 % de la imagen).

## 2026-09-24 — Espaciado entre letras, interlineado y tamaño real del texto exportado

Detalle: [TEXTO_ESTILO.md](TEXTO_ESTILO.md#espaciado-entre-letras-e-interlineado-6). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#6).

- Texto → **Espaciado** (entre letras, también negativo) e **Interlineado**.
- **Arreglado (todos los textos)**: la letra exportada salía más pequeña que en la vista
  previa (Arial −11 %, Anton −43 %). Ahora mide lo mismo.
- **Arreglado**: el export repartía las líneas y las separaba distinto que la vista
  previa; ahora usa el mismo reparto y la misma distancia entre líneas.

## 2026-09-24 — Escala extrema y uniforme en textos

Detalle: [TEXTO_ESTILO.md](TEXTO_ESTILO.md#escala-extrema-y-uniforme-5). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#5).

- Escala de texto hasta **10 000 %** escribiendo el valor (truco "texto que atraviesas").
- La escala agranda el texto entero con su caja: un título ya no se reparte en más
  líneas al agrandarlo (vista previa y export).

## 2026-09-24 — Texto 3D

Detalle: [TEXTO_ESTILO.md](TEXTO_ESTILO.md#texto-3d-4). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#4).

- Texto → *Animación* → Transformación: **Inclinar 3D**, **Girar 3D** (con keyframes) y
  **Perspectiva**. Perspectiva real en la vista previa (WebGL) y en el export (filtro
  `perspective` de FFmpeg), con la misma geometría.
- Arreglado: si todos los textos llevaban máscara, el export los repetía planos encima.

## 2026-09-24 — Sombra de texto completa

Detalle: [TEXTO_ESTILO.md](TEXTO_ESTILO.md#sombra-paralela-3). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#3).

- Texto → *Sombra*: **color, opacidad, desenfoque, distancia y ángulo** (antes: interruptor
  con 2 px fijos). La sombra es de la silueta completa y escala con el texto.
- Arreglado: la sombra no se veía en la vista previa en textos sin borde.
- Export: evento de sombra propio bajo cada texto, con el desenfoque calibrado a libass.

## 2026-09-24 — Curvas de animación en los keyframes

Detalle: [CURVAS_ANIMACION.md](CURVAS_ANIMACION.md). Plan: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#2).

- **Curva de velocidad** por keyframe (Transiciones / Animación): Linear, Ease, **Cúbicas**,
  **Rebote**, Hold y **Personalizada** (editor bézier con dos tiradores).
- El **export respeta las curvas** en vídeo, imagen y figura (antes iba siempre en línea
  recta entre keyframes).
- Figuras: una figura animada ya no sale desplazada en el export, y la **escala** de una
  figura quieta llega al vídeo.
- MCP: `set_clip_keyframes` acepta `interpolation` nuevas y `bezier`.

## 2026-09-24 — Texto animado en el export

Detalle: [TEXTO_ANIMADO.md](TEXTO_ANIMADO.md). Plan completo: [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md) (#1).

- Los textos con **keyframes** (posición, escala, giro, opacidad), los animados por el
  MCP con `animate_clip` y las pistas `anim` antiguas **se exportan animados**, igual
  que en la vista previa. Antes salían quietos con la pose del segundo 0.
- El **giro** del texto se exportaba en sentido contrario; ahora coincide. Los textos
  alineados a izquierda/derecha giran alrededor del centro de su caja.
- Un texto **fuera del cuadro** (que entra desde un lado) ya no se pega al borde.

## 2026-09-24 — Máscaras y ajustes estilo CapCut

Detalle: [MASCARAS.md](MASCARAS.md).

- **Máscara «Rollo de película»** (`film`): banda de alto ajustable, girable, con pluma
  y keyframes (barras de cine, brillos, transiciones).
- **Máscara de ajuste**: en una máscara, *Aplicar a: Ajustes* limita los ajustes de color
  a su interior. Acceso rápido: Ajustar → *Aplicar solo en una zona (máscara)*.
- **Ajustes nuevos**: Exposición, Blancos, Temperatura y Tono (círculo cromático), en
  Video → Ajustar y en Efectos.
- **Máscara en textos**: los clips de texto tienen pestaña *Máscara* (revelar texto).
- **Seguir cara**: la máscara sigue la cara del vídeo (keyframes de posición automáticos).
- **MCP**: nueva tool `set_clip_masks`; `set_clip_effects` acepta `exposure`, `whites`,
  `temperature`, `hue`; `describe_capabilities` lista `mask_types`.

## 2026-09-24 — `crop_clip` en el MCP

Detalle: [RECORTAR.md](RECORTAR.md#mcp-crop_clip).

- Tool `crop_clip`: recorta (`cx, cy, w, h`) o restablece (`reset=true`) uno o varios
  clips, o una pista entera, en un solo undo.

## 2026-09-24 — Recortar estilo CapCut

Detalle: [RECORTAR.md](RECORTAR.md).

- Botón **Recortar** en el toolbar de la timeline → modal con la fuente completa,
  recuadro con tiradores, scrub, rotación, proporciones, Restablecer y Confirmar.
- Se retiró la vista partida recorte | RESULTADO y el toggle *Recortar* del inspector.

## 2026-09-23 — Arreglos de render (FFmpeg 9)

- `render_timeline_frame` / export: FFmpeg 9 intentaba cargar como fuente todo el
  contenido de `backend/app/fonts/` (`Error opening memory font 'OFL.txt'`). La licencia
  se movió a `backend/app/fonts_licenses/`; en `fonts/` solo van `.ttf/.otf`.
- `render_frame` (un fotograma) dejaba una salida de audio sin mapear en el grafo
  ("Error binding filtergraph inputs/outputs"); ahora omite la cadena de audio.
  Test: `backend/tests/test_compose_frame.py`.
