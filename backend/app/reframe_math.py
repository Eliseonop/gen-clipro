"""Interpolación de encuadre (centro + zoom) alineada con el frontend."""
from __future__ import annotations


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _kf_zoom(kf, fallback: float) -> float:
    z = getattr(kf, "zoom", None)
    if z is None and isinstance(kf, dict):
        z = kf.get("zoom")
    return _clamp(float(fallback if z is None else z), 0.1, 1.0)


def _kf_mode(kf, fallback: str) -> str:
    m = getattr(kf, "pan_mode", None)
    if m is None and isinstance(kf, dict):
        m = kf.get("pan_mode")
    if m is None:
        m = fallback
    return "direct" if m == "direct" else "smooth"


def _kf_t(kf) -> float:
    return float(kf["t"] if isinstance(kf, dict) else kf.t)


def _kf_cx(kf) -> float:
    return float(kf["cx"] if isinstance(kf, dict) else kf.cx)


def _kf_cy(kf) -> float:
    return float(kf["cy"] if isinstance(kf, dict) else kf.cy)


def _kf_fit(kf, fallback: str = "cover") -> str:
    m = getattr(kf, "fit", None)
    if m is None and isinstance(kf, dict):
        m = kf.get("fit")
    if m is None:
        m = fallback
    return "contain" if m == "contain" else "cover"


def frame_at(keyframes, time: float, fallback_zoom: float = 1.0, fallback_mode: str = "smooth") -> dict:
    if not keyframes:
        return {"cx": 0.5, "cy": 0.5, "zoom": fallback_zoom, "pan_mode": fallback_mode, "fit": "cover"}
    s = sorted(keyframes, key=_kf_t)
    if time <= _kf_t(s[0]):
        k = s[0]
        return {
            "cx": _kf_cx(k), "cy": _kf_cy(k), "zoom": _kf_zoom(k, fallback_zoom),
            "pan_mode": _kf_mode(k, fallback_mode), "fit": _kf_fit(k),
        }
    last = s[-1]
    if time >= _kf_t(last):
        return {
            "cx": _kf_cx(last), "cy": _kf_cy(last), "zoom": _kf_zoom(last, fallback_zoom),
            "pan_mode": _kf_mode(last, fallback_mode), "fit": _kf_fit(last),
        }
    for i in range(len(s) - 1):
        a, b = s[i], s[i + 1]
        ta, tb = _kf_t(a), _kf_t(b)
        if ta <= time <= tb:
            arrive = _kf_mode(b, fallback_mode)
            za, zb = _kf_zoom(a, fallback_zoom), _kf_zoom(b, fallback_zoom)
            if arrive == "direct":
                return {
                    "cx": _kf_cx(a), "cy": _kf_cy(a), "zoom": za,
                    "pan_mode": "direct", "fit": _kf_fit(a),
                }
            f = (time - ta) / ((tb - ta) or 1)
            return {
                "cx": _kf_cx(a) + (_kf_cx(b) - _kf_cx(a)) * f,
                "cy": _kf_cy(a) + (_kf_cy(b) - _kf_cy(a)) * f,
                "zoom": za + (zb - za) * f,
                "pan_mode": "smooth",
                "fit": _kf_fit(b),
            }
    return {
        "cx": _kf_cx(last), "cy": _kf_cy(last), "zoom": _kf_zoom(last, fallback_zoom),
        "pan_mode": _kf_mode(last, fallback_mode), "fit": _kf_fit(last),
    }
