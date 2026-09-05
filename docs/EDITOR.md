# Editor de vídeo — Guía rápida

## Qué es y para qué sirve

Es un editor de vídeo web pensado para crear **clips cortos y verticales** (formato Shorts/Reels/TikTok) a partir de vídeos de YouTube, archivos locales y material de stock. Todo el trabajo se organiza por **proyectos**: cada proyecto guarda su material (vídeos, audios, imágenes, SFX) y su composición.

## Cómo funciona (en general)

- La app arranca en una **pantalla de inicio** con tus proyectos. Creas o abres uno y entras al editor.
- Dentro del proyecto trabajas sobre una **timeline** con pistas (vídeo, audio y texto). Añades material, lo recortas, lo colocas y le aplicas efectos.
- Hay una **vista previa en vivo**: lo que ves es lo que se exporta.
- Al terminar, **exportas** el resultado a un archivo de vídeo descargable.
- Un asistente de **IA (Chat)** puede realizar las mismas acciones del editor por ti mediante lenguaje natural.

## Principales elementos de la interfaz

El editor se divide en dos zonas: parte superior (3 columnas) y parte inferior (timeline).

**Columna izquierda — Material y paneles.** Barra de pestañas:
- **Video** — clips del proyecto, clips guardados y "Cargar" (pegar URL de YouTube o subir/arrastrar un archivo).
- **Imagen** — imágenes del proyecto + búsqueda de stock (Explorar).
- **Audio** — generar narración (TTS) o extraer audio de YouTube.
- **SFX** — biblioteca de efectos de sonido, por categorías y favoritos.
- **Efectos** — efectos y ajustes del clip/pista seleccionado.
- **Figuras** — formas geométricas, flechas, elementos UI.
- **Texto** — edición y estilo del texto seleccionado.
- **Transiciones** — transiciones de entrada/salida.
- **Configuración** — claves de API, calidad de export, FPS, modelo de transcripción.
- **Chat IA** — asistente que edita el proyecto por ti.

**Columna central — Editor principal.** Dos modos:
- **Main Editor** — lienzo de la composición; mover/encuadrar clips, texto y figuras arrastrando.
- **Clip Editor** — preparar un tramo de un vídeo (reencuadre, seguimiento de cara) y guardarlo como clip del material.

**Columna derecha — Resultado.** Vista previa final vertical, selector de **formato de salida**, controles de **reproducción** (play, avance/retroceso, barra de progreso), nivel de audio objetivo, botón **JSON** del proyecto y botón **Exportar / Guardar clip / Descargar**.

**Parte inferior — Timeline.** Pistas de vídeo, audio y texto; regla de tiempo; zoom; cabezal de reproducción; menús contextuales (clic derecho) sobre clips y pistas.

## Qué se puede hacer

**Material**
- Cargar vídeo desde **URL de YouTube** (con detección de tramos recomendados por el heatmap) o definir un tramo personalizado.
- **Subir/arrastrar** vídeos, imágenes y audios locales.
- Buscar y añadir **imágenes y vídeos de stock** (Pexels, GIPHY, Pixabay, Unsplash…).
- Generar **narración por voz (TTS)** con varios motores (Kokoro, Gemini, ElevenLabs), elegir voz, mezclar dos voces, velocidad y pausas.
- Extraer el **audio** de un vídeo de YouTube.
- Biblioteca de **SFX** con categorías, clasificación y favoritos.

**Timeline y clips**
- Añadir clips a las pistas arrastrando o con un clic.
- **Cortar/dividir**, **duplicar**, **eliminar**, mover y recortar clips.
- Múltiples **pistas** de vídeo/audio/texto; crear, renombrar, ocultar, silenciar, bloquear, compactar y **relacionar** pista de audio con su texto.
- Ordenar **capas** (adelante/atrás) de clips superpuestos.
- Igualar duraciones entre clips seleccionados.
- Selección múltiple y edición en grupo.

**Encuadre y movimiento**
- **Reencuadre** de vídeo horizontal a vertical (recorte con posición y zoom).
- **Seguimiento de cara** automático (suave o directo) para mantener al sujeto en cuadro.
- Modo **superponer** (overlay/PIP): colocar un clip encima con posición, escala y rotación.
- **Keyframes** para animar encuadre, posición, escala, rotación, opacidad y volumen, con distintos tipos de transición.

**Efectos**
- Filtros visuales: desenfoque, enfoque, glow, grayscale, sepia, pixelado, VHS, grano.
- Ajustes de color: brillo, contraste, saturación y presets (B/N, cinematic, vintage, warm, cool…).
- Transiciones de entrada/salida: fade, dissolve, wipe, zoom, slide, pop.
- Audio: volumen (con keyframes), fundidos de entrada/salida, ecualizador, compresor, reverb, echo, reducción de ruido, distorsión.
- Cambiar **velocidad** del clip (con o sin cambio de tono) y reproducción inversa.

**Texto y subtítulos**
- Añadir textos a la composición con estilos, presets y favoritos.
- **Transcribir** vídeo y **generar subtítulos** de audio automáticamente (Whisper).
- Efecto **karaoke** (resaltado palabra a palabra) y fragmentar textos por nº de palabras.
- Aplicar un estilo como **plantilla global** a todos los textos.

**Figuras**
- Insertar formas básicas, flechas, elementos geométricos y de UI, con posición, tamaño, rotación y opacidad.

**Salida**
- Elegir **formato**: 9:16, 9:16 HD, 16:9, 1:1, 4:5, 4:3 (o personalizado).
- Ajustar FPS, calidad y nivel de audio objetivo.
- **Exportar** el proyecto a vídeo y descargarlo, o **guardar** un tramo como clip del material.
- Ver/editar el **JSON** del proyecto.

