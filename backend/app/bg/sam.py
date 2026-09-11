"""Proveedor SAM 2.1 para Eliminar fondo ASISTIDO (segmentación por clics).

A diferencia de los proveedores automáticos de ``providers.py`` (contrato de un
paso ``matte(frame)->gris``), SAM es INTERACTIVO y se parte en dos, encajando con
la caché de dos niveles de ``service.py``:

    encode(frame) -> embeddings   NIVEL 1 · caro · 1x por fotograma · NO depende
                                             de los clics → cacheable igual que hoy
    decode(embeddings, puntos) -> matte   NIVEL 2 · barato (ms) · depende de los
                                             clics del usuario → se rehace al vuelo

Los ``puntos`` son los mismos trazos de ``clip_bg.edits`` (coordenadas 0-1 de la
FUENTE): ``keep`` = punto positivo (esto es el sujeto), ``erase`` = negativo.

Modelo: SAM 2.1 en ONNX de ``vietanhdev/segment-anything-2.1-onnx-models``
(Apache-2.0). El contrato de I/O de abajo está verificado contra el .onnx real.
"""
from __future__ import annotations

import logging
import shutil
import threading
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from .. import config, gpu

log = logging.getLogger("videoyt.bg")

MODEL_DIR = config.BASE_DIR / "models" / "sam"
_DOWNLOAD_TIMEOUT = 120
_INPUT = 1024
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)
ProgressCb = Optional[Callable[[float, str], None]]

# backbone -> (nombre del zip en HuggingFace, MB aprox del bundle)
_BACKBONES = {
    "tiny": ("sam2.1_hiera_tiny_20260221.zip", 111),
    "small": ("sam2.1_hiera_small_20260221.zip", 136),
    "base_plus": ("sam2.1_hiera_base_plus_20260221.zip", 259),
    "large": ("sam2.1_hiera_large_20260221.zip", 768),
}
_BASE_URL = "https://huggingface.co/vietanhdev/segment-anything-2.1-onnx-models/resolve/main"


class ProviderUnavailable(RuntimeError):
    """SAM no puede trabajar (falta modelo, falta onnxruntime…)."""


