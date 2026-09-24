# Recetas en un clic (#21)

> Última pieza del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md): los trucos del vídeo
> montados de una vez con lo que se añadió en #1–#20.

## Cómo se usa

**Materiales → Efectos → Recetas en un clic**. Cada receta dice qué necesita
seleccionado (si falta, el botón se desactiva y lo explica). **Aplicar** la monta entera;
**Ctrl+Z** la deshace de golpe. Todo lo que crea queda editable como cualquier clip.

| Receta | Truco | Necesita | Qué hace |
|---|---|---|---|
| **Etalonaje de cine** | 10 | nada | Capa de ajuste en todo el vídeo (Naranja y turquesa 70 % + Desvaído 25 %) y barras de cine que entran (2,39:1 en horizontal, 16:9 en vertical). |
| **Texto con reflejo** | 7 | un texto | Copia volteada justo debajo, en su propia pista, al 60 % de opacidad, modo **Superponer** y una máscara lineal que la desvanece hacia abajo. |
| **Texto que atraviesas** | 6 | un texto | Quieto hasta el último segundo y luego crece hasta ×60 y se apaga con curva cúbica: la cámara lo atraviesa. |
| **Franjas al ritmo** | 3 | 2–6 vídeos o imágenes | Cada clip en su pista y en una franja horizontal (máscara rollo de película), entrando uno tras otro en los **beats** de la música ([BEATS_MARCADORES.md](BEATS_MARCADORES.md)), deslizándose alternando lados. Sin beats, cada 0,35 s. |
| **Sujeto que se adelanta** | 1 | un vídeo | Copia del clip 6 fotogramas antes de que empiece (sobre el plano anterior), con **Eliminar fondo** en automático — el editor lanza el recorte IA solo —, un destello blanco en el corte y, si están en tu biblioteca, un *whoosh* y un obturador. |

## Cómo está implementado

- `backend/app/recipes.py`: el catálogo (`RECIPES`) y una función por receta, montada
  con las operaciones ya existentes (`add_adjustment_layer`, `add_cinema_bars`,
  máscaras, keyframes, `add_sound_design`…). `timeline_ops.apply_recipe` la envuelve
  en **una** operación de timeline: un solo paso de deshacer, también para el MCP.
- Endpoints: `GET /api/recipes` (el catálogo que muestra el editor) y
  `POST /api/projects/{id}/recipes/{receta}` `{clip_ids, params}`.
- Editor (`EdRecipes.jsx`, `recipeReady.js`, `applyRecipeUI` en `VideoEditor.jsx`): guarda
  la timeline, pide la receta, la recarga y selecciona lo creado; si algún clip nuevo
  pide recorte IA, lo lanza (`startBgAutoFor`).
- El reflejo calcula el alto del bloque de texto con las mismas medidas del export
  (`text_ass._rows`, tamaño de letra e interlineado); las franjas pasan los beats de los
  clips (tiempo de archivo) a tiempo de timeline.

## MCP

`apply_recipe(recipe, clip_ids?, params?)` con `recipe` = `cinema_grade`,
`text_reflection`, `pass_through_text`, `film_strips` o `subject_pop`; `params`:
`zoom_time` (texto que atraviesas) y `frames` (sujeto). Con `subject_pop` el recorte IA
hay que generarlo después en el editor (lo avisa en `warnings`).

## Tests

`backend/tests/test_recipes.py` (cada receta, errores, validez de la timeline y un solo
deshacer en el historial) y `frontend/src/features/editor/recipeReady.test.mjs`.
