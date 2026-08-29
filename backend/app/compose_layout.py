"""Geometría de huecos para componer 2 capas en 720x1280."""
from __future__ import annotations

from typing import Optional

from . import config

SlotRect = tuple[int, int, int, int]  # x, y, w, h en píxeles pares


def _even(n: int) -> int:
    n = int(round(n))
    return n - (n % 2)


def slot_norm(slot: str, index: int = 0, custom: Optional[dict] = None) -> dict:
    if slot == "custom" and custom:
        return {
            "x": float(custom.get("x", 0)),
            "y": float(custom.get("y", 0)),
            "w": float(custom.get("w", 1)),
            "h": float(custom.get("h", 1)),
        }
    if slot == "top":
        return {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.5}
    if slot == "bottom":
        return {"x": 0.0, "y": 0.5, "w": 1.0, "h": 0.5}
    if slot == "left":
        return {"x": 0.0, "y": 0.0, "w": 0.5, "h": 1.0}
    if slot == "right":
        return {"x": 0.5, "y": 0.0, "w": 0.5, "h": 1.0}
    if slot == "overlay":
        if index == 0:
            return {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
        return {"x": 0.52, "y": 0.58, "w": 0.44, "h": 0.38}
    return {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}


def slot_pixels(slot: str, index: int = 0, custom: Optional[dict] = None,
                width: int | None = None, height: int | None = None) -> SlotRect:
    W = width or config.OUTPUT_WIDTH
    H = height or config.OUTPUT_HEIGHT
    r = slot_norm(slot, index, custom)
    x = _even(r["x"] * W)
    y = _even(r["y"] * H)
    w = max(2, _even(r["w"] * W))
    h = max(2, _even(r["h"] * H))
    if x + w > W:
        w = _even(W - x) or 2
    if y + h > H:
        h = _even(H - y) or 2
    return x, y, w, h