class Sam21Provider:
    """Segmentador asistido SAM 2.1 (encoder + decoder ONNX)."""

    def __init__(self, backbone: str = "base_plus") -> None:
        if backbone not in _BACKBONES:
            raise ValueError(f"Backbone SAM desconocido: {backbone}")
        self.backbone = backbone
        self.id = f"sam21_{backbone}"
        self.model_version = f"sam21-{backbone}-1"
        self._enc = None
        self._dec = None
        self._device = "cpu"
        self._lock = threading.Lock()

    # -- rutas --------------------------------------------------------------
    @property
    def _dir(self) -> Path:
        return MODEL_DIR / self.backbone

    @property
    def encoder_path(self) -> Path:
        return self._dir / f"sam2.1_hiera_{self.backbone}.encoder.onnx"

    @property
    def decoder_path(self) -> Path:
        return self._dir / f"sam2.1_hiera_{self.backbone}.decoder.onnx"

    # -- disponibilidad -----------------------------------------------------
    def available(self) -> bool:
        return bool(gpu.onnx_providers("auto"))  # el modelo se descarga al aplicar

    def unavailable_reason(self) -> str:
        if not gpu.onnx_providers("auto"):
            return "onnxruntime no está instalado en el backend."
        return ""

    # -- carga --------------------------------------------------------------
    def _download(self, on_progress: ProgressCb = None) -> None:
        zip_name, mb = _BACKBONES[self.backbone]
        url = f"{_BASE_URL}/{zip_name}"
        self._dir.mkdir(parents=True, exist_ok=True)
        tmp = self._dir / (zip_name + ".part")
        log.info("Descargando SAM 2.1 (%s, ~%d MB) desde %s", self.backbone, mb, url)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "video-yt"})
            with urllib.request.urlopen(req, timeout=_DOWNLOAD_TIMEOUT) as res:
                total = int(res.headers.get("Content-Length") or 0)
                done = 0
                with open(tmp, "wb") as fh:
                    while True:
                        chunk = res.read(1 << 20)
                        if not chunk:
                            break
                        fh.write(chunk)
                        done += len(chunk)
                        if on_progress and total > 0:
                            on_progress(min(0.9, done / total),
                                        f"Descargando SAM 2.1 {self.backbone} "
                                        f"({done / (1 << 20):.0f}/{total / (1 << 20):.0f} MB)…")
            if on_progress:
                on_progress(0.92, "Descomprimiendo modelo SAM…")
            with zipfile.ZipFile(tmp) as z:
                z.extractall(self._dir)
            tmp.unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001 - sin red o URL caída
            tmp.unlink(missing_ok=True)
            raise ProviderUnavailable(
                f"No se pudo descargar SAM 2.1 ({self.backbone}): {exc}. "
                f"Descarga {zip_name} a mano en {self._dir} desde {url}"
            ) from exc

    def ensure_ready(self, on_progress: ProgressCb = None) -> None:
        with self._lock:
            if self._enc is not None and self._dec is not None:
                return
            providers = gpu.onnx_providers(_device_setting())
            if not providers:
                raise ProviderUnavailable(
                    "onnxruntime no está instalado: `pip install onnxruntime` en el backend.")
            if not (self.encoder_path.exists() and self.decoder_path.exists()):
                if on_progress:
                    on_progress(0.0, f"Preparando SAM 2.1 {self.backbone}…")
                self._download(on_progress)
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            def _open(path: Path):
                try:
                    return ort.InferenceSession(str(path), opts, providers=providers)
                except Exception as exc:  # noqa: BLE001 - EP roto → CPU
                    log.warning("SAM %s falló con %s (%s); reintento en CPU.",
                                path.name, providers, exc)
                    return ort.InferenceSession(str(path), opts,
                                                providers=["CPUExecutionProvider"])

            self._enc = _open(self.encoder_path)
            self._dec = _open(self.decoder_path)
            self._device = gpu.onnx_device_label(self._enc.get_providers())
            log.info("Eliminar fondo (asistido): SAM 2.1 %s listo en %s",
                     self.backbone, self._device)

    @property
    def device(self) -> str:
        return self._device

    def close(self) -> None:
        with self._lock:
            self._enc = None
            self._dec = None

    # -- inferencia ---------------------------------------------------------
    def encode(self, frame: np.ndarray) -> dict:
        """Fotograma RGB (uint8, HxWx3) -> embeddings (nivel 1, cacheable)."""
        if self._enc is None:
            self.ensure_ready()
        im = cv2.resize(frame, (_INPUT, _INPUT), interpolation=cv2.INTER_LINEAR)
        im = im.astype(np.float32) / 255.0
        im = (im - _MEAN) / _STD
        tensor = np.expand_dims(im.transpose(2, 0, 1), 0).astype(np.float32)
        names = [o.name for o in self._enc.get_outputs()]
        return dict(zip(names, self._enc.run(None, {"image": tensor})))

    def decode(self, embeds: dict, points: list[tuple[float, float, int]],
               orig_hw: tuple[int, int]) -> np.ndarray:
        """embeddings + puntos -> matte (uint8, HxW, 0..255).

        ``points``: lista de ``(x, y, label)`` con x,y en fracción 0-1 de la
        FUENTE y ``label`` 1 = incluir (keep) / 0 = excluir (erase).
        """
        if self._dec is None:
            self.ensure_ready()
        h, w = orig_hw
        if not points:
            return np.zeros((h, w), np.uint8)
        coords = np.array([[x * _INPUT, y * _INPUT] for x, y, _ in points], np.float32)[None]
        labels = np.array([[float(lab) for _, _, lab in points]], np.float32)
        feed = {
            "image_embed": embeds["image_embed"],
            "high_res_feats_0": embeds["high_res_feats_0"],
            "high_res_feats_1": embeds["high_res_feats_1"],
            "point_coords": coords,
            "point_labels": labels,
            "mask_input": np.zeros((1, 1, 256, 256), np.float32),
            "has_mask_input": np.zeros((1,), np.float32),
        }
        masks, iou = self._dec.run(None, feed)
        best = int(np.argmax(iou.ravel()))
        logit = masks[0, best].astype(np.float32)          # [Hm, Wm]
        prob = 1.0 / (1.0 + np.exp(-logit))                # sigmoid → matte suave
        out = np.clip(prob * 255.0 + 0.5, 0, 255).astype(np.uint8)
        if out.shape[:2] != (h, w):
            out = cv2.resize(out, (w, h), interpolation=cv2.INTER_LINEAR)
        return out

    def segment(self, frame: np.ndarray,
                points: list[tuple[float, float, int]]) -> np.ndarray:
        """Conveniencia: encode + decode en un paso (para imágenes/still)."""
        h, w = frame.shape[:2]
        return self.decode(self.encode(frame), points, (h, w))


def _device_setting() -> str:
    """``bg_removal.device`` de Configuración (auto | cuda | dml | cpu)."""
    try:
        from .. import settings
        return str(((settings.load() or {}).get("bg_removal") or {}).get("device") or "auto")
    except Exception:  # noqa: BLE001 - ajustes ilegibles → auto
        return "auto"
