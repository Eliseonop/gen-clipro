"""Presets de animación de clip: el MCP genera keyframes, no el LLM.

``t`` de los items es tiempo LOCAL del clip (0 = inicio de la barra).
La envolvente de audio es una lista ``[(t_local, amp)]`` con amp en 0–1.
"""
from __future__ import annotations

import math
import uuid
from typing import Any, Optional

from .clip_keyframes import clip_props_at, static_props
from .clip_layout import is_overlay
from .clip_speed import clip_speed, clip_timeline_duration

MOTIONS = (
    "zoom_in", "zoom_out", "spin", "spin_in",
    "slide_left", "slide_right", "slide_up", "slide_down",
    "fade_in", "fade_out", "pop", "pulse",
)
_ALIASES = {
    "zoom": "zoom_in",
    "fade": "fade_in",
    "slide": "slide_left",
    "spin_out": "spin",
    "whoosh": "slide_left",
    "hit": "pop",
}
ANIMATABLE = frozenset({"video", "image", "text", "shape"})
_POSE = ("x", "y", "scale", "rotation", "opacity", "cx", "cy", "zoom")
_APPEAR = frozenset({
    "zoom_in", "spin_in", "slide_left", "slide_right", "slide_up", "slide_down",
    "fade_in", "pop",
})


def normalize_motion(motion: str | None) -> str:
    key = (motion or "").strip().lower().replace("-", "_")
    key = _ALIASES.get(key, key)
    if key not in MOTIONS:
        raise ValueError(f"motion inválido: {motion} (usa {list(MOTIONS)})")
    return key


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n:
        return default
    return n


def _uid() -> str:
    return f"k{uuid.uuid4().hex[:8]}"


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


def _kind(clip: Any) -> str:
    return clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", "")


def uses_scale_zoom(clip: Any) -> bool:
    """True si el zoom se hace con scale (overlay/texto/figura), no con recorte."""
    return is_overlay(clip) or _kind(clip) in ("text", "shape")


def parse_envelope(raw) -> list[tuple[float, float]] | None:
    if not raw:
        return None
    out: list[tuple[float, float]] = []
    for p in raw:
        if isinstance(p, dict):
            t, a = p.get("t"), p.get("amp", p.get("v"))
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            t, a = p[0], p[1]
        else:
            continue
        out.append((round(_num(t, 0.0), 3), max(0.0, min(1.0, _num(a, 0.0)))))
    out.sort(key=lambda x: x[0])
    return out or None


def downsample_envelope(points: list[tuple[float, float]], max_n: int = 24) -> list[tuple[float, float]]:
    n = len(points)
    if n <= max_n:
        return points
    out = []
    for i in range(max_n):
        j = round(i * (n - 1) / (max_n - 1))
        out.append(points[j])
    return out


