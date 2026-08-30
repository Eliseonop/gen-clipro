"""Si un clip de la timeline aporta audio al mix (preview y ffmpeg)."""


def clip_mixes_audio(clip, track) -> bool:
    """False si la pista o el clip están silenciados."""
    return (not getattr(track, "muted", False)) and (not getattr(clip, "muted", False))
