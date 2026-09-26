"""Subtítulos ASS para el export: karaoke por palabra y temas de pista.

Si el clip de texto trae ``words[]`` (timing real por palabra, relativo al inicio
del clip), el karaoke usa esas marcas. Si no, se reparte la duración del clip a
partes iguales (fallback retrocompatible).
"""
from __future__ import annotations

import math
import re
from typing import Iterable

from . import text3d
from .font_metrics import ass_size_factor, text_width
from .clip_anim import clip_pose
from .clip_fx import clip_fx_at
from .clip_keyframes import (
    clip_props_at, keyframes_enabled, text_style_animates, text_style_at, with_text_style_kf,
)
from .clip_layout import clip_flip
from .schemas import TimelineClip

# Nº máximo de eventos ASS que genera la aparición "typing" por clip. Acota el
# tamaño del .ass en textos largos revelando varios caracteres por paso.
_TYPING_MAX_STEPS = 240

_FX_NONE = "none"
_KNOWN_FX = ("highlight", "glow", "pop")

# Rango de posición del preview (CLIP_POS_MIN/MAX en clipLayout.js): un texto
# puede empezar muy fuera del cuadro y entrar animado, como en CapCut.
_POS_MIN, _POS_MAX = -10.0, 11.0

# Umbrales para decidir si la pose de un texto cambia durante el clip.
_POSE_EPS = {"x": 5e-4, "y": 5e-4, "scale": 1e-3, "rotation": 0.05, "opacity": 2e-3,
             "rot_x": 0.05, "rot_y": 0.05}


def effective_text_style(track_style: dict | None, clip_style: dict | None) -> dict:
    """Estilo efectivo de un text clip: la pista aporta la base y el clip la
    sobre-escribe campo a campo.

    Cubre de forma uniforme apariencia, opacidad, efectos (``word_fx``) y
    fragmentación (``max_words``). Retrocompatible: si el clip guarda el estilo
    completo (como hoy), gana el clip; si guarda solo overrides parciales, la
    pista rellena el resto.
    """
    return {**(track_style or {}), **(clip_style or {})}


def _posed_style(clip: TimelineClip, st: dict, local_t: float = 0.0) -> dict:
    """Estilo con la pose del clip en ``local_t`` (espejo de ``drawTextClip``).

    La pose (keyframes o pistas ``anim`` antiguas) sale del estilo PROPIO del
    clip, igual que en el preview; la opacidad solo la anima la pose con
    keyframes (sin ellos manda la del estilo efectivo).
    """
    # Color, Trazo, Fondo y Sombra con keyframes (espejo del preview).
    out = with_text_style_kf(dict(st or {}), text_style_at(clip, local_t))
    pose = _pose_at(clip, local_t)
    out["x"] = pose["x"]
    out["y"] = pose["y"]
    out["scale"] = pose["scale"]
    out["rotation"] = pose["rotation"]
    out["rot_x"] = pose["rot_x"]
    out["rot_y"] = pose["rot_y"]
    out["flip_h"], out["flip_v"] = clip_flip(clip)
    if keyframes_enabled(clip):
        out["opacity"] = pose["opacity"]
    return out


def _pose_at(clip: TimelineClip, local_t: float) -> dict:
    """Pose del preview (``clipPose``) + giro 3D (``rot_x``/``rot_y``, keyframeable)."""
    pose = clip_pose(clip, local_t)
    if keyframes_enabled(clip):
        p = clip_props_at(clip, local_t)
        pose["rot_x"], pose["rot_y"] = p["rot_x"], p["rot_y"]
    else:
        st = clip.style or {}
        pose["rot_x"], pose["rot_y"] = _num(st.get("rot_x"), 0.0), _num(st.get("rot_y"), 0.0)
    return pose


def word_fx_set(st: dict) -> set[str]:
    fx = (st or {}).get("word_fx") or _FX_NONE
    if isinstance(fx, (list, tuple)):
        return {x for x in fx if x in _KNOWN_FX}
    if fx == _FX_NONE:
        return set()
    return {fx} if fx in _KNOWN_FX else set()


def _clamp01(n, fallback: float = 1.0) -> float:
    try:
        op = float(n)
    except (TypeError, ValueError):
        return fallback
    return max(0.0, min(1.0, op))


def style_opacity(st: dict) -> float:
    return _clamp01((st or {}).get("opacity", 1), 1.0)


def word_opacity(st: dict, active: bool) -> float:
    st = st or {}
    base = style_opacity(st)
    if active or not word_fx_set(st):
        word = _clamp01(st.get("active_opacity", 1), 1.0)
    else:
        word = _clamp01(st.get("inactive_opacity", 1), 1.0)
    return _clamp01(base * word, 0.0)


def alpha_hex(op: float) -> str:
    """Alpha ASS: 00 = opaco, FF = transparente."""
    return f"{int(round((1.0 - _clamp01(op)) * 255)):02X}"


def _alpha_tags(aa: str) -> str:
    """Alpha de relleno, borde y sombra. Siempre, para que un override anterior no se herede."""
    return f"\\alpha&H{aa}&\\1a&H{aa}&\\3a&H{aa}&\\4a&H{aa}&"


def stretch_of(st: dict) -> tuple[float, float]:
    """Escala X / Y del texto sobre su Escala (Escala uniforme apagada), en sus ejes."""
    if not st.get("scale_split"):
        return 1.0, 1.0
    return (min(100.0, max(0.01, _num(st.get("stretch_x"), 1.0))),
            min(100.0, max(0.01, _num(st.get("stretch_y"), 1.0))))


def _fsc(st: dict, pct: float = 100.0) -> str:
    """\\fscx / \\fscy de las letras con la Escala X / Y del texto."""
    sx, sy = stretch_of(st)
    return f"\\fscx{_fmt(pct * sx)}\\fscy{_fmt(pct * sy)}"


def _box_color(st: dict) -> str | None:
    """Color ASS (con alpha) de la caja de Fondo, o None si no hay Fondo."""
    bg = st.get("bg")
    if not bg or bg == "none":
        return None
    bg_op = _clamp01(st.get("bg_opacity", 0.55), 0.55) * style_opacity(st)
    return ass_bgr(bg, alpha_hex(bg_op))


def _box_tags(st: dict) -> str:
    """Caja de Fondo en línea (va detrás de _alpha_tags y del color del brillo):
    su color y opacidad no dependen de la palabra activa y se pueden animar."""
    box = _box_color(st)
    if not box or box_drawn(st):
        return ""
    return f"\\4c&H00{box[4:]}\\4a&H{box[2:4]}&"


# Fondo completo (CapCut): estilo por línea o bloque, rectángulo redondeado, Alto /
# Ancho (margen extra, en em) y Desplazamiento X / Y (en em, Y hacia arriba).
BG_PAD_MAX = 1.0
BG_SHIFT_MAX = 1.0
_BG_SHAPE_KEYS = ("bg_radius", "bg_pad_x", "bg_pad_y", "bg_dx", "bg_dy")


def box_drawn(st: dict) -> bool:
    """Fondo que BorderStyle 4 no sabe hacer (bloque, redondeado, Alto / Ancho,
    desplazamiento, o texto animado): va como una forma ASS detrás del texto."""
    if not _box_color(st):
        return False
    return (bool(st.get("_bg_draw")) or st.get("bg_style") == "block"
            or any(_num(st.get(k), 0.0) != 0 for k in _BG_SHAPE_KEYS))


