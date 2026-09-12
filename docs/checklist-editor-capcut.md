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

**Regla de adaptación:** funciones extra propias (ej. *paper animation* sobre imágenes) se conservan tal cual y se exponen como una entrada más dentro de la sección equivalente de CapCut (ej. **Efectos** o **Animación**), sin modificar su comportamiento.

---

## 1. Proyecto y arranque

- [ ] 1.1 Pantalla de inicio con botón **Nuevo proyecto**
- [ ] 1.2 Lista de **proyectos recientes** (abrir, renombrar, duplicar, eliminar)
- [ ] 1.3 Autoguardado / recuperación de sesión
- [ ] 1.4 Propiedades de proyecto al deseleccionar todo (panel derecho muestra el proyecto)
- [ ] 1.5 Renombrar proyecto
- [ ] 1.6 **Relación de aspecto**: original, 16:9, 9:16, 1:1, 4:3, 3:4 + personalizada
- [ ] 1.7 **Resolución**: adaptada / personalizada
- [ ] 1.8 **FPS** del proyecto (24 / 25 / 30 / 50 / 60)
- [ ] 1.9 Espacio de color
- [ ] 1.10 **Proxy** / redimensionamiento para equipos lentos

## 2. Layout de la interfaz

- [ ] 2.1 Panel de **medios** (izquierda)
- [ ] 2.2 **Reproductor** / previsualización (centro)
- [ ] 2.3 Panel de **propiedades** contextual (derecha) — cambia según selección: proyecto / video / audio / texto / efecto
- [ ] 2.4 **Línea de tiempo** (abajo) con indicador (playhead)
- [ ] 2.5 Paneles redimensionables
- [ ] 2.6 Modo **pantalla completa** del reproductor
- [ ] 2.7 Tiempo actual + duración total visibles
- [ ] 2.8 **Medidor de volumen (VU)** en reproducción

## 3. Medios e importación

- [ ] 3.1 Importar archivos (video, imagen, audio) desde disco
- [ ] 3.2 Drag & drop desde el SO
- [ ] 3.3 Biblioteca local con miniaturas
- [ ] 3.4 Añadir a timeline por **arrastre** o botón **+**
- [ ] 3.5 Previsualización del medio antes de insertar (scrub en miniatura)
- [ ] 3.6 Biblioteca de recursos integrada (stock)
- [ ] 3.7 Assets con **pantalla verde**
- [ ] 3.8 Assets de **marca** (brand kit)
- [ ] 3.9 Carpetas / organización de medios

## 4. Línea de tiempo — herramientas

- [ ] 4.1 **Seleccionar** (flecha) — `A`
- [ ] 4.2 **Dividir / cortar** (navaja) — `B`
- [ ] 4.3 **Seleccionar hacia la izquierda**
- [ ] 4.4 **Seleccionar hacia la derecha**
- [ ] 4.5 Dividir en el playhead (botón + `Ctrl/Cmd+B`)
- [ ] 4.6 **Borrar a la izquierda** del playhead
- [ ] 4.7 **Borrar a la derecha** del playhead
- [ ] 4.8 **Trim** arrastrando extremos del clip (inicio y fin)
- [ ] 4.9 Reordenar clips arrastrando
- [ ] 4.10 Eliminar clip (papelera / `Supr`)
- [ ] 4.11 **Deshacer / Rehacer** (botones + `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`)
- [ ] 4.12 Copiar / cortar / pegar clips (`Ctrl+C` / `Ctrl+X` / `Ctrl+V`)
- [ ] 4.13 Selección múltiple (`Ctrl/Cmd+clic` y lazo con arrastre)

## 5. Línea de tiempo — comportamiento

- [ ] 5.1 **Zoom** con `Ctrl/Cmd + scroll`
- [ ] 5.2 Zoom con `Ctrl/Cmd + / -` y slider
- [ ] 5.3 **Ajustar a ventana** (ver toda la timeline)
- [ ] 5.4 **Imán global** (sin huecos / ripple) — activable
- [ ] 5.5 **Snap entre clips** con guía visual de alineación — activable
- [ ] 5.6 **Vincular / desvincular** clips (texto y overlays siguen al clip base)
- [ ] 5.7 **Preview al pasar el mouse** sobre la timeline — activable
- [ ] 5.8 Reproducir con `Espacio`
- [ ] 5.9 **Marcadores** (añadir/quitar en el playhead)
- [ ] 5.10 **Rango I/O** para exportar solo un segmento (`I` = in, `O` = out)