def hold_after_peak(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Corta la cola de silencio: el clip aparece con el golpe y se queda."""
    if not points:
        return points
    peak_i = max(range(len(points)), key=lambda i: points[i][1])
    peak = points[peak_i][1]
    if peak < 0.05:
        return points
    cut = peak_i
    thresh = max(0.35, peak * 0.8)
    while cut + 1 < len(points) and points[cut + 1][1] >= thresh:
        cut += 1
    return points[: cut + 1]


def normalize_amps(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not points:
        return points
    peak = max(a for _, a in points) or 1.0
    out = []
    for t, a in points:
        u = max(0.0, (a / peak - 0.06) / 0.94)
        out.append((t, min(1.0, u)))
    return out


def overlap_window(visual, audio) -> tuple[float, float] | None:
    """Ventana de timeline [start, end) en la que visual y audio coinciden."""
    vs = _num(visual.start if not isinstance(visual, dict) else visual.get("start"), 0.0)
    as_ = _num(audio.start if not isinstance(audio, dict) else audio.get("start"), 0.0)
    ve = vs + clip_timeline_duration(visual)
    ae = as_ + clip_timeline_duration(audio)
    lo, hi = max(vs, as_), min(ve, ae)
    if hi - lo <= 0.02:
        return None
    return lo, hi


def audio_src_at(audio, t_tl: float) -> float:
    start = _num(audio.start if not isinstance(audio, dict) else audio.get("start"), 0.0)
    inp = _num(audio.in_point if not isinstance(audio, dict) else audio.get("in_point"), 0.0)
    return inp + max(0.0, t_tl - start) * clip_speed(audio)


def sample_rms_envelope(path, src_start: float, duration: float, rate: int = 20) -> list[tuple[float, float]]:
    """RMS 0–1 a ~``rate`` Hz. ``t`` relativo al inicio de la ventana muestreada."""
    import shutil
    import struct
    import subprocess

    exe = shutil.which("ffmpeg")
    if not exe:
        raise ValueError("hace falta ffmpeg para seguir el audio")
    dur = max(0.05, _num(duration, 0.0))
    sr = 400
    hop = max(1, int(sr / max(1, rate)))
    cmd = [
        exe, "-hide_banner", "-nostdin",
        "-ss", f"{max(0.0, src_start):.3f}", "-t", f"{dur:.3f}",
        "-i", str(path), "-ac", "1", "-ar", str(sr),
        "-f", "f32le", "-v", "error", "-",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"no se pudo leer el audio: {exc}") from exc
    if r.returncode != 0:
        err = (r.stderr or b"").decode("utf-8", "ignore").strip()
        raise ValueError(err or "no se pudo leer el audio para la envolvente")
    raw = r.stdout or b""
    n = len(raw) // 4
    if n < 2:
        return [(0.0, 0.0), (round(dur, 3), 0.0)]
    samples = struct.unpack("<" + "f" * n, raw[: n * 4])
    pts: list[tuple[float, float]] = []
    i = 0
    while i < n:
        chunk = samples[i:i + hop]
        rms = math.sqrt(sum(x * x for x in chunk) / len(chunk))
        pts.append((round(i / sr, 3), rms))
        i += hop
    if pts[-1][0] < dur - 0.02:
        pts.append((round(dur, 3), pts[-1][1]))
    return downsample_envelope(normalize_amps(pts))


def _item(t: float, props: dict, interpolation: str) -> dict:
    return {
        "id": _uid(),
        "t": round(max(0.0, t), 3),
        "interpolation": interpolation,
        "props": {k: round(_num(props.get(k), 0.0), 4) for k in _POSE if k in props},
    }


def _rest(clip: Any) -> dict:
    p = static_props(clip)
    return {k: p[k] for k in _POSE}


def _zoom_punch(rest: dict, intensity: float) -> float:
    return max(0.1, min(1.0, rest["zoom"] * (1.0 - 0.28 * intensity)))


def _from_amp(clip: Any, motion: str, rest: dict, amp: float, intensity: float, turns: float) -> dict:
    a = max(0.0, min(1.0, amp))
    props = dict(rest)
    scale_zoom = uses_scale_zoom(clip)
    if motion in ("zoom_in", "zoom_out"):
        target = _zoom_punch(rest, intensity)
        if motion == "zoom_in":
            if scale_zoom:
                props["scale"] = _lerp(rest["scale"] * max(0.15, 0.4 / intensity), rest["scale"], a)
            else:
                props["zoom"] = _lerp(1.0, target, a)
        else:
            if scale_zoom:
                props["scale"] = _lerp(rest["scale"], rest["scale"] * max(0.15, 0.4 / intensity), a)
            else:
                props["zoom"] = _lerp(target, 1.0, a)
        props["opacity"] = rest["opacity"] * (0.15 + 0.85 * a) if motion == "zoom_in" else rest["opacity"]
    elif motion in ("spin", "spin_in"):
        props["rotation"] = rest["rotation"] + (1.0 - a) * 360.0 * turns
        props["scale"] = _lerp(rest["scale"] * 0.35, rest["scale"], a)
        props["opacity"] = rest["opacity"] * a
    elif motion == "slide_left":
        props["x"] = rest["x"] - (1.0 - a) * 0.9 * intensity
        props["opacity"] = rest["opacity"] * a
    elif motion == "slide_right":
        props["x"] = rest["x"] + (1.0 - a) * 0.9 * intensity
        props["opacity"] = rest["opacity"] * a
    elif motion == "slide_up":
        props["y"] = rest["y"] - (1.0 - a) * 0.9 * intensity
        props["opacity"] = rest["opacity"] * a
    elif motion == "slide_down":
        props["y"] = rest["y"] + (1.0 - a) * 0.9 * intensity
        props["opacity"] = rest["opacity"] * a
    elif motion in ("fade_in", "fade_out"):
        props["opacity"] = rest["opacity"] * a if motion == "fade_in" else rest["opacity"] * (1.0 - a)
    elif motion == "pop":
        props["scale"] = _lerp(rest["scale"] * 0.2, rest["scale"], a)
        props["opacity"] = rest["opacity"] * a
    elif motion == "pulse":
        props["scale"] = rest["scale"] * (0.72 + 0.28 * a)
        props["opacity"] = rest["opacity"] * (0.2 + 0.8 * a)
    return props


def _preset_pair(clip: Any, motion: str, rest: dict, intensity: float, turns: float) -> tuple[dict, dict]:
    start = _from_amp(clip, motion, rest, 0.0, intensity, turns)
    end = _from_amp(clip, motion, rest, 1.0, intensity, turns)
    if motion == "spin":
        start = dict(rest)
        end = dict(rest)
        end["rotation"] = rest["rotation"] + 360.0 * turns
    if motion == "pulse":
        start = dict(rest)
        start["scale"] = rest["scale"] * 0.72
        end = dict(rest)
    return start, end


def build_motion_items(
    clip: Any,
    motion: str,
    duration: Optional[float] = None,
    intensity: float = 1.0,
    turns: float = 1.0,
    envelope: Optional[list] = None,
) -> list[dict]:
    """Genera items de keyframes para un preset (y opcionalmente una envolvente)."""
    motion = normalize_motion(motion)
    rest = _rest(clip)
    clip_dur = max(0.05, clip_timeline_duration(clip))
    inten = max(0.15, min(2.0, _num(intensity, 1.0)))
    nturns = max(0.25, min(4.0, _num(turns, 1.0)))
    env = parse_envelope(envelope)
    if env:
        if motion in _APPEAR:
            env = hold_after_peak(env)
        items = []
        for i, (t, amp) in enumerate(env):
            if t > clip_dur + 0.02:
                continue
            interp = "linear" if i else "ease-out"
            props = _from_amp(clip, motion, rest, amp, inten, nturns)
            items.append(_item(min(clip_dur, t), props, interp))
        if items and items[-1]["t"] < clip_dur - 0.04:
            if motion in _APPEAR:
                hold = dict(items[-1]["props"])
                items.append(_item(clip_dur, hold, "linear"))
            else:
                last_amp = env[-1][1]
                items.append(_item(clip_dur, _from_amp(clip, motion, rest, last_amp, inten, nturns), "ease-out"))
        return items or [_item(0.0, rest, "linear")]

    window = duration if duration is not None else 0.45
    window = min(max(0.08, _num(window, 0.45)), max(0.08, clip_dur * 0.9))
    start, end = _preset_pair(clip, motion, rest, inten, nturns)
    if motion == "pop":
        mid = dict(rest)
        mid["scale"] = rest["scale"] * (1.0 + 0.08 * inten)
        return [
            _item(0.0, start, "ease-out"),
            _item(window * 0.55, mid, "ease-out"),
            _item(window, dict(rest), "ease-in"),
        ]
    if motion == "spin":
        window = clip_dur
    if motion == "fade_out":
        t0 = max(0.0, clip_dur - window)
        return [
            _item(0.0, rest, "linear"),
            _item(t0, rest, "ease-in"),
            _item(clip_dur, end, "ease-in"),
        ]
    items = [
        _item(0.0, start, "ease-out"),
        _item(window, end, "ease-out"),
    ]
    if window < clip_dur - 0.05 and motion not in ("spin", "fade_out", "zoom_in", "zoom_out"):
        items.append(_item(clip_dur, dict(rest), "linear"))
    return items


def merge_visual_keyframes(clip: Any, items: list[dict]) -> dict:
    """Sustituye keyframes visuales; conserva volume/fx muestreados en cada ``t``."""
    data = clip if isinstance(clip, dict) else clip.model_dump()
    merged = []
    for it in items:
        t = _num(it.get("t"), 0.0)
        base = clip_props_at(data, t)
        props = dict(base)
        extra = it.get("props") if isinstance(it.get("props"), dict) else {}
        for k in _POSE:
            if k in extra:
                props[k] = extra[k]
        merged.append({
            "id": it.get("id") or _uid(),
            "t": round(t, 3),
            "interpolation": it.get("interpolation") or "ease-out",
            "props": props,
        })
    return {"enabled": True, "items": merged}