def box_rects(st: dict, W: int, H: int, rows) -> list[tuple[float, float, float, float]]:
    """Cajas de Fondo ``(x, y, w, h)`` en px: centro relativo al del bloque (en el eje
    del texto, sin girar) y tamaño. Espejo de ``bgRects`` del preview: una por línea
    (ancho del texto × alto de la fuente) o una para todo el bloque, más el grosor
    del contorno (como BorderStyle 4), el margen de Alto / Ancho y el desplazamiento."""
    em = _font_px(st, H)
    font, bold = st.get("font") or "Arial", bool(st.get("bold", True))
    ls = _letter_spacing_px(st, em)
    lh = em * _line_height(st)
    box_h = em * ass_size_factor(font, bold)
    half = max(0.2, min(1.0, _num(st.get("w", 0.88), 0.88))) * W / 2.0 * _style_scale(st)
    inset = 0.2 * em
    align = st.get("align") or "center"
    n = len(rows)
    rects = []
    for i, row in enumerate(rows):
        if not row:
            continue
        w = text_width(font, bold, em, " ".join(row), ls)
        x = -half + inset + w / 2 if align == "left" else half - inset - w / 2 if align == "right" else 0.0
        rects.append((x, (i - (n - 1) / 2) * lh, w, box_h))
    if not rects:
        return []
    if st.get("bg_style") == "block":
        x0 = min(x - w / 2 for x, _y, w, _h in rects)
        x1 = max(x + w / 2 for x, _y, w, _h in rects)
        y0 = min(y - h / 2 for _x, y, _w, h in rects)
        y1 = max(y + h / 2 for _x, y, _w, h in rects)
        rects = [((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0)]
    pad0 = max(0.0, _num(st.get("border_width"), 0.0))
    pad_x = pad0 + min(BG_PAD_MAX, max(0.0, _num(st.get("bg_pad_x"), 0.0))) * em
    pad_y = pad0 + min(BG_PAD_MAX, max(0.0, _num(st.get("bg_pad_y"), 0.0))) * em
    dx = min(BG_SHIFT_MAX, max(-BG_SHIFT_MAX, _num(st.get("bg_dx"), 0.0))) * em
    dy = -min(BG_SHIFT_MAX, max(-BG_SHIFT_MAX, _num(st.get("bg_dy"), 0.0))) * em
    return [(x + dx, y + dy, w + 2 * pad_x, h + 2 * pad_y) for x, y, w, h in rects]


def _rrect_path(w: float, h: float, radius: float) -> str:
    """Dibujo ASS de un rectángulo ``w`` × ``h`` con esquinas de radio ``radius``
    (0–1 de la mitad del lado corto), con curvas de Bézier."""
    r = max(0.0, min(1.0, radius)) * min(w, h) / 2
    f = _fmt
    if r <= 0:
        return f"m 0 0 l {f(w)} 0 l {f(w)} {f(h)} l 0 {f(h)}"
    k = r * (1 - 0.5523)
    return (
        f"m {f(r)} 0 l {f(w - r)} 0 b {f(w - k)} 0 {f(w)} {f(k)} {f(w)} {f(r)} "
        f"l {f(w)} {f(h - r)} b {f(w)} {f(h - k)} {f(w - k)} {f(h)} {f(w - r)} {f(h)} "
        f"l {f(r)} {f(h)} b {f(k)} {f(h)} 0 {f(h - k)} 0 {f(h - r)} "
        f"l 0 {f(r)} b 0 {f(k)} {f(k)} 0 {f(r)} 0"
    )


def _box_bodies(st: dict, W: int, H: int, rows, prefix_for, scale: float = 1.0) -> list[str]:
    """Un cuerpo de evento por caja dibujada: ``prefix_for(x, y)`` la coloca (con el
    giro y la aparición del texto) y la forma va en el color / opacidad del Fondo."""
    box = _box_color(st)
    if not box:
        return []
    tags = ("{" + f"\\p1\\bord0\\shad0\\blur0\\c&H00{box[4:]}\\1a&H{box[2:4]}&\\3a&HFF&\\4a&HFF&" + "}")
    radius = _num(st.get("bg_radius"), 0.0)
    sx, sy = stretch_of(st)
    return [prefix_for(x, y) + tags + _rrect_path(w * scale * sx, h * scale * sy, radius)
            for x, y, w, h in box_rects(st, W, H, rows)]


def active_word_index(word_count: int, local_t: float, duration: float) -> int:
    if word_count <= 0:
        return -1
    if duration <= 0:
        return 0
    if local_t < 0:
        return -1
    if local_t >= duration:
        return word_count - 1
    return min(word_count - 1, int(local_t / duration * word_count))


def split_words(text: str) -> list[str]:
    return [w for w in (text or "").split() if w]


def apply_text_case(text: str, mode: str | None) -> str:
    """May./min. de CapCut (TT, tt, Tt): solo cambia cómo se ve, no el texto
    guardado. Espejo de ``applyTextCase`` (frontend/src/lib/textstyles.js)."""
    t = text or ""
    if mode == "upper":
        return t.upper()
    if mode == "lower":
        return t.lower()
    if mode == "title":
        return re.sub(r"\S+", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), t)
    return t


def ass_bgr(hex_color: str, alpha: str = "00") -> str:
    h = (hex_color or "#ffffff").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) < 6:
        h = "ffffff"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha}{b.upper()}{g.upper()}{r.upper()}&"


def ass_time(t: float) -> str:
    t = max(0.0, float(t))
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _clip_dur(clip: TimelineClip) -> float:
    return max(0.0, float(clip.out_point or 0) - float(clip.in_point or 0))


def _esc_ass(s: str) -> str:
    t = (s or "").replace("\\", "\\\\").replace("{", "(").replace("}", ")")
    return t.replace("\r\n", "\\N").replace("\n", "\\N").replace("\r", "\\N")


