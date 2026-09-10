"""Subtítulos ASS para el export: karaoke por palabra y temas de pista.

Si el clip de texto trae ``words[]`` (timing real por palabra, relativo al inicio
del clip), el karaoke usa esas marcas. Si no, se reparte la duración del clip a
partes iguales (fallback retrocompatible).
"""
from __future__ import annotations

import math
from typing import Iterable

from .schemas import TimelineClip

# Nº máximo de eventos ASS que genera la aparición "typing" por clip. Acota el
# tamaño del .ass en textos largos revelando varios caracteres por paso.
_TYPING_MAX_STEPS = 240

_FX_NONE = "none"
_KNOWN_FX = ("highlight", "glow", "pop")


def effective_text_style(track_style: dict | None, clip_style: dict | None) -> dict:
    """Estilo efectivo de un text clip: la pista aporta la base y el clip la
    sobre-escribe campo a campo.

    Cubre de forma uniforme apariencia, opacidad, efectos (``word_fx``) y
    fragmentación (``max_words``). Retrocompatible: si el clip guarda el estilo
    completo (como hoy), gana el clip; si guarda solo overrides parciales, la
    pista rellena el resto.
    """
    return {**(track_style or {}), **(clip_style or {})}


def _applied_style(clip: TimelineClip, st: dict) -> dict:
    """Une el estilo heredado con la pose (keyframes o valores estáticos)."""
    out = dict(st or {})
    try:
        from .clip_keyframes import clip_props_at, keyframes_enabled
        p = clip_props_at(clip, 0.0)
    except Exception:  # noqa: BLE001
        return out
    if keyframes_enabled(clip):
        out["x"] = p["x"]
        out["y"] = p["y"]
        out["scale"] = p["scale"]
        out["rotation"] = p["rotation"]
        return out
    if out.get("opacity") is None:
        out["opacity"] = p["opacity"]
    if out.get("scale") is None:
        out["scale"] = p["scale"]
    if out.get("rotation") is None:
        out["rotation"] = p["rotation"]
    return out


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


def opacity_tag(st: dict, active: bool = True) -> str:
    """Aplica la opacidad al relleno, al borde y a la sombra (\\1a solo dejaba el outline opaco)."""
    return _alpha_tags(alpha_hex(word_opacity(st, active)))


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


def _xy(st: dict, W: int, H: int) -> tuple[int, int]:
    x = float(st.get("x", 0.5))
    y = float(st.get("y", 0.5))
    px = int(round(min(1.0, max(0.0, x)) * W))
    py = int(round(min(1.0, max(0.0, y)) * H))
    return px, py


def _shadow_color_tag(st: dict) -> str:
    if not (st.get("shadow") or st.get("glow")):
        return ""
    color = st.get("shadow_color") or "#000000"
    if st.get("glow") and not st.get("shadow_color"):
        color = st.get("highlight_color") or st.get("color") or "#ffffff"
    return f"\\4c{ass_bgr(color)}"


def _active_override(st: dict) -> str:
    color = st.get("highlight_color") or "#ffffff"
    fx = word_fx_set(st)
    op = word_opacity(st, True)
    aa = alpha_hex(op)
    outline = st.get("border_color") or "#000000"
    parts = [f"\\c{ass_bgr(color, aa)}", f"\\3c{ass_bgr(outline, aa)}", _alpha_tags(aa)]
    if "glow" in fx or st.get("glow"):
        parts.append("\\blur3")
    else:
        parts.append("\\blur0")
    if "pop" in fx:
        parts.append("\\fscx118\\fscy118")
    else:
        parts.append("\\fscx100\\fscy100")
    sh = _shadow_color_tag(st)
    if sh:
        parts.append(sh)
    return "{" + "".join(parts) + "}"


def _idle_override(st: dict) -> str:
    color = st.get("color") or "#ffffff"
    op = word_opacity(st, False)
    aa = alpha_hex(op)
    outline = st.get("border_color") or "#000000"
    parts = [
        f"\\c{ass_bgr(color, aa)}", f"\\3c{ass_bgr(outline, aa)}",
        _alpha_tags(aa), "\\fscx100\\fscy100",
        "\\blur3" if st.get("glow") else "\\blur0",
    ]
    sh = _shadow_color_tag(st)
    if sh:
        parts.append(sh)
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


def _layout_prefix(st: dict, W: int, H: int, is_first: bool) -> str:
    """Posición, alineación y aparición de bloque (mismas propiedades que el preview)."""
    px, py = _xy(st, W, H)
    appear = st.get("block_appear") or _FX_NONE
    align = (st.get("align") or "center")
    try:
        wbox = float(st.get("w", 0.88))
    except (TypeError, ValueError):
        wbox = 0.88
    half = max(0.2, min(1.0, wbox)) * W / 2.0
    if align == "left":
        an, ax = 4, int(round(px - half))
    elif align == "right":
        an, ax = 6, int(round(px + half))
    else:
        an, ax = 5, px
    parts = [f"\\an{an}"]
    if is_first and appear == "slide_up":
        dy = max(12, int(round(H * 0.035)))
        parts.append(f"\\move({ax},{py + dy},{ax},{py},0,180)")
    else:
        parts.append(f"\\pos({ax},{py})")
    if is_first and appear == "fade":
        parts.append("\\fad(180,0)")
    if is_first and appear == "pop":
        parts.append("\\fscx80\\fscy80\\t(0,180,\\fscx100\\fscy100)")
    try:
        rot = float(st.get("rotation") or 0)
    except (TypeError, ValueError):
        rot = 0.0
    if abs(rot) > 0.05:
        parts.append(f"\\frz{rot:.2f}")
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


