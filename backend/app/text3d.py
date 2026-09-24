"""Texto 3D: giro en X (inclinar) e Y (girar) alrededor del centro de la caja,
con perspectiva. Espejo de ``frontend/src/lib/text3d.js``.

El texto vive en un plano; ``plane_project`` lo gira y lo proyecta con una
cámara a distancia ``f`` del plano. El preview deforma la capa del texto con
WebGL (``render/warp3d.js``) y el export con el filtro ``perspective`` de FFmpeg
(``layer_warp``), usando las MISMAS esquinas proyectadas.

Convenciones (y hacia abajo, como la pantalla): ``rot_x`` > 0 aleja la parte de
ARRIBA del texto (se "tumba" hacia el fondo); ``rot_y`` > 0 aleja la DERECHA.
El libass de FFmpeg también sabe girar en 3D (``\\frx``/``\\fry``), pero con la
cámara fija a 20 000 px: sin perspectiva apreciable, el texto solo se aplasta.
"""
from __future__ import annotations

import math
from typing import Any, Optional

MAX_ANGLE = 75.0            # más allá, el texto queda de canto y la proyección explota
PERSPECTIVE_DEFAULT = 0.5


def _num(v: Any, d: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return d
    return n if n == n else d


def focal_of(frame_h: float, perspective: Any) -> float:
    """Distancia de la cámara al plano. 0 = casi plano (4·alto), 0.5 = el alto del
    cuadro, 1 = muy marcada (0.57·alto)."""
    p = min(1.0, max(0.0, _num(perspective, PERSPECTIVE_DEFAULT)))
    return frame_h / (0.25 + 1.5 * p)


def angles(props: dict) -> Optional[tuple[float, float]]:
    """(rot_x, rot_y) limitados, o None si el texto no está girado en 3D."""
    rx = min(MAX_ANGLE, max(-MAX_ANGLE, _num(props.get("rot_x"), 0.0)))
    ry = min(MAX_ANGLE, max(-MAX_ANGLE, _num(props.get("rot_y"), 0.0)))
    if abs(rx) < 0.05 and abs(ry) < 0.05:
        return None
    return rx, ry


def plane_project(cx: float, cy: float, rx: float, ry: float, f: float,
                  X: float, Y: float) -> tuple[float, float, float]:
    """Punto (X, Y) del plano del texto → (X', Y', w). ``w`` = (f + z)/f, > 0 si
    queda delante de la cámara. Espejo de ``planeProject``."""
    x, y = X - cx, Y - cy
    a, b = math.radians(rx), math.radians(ry)
    y1 = y * math.cos(a)
    z1 = -y * math.sin(a)
    x2 = x * math.cos(b) - z1 * math.sin(b)
    z2 = x * math.sin(b) + z1 * math.cos(b)
    w = (f + z2) / f
    if abs(w) < 1e-3:           # en el plano de la cámara: al infinito (acotado)
        w = 1e-3 if w >= 0 else -1e-3
    return cx + x2 / w, cy + y1 / w, w


def text_half_extents(st: dict, text: str, W: int, H: int, font_px: float,
                      shadow: Optional[dict] = None) -> tuple[float, float]:
    """Semiancho/semialto (px) que ocupa el texto alrededor de su centro, con margen.

    Estimación generosa (el ajuste de línea real lo hace libass): caja de ajuste
    ``w`` × líneas estimadas, más borde y sombra. La caja crece con la escala."""
    scale = _num(st.get("scale"), 1.0)
    bw = max(0.2, min(1.0, _num(st.get("w"), 0.88))) * W * (scale if scale > 0 else 1.0)
    per_line = max(1, int(bw / max(1.0, 0.5 * font_px)))
    lines = sum(max(1, math.ceil(len(p) / per_line)) for p in (text or "").split("\n")) or 1
    pad = font_px * 0.6 + _num(st.get("border_width"), 0.0) * 2
    if shadow:
        pad += max(abs(shadow["dx"]), abs(shadow["dy"])) + 3 * shadow["sigma"]
    return bw / 2 + pad, lines * 1.22 * font_px / 2 + pad


def warp_region(poses: list[dict], W: int, H: int) -> tuple[float, float, float, float]:
    """Rectángulo (x0, y0, x1, y1) de la capa que se deforma: contiene el texto en
    su sitio y proyectado en TODOS los fotogramas (el filtro ``perspective`` no
    cambia el tamaño del cuadro). Cada pose: {cx, cy, rx, ry, f, hx, hy}."""
    xs: list[float] = []
    ys: list[float] = []
    for p in poses:
        for sx in (-1, 1):
            for sy in (-1, 1):
                X, Y = p["cx"] + sx * p["hx"], p["cy"] + sy * p["hy"]
                xs.append(X)
                ys.append(Y)
                px, py, w = plane_project(p["cx"], p["cy"], p["rx"], p["ry"], p["f"], X, Y)
                if w > 0.05:
                    xs.append(px)
                    ys.append(py)
    m = 4.0
    x0, x1 = min(xs) - m, max(xs) + m
    y0, y1 = min(ys) - m, max(ys) + m
    # Acotado a 2 cuadros alrededor del lienzo: más lejos no se ve nada.
    x0, y0 = max(x0, -W), max(y0, -H)
    x1, y1 = min(x1, 2 * W), min(y1, 2 * H)
    return math.floor(x0), math.floor(y0), math.ceil(x1), math.ceil(y1)


def region_corners(p: dict, region: tuple[float, float, float, float]) -> list[tuple[float, float]]:
    """Destino de las 4 esquinas de la región (arriba-izq, arriba-der, abajo-izq,
    abajo-der), relativo a su origen: lo que pide ``perspective:sense=destination``."""
    # Una esquina detrás de la cámara (w < 0) sigue dando la homografía correcta:
    # el punto proyectado es el representante euclídeo del mismo punto proyectivo.
    # Esa zona de la región queda fuera del texto (que siempre está delante), así
    # que lo que FFmpeg muestree allí es transparente.
    x0, y0, x1, y1 = region
    out = []
    for X, Y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        px, py, _ = plane_project(p["cx"], p["cy"], p["rx"], p["ry"], p["f"], X, Y)
        out.append((px - x0, py - y0))
    return out
