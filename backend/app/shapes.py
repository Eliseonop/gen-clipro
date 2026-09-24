"""Figuras vectoriales parametrizables: geometría + raster PNG para ffmpeg.

Espejo de ``frontend/src/lib/shapes.js``. El clip guarda parámetros; el preview
dibuja en canvas y el export rasteriza un PNG con alfa del tamaño de salida.
"""
from __future__ import annotations

import bisect
import math
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

from .clip_layout import clip_flip

SHAPE_DEFAULT_DUR = 5.0
ARROW_TYPES = {"arrow", "arrow_curve", "arrow_double"}
# Estilo del trazo (#14); patrón en múltiplos del grosor (ver dashPattern en shapes.js).
DASH_STYLES = ("solid", "dash", "dot")
PATH_STEPS = 12


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _hex(v: Any, fallback: str) -> str:
    s = str(v or "").strip()
    if len(s) == 7 and s.startswith("#"):
        try:
            int(s[1:], 16)
            return s
        except ValueError:
            return fallback
    return fallback


def _bgr(hex_color: str) -> tuple[int, int, int]:
    s = _hex(hex_color, "#ffffff")
    r = int(s[1:3], 16)
    g = int(s[3:5], 16)
    b = int(s[5:7], 16)
    return b, g, r


def default_shape(type_: str | None) -> dict:
    t = type_ or "rect"
    base = {
        "type": t,
        "x": 0.5,
        "y": 0.42,
        "w": 0.38,
        "h": 0.16,
        "rotation": 0,
        "fill": "#e53935",
        "stroke": "#ffffff",
        "strokeWidth": 4,
        "opacity": 1,
        "cornerRadius": 0.12,
        "sides": 5 if t == "star" else 6,
        "arrowHead": "filled",
    }
    if t in ("square", "circle"):
        base["w"], base["h"] = 0.28, 0.16
    if t == "ellipse":
        base["w"], base["h"] = 0.4, 0.18
    if t == "line":
        base.update(w=0.42, h=0.06, fill="none", strokeWidth=6)
    if t in ("arrow", "arrow_double"):
        base["w"], base["h"] = 0.46, 0.14
    if t == "arrow_curve":
        base.update(w=0.42, h=0.28, y=0.38)
    if t == "triangle":
        base["w"], base["h"] = 0.3, 0.18
    if t in ("star", "polygon"):
        base["w"], base["h"] = 0.3, 0.17
    if t == "speech":
        base.update(w=0.42, h=0.22, y=0.4)
    if t in ("check", "x"):
        base.update(w=0.2, h=0.12, fill="none", strokeWidth=8, stroke="#22c55e")
    if t == "x":
        base["stroke"] = "#ef4444"
    if t == "marker":
        base.update(w=0.18, h=0.2, y=0.4)
    if t == "heart":
        base.update(w=0.26, h=0.16, fill="#e11d48")
    if t == "path":
        base.update(w=0.42, h=0.2, fill="none", strokeWidth=6,
                    points=[[0, 100], [50, 0], [100, 100]], closed=False, smooth=True)
    if t == "letterbox":
        base.update(x=0.5, y=0.5, w=1, h=1, fill="#000000", stroke="#000000", strokeWidth=0, bar=0.12)
    return base


# Barras de cine (#20). Espejo de CINEMA_RATIOS / cinemaBar en shapes.js.
CINEMA_RATIOS = {"2.39": 2.39, "2": 2.0, "1.85": 1.85, "16:9": 16 / 9}
BAR_MAX = 0.45


def cinema_bar(out_aspect: float, ratio: float) -> float:
    """Alto de cada barra para que lo visible tenga la proporción ``ratio``."""
    return round(_clamp((1 - out_aspect / ratio) / 2, 0, BAR_MAX), 4)


