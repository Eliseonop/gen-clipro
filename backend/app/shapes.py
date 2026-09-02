"""Figuras vectoriales parametrizables: geometría + raster PNG para ffmpeg.

Espejo de ``frontend/src/lib/shapes.js``. El clip guarda parámetros; el preview
dibuja en canvas y el export rasteriza un PNG con alfa del tamaño de salida.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

SHAPE_DEFAULT_DUR = 5.0
STROKE_ONLY = {"line", "check", "x"}
ARROW_TYPES = {"arrow", "arrow_curve", "arrow_double"}


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
    return base


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
    }


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


def _qbez(p0, p1, p2, n=28):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _normals(pts):
    out = []
    last = len(pts) - 1
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(last, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1
        out.append((-dy / length, dx / length))
    return out


def _thick(pts, half):
    nrm = _normals(pts)
    left = [(p[0] + n[0] * half, p[1] + n[1] * half) for p, n in zip(pts, nrm)]
    right = [(p[0] - n[0] * half, p[1] - n[1] * half) for p, n in zip(pts, nrm)]
    return left + list(reversed(right))


def _neck_and_shaft(pts, head_len):
    tip = pts[-1]
    acc = 0.0
    for i in range(len(pts) - 1, 0, -1):
        a, b = pts[i - 1], pts[i]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if acc + d >= head_len:
            t = (head_len - acc) / (d or 1)
            neck = (b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t)
            return pts[:i] + [neck], neck, tip
        acc += d
    neck = pts[-2] if len(pts) > 1 else pts[0]
    return pts[:-1], neck, tip


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


def rasterize_shape(shape: Optional[dict], width: int, height: int) -> np.ndarray:
    """PNG RGBA del tamaño de salida, figura colocada y rotada."""
    st = normalize_shape(shape)
    w = max(2, int(width))
    h = max(2, int(height))
    scale = 2
    W, H = w * scale, h * scale
    bgr = np.zeros((H, W, 3), dtype=np.uint8)
    alpha = np.zeros((H, W), dtype=np.uint8)
    geo = shape_geometry(st["type"], st)
    cx, cy = st["x"] * W, st["y"] * H
    bw, bh = st["w"] * W, st["h"] * H
    rot = st["rotation"]
    fill_on = st["fill"] != "none"
    sw = max(1, int(round((st["strokeWidth"] or 0) * (H / 720))))
    fill_bgr = _bgr(st["fill"] if fill_on else "#000000")
    stroke_bgr = _bgr(st["stroke"])
    opacity = st["opacity"]

    def paint_fill(ring):
        pts = _to_np(ring, cx, cy, bw, bh, rot)
        if len(pts) < 3:
            return
        cv2.fillPoly(bgr, [pts], fill_bgr, lineType=cv2.LINE_AA)
        cv2.fillPoly(alpha, [pts], 255, lineType=cv2.LINE_AA)

    def paint_stroke(ring, closed=False):
        pts = _to_np(ring, cx, cy, bw, bh, rot)
        if len(pts) < 2:
            return
        cv2.polylines(bgr, [pts], closed, stroke_bgr, sw, lineType=cv2.LINE_AA)
        cv2.polylines(alpha, [pts], closed, 255, sw, lineType=cv2.LINE_AA)

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


def write_shape_png(shape: Optional[dict], width: int, height: int, path: Path) -> Path:
    path = Path(path)
    img = rasterize_shape(shape, width, height)
    cv2.imwrite(str(path), img)
    return path


def rasterize_timeline_shapes(timeline, tmp: Path, width: int, height: int) -> dict[str, Path]:
    out: dict[str, Path] = {}
    tmp = Path(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    for c in getattr(timeline, "clips", []) or []:
        if getattr(c, "kind", None) != "shape":
            continue
        dest = tmp / f"{c.id}.png"
        write_shape_png(getattr(c, "shape", None) or {}, width, height, dest)
        out[c.id] = dest
    return out
