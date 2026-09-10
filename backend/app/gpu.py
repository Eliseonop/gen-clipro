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

_HW_ENCODER_PREF = ("h264_nvenc", "h264_qsv", "h264_amf")
_CUBLAS_DLLS = ("cublas64_12.dll", "cublasLt64_12.dll", "cublas64_11.dll")
_cuda_broken = False


def _gpu_disabled() -> bool:
    v = (os.environ.get("VIDEOYT_GPU") or "").strip().lower()
    return v in ("0", "cpu", "off", "false", "no")


def _dll_loads(name: str) -> bool:
    try:
        import ctypes
        ctypes.WinDLL(name)
        return True
    except OSError:
        return False


def _add_nvidia_dll_dirs() -> None:
    if os.name != "nt":
        return
    try:
        import nvidia
    except Exception:  # noqa: BLE001
        return
    root = os.path.dirname(nvidia.__file__)
    for dirpath, _dirnames, filenames in os.walk(root):
        if any(f.lower().endswith(".dll") for f in filenames):
            try:
                os.add_dll_directory(dirpath)
            except (OSError, AttributeError):
                pass


def _cuda_libs_ok() -> bool:
    """CTranslate2 puede ver la GPU y aun así no inferir si falta cuBLAS."""
    if os.name != "nt":
        return True
    _add_nvidia_dll_dirs()
    if any(_dll_loads(name) for name in _CUBLAS_DLLS):
        return True
    log.warning(
        "GPU CUDA visible pero no se puede cargar cuBLAS (%s). "
        "Whisper usará CPU. Para GPU: CUDA Toolkit o "
        "`pip install nvidia-cublas-cu12 nvidia-cudnn-cu12`.",
        ", ".join(_CUBLAS_DLLS),
    )
    return False


def mark_cuda_broken() -> None:
    global _cuda_broken
    _cuda_broken = True
    cuda_available.cache_clear()
    log.warning("CUDA no usable para Whisper; se usará CPU.")


@lru_cache(maxsize=1)
def cuda_available() -> bool:
    """¿CUDA sirve de verdad para faster-whisper? (dispositivo + cuBLAS)."""
    if _gpu_disabled() or _cuda_broken:
        return False
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() <= 0:
            return False
    except Exception:  # noqa: BLE001 - sin CT2/CUDA → CPU
        return False
    return _cuda_libs_ok()


def _encoder_args_for(name: str, crf: int | None = None, preset: str | None = None) -> list[str]:
    """Args de FFmpeg para un codificador concreto (calidad ~ CRF configurado)."""
    q = str(config.VIDEO_CRF if crf is None else crf)
    p = preset or config.VIDEO_PRESET
    if name.endswith("nvenc"):
        # Calidad constante (-cq). OJO: '-rc vbr -b:v 0' rompe en algunos builds.
        return ["-c:v", name, "-preset", "p5", "-cq", q]
    if name == "h264_qsv":
        return ["-c:v", name, "-global_quality", q, "-preset", "medium"]
    if name == "h264_amf":
        return ["-c:v", name, "-rc", "cqp", "-qp_i", q, "-qp_p", q, "-qp_b", q]
    return ["-c:v", "libx264", "-crf", q, "-preset", p]


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
    crf, preset = None, None
    try:
        from .export_settings import encoder_quality
        crf, preset = encoder_quality()
    except Exception:  # noqa: BLE001
        pass
    return _encoder_args_for(selected_encoder(), crf, preset)


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
        **onnx_summary(),
    }


def _reset_cache() -> None:
    """Solo para tests: re-evalúa la detección (limpia los lru_cache)."""
    global _cuda_broken
    _cuda_broken = False
    cuda_available.cache_clear()
    hw_encoder.cache_clear()
    _ort_available.cache_clear()


# --- ONNX Runtime (segmentación de Eliminar fondo) --------------------------
#
# Misma filosofía que el resto del módulo: se decide UNA vez, con sonda real, y
# si algo falla se cae a CPU sin romper nada. La preferencia se puede fijar en
# Configuración (``bg_removal.device``) además del override global VIDEOYT_GPU.

_ORT_PREF = {
    "cuda": ("CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider"),
    "dml": ("DmlExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"),
    "cpu": ("CPUExecutionProvider",),
}
_ORT_DEVICES = ("auto", "cuda", "dml", "cpu")


@lru_cache(maxsize=1)
def _ort_available() -> tuple[str, ...]:
    try:
        import onnxruntime as ort
        return tuple(ort.get_available_providers())
    except Exception:  # noqa: BLE001 - sin onnxruntime → el proveedor avisa
        return ()


def onnx_providers(device: str = "auto") -> list[str]:
    """Lista de *execution providers* de ONNX Runtime, mejor primero.

    ``device``: auto | cuda | dml | cpu. Siempre termina en CPU (salvo que se
    pida CPU explícitamente), así que nunca se queda sin proveedor válido.
    """
    dev = (device or "auto").strip().lower()
    if dev not in _ORT_DEVICES:
        dev = "auto"
    if _gpu_disabled():
        dev = "cpu"
    available = _ort_available()
    if not available:
        return []
    if dev == "auto":
        pref = _ORT_PREF["cuda"]
    else:
        pref = _ORT_PREF[dev]
    picked = [p for p in pref if p in available]
    if "CPUExecutionProvider" in available and "CPUExecutionProvider" not in picked:
        picked.append("CPUExecutionProvider")
    if dev in ("cuda", "dml") and picked and picked[0] == "CPUExecutionProvider":
        log.warning(
            "Se pidió '%s' para Eliminar fondo pero onnxruntime solo ofrece %s; se usará CPU. "
            "Para GPU: `pip install onnxruntime-gpu` (NVIDIA/CUDA) o "
            "`pip install onnxruntime-directml` (cualquier GPU en Windows).",
            dev, ", ".join(available),
        )
    return picked


def onnx_device_label(providers: list[str] | tuple[str, ...]) -> str:
    """Nombre corto del device efectivo, para el progreso del job y diagnóstico."""
    first = (list(providers) or ["CPUExecutionProvider"])[0]
    return {"CUDAExecutionProvider": "cuda", "DmlExecutionProvider": "directml"}.get(first, "cpu")


def onnx_summary() -> dict:
    available = list(_ort_available())
    picked = onnx_providers("auto")
    return {
        "onnx_available": bool(available),
        "onnx_providers": available,
        "onnx_selected": onnx_device_label(picked),
    }
