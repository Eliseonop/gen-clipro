"""Subtítulos ASS para el export: karaoke por palabra y temas de pista.

Los tiempos por palabra se estiman repartiendo la duración del clip
(hasta que la transcripción traiga timestamps reales).
"""
from __future__ import annotations

from typing import Iterable

from .schemas import TimelineClip

_FX_NONE = "none"


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
    return (s or "").replace("\\", "\\\\").replace("{", "(").replace("}", ")")


def _active_override(st: dict) -> str:
    color = st.get("highlight_color") or "#ffffff"
    fx = st.get("word_fx") or _FX_NONE
    parts = [f"\\c{ass_bgr(color)}"]
    if fx == "glow":
        parts.append("\\blur3")
    if fx == "pop":
        parts.append("\\fscx118\\fscy118")
    return "{" + "".join(parts) + "}"


def _idle_override(st: dict) -> str:
    color = st.get("color") or "#ffffff"
    return "{" + f"\\c{ass_bgr(color)}" + "}"


def _line_for_active(words: list[str], active: int, st: dict) -> str:
    chunks: list[str] = []
    for i, w in enumerate(words):
        tag = _active_override(st) if i == active else _idle_override(st)
        chunks.append(f"{tag}{_esc_ass(w)}")
    return " ".join(chunks)


def _alignment(st: dict) -> tuple[int, int, int, int]:
    """(align, margin_l, margin_r, margin_v) en coords PlayRes."""
    y = float(st.get("y", 0.86))
    w = float(st.get("w", 0.88))
    # Márgenes laterales a partir del ancho de caja.
    side = max(12, int(round((1.0 - max(0.2, min(1.0, w))) / 2 * 720)))
    if y >= 0.7:
        return 2, side, side, max(18, int(round((1.0 - y) * 1280)))
    if y <= 0.3:
        return 8, side, side, max(18, int(round(y * 1280)))
    return 5, side, side, 0


def _style_line(clip: TimelineClip, W: int, H: int) -> str:
    st = clip.style or {}
    fontsize = max(8, int(round(float(st.get("size", 0.048)) * H)))
    bold = -1 if st.get("bold", True) else 0
    outline = int(st.get("border_width", 0) or 0)
    shadow = 2 if st.get("shadow") or st.get("glow") else 0
    primary = ass_bgr(st.get("color") or "#ffffff")
    outline_c = ass_bgr(st.get("border_color") or "#000000")
    back = "&H80000000&"
    border_style = 1
    bg = st.get("bg")
    if bg and bg != "none":
        op = float(st.get("bg_opacity", 0.55))
        aa = f"{int(round((1.0 - op) * 255)):02X}"
        back = ass_bgr(bg, aa)
        border_style = 3
    align, ml, mr, mv = _alignment(st)
    # Recalcular márgenes con W/H reales.
    wbox = float(st.get("w", 0.88))
    side = max(8, int(round((1.0 - max(0.2, min(1.0, wbox))) / 2 * W)))
    y = float(st.get("y", 0.86))
    if align == 2:
        mv = max(12, int(round((1.0 - y) * H - fontsize * 0.15)))
    elif align == 8:
        mv = max(12, int(round(y * H - fontsize * 0.15)))
    font = st.get("font") or "Arial"
    name = f"s{clip.id}"
    return (
        f"Style: {name},{font},{fontsize},{primary},{primary},{outline_c},{back},"
        f"{bold},0,0,0,100,100,0,0,{border_style},{outline},{shadow},{align},"
        f"{side},{side},{mv},1"
    )


def caption_dialogues(clip: TimelineClip, W: int, H: int) -> list[str]:
    st = clip.style or {}
    words = split_words(clip.text or "")
    if not words:
        return []
    dur = _clip_dur(clip)
    start = max(0.0, float(clip.start or 0))
    fx = st.get("word_fx") or _FX_NONE
    appear = st.get("block_appear") or _FX_NONE
    fad = "{\\fad(180,0)}" if appear in ("fade", "pop", "slide_up") else ""
    style = f"s{clip.id}"
    if fx == _FX_NONE or len(words) == 1:
        end = start + max(0.04, dur)
        text = fad + _idle_override(st) + _esc_ass(" ".join(words))
        return [
            f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{style},,0,0,0,," + text
        ]
    slot = dur / len(words)
    lines: list[str] = []
    for i in range(len(words)):
        t0 = start + i * slot
        t1 = start + (i + 1) * slot
        body = fad + _line_for_active(words, i, st)
        lines.append(
            f"Dialogue: 0,{ass_time(t0)},{ass_time(t1)},{style},,0,0,0,," + body
        )
    return lines


def build_ass(clips: Iterable[TimelineClip], W: int, H: int) -> str:
    texts = [c for c in clips if (c.kind == "text") and _clip_dur(c) > 0.02 and split_words(c.text or "")]
    styles = [_style_line(c, W, H) for c in texts]
    events: list[str] = []
    for c in texts:
        events.extend(caption_dialogues(c, W, H))
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