def normalize_shape(raw: Optional[dict]) -> dict:
    raw = raw or {}
    t = raw.get("type") or "rect"
    d = default_shape(t)
    fill = "none" if raw.get("fill") == "none" else _hex(raw.get("fill"), d["fill"])
    head = raw.get("arrowHead")
    if head not in ("line", "none", "filled"):
        head = "filled"
    return {
        **d,
        **raw,
        "type": t,
        "x": _clamp(float(raw.get("x", d["x"])), 0, 1),
        "y": _clamp(float(raw.get("y", d["y"])), 0, 1),
        "w": _clamp(float(raw.get("w", d["w"])), 0.04, 1),
        "h": _clamp(float(raw.get("h", d["h"])), 0.03, 1),
        "rotation": float(raw.get("rotation", d["rotation"]) or 0),
        "fill": fill,
        "stroke": _hex(raw.get("stroke"), d["stroke"]),
        "strokeWidth": _clamp(float(raw.get("strokeWidth", d["strokeWidth"])), 0, 24),
        "opacity": _clamp(float(raw.get("opacity", d["opacity"])), 0, 1),
        "cornerRadius": _clamp(float(raw.get("cornerRadius", d["cornerRadius"])), 0, 0.5),
        "sides": int(_clamp(round(float(raw.get("sides", d["sides"]) or d["sides"])), 3, 12)),
        "arrowHead": head,
        "dash": raw.get("dash") if raw.get("dash") in DASH_STYLES else "solid",
        "draw": _clamp(float(raw.get("draw", 1) if raw.get("draw") is not None else 1), 0, 1),
        **({"bar": _clamp(float(raw.get("bar", d.get("bar")) or 0), 0, 0.5)} if t == "letterbox" else {}),
        **({
            "points": [[x, y] for x, y in path_anchors(raw.get("points", d.get("points")))],
            "closed": bool(raw.get("closed", d.get("closed"))),
            "smooth": raw.get("smooth") is not False,
        } if t == "path" else {}),
    }


def dash_pattern(dash: Optional[str], lw: float) -> Optional[tuple[float, float]]:
    if dash == "dash":
        return (2 * lw, 2 * lw)
    if dash == "dot":
        return (0.0, 2 * lw)
    return None


# --- Trazado con pluma (#14) -------------------------------------------------

def path_anchors(points: Any) -> list[tuple[float, float]]:
    out = []
    for p in points if isinstance(points, (list, tuple)) else []:
        try:
            x, y = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError):
            continue
        if x == x and y == y and abs(x) != math.inf and abs(y) != math.inf:
            out.append((x, y))
    return out


def _catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t

    def c(a, b, cc, d):
        return 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2
                      + (-a + 3 * b - 3 * cc + d) * t3)
    return (c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]))


def path_points(points: Any, closed: bool = False, smooth: bool = True) -> list[tuple[float, float]]:
    """Polilínea (o anillo si ``closed``) del trazado: Catmull-Rom por las anclas.
    Espejo de ``pathPoints`` en lib/shapes.js."""
    pts = path_anchors(points)
    n = len(pts)
    if n < 2 or not smooth or n == 2:
        return pts

    def at(i):
        return pts[(i + n) % n] if closed else pts[max(0, min(n - 1, i))]

    out = []
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        for k in range(PATH_STEPS):
            out.append(_catmull(p0, p1, p2, p3, k / PATH_STEPS))
    if not closed:
        out.append(pts[-1])
    return out


def path_shape(frame_points: Any, **opts) -> dict:
    """Figura ``path`` desde puntos en 0–1 del cuadro (caja = la de los puntos).
    Espejo de ``pathShape``."""
    pts = path_anchors(frame_points)
    if len(pts) < 2:
        raise ValueError("un trazado necesita al menos 2 puntos [x, y] en 0–1")
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = _clamp(x1 - x0, 0.04, 1), _clamp(y1 - y0, 0.03, 1)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return {
        **default_shape("path"), **opts, "type": "path",
        "x": round(cx, 4), "y": round(cy, 4), "w": round(w, 4), "h": round(h, 4), "rotation": 0,
        "points": [[round(50 + (x - cx) / w * 100, 3), round(50 + (y - cy) / h * 100, 3)] for x, y in pts],
    }


def trim_polyline(pts: list, frac: float) -> list:
    """Primer tramo de la polilínea (en px) que cubre la fracción ``frac`` de su largo."""
    if frac >= 1 or len(pts) < 2:
        return list(pts)
    if frac <= 0:
        return []
    total = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
    left = total * frac
    out = [pts[0]]
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d >= left:
            u = left / d if d > 0 else 0
            out.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
            return out
        left -= d
        out.append(b)
    return out