def _style_line(clip: TimelineClip, W: int, H: int, style: dict | None = None) -> str:
    st = style if style is not None else (clip.style or {})
    fontsize = max(8, int(round(float(st.get("size", 0.048)) * H * _style_scale(st))))
    bold = -1 if st.get("bold", True) else 0
    italic = -1 if st.get("italic") else 0
    outline = int(st.get("border_width", 0) or 0)
    shadow = 2 if st.get("shadow") or st.get("glow") else 0
    base_a = alpha_hex(style_opacity(st))
    primary = ass_bgr(st.get("color") or "#ffffff", base_a)
    outline_c = ass_bgr(st.get("border_color") or "#000000", base_a)
    back = "&H80000000&"
    border_style = 1
    bg = st.get("bg")
    if bg and bg != "none":
        try:
            bg_op = float(st.get("bg_opacity", 0.55))
        except (TypeError, ValueError):
            bg_op = 0.55
        bg_op = max(0.0, min(1.0, bg_op)) * style_opacity(st)
        aa = alpha_hex(bg_op)
        back = ass_bgr(bg, aa)
        border_style = 3
    _align, _ml, _mr, _mv = _alignment(st)
    wbox = float(st.get("w", 0.88))
    side = max(8, int(round((1.0 - max(0.2, min(1.0, wbox))) / 2 * W)))
    font = st.get("font") or "Arial"
    name = f"s{clip.id}"
    return (
        f"Style: {name},{font},{fontsize},{primary},{primary},{outline_c},{back},"
        f"{bold},{italic},0,0,100,100,0,0,{border_style},{outline},{shadow},5,"
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


def _typing_text(text: str, p: float) -> str:
    """Prefijo visible del texto según el progreso ``p`` (0-1). Espejo de
    ``typingReveal`` en frontend/src/lib/clipFx.js (mismo recorte char-a-char)."""
    chars = list(text or "")
    if not chars:
        return ""
    k = math.ceil(_clamp01(p) * len(chars))
    return "".join(chars[:k])


def _typing_dialogues(clip: TimelineClip, W: int, H: int, st: dict) -> list[str]:
    """Aparición "typing": revela el texto de izquierda a derecha durante todo
    el clip. Un evento ASS por paso, cada uno mostrando el prefijo visible; el
    último completa el texto. La velocidad se adapta a la duración y al nº de
    caracteres, igual que el preview."""
    text = clip.text or ""
    chars = list(text)
    n = len(chars)
    dur = _clip_dur(clip)
    if n == 0 or dur <= 0:
        return []
    start = max(0.0, float(clip.start or 0))
    style_name = f"s{clip.id}"
    prefix = _layout_prefix(st, W, H, True)
    ov = _idle_override(st)
    steps = min(n, max(1, int(round(dur * 30))), _TYPING_MAX_STEPS)
    lines: list[str] = []
    for i in range(steps):
        t0 = start + dur * i / steps
        t1 = start + dur * (i + 1) / steps
        k = max(1, math.ceil((i + 1) / steps * n))
        body = prefix + ov + _esc_ass("".join(chars[:k]))
        lines.append(
            f"Dialogue: 0,{ass_time(t0)},{ass_time(t1)},{style_name},,0,0,0,," + body
        )
    return lines


def caption_dialogues(clip: TimelineClip, W: int, H: int, style: dict | None = None) -> list[str]:
    st = style if style is not None else (clip.style or {})
    words = split_words(clip.text or "")
    if not words:
        return []
    if (st.get("block_appear") or _FX_NONE) == "typing":
        return _typing_dialogues(clip, W, H, st)
    dur = _clip_dur(clip)
    start = max(0.0, float(clip.start or 0))
    fx = word_fx_set(st)
    style_name = f"s{clip.id}"
    if not fx or len(words) == 1:
        end = start + max(0.04, dur)
        # Un solo vocablo con karaoke está activo todo el clip (como el preview).
        ov = _active_override(st) if fx else _idle_override(st)
        text = _layout_prefix(st, W, H, True) + ov + _esc_ass(clip.text or " ".join(words))
        return [
            f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{style_name},,0,0,0,," + text
        ]
    lines: list[str] = []
    for i, (t0, t1) in enumerate(word_windows(clip)):
        prefix = _layout_prefix(st, W, H, i == 0)
        body = prefix + _line_for_active(clip.text or "", i, st)
        lines.append(
            f"Dialogue: 0,{ass_time(t0)},{ass_time(t1)},{style_name},,0,0,0,," + body
        )
    return lines


def build_ass(clips: Iterable[TimelineClip], W: int, H: int, tracks: Iterable | None = None) -> str:
    track_style = {t.id: (getattr(t, "style", None) or {}) for t in (tracks or [])}
    texts = [c for c in clips if (c.kind == "text") and _clip_dur(c) > 0.02 and split_words(c.text or "")]
    eff = {c.id: _applied_style(c, effective_text_style(track_style.get(c.track_id), c.style)) for c in texts}
    styles = [_style_line(c, W, H, eff[c.id]) for c in texts]
    events: list[str] = []
    for c in texts:
        events.extend(caption_dialogues(c, W, H, eff[c.id]))
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


def ass_filter_path(path: str) -> str:
    """Escapa una ruta Windows para el filtro ass= de ffmpeg."""
    return path.replace("\\", "/").replace(":", "\\:").replace("'", r"\'")
