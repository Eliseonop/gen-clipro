"""Transcripción de vídeos de YouTube con faster-whisper (STT).

Descarga solo el audio y lo transcribe en segmentos con marcas de tiempo,
para tener el "guion" del vídeo. Los modelos se descargan y cachean solos la
primera vez (tiny ~75MB … large-v3 ~3GB).
"""
from __future__ import annotations

import logging
import tempfile
import threading
from pathlib import Path
from typing import Callable, Optional

from faster_whisper import WhisperModel

from . import gpu, ytdlp

log = logging.getLogger("videoyt.transcribe")

ProgressCb = Callable[[float, str], None]

# Modelos válidos (de más rápido/menos preciso a más lento/más preciso).
MODELS = ["tiny", "base", "small", "medium", "large-v3"]

_models: dict[str, tuple[str, WhisperModel]] = {}
_infer_lock = threading.Lock()


def _attr(w, name, default=None):
    """Lee un campo de un Word de faster-whisper (objeto) o de un dict."""
    if isinstance(w, dict):
        return w.get(name, default)
    return getattr(w, name, default)


def shape_words(raw) -> list[dict]:
    """Normaliza las palabras de un segmento a dicts persistibles.

    Descarta palabras vacías o sin marcas de tiempo. ``text`` viene con un
    espacio inicial desde el modelo, se recorta. Función pura (testeable sin
    cargar Whisper).
    """
    out: list[dict] = []
    for w in raw or []:
        text = (_attr(w, "word", "") or "").strip()
        start = _attr(w, "start")
        end = _attr(w, "end")
        if not text or start is None or end is None:
            continue
        prob = _attr(w, "probability")
        item = {"text": text, "start": round(float(start), 2), "end": round(float(end), 2)}
        if prob is not None:
            item["prob"] = round(float(prob), 3)
        out.append(item)
    return out


def _get_model(size: str) -> tuple[str, WhisperModel]:
    """Carga (y cachea) un modelo. Usa GPU (cuda/float16) si hay; si no, o si la
    carga en CUDA falla (faltan cuBLAS/cuDNN), cae a CPU (int8)."""
    cached = _models.get(size)
    if cached is not None:
        return cached
    device, compute = gpu.whisper_device()
    try:
        model = WhisperModel(size, device=device, compute_type=compute)
        log.info("Whisper '%s' cargado en %s (%s).", size, device, compute)
    except Exception as exc:  # noqa: BLE001 - fallback seguro a CPU
        if device == "cpu":
            raise
        log.warning("Whisper en %s falló (%s); usando CPU (int8).", device, exc)
        device, compute = "cpu", "int8"
        model = WhisperModel(size, device=device, compute_type=compute)
        log.info("Whisper '%s' cargado en cpu (int8).", size)
    _models[size] = (device, model)
    return device, model


def _download_audio(url: str, dest_dir: Path, on_progress: ProgressCb) -> Path:
    outtmpl = str(dest_dir / "audio.%(ext)s")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
    }

    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            frac = (done / total) if total else 0.0
            on_progress(0.15 * frac, "Descargando audio…")

    opts["progress_hooks"] = [hook]
    ytdlp.call(opts, lambda ydl: ydl.download([url]))

    files = list(dest_dir.glob("audio.*"))
    if not files:
        raise RuntimeError("No se pudo descargar el audio del vídeo.")
    return files[0]


def _collect_segments(segments, info, on_progress: ProgressCb, base: float) -> dict:
    total = info.duration or 0.0
    out: list[dict] = []
    for s in segments:
        out.append({
            "start": round(s.start, 2),
            "end": round(s.end, 2),
            "text": s.text.strip(),
            "words": shape_words(getattr(s, "words", None)),
        })
        if total:
            on_progress(min(0.99, base + (1 - base) * (s.end / total)), "Transcribiendo…")
    return {"language": info.language, "duration": round(total, 1), "segments": out}


def _transcribe_path(path: str, model_size: str, language: Optional[str],
                     on_progress: ProgressCb, base: float = 0.3) -> dict:
    """Transcribe un archivo de audio/vídeo ya en disco."""
    if model_size not in MODELS:
        model_size = "base"

    on_progress(base * 0.66, f"Cargando modelo {model_size}…")
    with _infer_lock:
        device, model = _get_model(model_size)
        on_progress(base, f"Transcribiendo ({device})…")
        log.info("Whisper '%s' infiriendo en %s: %s", model_size, device, path)
        try:
            segments, info = model.transcribe(
                str(path), language=language or None, word_timestamps=True,
            )
            result = _collect_segments(segments, info, on_progress, base)
        except Exception as exc:  # noqa: BLE001
            if device == "cpu":
                raise
            log.warning("Whisper CUDA falló al inferir (%s); reintento en CPU.", exc)
            gpu.mark_cuda_broken()
            _models.pop(model_size, None)
            device, model = _get_model(model_size)
            on_progress(base, "Transcribiendo (cpu)…")
            segments, info = model.transcribe(
                str(path), language=language or None, word_timestamps=True,
            )
            result = _collect_segments(segments, info, on_progress, base)
        log.info("Whisper '%s' listo: %s segmentos.", model_size, len(result["segments"]))
        return result


def run(url: str, model_size: str, language: Optional[str], on_progress: ProgressCb) -> dict:
    """Descarga el audio del vídeo de YouTube y lo transcribe."""
    with tempfile.TemporaryDirectory() as tmp:
        audio = _download_audio(url, Path(tmp), on_progress)
        return _transcribe_path(str(audio), model_size, language, on_progress, base=0.3)


def run_file(path: str, model_size: str, language: Optional[str], on_progress: ProgressCb) -> dict:
    """Transcribe un archivo local (p.ej. el propio clip). Sin descarga."""
    return _transcribe_path(path, model_size, language, on_progress, base=0.25)