def _num(v, fallback: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return fallback
    return n if n == n else fallback


def _pos_frac(v, fallback: float = 0.5) -> float:
    return min(_POS_MAX, max(_POS_MIN, _num(v, fallback)))


def _xy(st: dict, W: int, H: int) -> tuple[int, int]:
    px = int(round(_pos_frac(st.get("x", 0.5)) * W))
    py = int(round(_pos_frac(st.get("y", 0.5)) * H))
    return px, py


def _flip_of(st: dict) -> tuple[bool, bool]:
    return bool(st.get("flip_h")), bool(st.get("flip_v"))


def _rotation_tags(rot: float, ox: float, oy: float,
                   flip: tuple[bool, bool] = (False, False)) -> str:
    """Giro (y volteo) alrededor del centro de la caja, como el preview.

    El canvas gira en sentido HORARIO con ángulos positivos y ``\\frz`` en
    sentido antihorario, de ahí el signo. ``\\org`` fija el centro de giro:
    sin él libass gira alrededor del ancla de ``\\pos``, que en textos
    alineados a izquierda/derecha es un borde de la caja.

    Voltear (#7): ``\\frx180`` / ``\\fry180`` son un espejo EXACTO (a 180° el
    plano vuelve a quedar plano: sin perspectiva). libass gira primero en Z y
    luego en X/Y, así que el espejo cae DESPUÉS del giro; el preview voltea
    antes (en los ejes del texto). Como giro(a)·espejo = espejo·giro(−a), con un
    solo volteo ``\\frz`` lleva el signo contrario. Los dos volteos a la vez son
    un giro de 180°.
    """
    fh, fv = flip
    if fh and fv:
        rot, fh, fv = rot + 180.0, False, False
    if not (fh or fv):
        if abs(rot) <= 0.05:
            return ""
        return f"\\org({_fmt(ox)},{_fmt(oy)})\\frz{_fmt(-rot)}"
    tags = f"\\org({_fmt(ox)},{_fmt(oy)})"
    if abs(rot) > 0.05:
        tags += f"\\frz{_fmt(rot)}"
    return tags + ("\\frx180" if fv else "\\fry180")


def _fmt(v: float) -> str:
    """Número compacto para tags ASS (2 decimales, sin ceros sobrantes)."""
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


# Sombra paralela (estilo CapCut): distancia y desenfoque en "em" (fracción del
# tamaño de letra), ángulo en grados (0 = derecha, 90 = abajo). Espejo de
# SHADOW_DEFAULTS / textShadow en frontend/src/lib/textstyles.js.
SHADOW_DEFAULTS = {"opacity": 0.6, "blur": 0.05, "distance": 0.06, "angle": 45.0}
# ``\blurN`` de libass equivale a una gaussiana de σ ≈ 0.85·N (medido con FFmpeg
# 9 entre N=2 y 16); el preview usa ``ctx.filter = blur(σ)``.
LIBASS_BLUR_SIGMA = 0.85


# Brillo (CapCut): un halo = la silueta del texto desenfocada DEBAJO de él, en su
# color. Intensidad = opacidad; Intervalo = tamaño del halo (0–1 → σ hasta 0,5 em);
# «intenso» engorda la silueta antes de desenfocar; desplazamiento en em (Y arriba).
# Espejo de GLOW_DEFAULTS / textGlow (frontend/src/lib/textstyles.js).
GLOW_DEFAULTS = {"intensity": 0.9, "range": 0.5}
GLOW_SIGMA_MAX = 0.5
GLOW_SPREAD = 0.08


def glow_color(st: dict) -> str:
    """Color del Brillo: el suyo; si no, el de la sombra (textos anteriores)."""
    return st.get("glow_color") or st.get("shadow_color") or "#ffffff"


def text_glow(st: dict, font_px: float) -> dict | None:
    """Parámetros del halo del Brillo (misma forma que ``text_shadow``), o None."""
    if not st.get("glow"):
        return None
    opacity = _clamp01(st.get("glow_intensity", GLOW_DEFAULTS["intensity"]), GLOW_DEFAULTS["intensity"])
    if opacity <= 0:
        return None
    rng = min(1.0, max(0.0, _num(st.get("glow_range"), GLOW_DEFAULTS["range"])))
    return {
        "color": glow_color(st),
        "opacity": opacity,
        "dx": min(1.0, max(-1.0, _num(st.get("glow_dx"), 0.0))) * font_px,
        "dy": -min(1.0, max(-1.0, _num(st.get("glow_dy"), 0.0))) * font_px,
        "sigma": rng * GLOW_SIGMA_MAX * font_px,
        "spread": GLOW_SPREAD * font_px if st.get("glow_style") == "strong" else 0.0,
    }


def text_shadow(st: dict, font_px: float) -> dict | None:
    """Silueta desenfocada DEBAJO del texto para un tamaño de letra en px, o None:
    el halo del Brillo si está activo (entonces no hay sombra paralela) y, si no,
    la sombra paralela."""
    if st.get("glow"):
        return text_glow(st, font_px)
    if not st.get("shadow"):
        return None
    opacity = _clamp01(st.get("shadow_opacity", SHADOW_DEFAULTS["opacity"]), SHADOW_DEFAULTS["opacity"])
    if opacity <= 0:
        return None
    dist = min(1.0, max(0.0, _num(st.get("shadow_distance"), SHADOW_DEFAULTS["distance"]))) * font_px
    ang = math.radians(_num(st.get("shadow_angle"), SHADOW_DEFAULTS["angle"]))
    return {
        "color": st.get("shadow_color") or "#000000",
        "opacity": opacity,
        "dx": math.cos(ang) * dist,
        "dy": math.sin(ang) * dist,
        "sigma": min(1.0, max(0.0, _num(st.get("shadow_blur"), SHADOW_DEFAULTS["blur"]))) * font_px,
    }


def _font_px(st: dict, H: int) -> float:
    return max(0.0, _num(st.get("size"), 0.048)) * H * _style_scale(st)


def _ass_font_size(st: dict, em_px: float) -> float:
    """Tamaño ASS para que la letra mida lo mismo que en el preview: libass toma el
    tamaño como alto de línea OS/2, el canvas como "em" (ver font_metrics)."""
    return em_px * ass_size_factor(st.get("font") or "Arial", bool(st.get("bold", True)))


# Espaciado entre letras (#6), en "em" como el preview (ctx.letterSpacing).
LETTER_SPACING_RANGE = (-0.5, 1.0)


def _letter_spacing_px(st: dict, em_px: float) -> float:
    lo, hi = LETTER_SPACING_RANGE
    return min(hi, max(lo, _num(st.get("letter_spacing"), 0.0))) * em_px


def _shadow_override(st: dict, sh: dict) -> str:
    """Tags del evento-sombra: silueta (relleno + borde) en el color de la sombra,
    con su opacidad y desenfoque, sin sombra propia ni caja."""
    aa = alpha_hex(sh["opacity"] * style_opacity(st))
    col = ass_bgr(sh["color"], aa)
    blur = sh["sigma"] / LIBASS_BLUR_SIGMA
    bord = float(st.get("border_width", 0) or 0) + sh.get("spread", 0.0)
    return (
        "{" + f"\\c{col}\\3c{col}" + _alpha_tags(aa) + _fsc(st)
        + f"\\bord{_fmt(bord)}\\shad0\\blur{_fmt(blur)}" + "}"
    )


def _active_override(st: dict) -> str:
    color = st.get("highlight_color") or "#ffffff"
    fx = word_fx_set(st)
    op = word_opacity(st, True)
    aa = alpha_hex(op)
    outline = st.get("border_color") or "#000000"
    parts = [f"\\c{ass_bgr(color, aa)}", f"\\3c{ass_bgr(outline, aa)}", _alpha_tags(aa)]
    if "glow" in fx:
        parts.append("\\blur3")
    else:
        parts.append("\\blur0")
    parts.append(_fsc(st, 118.0 if "pop" in fx else 100.0))
    parts.append(_box_tags(st))
    return "{" + "".join(parts) + "}"


def _idle_override(st: dict) -> str:
    color = st.get("color") or "#ffffff"
    op = word_opacity(st, False)
    aa = alpha_hex(op)
    outline = st.get("border_color") or "#000000"
    parts = [
        f"\\c{ass_bgr(color, aa)}", f"\\3c{ass_bgr(outline, aa)}",
        _alpha_tags(aa), _fsc(st), "\\blur0",
    ]
    parts.append(_box_tags(st))
    return "{" + "".join(parts) + "}"


def _line_for_active(text: str, active: int, st: dict) -> str:
    """Karaoke por palabra, conservando saltos de línea del preview (\\N)."""
    chunks: list[str] = []
    gi = 0
    paras = (text or "").split("\n")
    for pi, para in enumerate(paras):
        if pi:
            chunks.append("\\N")
        line: list[str] = []
        for w in para.split():
            if not w:
                continue
            tag = _active_override(st) if gi == active else _idle_override(st)
            line.append(f"{tag}{_esc_ass(w)}")
            gi += 1
        chunks.append(" ".join(line))
    return "".join(chunks)


def _row_anchor_x(st: dict, cx: float, half: float, inset: float) -> tuple[int, float]:
    """(\\an, x) de una línea: centrada en la caja o pegada a su borde con la misma
    sangría que el preview (0,2 del tamaño de letra)."""
    align = st.get("align") or "center"
    if align == "left":
        return 4, cx - half + inset
    if align == "right":
        return 6, cx + half - inset
    return 5, cx


def _layout_prefix(st: dict, W: int, H: int, is_first: bool,
                   off_x: float = 0.0, off_y: float = 0.0, row_dy: float = 0.0,
                   anchor_x: float | None = None) -> str:
    """Posición, alineación y aparición de bloque (mismas propiedades que el preview).

    ``off_x``/``off_y`` desplazan todo en pantalla (sombra paralela); ``row_dy`` baja
    una línea dentro del bloque, en el eje del texto (gira con él: ``\\org`` sigue en
    el centro del bloque)."""
    px, py = _xy(st, W, H)
    appear = st.get("block_appear") or _FX_NONE
    try:
        wbox = float(st.get("w", 0.88))
    except (TypeError, ValueError):
        wbox = 0.88
    half = max(0.2, min(1.0, wbox)) * W / 2.0 * _style_scale(st)
    # Escala X / Y (sin Escala uniforme): estira las distancias en el eje del texto.
    sx, sy = stretch_of(st)
    if anchor_x is None:
        an, ax = _row_anchor_x(st, px, half, 0.2 * _font_px(st, H))
        ax = px + (ax - px) * sx
    else:  # caja de Fondo dibujada: su centro, a ``anchor_x`` del centro del bloque
        an, ax = 5, px + anchor_x * sx
    ax, px, py = ax + off_x, px + off_x, py + off_y
    ry = py + row_dy * sy
    parts = [f"\\an{an}"]
    if is_first and appear == "slide_up":
        dy = max(12, int(round(H * 0.035)))
        # Volteado en vertical, libass refleja también el recorrido del \move
        # (el espejo va alrededor del \org fijo): se invierte para que suba.
        if _flip_of(st)[1]:
            dy = -dy
        parts.append(f"\\move({_fmt(ax)},{_fmt(ry + dy)},{_fmt(ax)},{_fmt(ry)},0,180)")
    else:
        parts.append(f"\\pos({_fmt(ax)},{_fmt(ry)})")
    if is_first and appear == "fade":
        parts.append("\\fad(180,0)")
    if is_first and appear == "pop":
        parts.append(_fsc(st, 80.0) + "\\t(0,180," + _fsc(st) + ")")
    parts.append(_rotation_tags(_num(st.get("rotation"), 0.0), px, py, _flip_of(st)))
    return "{" + "".join(parts) + "}"


# Curva (CapCut): Fuerza −1…1 (−100…100). Cada línea se dobla sobre un arco del
# mismo radio (la más ancha ocupa ``|fuerza| · π``): positivo hacia arriba (∩),
# negativo hacia abajo (∪). Con Fondo no hay curva (CapCut no deja activarla).
# Espejo de curveOf / curveGlyphs (frontend/src/lib/textstyles.js).
CURVE_MAX_ANGLE = math.pi


def curve_of(st: dict) -> float:
    """Fuerza de la Curva que se dibuja (0 = texto recto)."""
    if not st.get("curve_on") or (st.get("bg") and st.get("bg") != "none"):
        return 0.0
    k = min(1.0, max(-1.0, _num(st.get("curve"), 0.0)))
    return 0.0 if abs(k) < 0.005 else k


def curve_glyphs(st: dict, W: int, H: int, rows) -> list[tuple[int, str, float, float, float]]:
    """``(palabra, letra, x, y, giro en rad)`` de cada letra sobre el arco: centro de la
    letra relativo al del bloque, en el eje del texto (sin su giro).

    Las líneas van en arcos concéntricos (centro común bajo el bloque en ∩, sobre él
    en ∪), así conservan su separación; ``radius`` es el de la línea central."""
    k = curve_of(st)
    em = _font_px(st, H)
    font, bold = st.get("font") or "Arial", bool(st.get("bold", True))
    ls = _letter_spacing_px(st, em)
    lh = em * _line_height(st)
    half = max(0.2, min(1.0, _num(st.get("w", 0.88), 0.88))) * W / 2.0 * _style_scale(st)
    inset = 0.2 * em
    align = st.get("align") or "center"
    space = text_width(font, bold, em, " ", ls)
    widths = [[text_width(font, bold, em, w, ls) for w in row] for row in rows]
    totals = [sum(ws) + space * max(0, len(ws) - 1) for ws in widths]
    radius = max(1.0, max(totals or [0.0])) / (max(abs(k), 0.005) * CURVE_MAX_ANGLE)
    sign = 1.0 if k >= 0 else -1.0
    n = len(rows)
    out = []
    gi = 0
    for i, row in enumerate(rows):
        y0 = (i - (n - 1) / 2) * lh
        tot = totals[i]
        x = -half + inset if align == "left" else half - inset - tot if align == "right" else -tot / 2
        mid = x + tot / 2
        r = max(1.0, radius - sign * y0)
        for w, ww in zip(row, widths[i]):
            cur = x
            for ch in w:
                a = text_width(font, bold, em, ch, ls)
                phi = (cur + a / 2 - mid) / r
                out.append((gi, ch, mid + r * math.sin(phi),
                            sign * radius - sign * r * math.cos(phi), sign * phi))
                cur += a
            x += ww + space
            gi += 1
    return out


def _curve_bodies(st: dict, W: int, H: int, rows, override_for, prefix_for) -> list[str]:
    """Un cuerpo por letra: ``prefix_for(x, y, giro)`` + la letra con el override de su palabra."""
    return [prefix_for(x, y, phi) + override_for(gi) + _esc_ass(ch)
            for gi, ch, x, y, phi in curve_glyphs(st, W, H, rows) if ch.strip()]


def _glyph_tags(X: float, Y: float, angle: float) -> str:
    """Letra girada ``angle`` grados (horario, como el canvas) alrededor de su centro."""
    return f"\\org({_fmt(X)},{_fmt(Y)})\\frz{_fmt(-angle)}"


def _glyph_prefix(st: dict, W: int, H: int, is_first: bool, gx: float, gy: float, phi: float,
                  off_x: float = 0.0, off_y: float = 0.0) -> str:
    """Posición, giro y aparición de una letra de un texto curvo QUIETO."""
    px, py = _xy(st, W, H)
    rot = _num(st.get("rotation"), 0.0)
    r = math.radians(rot)
    sx, sy = stretch_of(st)
    gx, gy = gx * sx, gy * sy
    X = px + gx * math.cos(r) - gy * math.sin(r) + off_x
    Y = py + gx * math.sin(r) + gy * math.cos(r) + off_y
    appear = st.get("block_appear") or _FX_NONE
    parts = ["\\an5"]
    if is_first and appear == "slide_up":
        dy = max(12, int(round(H * 0.035)))
        parts.append(f"\\move({_fmt(X)},{_fmt(Y + dy)},{_fmt(X)},{_fmt(Y)},0,180)")
    else:
        parts.append(f"\\pos({_fmt(X)},{_fmt(Y)})")
    if is_first and appear == "fade":
        parts.append("\\fad(180,0)")
    if is_first and appear == "pop":
        parts.append(_fsc(st, 80.0) + "\\t(0,180," + _fsc(st) + ")")
    parts.append(_glyph_tags(X, Y, rot + math.degrees(phi)))
    return "{" + "".join(parts) + "}"


def _anim_center(st: dict, W: int, H: int, fx: dict, off_x: float = 0.0, off_y: float = 0.0):
    """(cx, cy, escala de la aparición, giro, tamaño de letra) de UN fotograma."""
    size = max(0.0, _num(st.get("size"), 0.048)) * H * _style_scale(st)
    s = _num(fx.get("scale"), 1.0)
    rot = _num(st.get("rotation"), 0.0)
    ox = _num(fx.get("tx"), 0.0) * size * 2.2 * s
    oy = _num(fx.get("ty"), 0.0) * size * 2.6 * s
    rad = math.radians(rot)
    cx = _pos_frac(st.get("x", 0.5)) * W + ox * math.cos(rad) - oy * math.sin(rad) + off_x
    cy = _pos_frac(st.get("y", 0.5)) * H + ox * math.sin(rad) + oy * math.cos(rad) + off_y
    return cx, cy, s, rot, size


def _anim_glyph_prefix(st: dict, W: int, H: int, fx: dict, gx: float, gy: float, phi: float,
                       off_x: float = 0.0, off_y: float = 0.0) -> str:
    """Una letra de un texto curvo ANIMADO en un fotograma (espejo de _anim_prefix)."""
    cx, cy, s, rot, size = _anim_center(st, W, H, fx, off_x, off_y)
    r = math.radians(rot)
    sx, sy = stretch_of(st)
    gx, gy = gx * sx, gy * sy
    X = cx + (gx * math.cos(r) - gy * math.sin(r)) * s
    Y = cy + (gx * math.sin(r) + gy * math.cos(r)) * s
    return ("{" + f"\\an5\\pos({_fmt(X)},{_fmt(Y)})"
            f"\\fs{_fmt(_ass_font_size(st, max(8.0, size * s)))}"
            f"\\bord{_fmt(float(st.get('border_width', 0) or 0))}"
            + _glyph_tags(X, Y, rot + math.degrees(phi)) + "}")


def _anim_prefix(st: dict, W: int, H: int, fx: dict,
                 off_x: float = 0.0, off_y: float = 0.0, row_dy: float = 0.0,
                 anchor_x: float | None = None) -> str:
    """Posición, tamaño y giro de UN fotograma de un texto animado.

    Espejo de ``drawTextClip``: la pose ya viene en ``st`` y la aparición de
    bloque llega horneada en ``fx`` (``clip_fx_at``), porque los tags relativos
    al evento (``\\fad``, ``\\move``, ``\\t``) se repetirían en cada fotograma.
    El preview hace ``translate(centro) · rotate · scale(fx) · translate(offset)``,
    así que el desplazamiento de la aparición va girado y escalado.
    """
    cx, cy, s, rot, size = _anim_center(st, W, H, fx, off_x, off_y)
    wbox = _num(st.get("w", 0.88), 0.88)
    half = max(0.2, min(1.0, wbox)) * W / 2.0 * s * _style_scale(st)
    sx, sy = stretch_of(st)
    if anchor_x is not None:
        an, ax = 5, cx + anchor_x * s * sx
    else:
        an, ax = _row_anchor_x(st, cx, half, 0.2 * size * s)
        ax = cx + (ax - cx) * sx
    parts = [
        f"\\an{an}\\pos({_fmt(ax)},{_fmt(cy + row_dy * s * sy)})"
        f"\\fs{_fmt(_ass_font_size(st, max(8.0, size * s)))}"
        f"\\fsp{_fmt(_letter_spacing_px(st, size * s))}"
        # El grosor del Trazo puede ir animado (el del estilo es el del primer fotograma).
        f"\\bord{_fmt(float(st.get('border_width', 0) or 0))}",
        _rotation_tags(rot, cx, cy, _flip_of(st)),
    ]
    return "{" + "".join(parts) + "}"


def _alignment(st: dict) -> tuple[int, int, int, int]:
    """(align, margin_l, margin_r, margin_v) en coords PlayRes.

    El ancla real va en \\pos (centro de caja, como el preview). Los márgenes
    laterales limitan el wrap al ancho ``w``.
    """
    w = float(st.get("w", 0.88))
    side = max(12, int(round((1.0 - max(0.2, min(1.0, w))) / 2 * 720)))
    return 5, side, side, 0


def _style_scale(st: dict) -> float:
    try:
        s = float(st.get("scale") or 1)
    except (TypeError, ValueError):
        s = 1.0
    if s <= 0 or s != s:
        return 1.0
    return s


def _style_line(clip: TimelineClip, W: int, H: int, style: dict | None = None,
                shadow_layer: bool = False) -> str:
    """Estilo ASS del texto. ``shadow_layer``: el del evento-sombra (``sh<id>``),
    sin caja de fondo (la caja es del texto, no de su sombra) ni sombra propia."""
    st = style if style is not None else (clip.style or {})
    em_px = float(st.get("size", 0.048)) * H * _style_scale(st)
    fontsize = max(8, int(round(_ass_font_size(st, em_px))))
    spacing = _fmt(_letter_spacing_px(st, em_px))
    bold = -1 if st.get("bold", True) else 0
    italic = -1 if st.get("italic") else 0
    underline = -1 if st.get("underline") else 0
    outline = int(st.get("border_width", 0) or 0)
    # La sombra paralela y el halo del Brillo van en su propio evento (text_shadow).
    box = None if shadow_layer or box_drawn(st) else _box_color(st)
    shadow = 0
    base_a = alpha_hex(style_opacity(st))
    primary = ass_bgr(st.get("color") or "#ffffff", base_a)
    outline_c = ass_bgr(st.get("border_color") or "#000000", base_a)
    back = "&H80000000&"
    border_style = 1
    if box:
        # BorderStyle 4 (libass): una caja por línea en BackColour, aunque no haya
        # contorno, y el contorno del texto sigue en su color. Con la 3 la caja
        # salía en el color del contorno y, sin contorno, no salía.
        back = box
        border_style = 4
    _align, _ml, _mr, _mv = _alignment(st)
    wbox = float(st.get("w", 0.88))
    side = max(8, int(round((1.0 - max(0.2, min(1.0, wbox))) / 2 * W)))
    font = st.get("font") or "Arial"
    name = f"sh{clip.id}" if shadow_layer else f"s{clip.id}"
    return (
        f"Style: {name},{font},{fontsize},{primary},{primary},{outline_c},{back},"
        f"{bold},{italic},{underline},0,100,100,{spacing},0,{border_style},{outline},{shadow},5,"
        f"{side},{side},0,1"
    )


def word_windows(clip: TimelineClip) -> list[tuple[float, float]]:
    """Ventana temporal absoluta ``(t0, t1)`` de cada palabra.

    Usa ``clip.words`` (relativos al inicio del clip) si su número coincide con
    las palabras del texto; una palabra permanece activa hasta que empieza la
    siguiente. Si no hay ``words[]`` o no cuadran, reparte la duración a partes
    iguales (retrocompatible con el karaoke estimado anterior).
    """
    words_txt = split_words(clip.text or "")
    n = len(words_txt)
    if n == 0:
        return []
    start = max(0.0, float(clip.start or 0))
    dur = _clip_dur(clip)
    real = list(clip.words or [])
    if len(real) == n:
        rels = [min(max(0.0, float(w.start)), dur) for w in real]
        wins: list[tuple[float, float]] = []
        for i in range(n):
            t0 = start + rels[i]
            t1 = start + (rels[i + 1] if i + 1 < n else dur)
            if t1 <= t0:
                t1 = t0 + 0.04
            wins.append((t0, t1))
        return wins
    slot = dur / n
    return [(start + i * slot, start + (i + 1) * slot) for i in range(n)]


# Interlineado (#6): alto de línea en "em", como el preview (lineH = tamaño × interlineado).
LINE_HEIGHT_DEFAULT = 1.22
LINE_HEIGHT_RANGE = (0.6, 3.0)
# Las líneas las reparte ``_rows`` (como el preview) y cada una va en su propio
# evento, a la altura del preview: libass no deja cambiar el interlineado (lo fija
# la fuente) y su ajuste de línea reparte distinto. Los márgenes enormes y
# negativos desactivan su ajuste.
_NO_WRAP = "-30000,-30000,0"
# El editor ya manda el texto partido por el navegador (``wrappedText``): Pillow
# mide casi igual, pero no debe volver a partir una línea que el navegador dejó
# entera por un pelo.
_WRAP_TOLERANCE = 1.02


def _line_height(st: dict) -> float:
    lo, hi = LINE_HEIGHT_RANGE
    return min(hi, max(lo, _num(st.get("line_height"), LINE_HEIGHT_DEFAULT)))


def _rows(st: dict, W: int, H: int, text: str) -> list[list[str]]:
    """Palabras por línea como ``wrapWordRows`` del preview: caja ``w`` × escala
    menos 0,4 del tamaño de letra; cada salto de línea del texto empieza línea."""
    em = _font_px(st, H)
    ls = _letter_spacing_px(st, em)
    box = max(0.1, min(1.0, _num(st.get("w"), 0.8))) * W * _style_scale(st)
    max_w = (box - em * 0.4) * _WRAP_TOLERANCE
    font, bold = st.get("font") or "Arial", bool(st.get("bold", True))
    rows: list[list[str]] = []
    for para in (text or "").split("\n"):
        words = para.split()
        if not words:
            rows.append([])
            continue
        row = [words[0]]
        for w in words[1:]:
            if text_width(font, bold, em, " ".join(row + [w]), ls) <= max_w:
                row.append(w)
            else:
                rows.append(row)
                row = [w]
        rows.append(row)
    return rows or [[]]


def _row_bodies(rows: list[list[str]], override_for, prefix_for) -> list[str]:
    """Un cuerpo por línea con palabras: ``prefix_for(k)`` (k = posición de la
    línea respecto al centro del bloque, en líneas) + cada palabra con su override,
    que solo se repite cuando cambia."""
    n = len(rows)
    out: list[str] = []
    gi = 0
    for i, row in enumerate(rows):
        if not row:
            continue
        parts: list[str] = []
        prev = None
        for w in row:
            tag = override_for(gi)
            gi += 1
            parts.append((tag if tag != prev else "") + _esc_ass(w))
            prev = tag
        out.append(prefix_for(i - (n - 1) / 2) + " ".join(parts))
    return out


def _typing_dialogues(clip: TimelineClip, W: int, H: int, st: dict, layer: int = 0,
                      shadow: dict | None = None, box: bool = False) -> list[str]:
    """Aparición "typing": revela el texto de izquierda a derecha durante todo
    el clip. Un evento ASS por paso (y línea), cada uno mostrando el prefijo
    visible; el último completa el texto. La velocidad se adapta a la duración y
    al nº de caracteres, igual que el preview. Con ``shadow``, los eventos-sombra."""
    text = clip.text or ""
    chars = list(text)
    n = len(chars)
    dur = _clip_dur(clip)
    if n == 0 or dur <= 0:
        return []
    start = max(0.0, float(clip.start or 0))
    if shadow:
        style_name = f"sh{clip.id}"
        off = (shadow["dx"], shadow["dy"])
        ov = _shadow_override(st, shadow)
    else:
        style_name = f"s{clip.id}"
        off = (0.0, 0.0)
        ov = _idle_override(st)
    lh = _font_px(st, H) * _line_height(st)
    steps = min(n, max(1, int(round(dur * 30))), _TYPING_MAX_STEPS)
    rows_of: dict[str, list[list[str]]] = {}
    lines: list[str] = []
    for i in range(steps):
        t0 = start + dur * i / steps
        t1 = start + dur * (i + 1) / steps
        k = max(1, math.ceil((i + 1) / steps * n))
        shown = "".join(chars[:k])
        if shown not in rows_of:
            rows_of[shown] = _rows(st, W, H, shown)
        if box:
            bodies = _box_bodies(st, W, H, rows_of[shown],
                                 lambda x, y: _layout_prefix(st, W, H, True, row_dy=y, anchor_x=x))
        elif curve_of(st):
            bodies = _curve_bodies(st, W, H, rows_of[shown], lambda gi: ov,
                                   lambda x, y, phi: _glyph_prefix(st, W, H, True, x, y, phi, off[0], off[1]))
        else:
            bodies = _row_bodies(rows_of[shown], lambda gi: ov,
                                 lambda kk: _layout_prefix(st, W, H, True, off[0], off[1], kk * lh))
        for body in bodies:
            lines.append(f"Dialogue: {layer},{ass_time(t0)},{ass_time(t1)},{style_name},,{_NO_WRAP},," + body)
    return lines


def caption_dialogues(clip: TimelineClip, W: int, H: int, style: dict | None = None,
                      layer: int = 0) -> list[str]:
    st = style if style is not None else (clip.style or {})
    words = split_words(clip.text or "")
    if not words:
        return []
    if (st.get("block_appear") or _FX_NONE) == "typing":
        return _typing_dialogues(clip, W, H, st, layer)
    dur = _clip_dur(clip)
    start = max(0.0, float(clip.start or 0))
    fx = word_fx_set(st)
    style_name = f"s{clip.id}"
    rows = _rows(st, W, H, clip.text or "")
    lh = _font_px(st, H) * _line_height(st)

    curved = bool(curve_of(st))

    def emit(t0: float, t1: float, is_first: bool, override_for) -> list[str]:
        bodies = (_curve_bodies(st, W, H, rows, override_for,
                                lambda x, y, phi: _glyph_prefix(st, W, H, is_first, x, y, phi))
                  if curved else
                  _row_bodies(rows, override_for, lambda k: _layout_prefix(st, W, H, is_first, row_dy=k * lh)))
        return [f"Dialogue: {layer},{ass_time(t0)},{ass_time(t1)},{style_name},,{_NO_WRAP},," + body
                for body in bodies]

    if not fx or len(words) == 1:
        # Un solo vocablo con karaoke está activo todo el clip (como el preview).
        ov = _active_override(st) if fx else _idle_override(st)
        return emit(start, start + max(0.04, dur), True, lambda gi: ov)
    active, idle = _active_override(st), _idle_override(st)
    lines: list[str] = []
    for i, (t0, t1) in enumerate(word_windows(clip)):
        lines.extend(emit(t0, t1, i == 0, lambda gi, i=i: active if gi == i else idle))
    return lines


def box_dialogues(clip: TimelineClip, W: int, H: int, style: dict | None = None,
                  layer: int = 0) -> list[str]:
    """Fondo dibujado (``box_drawn``) de un texto QUIETO: una forma por caja durante
    todo el clip, con la aparición del texto. Va antes que la sombra de su capa, así
    que queda debajo de la sombra y del texto."""
    st = style if style is not None else (clip.style or {})
    if not box_drawn(st) or not split_words(clip.text or ""):
        return []
    if (st.get("block_appear") or _FX_NONE) == "typing":
        return _typing_dialogues(clip, W, H, st, layer, box=True)
    start = max(0.0, float(clip.start or 0))
    end = start + max(0.04, _clip_dur(clip))
    return [
        f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},s{clip.id},,{_NO_WRAP},," + body
        for body in _box_bodies(st, W, H, _rows(st, W, H, clip.text or ""),
                                lambda x, y: _layout_prefix(st, W, H, True, row_dy=y, anchor_x=x))
    ]


