# Pegar atributos eligiendo qué (#13)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Es lo que agiliza el truco
> *«ubicaciones en franjas»*: se prepara un vídeo (máscara rollo de película,
> posición, animación) y se pega ese aspecto en todos los demás de una vez.

## Cómo se usa

1. Clic derecho en un clip → **Copiar atributos** (o selecciónalo y **Ctrl+Alt+C**).
2. Selecciona uno o varios clips (Ctrl/Shift + clic, o recuadro) → clic derecho →
   **Pegar atributos…** (o **Ctrl+Alt+V**).
3. En el diálogo marca qué se pega y pulsa **Pegar** (Enter). *Todo* / *Nada* marcan o
   desmarcan la lista. Los grupos que desmarques se recuerdan para la próxima vez.

Solo se pega el aspecto: el contenido (archivo, texto), la pista, el inicio y la
duración de cada clip no cambian. Todo entra en **un solo deshacer**.

## Grupos

| Grupo | Qué copia | Clips |
|---|---|---|
| Posición, escala y giro | x, y, escala, giro (y giro 3D / perspectiva entre textos) | vídeo, imagen, figura, texto |
| Voltear | voltear horizontal / vertical | los cuatro |
| Opacidad y modo de fusión | opacidad fija + modo de fusión | los cuatro |
| Animación (keyframes) | keyframes de posición, escala, giro, opacidad y trazo dibujado | los cuatro |
| Entrada y salida | animación de aparición y de salida | vídeo, imagen, texto |
| Recorte y encuadre | recorte, zoom y paneo | vídeo, imagen |
| Filtro, efectos y ajustes | filtro (*look*), desenfoque, color… | vídeo, imagen |
| Máscara | máscaras y sus keyframes | los cuatro |
| Croma y contorno | croma y contorno de Eliminar fondo | vídeo, imagen |
| Estilo | texto → texto: fuente, color, borde, sombra, espaciado…; figura → figura: relleno, color y estilo del trazo (punteado), grosor, esquinas | mismo tipo |
| Velocidad | velocidad, mantener tono, invertir | vídeo, audio |
| Volumen y efectos de audio | volumen, silencio, efectos de audio y sus keyframes | vídeo, audio |

- El diálogo solo ofrece los grupos que valen para algún clip seleccionado; si un
  grupo no vale para todos, lo indica («2 de 3»). Entre tipos distintos se pega lo
  que tenga sentido: la posición de un vídeo se puede pegar en un texto.
- **Nunca se pegan**: el recorte IA de Eliminar fondo (es del archivo de cada clip),
  los beats (son del audio de cada archivo) ni el tamaño o tipo de una figura.
- Al pegar la velocidad en un audio con subtítulos enlazados, los subtítulos se
  reajustan igual que al cambiarla en el inspector.

## Keyframes: qué pasa con la animación

Cada keyframe guarda **todas** las propiedades del clip en ese instante (posición,
volumen, máscara…). Copiarlos tal cual pisaría el volumen o la posición del destino,
así que se reparten por grupo:

- *Animación* → x, y, escala, giro, opacidad (y giro 3D y trazo dibujado); *Recorte* → cx, cy, zoom;
  *Máscara* → las propiedades de la máscara; *Volumen* → volumen y efectos de audio.
- Del clip de origen solo viaja lo que **de verdad anima**: una propiedad que vale lo
  mismo que su valor fijo en todos los keyframes no se copia. Pegar un zoom animado
  mueve la escala del destino, no lo lleva a la posición del origen.
- Lo que el grupo pegado **sustituye**: si el origen no anima nada, el destino deja
  de animar ese grupo (su fundido de volumen, por ejemplo, se queda).
- Si el destino anima otro grupo (un fundido de volumen) en instantes distintos, se
  crean keyframes en la unión de instantes: exactos en cada keyframe; entre medias la
  curva puede variar un poco.
- Pegar solo la *posición* en un clip animado quita de sus keyframes la posición
  que solo repetía el valor fijo, para que la posición pegada se vea.

## Cómo está implementado

- `frontend/src/lib/clipAttrs.js` (espejo `backend/app/clip_attrs.py`): `ATTR_GROUPS`,
  `groupApplies`, `pasteableGroups`, `pasteClipAttrs(target, source, groups)` y
  `mergeKeyframes`. El portapapeles es una copia profunda del clip de origen.
- `frontend/src/features/editor/EdPasteAttrs.jsx`: el diálogo; en `VideoEditor.jsx`,
  `copyAttrs` / `openPasteAttrs` / `applyPasteAttrs` y los atajos Ctrl+Alt+C/V.
- Sustituye a *Copiar / Pegar propiedades* (`pickClipVisualProps` /
  `applyClipVisualProps`), que pegaba todo sin preguntar y solo en vídeo/imagen.

## MCP

`paste_clip_attributes(source_clip_id, target_clip_ids, groups?)`: `groups` es una
lista de `transform, flip, blend, animation, transitions, crop, effects, mask, chroma,
style, speed, audio` (sin ella, todos los que apliquen). Los clips que no admiten un
grupo pedido salen en `warnings`.

## Tests

`backend/tests/test_clip_attrs.py` y `frontend/src/lib/clipAttrs.test.mjs` (mismos
casos en los dos lados).
