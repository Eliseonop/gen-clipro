"""Ajustes de color del clip (Exposición, Blancos, Temperatura, Tono) y máscara de ajuste.

Espejo de ``frontend/src/lib/clipAdjust.js``.

Los cuatro ajustes viven en ``clip.effects`` (junto a brillo/contraste/saturación)
y se reducen a UNA matriz 3×3 sobre RGB en gamma (sRGB), sin términos constantes:

    M = Tono · diag(temperatura) · k        k = exposición · blancos

Preview: ``feColorMatrix`` (con ``color-interpolation-filters="sRGB"``) en el filtro
del canvas. Export: ``colorchannelmixer`` con los MISMOS coeficientes. Los dos
recortan a [0, 1], así que dan el mismo color salvo el redondeo a 8 bits.

Máscara de ajuste (CapCut: Ajustar → Máscara): una máscara con ``target == "adjust"``
limita TODOS los ajustes de color del clip a su interior. Se resuelve expandiendo
el clip en dos pasadas (``expand_adjust_passes``): la base sin ajustes de color y
encima una copia "fantasma" con los ajustes, recortada por esas máscaras. Así se
reutiliza tal cual el pipeline de máscaras (``maskedmerge``) del export.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from .clip_mask import clip_masks, has_adjust_mask

# Rango de cada ajuste (el editor usa los mismos límites).
ADJUST_RANGES = {
    "exposure": (-1.0, 1.0),      # pasos de diafragma: ×2^e
    "whites": (-1.0, 1.0),        # punto blanco (curvas): >0 aclara las luces
    "temperature": (-1.0, 1.0),   # >0 cálido (más rojo, menos azul)
    "hue": (-180.0, 180.0),       # círculo cromático, grados
}
ADJUST_KEYS = tuple(ADJUST_RANGES)
# Todo lo que la máscara de ajuste limita (los ajustes de color del clip).
COLOR_KEYS = ("brightness", "contrast", "saturation", *ADJUST_KEYS)
GHOST_SUFFIX = "__adj"


def _num(v: Any) -> float:
    if v is True:
        return 1.0
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) else 0.0


def _effects(clip_or_effects: Any) -> dict:
    if isinstance(clip_or_effects, dict) and "effects" not in clip_or_effects:
        return clip_or_effects
    raw = (clip_or_effects.get("effects") if isinstance(clip_or_effects, dict)
           else getattr(clip_or_effects, "effects", None))
    return raw if isinstance(raw, dict) else {}


def adjust_value(effects: dict, key: str) -> float:
    lo, hi = ADJUST_RANGES[key]
    return min(hi, max(lo, _num(effects.get(key))))


def _gain(exposure: float, whites: float) -> float:
    k = 2.0 ** exposure
    return k / (1.0 - 0.6 * whites) if whites > 0 else k * (1.0 + 0.4 * whites)


def _hue_matrix(deg: float) -> list[list[float]]:
    """Rotación de tono de la especificación de filtros CSS/SVG (``hueRotate``)."""
    a = math.cos(math.radians(deg))
    b = math.sin(math.radians(deg))
    return [
        [0.213 + 0.787 * a - 0.213 * b, 0.715 - 0.715 * a - 0.715 * b, 0.072 - 0.072 * a + 0.928 * b],
        [0.213 - 0.213 * a + 0.143 * b, 0.715 + 0.285 * a + 0.140 * b, 0.072 - 0.072 * a - 0.283 * b],
        [0.213 - 0.213 * a - 0.787 * b, 0.715 - 0.715 * a + 0.715 * b, 0.072 + 0.928 * a + 0.072 * b],
    ]


def color_matrix(clip_or_effects: Any) -> Optional[list[list[float]]]:
    """Matriz 3×3 de los ajustes, o ``None`` si no hay ninguno activo."""
    e = _effects(clip_or_effects)
    ex, wh, te, hu = (adjust_value(e, k) for k in ADJUST_KEYS)
    if not (ex or wh or te or hu):
        return None
    k = _gain(ex, wh)
    diag = (k * (1.0 + 0.18 * te), k, k * (1.0 - 0.18 * te))
    h = _hue_matrix(hu)
    return [[h[r][c] * diag[c] for c in range(3)] for r in range(3)]


def colorchannelmixer(clip_or_effects: Any) -> str:
    """Filtro FFmpeg equivalente al ``feColorMatrix`` del preview ('' si no hay ajustes)."""
    m = color_matrix(clip_or_effects)
    if m is None:
        return ""
    names = (("rr", "rg", "rb"), ("gr", "gg", "gb"), ("br", "bg", "bb"))
    return "colorchannelmixer=" + ":".join(
        f"{names[r][c]}={m[r][c]:.5f}" for r in range(3) for c in range(3))


def has_color_adjust(clip_or_effects: Any) -> bool:
    e = _effects(clip_or_effects)
    return any(_num(e.get(k)) for k in COLOR_KEYS)


def strip_color(effects: Optional[dict]) -> dict:
    return {k: v for k, v in (effects or {}).items() if k not in COLOR_KEYS}


def adjust_passes(clip: Any) -> list[tuple[Any, bool]]:
    """Pasadas de dibujo de un clip: [(clip, es_fantasma)].

    Con máscara de ajuste y algún ajuste de color: base sin ajustes + fantasma con
    ajustes cuyas máscaras de ajuste pasan a recortar (se intersecan con las del
    clip). Sin eso, el clip tal cual (sus máscaras de ajuste se ignoran al dibujar).
    """
    if getattr(clip, "kind", None) not in ("video", "image", "shape"):
        return [(clip, False)]
    if not has_adjust_mask(clip) or not has_color_adjust(clip):
        return [(clip, False)]
    base = clip.model_copy(deep=True)
    base.effects = strip_color(clip.effects)
    ghost = clip.model_copy(deep=True)
    ghost.id = f"{clip.id}{GHOST_SUFFIX}"
    ghost.masks = [{**m, "target": "clip"} for m in clip_masks(clip)]
    ghost.muted = True
    ghost.volume = 0.0
    return [(base, False), (ghost, True)]


def expand_adjust_passes(timeline: Any) -> Any:
    """Copia de la timeline con cada clip expandido en sus pasadas (fantasma justo
    detrás de su base, así queda encima en el orden de capas). Sin máscaras de
    ajuste devuelve la MISMA timeline."""
    clips = list(getattr(timeline, "clips", None) or [])
    if not any(has_adjust_mask(c) for c in clips):
        return timeline
    out: list = []
    for c in clips:
        out.extend(p for p, _ghost in adjust_passes(c))
    tl = timeline.model_copy(deep=False)
    tl.clips = out
    return tl