## 6. Pistas (canales)

- [ ] 6.1 Pistas ilimitadas de video apiladas (overlay)
- [ ] 6.2 Crear pista automáticamente al soltar un clip encima
- [ ] 6.3 Pistas de audio independientes
- [ ] 6.4 Pista dedicada de **efectos**
- [ ] 6.5 Pista dedicada de **filtros / capa de ajuste**
- [ ] 6.6 **Bloquear** pista
- [ ] 6.7 **Ocultar / mostrar** pista
- [ ] 6.8 **Silenciar** pista
- [ ] 6.9 Mostrar / ocultar forma de onda

## 7. Transiciones

- [ ] 7.1 Biblioteca de transiciones por categorías
- [ ] 7.2 Arrastrar transición al punto de corte
- [ ] 7.3 Sustituir transición existente arrastrando otra encima
- [ ] 7.4 Ajustar **duración** arrastrando en la timeline
- [ ] 7.5 Ajustar duración desde el panel de propiedades
- [ ] 7.6 **Aplicar a todos** los cortes del proyecto

## 8. Transformación del clip (panel Básico)

- [ ] 8.1 **Escala** (numérica + handles en el reproductor)
- [ ] 8.2 **Posición X / Y** (numérica + arrastre)
- [ ] 8.3 **Rotación** (rueda + valor)
- [ ] 8.4 Doble clic en un valor = **reset de ese valor**
- [ ] 8.5 Botón de **reset** de toda la sección
- [ ] 8.6 **Alineación** en el lienzo (izq / centro H / der / arriba / centro V / abajo)
- [ ] 8.7 **Distribución** equitativa entre 3+ elementos seleccionados (H y V)
- [ ] 8.8 **Mezcla**: opacidad
- [ ] 8.9 **Modos de fusión** (multiplicar, pantalla, luz intensa, desvanecimiento de color, etc.)

## 9. Operaciones rápidas sobre el clip (barra de herramientas)

- [ ] 9.1 **Congelar fotograma** (freeze frame como clip nuevo, duración ajustable)
- [ ] 9.2 **Reversa** (reproducción invertida, con procesado)
- [ ] 9.3 **Espejo / flip** horizontal y vertical
- [ ] 9.4 **Rotar 90°** por pasos
- [ ] 9.5 **Recortar (crop)** con handles libres, presets de relación, rotación e inclinación, scrub para elegir el frame de referencia

## 10. Corrección y mejora de video

- [ ] 10.1 **Estabilización** con niveles (corte mínimo / recomendado / más estable)
- [ ] 10.2 **Reducción de ruido** de imagen (suave / medio / fuerte)
- [ ] 10.3 **Eliminar parpadeo (deflicker)** — modo linterna / timelapse + intensidad
- [ ] 10.4 **Desenfoque de movimiento (motion blur)** con intensidad
- [ ] 10.5 **Iluminación añadida**: presets por categoría, hasta N luces, tipo (direccional / punto), color, intensidad, radio, distancia, objetivo (fondo / persona / ambos)
- [ ] 10.6 **Auto-enmarcado**: relación destino, seguimiento del sujeto, estabilidad, velocidad de seguimiento, aplicar

## 11. Lienzo / fondo

- [ ] 11.1 **Desenfoque** de fondo con niveles
- [ ] 11.2 **Color** sólido personalizable
- [ ] 11.3 **Estilos / patrones** predefinidos
- [ ] 11.4 Fondo de **marca**
- [ ] 11.5 **Aplicar a todos** los clips

## 12. Recorte de fondo y composición

- [ ] 12.1 **Recorte automático** (quitar fondo, figuras humanas)
- [ ] 12.2 **Trazo / borde** del recorte: estilo, color, tamaño, opacidad, animado
- [ ] 12.3 **Chroma key**: cuentagotas de color, intensidad, sombra/suavizado
- [ ] 12.4 **Máscaras**: horizontal, doble línea/espejo, círculo, rectángulo, corazón, estrella
- [ ] 12.5 Máscara: posición X/Y, rotación, tamaño (ancho/alto), **pluma (feather)**, esquinas redondeadas
- [ ] 12.6 Invertir máscara