**Asistente IA**
- Chat que ejecuta las acciones del editor (cargar vídeo, crear clips, reencuadrar, subtítulos, efectos, exportar, etc.) mediante instrucciones en lenguaje natural, con deshacer/rehacer y puntos de control.

## Funciones en detalle

### Reencuadre y seguimiento de cara

Pensado para pasar vídeo horizontal (16:9) a vertical sin perder al sujeto.

- **Preparar el tramo (Clip Editor):** al pulsar "Editar" sobre un tramo recomendado de YouTube (o uno personalizado / el vídeo completo), el editor genera un *proxy* ligero de ese fragmento y lo carga en el lienzo. Un tramo recomendado ya viene con un reencuadre inicial propuesto.
- **Encuadre manual:** en el **Main Editor** arrastras el recuadro para elegir qué parte del vídeo se ve, y usas las esquinas para el **zoom**. El recuadro respeta el formato de salida elegido.
- **Seguimiento de cara automático:** genera keyframes que siguen al rostro a lo largo del clip. Dos modos:
  - **Suave** — el encuadre acompaña a la cara con movimiento amortiguado (menos brusco).
  - **Directo** — sigue la posición de la cara de forma más literal.
- **Animación con keyframes:** cada punto de encuadre queda como keyframe numerado (panel *Keyframes* junto a la timeline). Puedes añadirlos en la posición del cabezal, seleccionarlos, borrarlos y elegir el **tipo de transición** entre ellos (cómo llega el encuadre a ese punto). Los keyframes también sirven para animar posición, escala, rotación, opacidad y volumen.
- **Superponer (overlay / PIP):** en lugar de rellenar todo el cuadro, el clip se coloca **encima** de la composición con su propia posición, **escala** y **rotación** (se ajusta arrastrando en la vista de Resultado). El encuadre de la fuente y el tamaño en pantalla son independientes.
- **Guardar clip:** el resultado (con su reencuadre y animación) se "hornea" y se guarda como clip reutilizable del material, con título y descripción. Si editabas uno existente, lo sobrescribe.

### Texto y subtítulos

- **Transcripción y subtítulos automáticos** (clic derecho sobre el clip):
  - En un **vídeo** → "Generar transcripción".
  - En un **audio** → "Generar subtítulos".
  - Se procesan con **Whisper** (modelo configurable: Tiny → Large v3) y crean automáticamente los clips de texto en una pista, sincronizados con el habla.
- **Estilo del texto:** fuente, tamaño (px), alineación, color de texto/borde/fondo, grosor de borde, sombra, brillo, negrita, caja de fondo y opacidad (del texto y del fondo).
- **Temas de subtítulo (presets):** galería de estilos predefinidos aplicables con un clic.
- **Efecto karaoke** (resaltado palabra a palabra): color de la palabra activa, opacidad de palabras activas/inactivas y efectos combinables sobre la palabra que se está diciendo.
- **Palabras por cuadro:** límite de palabras que se muestran a la vez (1–10). **Fragmentar** parte un texto largo en varios clips respetando los tiempos originales.
- **Posición y tamaño:** X/Y, ancho de caja y duración; el texto también se arrastra directamente en el Main. En una pista de texto, **Encuadrar** define de golpe la posición y el tamaño de todos sus textos con un recuadro.
- **Aplicar a todos:**
  - **Global** — copia estilo y posición de un texto a todos los del timeline.
  - **Nivel pista** — el estilo de la pista se aplica a todos sus textos y a los nuevos.
- **Favoritos:** guardar estilos (encuadre + tema + tamaño) y reutilizarlos después.

### Audio y voz (TTS)

Pestaña **Audio**, con dos modos:

- **Narrador (generar voz):**
  - **Motores:** Kokoro (local), Gemini y ElevenLabs, entre otros; los no instalados/sin clave aparecen deshabilitados.
  - **Voz:** listado por motor (con género). Con Kokoro puedes **mezclar dos voces** y regular la proporción de mezcla.
  - **Ajustes:** velocidad (0,5×–1,5×) y pausa entre frases; con Gemini, estilo de locución (Documental / Cercano).
  - **Guion:** pegas o escribes el texto a narrar. Un ayudante genera un **prompt listo** (a partir de un tema) para pedirle el guion a una IA y pegarlo aquí.
  - El audio generado se añade al proyecto; puedes ponerle nombre.
- **YouTube (extraer audio):** obtiene la pista de audio de un vídeo de YouTube y la deja en el proyecto (opción de guardarla para reutilizar en otros proyectos).

Una vez en la timeline, todo audio (o el audio de un vídeo) admite **volumen** (con keyframes), **fundidos** de entrada/salida, **velocidad** (con o sin cambio de tono) y efectos: ecualizador, compresor, reverb, echo, reducción de ruido y distorsión.

## Flujo básico de trabajo

1. **Crear/abrir un proyecto** desde la pantalla de inicio.
2. **Cargar material**: pega una URL de YouTube, sube un archivo o busca stock.
3. (Opcional) En **Clip Editor**, preparar un tramo con reencuadre/seguimiento de cara y guardarlo.
4. **Montar en la timeline**: añadir clips, audio y texto a las pistas; cortar, mover y ordenar.
5. **Ajustar**: encuadre, efectos, transiciones, subtítulos y velocidad.
6. **Previsualizar** en la columna de Resultado y elegir el **formato de salida**.
7. **Exportar** y descargar el vídeo final.
