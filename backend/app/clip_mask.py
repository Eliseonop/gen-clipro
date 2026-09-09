"""Máscaras de clip: modelo, rasterizado del alfa y máscaras por fotograma.

Espejo de ``frontend/src/lib/clipMask.js``. El preview recorta el alfa de la
capa del clip con ``destination-in``; el export hace lo mismo con
``maskedmerge`` usando el PNG (gris) que genera este módulo. Ambos parten de la
MISMA geometría normalizada, así que el resultado coincide.

Coordenadas (independientes de la resolución):
  x, y      → centro, fracción del ancho/alto de salida.
  w, h      → tamaño en unidades de ALTO de salida (el círculo sigue redondo
              en 9:16, 16:9 o 1:1).
  feather   → radio de difuminado, también en unidades de alto.
  rotation  → grados (sentido horario, como el canvas).

Para añadir un tipo nuevo: entrada en ``MASK_SHAPES`` + mismo id en el JS.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Callable, Optional

import cv2
import numpy as np

MASK_TYPE_IDS = ("linear", "circle", "rectangle", "star", "heart", "text", "brush")
MASK_FEATHER_MAX = 0.25
MASK_KIND_OK = frozenset({"video", "image", "shape"})

# Claves animables de la máscara dentro de los keyframes del clip (solo masks[0]).
MASK_KF_KEYS = ("mx", "my", "mw", "mh", "msx", "msy", "mrot", "mfeather")
MASK_KF_DEFAULTS = {
    "mx": 0.5, "my": 0.5, "mw": 0.5, "mh": 0.5,
    "msx": 1.0, "msy": 1.0, "mrot": 0.0, "mfeather": 0.0,
}
# Keyframe prop → campo de la máscara.
_KF_TO_FIELD = {
    "mx": "x", "my": "y", "mw": "w", "mh": "h",
    "msx": "scale_x", "msy": "scale_y", "mrot": "rotation", "mfeather": "feather",
}


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n:
        return default
    return n


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _get(clip: Any, key: str, default: Any = None) -> Any:
    if isinstance(clip, dict):
        return clip.get(key, default)
    return getattr(clip, key, default)


def normalize_mask(raw: Optional[dict]) -> dict:
    m = raw if isinstance(raw, dict) else {}
    type_ = m.get("type") if m.get("type") in MASK_TYPE_IDS else "circle"
    out = {
        "id": m.get("id") or "m0",
        "type": type_,
        "enabled": m.get("enabled") is not False,
        "x": _num(m.get("x"), 0.5),
        "y": _num(m.get("y"), 0.5),
        "w": _clamp(_num(m.get("w"), 0.5), 0.01, 8.0),
        "h": _clamp(_num(m.get("h"), 0.5), 0.01, 8.0),
        "scale_x": _clamp(_num(m.get("scale_x"), 1.0), 0.02, 12.0),
        "scale_y": _clamp(_num(m.get("scale_y"), 1.0), 0.02, 12.0),
        "rotation": _num(m.get("rotation"), 0.0),
        "feather": _clamp(_num(m.get("feather"), 0.0), 0.0, MASK_FEATHER_MAX),
        "invert": bool(m.get("invert")),
        "opacity": _clamp(_num(m.get("opacity"), 1.0), 0.0, 1.0),
        "radius": _clamp(_num(m.get("radius"), 0.0), 0.0, 0.5),
    }
    if type_ == "text":
        t = m.get("text") if isinstance(m.get("text"), dict) else {}
        align = t.get("align") if t.get("align") in ("left", "center", "right") else "center"
        out["text"] = {
            "content": t.get("content") if isinstance(t.get("content"), str) else "TEXTO",
            "font": t.get("font") or "Anton",
            "size": _clamp(_num(t.get("size"), 0.22), 0.02, 1.5),
            "weight": _clamp(_num(t.get("weight"), 700), 100, 900),
            "align": align,
        }
    if type_ == "brush":
        b = m.get("brush") if isinstance(m.get("brush"), dict) else {}
        pts = []
        for p in (b.get("points") or []):
            if not isinstance(p, dict):
                continue
            x, y = _num(p.get("x"), float("nan")), _num(p.get("y"), float("nan"))
            if x != x or y != y:
                continue
            pt = {"x": x, "y": y}
            if p.get("m"):
                pt["m"] = 1
            pts.append(pt)
        out["brush"] = {"size": _clamp(_num(b.get("size"), 0.12), 0.005, 1.0), "points": pts}
    return out


def clip_masks(clip: Any) -> list[dict]:
    raw = _get(clip, "masks")
    if not isinstance(raw, list) or not raw:
        return []
    return [normalize_mask(m) for m in raw if isinstance(m, dict)]


def maskable(clip: Any) -> bool:
    return _get(clip, "kind") in MASK_KIND_OK


def has_mask(clip: Any) -> bool:
    return any(m["enabled"] for m in clip_masks(clip))


def mask_static_props(clip: Any) -> dict:
    masks = clip_masks(clip)
    if not masks:
        return dict(MASK_KF_DEFAULTS)
    m = masks[0]
    return {key: float(m[field]) for key, field in _KF_TO_FIELD.items()}


def mask_from_props(mask: dict, props: Optional[dict]) -> dict:
    if not props:
        return mask
    patched = dict(mask)
    for key, field in _KF_TO_FIELD.items():
        if props.get(key) is not None:
            patched[field] = _num(props.get(key), mask[field])
    return normalize_mask(patched)


def clip_masks_at(clip: Any, local_t: float) -> list[dict]:
    """Máscaras del clip en ``local_t``: la primera con sus keyframes aplicados."""
    masks = [m for m in clip_masks(clip) if m["enabled"]]
    if not masks:
        return []
    from .clip_keyframes import clip_props_at, keyframes_enabled

    if not keyframes_enabled(clip):
        return masks
    props = clip_props_at(clip, local_t)
    return [mask_from_props(masks[0], props), *masks[1:]]


def mask_animates(clip: Any, duration: float, eps: float = 1e-3) -> bool:
    """True si algún parámetro animable de la máscara cambia a lo largo del clip."""
    from .clip_keyframes import clip_props_at, keyframes_enabled

    if not has_mask(clip) or not keyframes_enabled(clip):
        return False
    kf = _get(clip, "keyframes")
    items = kf.get("items") if isinstance(kf, dict) else None
    if not items:
        return False
    times = {0.0, max(0.0, float(duration))}
    for it in items:
        if isinstance(it, dict):
            times.add(_clamp(_num(it.get("t"), 0.0), 0.0, max(0.0, float(duration))))
    samples = [clip_props_at(clip, t) for t in sorted(times)]
    for key in MASK_KF_KEYS:
        vals = [_num(s.get(key), MASK_KF_DEFAULTS[key]) for s in samples]
        if max(vals) - min(vals) > eps:
            return True
    return False


# --- Geometría / rasterizado ------------------------------------------------

def mask_geometry(mask: dict, width: int, height: int) -> dict:
    ref = float(height)
    return {
        "cx": mask["x"] * width,
        "cy": mask["y"] * height,
        "hw": max(0.5, mask["w"] * mask["scale_x"] * ref / 2.0),
        "hh": max(0.5, mask["h"] * mask["scale_y"] * ref / 2.0),
        "rot": math.radians(mask["rotation"] or 0.0),
        "ref": ref,
        "feather": mask["feather"] * ref,
    }


def _to_canvas(points, g) -> np.ndarray:
    """Puntos locales (px, centrados en 0) → píxeles del lienzo, con rotación."""
    c, s = math.cos(g["rot"]), math.sin(g["rot"])
    out = [(g["cx"] + x * c - y * s, g["cy"] + x * s + y * c) for x, y in points]
    return np.array([[int(round(x)), int(round(y))] for x, y in out], dtype=np.int32)


def _rect_points(mask: dict, g) -> list[tuple[float, float]]:
    hw, hh = g["hw"], g["hh"]
    r = min(mask["radius"] * min(hw, hh) * 2.0, min(hw, hh))
    if r < 0.5:
        return [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    pts: list[tuple[float, float]] = []
    corners = [
        (hw - r, -hh + r, -math.pi / 2, 0.0),
        (hw - r, hh - r, 0.0, math.pi / 2),
        (-hw + r, hh - r, math.pi / 2, math.pi),
        (-hw + r, -hh + r, math.pi, math.pi * 1.5),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(9):
            a = a0 + (a1 - a0) * (i / 8.0)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def _linear_points(mask: dict, g) -> list[tuple[float, float]]:
    big = max(g["hw"], g["hh"]) * 4.0 + g["ref"] * 4.0
    return [(-big, -big), (big, -big), (big, 0.0), (-big, 0.0)]


def star_points(hw: float, hh: float, spikes: int = 5, inner: float = 0.42):
    n = max(3, int(round(spikes)))
    pts = []
    for i in range(n * 2):
        a = -math.pi / 2 + (i * math.pi) / n
        r = 1.0 if i % 2 == 0 else inner
        pts.append((math.cos(a) * hw * r, math.sin(a) * hh * r))
    return pts


def heart_points(hw: float, hh: float, n: int = 96):
    raw = []
    for i in range(n):
        t = (i / n) * math.pi * 2
        raw.append((
            16 * math.sin(t) ** 3,
            -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)),
        ))
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return [
        (((x - min_x) / (max_x - min_x) * 2 - 1) * hw,
         ((y - min_y) / (max_y - min_y) * 2 - 1) * hh)
        for x, y in raw
    ]


def _star_points(mask: dict, g):
    return star_points(g["hw"], g["hh"])


def _heart_points(mask: dict, g):
    return heart_points(g["hw"], g["hh"])


# Registro tipo → polígono local. Punto de extensión para tipos futuros.
MASK_SHAPES: dict[str, Callable[[dict, dict], list]] = {
    "linear": _linear_points,
    "rectangle": _rect_points,
    "star": _star_points,
    "heart": _heart_points,
}


def _paint_text(img: np.ndarray, mask: dict, g) -> None:
    from .compose import resolve_font_path

    t = mask.get("text") or {}
    size = max(2, int(round(_num(t.get("size"), 0.22) * g["ref"])))
    lines = str(t.get("content") or "").split("\n")
    align = t.get("align") or "center"
    bold = _num(t.get("weight"), 700) >= 600
    try:
        from PIL import Image, ImageDraw, ImageFont

        font = ImageFont.truetype(str(resolve_font_path(t.get("font") or "Anton", bold)), size)
        pil = Image.fromarray(img, mode="L")
        draw = ImageDraw.Draw(pil)
        lh = size * 1.12
        y0 = g["cy"] - (len(lines) - 1) * lh / 2.0
        ax = g["cx"] + (-g["hw"] if align == "left" else (g["hw"] if align == "right" else 0.0))
        anchor = {"left": "lm", "center": "mm", "right": "rm"}[align]
        for i, line in enumerate(lines):
            draw.text((ax, y0 + i * lh), line, fill=255, font=font, anchor=anchor)
        img[:, :] = np.asarray(pil)
    except Exception:  # noqa: BLE001 - sin Pillow/TTF: tipografía de respaldo
        scale = size / 30.0
        thick = max(1, int(round(size / 12.0)))
        lh = size * 1.12
        y0 = g["cy"] - (len(lines) - 1) * lh / 2.0
        for i, line in enumerate(lines):
            (tw, th), _ = cv2.getTextSize(line, cv2.FONT_HERSHEY_DUPLEX, scale, thick)
            ax = g["cx"] - tw / 2.0
            if align == "left":
                ax = g["cx"] - g["hw"]
            elif align == "right":
                ax = g["cx"] + g["hw"] - tw
            cv2.putText(img, line, (int(ax), int(y0 + i * lh + th / 2)),
                        cv2.FONT_HERSHEY_DUPLEX, scale, 255, thick, cv2.LINE_AA)
    if abs(mask["rotation"]) > 0.01:
        rot = cv2.getRotationMatrix2D((g["cx"], g["cy"]), -mask["rotation"], 1.0)
        img[:, :] = cv2.warpAffine(img, rot, (img.shape[1], img.shape[0]),
                                   flags=cv2.INTER_LINEAR, borderValue=0)


def _paint_brush(img: np.ndarray, mask: dict, g) -> None:
    brush = mask.get("brush") or {}
    pts = brush.get("points") or []
    if not pts:
        return
    sx, sy = mask["scale_x"], mask["scale_y"]
    thick = max(1, int(round(_num(brush.get("size"), 0.12) * g["ref"] * (sx + sy) / 2.0)))
    stroke: list[tuple[float, float]] = []
    strokes: list[list[tuple[float, float]]] = []
    for p in pts:
        if p.get("m") and stroke:
            strokes.append(stroke)
            stroke = []
        stroke.append((p["x"] * g["ref"] * sx, p["y"] * g["ref"] * sy))
    if stroke:
        strokes.append(stroke)
    for s in strokes:
        arr = _to_canvas(s, g)
        if len(arr) == 1:
            cv2.circle(img, (int(arr[0][0]), int(arr[0][1])), max(1, thick // 2), 255, -1,
                       lineType=cv2.LINE_AA)
        else:
            cv2.polylines(img, [arr], False, 255, thick, lineType=cv2.LINE_AA)


def _feather(alpha: np.ndarray, sigma: float) -> np.ndarray:
    """Desenfoque gaussiano equivalente a ``filter: blur(Npx)`` del canvas."""
    if sigma <= 0.3:
        return alpha
    h, w = alpha.shape
    # Sigma grande: difuminar a resolución reducida (mismo resultado, mucho más rápido).
    step = max(1, int(sigma // 16))
    if step > 1:
        small = cv2.resize(alpha, (max(2, w // step), max(2, h // step)),
                           interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigma / step)
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(alpha, (0, 0), sigma)


def mask_alpha(mask: dict, width: int, height: int) -> np.ndarray:
    """Alfa (float32 0-1) de UNA máscara: 1 = se ve el clip, 0 = se ve el fondo."""
    w = max(2, int(width))
    h = max(2, int(height))
    g = mask_geometry(mask, w, h)
    img = np.zeros((h, w), dtype=np.uint8)
    kind = mask["type"]
    if kind == "circle":
        cv2.ellipse(img, (int(round(g["cx"])), int(round(g["cy"]))),
                    (max(1, int(round(g["hw"]))), max(1, int(round(g["hh"])))),
                    mask["rotation"], 0, 360, 255, -1, lineType=cv2.LINE_AA)
    elif kind == "text":
        _paint_text(img, mask, g)
    elif kind == "brush":
        _paint_brush(img, mask, g)
    else:
        pts = MASK_SHAPES.get(kind, _rect_points)(mask, g)
        cv2.fillPoly(img, [_to_canvas(pts, g)], 255, lineType=cv2.LINE_AA)

    alpha = img.astype(np.float32) / 255.0
    alpha = _feather(alpha, g["feather"])
    if mask["invert"]:
        alpha = 1.0 - alpha
    op = mask["opacity"]
    if op < 0.999:
        alpha = alpha + (1.0 - alpha) * (1.0 - op)
    return np.clip(alpha, 0.0, 1.0)


def combined_alpha(masks: list[dict], width: int, height: int) -> np.ndarray:
    """Alfa combinado (intersección) de las máscaras activas, en uint8."""
    total: Optional[np.ndarray] = None
    for m in masks:
        if not m.get("enabled", True):
            continue
        a = mask_alpha(m, width, height)
        total = a if total is None else total * a
    if total is None:
        total = np.ones((max(2, int(height)), max(2, int(width))), dtype=np.float32)
    return np.clip(total * 255.0 + 0.5, 0, 255).astype(np.uint8)


def write_mask_png(masks: list[dict], width: int, height: int, path: Path) -> Path:
    path = Path(path)
    cv2.imwrite(str(path), combined_alpha(masks, width, height))
    return path


# Tope de fotogramas por máscara animada (evita rasterizar miles de PNG).
MAX_MASK_FRAMES = 2400


def build_clip_mask(clip: Any, tmp: Path, width: int, height: int, fps: int) -> Optional[dict]:
    """Rasteriza la máscara de un clip. Estática: 1 PNG. Animada: secuencia.

    Devuelve ``None`` si el clip no tiene máscara activa.
    """
    from .clip_speed import clip_timeline_duration

    masks = clip_masks_at(clip, 0.0)
    if not masks:
        return None
    tmp = Path(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    cid = str(_get(clip, "id") or "clip")
    dur = max(0.04, float(clip_timeline_duration(clip)))
    if not mask_animates(clip, dur):
        dest = tmp / f"{cid}.png"
        write_mask_png(masks, width, height, dest)
        return {"path": str(dest), "animated": False, "duration": dur}

    rate = float(fps or 30)
    frames = int(round(dur * rate))
    if frames > MAX_MASK_FRAMES:
        rate = MAX_MASK_FRAMES / dur
        frames = MAX_MASK_FRAMES
    frames = max(1, frames)
    seq_dir = tmp / cid
    seq_dir.mkdir(parents=True, exist_ok=True)
    for i in range(frames):
        t = (i / rate) if rate > 0 else 0.0
        write_mask_png(clip_masks_at(clip, min(t, dur)), width, height,
                       seq_dir / f"{i + 1:06d}.png")
    return {
        "path": str(seq_dir / "%06d.png"), "animated": True,
        "fps": rate, "frames": frames, "duration": dur,
    }


def build_timeline_masks(timeline: Any, tmp: Path, width: int, height: int,
                         fps: int) -> dict[str, dict]:
    """Máscaras rasterizadas de toda la timeline, por id de clip."""
    out: dict[str, dict] = {}
    for c in getattr(timeline, "clips", []) or []:
        if not maskable(c) or not has_mask(c):
            continue
        built = build_clip_mask(c, tmp, width, height, fps)
        if built:
            out[str(_get(c, "id"))] = built
    return out
