"""Modos de fusión (#8): cómo se mezcla un clip con lo que tiene debajo.

Espejo de ``frontend/src/lib/clipBlend.js``. El preview usa
``globalCompositeOperation`` del canvas (fórmulas W3C de *Compositing and
Blending*); el export, el filtro ``blend`` de FFmpeg con el ORDEN de entradas que
reproduce esas fórmulas (medido: ≤ 2/255 en todos los modos):

- ``overlay``, ``hardlight`` (y los simétricos): arriba el FONDO, abajo el clip.
- ``dodge``, ``burn``: arriba el CLIP (FFmpeg los define al revés que W3C).
- ``softlight`` de FFmpeg usa otra curva (hasta 31/255 de diferencia) → ``lut2``
  con la fórmula W3C (la tabla 256×256 se calcula una vez: 250 fps a 1080p; con
  ``blend=all_expr`` eran 11 fps).

La mezcla con el alfa del clip (cobertura × opacidad) es la de W3C con fondo
opaco: ``fondo + (B(fondo, clip) − fondo) · alfa`` → ``maskedmerge``.
"""
from __future__ import annotations

from typing import Any

BLEND_MODES = (
    "normal", "darken", "multiply", "color_burn", "lighten", "screen", "color_dodge",
    "overlay", "soft_light", "hard_light", "difference", "exclusion",
)

# Luz suave W3C para ``lut2`` (x = fondo, y = clip; 0–255). Comas escapadas para
# el filtergraph.
_SOFT_LIGHT = (
    "255*if(lte(y\\,127.5)\\,x/255-(1-2*y/255)*x/255*(1-x/255)\\,"
    "x/255+(2*y/255-1)*(if(lte(x\\,63.75)\\,((16*x/255-12)*x/255+4)*x/255\\,sqrt(x/255))-x/255))"
)

# modo → (opciones de blend, ¿el clip va arriba?)
_FFMPEG: dict[str, tuple[str, bool]] = {
    "darken": ("all_mode=darken", False),
    "multiply": ("all_mode=multiply", False),
    "color_burn": ("all_mode=burn", True),
    "lighten": ("all_mode=lighten", False),
    "screen": ("all_mode=screen", False),
    "color_dodge": ("all_mode=dodge", True),
    "overlay": ("all_mode=overlay", False),
    "soft_light": ("", False),          # lut2, ver blend_steps
    "hard_light": ("all_mode=hardlight", False),
    "difference": ("all_mode=difference", False),
    "exclusion": ("all_mode=exclusion", False),
}


def normalize_blend(v: Any) -> str:
    return v if v in BLEND_MODES else "normal"


def clip_blend(clip: Any) -> str:
    """Modo de fusión del clip ("normal" si no tiene o no es válido)."""
    v = clip.get("blend_mode") if isinstance(clip, dict) else getattr(clip, "blend_mode", None)
    return normalize_blend(v)


def blend_steps(base: str, layer: str, mode: str, tag: str, out: str,
                start: float, end: float) -> list[str]:
    """Pasos del filtergraph que funden ``layer`` (capa RGBA del tamaño del cuadro,
    con el clip ya colocado) sobre ``base`` con ``mode`` y dejan el resultado en
    ``out`` (gbrp). ``tag`` hace únicas las etiquetas intermedias. Fuera de
    ``[start, end]`` la fusión no se calcula (la capa es transparente)."""
    opts, clip_on_top = _FFMPEG[mode]
    bb, bk, lc, la, lm, lr, bx = (f"{p}{tag}" for p in ("fbb", "fbk", "flc", "fla", "flm", "flr", "fbx"))
    top, bottom = (lr, bk) if clip_on_top else (bk, lr)
    enable = f"enable='between(t,{start:.3f},{end:.3f})'"
    if mode == "soft_light":
        mix = f"lut2=c0='{_SOFT_LIGHT}':c1='{_SOFT_LIGHT}':c2='{_SOFT_LIGHT}':{enable}"
    else:
        mix = f"blend={opts}:{enable}"
    return [
        f"[{base}]format=gbrp,split=2[{bb}][{bk}]",
        f"[{layer}]format=gbrap,split=2[{lc}][{la}]",
        f"[{la}]alphaextract,format=gbrp[{lm}]",
        f"[{lc}]format=gbrp[{lr}]",
        f"[{top}][{bottom}]{mix}[{bx}]",
        f"[{bb}][{bx}][{lm}]maskedmerge[{out}]",
    ]
