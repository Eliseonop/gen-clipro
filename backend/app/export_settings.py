"""FPS y calidad de export (Configuración del editor)."""
from __future__ import annotations

FPS_CHOICES = (24, 25, 30, 50, 60)
QUALITY = {
    "draft": {"crf": 28, "preset": "veryfast"},
    "standard": {"crf": 23, "preset": "fast"},
    "high": {"crf": 18, "preset": "medium"},
}
DEFAULT = {"fps": 30, "quality": "standard"}


def normalize(raw) -> dict:
    data = raw if isinstance(raw, dict) else {}
    try:
        fps = int(data.get("fps") or DEFAULT["fps"])
    except (TypeError, ValueError):
        fps = DEFAULT["fps"]
    if fps not in FPS_CHOICES:
        fps = DEFAULT["fps"]
    quality = data.get("quality") or DEFAULT["quality"]
    if quality not in QUALITY:
        quality = DEFAULT["quality"]
    return {"fps": fps, "quality": quality}


def load() -> dict:
    from . import settings
    return normalize((settings.load() or {}).get("export"))


def encoder_quality() -> tuple[int, str]:
    q = QUALITY[load()["quality"]]
    return int(q["crf"]), str(q["preset"])
