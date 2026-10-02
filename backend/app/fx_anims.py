"""Animaciones de clip (entrada, salida, bucle, combo) en el export.

Espejo exacto de ``frontend/src/fx/core/animEval.js``: mismas curvas, mismas
ventanas, mismos deltas. El catálogo (datos) sale de ``frontend/src/fx/anims.js``
vía ``npm run fx:build`` → ``fx_assets/catalog.json``. Un test compara ambos
lenguajes con los mismos casos.

``clip.animations = {in: {id, dur}, out: {id, dur}, loop: {id, dur}, combo: {id}}``.
El delta se aplica a la pose (x, y en fracción del cuadro; scale y opacity
multiplican; rotation suma), nunca al recorte (cx/cy/zoom).
"""
from __future__ import annotations

import math
from typing import Any

from . import fx_catalog

ANIM_SAMPLE_FPS = 30
_SLOTS = ("in", "out", "loop", "combo")
IDENTITY = {"x": 0.0, "y": 0.0, "scale": 1.0, "rotation": 0.0, "opacity": 1.0}

_C1 = 1.70158
_C3 = _C1 + 1
_C4 = (2 * math.pi) / 3


def _bounce_out(x: float) -> float:
    n1, d1 = 7.5625, 2.75
    if x < 1 / d1:
        return n1 * x * x
    if x < 2 / d1:
        y = x - 1.5 / d1
        return n1 * y * y + 0.75
    if x < 2.5 / d1:
        y = x - 2.25 / d1
        return n1 * y * y + 0.9375
    y = x - 2.625 / d1
    return n1 * y * y + 0.984375


def _elastic_out(x: float) -> float:
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    return 2 ** (-10 * x) * math.sin((x * 10 - 0.75) * _C4) + 1


EASES = {
    "linear": lambda x: x,
    "inQuad": lambda x: x * x,
    "outQuad": lambda x: 1 - (1 - x) * (1 - x),
    "inOutQuad": lambda x: 2 * x * x if x < 0.5 else 1 - ((-2 * x + 2) ** 2) / 2,
    "inCubic": lambda x: x * x * x,
    "outCubic": lambda x: 1 - (1 - x) ** 3,
    "inOutCubic": lambda x: 4 * x * x * x if x < 0.5 else 1 - ((-2 * x + 2) ** 3) / 2,
    "inOutSine": lambda x: -(math.cos(math.pi * x) - 1) / 2,
    "inBack": lambda x: _C3 * x * x * x - _C1 * x * x,
    "outBack": lambda x: 1 + _C3 * (x - 1) ** 3 + _C1 * (x - 1) ** 2,
    "outElastic": _elastic_out,
    "outBounce": _bounce_out,
    "hold": lambda x: 1.0 if x >= 1 else 0.0,
}


def eval_track(keys: list, u: float):
    if not keys:
        return None
    if u <= keys[0][0]:
        return float(keys[0][1])
    last = keys[-1]
    if u >= last[0]:
        return float(last[1])
    for a, b in zip(keys, keys[1:]):
        if a[0] <= u <= b[0]:
            span = b[0] - a[0]
            f = (u - a[0]) / span if span > 0 else 1.0
            ease = EASES.get(b[2] if len(b) > 2 and b[2] else "linear", EASES["linear"])
            return float(a[1]) + (float(b[1]) - float(a[1])) * ease(f)
    return float(last[1])


def _delta_at(anim: dict, u: float) -> dict:
    tracks = anim.get("tracks") or {}

    def v(k: str, d: float) -> float:
        r = eval_track(tracks.get(k), u)
        return d if r is None else r

    return {"x": v("x", 0.0), "y": v("y", 0.0), "scale": v("scale", 1.0),
            "rotation": v("rotation", 0.0), "opacity": v("opacity", 1.0)}


def _combine(a: dict, b: dict) -> dict:
    return {
        "x": a["x"] + b["x"],
        "y": a["y"] + b["y"],
        "scale": a["scale"] * b["scale"],
        "rotation": a["rotation"] + b["rotation"],
        "opacity": a["opacity"] * b["opacity"],
    }


def _raw(clip: Any):
    raw = clip.get("animations") if isinstance(clip, dict) else getattr(clip, "animations", None)
    return raw if isinstance(raw, dict) else None


def clip_animations(clip: Any, clip_dur: float) -> list[dict]:
    raw = _raw(clip)
    if not raw:
        return []
    D = max(0.0, float(clip_dur or 0))
    out = []
    for slot in _SLOTS:
        entry = raw.get(slot)
        if not isinstance(entry, dict):
            continue
        anim = fx_catalog.anim(entry.get("id"))
        if not anim or anim.get("slot") != slot:
            continue
        try:
            dur = float(entry.get("dur"))
        except (TypeError, ValueError):
            dur = float("nan")
        if not math.isfinite(dur) or dur <= 0:
            dur = float(anim.get("dur") or 0)
        if slot == "combo":
            dur = D
        out.append({"slot": slot, "anim": anim, "dur": max(0.05, dur)})
    inn = next((a for a in out if a["slot"] == "in"), None)
    outt = next((a for a in out if a["slot"] == "out"), None)
    total = (inn["dur"] if inn else 0.0) + (outt["dur"] if outt else 0.0)
    if D > 0 and total > D:
        k = D / total
        if inn:
            inn["dur"] *= k
        if outt:
            outt["dur"] *= k
    return out


def has_animations(clip: Any) -> bool:
    return bool(clip_animations(clip, 1.0))


def animation_delta(clip: Any, t: float, clip_dur: float) -> dict:
    items = clip_animations(clip, clip_dur)
    if not items:
        return IDENTITY
    D = max(0.0, float(clip_dur or 0))
    d = IDENTITY
    for a in items:
        if a["slot"] == "in":
            u = min(1.0, max(0.0, t / a["dur"]))
        elif a["slot"] == "out":
            u = min(1.0, max(0.0, (t - (D - a["dur"])) / a["dur"]))
        elif a["slot"] == "loop":
            u = (t / a["dur"]) % 1.0
        else:
            u = min(1.0, max(0.0, t / D)) if D > 0 else 0.0
        d = _combine(d, _delta_at(a["anim"], u))
    return d


def apply_delta(props: dict, d: dict) -> dict:
    if d is IDENTITY:
        return props
    out = dict(props)
    out["x"] = float(props.get("x") or 0.0) + d["x"]
    out["y"] = float(props.get("y") or 0.0) + d["y"]
    out["scale"] = float(1.0 if props.get("scale") is None else props["scale"]) * d["scale"]
    out["rotation"] = float(props.get("rotation") or 0.0) + d["rotation"]
    out["opacity"] = float(1.0 if props.get("opacity") is None else props["opacity"]) * d["opacity"]
    return out


def animation_sample_times(clip: Any, clip_dur: float) -> list[float]:
    items = clip_animations(clip, clip_dur)
    D = max(0.0, float(clip_dur or 0))
    step = 1.0 / ANIM_SAMPLE_FPS
    times: set[float] = set()

    def add(a: float, b: float) -> None:
        n = max(1, math.ceil((b - a) / step - 1e-9))
        for i in range(n + 1):
            times.add(round(a + (b - a) * i / n, 6))

    for a in items:
        if a["slot"] == "in":
            add(0.0, min(D, a["dur"]))
        elif a["slot"] == "out":
            add(max(0.0, D - a["dur"]), D)
        else:
            add(0.0, D)
    return sorted(times)
