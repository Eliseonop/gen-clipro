"""Filtros de color con intensidad, apilables (#18, «Filtros» de CapCut).

Espejo de ``frontend/src/lib/clipFilters.js``. Cada filtro es una matriz de color
AFÍN 3×4 sobre RGB en gamma: ``out = M·rgb + o``. La intensidad interpola con la
identidad y la pila se compone en UNA matriz: ``colorchannelmixer`` (+ ``lutrgb``
para el desplazamiento) en el export, ``feColorMatrix`` en la vista previa.
"""
from __future__ import annotations

from typing import Any, Optional

_I = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0]]


def _sat(s: float) -> list:
    return [
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0],
    ]


def _sepia(a: float) -> list:
    b = 1 - a
    return [
        [0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b, 0],
        [0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b, 0],
        [0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b, 0],
    ]


def _contrast(c: float) -> list:
    return [[c, 0, 0, 0.5 - 0.5 * c], [0, c, 0, 0.5 - 0.5 * c], [0, 0, c, 0.5 - 0.5 * c]]


def _bright(b: float) -> list:
    return [[b, 0, 0, 0], [0, b, 0, 0], [0, 0, b, 0]]


def _tint(r: float, g: float, b: float) -> list:
    return [[r, 0, 0, 0], [0, g, 0, 0], [0, 0, b, 0]]


def _lift(o: float) -> list:
    return [[1 - o, 0, 0, o], [0, 1 - o, 0, o], [0, 0, 1 - o, o]]


def _mix(m: list) -> list:
    return [[*row, 0] for row in m]


def compose(a: list, b: list) -> list:
    """A∘B: primero B, después A."""
    return [[
        row[0] * b[0][0] + row[1] * b[1][0] + row[2] * b[2][0],
        row[0] * b[0][1] + row[1] * b[1][1] + row[2] * b[2][1],
        row[0] * b[0][2] + row[1] * b[1][2] + row[2] * b[2][2],
        row[0] * b[0][3] + row[1] * b[1][3] + row[2] * b[2][3] + row[3],
    ] for row in a]


def _chain(*ops: list) -> list:
    m = _I
    for op in ops:
        m = compose(op, m)
    return m


FILTERS: tuple[dict, ...] = (
    {"id": "bw", "label": "Blanco y negro", "group": "bn", "matrix": _chain(_sat(0))},
    {"id": "noir", "label": "Noir", "group": "bn", "matrix": _chain(_sat(0), _contrast(1.5), _bright(0.9))},
    {"id": "sepia", "label": "Sepia", "group": "retro", "matrix": _chain(_sepia(1))},
    {"id": "vintage", "label": "Vintage", "group": "retro", "matrix": _chain(_sepia(0.45), _contrast(1.1), _sat(0.8))},
    {"id": "faded", "label": "Desvaído", "group": "retro", "matrix": _chain(_sat(0.8), _contrast(0.9), _lift(0.12))},
    {"id": "matte", "label": "Mate", "group": "retro", "matrix": _chain(_contrast(0.95), _lift(0.08))},
    {"id": "cinematic", "label": "Cine", "group": "cine", "matrix": _chain(_contrast(1.15), _sat(0.85), _bright(0.92))},
    {"id": "teal_orange", "label": "Naranja y turquesa", "group": "cine",
     "matrix": _chain(_mix([[1.12, -0.08, -0.04], [-0.04, 1.04, 0], [-0.14, 0.06, 1.08]]), _contrast(1.08))},
    {"id": "night", "label": "Noche", "group": "cine", "matrix": _chain(_tint(0.75, 0.85, 1.1), _bright(0.85), _sat(0.7))},
    {"id": "matrix", "label": "Verde Matrix", "group": "cine", "matrix": _chain(_tint(0.85, 1.1, 0.85), _contrast(1.1))},
    {"id": "contrast", "label": "Alto contraste", "group": "color", "matrix": _chain(_contrast(1.35), _sat(1.1))},
    {"id": "saturated", "label": "Vivo", "group": "color", "matrix": _chain(_sat(1.55), _contrast(1.08))},
    {"id": "warm", "label": "Cálido", "group": "color", "matrix": _chain(_tint(1.08, 1, 0.88), _sat(1.1))},
    {"id": "golden", "label": "Hora dorada", "group": "color", "matrix": _chain(_tint(1.12, 1, 0.8), _sat(1.2))},
    {"id": "cool", "label": "Frío", "group": "color", "matrix": _chain(_tint(0.9, 1, 1.1), _sat(0.9))},
)
FILTER_IDS = tuple(f["id"] for f in FILTERS)
_BY_ID = {f["id"]: f for f in FILTERS}


