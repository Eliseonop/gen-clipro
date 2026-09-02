"""Keyframes genéricos: snapshots de propiedades + interpolación.

Espejo de ``frontend/src/lib/clipKeyframes.js``. ``t`` es tiempo local del clip.
"""
from __future__ import annotations

from typing import Any, Optional

KF_SNAP = 0.06
KF_PROP_KEYS = ("x", "y", "scale", "rotation", "opacity", "cx", "cy", "zoom")


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n:
        return default
    return n


def normalize_interp(v: Any) -> str:
    if v in ("ease-in", "ease-out", "ease-in-out", "hold"):
        return v
    if v in ("direct", "step"):
        return "hold"
    return "linear"


def ease_t(u: float, kind: str) -> float:
    t = min(1.0, max(0.0, _num(u, 0.0)))
    k = normalize_interp(kind)
    if k == "hold":
        return 0.0
    if k == "ease-in":
        return t * t
    if k == "ease-out":
        return 1.0 - (1.0 - t) * (1.0 - t)
    if k == "ease-in-out":
        return 2 * t * t if t < 0.5 else 1.0 - 2 * (1.0 - t) * (1.0 - t)
    return t


def keyframes_enabled(clip: Any) -> bool:
    kf = clip.get("keyframes") if isinstance(clip, dict) else getattr(clip, "keyframes", None)
    return bool(kf and kf.get("enabled")) if isinstance(kf, dict) else False


def _items(clip: Any) -> list:
    kf = clip.get("keyframes") if isinstance(clip, dict) else getattr(clip, "keyframes", None)
    if not isinstance(kf, dict):
        return []
    return kf.get("items") or []


def static_props(clip: Any) -> dict:
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    get = (lambda o, k: o.get(k) if isinstance(o, dict) else getattr(o, k, None))
    if kind == "shape":
        st = get(clip, "shape") or {}
        if not isinstance(st, dict):
            st = {}
        return {
            "x": _num(st.get("x"), 0.5), "y": _num(st.get("y"), 0.5),
            "scale": _num(st.get("scale"), 1.0), "rotation": _num(st.get("rotation"), 0.0),
            "opacity": _num(st.get("opacity"), 1.0),
            "cx": 0.5, "cy": 0.5, "zoom": 1.0,
        }
    if kind == "text":
        st = get(clip, "style") or {}
        if not isinstance(st, dict):
            st = {}
        return {
            "x": _num(st.get("x"), 0.5), "y": _num(st.get("y"), 0.5),
            "scale": _num(st.get("scale"), 1.0), "rotation": _num(st.get("rotation"), 0.0),
            "opacity": _num(st.get("opacity"), 1.0),
            "cx": 0.5, "cy": 0.5, "zoom": 1.0,
        }
    tr = get(clip, "transform") or {}
    if not isinstance(tr, dict):
        tr = {}
    rf = get(clip, "reframe") or {}
    zoom = rf.get("zoom") if isinstance(rf, dict) else getattr(rf, "zoom", 1.0)
    return {
        "x": _num(tr.get("x"), 0.5), "y": _num(tr.get("y"), 0.5),
        "scale": _num(tr.get("scale"), 1.0),
        "rotation": _num(tr.get("rotation"), 0.0),
        "opacity": 1.0 if get(clip, "opacity") is None else _num(get(clip, "opacity"), 1.0),
        "cx": 0.5, "cy": 0.5, "zoom": _num(zoom, 1.0),
    }


def _merge(base: dict, extra: Optional[dict]) -> dict:
    out = dict(base)
    for key in KF_PROP_KEYS:
        if extra and extra.get(key) is not None:
            out[key] = _num(extra.get(key), out[key])
    return out


def interp_items(items: Optional[list], t: float, fallback: dict) -> dict:
    s = sorted(
        [k for k in (items or []) if isinstance(k, dict) and k.get("t") == k.get("t")],
        key=lambda k: _num(k.get("t"), 0.0),
    )
    fb = _merge(static_props({}), fallback)
    if not s:
        return fb
    time = _num(t, 0.0)

    def props_at(k: dict) -> dict:
        return _merge(fb, k.get("props") if isinstance(k.get("props"), dict) else {})

    if time <= _num(s[0].get("t"), 0.0):
        return props_at(s[0])
    last = s[-1]
    if time >= _num(last.get("t"), 0.0):
        return props_at(last)
    for i in range(len(s) - 1):
        a, b = s[i], s[i + 1]
        ta, tb = _num(a.get("t"), 0.0), _num(b.get("t"), 0.0)
        if ta <= time <= tb:
            pa, pb = props_at(a), props_at(b)
            if normalize_interp(b.get("interpolation")) == "hold":
                return pa
            u = ease_t((time - ta) / ((tb - ta) or 1.0), b.get("interpolation"))
            return {key: pa[key] + (pb[key] - pa[key]) * u for key in KF_PROP_KEYS}
    return props_at(last)


def clip_props_at(clip: Any, local_t: float) -> dict:
    base = static_props(clip)
    if not keyframes_enabled(clip):
        return base
    items = _items(clip)
    if not items:
        return base
    return interp_items(items, local_t, base)
