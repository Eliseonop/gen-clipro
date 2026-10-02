"""Modelos de IA residentes en RAM: registro, último uso y descarga por inactividad.

Cada motor (Eliminar fondo, SAM, Whisper, Kokoro) cargaba su modelo la primera
vez y lo dejaba en la memoria del proceso hasta cerrar el backend: tras una
sesión usando varias funciones, ``python.exe`` acumulaba varios GB (SAM large,
BiRefNet, RVM, Whisper, Kokoro… más la arena de ONNX Runtime, que no devuelve
memoria). Aquí cada modelo cargado se registra con su función de descarga:

* ``touch(name)`` en cada inferencia marca el último uso;
* ``in_use(name)`` protege un modelo durante un proceso largo (un job);
* un hilo descarga los que llevan más de ``idle_minutes`` sin usarse
  (ajuste ``models.idle_minutes``, por defecto 5; 0 = no descargar nunca);
* solo un modelo **pesado** a la vez: al registrar uno, los demás pesados que no
  estén en uso se descargan.

Volver a usar un modelo descargado solo cuesta volver a cargarlo (segundos): los
motores ya cargan de forma perezosa con ``ensure_ready``.
"""
from __future__ import annotations

import gc
import logging
import threading
import time
from contextlib import contextmanager
from typing import Callable, Optional

log = logging.getLogger(__name__)

IDLE_MINUTES_DEFAULT = 5.0
_REAPER_INTERVAL_S = 60.0

_lock = threading.RLock()
_models: dict[str, dict] = {}   # name -> {unload, heavy, last, busy, since}
_reaper: Optional[threading.Thread] = None
_now: Callable[[], float] = time.monotonic


def _set_clock(fn: Callable[[], float]) -> None:
    """Solo para tests: sustituye el reloj."""
    global _now
    _now = fn


def register(name: str, unload: Callable[[], None], heavy: bool = False) -> None:
    """Anota un modelo recién cargado. ``unload`` debe soltar sus referencias."""
    with _lock:
        prev = _models.get(name)
        _models[name] = {
            "unload": unload,
            "heavy": bool(heavy),
            "last": _now(),
            "busy": prev["busy"] if prev else 0,
            "since": prev["since"] if prev else _now(),
        }
        others = [n for n, e in _models.items()
                  if heavy and n != name and e["heavy"] and e["busy"] == 0]
    for n in others:
        log.info("Modelos: descargo %s para cargar %s (uno pesado a la vez).", n, name)
        _unload(n)
    _ensure_reaper()


def touch(name: str) -> None:
    with _lock:
        e = _models.get(name)
        if e:
            e["last"] = _now()


def forget(name: str) -> None:
    """El motor soltó el modelo por su cuenta (``close()``): quitarlo del registro."""
    with _lock:
        _models.pop(name, None)


@contextmanager
def in_use(name: str):
    """Mientras dure el bloque, el modelo no se descarga por inactividad."""
    with _lock:
        e = _models.get(name)
        if e:
            e["busy"] += 1
    try:
        yield
    finally:
        with _lock:
            e = _models.get(name)
            if e:
                e["busy"] = max(0, e["busy"] - 1)
                e["last"] = _now()


def _unload(name: str) -> bool:
    with _lock:
        e = _models.pop(name, None)
    if not e:
        return False
    try:
        e["unload"]()
    except Exception:  # noqa: BLE001 - una descarga fallida no debe tumbar nada
        log.exception("Modelos: fallo al descargar %s", name)
    gc.collect()
    log.info("Modelos: %s descargado de la memoria.", name)
    return True


def unload(name: str) -> bool:
    return _unload(name)


def unload_all() -> list[str]:
    with _lock:
        names = [n for n, e in _models.items() if e["busy"] == 0]
    return [n for n in names if _unload(n)]


def unload_idle(max_idle_s: Optional[float] = None) -> list[str]:
    """Descarga los modelos sin usar desde hace más de ``max_idle_s`` segundos."""
    if max_idle_s is None:
        max_idle_s = idle_minutes() * 60.0
    if max_idle_s <= 0:
        return []
    now = _now()
    with _lock:
        names = [n for n, e in _models.items()
                 if e["busy"] == 0 and now - e["last"] >= max_idle_s]
    return [n for n in names if _unload(n)]


def loaded() -> list[dict]:
    now = _now()
    with _lock:
        return [
            {"name": n, "heavy": e["heavy"], "busy": e["busy"] > 0,
             "idle_s": round(now - e["last"], 1), "loaded_s": round(now - e["since"], 1)}
            for n, e in sorted(_models.items())
        ]


def idle_minutes() -> float:
    try:
        from . import settings
        raw = (settings.load().get("models") or {}).get("idle_minutes", IDLE_MINUTES_DEFAULT)
        return max(0.0, float(raw))
    except Exception:  # noqa: BLE001 - ajustes ilegibles → valor por defecto
        return IDLE_MINUTES_DEFAULT


def _reaper_loop() -> None:
    while True:
        time.sleep(_REAPER_INTERVAL_S)
        try:
            unload_idle()
        except Exception:  # noqa: BLE001 - el hilo no debe morir
            log.exception("Modelos: fallo en la descarga por inactividad")


def _ensure_reaper() -> None:
    global _reaper
    with _lock:
        if _reaper is not None and _reaper.is_alive():
            return
        _reaper = threading.Thread(target=_reaper_loop, name="model-reaper", daemon=True)
        _reaper.start()


def process_rss_bytes() -> int:
    """Memoria residente del proceso (bytes). Sin dependencias: ``ctypes`` en
    Windows (GetProcessMemoryInfo) y ``/proc`` o ``resource`` en el resto."""
    try:
        import sys
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes

            class _PMC(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            pmc = _PMC()
            pmc.cb = ctypes.sizeof(_PMC)
            k32 = ctypes.WinDLL("kernel32", use_last_error=True)
            psapi = ctypes.WinDLL("psapi", use_last_error=True)
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PMC), wintypes.DWORD]
            if psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb):
                return int(pmc.WorkingSetSize)
            return 0
        try:
            with open("/proc/self/statm", encoding="ascii") as fh:
                import os
                return int(fh.read().split()[1]) * os.sysconf("SC_PAGE_SIZE")
        except OSError:
            import resource
            return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024
    except Exception:  # noqa: BLE001 - diagnóstico: nunca debe fallar
        return 0


def memory_report() -> dict:
    return {
        "rss_bytes": process_rss_bytes(),
        "idle_minutes": idle_minutes(),
        "models": loaded(),
    }