def shadow_dialogues(clip: TimelineClip, W: int, H: int, style: dict | None = None,
                     layer: int = 0) -> list[str]:
    """Eventos de la sombra paralela de un texto QUIETO (capa por debajo del texto).

    Un evento por línea para todo el clip: la silueta no cambia con el karaoke.
    Lleva el mismo prefijo que el primer evento del texto (aparición incluida),
    desplazado."""
    st = style if style is not None else (clip.style or {})
    sh = text_shadow(st, _font_px(st, H))
    words = split_words(clip.text or "")
    if not sh or not words:
        return []
    if (st.get("block_appear") or _FX_NONE) == "typing":
        return _typing_dialogues(clip, W, H, st, layer, shadow=sh)
    start = max(0.0, float(clip.start or 0))
    end = start + max(0.04, _clip_dur(clip))
    lh = _font_px(st, H) * _line_height(st)
    ov = _shadow_override(st, sh)
    rows = _rows(st, W, H, clip.text or "")
    bodies = (_curve_bodies(st, W, H, rows, lambda gi: ov,
                            lambda x, y, phi: _glyph_prefix(st, W, H, True, x, y, phi, sh["dx"], sh["dy"]))
              if curve_of(st) else
              _row_bodies(rows, lambda gi: ov,
                          lambda k: _layout_prefix(st, W, H, True, sh["dx"], sh["dy"], k * lh)))
    return [f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},sh{clip.id},,{_NO_WRAP},," + body
            for body in bodies]


