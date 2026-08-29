"""Layout de receta (1–2 pistas): orientación auto y letterbox Entero."""
from __future__ import annotations

from typing import Any


def _field(obj: Any, name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def is_master_reframe(reframe: Any) -> bool:
    return bool(_field(reframe, "master", False) is True)


def uses_source_trim(reframe: Any) -> bool:
    """True: el archivo de biblioteca es el tramo fuente; no hay que hornear 9:16."""
    return is_master_reframe(reframe)


def split_orientation_for(out_aspect: float, reframe: Any = None) -> str:
    layout = _field(reframe, "split_layout")
    if layout in ("vertical", "horizontal"):
        return layout
    orient = _field(reframe, "split_orientation")
    if layout != "auto" and orient in ("vertical", "horizontal"):
        return orient
    return "vertical" if out_aspect < 1 else "horizontal"


def synced_dual_slots(out_aspect: float, reframe: Any = None) -> list[str]:
    if split_orientation_for(out_aspect, reframe) == "vertical":
        return ["top", "bottom"]
    return ["left", "right"]


def contain_dest(slot_w: float, slot_h: float, src_w: float, src_h: float) -> dict:
    scale = min(slot_w / max(1.0, src_w), slot_h / max(1.0, src_h))
    dw = src_w * scale
    dh = src_h * scale
    return {
        "dx": (slot_w - dw) / 2,
        "dy": (slot_h - dh) / 2,
        "dw": dw,
        "dh": dh,
    }
