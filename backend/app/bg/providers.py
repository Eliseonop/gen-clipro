"""Proveedores de segmentación para Eliminar fondo.

La app NO conoce ningún modelo concreto: habla con ``BackgroundRemovalProvider``
y resuelve por id contra ``PROVIDERS``. Cambiar o añadir modelo = una clase nueva
registrada aquí, sin tocar el servicio, el compose ni el frontend.

Para añadir uno (p. ej. BiRefNet o MediaPipe):
  1. subclase de ``BackgroundRemovalProvider`` (o de ``OnnxMatteProvider`` si es ONNX),
  2. ``register(MiProvider())``,
  3. añadir su id a ``BG_PROVIDER_IDS`` en ``app/clip_bg.py`` y a
     ``BG_PROVIDERS`` en ``frontend/src/lib/clipBg.js``.

Modelos elegidos por defecto: familia **U²-Net** en ONNX. Motivos: licencia
Apache-2.0 (apta para contenido monetizable, al revés que RMBG), ``onnxruntime``
ya es dependencia del proyecto (kokoro-onnx) así que no añade peso, y sigue el
precedente de ``backend/models/*.onnx`` (YuNet, Kokoro).
"""
from __future__ import annotations

import logging
import shutil
import threading
import urllib.request
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from .. import config, gpu

log = logging.getLogger("videoyt.bg")

MODEL_DIR = config.BASE_DIR / "models"
_DOWNLOAD_TIMEOUT = 60
ProgressCb = Optional[Callable[[float, str], None]]


class ProviderUnavailable(RuntimeError):
    """El proveedor no puede trabajar (falta modelo, falta onnxruntime…)."""


