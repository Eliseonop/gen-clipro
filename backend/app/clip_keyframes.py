"""Keyframes genéricos: snapshots de propiedades + interpolación.

Espejo de ``frontend/src/lib/clipKeyframes.js``. ``t`` es tiempo local del clip.
"""
from __future__ import annotations

import math
import uuid
from typing import Any, Optional

from .clip_mask import MASK_KF_KEYS, mask_static_props

KF_SNAP = 0.06
# Espejo de audio_fx.AUDIO_FX_IDS (#16: filtros de sonido al final).
AUDIO_FX_KEYS = ("eq", "compressor", "reverb", "echo", "denoise", "distortion",
                 "underwater", "telephone", "radio", "megaphone", "muffled")
VOL_MIN = 0.0
VOL_MAX = 2.0
KF_PROP_KEYS = (
    "x", "y", "scale", "rotation", "opacity", "cx", "cy", "zoom",
    "rot_x", "rot_y",                     # giro 3D (solo textos; ver text3d.py)
    "draw",                               # trazo dibujado 0–1 (solo figuras, #14)
    *MASK_KF_KEYS,
    "volume", *AUDIO_FX_KEYS,
)


# Estilo del texto animable (espejo de TEXT_STYLE_KF_KEYS de clipKeyframes.js):
# Color, Trazo, Fondo y Sombra. Cada propiedad lleva sus propios keyframes (un
# item puede tener solo algunas); si ninguno la tiene, manda el valor del estilo.
TEXT_STYLE_KF_KEYS = (
    "color", "border_color", "border_width", "bg", "bg_opacity",
    "bg_radius", "bg_pad_x", "bg_pad_y", "bg_dx", "bg_dy",
    "shadow_color", "shadow_opacity", "shadow_blur", "shadow_distance", "shadow_angle",
    "glow_color", "glow_intensity", "glow_range", "glow_dx", "glow_dy",
    "curve", "stretch_x", "stretch_y",
)
_COLOR_KF_KEYS = frozenset(("color", "border_color", "bg", "shadow_color", "glow_color"))


def hex_rgb(v: Any) -> Optional[tuple[int, int, int]]:
    h = str(v if v is not None else "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return None
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def _rgb_hex(rgb) -> str:
    return "#" + "".join(f"{int(round(min(255.0, max(0.0, c)))):02x}" for c in rgb)


def _valid_kf_value(key: str, v: Any) -> bool:
    if key in _COLOR_KF_KEYS:
        return hex_rgb(v) is not None
    if v is None or v == "":
        return False
    try:
        n = float(v)
    except (TypeError, ValueError):
        return False
    return math.isfinite(n)


def _kf_value(key: str, v: Any):
    return _rgb_hex(hex_rgb(v)) if key in _COLOR_KF_KEYS else float(v)


def _mix_kf_value(key: str, a, b, u: float):
    if key in _COLOR_KF_KEYS:
        ca, cb = hex_rgb(a), hex_rgb(b)
        return _rgb_hex([x + (y - x) * u for x, y in zip(ca, cb)])
    return a + (b - a) * u


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n:
        return default
    return n


INTERPS = (
    "linear", "ease-in", "ease-out", "ease-in-out",
    "cubic-in", "cubic-out", "cubic-in-out", "back-out", "bezier", "hold",
)
# Curva por defecto de "Personalizada" (la ease-in-out de CSS) y la de "Rebote".
BEZIER_DEFAULT = (0.42, 0.0, 0.58, 1.0)
BACK_OUT = (0.34, 1.56, 0.64, 1.0)
# Curvas sin fórmula cerrada en FFmpeg: el export las muestrea por tramos.
SAMPLED_INTERPS = ("back-out", "bezier")


def normalize_interp(v: Any) -> str:
    if v in INTERPS:
        return v
    if v in ("direct", "step"):
        return "hold"
    return "linear"


def normalize_bezier(v: Any) -> Optional[tuple[float, float, float, float]]:
    """``[x1, y1, x2, y2]`` de una curva cúbica (como ``cubic-bezier`` de CSS).

    x se limita a 0–1 (la curva debe avanzar en el tiempo); y admite −1…2 para
    curvas que se pasan y vuelven (rebote)."""
    if not isinstance(v, (list, tuple)) or len(v) != 4:
        return None
    n = [_num(x, float("nan")) for x in v]
    if any(x != x for x in n):
        return None
    return (
        min(1.0, max(0.0, n[0])), min(2.0, max(-1.0, n[1])),
        min(1.0, max(0.0, n[2])), min(2.0, max(-1.0, n[3])),
    )


def bezier_y(bez: Any, u: float) -> float:
    """Progreso ``y`` de la curva en el instante ``u`` (0–1). Espejo de ``bezierY``."""
    x1, y1, x2, y2 = normalize_bezier(bez) or BEZIER_DEFAULT
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    cx = 3 * x1
    bx = 3 * (x2 - x1) - cx
    ax = 1 - cx - bx
    cy = 3 * y1
    by = 3 * (y2 - y1) - cy
    ay = 1 - cy - by

    def x_at(s: float) -> float:
        return ((ax * s + bx) * s + cx) * s

    s = u
    ok = False
    for _ in range(8):
        err = x_at(s) - u
        if abs(err) < 1e-7:
            ok = True
            break
        d = (3 * ax * s + 2 * bx) * s + cx
        if abs(d) < 1e-6:
            break
        s -= err / d
    if not ok and not (0 <= s <= 1 and abs(x_at(s) - u) < 1e-5):
        lo, hi, s = 0.0, 1.0, u
        for _ in range(40):
            x = x_at(s)
            if abs(x - u) < 1e-7:
                break
            if x < u:
                lo = s
            else:
                hi = s
            s = (lo + hi) / 2
    return ((ay * s + by) * s + cy) * s


def ease_t(u: float, kind: str, bezier: Any = None) -> float:
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
    if k == "cubic-in":
        return t * t * t
    if k == "cubic-out":
        return 1.0 - (1.0 - t) ** 3
    if k == "cubic-in-out":
        return 4 * t * t * t if t < 0.5 else 1.0 - ((-2 * t + 2) ** 3) / 2
    if k == "back-out":
        return bezier_y(BACK_OUT, t)
    if k == "bezier":
        return bezier_y(bezier, t)
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
            "cx": 0.5, "cy": 0.5, "zoom": 1.0, "rot_x": 0.0, "rot_y": 0.0,
            "draw": max(0.0, min(1.0, _num(st.get("draw"), 1.0))),
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
            "rot_x": _num(st.get("rot_x"), 0.0), "rot_y": _num(st.get("rot_y"), 0.0),
            "draw": 1.0,
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
        "cx": 0.5, "cy": 0.5, "zoom": _num(zoom, 1.0), "rot_x": 0.0, "rot_y": 0.0,
        "draw": 1.0,
        **mask_static_props(clip),
        **audio,
    }


