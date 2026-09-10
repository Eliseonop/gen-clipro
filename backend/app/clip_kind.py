"""Familias de clip ↔ pista. Permite tipos nuevos sin rehacer la timeline.

Las pistas siguen siendo video / audio / text. Un clip de imagen es visual:
vive en pistas de vídeo igual que un clip de vídeo.
"""
from __future__ import annotations

from pathlib import Path

CLIP_TRACK_KIND = {
    "video": "video",
    "image": "video",
    "shape": "video",
    "motion": "video",   # motion graphic (Motion Studio): overlay con alfa en pista de vídeo
    "audio": "audio",
    "text": "text",
}

VISUAL_CLIP_KINDS = frozenset({"video", "image"})
GENERATED_DURATION_KINDS = frozenset({"text", "image", "shape"})
STILL_KINDS = frozenset({"image", "shape"})

ASSET_DISK_KIND = {
    "clips": "video",
    "audios": "audio",
    "images": "image",
    "sfx": "sfx",
    "motion": "motion",
}

IMAGE_DEFAULT_DUR = 5.0


def track_kind_for_clip(clip_kind: str) -> str:
    k = CLIP_TRACK_KIND.get(clip_kind)
    if k is None:
        raise ValueError(f"kind de clip inválido: {clip_kind}")
    return k


def clip_fits_track(clip_kind: str, track_kind: str) -> bool:
    return track_kind_for_clip(clip_kind) == track_kind


def is_visual_clip(clip) -> bool:
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    return kind in VISUAL_CLIP_KINDS


def is_still_clip(clip) -> bool:
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    asset = clip.get("asset_kind") if isinstance(clip, dict) else getattr(clip, "asset_kind", None)
    return kind in STILL_KINDS or asset == "images"


def has_generated_duration(clip) -> bool:
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    return kind in GENERATED_DURATION_KINDS


def _in_out(clip) -> tuple[float, float]:
    inp = float(clip.get("in_point") if isinstance(clip, dict) else getattr(clip, "in_point", 0) or 0)
    out = float(clip.get("out_point") if isinstance(clip, dict) else getattr(clip, "out_point", 0) or 0)
    return inp, out


_LAST_FRAME_PULL = 0.04


def ffmpeg_trim_window(clip, fps: int = 30) -> tuple[float, float]:
    """Ventana de ``trim`` sobre el input de ffmpeg.

    El still se genera con ``-loop`` y timestamps desde 0, de duración
    ``out - in``. Recortar con in/out de fuente dejaría el stream vacío
    tras un split.

    En vídeo, pedir exactamente EOF (out == source_duration) deja un
    fotograma negro al final; recortamos un pelín antes.
    """
    inp, out = _in_out(clip)
    if is_still_clip(clip):
        return 0.0, max(out - inp, 0.1)
    src = float(clip.get("source_duration") if isinstance(clip, dict) else getattr(clip, "source_duration", 0) or 0)
    if src > 0 and out >= src - 1e-4:
        frame = 1.0 / max(1, int(fps) or 30)
        pull = max(_LAST_FRAME_PULL, frame)
        out = max(inp + 1e-3, src - pull)
    return inp, out


def ffmpeg_input_args(clip, path, fps: int) -> list[str]:
    """Args ``-i`` de un clip. Still: loop; vídeo/audio: archivo tal cual.

    Motion graphic (WebM VP9 con alfa): fuerza el decoder ``libvpx-vp9``. El
    decoder VP9 por defecto de FFmpeg NO expone el plano alfa, así que la zona
    transparente saldría negra al componer el overlay sobre la timeline.
    """
    p = str(path if isinstance(path, Path) else path)
    kind = clip.get("kind") if isinstance(clip, dict) else getattr(clip, "kind", None)
    if kind == "motion":
        return ["-c:v", "libvpx-vp9", "-i", p]
    if is_still_clip(clip):
        _, dur = ffmpeg_trim_window(clip)
        t = dur + 0.05
        if p.lower().endswith(".gif"):
            # GIF (posiblemente animado): leerlo con su propio demuxer y repetirlo
            # en bucle hasta cubrir la duración del clip. NUNCA usar ``-loop 1``:
            # es opción del demuxer image2, no del de gif; en muchas builds de
            # FFmpeg rompe la apertura del input ("Option loop not found") y en
            # otras congela el primer fotograma. ``-ignore_loop 0`` repite la
            # animación (o el frame único de un gif estático) y ``-t`` la acota.
            # Con ``loop=False`` se reproduce una vez (``-ignore_loop 1``); el
            # overlay del compose mantiene el último fotograma con eof_action=repeat.
            loop = clip.get("loop") if isinstance(clip, dict) else getattr(clip, "loop", None)
            ignore = "1" if loop is False else "0"
            return ["-ignore_loop", ignore, "-t", f"{t:.3f}", "-i", p]
        return ["-loop", "1", "-framerate", str(int(fps)), "-t", f"{t:.3f}", "-i", p]
    return ["-i", p]