class BackgroundRemovalProvider:
    """Contrato mínimo de un modelo de segmentación de fondo.

    ``matte`` recibe fotogramas RGB (uint8, HxWx3) y devuelve el matte en escala
    de grises (uint8, HxW) con el MISMO tamaño: 255 = sujeto, 0 = fondo.
    """

    id: str = ""
    label: str = ""
    model_version: str = "1"

    def available(self) -> bool:                     # pragma: no cover - trivial
        raise NotImplementedError

    def unavailable_reason(self) -> str:             # pragma: no cover - trivial
        return ""

    def ensure_ready(self, on_progress: ProgressCb = None) -> None:
        """Deja el proveedor listo (descargar pesos, abrir sesión…)."""
        raise NotImplementedError

    def matte(self, frame: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    def close(self) -> None:
        """Libera recursos (sesión/VRAM). Debe poder llamarse siempre."""

    def info(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "model_version": self.model_version,
            "available": self.available(),
            "reason": self.unavailable_reason(),
        }


# --- Familia U²-Net (ONNX) --------------------------------------------------

class OnnxMatteProvider(BackgroundRemovalProvider):
    """Base para modelos de matte en ONNX Runtime con pre/post de U²-Net.

    Preproceso (idéntico al de referencia de U²-Net): redimensionar a
    ``input_size``, dividir por el máximo de la imagen, normalizar con
    mean/std de ImageNet y pasar a NCHW float32.
    Postproceso: primera salida, normalizar min-max y volver al tamaño original.
    """

    url: str = ""
    filename: str = ""
    input_size: tuple[int, int] = (320, 320)
    mean = (0.485, 0.456, 0.406)
    std = (0.229, 0.224, 0.225)

    def __init__(self) -> None:
        self._session = None
        self._input_name = ""
        self._device = "cpu"
        self._lock = threading.Lock()

    # -- disponibilidad -----------------------------------------------------
    @property
    def model_path(self) -> Path:
        return MODEL_DIR / self.filename

    def available(self) -> bool:
        return bool(gpu.onnx_providers("auto")) and self.model_path.exists()

    def unavailable_reason(self) -> str:
        if not gpu.onnx_providers("auto"):
            return "onnxruntime no está instalado en el backend."
        if not self.model_path.exists():
            return f"Falta el modelo {self.filename}; se descarga al aplicar por primera vez."
        return ""

    # -- carga --------------------------------------------------------------
    def _download(self, on_progress: ProgressCb = None) -> None:
        if not self.url:
            raise ProviderUnavailable(f"{self.id}: no hay URL de descarga configurada.")
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        tmp = self.model_path.with_suffix(self.model_path.suffix + ".part")
        log.info("Descargando modelo %s desde %s", self.filename, self.url)
        try:
            req = urllib.request.Request(self.url, headers={"User-Agent": "video-yt"})
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
                            mb = done / (1 << 20)
                            on_progress(min(0.98, done / total),
                                        f"Descargando modelo {self.id} ({mb:.0f} MB)…")
            shutil.move(str(tmp), str(self.model_path))
        except Exception as exc:  # noqa: BLE001 - sin red o URL caída
            tmp.unlink(missing_ok=True)
            raise ProviderUnavailable(
                f"No se pudo descargar el modelo {self.filename}: {exc}. "
                f"Descárgalo a mano en {MODEL_DIR} desde {self.url}"
            ) from exc

    def ensure_ready(self, on_progress: ProgressCb = None) -> None:
        with self._lock:
            if self._session is not None:
                return
            providers = gpu.onnx_providers(_device_setting())
            if not providers:
                raise ProviderUnavailable(
                    "onnxruntime no está instalado: `pip install onnxruntime` en el backend."
                )
            if not self.model_path.exists():
                if on_progress:
                    on_progress(0.0, f"Descargando modelo {self.id}…")
                self._download(on_progress)
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            try:
                sess = ort.InferenceSession(str(self.model_path), opts, providers=providers)
            except Exception as exc:  # noqa: BLE001 - EP roto → reintento en CPU
                log.warning("ONNX %s falló con %s (%s); reintento en CPU.",
                            self.id, providers, exc)
                sess = ort.InferenceSession(str(self.model_path), opts,
                                            providers=["CPUExecutionProvider"])
            self._session = sess
            self._input_name = sess.get_inputs()[0].name
            self._device = gpu.onnx_device_label(sess.get_providers())
            log.info("Eliminar fondo: modelo %s listo en %s", self.id, self._device)

    @property
    def device(self) -> str:
        return self._device

    def close(self) -> None:
        with self._lock:
            self._session = None

    # -- inferencia ---------------------------------------------------------
    def _pre(self, frame: np.ndarray) -> np.ndarray:
        im = cv2.resize(frame, self.input_size, interpolation=cv2.INTER_LANCZOS4)
        arr = im.astype(np.float32)
        peak = float(arr.max())
        arr = arr / (peak if peak > 0 else 1.0)
        for c in range(3):
            arr[:, :, c] = (arr[:, :, c] - self.mean[c]) / self.std[c]
        return np.expand_dims(arr.transpose(2, 0, 1), 0).astype(np.float32)

    def _post(self, raw: np.ndarray, width: int, height: int) -> np.ndarray:
        pred = np.squeeze(raw).astype(np.float32)
        mi, ma = float(pred.min()), float(pred.max())
        pred = (pred - mi) / (ma - mi) if ma > mi else np.zeros_like(pred)
        out = np.clip(pred * 255.0 + 0.5, 0, 255).astype(np.uint8)
        if out.shape[:2] != (height, width):
            out = cv2.resize(out, (width, height), interpolation=cv2.INTER_LANCZOS4)
        return out

    def matte(self, frame: np.ndarray) -> np.ndarray:
        if self._session is None:
            self.ensure_ready()
        h, w = frame.shape[:2]
        outs = self._session.run(None, {self._input_name: self._pre(frame)})
        return self._post(outs[0], w, h)


class U2NetProvider(OnnxMatteProvider):
    id = "u2net"
    label = "U²-Net"
    model_version = "u2net-1"
    filename = "u2net.onnx"
    url = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"


class U2NetLiteProvider(OnnxMatteProvider):
    id = "u2netp"
    label = "U²-Net lite"
    model_version = "u2netp-1"
    filename = "u2netp.onnx"
    url = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"


# --- Registro ---------------------------------------------------------------

PROVIDERS: dict[str, BackgroundRemovalProvider] = {}


def register(provider: BackgroundRemovalProvider) -> None:
    PROVIDERS[provider.id] = provider


register(U2NetProvider())
register(U2NetLiteProvider())


def get(provider_id: str) -> BackgroundRemovalProvider:
    from ..clip_bg import DEFAULT_PROVIDER

    p = PROVIDERS.get(provider_id) or PROVIDERS.get(DEFAULT_PROVIDER)
    if p is None:  # pragma: no cover - el registro nunca está vacío
        raise ProviderUnavailable(f"Proveedor desconocido: {provider_id}")
    return p


def catalog() -> list[dict]:
    return [p.info() for p in PROVIDERS.values()]


def _device_setting() -> str:
    """``bg_removal.device`` de Configuración (auto | cuda | dml | cpu)."""
    try:
        from .. import settings
        return str(((settings.load() or {}).get("bg_removal") or {}).get("device") or "auto")
    except Exception:  # noqa: BLE001 - ajustes ilegibles → auto
        return "auto"
