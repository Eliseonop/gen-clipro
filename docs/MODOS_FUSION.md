# Modos de fusión (#8)

> Parte del plan [TRUCOS_CAPCUT.md](TRUCOS_CAPCUT.md). Con [VOLTEAR.md](VOLTEAR.md) (#7)
> completa el truco *«texto con reflejo»*; también sirve para las nubes sobre el texto
> 3D (truco 2), overlays de luces, polvo, grano…

## Qué hay

Cada clip visual —**vídeo, imagen, figura o texto**— tiene un **Modo de fusión**: cómo
se mezclan sus colores con lo que tiene debajo.

- Vídeo, imagen y figura: **Video → Básico → Mezcla**, debajo de *Opacidad*.
- Texto: **Animación → Mezcla**.
- Con varios clips seleccionados se aplica a todos. **Copiar / pegar atributos** lo
  incluye.

| Modo | Para qué |
|---|---|
| Normal | Sin fusión (por defecto). |
| Oscurecer | Se queda el más oscuro de los dos. |
| Multiplicar | Oscurece; el **blanco desaparece** (sombras, texturas de papel). |
| Subexponer color | Oscurece con más contraste. |
| Aclarar | Se queda el más claro. |
| Trama | Aclara; el **negro desaparece** (fuego, luces, destellos con fondo negro). |
| Sobreexponer color | Aclara con brillo intenso. |
| Superponer | Contraste: el clip "tiñe" lo de debajo (reflejos, texturas). |
| Luz suave | Superponer más suave. |
| Luz fuerte | Superponer desde el clip. |
| Diferencia | Resta los colores (efectos psicodélicos, comparar tomas). |
| Exclusión | Diferencia más suave. |

La **opacidad** del clip se aplica encima: un clip en *Multiplicar* al 50 % queda a
medio camino entre el fondo y el fondo multiplicado.

### Reflejo de un título (truco 7)

Duplica el texto → **Voltear vertical** → bájalo bajo el original → **Modo de fusión:
Superponer** (toma los colores del agua o del suelo) → máscara lineal con pluma para
que se desvanezca.

## Modelo de datos

```jsonc
// en el clip
{ "blend_mode": "screen" }   // ausente = normal
```

## Cómo está implementado (preview = export)

- **Modos**: `frontend/src/lib/clipBlend.js` ↔ `backend/app/clip_blend.py` (mismos ids).
- **Preview**: el clip se pinta en una **capa aparte** (la misma de las máscaras) y la
  capa se compone con `globalCompositeOperation` (fórmulas W3C *Compositing and
  Blending*). Así una figura (relleno + borde) o un texto (sombra + borde + letras) se
  funden **enteros**, no pieza a pieza.
- **Export**: el clip se coloca en una capa transparente del tamaño del cuadro y
  `clip_blend.blend_steps` la funde con lo de debajo:
  `blend` (fórmula) → `maskedmerge` con el alfa de la capa (cobertura × opacidad) =
  `fondo + (B(fondo, clip) − fondo) · alfa`, la misma mezcla que hace el canvas.
  Textos con modo de fusión van en **capa propia** (como los de máscara o 3D).
- **Diferencias medidas entre FFmpeg y W3C** (y cómo se resuelven):
  - `overlay` / `hardlight`: la condición va sobre la entrada de ARRIBA → arriba el fondo.
  - `dodge` / `burn`: FFmpeg los define al revés → arriba el clip.
  - `softlight` de FFmpeg usa otra curva (hasta 31/255 de diferencia) → `lut2` con la
    fórmula W3C (tabla 256×256 calculada una vez: 250 fps a 1080p; con
    `blend=all_expr` iba a 11 fps).
- Medido con render real (imagen sobre degradado, pasando por YUV 4:2:0):
  multiplicar al 60 %, trama, superponer, luz suave, subexponer y sobreexponer al 80 %
  → error mediano ≤ 1,1/255 (máx. 6,4); nada cambia fuera del clip. Texto en
  *Superponer*: mediana 2/255.

## Arreglado de paso: la opacidad fija no se exportaba

Un vídeo o imagen con **Opacidad** < 100 % **sin keyframes** salía **opaco** en el
vídeo exportado (solo se exportaba la opacidad animada). También afectaba a
`update_clip(opacity)` del MCP. Ahora se aplica siempre (medido: alfa 0,60 exacto). Las
figuras ya la llevaban horneada en su imagen.

## Límites

- Sin *Subexposición lineal* ni los modos de color (tono, saturación, color,
  luminosidad): el canvas no tiene el primero y los segundos no tienen filtro exacto en
  FFmpeg.
- Un clip con **máscara de ajuste** se pinta en dos pasadas y cada una se funde por su
  cuenta (igual en preview y export).
- El fondo de vista previa *cuadros / color / imagen* (solo preview) también participa
  en la fusión; el export funde sobre negro.

## MCP

`update_clip(clip_id, {"blend_mode": "screen"})` (`"normal"` lo quita).
`describe_capabilities` lista `clip.blend:…` y el resumen del clip incluye `blend_mode`.

## Tests

`backend/tests/test_clip_blend.py` y `frontend/src/lib/clipBlend.test.mjs`.
