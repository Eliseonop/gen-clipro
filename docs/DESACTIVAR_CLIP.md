# Desactivar clip (#10)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). En el truco 10 del vídeo se usa
> para comparar el etalonaje con y sin filtros sin borrar nada.

## Qué hay

- Selecciona uno o varios clips y pulsa **V**: quedan **desactivados**. Otra vez **V**
  los reactiva. También con **clic derecho → Desactivar clip / Activar clip** en la
  timeline.
- Un clip desactivado **sigue en la timeline** (atenuado, rayado y con un ojo tachado)
  y se puede mover, recortar y editar, pero **no se ve, no suena y no se exporta**.
- La **duración del proyecto no cambia**: si el último clip está desactivado, el vídeo
  termina igual (en negro o con lo que haya debajo), como en CapCut.
- Vale para cualquier clip: vídeo, imagen, figura, texto y audio. Con varios
  seleccionados, todos quedan al revés que el clip principal.

## Modelo de datos

```jsonc
// en el clip
{ "disabled": true }     // ausente = activo
```

## Cómo está implementado

- **Preview**: `videosAt` (lib/clipLayout.js) no devuelve clips desactivados; el bucle
  de textos de `render/canvas.js` los salta; `clipPlaybackMuted` los silencia; tampoco
  cuentan para las guías de alineación ni para el clic en el reproductor.
- **Export** (`compose.build_command`): no entran como material (ni imagen ni audio),
  ni en el `.ass` (`text_ass.build_ass`), ni en las capas de texto, ni en el
  rasterizado de figuras. La duración total sigue contando todos los clips.

## MCP

`update_clip(clip_id, {"disabled": true})` / `false`. `describe_capabilities` lista
`clip.disabled` y el resumen del clip incluye `disabled: true`.

## Tests

`backend/tests/test_clip_disabled.py` y `frontend/src/lib/clipDisabled.test.mjs`.