## 13. Retoque (Mejorar)

- [ ] 13.1 Suavizado de rostro
- [ ] 13.2 Iluminación de rostro
- [ ] 13.3 Blanqueado de dientes
- [ ] 13.4 Belleza facial (tamaño y distancia de ojos, rasgos)
- [ ] 13.5 Maquillaje (presets)
- [ ] 13.6 Ajuste corporal (proporciones, tamaño de cabeza)

## 14. Audio — propiedades del clip

- [ ] 14.1 **Volumen** en dB con indicación de saturación en la onda
- [ ] 14.2 **Fade in** (aparición progresiva) con handle en la onda
- [ ] 14.3 **Fade out** (desaparición progresiva)
- [ ] 14.4 **Normalización de intensidad** (loudness)
- [ ] 14.5 **Mejorar voz** (ecualización + limpieza)
- [ ] 14.6 **Reducción de ruido**
- [ ] 14.7 **Aislamiento vocal**: mantener voz / eliminar voz
- [ ] 14.8 **Canales**: duplicar izquierdo↔derecho, mono/estéreo
- [ ] 14.9 **Modificador de voz** por categorías (lo-fi, personajes, etc.)
- [ ] 14.10 Voz a canción
- [ ] 14.11 Panel de audio idéntico para clips de video con audio y para clips de audio puro

## 15. Audio — biblioteca y grabación

- [ ] 15.1 **Música** por categorías + búsqueda
- [ ] 15.2 Filtro de uso **comercial**
- [ ] 15.3 **Efectos de sonido** por categorías + búsqueda
- [ ] 15.4 **Favoritos** (estrella) con categoría propia
- [ ] 15.5 Previsualización con onda antes de insertar
- [ ] 15.6 **Audios extraídos** (historial)
- [ ] 15.7 **Grabar voz en off**: selección de micrófono, medidor de nivel, ganancia, reducir eco, silenciar proyecto durante la grabación, mejora de voz, cuenta regresiva 3-2-1, stop
- [ ] 15.8 Verificador de **copyright** del proyecto por plataforma

## 16. Velocidad

- [ ] 16.1 Velocidad **normal**: multiplicador (0.1x – 100x)
- [ ] 16.2 Velocidad por **duración objetivo** (escribir segundos)
- [ ] 16.3 **Cambiar tono** de voz al variar velocidad (on/off)
- [ ] 16.4 **Velocidad en curva** con presets (montaje, héroe, bala, salto, flash in/out)
- [ ] 16.5 Curva **personalizada**: añadir, mover y borrar puntos
- [ ] 16.6 **Cámara lenta fluida**: mezcla de fotogramas / **flujo óptico**
- [ ] 16.7 El clip se alarga/acorta visualmente en la timeline al cambiar velocidad

## 17. Animaciones predefinidas

- [ ] 17.1 Animación de **entrada** + duración
- [ ] 17.2 Animación de **salida** + duración
- [ ] 17.3 Animación **combinada** (loop/in-out)
- [ ] 17.4 Handles de duración de animación sobre el propio clip
- [ ] 17.5 Opción **Ninguno** para limpiar
- [!] 17.6 *Paper animation* (propia, sobre imágenes) → exponer aquí o en Efectos **sin modificar su comportamiento**

## 18. Color y ajuste

- [ ] 18.1 **LUT**: importar `.cube`, biblioteca propia, fuerza, protección de tonos de piel
- [ ] 18.2 Básico: temperatura, tono (magenta/verde), saturación, brillo, contraste, iluminaciones, sombras, blancos, negros, nitidez, viñeta
- [ ] 18.3 **HSL** por color (rojo, naranja, amarillo, verde, cian, azul, magenta): tono, saturación, luminancia
- [ ] 18.4 **Curvas**: brillo + canales R / G / B, puntos editables
- [ ] 18.5 **Osciloscopio / scopes** (waveform, RGB parade, vectorscopio)
- [ ] 18.6 Reset por sección y por valor
- [ ] 18.7 **Guardar preset** de ajuste con nombre
- [ ] 18.8 Biblioteca de **predefinidos** guardados

## 19. Filtros y capas de ajuste