def _typing_text(text: str, p: float) -> str:
    """Espejo de ``typingReveal``: prefijo visible con progreso ``p`` (0-1)."""
    chars = list(text or "")
    k = math.ceil(_clamp01(p, 0.0) * len(chars))
    return "".join(chars[:k])


def _active_word_at(clip: TimelineClip, n: int, local_t: float, dur: float) -> int:
    """Palabra activa en ``local_t`` (espejo de ``activeWordIndexFromWords`` /
    ``activeWordIndex`` del preview)."""
    real = list(clip.words or [])
    if n and len(real) == n:
        idx = 0
        for i, w in enumerate(real):
            if float(w.start) <= local_t:
                idx = i
            else:
                break
        return idx
    return active_word_index(n, local_t, dur)


def _content_at(clip: TimelineClip, st: dict, local_t: float, dur: float):
    """(texto visible, override de la palabra i) en ``local_t``; None si no se ve nada."""
    text = clip.text or ""
    if (st.get("block_appear") or _FX_NONE) == "typing":
        shown = _typing_text(text, local_t / dur if dur > 0 else 1.0)
        if not shown.strip():
            return None
        idle = _idle_override(st)
        return shown, (lambda gi: idle)
    words = split_words(text)
    if not word_fx_set(st):
        idle = _idle_override(st)
        return text, (lambda gi: idle)
    if len(words) == 1:
        act = _active_override(st)
        return text, (lambda gi: act)
    i = _active_word_at(clip, len(words), local_t, dur)
    act, idle = _active_override(st), _idle_override(st)
    return text, (lambda gi: act if gi == i else idle)


