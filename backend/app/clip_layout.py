"""Encuadre (crop de fuente) y transformación del resultado en el canvas de salida.

Espejo de ``frontend/src/lib/clipLayout.js``. El crop no cambia al escalar
ni mover el resultado.
"""
from __future__ import annotations

from typing import Any, Optional


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _even(n: float) -> int:
    n = int(round(n))
    return n - (n % 2) if n >= 2 else 2


def new_transform() -> dict:
    return {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0}


def is_overlay(clip: Any) -> bool:
    layout = clip.get("layout") if isinstance(clip, dict) else getattr(clip, "layout", None)
    return layout == "overlay"


def source_crop_px(crop_w: float, crop_h: float, cx: float, cy: float,
                   src_w: int, src_h: int) -> tuple[float, float, float, float]:
    sw = crop_w * src_w
    sh = crop_h * src_h
    sx = _clamp((cx - crop_w / 2) * src_w, 0, max(0, src_w - sw))
    sy = _clamp((cy - crop_h / 2) * src_h, 0, max(0, src_h - sh))
    return sx, sy, sw, sh


def dest_rect(transform: Optional[dict], crop_sw: float, crop_sh: float,
              out_w: int, out_h: int) -> tuple[float, float, float, float, float]:
    t = {**new_transform(), **(transform or {})}
    scale = float(t.get("scale") or 1)
    dw = crop_sw * scale
    dh = crop_sh * scale
    dx = float(t.get("x") or 0.5) * out_w - dw / 2
    dy = float(t.get("y") or 0.5) * out_h - dh / 2
    rot = float(t.get("rotation") or 0)
    return dx, dy, dw, dh, rot


def dest_rect_even(transform: Optional[dict], crop_sw: float, crop_sh: float,
                   out_w: int, out_h: int) -> tuple[int, int, int, int, float]:
    dx, dy, dw, dh, rot = dest_rect(transform, crop_sw, crop_sh, out_w, out_h)
    return _even(dx), _even(dy), max(2, _even(dw)), max(2, _even(dh)), rot