def _clamp01(v: Any) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 1.0
    return min(1.0, max(0.0, n))


def clip_filters(clip: Any) -> list[dict]:
    """Pila de filtros del clip ([{id, amount}]), con los ``look`` antiguos convertidos."""
    raw = clip.get("filters") if isinstance(clip, dict) else getattr(clip, "filters", None)
    if isinstance(raw, list):
        return [{"id": f["id"], "amount": _clamp01(f.get("amount", 1))}
                for f in raw if isinstance(f, dict) and f.get("id") in _BY_ID]
    look = clip.get("look") if isinstance(clip, dict) else getattr(clip, "look", None)
    return [{"id": look, "amount": 1.0}] if look and look != "none" and look in _BY_ID else []


def filter_matrix(fid: str, k: float = 1.0) -> list:
    m = _BY_ID.get(fid, {}).get("matrix") or _I
    a = _clamp01(k)
    return [[_I[r][c] + a * (m[r][c] - _I[r][c]) for c in range(4)] for r in range(3)]


def stack_matrix(filters: list) -> Optional[list]:
    m = None
    for f in filters or []:
        if not f.get("amount", 0) > 1e-4:
            continue
        fm = filter_matrix(f["id"], f["amount"])
        m = fm if m is None else compose(fm, m)
    return m


def filters_ffmpeg(clip: Any) -> str:
    """Filtro FFmpeg de la pila del clip ('' si no hay filtros)."""
    m = stack_matrix(clip_filters(clip))
    if m is None:
        return ""
    return matrix_ffmpeg(m)


# --- Capa de ajuste (#19) ----------------------------------------------------------

_ADJ_RANGE = {"brightness": (-0.5, 0.5), "contrast": (-0.5, 0.5), "saturation": (-1.0, 1.0)}


def _fx(e: dict, k: str) -> float:
    lo, hi = _ADJ_RANGE[k]
    try:
        n = float(e.get(k) or 0)
    except (TypeError, ValueError):
        return 0.0
    return min(hi, max(lo, n))


def adjustment_matrix(clip: Any) -> Optional[list]:
    """Matriz 3×4 de una capa de ajuste (None si no hace nada): pila de filtros,
    brillo/contraste/saturación (como los filtros CSS del preview), ajustes de color
    (``clip_adjust.color_matrix``) y la intensidad (``opacity``). Espejo de
    ``adjustmentMatrix`` en clipFilters.js."""
    from .clip_adjust import color_matrix

    e = (clip.get("effects") if isinstance(clip, dict) else getattr(clip, "effects", None)) or {}
    m = stack_matrix(clip_filters(clip)) or _I
    b, c, s = _fx(e, "brightness"), _fx(e, "contrast"), _fx(e, "saturation")
    if b:
        m = compose(_bright(1 + b), m)
    if c:
        m = compose(_contrast(1 + c), m)
    if s:
        m = compose(_sat(1 + s), m)
    adj = color_matrix(e)
    if adj is not None:
        m = compose(_mix(adj), m)
    op = clip.get("opacity") if isinstance(clip, dict) else getattr(clip, "opacity", None)
    k = 1.0 if op is None else _clamp01(op)
    out = [[_I[r][c2] + k * (m[r][c2] - _I[r][c2]) for c2 in range(4)] for r in range(3)]
    if all(abs(out[r][c2] - _I[r][c2]) < 1e-9 for r in range(3) for c2 in range(4)):
        return None
    return out


def matrix_ffmpeg(m: list) -> str:
    """``colorchannelmixer`` de una matriz 3×4.

    colorchannelmixer no tiene desplazamiento y recorta al final: el desplazamiento
    va en la columna del alfa (opaco = 1 en gbrap), así hay un solo recorte, como en
    el feColorMatrix del preview. Sumarlo después con lutrgb fallaba si la mezcla ya
    se había salido de 0–255 (Noir: blancos a 198 en vez de 255)."""
    names = (("rr", "rg", "rb", "ra"), ("gr", "gg", "gb", "ga"), ("br", "bg", "bb", "ba"))
    offs = any(abs(m[r][3]) > 1e-5 for r in range(3))
    coefs = ":".join(f"{names[r][c]}={m[r][c]:.5f}" for r in range(3) for c in range(4 if offs else 3))
    return ("format=gbrap," if offs else "") + "colorchannelmixer=" + coefs