def _floor_cs(t: float) -> int:
    return int(math.floor(t * 100 + 1e-6))


def _cs_time(cs: int) -> str:
    cs = max(0, int(cs))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def text_animates(clip: TimelineClip, fps: float = 30) -> bool:
    """True si la pose del texto (posición, escala, giro u opacidad) cambia
    durante el clip, por keyframes o por pistas ``anim`` antiguas."""
    anim = clip.anim if isinstance(clip.anim, dict) else {}
    if not keyframes_enabled(clip) and not any(anim.values()):
        return False
    dur = _clip_dur(clip)
    if dur <= 0:
        return False
    if text_style_animates(clip):
        return True
    n = max(2, min(2000, int(math.ceil(dur * max(1.0, float(fps or 30)))) + 1))
    first = _pose_at(clip, 0.0)
    for i in range(1, n):
        pose = _pose_at(clip, dur * i / (n - 1))
        if any(abs(pose[k] - first[k]) > eps for k, eps in _POSE_EPS.items()):
            return True
    return False


def animated_dialogues(clip: TimelineClip, W: int, H: int, style: dict | None = None,
                       fps: float = 30, layer: int = 0, shadow: bool = False,
                       box: bool = False) -> list[str]:
    """Un evento por fotograma (y línea) con la pose de ESE fotograma (texto animado).

    Con ``shadow`` genera los eventos de la sombra paralela (misma pose, desplazada,
    con su tamaño de letra de ese fotograma).

    Cada fotograma ``k`` de la composición (t = k/fps) cae en su evento
    ``[floor(k/fps), floor((k+1)/fps))`` en centésimas; FFmpeg pasa a libass el
    tiempo del frame truncado a ms, así que nunca toma la pose del vecino.
    Fotogramas consecutivos idénticos se funden en un solo evento.
    """
    st = style if style is not None else (clip.style or {})
    dur = _clip_dur(clip)
    if dur <= 0:
        return []
    fps = max(1.0, float(fps or 30))
    start = max(0.0, float(clip.start or 0))
    end = start + dur
    s_cs, e_cs = int(round(start * 100)), int(round(end * 100))
    appear = {"appear": st.get("block_appear") or _FX_NONE, "exit": _FX_NONE}
    # Las líneas no cambian con la escala (la caja escala con el texto): se reparten
    # una vez por texto visible, así no bailan entre fotogramas.
    rows_of: dict[str, list[list[str]]] = {}
    events: list[list] = []
    for k in range(int(math.floor(start * fps + 1e-6)), int(math.ceil(end * fps - 1e-6))):
        a = max(s_cs, _floor_cs(k / fps))
        b = min(e_cs, _floor_cs((k + 1) / fps))
        if b <= a:
            continue
        local = min(dur, max(0.0, k / fps - start))
        st_t = _posed_style(clip, st, local)
        fx = clip_fx_at(appear, local, dur)
        st_t["opacity"] = style_opacity(st_t) * _num(fx.get("opacity"), 1.0)
        seen = _content_at(clip, st_t, local, dur)
        if seen is None:
            continue
        text_now, override_for = seen
        if box:
            if not box_drawn(st_t):
                continue
            if text_now not in rows_of:
                rows_of[text_now] = _rows(st_t, W, H, text_now)
            s_fx = _num(fx.get("scale"), 1.0)
            bodies = tuple(_box_bodies(st_t, W, H, rows_of[text_now],
                                       lambda x, y: _anim_prefix(st_t, W, H, fx, row_dy=y, anchor_x=x),
                                       scale=s_fx))
            if events and events[-1][2] == bodies and events[-1][1] == a:
                events[-1][1] = b
            else:
                events.append([a, b, bodies])
            continue
        off_x = off_y = 0.0
        if shadow:
            sh = text_shadow(st_t, _font_px(st_t, H))
            if not sh:
                continue
            sov = _shadow_override(st_t, sh)
            override_for = (lambda gi, sov=sov: sov)
            off_x, off_y = sh["dx"], sh["dy"]
        if text_now not in rows_of:
            rows_of[text_now] = _rows(st_t, W, H, text_now)
        lh = _font_px(st_t, H) * _line_height(st_t)
        if curve_of(st_t):
            bodies = tuple(_curve_bodies(
                st_t, W, H, rows_of[text_now], override_for,
                lambda x, y, phi: _anim_glyph_prefix(st_t, W, H, fx, x, y, phi, off_x, off_y)))
        else:
            bodies = tuple(_row_bodies(
                rows_of[text_now], override_for,
                lambda kk: _anim_prefix(st_t, W, H, fx, off_x, off_y, kk * lh)))
        if events and events[-1][2] == bodies and events[-1][1] == a:
            events[-1][1] = b
        else:
            events.append([a, b, bodies])
    name = f"sh{clip.id}" if shadow and not box else f"s{clip.id}"
    return [f"Dialogue: {layer},{_cs_time(a)},{_cs_time(b)},{name},,{_NO_WRAP},," + body
            for a, b, bodies in events for body in bodies]