def _merge(base: dict, extra: Optional[dict]) -> dict:
    out = dict(base)
    for key in KF_PROP_KEYS:
        if extra and extra.get(key) is not None:
            out[key] = _num(extra.get(key), out[key])
    return out


def _sorted_items(items: Optional[list]) -> list[dict]:
    return sorted(
        [k for k in (items or []) if isinstance(k, dict) and math.isfinite(_num(k.get("t"), float("nan")))],
        key=lambda k: _num(k.get("t"), 0.0),
    )


def _interp_key(s: list[dict], key: str, time: float):
    """Valor de ``key`` en ``time`` entre los items que la tienen; None si ninguno
    (espejo de ``interpKey``)."""
    ks = [k for k in s if isinstance(k.get("props"), dict) and _valid_kf_value(key, k["props"].get(key))]
    if not ks:
        return None
    val = lambda k: _kf_value(key, k["props"][key])  # noqa: E731
    if time <= _num(ks[0].get("t"), 0.0):
        return val(ks[0])
    last = ks[-1]
    if time >= _num(last.get("t"), 0.0):
        return val(last)
    for a, b in zip(ks, ks[1:]):
        ta, tb = _num(a.get("t"), 0.0), _num(b.get("t"), 0.0)
        if ta <= time <= tb:
            if normalize_interp(b.get("interpolation") or b.get("ease")) == "hold":
                return val(a)
            u = ease_t((time - ta) / ((tb - ta) or 1.0), b.get("interpolation") or b.get("ease"), b.get("bezier"))
            return _mix_kf_value(key, val(a), val(b), u)
    return val(last)


def interp_items(items: Optional[list], t: float, fallback: dict) -> dict:
    """Cada propiedad se interpola entre los items que la tienen (los de solo estilo
    de texto no cuentan para la pose); sin ninguno, su valor de ``fallback``."""
    s = _sorted_items(items)
    out = _merge(static_props({}), fallback)
    if not s:
        return out
    time = _num(t, 0.0)
    for key in KF_PROP_KEYS:
        v = _interp_key(s, key, time)
        if v is not None:
            out[key] = v
    return out


def text_style_at(clip: Any, local_t: float) -> dict:
    """Estilo animado del texto en ``local_t``: solo las propiedades con keyframes."""
    if not keyframes_enabled(clip):
        return {}
    s = _sorted_items(_items(clip))
    out = {}
    for key in TEXT_STYLE_KF_KEYS:
        v = _interp_key(s, key, _num(local_t, 0.0))
        if v is not None:
            out[key] = v
    return out


