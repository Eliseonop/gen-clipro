"""Narrador con voz IA (TTS) usando Piper — voces en español mexicano (es_MX).

A diferencia de Kokoro (que corre embebido con onnxruntime), aquí usamos el
binario oficial de Piper vía subprocess. Motivo: en Python 3.14 + Windows los
wheels de piper-tts/piper-phonemize son problemáticos, y el binario ya trae
espeak-ng incluido, así que "just works" sin depender de pip.

Instalación: ejecuta ``python get_piper.py`` en backend/ (descarga el binario y
las voces mexicanas), o coloca a mano:
  - binario:  backend/models/piper/piper(.exe)
  - voces:    backend/models/piper/voices/<voz>.onnx  (+ .onnx.json)
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

import numpy as np
import soundfile as sf

from . import config
from .tts import _split_units   # misma división en frases que Kokoro (prosodia)

ProgressCb = Callable[[float, str], None]

_DIR = config.BASE_DIR / "models" / "piper"
_VOICES_DIR = _DIR / "voices"


def _binary() -> Path | None:
    name = "piper.exe" if sys.platform.startswith("win") else "piper"
    for cand in (_DIR / name, _DIR / "piper" / name):
        if cand.exists():
            return cand
    return None


def _voice_files() -> list[Path]:
    """Todos los modelos .onnx de voz disponibles (en voices/ o en la raíz)."""
    found: list[Path] = []
    for folder in (_VOICES_DIR, _DIR):
        if folder.exists():
            found += sorted(folder.glob("*.onnx"))
    # de-duplica por nombre conservando el orden
    seen: set[str] = set()
    unique: list[Path] = []
    for p in found:
        if p.name not in seen:
            seen.add(p.name)
            unique.append(p)
    return unique


def available() -> bool:
    return _binary() is not None and len(_voice_files()) > 0


def _label_for(stem: str) -> str:
    """'es_MX-ald-medium' -> 'Ald — es_MX (medium)'."""
    parts = stem.split("-")
    region = parts[0] if parts else stem
    name = parts[1].capitalize() if len(parts) > 1 else stem
    quality = parts[2] if len(parts) > 2 else ""
    tail = f" ({quality})" if quality else ""
    return f"{name} — {region}{tail}"


def list_voices() -> list[dict]:
    return [{"id": p.stem, "label": _label_for(p.stem)} for p in _voice_files()]


def _resolve_voice(voice: str) -> Path:
    for p in _voice_files():
        if p.stem == voice:
            return p
    raise RuntimeError(f"Voz de Piper no encontrada: {voice}")


def run(
    text: str,
    voice: str,
    speed: float,
    out_path: Path,
    on_progress: ProgressCb,
    pause: float = 0.4,
    **_ignored,   # voice2/blend no aplican a Piper; se ignoran
) -> dict:
    """Genera el WAV en ``out_path``. Devuelve {duration, sample_rate}.

    Sintetiza frase por frase (una llamada al binario por unidad) y concatena
    con silencios entre frases — mismo comportamiento de pausas que Kokoro.
    ``speed`` se traduce a ``length_scale = 1/speed`` (más rápido = escala menor).
    """
    binary = _binary()
    if binary is None:
        raise RuntimeError(
            "Piper no está instalado. Ejecuta 'python get_piper.py' en backend/ "
            "para descargar el binario y las voces mexicanas."
        )
    model = _resolve_voice(voice)
    length_scale = 1.0 / max(0.1, float(speed))

    units = _split_units(text)
    sr = 22050
    pieces: list[np.ndarray] = []

    with tempfile.TemporaryDirectory() as td:
        tmp_wav = Path(td) / "unit.wav"
        for i, unit in enumerate(units):
            on_progress(i / len(units), f"Generando voz (Piper)… ({i + 1}/{len(units)})")
            cmd = [
                str(binary),
                "--model", str(model),
                "--output_file", str(tmp_wav),
                "--length_scale", f"{length_scale:.3f}",
            ]
            cfg = model.with_suffix(model.suffix + ".json")
            if cfg.exists():
                cmd += ["--config", str(cfg)]
            proc = subprocess.run(
                cmd, input=unit.encode("utf-8"),
                capture_output=True, timeout=120,
            )
            if proc.returncode != 0 or not tmp_wav.exists():
                err = proc.stderr.decode("utf-8", "ignore")[-300:]
                raise RuntimeError(f"Piper falló: {err or 'sin salida'}")
            data, sr = sf.read(str(tmp_wav), dtype="float32")
            if data.ndim > 1:                 # a mono por si acaso
                data = data.mean(axis=1)
            pieces.append(data)
            if i < len(units) - 1 and pause > 0:
                pieces.append(np.zeros(int(pause * sr), dtype=np.float32))

    audio = np.concatenate(pieces) if pieces else np.zeros(1, dtype=np.float32)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), audio, sr)

    return {"duration": round(len(audio) / sr, 2), "sample_rate": sr}