def build_ass(clips: Iterable[TimelineClip], W: int, H: int, tracks: Iterable | None = None,
              fps: float = 30) -> str:
    track_style = {t.id: (getattr(t, "style", None) or {}) for t in (tracks or [])}
    texts = [c for c in clips if (c.kind == "text") and _clip_dur(c) > 0.02 and split_words(c.text or "")
             and not getattr(c, "disabled", False)]
    base = {c.id: effective_text_style(track_style.get(c.track_id), c.style) for c in texts}
    # May./min.: se exporta el texto tal como se ve (el guardado no cambia).
    texts = [c.model_copy(update={"text": apply_text_case(c.text, base[c.id].get("text_case"))})
             if base[c.id].get("text_case") else c for c in texts]
    animated = {c.id: text_animates(c, fps) for c in texts}
    for c in texts:
        if animated[c.id] and _box_color(base[c.id]):
            base[c.id] = {**base[c.id], "_bg_draw": True}
    eff = {c.id: _posed_style(c, base[c.id]) for c in texts}
    styles: list[str] = []
    events: list[str] = []
    # Cada texto ocupa dos capas: 2i su sombra paralela y 2i+1 el texto. Así la
    # sombra queda justo debajo de SU texto y el orden entre textos es el del preview.
    for i, c in enumerate(texts):
        styles.append(_style_line(c, W, H, eff[c.id]))
        if base[c.id].get("shadow") or base[c.id].get("glow"):
            styles.append(_style_line(c, W, H, eff[c.id], shadow_layer=True))
        if animated[c.id]:
            events.extend(animated_dialogues(c, W, H, base[c.id], fps, layer=2 * i, box=True))
            events.extend(animated_dialogues(c, W, H, base[c.id], fps, layer=2 * i, shadow=True))
            events.extend(animated_dialogues(c, W, H, base[c.id], fps, layer=2 * i + 1))
        else:
            events.extend(box_dialogues(c, W, H, eff[c.id], layer=2 * i))
            events.extend(shadow_dialogues(c, W, H, eff[c.id], layer=2 * i))
            events.extend(caption_dialogues(c, W, H, eff[c.id], layer=2 * i + 1))
    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {int(W)}\n"
        f"PlayResY: {int(H)}\n"
        "WrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\n"
        "\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
    )
    body = "\n".join(styles) + "\n\n[Events]\n"
    body += "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    body += "\n".join(events) + "\n"
    return header + body


