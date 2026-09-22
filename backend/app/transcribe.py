"""Transcripción de vídeos de YouTube con faster-whisper (STT).

Descarga solo el audio y lo transcribe en segmentos con marcas de tiempo,
para tener el "guion" del vídeo. Los modelos se descargan y cachean solos la
primera vez (tiny ~75MB … large-v3 ~3GB).

Usa BatchedInferencePipeline (4-12× más rápido) con batch size adaptativo
según la VRAM libre, igual que el proyecto transcryp.
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Callable, Optional

from faster_whisper import WhisperModel
try:
    from faster_whisper import BatchedInferencePipeline
except ImportError:
    BatchedInferencePipeline = None  # type: ignore[assignment,misc]

from . import gpu, transcribe_settings, ytdlp

log = logging.getLogger("videoyt.transcribe")

ProgressCb = Callable[[float, str], None]

# Modelos válidos (de más rápido/menos preciso a más lento/más preciso).
MODELS = list(transcribe_settings.MODELS)

_models: dict[str, tuple[str, WhisperModel]] = {}
_pipelines: dict[str, object] = {}
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


def _vram_libre_mb() -> int:
    """MB de VRAM libre en la GPU 0 (nvidia-smi). 0 si no se puede leer."""
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits", "--id=0"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            return int(r.stdout.strip().split("\n")[0])
    except Exception:  # noqa: BLE001
        pass
    return 0


def _batch_size(device: str, model_size: str) -> int:
    """Elige batch size adaptativo según VRAM libre (como transcryp)."""
    if device != "cuda":
        return max(4, os.cpu_count() or 4)
    libre = _vram_libre_mb()
    if model_size == "large-v3":
        if libre < 6000:
            return 4
        if libre < 11000:
            return 8
        return 16
    return 16


def _get_model(size: str) -> tuple[str, WhisperModel]:
    """Carga (y cachea) un modelo. Usa GPU (cuda/float16) si hay; si no, o si la
    carga en CUDA falla (faltan cuBLAS/cuDNN), cae a CPU (int8)."""
    cached = _models.get(size)
    if cached is not None:
        return cached
    device, compute = gpu.whisper_device()
    cpu_threads = (os.cpu_count() or 4) if device == "cpu" else 4
    try:
        model = WhisperModel(size, device=device, compute_type=compute,
                             cpu_threads=cpu_threads)
        log.info("Whisper '%s' cargado en %s (%s), threads=%d.", size, device, compute, cpu_threads)
    except Exception as exc:  # noqa: BLE001 - fallback seguro a CPU
        if device == "cpu":
            raise
        log.warning("Whisper en %s falló (%s); usando CPU (int8).", device, exc)
        device, compute = "cpu", "int8"
        cpu_threads = os.cpu_count() or 4
        model = WhisperModel(size, device=device, compute_type=compute,
                             cpu_threads=cpu_threads)
        log.info("Whisper '%s' cargado en cpu (int8), threads=%d.", size, cpu_threads)
    _models[size] = (device, model)
    return device, model


def _get_pipeline(size: str) -> tuple[str, object, int]:
    """Devuelve el pipeline batched + batch_size óptimo para el modelo.

    Si BatchedInferencePipeline no está disponible (faster-whisper <1.0),
    devuelve el modelo directo con batch_size=0 (modo secuencial).
    """
    device, model = _get_model(size)
    if BatchedInferencePipeline is None:
        return device, model, 0
    if size not in _pipelines:
        _pipelines[size] = BatchedInferencePipeline(model=model)
        log.info("BatchedInferencePipeline creado para '%s'.", size)
    bs = _batch_size(device, size)
    return device, _pipelines[size], bs


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


def _do_transcribe(pipeline, path: str, language: Optional[str], bs: int):
    """Llama a transcribe con o sin batch_size según el pipeline."""
    kwargs: dict = {"language": language or None, "word_timestamps": True}
    if bs > 0:
        kwargs["batch_size"] = bs
    return pipeline.transcribe(str(path), **kwargs)


def _transcribe_path(path: str, model_size: str, language: Optional[str],
                     on_progress: ProgressCb, base: float = 0.3) -> dict:
    """Transcribe un archivo de audio/vídeo ya en disco (batched pipeline)."""
    model_size = transcribe_settings.resolve(model_size)

    on_progress(base * 0.66, f"Cargando modelo {model_size}…")
    with _infer_lock:
        device, pipeline, bs = _get_pipeline(model_size)
        mode = f"batch={bs}" if bs else "secuencial"
        on_progress(base, f"Transcribiendo ({device}, {mode})…")
        log.info("Whisper '%s' %s en %s: %s", model_size, mode, device, path)
        try:
            segments, info = _do_transcribe(pipeline, path, language, bs)
            result = _collect_segments(segments, info, on_progress, base)
        except Exception as exc:  # noqa: BLE001
            if device == "cpu":
                raise
            log.warning("Whisper CUDA falló al inferir (%s); reintento en CPU.", exc)
            gpu.mark_cuda_broken()
            _models.pop(model_size, None)
            _pipelines.pop(model_size, None)
            device, pipeline, bs = _get_pipeline(model_size)
            mode = f"batch={bs}" if bs else "secuencial"
            on_progress(base, f"Transcribiendo (cpu, {mode})…")
            segments, info = _do_transcribe(pipeline, path, language, bs)
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