def dash_runs(pts: list, pattern: tuple[float, float]) -> tuple[list[list], list[tuple[float, float]]]:
    """Trocea la polilínea (px) según el patrón ``(on, off)``, empezando por un tramo
    «on» como ``setLineDash`` del canvas. Devuelve (tramos, centros de punto): con
    ``on`` = 0 cada tramo es un punto redondo."""
    on, off = pattern
    period = on + off
    if period <= 0 or len(pts) < 2:
        return [list(pts)], []
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = cum[-1]

    def point_at(s: float) -> tuple[float, float]:
        i = max(1, min(len(pts) - 1, bisect.bisect_left(cum, s)))
        a, b, d = pts[i - 1], pts[i], cum[i] - cum[i - 1]
        u = (s - cum[i - 1]) / d if d > 0 else 0.0
        return (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)

    runs: list[list] = []
    dots: list[tuple[float, float]] = []
    k = 0
    while k * period <= total + 1e-9:
        s0 = k * period
        s1 = min(total, s0 + on)
        k += 1
        if on <= 1e-9:
            dots.append(point_at(s0))
            continue
        run = [point_at(s0)]
        run += [pts[i] for i in range(len(pts)) if s0 < cum[i] < s1]
        run.append(point_at(s1))
        if s1 > s0:
            runs.append(run)
    return runs, dots


def _ellipse_pts(cx, cy, rx, ry, n=64):
    return [
        (cx + math.cos(i / n * math.pi * 2) * rx, cy + math.sin(i / n * math.pi * 2) * ry)
        for i in range(n)
    ]