- [ ] 19.1 **Filtros** por categorías (película, retro, etc.) con intensidad
- [ ] 19.2 Filtro aplicado **al clip** o como **capa** sobre pista propia
- [ ] 19.3 **Capa de ajuste** que afecta a todo lo que está debajo, con duración arrastrable
- [ ] 19.4 Aplicar LUT desde la capa de ajuste

## 20. Efectos

- [ ] 20.1 **Efectos de video** por categorías (tendencias, apertura/cierre, lente, glitch, TV…)
- [ ] 20.2 Aplicar **sobre el clip** o en **pista de efectos** independiente
- [ ] 20.3 Parámetros propios por efecto (velocidad, rango, desenfoque, aberración cromática, ruido, textura…)
- [ ] 20.4 **Editar los efectos** desde clic derecho cuando hay varios apilados
- [ ] 20.5 Eliminar efecto
- [ ] 20.6 **Efectos corporales** (superpoderes, contornos, con color e intensidad)
- [!] 20.7 Efectos propios existentes → integrarlos en este catálogo como categoría propia, sin tocar su lógica

## 21. Texto

- [ ] 21.1 Añadir texto por defecto / arrastrar a la timeline
- [ ] 21.2 Edición inline en el reproductor
- [ ] 21.3 **Fuente** (buscador + preview), tamaño
- [ ] 21.4 Negrita, cursiva, subrayado, **MAYÚSCULAS**
- [ ] 21.5 Color de relleno
- [ ] 21.6 **Espaciado entre caracteres** e **interlineado**
- [ ] 21.7 Alineación (izq / centro / der; arriba / medio / abajo)
- [ ] 21.8 **Estilos predefinidos**
- [ ] 21.9 Escala, posición, rotación + alineación en el lienzo
- [ ] 21.10 Opacidad / mezcla
- [ ] 21.11 **Trazo**: grosor y color
- [ ] 21.12 **Fondo**: color, opacidad, ancho, alto, redondez, desplazamiento X/Y
- [ ] 21.13 **Brillo / glow**: color e intensidad
- [ ] 21.14 **Sombra**: color, distancia, ángulo, desenfoque
- [ ] 21.15 **Curva** del texto (arco positivo/negativo)
- [ ] 21.16 **Burbujas** (bocadillos predefinidos)
- [ ] 21.17 **Efectos de texto** predefinidos
- [ ] 21.18 **Animación** de texto: entrada, salida y **bucle** con duración
- [ ] 21.19 **Plantillas de texto** animadas, editables tras insertar
- [ ] 21.20 **Texto a voz** con catálogo de voces por idioma
- [ ] 21.21 Generación de texto/estilo con IA a partir de un prompt
- [ ] 21.22 **Seguimiento (tracking)** de texto sobre un objeto

## 22. Subtítulos

- [ ] 22.1 **Subtítulos automáticos** por idioma
- [ ] 22.2 **Panel de lista** de subtítulos para editar en bloque
- [ ] 22.3 Editar, borrar y añadir líneas
- [ ] 22.4 **Dividir en dos clips** pulsando Enter dentro del texto
- [ ] 22.5 Estilo aplicado a **todos** los subtítulos a la vez
- [ ] 22.6 Importar / exportar **SRT**

## 23. Stickers y seguimiento

- [ ] 23.1 Biblioteca de stickers por categorías
- [ ] 23.2 Stickers generados con **IA** desde prompt (varias variantes)
- [ ] 23.3 Stickers de marca
- [ ] 23.4 Escala, posición, rotación
- [ ] 23.5 Animación de entrada / salida / bucle
- [ ] 23.6 **Seguimiento de objeto**: selección del área a rastrear, iniciar, aplicar; el elemento sigue al objeto

## 24. Keyframes

- [ ] 24.1 Indicador (rombo) en **toda propiedad animable**
- [ ] 24.2 Añadir keyframe en el playhead
- [ ] 24.3 Eliminar keyframe (mismo botón cuando está encima)
- [ ] 24.4 Keyframe automático al cambiar un valor
- [ ] 24.5 Keyframes visibles y arrastrables en la timeline (cambiar timing)
- [ ] 24.6 **Navegar** al keyframe anterior / siguiente
- [ ] 24.7 `Shift` para restringir el movimiento a un eje
- [ ] 24.8 **Panel de curvas de animación** (mostrar/ocultar) con pista por propiedad y por eje (X / Y)
- [ ] 24.9 **Presets de easing** (ease in, ease out, ease in-out…)
- [ ] 24.10 **Curva bézier personalizada** editable con handles
- [ ] 24.11 Keyframes también en efectos, filtros, textos, stickers y audio

