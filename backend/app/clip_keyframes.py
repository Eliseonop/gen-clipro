"""Keyframes genéricos: snapshots de propiedades + interpolación.

Espejo de ``frontend/src/lib/clipKeyframes.js``. ``t`` es tiempo local del clip.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from .clip_mask import MASK_KF_KEYS, mask_static_props

KF_SNAP = 0.06
AUDIO_FX_KEYS = ("eq", "compressor", "reverb", "echo", "denoise", "distortion")
VOL_MIN = 0.0
VOL_MAX = 2.0
KF_PROP_KEYS = (
    "x", "y", "scale", "rotation", "opacity", "cx", "cy", "zoom",
    *MASK_KF_KEYS,
    "volume", *AUDIO_FX_KEYS,
)


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


def _clip_get(clip: Any, key: str, default: Any = None) -> Any:
    if isinstance(clip, dict):
        return clip.get(key, default)
    return getattr(clip, key, default)


def clamp_volume(v: Any) -> float:
    return min(VOL_MAX, max(VOL_MIN, _num(v, 1.0)))


def _audio_defaults(clip: Any) -> dict:
    fx = _clip_get(clip, "audio_fx")
    if not isinstance(fx, dict):
        fx = {}
    out = {"volume": clamp_volume(_clip_get(clip, "volume", 1.0))}
    for key in AUDIO_FX_KEYS:
        val = fx.get(key)
        if val is True:
            out[key] = 1.0
        elif val is False or val is None:
            out[key] = 0.0
        else:
            out[key] = max(0.0, min(1.0, _num(val, 0.0)))
    return out


def static_props(clip: Any) -> dict:
    kind = _clip_get(clip, "kind")
    get = (lambda o, k: o.get(k) if isinstance(o, dict) else getattr(o, k, None))
    audio = _audio_defaults(clip)
    if kind == "shape":
        st = get(clip, "shape") or {}
        if not isinstance(st, dict):
            st = {}
        return {
            "x": _num(st.get("x"), 0.5), "y": _num(st.get("y"), 0.5),
            "scale": _num(st.get("scale"), 1.0), "rotation": _num(st.get("rotation"), 0.0),
            "opacity": _num(st.get("opacity"), 1.0),
            "cx": 0.5, "cy": 0.5, "zoom": 1.0,
            **mask_static_props(clip),
            **audio,
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
            **mask_static_props(clip),
            **audio,
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
        **mask_static_props(clip),
        **audio,
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


def clip_volume_at(clip: Any, local_t: float) -> float:
    return clamp_volume(clip_props_at(clip, local_t).get("volume", 1.0))


def _u_expr(ta: float, tb: float) -> str:
    span = max(tb - ta, 1e-6)
    return f"min(1\\,max(0\\,(t-{ta:.6f})/{span:.6f}))"


def _eased_expr(u: str, kind: str) -> str:
    k = normalize_interp(kind)
    if k == "hold":
        return "0"
    if k == "ease-in":
        return f"(({u})*({u}))"
    if k == "ease-out":
        return f"(1-(1-({u}))*(1-({u})))"
    if k == "ease-in-out":
        return f"if(lt({u}\\,0.5)\\,2*({u})*({u})\\,1-2*(1-({u}))*(1-({u})))"
    return f"({u})"


def _lerp_expr(va: float, vb: float, ta: float, tb: float, interp: Any) -> str:
    eu = _eased_expr(_u_expr(ta, tb), interp)
    return f"({va:.6f}+(({vb:.6f})-({va:.6f}))*{eu})"


def ffmpeg_envelope(clip: Any, key: str, default: float) -> Optional[str]:
    """Expresión FFmpeg (comas escapadas) o None si el parámetro es constante."""
    if not keyframes_enabled(clip):
        return None
    raw = [k for k in _items(clip) if isinstance(k, dict)]
    raw.sort(key=lambda k: _num(k.get("t"), 0.0))
    if len(raw) < 2:
        return None
    pts: list[tuple[float, float, dict]] = []
    for k in raw:
        t = _num(k.get("t"), 0.0)
        val = clamp_volume(clip_props_at(clip, t).get(key, default)) if key == "volume" else max(
            0.0, _num(clip_props_at(clip, t).get(key, default), default)
        )
        pts.append((t, val, k))
    values = [round(v, 4) for _, v, _ in pts]
    if len(set(values)) <= 1:
        return None
    expr = f"{pts[-1][1]:.6f}"
    for i in range(len(pts) - 2, -1, -1):
        ta, va, _a = pts[i]
        tb, vb, b = pts[i + 1]
        seg = _lerp_expr(va, vb, ta, tb, b.get("interpolation"))
        expr = f"if(lt(t\\,{tb:.6f})\\,{seg}\\,{expr})"
    t0, v0, _ = pts[0]
    return f"if(lte(t\\,{t0:.6f})\\,{v0:.6f}\\,{expr})"


def volume_filter(clip: Any) -> str:
    """Filtro ``volume`` de FFmpeg: constante o envolvente por keyframes."""
    expr = ffmpeg_envelope(clip, "volume", 1.0)
    if expr:
        return f"volume='{expr}':eval=frame"
    return f"volume={clip_volume_at(clip, 0.0):.3f}"


def _as_dict(clip: Any) -> dict:
    if isinstance(clip, dict):
        return dict(clip)
    dump = getattr(clip, "model_dump", None)
    return dump() if callable(dump) else {}


def upsert_keyframe_at(clip: Any, local_t: float, prop_patch: dict | None = None,
                       interpolation: str | None = None) -> dict:
    """Añade o actualiza un snapshot en ``t`` (tiempo local). Devuelve un dict."""
    data = _as_dict(clip)
    t = round(_num(local_t, 0.0), 6)
    prev = data.get("keyframes") if isinstance(data.get("keyframes"), dict) else {}
    items = [dict(k) for k in (prev.get("items") or []) if isinstance(k, dict)]
    enabled = {**data, "keyframes": {"enabled": True, "items": items}}
    props = dict(clip_props_at(enabled, t))
    for key in KF_PROP_KEYS:
        if prop_patch and prop_patch.get(key) is not None:
            props[key] = _num(prop_patch.get(key), props[key])
    idx = next((i for i, k in enumerate(items) if abs(_num(k.get("t"), 0.0) - t) < KF_SNAP), -1)
    interp = normalize_interp(interpolation) if interpolation else None
    if idx >= 0:
        items[idx] = {
            **items[idx], "t": t, "props": props,
            "interpolation": interp or normalize_interp(items[idx].get("interpolation")),
        }
    else:
        last = normalize_interp(items[-1].get("interpolation")) if items else "linear"
        items.append({
            "id": f"k{uuid.uuid4().hex[:8]}", "t": t,
            "interpolation": interp or last, "props": props,
        })
    items.sort(key=lambda k: _num(k.get("t"), 0.0))
    data["keyframes"] = {"enabled": True, "items": items}
    return data


def apply_volume_fade(clip: Any, duration: float, side: str, fade_dur: float = 0.5) -> dict:
    """Fade in/out de volumen con keyframes. ``duration`` es la del clip en la timeline."""
    if side not in ("in", "out"):
        raise ValueError("side debe ser 'in' o 'out'")
    data = _as_dict(clip)
    dur = max(0.05, _num(duration, 0.0))
    window = min(max(0.05, _num(fade_dur, 0.5)), dur / 2.0)
    peak = clamp_volume(data.get("volume", 1.0))
    target = peak if peak > 0.001 else 1.0
    data["volume"] = target
    if side == "in":
        data = upsert_keyframe_at(data, 0.0, {"volume": 0.0}, "ease-out")
        data = upsert_keyframe_at(data, window, {"volume": target}, "ease-out")
    else:
        data = upsert_keyframe_at(data, max(0.0, dur - window), {"volume": target}, "ease-in")
        data = upsert_keyframe_at(data, dur, {"volume": 0.0}, "ease-in")
    return data