def _round_rect(x, y, w, h, r, n=6):
    rr = _clamp(r, 0, min(w, h) / 2)
    if rr < 0.4:
        return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    pts = []
    corners = [
        (x + w - rr, y + rr, -math.pi / 2, 0),
        (x + w - rr, y + h - rr, 0, math.pi / 2),
        (x + rr, y + h - rr, math.pi / 2, math.pi),
        (x + rr, y + rr, math.pi, math.pi * 1.5),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(n + 1):
            a = a0 + (a1 - a0) * (i / n)
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return pts


def _star_pts(cx, cy, r_outer, r_inner, spikes):
    n = max(3, int(round(spikes)))
    pts = []
    for i in range(n * 2):
        a = -math.pi / 2 + (i * math.pi) / n
        r = r_outer if i % 2 == 0 else r_inner
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def _poly_pts(cx, cy, r, sides):
    n = max(3, int(round(sides)))
    return [
        (cx + math.cos(-math.pi / 2 + i * 2 * math.pi / n) * r,
         cy + math.sin(-math.pi / 2 + i * 2 * math.pi / n) * r)
        for i in range(n)
    ]


def _curved_arrow_poly():
    cx, cy, r = 66.0, 84.0, 50.0
    half = 5.0
    head_len = 26.0
    head_half = 14.0
    a0 = math.pi
    a_neck = math.pi * 1.5
    n_shaft = 44
    left, right = [], []
    for i in range(n_shaft):
        a = a0 + (a_neck - a0) * (i / n_shaft)
        c, s = math.cos(a), math.sin(a)
        left.append((cx + c * (r + half), cy + s * (r + half)))
        right.append((cx + c * (r - half), cy + s * (r - half)))
    neck = (cx, cy - r)
    neck_l = (neck[0], neck[1] - half)
    neck_r = (neck[0], neck[1] + half)
    wing_l = (neck[0], neck[1] - head_half)
    wing_r = (neck[0], neck[1] + head_half)
    tip = (neck[0] + head_len, neck[1])
    return left + [neck_l, wing_l, tip, wing_r, neck_r] + list(reversed(right))


def _heart_pts():
    raw = []
    for i in range(64):
        t = i / 64 * math.pi * 2
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        raw.append((x, -y))
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    sx = 76 / (max_x - min_x or 1)
    sy = 76 / (max_y - min_y or 1)
    return [(12 + (x - min_x) * sx, 12 + (y - min_y) * sy) for x, y in raw]


def shape_geometry(type_: str, opts: Optional[dict] = None) -> dict:
    opts = opts or {}
    t = type_ or "rect"
    radius = _clamp(float(opts.get("cornerRadius") or 0), 0, 0.5) * 50
    sides = int(_clamp(round(float(opts.get("sides") or 6)), 3, 12))
    fills: list[list[tuple[float, float]]] = []
    strokes: list[list[tuple[float, float]]] = []

    if t in ("square", "rect"):
        pad = 12 if t == "square" else 8
        x = pad
        y = 12 if t == "square" else 22
        w = 100 - pad * 2
        h = 76 if t == "square" else 56
        fills.append(_round_rect(x, y, w, h, radius))
    elif t == "circle":
        fills.append(_ellipse_pts(50, 50, 40, 40))
    elif t == "ellipse":
        fills.append(_ellipse_pts(50, 50, 44, 28))
    elif t == "line":
        strokes.append([(8, 50), (92, 50)])
    elif t == "arrow":
        fills.append([(8, 38), (58, 38), (58, 20), (94, 50), (58, 80), (58, 62), (8, 62)])
    elif t == "arrow_double":
        fills.append([
            (6, 50), (24, 22), (24, 38), (76, 38), (76, 22), (94, 50),
            (76, 78), (76, 62), (24, 62), (24, 78),
        ])
    elif t == "arrow_curve":
        fills.append(_curved_arrow_poly())
    elif t == "triangle":
        fills.append([(50, 10), (92, 88), (8, 88)])
    elif t == "star":
        fills.append(_star_pts(50, 52, 40, 16, sides))
    elif t == "polygon":
        fills.append(_poly_pts(50, 52, 40, sides))
    elif t == "speech":
        fills.append(_round_rect(8, 8, 84, 62, max(8, radius)))
        fills.append([(36, 68), (22, 94), (54, 68)])
    elif t == "check":
        strokes.append([(18, 52), (40, 74), (84, 26)])
    elif t == "x":
        strokes.append([(22, 22), (78, 78)])
        strokes.append([(78, 22), (22, 78)])
    elif t == "marker":
        fills.append([(50, 94), (24, 40), (76, 40)])
        fills.append(_ellipse_pts(50, 34, 16, 16))
    elif t == "heart":
        fills.append(_heart_pts())
    elif t == "letterbox":
        b = _clamp(float(opts.get("bar", 0.12) or 0), 0, 0.5) * 100
        if b > 0:
            fills.append([(-1, -1), (101, -1), (101, b), (-1, b)])
            fills.append([(-1, 100 - b), (101, 100 - b), (101, 101), (-1, 101)])
    elif t == "path":
        line = path_points(opts.get("points"), bool(opts.get("closed")), opts.get("smooth") is not False)
        if opts.get("closed") and len(line) >= 3:
            fills.append(line)
        elif len(line) >= 2:
            strokes.append(line)
    else:
        fills.append(_round_rect(8, 22, 84, 56, radius))

    head = opts.get("arrowHead")
    if t in ARROW_TYPES and head == "line":
        return {"fills": [], "strokes": [ring + [ring[0]] for ring in fills]}
    if t in ARROW_TYPES and head == "none":
        return {"fills": [], "strokes": fills}
    return {"fills": fills, "strokes": strokes}


def _map_pt(pt, cx, cy, bw, bh, rot_deg):
    rad = math.radians(rot_deg or 0)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    lx = (pt[0] / 100 - 0.5) * bw
    ly = (pt[1] / 100 - 0.5) * bh
    return (cx + lx * cos_a - ly * sin_a, cy + lx * sin_a + ly * cos_a)


def _to_np(ring, cx, cy, bw, bh, rot) -> np.ndarray:
    mapped = [_map_pt(p, cx, cy, bw, bh, rot) for p in ring]
    return np.array([[int(round(x)), int(round(y))] for x, y in mapped], dtype=np.int32)


def flip_geometry(geo: dict, flip: tuple[bool, bool] = (False, False)) -> dict:
    """Voltear (#7): refleja la geometría (0–100) en los ejes de la figura, antes de
    colocarla y girarla. Espejo de ``flipGeometry`` en lib/shapes.js."""
    fh, fv = flip
    if not (fh or fv):
        return geo

    def f(pt):
        return (100 - pt[0] if fh else pt[0], 100 - pt[1] if fv else pt[1])

    return {"fills": [[f(p) for p in ring] for ring in geo["fills"]],
            "strokes": [[f(p) for p in line] for line in geo["strokes"]]}


def rasterize_shape(shape: Optional[dict], width: int, height: int,
                    pose: Optional[dict] = None,
                    flip: tuple[bool, bool] = (False, False),
                    draw: Optional[float] = None) -> np.ndarray:
    """PNG RGBA del tamaño de salida, figura colocada y rotada.

    ``pose`` (x, y, scale, rotation, opacity) sustituye a la del estilo, como
    ``applyShapePose`` en el preview: la escala multiplica ancho y alto.
    ``flip`` = (horizontal, vertical) del clip (``clip_layout.clip_flip``).
    ``draw`` (0–1, #14) es cuánto de cada trazo está dibujado (por defecto el
    ``draw`` de la figura); el relleno aparece con esa misma fracción."""
    st = normalize_shape(shape)
    w = max(2, int(width))
    h = max(2, int(height))
    scale = 2
    W, H = w * scale, h * scale
    bgr = np.zeros((H, W, 3), dtype=np.uint8)
    alpha = np.zeros((H, W), dtype=np.uint8)
    # Barras de cine (#20): `draw` es cuánto han entrado las barras, no un trazo.
    drawn = _clamp(float(st["draw"] if draw is None else draw), 0, 1)
    if st["type"] == "letterbox":
        st = {**st, "bar": st["bar"] * drawn}
        draw = 1.0
    geo = flip_geometry(shape_geometry(st["type"], st), flip)
    p = pose or {}
    k = max(0.0, float(p.get("scale", 1.0)))
    cx, cy = float(p.get("x", st["x"])) * W, float(p.get("y", st["y"])) * H
    bw, bh = st["w"] * W * k, st["h"] * H * k
    rot = float(p.get("rotation", st["rotation"]))
    fill_on = st["fill"] != "none"
    sw = max(1, int(round((st["strokeWidth"] or 0) * (H / 720))))
    fill_bgr = _bgr(st["fill"] if fill_on else "#000000")
    stroke_bgr = _bgr(st["stroke"])
    opacity = _clamp(float(p.get("opacity", st["opacity"])), 0, 1)
    frac = _clamp(float(st["draw"] if draw is None else draw), 0, 1)
    pattern = dash_pattern(st["dash"], max(1.0, (st["strokeWidth"] or 0) * (H / 720)))

    def paint_fill(ring):
        pts = _to_np(ring, cx, cy, bw, bh, rot)
        if len(pts) < 3 or frac <= 0:
            return
        if frac >= 1:
            cv2.fillPoly(bgr, [pts], fill_bgr, lineType=cv2.LINE_AA)
            cv2.fillPoly(alpha, [pts], 255, lineType=cv2.LINE_AA)
            return
        # Relleno a medio aparecer: la misma mezcla que hace fillPoly con su
        # cobertura, con la cobertura multiplicada por la fracción dibujada.
        cov = np.zeros((H, W), dtype=np.uint8)
        cv2.fillPoly(cov, [pts], 255, lineType=cv2.LINE_AA)
        a = cov.astype(np.float32) * (frac / 255.0)
        bgr[:] = (bgr * (1 - a[..., None]) + np.array(fill_bgr, np.float32) * a[..., None] + 0.5).astype(np.uint8)
        alpha[:] = (alpha + (255.0 - alpha) * a + 0.5).clip(0, 255).astype(np.uint8)

    def paint_stroke(ring, closed=False):
        if frac >= 1 and pattern is None:
            pts = _to_np(ring, cx, cy, bw, bh, rot)
            if len(pts) < 2:
                return
            cv2.polylines(bgr, [pts], closed, stroke_bgr, sw, lineType=cv2.LINE_AA)
            cv2.polylines(alpha, [pts], closed, 255, sw, lineType=cv2.LINE_AA)
            return
        mapped = [_map_pt(pt, cx, cy, bw, bh, rot) for pt in ring]
        if closed and mapped:
            mapped.append(mapped[0])
        mapped = trim_polyline(mapped, frac)
        if len(mapped) < 2:
            return
        runs, dots = dash_runs(mapped, pattern) if pattern else ([mapped], [])
        arrs = [np.array([[int(round(x)), int(round(y))] for x, y in r], dtype=np.int32) for r in runs]
        if arrs:
            cv2.polylines(bgr, arrs, False, stroke_bgr, sw, lineType=cv2.LINE_AA)
            cv2.polylines(alpha, arrs, False, 255, sw, lineType=cv2.LINE_AA)
        rad = max(1, int(round(sw / 2)))
        for x, y in dots:
            c = (int(round(x)), int(round(y)))
            cv2.circle(bgr, c, rad, stroke_bgr, -1, lineType=cv2.LINE_AA)
            cv2.circle(alpha, c, rad, 255, -1, lineType=cv2.LINE_AA)

    if fill_on:
        for ring in geo["fills"]:
            if st["strokeWidth"] > 0:
                paint_stroke(ring, True)
            paint_fill(ring)
    else:
        for ring in geo["fills"]:
            paint_stroke(ring, True)
    for line in geo["strokes"]:
        paint_stroke(line, False)

    if opacity < 0.999:
        alpha = (alpha.astype(np.float32) * opacity).clip(0, 255).astype(np.uint8)

    rgba = np.dstack((bgr, alpha))
    if scale != 1:
        rgba = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA)
    return rgba


