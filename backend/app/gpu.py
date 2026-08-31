"""Selección de aceleración por hardware (GPU) con *fallback* seguro a CPU.

Decide, una sola vez y de forma centralizada, **qué device usa Whisper** y **qué
codificador de vídeo usa FFmpeg**, a partir del diagnóstico de la máquina
(``diagnostics.probe``). Si hay GPU la usa; si no la hay o algo falla, cae a CPU
(``libx264`` / whisper ``int8``) sin romper nada.

Override por entorno::

    VIDEOYT_GPU=0 | cpu | off | false | no   → fuerza CPU en todo
    VIDEOYT_GPU=1 | auto  (o sin definir)     → auto-detección (por defecto)

El resto del pipeline solo llama a ``whisper_device()`` y ``video_encoder_args()``
— no repite la lógica de detección.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from functools import lru_cache

from . import config

log = logging.getLogger("videoyt.gpu")

# Codificadores por hardware que sabemos manejar, por orden de preferencia.
_HW_ENCODER_PREF = ("h264_nvenc", "h264_qsv", "h264_amf")


def _gpu_disabled() -> bool:
    v = (os.environ.get("VIDEOYT_GPU") or "").strip().lower()
    return v in ("0", "cpu", "off", "false", "no")


@lru_cache(maxsize=1)
def cuda_available() -> bool:
    """¿Hay CUDA para faster-whisper? (vía CTranslate2, su backend real)."""
    if _gpu_disabled():
        return False
    try:
        import ctranslate2
        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001 - sin CT2/CUDA → CPU
        return False


def _encoder_args_for(name: str) -> list[str]:
    """Args de FFmpeg para un codificador concreto (calidad ~ CRF configurado)."""
    q = str(config.VIDEO_CRF)
    if name.endswith("nvenc"):
        # Calidad constante (-cq). OJO: '-rc vbr -b:v 0' rompe en algunos builds.
        return ["-c:v", name, "-preset", "p5", "-cq", q]
    if name == "h264_qsv":
        return ["-c:v", name, "-global_quality", q, "-preset", "medium"]
    if name == "h264_amf":
        return ["-c:v", name, "-rc", "cqp", "-qp_i", q, "-qp_p", q, "-qp_b", q]
    return ["-c:v", "libx264", "-crf", q, "-preset", config.VIDEO_PRESET]


def _encoder_works(name: str) -> bool:
    """Sonda real: codifica 1 fotograma para confirmar que el encoder abre.

    Estar LISTADO en ``ffmpeg -encoders`` no garantiza que funcione (driver,
    hardware, sesión NVENC). Esta prueba evita elegir un encoder que luego
    reventaría el render.
    """
    exe = shutil.which("ffmpeg")
    if not exe:
        return False
    tmp = os.path.join(tempfile.gettempdir(), f"videoyt_encprobe_{name}.mp4")
    cmd = [exe, "-y", "-hide_banner", "-loglevel", "error",
           "-f", "lavfi", "-i", "testsrc=duration=0.1:size=64x64:rate=5",
           *_encoder_args_for(name), "-frames:v", "1", "-pix_fmt", "yuv420p", tmp]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return r.returncode == 0 and os.path.exists(tmp) and os.path.getsize(tmp) > 0
    except Exception:  # noqa: BLE001
        return False
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:  # noqa: BLE001
            pass


@lru_cache(maxsize=1)
def hw_encoder() -> str | None:
    """Codificador HW a usar (listado Y que pasa la sonda), o ``None`` → libx264."""
    if _gpu_disabled():
        return None
    try:
        from . import diagnostics
        available = set(diagnostics.probe().get("ffmpeg", {}).get("hw_encoders", []))
    except Exception:  # noqa: BLE001
        return None
    for name in _HW_ENCODER_PREF:
        if name in available and _encoder_works(name):
            return name
        if name in available:
            log.warning("Encoder '%s' está listado pero no encoda; se descarta.", name)
    return None


def whisper_device() -> tuple[str, str]:
    """Devuelve ``(device, compute_type)`` para ``WhisperModel``."""
    if cuda_available():
        return "cuda", "float16"
    return "cpu", "int8"


def video_encoder_args() -> list[str]:
    """Args de FFmpeg para el vídeo — *drop-in* de ``-c:v libx264 -crf .. -preset ..``."""
    return _encoder_args_for(selected_encoder())


def selected_encoder() -> str:
    """Nombre del codificador que se usará (para logs/diagnóstico)."""
    return hw_encoder() or "libx264"


def summary() -> dict:
    """Resumen de la selección efectiva (para el informe de arranque / diagnóstico)."""
    dev, ct = whisper_device()
    return {
        "gpu_disabled": _gpu_disabled(),
        "whisper_device": dev,
        "whisper_compute": ct,
        "video_encoder": selected_encoder(),
    }


def _reset_cache() -> None:
    """Solo para tests: re-evalúa la detección (limpia los lru_cache)."""
    cuda_available.cache_clear()
    hw_encoder.cache_clear()
