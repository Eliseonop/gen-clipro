"""Velocidad constante de un clip de timeline (CapCut: fuente fija, barra ≠ fuente)."""

SPEED_MIN = 0.1
SPEED_MAX = 10.0


def _field(clip, key, default=None):
    if isinstance(clip, dict):
        return clip.get(key, default)
    return getattr(clip, key, default)


def clip_speed(clip) -> float:
    if _field(clip, "kind") in ("text", "image"):
        return 1.0
    raw = _field(clip, "speed")
    try:
        s = float(raw)
    except (TypeError, ValueError):
        return 1.0
    if s <= 0 or s != s:
        return 1.0
    return min(SPEED_MAX, max(SPEED_MIN, s))


def clip_source_duration(clip) -> float:
    inp = float(_field(clip, "in_point", 0) or 0)
    out = float(_field(clip, "out_point", 0) or 0)
    return max(0.0, round(out - inp, 3))


def clip_timeline_duration(clip) -> float:
    src = clip_source_duration(clip)
    return max(0.0, round(src / clip_speed(clip), 3))


def keep_pitch(clip) -> bool:
    """True = mismo tono al cambiar velocidad (HTML ``preservesPitch`` / atempo)."""
    raw = _field(clip, "keep_pitch", True)
    if raw is None:
        return True
    return bool(raw)


def clip_reverse(clip) -> bool:
    return bool(_field(clip, "reverse", False))


def atempo_chain(speed: float) -> str:
    parts = []
    s = float(speed)
    while s > 2.0 + 1e-9:
        parts.append("atempo=2.0")
        s /= 2.0
    while s < 0.5 - 1e-9:
        parts.append("atempo=0.5")
        s /= 0.5
    parts.append(f"atempo={s:.5f}")
    return ",".join(parts)


def video_speed_filters(clip) -> str:
    bits = []
    if clip_reverse(clip):
        bits.append("reverse")
    sp = clip_speed(clip)
    if abs(sp - 1.0) > 1e-3:
        bits.append(f"setpts=PTS/{sp:.6f}")
    return ",".join(bits)


def audio_speed_filters(clip) -> str:
    bits = []
    if clip_reverse(clip):
        bits.append("areverse")
    sp = clip_speed(clip)
    if abs(sp - 1.0) > 1e-3:
        if keep_pitch(clip):
            bits.append(atempo_chain(sp))
        else:
            # Preview: playbackRate + preservesPitch. asetrate cambia el tono (ardilla).
            bits.append(f"asetrate=48000*{sp:.6f}")
    return ",".join(bits)