## 25. Menú contextual (clic derecho)

- [ ] 25.1 Copiar / Cortar / Pegar
- [ ] 25.2 **Copiar atributos** / **Pegar atributos** con selector de qué pegar (ajuste, básico, efectos, animación, velocidad…)
- [ ] 25.3 Eliminar
- [ ] 25.4 **Dividir escena** (detección automática de tomas)
- [ ] 25.5 **Crear clip combinado** (anidar en una sub-timeline) y entrar con doble clic
- [ ] 25.6 Deshacer clip combinado
- [ ] 25.7 **Agrupar / desagrupar** en la misma timeline
- [ ] 25.8 **Preprocesar** clip (render parcial para fluidez)
- [ ] 25.9 **Desactivar clip** (visible / no visible)
- [ ] 25.10 **Extraer audio** a pista propia
- [ ] 25.11 **Sincronizar video con sonido** (por forma de onda)
- [ ] 25.12 **Reemplazar clip** eligiendo el tramo del nuevo medio y conservando efectos
- [ ] 25.13 Editar efectos
- [ ] 25.14 Aislamiento vocal
- [ ] 25.15 Menú equivalente para clips de audio
- [ ] 25.16 Cada acción muestra su **atajo** en el menú

## 26. Atajos de teclado

- [ ] 26.1 Panel con **lista completa** de atajos
- [ ] 26.2 Atajos visibles en botones y tooltips
- [ ] 26.3 **Personalizar** cualquier atajo
- [ ] 26.4 Detección de **conflictos** con opción de sobrescribir
- [ ] 26.5 **Restablecer predeterminados**
- [ ] 26.6 **Perfiles / esquemas** de atajos (Atajo 1, 2, 3…)

## 27. Portada / miniatura

- [ ] 27.1 Elegir frame del video como portada
- [ ] 27.2 Subir imagen propia como portada
- [ ] 27.3 **Editor de portada** (texto, estilos, elementos)
- [ ] 27.4 Exportar la portada junto al video

## 28. Exportación

- [ ] 28.1 Nombre y carpeta de destino
- [ ] 28.2 **Resolución** (480p – 4K)
- [ ] 28.3 **Tasa de bits** (más baja / recomendada / más alta / personalizada) con **estimación de peso**
- [ ] 28.4 **Códec** (H.264, H.265, ProRes…)
- [ ] 28.5 **Formato** (MP4, MOV…)
- [ ] 28.6 **FPS** de salida
- [ ] 28.7 Exportar **solo audio** (MP3 / WAV / AAC)
- [ ] 28.8 Exportar **GIF** con tamaño y fps
- [ ] 28.9 Exportar solo el **rango I/O** marcado
- [ ] 28.10 Barra de progreso + abrir carpeta al terminar
- [ ] 28.11 Compartir directo a plataformas (opcional)

## 29. Configuración global

- [ ] 29.1 **Duración por defecto** de imágenes al importar
- [ ] 29.2 Duración por defecto de transiciones / textos
- [ ] 29.3 Opciones de **rendimiento** (aceleración por hardware, caché, ubicación de caché)
- [ ] 29.4 **Idioma** de la interfaz
- [ ] 29.5 Carpeta de proyectos y de caché

---

## 30. Decisiones de adaptación (rellenar)

| Función CapCut | Equivalente actual en mi editor | Decisión |
|---|---|---|
| Animación (entrada/salida/combinado) | Paper animation sobre imágenes | Mantener intacta; exponerla como preset dentro de Animación/Efectos |
| | | |
| | | |

## 31. Orden sugerido de implementación

1. **Base imprescindible:** secciones 1–7 (proyecto, layout, medios, timeline, pistas, transiciones)
2. **Edición de clip:** 8, 9, 14, 16, 17, 25
3. **Texto y subtítulos:** 21, 22
4. **Color y efectos:** 18, 19, 20, 11, 12
5. **Avanzado:** 24 (keyframes), 23 (tracking), 10, 13
6. **Salida y calidad de vida:** 27, 28, 26, 29, 15
