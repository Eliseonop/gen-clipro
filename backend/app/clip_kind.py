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


def ffmpeg_trim_window(clip) -> tuple[float, float]:
    """Ventana de ``trim`` sobre el input de ffmpeg.

    El still se genera con ``-loop`` y timestamps desde 0, de duración
    ``out - in``. Recortar con in/out de fuente dejaría el stream vacío
    tras un split.
    """
    inp, out = _in_out(clip)
    if is_still_clip(clip):
        return 0.0, max(out - inp, 0.1)
    return inp, out


def ffmpeg_input_args(clip, path, fps: int) -> list[str]:
    """Args ``-i`` de un clip. Still: loop; vídeo/audio: archivo tal cual."""
    p = str(path if isinstance(path, Path) else path)
    if is_still_clip(clip):
        _, dur = ffmpeg_trim_window(clip)
        t = dur + 0.05
        return ["-loop", "1", "-framerate", str(int(fps)), "-t", f"{t:.3f}", "-i", p]
    return ["-i", p]