def text_style_animates(clip: Any) -> bool:
    """True si alguna propiedad de estilo toma valores distintos en sus keyframes."""
    if not keyframes_enabled(clip):
        return False
    s = _sorted_items(_items(clip))
    for key in TEXT_STYLE_KF_KEYS:
        vals = {_kf_value(key, k["props"][key]) for k in s
                if isinstance(k.get("props"), dict) and _valid_kf_value(key, k["props"].get(key))}
        if len(vals) > 1:
            return True
    return False


def with_text_style_kf(st: dict, anim: dict) -> dict:
    """Estilo con sus keyframes; las casillas mandan (sin Fondo o sin Trazo en el
    estilo, sus valores animados no hacen nada). Espejo de ``withTextStyleKf``."""
    st = st or {}
    out = {**st, **(anim or {})}
    if not st.get("bg") or st.get("bg") == "none":
        out["bg"] = st.get("bg", "none")
    if not _num(st.get("border_width"), 0.0) > 0:
        out["border_width"] = st.get("border_width", 0)
    if not st.get("scale_split"):
        out.pop("stretch_x", None)
        out.pop("stretch_y", None)
    return out


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


_SAMPLE_STEP = 1.0 / 30.0
_MAX_SEGMENT_STEPS = 120


def _segment_steps(span: float) -> int:
    """Tramos rectos con que el export sigue una curva de ``span`` segundos:
    uno por fotograma a 30 fps (exacto en esos instantes), con tope."""
    return min(_MAX_SEGMENT_STEPS, max(2, int(math.ceil(max(0.0, span) / _SAMPLE_STEP))))


def pose_sample_times(clip: Any, duration: float) -> list[float]:
    """Instantes (tiempo local) donde muestrear la pose para el export.

    FFmpeg interpola en línea recta entre los puntos que recibe; en tramos con
    curva (ease, cúbica, bézier…) se añaden puntos intermedios para que siga la
    misma curva que el preview, y en ``hold`` un punto justo antes del salto.
    Solo dependen de los keyframes, así que todas las propiedades comparten
    los mismos instantes.
    """
    dur = max(0.0, _num(duration, 0.0))
    times = {0.0, dur}
    if not keyframes_enabled(clip):
        return sorted(times)
    items = sorted((k for k in _items(clip) if isinstance(k, dict)), key=lambda k: _num(k.get("t"), 0.0))

    def clamp(t: float) -> float:
        return min(dur, max(0.0, t))

    for k in items:
        times.add(clamp(_num(k.get("t"), 0.0)))
    for a, b in zip(items, items[1:]):
        ta, tb = clamp(_num(a.get("t"), 0.0)), clamp(_num(b.get("t"), 0.0))
        kind = normalize_interp(b.get("interpolation"))
        if tb - ta <= 1e-6 or kind == "linear":
            continue
        if kind == "hold":
            times.add(max(ta, tb - 1e-3))
            continue
        n = _segment_steps(tb - ta)
        for j in range(1, n):
            times.add(ta + (tb - ta) * j / n)
    return sorted(times)


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
    if k == "cubic-in":
        return f"(({u})*({u})*({u}))"
    if k == "cubic-out":
        return f"(1-(1-({u}))*(1-({u}))*(1-({u})))"
    if k == "cubic-in-out":
        return (f"if(lt({u}\\,0.5)\\,4*({u})*({u})*({u})\\,"
                f"1-(2-2*({u}))*(2-2*({u}))*(2-2*({u}))/2)")
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
    def value_at(t: float) -> float:
        v = clip_props_at(clip, t).get(key, default)
        return clamp_volume(v) if key == "volume" else max(0.0, _num(v, default))

    pts: list[tuple[float, float, dict]] = []
    for i, k in enumerate(raw):
        t = _num(k.get("t"), 0.0)
        if i and normalize_interp(k.get("interpolation")) in SAMPLED_INTERPS:
            # Curva sin fórmula cerrada: tramos rectos cortos que la siguen.
            ta = pts[-1][0]
            n = _segment_steps(t - ta)
            for j in range(1, n):
                tj = ta + (t - ta) * j / n
                pts.append((tj, value_at(tj), {"interpolation": "linear"}))
            pts.append((t, value_at(t), {"interpolation": "linear"}))
            continue
        pts.append((t, value_at(t), k))
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
        item = {
            "id": f"k{uuid.uuid4().hex[:8]}", "t": t,
            "interpolation": interp or last, "props": props,
        }
        # Un keyframe nuevo hereda también la curva personalizada del anterior.
        prev_bez = normalize_bezier(items[-1].get("bezier")) if items else None
        if prev_bez and not interp:
            item["bezier"] = list(prev_bez)
        items.append(item)
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
