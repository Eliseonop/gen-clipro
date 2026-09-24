# Trucos de CapCut → funcionalidades del editor

> Referencia: vídeo *«10 CapCut Tricks That Look Hard And Aren't»* (Matt Loui,
> <https://www.youtube.com/watch?v=chjI9UVl6p8>). Analizado el 2026-09-24 con la
> transcripción completa y cruzado con el código. Se implementan **en orden**.

## Estado de las funcionalidades

| # | Funcionalidad | Trucos | Estado | Detalle |
|---|---|---|---|---|
| 1 | Exportar la animación del texto | 5, 6 | ✅ Hecho | [TEXTO_ANIMADO.md](TEXTO_ANIMADO.md) |
| 2 | Curvas de animación (cúbicas + bézier por keyframe) | 5, 6 | ✅ Hecho | [CURVAS_ANIMACION.md](CURVAS_ANIMACION.md) |
| 3 | Sombra de texto completa | 2 | ✅ Hecho | [TEXTO_ESTILO.md](TEXTO_ESTILO.md#sombra-paralela-3) |
| 4 | Texto 3D (inclinar / girar en X-Y + perspectiva) | 2 | ✅ Hecho | [TEXTO_ESTILO.md](TEXTO_ESTILO.md#texto-3d-4) |
| 5 | Escala extrema (hasta 10 000 %) | 6 | ✅ Hecho | [TEXTO_ESTILO.md](TEXTO_ESTILO.md#escala-extrema-y-uniforme-5) |
| 6 | Espaciado entre letras e interlineado | 2–7 | ✅ Hecho | [TEXTO_ESTILO.md](TEXTO_ESTILO.md#espaciado-entre-letras-e-interlineado-6) |
| 7 | Voltear horizontal / vertical | 7 | ✅ Hecho | [VOLTEAR.md](VOLTEAR.md) |
| 8 | Modos de fusión | 7, 2 | ✅ Hecho | [MODOS_FUSION.md](MODOS_FUSION.md) |
| 9 | Contorno / halo del sujeto recortado | 1 | ✅ Hecho | [CONTORNO_SUJETO.md](CONTORNO_SUJETO.md) |
| 10 | Desactivar clip (V) | 10 | ✅ Hecho | [DESACTIVAR_CLIP.md](DESACTIVAR_CLIP.md) |
| 11 | Congelar fotograma | 2 | ✅ Hecho | [CONGELAR_FOTOGRAMA.md](CONGELAR_FOTOGRAMA.md) |
| 12 | Beats automáticos + marcadores | 3 | ✅ Hecho | [BEATS_MARCADORES.md](BEATS_MARCADORES.md) |
| 13 | Pegar atributos a varios clips, eligiendo qué | 3 | ✅ Hecho | [PEGAR_ATRIBUTOS.md](PEGAR_ATRIBUTOS.md) |
| 14 | Trazado con pluma + punteado + "dibujar trazo" | 4 | ✅ Hecho | [TRAZADO_PLUMA.md](TRAZADO_PLUMA.md) |
| 15 | Seguimiento de objetos (tracking) | 5 | ✅ Hecho | [SEGUIMIENTO_OBJETOS.md](SEGUIMIENTO_OBJETOS.md) |
| 16 | Filtros de sonido (bajo el agua…) con intensidad animable | 9 | ✅ Hecho | [FILTROS_SONIDO.md](FILTROS_SONIDO.md) |
| 17 | Sonorizar escena con IA | 8 | ✅ Hecho | [SONORIZAR_IA.md](SONORIZAR_IA.md) |
| 18 | Filtros con intensidad, apilables + looks nuevos | 10 | ✅ Hecho (sin LUT) | [FILTROS_COLOR.md](FILTROS_COLOR.md) |
| 19 | Capa de ajuste | 10 | ✅ Hecho | [CAPA_AJUSTE.md](CAPA_AJUSTE.md) |
| 20 | Barras de cine en un clic | 10 | ✅ Hecho | [BARRAS_CINE.md](BARRAS_CINE.md) |
| 21 | Recetas en un clic (botón + MCP) | 1, 3, 6, 7, 10 | ✅ Hecho | [RECETAS.md](RECETAS.md) |

Pendiente fuera del plan: LUT `.cube` en los filtros (#18), que necesitaría un pase de
WebGL por clip para que la vista previa coincida con el export.

Descartados: clip combinado (sus usos se cubren aplicando 4/7/8/14 directamente
al texto o la figura), timeline 8K (solo es el apaño de calidad de CapCut) y el
atajo W (ya descartado en [checklist-editor-capcut.md](checklist-editor-capcut.md)).

## Los 10 trucos

| # | Truco | Piezas |
|---|---|---|
| 1 | **Sujeto recortado**: la persona aparece recortada sobre la toma anterior unos fotogramas antes que su fondo, con riser, obturador y destello blanco. | Receta *Sujeto que se adelanta* (**21**) con **9** y SFX — ya se puede |
| 2 | **Texto 3D con sombra**, "tumbado" sobre el paisaje. | **3** ✅, **4** ✅ (+ **8** para nubes) — ya se puede |
| 3 | **Ubicaciones en franjas**: vídeos con máscara «rollo de película» al ritmo. | Receta *Franjas al ritmo* (**21**) con **12** y **13** — ya se puede |
| 4 | **Ruta de ubicaciones**: línea curva punteada que se dibuja. | **14** ✅ — ya se puede |
| 5 | **Texto que acompaña el zoom** de la cámara. | **1** ✅, **2** ✅ o seguimiento **15** ✅ — ya se puede |
| 6 | **Texto que atraviesas** (escala 6000 %). | Receta *Texto que atraviesas* (**21**) — ya se puede |
| 7 | **Texto con reflejo**: copia volteada + máscara + Superponer. | Receta *Texto con reflejo* (**21**) con **7** y **8** — ya se puede |
| 8 | **Diseño sonoro**: viento, helicóptero, águila. | *Sonorizar con IA* (**17**) — ya se puede |
| 9 | **Música bajo el agua** con intensidad animada. | **16** ✅ — ya se puede |
| 10 | **Etalonaje de cine**: barras + filtros apilados con intensidad. | Receta *Etalonaje de cine* (**21**) con **18**, **19** y **20** — ya se puede |
