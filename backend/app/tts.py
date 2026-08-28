"""Narrador con voz IA (TTS) usando Kokoro (ONNX).

Kokoro-onnx corre nativo en Python 3.14 (vía onnxruntime), así que va en el
backend principal. Voces predefinidas, licencia Apache-2.0 (apta para monetizar).
Genera un WAV con pausas naturales entre párrafos.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import soundfile as sf

from . import config

ProgressCb = Callable[[float, str], None]

_MODEL = config.BASE_DIR / "models" / "kokoro-v1.0.onnx"
_VOICES = config.BASE_DIR / "models" / "voices-v1.0.bin"

# Voces ofrecidas (id de Kokoro + idioma de fonemización).
VOICES = [
    {"id": "ef_dora", "label": "Dora — mujer (ES)", "lang": "es"},
    {"id": "em_alex", "label": "Alex — hombre (ES)", "lang": "es"},
    {"id": "em_santa", "label": "Santa — hombre (ES)", "lang": "es"},
    {"id": "af_heart", "label": "Heart — mujer (EN)", "lang": "en-us"},
    {"id": "am_adam", "label": "Adam — hombre (EN)", "lang": "en-us"},
]
_LANG = {v["id"]: v["lang"] for v in VOICES}

_kokoro = None


def available() -> bool:
    return _MODEL.exists() and _VOICES.exists()


def _get_kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        _kokoro = Kokoro(str(_MODEL), str(_VOICES))
    return _kokoro


def _split_units(text: str) -> list[str]:
    """Divide en frases (por puntuación y saltos de línea) para mejor prosodia."""
    parts = re.split(r"(?<=[.!?…:])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()] or [text.strip()]


def run(
    text: str,
    voice: str,
    speed: float,
    out_path: Path,
    on_progress: ProgressCb,
    voice2: str | None = None,
    blend: float = 0.5,
    pause: float = 0.4,
) -> dict:
    """Genera el WAV en ``out_path``. Devuelve {duration, sample_rate}.

    - ``voice2``+``blend``: mezcla dos voces (timbre propio, menos "de fábrica").
    - ``pause``: silencio entre frases (pacing más natural).
    """
    if not available():
        raise RuntimeError("Faltan los modelos de Kokoro en backend/models (ver README).")

    lang = _LANG.get(voice, "es")
    kokoro = _get_kokoro()

    # Voz: nombre simple, o mezcla de dos estilos.
    voice_arg = voice
    if voice2:
        w = max(0.0, min(1.0, float(blend)))
        style = w * kokoro.get_voice_style(voice) + (1.0 - w) * kokoro.get_voice_style(voice2)
        voice_arg = style.astype(np.float32)

    units = _split_units(text)
    sr = 24000
    gap = np.zeros(int(max(0.0, pause) * sr), dtype=np.float32)

    pieces: list[np.ndarray] = []
    for i, unit in enumerate(units):
        on_progress(i / len(units), f"Generando voz… ({i + 1}/{len(units)})")
        samples, sr = kokoro.create(unit, voice=voice_arg, speed=float(speed), lang=lang)
        pieces.append(samples.astype(np.float32))
        if i < len(units) - 1 and gap.size:
            pieces.append(gap)

    audio = np.concatenate(pieces) if pieces else np.zeros(1, dtype=np.float32)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), audio, sr)

    return {"duration": round(len(audio) / sr, 2), "sample_rate": sr}
