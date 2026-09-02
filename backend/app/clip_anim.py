"""Animación de clip (posición / escala / rotación / opacidad).

Espejo de ``frontend/src/lib/clipAnim.js``. ``t`` es tiempo local del clip.
"""
from __future__ import annotations

from typing import Any, Optional

from .clip_keyframes import clip_props_at, keyframes_enabled, static_props


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n:  # NaN
        return default
    return n


def normalize_track(kfs: Optional[list]) -> list[dict]:
    out = []
    for k in kfs or []:
        if not isinstance(k, dict):
            continue
        t = _num(k.get("t"), float("nan"))
        v = _num(k.get("v"), float("nan"))
        if t != t or v != v:
            continue
        out.append({"t": t, "v": v, "ease": "direct" if k.get("ease") == "direct" else "smooth"})
    out.sort(key=lambda k: k["t"])
    return out


def interp_track(kfs: Optional[list], t: float, fallback: float) -> float:
    s = normalize_track(kfs)
    fb = _num(fallback, 0.0)
    if not s:
        return fb
    time = _num(t, 0.0)
    if time <= s[0]["t"]:
        return s[0]["v"]
    last = s[-1]
    if time >= last["t"]:
        return last["v"]
    for i in range(len(s) - 1):
        a, b = s[i], s[i + 1]
        if a["t"] <= time <= b["t"]:
            if b["ease"] == "direct":
                return a["v"]
            span = (b["t"] - a["t"]) or 1.0
            f = (time - a["t"]) / span
            return a["v"] + (b["v"] - a["v"]) * f
    return last["v"]


def static_pose(clip: Any) -> dict:
    p = static_props(clip)
    return {k: p[k] for k in ("x", "y", "scale", "rotation", "opacity")}


def clip_pose(clip: Any, local_t: float) -> dict:
    if keyframes_enabled(clip):
        p = clip_props_at(clip, local_t)
        return {k: p[k] for k in ("x", "y", "scale", "rotation", "opacity")}
    base = static_pose(clip)
    anim = (clip.get("anim") if isinstance(clip, dict) else getattr(clip, "anim", None)) or {}
    if not isinstance(anim, dict):
        anim = {}
    return {
        "x": interp_track(anim.get("x"), local_t, base["x"]),
        "y": interp_track(anim.get("y"), local_t, base["y"]),
        "scale": interp_track(anim.get("scale"), local_t, base["scale"]),
        "rotation": interp_track(anim.get("rotation"), local_t, base["rotation"]),
        "opacity": interp_track(anim.get("opacity"), local_t, base["opacity"]),
    }
