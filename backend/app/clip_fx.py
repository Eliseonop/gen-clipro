"""Efectos de clip (aparición, salida, filtro visual).

Espejo de ``frontend/src/lib/clipFx.js``. ``local_t`` es el tiempo desde el
inicio del clip en la timeline (0 = primer fotograma). ``tx``/``ty`` son
fracción del destino (+x derecha, +y abajo).
"""
from __future__ import annotations

from typing import Any

FX_DUR = 0.4
ZOOM_FROM = 1.18
POP_FROM = 0.72

_LOOK_FFMPEG = {
    "none": "",
    "bw": "hue=s=0",
    "cinematic": "eq=contrast=1.15:saturation=0.85:brightness=-0.08",
    "vintage": "eq=contrast=1.1:saturation=0.75:gamma=0.92",
    "contrast": "eq=contrast=1.35:saturation=1.1",
    "warm": "eq=saturation=1.15:gamma_r=1.08:gamma_b=0.92",
    "cool": "eq=saturation=0.9:brightness=0.04:gamma_b=1.1:gamma_r=0.94",
    "saturated": "eq=saturation=1.55:contrast=1.08",
}


def _field(clip: Any, key: str, default: str = "none") -> str:
    if isinstance(clip, dict):
        val = clip.get(key)
    else:
        val = getattr(clip, key, None)
    return val or default


def _clamp01(v: float) -> float:
    return min(1.0, max(0.0, v))


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def fx_windows(duration: float) -> tuple[float, float]:
    d = min(FX_DUR, max(0.0, duration) / 2.0)
    return d, d


def clip_fx_at(clip: Any, local_t: float, duration: float) -> dict:
    appear = _field(clip, "appear")
    exit_ = _field(clip, "exit")
    ad, ed = fx_windows(duration)
    ap = _clamp01(local_t / ad) if ad > 0 else 1.0
    ep = _clamp01((duration - local_t) / ed) if ed > 0 else 1.0

    opacity = 1.0
    scale = 1.0
    tx = 0.0
    ty = 0.0

    if appear in ("fade", "pop"):
        opacity *= ap
    if exit_ in ("fade", "pop"):
        opacity *= ep

    if appear == "zoom":
        scale *= _lerp(ZOOM_FROM, 1.0, ap)
    if exit_ == "zoom":
        scale *= _lerp(1.0, ZOOM_FROM, 1.0 - ep)
    if appear == "pop":
        scale *= _lerp(POP_FROM, 1.0, ap)
    if exit_ == "pop":
        scale *= _lerp(1.0, POP_FROM, 1.0 - ep)

    if appear == "slide_left":
        tx += _lerp(1.0, 0.0, ap)
    if appear == "slide_up":
        ty += _lerp(1.0, 0.0, ap)
    if exit_ == "slide_right":
        tx += _lerp(0.0, 1.0, 1.0 - ep)
    if exit_ == "slide_down":
        ty += _lerp(0.0, 1.0, 1.0 - ep)

    return {"opacity": opacity, "scale": scale, "tx": tx, "ty": ty, "look": _field(clip, "look")}


def look_ffmpeg(look: str | None) -> str:
    return _LOOK_FFMPEG.get(look or "none", "")


def _split_xy(base_xy: str) -> tuple[str, str]:
    parts: dict[str, str] = {}
    for piece in (base_xy or "").split(":"):
        if "=" in piece:
            k, v = piece.split("=", 1)
            parts[k] = v
    return parts.get("x", "0"), parts.get("y", "0")


def _slide_offset_expr(kind: str, start: float, window: float, axis_size: int) -> str:
    """Desplazamiento en píxeles según el progreso de aparición/salida (tiempo de composición ``t``)."""
    t0 = f"(t-{start:.3f})"
    p = f"min(1\\,max(0\\,{t0}/{window:.3f}))"
    if kind == "appear":
        return f"{axis_size}*(1-{p})"
    return f"{axis_size}*{p}"


def overlay_xy_for_fx(base_xy: str, clip: Any, start: float, dur: float, W: int, H: int) -> str:
    appear = _field(clip, "appear")
    exit_ = _field(clip, "exit")
    ad, ed = fx_windows(dur)
    x, y = _split_xy(base_xy)
    x_bits: list[str] = []
    y_bits: list[str] = []
    if appear == "slide_left" and ad > 0:
        x_bits.append(_slide_offset_expr("appear", start, ad, W))
    if appear == "slide_up" and ad > 0:
        y_bits.append(_slide_offset_expr("appear", start, ad, H))
    if exit_ == "slide_right" and ed > 0:
        x_bits.append(_slide_offset_expr("exit", start + dur - ed, ed, W))
    if exit_ == "slide_down" and ed > 0:
        y_bits.append(_slide_offset_expr("exit", start + dur - ed, ed, H))
    if not x_bits and not y_bits:
        return base_xy
    x_off = "+".join(x_bits) if x_bits else "0"
    y_off = "+".join(y_bits) if y_bits else "0"
    return f"x='({x})+({x_off})':y='({y})+({y_off})'"


def _scale_expr(clip: Any, dur: float, ad: float, ed: float) -> str | None:
    appear = _field(clip, "appear")
    exit_ = _field(clip, "exit")
    terms = ["1"]
    if appear == "zoom" and ad > 0:
        terms.append(f"(1.18-0.18*min(1\\,max(0\\,t/{ad:.3f})))")
    if appear == "pop" and ad > 0:
        terms.append(f"(0.72+0.28*min(1\\,max(0\\,t/{ad:.3f})))")
    if exit_ == "zoom" and ed > 0:
        terms.append(f"(1+0.18*min(1\\,max(0\\,(t-{dur - ed:.3f})/{ed:.3f})))")
    if exit_ == "pop" and ed > 0:
        terms.append(f"(1-0.28*min(1\\,max(0\\,(t-{dur - ed:.3f})/{ed:.3f})))")
    if len(terms) == 1:
        return None
    return "*".join(terms)


def video_fx_chain(clip: Any, dur: float, W: int, H: int) -> str:
    parts: list[str] = []
    look = look_ffmpeg(_field(clip, "look"))
    if look:
        parts.append(look)

    appear = _field(clip, "appear")
    exit_ = _field(clip, "exit")
    ad, ed = fx_windows(dur)
    need_alpha = appear in ("fade", "pop") or exit_ in ("fade", "pop")
    scale_expr = _scale_expr(clip, dur, ad, ed)

    if need_alpha:
        parts.append("format=gbrap")
        if appear in ("fade", "pop") and ad > 0:
            parts.append(f"fade=t=in:st=0:d={ad:.3f}:alpha=1")
        if exit_ in ("fade", "pop") and ed > 0:
            parts.append(f"fade=t=out:st={max(0.0, dur - ed):.3f}:d={ed:.3f}:alpha=1")

    if scale_expr:
        parts.append(
            f"scale='iw*({scale_expr})':'ih*({scale_expr})',"
            f"crop='min({W}\\,iw)':'min({H}\\,ih)':'(in_w-out_w)/2':'(in_h-out_h)/2',"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black@0"
        )

    return ",".join(parts)