def write_shape_png(shape: Optional[dict], width: int, height: int, path: Path,
                    pose: Optional[dict] = None,
                    flip: tuple[bool, bool] = (False, False),
                    draw: Optional[float] = None) -> Path:
    path = Path(path)
    img = rasterize_shape(shape, width, height, pose, flip, draw)
    cv2.imwrite(str(path), img)
    return path


def shape_draw_at(clip, t: float) -> float:
    """Cuánto del trazo está dibujado (0–1) en el instante local ``t``. Espejo de
    ``shapeDrawAt`` en lib/shapes.js."""
    from .clip_keyframes import clip_props_at, keyframes_enabled

    if keyframes_enabled(clip):
        return _clamp(float(clip_props_at(clip, t)["draw"]), 0, 1)
    shape = clip.get("shape") if isinstance(clip, dict) else getattr(clip, "shape", None)
    return normalize_shape(shape)["draw"]


# Figura con keyframes: se rasteriza NEUTRA (centrada, sin giro, opaca, escala 1)
# y compose le aplica la pose animada encima (``_fill_pose_filter``).
NEUTRAL_POSE = {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0, "opacity": 1.0}


def export_pose(clip) -> dict:
    """Pose con la que se rasteriza una figura para el export.

    Sin keyframes la pose estática (posición, escala, giro, opacidad) va
    horneada en el PNG, igual que la pinta el preview. Con keyframes el PNG es
    neutro: si llevara también la pose, compose la aplicaría dos veces (la
    figura salía desplazada, girada y con la opacidad multiplicada)."""
    from .clip_keyframes import keyframes_enabled, static_props

    if keyframes_enabled(clip):
        return dict(NEUTRAL_POSE)
    p = static_props(clip)
    return {k: p[k] for k in NEUTRAL_POSE}


