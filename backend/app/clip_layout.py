"""Encuadre (crop de fuente) y transformación del resultado en el canvas de salida.

Espejo de ``frontend/src/lib/clipLayout.js``. El crop no cambia al escalar
ni mover el resultado.
"""
from __future__ import annotations

from typing import Any, Optional


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _even(n: float) -> int:
    """Redondea a par un TAMAÑO (ancho/alto): nunca por debajo de 2."""
    n = int(round(n))
    return n - (n % 2) if n >= 2 else 2


def _even_pos(n: float) -> int:
    """Redondea a par una POSICIÓN de overlay.

    A diferencia de ``_even``, admite valores negativos o menores que 2: la
    esquina de un objeto libre movido hacia arriba o a la izquierda cae fuera
    del lienzo (x/y < 0) y FFmpeg recorta lo que sobra. Clamparla a 2 —como
    hace ``_even`` para los tamaños— pegaba el clip a la esquina y descartaba
    el desplazamiento (un paper a pantalla completa subido salía centrado)."""
    return int(round(n / 2)) * 2


def new_transform() -> dict:
    return {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0}


def is_overlay(clip: Any) -> bool:
    layout = clip.get("layout") if isinstance(clip, dict) else getattr(clip, "layout", None)
    return layout == "overlay"


def clip_flip(clip: Any) -> tuple[bool, bool]:
    """(horizontal, vertical): voltear el contenido en los ejes PROPIOS del clip,
    antes del giro (como CapCut). La caja, la máscara y los tiradores no se
    voltean. Espejo de ``clipFlip`` en clipLayout.js."""
    if isinstance(clip, dict):
        return bool(clip.get("flip_h")), bool(clip.get("flip_v"))
    return bool(getattr(clip, "flip_h", False)), bool(getattr(clip, "flip_v", False))


def flip_filters(clip: Any) -> str:
    """``hflip``/``vflip`` para la cadena de un clip de vídeo o imagen ("" si no se
    voltea). Las figuras se voltean al rasterizarlas (``shapes.rasterize_shape``)
    y los textos con tags de libass (``text_ass._rotation_tags``)."""
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    if kind in ("shape", "text"):
        return ""
    h, v = clip_flip(clip)
    return ",".join(f for f, on in (("hflip", h), ("vflip", v)) if on)


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
    return _even_pos(dx), _even_pos(dy), max(2, _even(dw)), max(2, _even(dh)), rot


# --- Punto de la fuente → salida (seguimiento de objetos #15) ----------------------

def _geom_for(zoom: float, src_aspect: float, out_aspect: float) -> tuple[float, float]:
    hf = _clamp(zoom, 0.1, 1.0)
    return min(1.0, hf * out_aspect / src_aspect), hf


def crop_window(clip: Any, src_aspect: float, out_aspect: float, src_t: float, local_t: float) -> dict:
    """Ventana de recorte sobre la fuente ({cx, cy, wf, hf} en 0–1). Espejo de
    ``cropWindow`` en clipLayout.js."""
    from .clip_keyframes import interp_items, keyframes_enabled, static_props
    from .reframe_math import frame_at

    rf = clip.get("reframe") if isinstance(clip, dict) else getattr(clip, "reframe", None)
    if rf is not None and not isinstance(rf, dict):
        rf = rf.model_dump()
    rf = rf or {}
    fr = frame_at(rf.get("keyframes") or [], src_t, rf.get("zoom") or 1.0, rf.get("pan_mode") or "smooth")
    kf = clip.get("keyframes") if isinstance(clip, dict) else getattr(clip, "keyframes", None)
    if keyframes_enabled(clip) and (kf or {}).get("items"):
        base = {**static_props(clip), "cx": fr["cx"], "cy": fr["cy"], "zoom": fr["zoom"]}
        p = interp_items(kf["items"], local_t, base)
        fr = {"cx": p["cx"], "cy": p["cy"], "zoom": p["zoom"], "fit": "cover"}
    if is_overlay(clip) and rf.get("crop_w") is not None and rf.get("crop_h") is not None:
        w, h = _clamp(float(rf["crop_w"]), 0.05, 1), _clamp(float(rf["crop_h"]), 0.05, 1)
        return {"cx": 0.5 if w >= 1 else _clamp(fr["cx"], w / 2, 1 - w / 2),
                "cy": 0.5 if h >= 1 else _clamp(fr["cy"], h / 2, 1 - h / 2), "wf": w, "hf": h}
    if fr.get("fit") == "contain":
        return {"cx": 0.5, "cy": 0.5, "wf": 1.0, "hf": 1.0}
    wf, hf = _geom_for(fr["zoom"], src_aspect, out_aspect)
    return {"cx": 0.5 if wf >= 1 else _clamp(fr["cx"], wf / 2, 1 - wf / 2),
            "cy": 0.5 if hf >= 1 else _clamp(fr["cy"], hf / 2, 1 - hf / 2), "wf": wf, "hf": hf}


def source_point_to_output(clip: Any, nx: float, ny: float, src_w: float, src_h: float,
                           out_w: float, out_h: float, src_t: float, local_t: float) -> tuple[float, float]:
    """Dónde cae en la salida (0–1) el punto (nx, ny) de la fuente del clip en ese
    instante: recorte, pose (con keyframes), volteo y giro. Espejo de
    ``sourcePointToOutput`` en clipLayout.js."""
    import math

    from .clip_anim import clip_pose

    crop = crop_window(clip, src_w / src_h, out_w / out_h, src_t, local_t)
    sw, sh = crop["wf"] * src_w, crop["hf"] * src_h
    sx = _clamp((crop["cx"] - crop["wf"] / 2) * src_w, 0, max(0.0, src_w - sw))
    sy = _clamp((crop["cy"] - crop["hf"] / 2) * src_h, 0, max(0.0, src_h - sh))
    pose = clip_pose(clip, local_t)
    s = pose["scale"]
    dw, dh = (sw * s, sh * s) if is_overlay(clip) else (out_w * s, out_h * s)
    rx = ((nx * src_w - sx) / (sw or 1) - 0.5) * dw
    ry = ((ny * src_h - sy) / (sh or 1) - 0.5) * dh
    fh, fv = clip_flip(clip)
    if fh:
        rx = -rx
    if fv:
        ry = -ry
    a = math.radians(pose["rotation"] or 0)
    return ((pose["x"] * out_w + rx * math.cos(a) - ry * math.sin(a)) / out_w,
            (pose["y"] * out_h + rx * math.sin(a) + ry * math.cos(a)) / out_h)
