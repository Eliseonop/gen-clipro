"""Diagnóstico de rendimiento: qué "motor" usará cada parte del pipeline.

Los dos cuellos de botella de esta app son:

  1. **Detección de caras** (YuNet / OpenCV DNN) → decide el reencuadre. Los
     *wheels* de ``opencv-python`` de pip son **solo CPU**, así que casi siempre
     corre en CPU. El aviso ``setPreferableTarget: Targets are not supported by
     the new graph engine`` que ves al arrancar es justamente OpenCV diciendo que
     ignora cualquier target que no sea CPU. No es un error, pero confirma que la
     detección no está acelerada por GPU.

  2. **Codificación de vídeo** (FFmpeg). Por defecto usamos ``libx264``, que es
     CPU puro. Si la máquina tiene GPU (NVIDIA ``h264_nvenc``, Intel ``h264_qsv``,
     AMD ``h264_amf``), codificar por GPU es varias veces más rápido.

Este módulo hace una *sonda* de una vez al arrancar y escribe un informe legible
en el log, con un veredicto (✓ óptimo / ⚠ va por CPU) para cada motor, de modo
que cuando "los vídeos van lentos" puedas ver de un vistazo qué está pasando.
También expone ``probe()`` (para el endpoint ``/api/diagnostics``) y un pequeño
``timed()`` para medir bloques concretos del pipeline.
"""
from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import time
from contextlib import contextmanager
from functools import lru_cache

log = logging.getLogger("videoyt.diag")

# Codificadores por hardware que nos interesan, con etiqueta legible.
_HW_ENCODERS = {
    "h264_nvenc": "NVIDIA NVENC (H.264)",
    "hevc_nvenc": "NVIDIA NVENC (H.265)",
    "h264_qsv": "Intel QuickSync (H.264)",
    "h264_amf": "AMD AMF (H.264)",
    "h264_videotoolbox": "Apple VideoToolbox (H.264)",
}


# --- Configuración de logging -------------------------------------------

_LOGGING_READY = False


def configure_logging(level: int = logging.INFO) -> None:
    """Configura el logging raíz una sola vez (idempotente).

    Uvicorn ya instala sus propios handlers; añadimos uno básico para que
    nuestros ``logging.getLogger('videoyt.*')`` salgan con hora y módulo aunque
    se ejecute fuera de uvicorn (p. ej. en tests o scripts).
    """
    global _LOGGING_READY
    if _LOGGING_READY:
        return
    root = logging.getLogger("videoyt")
    root.setLevel(level)
    if not root.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        ))
        root.addHandler(h)
        root.propagate = False
    _LOGGING_READY = True


# --- Sondas de hardware --------------------------------------------------

def _opencv_info() -> dict:
    """Qué aceleración tiene disponible OpenCV (CUDA / OpenCL / targets DNN)."""
    info: dict = {"available": False}
    try:
        import cv2
    except Exception as exc:  # noqa: BLE001
        info["error"] = f"OpenCV no importable: {exc}"
        return info

    info["available"] = True
    info["version"] = cv2.__version__

    # ¿El wheel trae soporte CUDA? Los de pip normalmente NO.
    try:
        info["cuda_devices"] = int(cv2.cuda.getCudaEnabledDeviceCount())
    except Exception:  # noqa: BLE001
        info["cuda_devices"] = 0

    # OpenCL (Transparent API). Acelera algunas ops, no la DNN nueva.
    try:
        info["opencl"] = bool(cv2.ocl.haveOpenCL())
    except Exception:  # noqa: BLE001
        info["opencl"] = False

    # Targets disponibles para el backend DNN por defecto.
    target_names = {
        getattr(cv2.dnn, "DNN_TARGET_CPU", -1): "CPU",
        getattr(cv2.dnn, "DNN_TARGET_OPENCL", -2): "OpenCL",
        getattr(cv2.dnn, "DNN_TARGET_OPENCL_FP16", -3): "OpenCL_FP16",
        getattr(cv2.dnn, "DNN_TARGET_CUDA", -4): "CUDA",
        getattr(cv2.dnn, "DNN_TARGET_CUDA_FP16", -5): "CUDA_FP16",
    }
    try:
        targets = cv2.dnn.getAvailableTargets(cv2.dnn.DNN_BACKEND_OPENCV)
        info["dnn_targets"] = [target_names.get(t, str(t)) for t in targets]
    except Exception:  # noqa: BLE001
        info["dnn_targets"] = ["CPU"]

    return info