def rasterize_timeline_shapes(timeline, tmp: Path, width: int, height: int) -> dict[str, Path]:
    out: dict[str, Path] = {}
    tmp = Path(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    fps = max(1, int(getattr(timeline, "fps", 30) or 30))
    for c in getattr(timeline, "clips", []) or []:
        if getattr(c, "kind", None) != "shape" or getattr(c, "disabled", False):
            continue
        shape = getattr(c, "shape", None) or {}
        pose, flip = export_pose(c), clip_flip(c)
        # «Dibujar trazo» animado (#14): el trazo cambia en cada fotograma → una
        # secuencia PNG (tiempo local del clip, a los fps del proyecto) en lugar de
        # un PNG fijo. La pose sigue aplicándose en compose como siempre.
        dur = max(0.1, float(c.out_point or 0) - float(c.in_point or 0))
        n = int(math.ceil(dur * fps)) + 2
        draws = [round(shape_draw_at(c, k / fps), 4) for k in range(n)]
        if max(draws) - min(draws) <= 1e-4:
            dest = tmp / f"{c.id}.png"
            write_shape_png(shape, width, height, dest, pose, flip, draws[0])
            out[c.id] = dest
            continue
        cache: dict[float, bytes] = {}
        for k, d in enumerate(draws):
            if d not in cache:
                _ok, buf = cv2.imencode(".png", rasterize_shape(shape, width, height, pose, flip, d))
                cache[d] = buf.tobytes()
            (tmp / f"{c.id}_{k:05d}.png").write_bytes(cache[d])
        out[c.id] = tmp / f"{c.id}_%05d.png"
    return out


def is_frame_sequence(path) -> bool:
    """¿Es un patrón de secuencia PNG (``…_%05d.png``) en vez de un archivo?"""
    return "%0" in str(path)


def media_exists(path) -> bool:
    """Existe el archivo, o su primer fotograma si es una secuencia PNG."""
    if path is None:
        return False
    if is_frame_sequence(path):
        return Path(str(path) % 0).exists()
    return Path(path).exists()
