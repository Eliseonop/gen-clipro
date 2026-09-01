"""Detección de caras con YuNet (OpenCV DNN) para el recorte inteligente.

Fase 1 del auto-reframe: en vez de recortar siempre por el centro, buscamos
dónde está la cara a lo largo del tramo y devolvemos una X fija (la mediana)
donde colocar la ventana vertical. Sin movimiento todavía → sin temblores.

Notas de robustez (OpenCV 5.x, motor de grafos nuevo)
------------------------------------------------------
El detector YuNet **no es reentrante**: mutar su tamaño de entrada
(``setInputSize``) mientras otro hilo lo usa —o entre vídeos de resoluciones
distintas— corrompe los buffers internos del nuevo motor de grafos y produce el
fallo ``buf.shape() == m.shape()`` en ``forwardGraph`` (o "Unknown C++
exception"). En esta app la detección corre en hilos de ``jobs`` y el editor
puede lanzar la preparación dos veces (React StrictMode), así que compartir un
único detector global es una carrera segura.

Solución: **un detector por hilo y por tamaño de entrada**, creado ya con las
dimensiones exactas del fotograma. Nunca se comparte estado mutable entre hilos
y cada fotograma que llega al modelo se valida y normaliza (BGR, uint8,
contiguo, con el tamaño de entrada exactamente igual al del fotograma).
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from . import config
from .diagnostics import timed

log = logging.getLogger("videoyt.detect")

_MODEL = config.BASE_DIR / "models" / "face_detection_yunet_2023mar.onnx"

# Umbrales del detector (se mantienen los valores originales).
_SCORE_THRESHOLD = 0.6
_NMS_THRESHOLD = 0.3
_TOP_K = 5000

# Caché de detectores por hilo → { (w, h): FaceDetectorYN }. Al ser local a cada
# hilo evitamos por completo la carrera del motor de grafos de OpenCV 5.
_local = threading.local()


def _model_path() -> str:
    if not _MODEL.exists():
        raise FileNotFoundError(
            f"Modelo YuNet no encontrado en {_MODEL}. "
            "Descárgalo desde el OpenCV Zoo (ver README)."
        )
    return str(_MODEL)


def _get_detector(w: int, h: int):
    """Detector YuNet creado para el tamaño exacto (w, h), cacheado por hilo.

    Crear el detector ya con ``input_size=(w, h)`` evita tener que llamar a
    ``setInputSize`` sobre un grafo que ya corrió a otro tamaño, que es justo lo
    que dispara el fallo de shapes. Si en el mismo hilo aparece otro tamaño, se
    crea (y cachea) un detector aparte para ese tamaño.
    """
    w = int(w)
    h = int(h)
    if w <= 0 or h <= 0:
        raise ValueError(f"Tamaño de fotograma no válido: {w}x{h}")

    cache = getattr(_local, "detectors", None)
    if cache is None:
        cache = {}
        _local.detectors = cache

    det = cache.get((w, h))
    if det is None:
        det = cv2.FaceDetectorYN.create(
            _model_path(), "", (w, h),
            _SCORE_THRESHOLD, _NMS_THRESHOLD, _TOP_K,
        )
        cache[(w, h)] = det
    return det


def _prep_frame(frame) -> Optional[np.ndarray]:
    """Normaliza un fotograma a BGR uint8 contiguo, o ``None`` si no es válido.

    Cubre fotogramas vacíos/None, escala de grises (2D), con canal alfa (BGRA) y
    tipos que no sean uint8. Garantiza que lo que llega a ``detect()`` tiene
    exactamente el formato que el modelo espera.
    """
    if frame is None:
        return None
    if not isinstance(frame, np.ndarray) or frame.size == 0:
        return None
    if frame.ndim == 2:                                   # gris → BGR
        frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
    elif frame.ndim == 3 and frame.shape[2] == 4:         # BGRA → BGR
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
    elif frame.ndim == 3 and frame.shape[2] == 3:
        pass
    else:
        return None
    if frame.dtype != np.uint8:
        frame = np.clip(frame, 0, 255).astype(np.uint8)
    h, w = frame.shape[:2]
    if w <= 0 or h <= 0:
        return None
    if not frame.flags["C_CONTIGUOUS"]:
        frame = np.ascontiguousarray(frame)
    return frame


def _detect_faces(frame) -> Optional[np.ndarray]:
    """Detecta caras en un fotograma ya normalizado. ``None`` si no hay/es inválido.

    Usa un detector propio del hilo y del tamaño exacto del fotograma, de modo
    que ``setInputSize`` y el fotograma coinciden siempre.
    """
    f = _prep_frame(frame)
    if f is None:
        return None
    h, w = f.shape[:2]
    detector = _get_detector(w, h)
    # Redundante (ya se creó con este tamaño) pero barato y explícito: asegura
    # que el tamaño de entrada del modelo == tamaño del fotograma.
    detector.setInputSize((w, h))
    _, faces = detector.detect(f)
    return faces


def dims(source: Path) -> tuple[int, int]:
    """Devuelve (ancho, alto) del vídeo fuente en píxeles."""
    cap = cv2.VideoCapture(str(source))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return w, h


def face_center_x(source: Path, start: float, end: float, samples: int = 16) -> float | None:
    """X (en píxeles del vídeo fuente) donde centrar el recorte vertical.

    Muestrea ``samples`` fotogramas repartidos por el tramo, detecta la cara
    más grande en cada uno y devuelve la mediana de sus centros. La mediana
    ignora fotogramas sueltos raros (falsos positivos, cambios de plano).
    Devuelve ``None`` si no se detecta ninguna cara en todo el tramo.
    """
    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        return None

    dur = max(0.0, end - start)
    centers: list[float] = []

    for i in range(samples):
        t = start + dur * (i + 0.5) / samples
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        faces = _detect_faces(frame)
        if faces is None or len(faces) == 0:
            continue
        # Columnas 0-3 del resultado = x, y, ancho, alto de la caja de la cara.
        best = max(faces, key=lambda f: f[2] * f[3])
        centers.append(float(best[0]) + float(best[2]) / 2.0)

    cap.release()
    if not centers:
        return None
    return float(np.median(centers))


def video_info(source: Path) -> dict:
    """Metadatos del vídeo sin recorrer fotogramas ni detectar caras."""
    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        return {"track": [], "duration": 0.0, "width": 0, "height": 0, "fps": 25.0}
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    dur = (count / fps) if fps else 0.0
    cap.release()
    return {"track": [], "duration": round(dur, 3), "width": w, "height": h, "fps": round(fps, 3)}


def face_track(
    source: Path,
    samples: int = 0,
    on_progress: Optional[Callable[[float, str], None]] = None,
) -> dict:
    """Recorre TODO el vídeo ``source`` detectando la cara más grande por muestra.

    Pensado para un proxy que YA es el tramo a editar (empieza en t=0). Devuelve
    un diccionario con la duración, dimensiones, fps y una lista ``track`` de
    puntos ``{t, cx, cy, w, h}`` en coordenadas normalizadas (0-1). Esto alimenta
    el editor de reencuadre: el usuario ve dónde está la cara y corrige a mano.
    """
    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        return {"track": [], "duration": 0.0, "width": 0, "height": 0, "fps": 25.0}

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    dur = (count / fps) if fps else 0.0

    if samples <= 0:
        samples = max(8, min(240, int(dur * 2)))   # ~2 muestras por segundo

    track: list[dict] = []

    log.info("Tracking de caras: %s · %dx%d · %.1fs · %d muestras",
             source.name, w, h, dur, samples)
    with timed("detección de caras", log, samples=samples, res=f"{w}x{h}"):
        for i in range(samples):
            t = dur * (i + 0.5) / samples
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if ok:
                f = _prep_frame(frame)
                if f is not None:
                    fh, fw = f.shape[:2]
                    faces = _detect_faces(f)
                    if faces is not None and len(faces):
                        best = max(faces, key=lambda fc: fc[2] * fc[3])
                        x, y, bw, bh = float(best[0]), float(best[1]), float(best[2]), float(best[3])
                        track.append({
                            "t": round(t, 3),
                            "cx": round(min(1.0, max(0.0, (x + bw / 2) / fw)), 4),
                            "cy": round(min(1.0, max(0.0, (y + bh / 2) / fh)), 4),
                            "w": round(bw / fw, 4),
                            "h": round(bh / fh, 4),
                        })
            if on_progress and samples:
                on_progress(0.5 + 0.5 * (i + 1) / samples, f"Detectando caras… {i + 1}/{samples}")

    log.info("Tracking: %d/%d muestras con cara detectada.", len(track), samples)
    cap.release()
    return {"track": track, "duration": round(dur, 3), "width": w, "height": h, "fps": round(fps, 3)}