def _ffmpeg_info() -> dict:
    """¿Hay ffmpeg? ¿Qué codificadores por hardware ofrece?"""
    info: dict = {"available": False}
    exe = shutil.which("ffmpeg")
    if not exe:
        info["error"] = "ffmpeg no está en el PATH."
        return info

    info["available"] = True
    info["path"] = exe

    try:
        ver = subprocess.run(
            [exe, "-hide_banner", "-version"],
            capture_output=True, text=True, timeout=10,
        )
        first = (ver.stdout or "").splitlines()
        info["version"] = first[0] if first else ""
    except Exception as exc:  # noqa: BLE001
        info["version"] = f"(no se pudo leer: {exc})"

    hw: list[str] = []
    try:
        enc = subprocess.run(
            [exe, "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=15,
        )
        text = enc.stdout or ""
        for name, label in _HW_ENCODERS.items():
            # Las líneas de -encoders son "  V..... h264_nvenc  NVIDIA ...".
            if f" {name} " in text:
                hw.append(name)
    except Exception as exc:  # noqa: BLE001
        info["encoders_error"] = str(exc)
    info["hw_encoders"] = hw
    return info


@lru_cache(maxsize=1)
def probe() -> dict:
    """Sonda cacheada de la máquina. Barata de llamar (solo se ejecuta 1 vez)."""
    return {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count() or 0,
        "opencv": _opencv_info(),
        "ffmpeg": _ffmpeg_info(),
    }


# --- Informe legible -----------------------------------------------------

def log_report() -> dict:
    """Escribe el informe de arranque en el log y devuelve la sonda cruda."""
    d = probe()
    log.info("=== Diagnóstico de rendimiento (video-yt) ===")
    log.info("Sistema: %s · Python %s · %d CPU(s)",
             d["platform"], d["python"], d["cpu_count"])

    # --- OpenCV / detección de caras ---
    cv = d["opencv"]
    if not cv.get("available"):
        log.warning("OpenCV: NO disponible → la detección de caras fallará (%s)",
                    cv.get("error", "?"))
    else:
        gpu = cv.get("cuda_devices", 0) > 0
        engine = "GPU (CUDA)" if gpu else "CPU"
        log.info("OpenCV %s · targets DNN: %s · OpenCL=%s",
                 cv.get("version"), ", ".join(cv.get("dnn_targets", [])),
                 cv.get("opencl"))
        if gpu:
            log.info("  ✓ Detección de caras (YuNet): acelerada por GPU (%d dispositivo/s CUDA).",
                     cv["cuda_devices"])
        else:
            log.warning("  ⚠ Detección de caras (YuNet): corre en %s. "
                        "El wheel de opencv-python es solo-CPU; el aviso "
                        "'setPreferableTarget ... new graph engine' al arrancar "
                        "confirma que no hay target GPU. Es lo esperado, pero es "
                        "el motivo de que el tracking sea lento en tramos largos.",
                        engine)

    # --- FFmpeg / codificación ---
    ff = d["ffmpeg"]
    if not ff.get("available"):
        log.warning("FFmpeg: NO disponible (%s) → no se podrán exportar vídeos.",
                    ff.get("error", "?"))
    else:
        hw = ff.get("hw_encoders", [])
        log.info("FFmpeg: %s", ff.get("version", "?"))
        if hw:
            pretty = ", ".join(_HW_ENCODERS.get(h, h) for h in hw)
            log.info("  ✓ Codificadores por hardware disponibles: %s.", pretty)
        else:
            log.warning("  ⚠ Sin codificadores por hardware: el render usa "
                        "'libx264' (CPU). Es correcto pero más lento; en portátiles "
                        "sin GPU el export de timelines largas tardará.")

    # --- Selección efectiva (lo que REALMENTE se va a usar) ---
    try:
        from . import gpu
        sel = gpu.summary()
        if sel["gpu_disabled"]:
            log.info("Selección efectiva: GPU DESACTIVADA por VIDEOYT_GPU → "
                     "whisper=%s/%s · vídeo=%s.",
                     sel["whisper_device"], sel["whisper_compute"], sel["video_encoder"])
        else:
            mark = "✓" if sel["video_encoder"] != "libx264" else "⚠"
            log.info("Selección efectiva: whisper=%s/%s · vídeo=%s %s",
                     sel["whisper_device"], sel["whisper_compute"], sel["video_encoder"],
                     "(GPU)" if sel["video_encoder"] != "libx264" else "(CPU)")
            log.info("  %s Encoder de vídeo: %s. (Forzar CPU con VIDEOYT_GPU=0.)",
                     mark, sel["video_encoder"])
    except Exception:  # noqa: BLE001 - el resumen nunca debe tumbar el arranque
        pass
    log.info("=== fin del diagnóstico ===")
    return d


# --- Medición de tiempos ------------------------------------------------

@contextmanager
def timed(label: str, logger: logging.Logger | None = None, **fields):
    """Context manager que mide y registra cuánto tarda un bloque.

    Uso:
        with timed("detección de caras", samples=120):
            ...

    Escribe en el log ``… tardó 3.42s`` al salir (aunque haya excepción), con
    los campos extra que le pases para dar contexto.
    """
    lg = logger or log
    t0 = time.perf_counter()
    extra = (" " + " ".join(f"{k}={v}" for k, v in fields.items())) if fields else ""
    try:
        yield
    finally:
        dt = time.perf_counter() - t0
        lg.info("⏱ %s tardó %.2fs%s", label, dt, extra)