def _text_frames(clip: TimelineClip, fps: float) -> list[tuple[int, float]]:
    """(fotograma de la composición, t local) de cada fotograma en que se ve el texto."""
    fps = max(1.0, float(fps or 30))
    start = max(0.0, float(clip.start or 0))
    end = start + _clip_dur(clip)
    k0 = int(math.ceil(start * fps - 1e-6))
    k1 = int(math.ceil(end * fps - 1e-6))
    return [(k, min(end - start, max(0.0, k / fps - start))) for k in range(k0, max(k0 + 1, k1))]


def text_is_3d(clip: TimelineClip, fps: float = 30) -> bool:
    """True si el texto está girado en 3D en algún momento (va en capa propia)."""
    if text3d.angles(_pose_at(clip, 0.0)):
        return True
    if not text_animates(clip, fps):
        return False
    return any(text3d.angles(_pose_at(clip, t)) for _, t in _text_frames(clip, fps))


def text_warp_spec(clip: TimelineClip, style: dict, W: int, H: int, fps: float = 30) -> dict | None:
    """Deformación 3D de la capa de un texto para el export (filtro ``perspective``).

    Devuelve ``{"region": (x0, y0, x1, y1), "corners": [[(x, y)×4] por fotograma],
    "frames": [k…]}``: la región de la capa a deformar (contiene el texto en todos
    los fotogramas, en su sitio y proyectado) y dónde cae cada esquina de la región
    en cada fotograma, relativo a su origen. None si el texto no es 3D.
    """
    base = style or {}
    f = text3d.focal_of(H, base.get("perspective"))
    frames = _text_frames(clip, fps) if text_animates(clip, fps) else [(0, 0.0)]
    poses: list[dict] = []
    any3d = False
    appear = base.get("block_appear") or _FX_NONE
    for _, local in frames:
        st = _posed_style(clip, base, local)
        ang = text3d.angles(st)
        any3d = any3d or bool(ang)
        rx, ry = ang or (0.0, 0.0)
        font_px = _font_px(st, H)
        shown = apply_text_case(clip.text or "", base.get("text_case"))
        hx, hy = text3d.text_half_extents(st, shown, W, H, font_px, text_shadow(st, font_px))
        if appear in ("slide_up", "slide_left"):
            hx, hy = hx + 2.2 * font_px, hy + 2.6 * font_px
        if abs(_num(st.get("rotation"), 0.0)) > 0.05:
            hx = hy = math.hypot(hx, hy)
        poses.append({"cx": _pos_frac(st.get("x", 0.5)) * W, "cy": _pos_frac(st.get("y", 0.5)) * H,
                      "rx": rx, "ry": ry, "f": f, "hx": hx, "hy": hy})
    if not any3d:
        return None
    region = text3d.warp_region(poses, W, H)
    return {
        "region": region,
        "frames": [k for k, _ in frames],
        "corners": [text3d.region_corners(p, region) for p in poses],
    }


def ass_filter_path(path: str) -> str:
    """Escapa una ruta Windows para el filtro ass= de ffmpeg."""
    return path.replace("\\", "/").replace(":", "\\:").replace("'", r"\'")
