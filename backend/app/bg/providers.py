"""Proveedores de segmentación para Eliminar fondo.

La app NO conoce ningún modelo concreto: habla con ``BackgroundRemovalProvider``
y resuelve por id contra ``PROVIDERS``. Cambiar o añadir modelo = una clase nueva
registrada aquí, sin tocar el servicio, el compose ni el frontend.

Para añadir uno (p. ej. MODNet o MediaPipe):
  1. subclase de ``BackgroundRemovalProvider`` (o de ``OnnxMatteProvider`` si es ONNX),
  2. ``register(MiProvider())``,
  3. añadir su id a ``AUTO_PROVIDER_IDS`` en ``app/clip_bg.py`` y a
     ``BG_PROVIDERS`` en ``frontend/src/lib/clipBg.js``.

Motores automáticos (todos ONNX Runtime, ya dependencia del proyecto por
kokoro-onnx, así que no añaden peso):

* **RVM** (Robust Video Matting) — personas en VÍDEO. Es RECURRENTE: guarda
  un estado entre fotogramas, así que el borde no «baila» como al procesar cada
  fotograma por separado. Solo recorta personas. Se usa por ``stream()``.
* **BiRefNet** (MIT) — cualquier sujeto (objetos, animales) con el mejor
  borde. Pesado en CPU (segundos por fotograma): pensado para imágenes.
* **U²-Net** (Apache-2.0) — el motor original: rápido y general, más tosco.

RMBG sigue descartado: licencia no comercial. RVM es GPL-3.0: se descarga
aparte (no se redistribuye con el proyecto) y el vídeo que produce no queda
sujeto a la licencia, así que es apto para contenido monetizable.
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


class MatteStream:
    """Matte de una secuencia de fotogramas CONSECUTIVOS de la fuente.

    Los modelos por fotograma no guardan nada entre llamadas: este flujo por
    defecto solo delega en ``provider.matte``. Los TEMPORALES (RVM) devuelven su
    propio flujo con el estado recurrente dentro — uno por tramo, nunca
    compartido, así dos jobs a la vez no se mezclan la memoria.
    """

    def __init__(self, provider: "BackgroundRemovalProvider") -> None:
        self._provider = provider

    def matte(self, frame: np.ndarray) -> np.ndarray:
        return self._provider.matte(frame)


class BackgroundRemovalProvider:
    """Contrato mínimo de un modelo de segmentación de fondo.

    ``matte`` recibe fotogramas RGB (uint8, HxWx3) y devuelve el matte en escala
    de grises (uint8, HxW) con el MISMO tamaño: 255 = sujeto, 0 = fondo.
    ``stream`` hace lo mismo para fotogramas consecutivos (ver ``MatteStream``).
    """

    id: str = ""
    label: str = ""
    model_version: str = "1"
    # temporal: el matte de un fotograma depende de los anteriores (RVM). El
    # servicio le da los fotogramas EN ORDEN y calienta el estado antes de cada
    # tramo que calcula.
    temporal: bool = False
    # people_only: el modelo solo sabe recortar personas; con otro sujeto
    # devuelve un matte vacío (el servicio lo detecta y el job avisa).
    people_only: bool = False

    def available(self) -> bool:                     # pragma: no cover - trivial
        raise NotImplementedError

    def unavailable_reason(self) -> str:             # pragma: no cover - trivial
        return ""

    def ensure_ready(self, on_progress: ProgressCb = None) -> None:
        """Deja el proveedor listo (descargar pesos, abrir sesión…)."""
        raise NotImplementedError

    def matte(self, frame: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    def stream(self) -> MatteStream:
        """Flujo para una secuencia de fotogramas consecutivos."""
        return MatteStream(self)

    def close(self) -> None:
        """Libera recursos (sesión/VRAM). Debe poder llamarse siempre."""

    def info(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "model_version": self.model_version,
            "available": self.available(),
            "reason": self.unavailable_reason(),
            "temporal": self.temporal,
            "people_only": self.people_only,
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
    # low_memory: sin el «arena» de memoria de ONNX Runtime. Los modelos grandes
    # (BiRefNet a 1024²) lo hacen crecer en cada inferencia hasta fallar con
    # «bad allocation» en la segunda; sin él la memoria se libera al acabar.
    low_memory: bool = False

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
            if self.low_memory:
                opts.enable_cpu_mem_arena = False
                opts.enable_mem_pattern = False
            try:
                sess = ort.InferenceSession(str(self.model_path), opts, providers=providers)
            except Exception as exc:  # noqa: BLE001 - EP roto → reintento en CPU
                log.warning("ONNX %s falló con %s (%s); reintento en CPU.",
                            self.id, providers, exc)
                sess = ort.InferenceSession(str(self.model_path), opts,
                                            providers=["CPUExecutionProvider"])
            self._check_io(sess)
            self._session = sess
            self._input_name = sess.get_inputs()[0].name
            self._device = gpu.onnx_device_label(sess.get_providers())
            log.info("Eliminar fondo: modelo %s listo en %s", self.id, self._device)

    def _check_io(self, sess) -> None:
        """Valida las entradas/salidas del modelo. Por defecto, nada."""

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


# --- BiRefNet (ONNX, MIT) ---------------------------------------------------

class BiRefNetLiteProvider(OnnxMatteProvider):
    """BiRefNet general con backbone Swin-T: cualquier sujeto, el mejor borde.

    Mismo preproceso que U²-Net (el de referencia de rembg) pero a 1024², y la
    salida son logits: sigmoide antes de normalizar. ~8 s por fotograma en CPU,
    así que es el motor de las imágenes; en vídeo solo compensa con GPU.
    """

    id = "birefnet_lite"
    label = "BiRefNet"
    model_version = "birefnet-general-lite-232"
    filename = "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx"
    url = ("https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
           "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx")
    input_size = (1024, 1024)
    low_memory = True

    def _post(self, raw: np.ndarray, width: int, height: int) -> np.ndarray:
        logits = np.clip(np.asarray(raw, np.float32), -60.0, 60.0)
        return super()._post(1.0 / (1.0 + np.exp(-logits)), width, height)


# --- RVM: Robust Video Matting (ONNX, GPL-3.0) ------------------------------

# Lado largo (px) al que trabaja la red base de RVM. Por encima, el refinador
# guiado (Deep Guided Filter) sube el matte a la resolución pedida mirando el
# fotograma original: por eso pedir 720 o 1080 afina el borde casi gratis.
RVM_BASE_SIDE = 512


class RvmStream(MatteStream):
    """Flujo de RVM: lleva el estado recurrente (r1..r4) de fotograma en fotograma."""

    def __init__(self, provider: "RvmProvider") -> None:
        super().__init__(provider)
        self._rec: Optional[list[np.ndarray]] = None
        self._shape: Optional[tuple[int, int]] = None

    def matte(self, frame: np.ndarray) -> np.ndarray:
        shape = frame.shape[:2]
        if self._rec is None or shape != self._shape:
            # El estado depende del tamaño: si cambia (no debería), se reinicia.
            self._rec, self._shape = self._provider.initial_state(), shape
        out, self._rec = self._provider.step(frame, self._rec)
        return out


class RvmProvider(OnnxMatteProvider):
    """Robust Video Matting: matting de PERSONAS con memoria entre fotogramas.

    A diferencia de U²-Net, no mira cada fotograma por separado: arrastra un
    estado recurrente, así que el contorno es estable en el tiempo (sin el
    «baile» del borde) y aguanta fotogramas difíciles (movimiento, contraluz)
    apoyándose en los anteriores. Solo sabe recortar personas.
    """

    temporal = True
    people_only = True
    _INPUTS = ("src", "r1i", "r2i", "r3i", "r4i", "downsample_ratio")
    _OUTPUTS = ("pha", "r1o", "r2o", "r3o", "r4o")

    def _check_io(self, sess) -> None:
        ins = {i.name for i in sess.get_inputs()}
        outs = {o.name for o in sess.get_outputs()}
        if not set(self._INPUTS) <= ins or not set(self._OUTPUTS) <= outs:
            raise ProviderUnavailable(
                f"{self.filename} no es un modelo RVM válido (entradas: {sorted(ins)}).")

    @staticmethod
    def downsample_ratio(width: int, height: int) -> float:
        """Regla de RVM: la red base con el lado largo en ~512 px, nunca ampliando."""
        return min(1.0, RVM_BASE_SIDE / float(max(1, int(width), int(height))))

    @staticmethod
    def initial_state() -> list[np.ndarray]:
        """Estado inicial: tensores [1,1,1,1] a cero (el modelo los amplía solo)."""
        z = np.zeros((1, 1, 1, 1), np.float32)
        return [z, z, z, z]

    def step(self, frame: np.ndarray, rec: list[np.ndarray]) -> tuple[np.ndarray, list[np.ndarray]]:
        """Un fotograma con el estado ``rec`` → (matte uint8, estado siguiente)."""
        if self._session is None:
            self.ensure_ready()
        h, w = frame.shape[:2]
        src = np.ascontiguousarray(frame.transpose(2, 0, 1)[None], dtype=np.float32)
        src *= 1.0 / 255.0
        feed = {
            "src": src,
            "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3],
            "downsample_ratio": np.array([self.downsample_ratio(w, h)], np.float32),
        }
        pha, *nxt = self._session.run(list(self._OUTPUTS), feed)
        out = np.clip(pha[0, 0] * 255.0 + 0.5, 0, 255).astype(np.uint8)
        if out.shape[:2] != (h, w):
            out = cv2.resize(out, (w, h), interpolation=cv2.INTER_LINEAR)
        return out, nxt

    def matte(self, frame: np.ndarray) -> np.ndarray:
        """Un fotograma suelto, sin historia (imágenes fijas)."""
        return self.stream().matte(frame)

    def stream(self) -> MatteStream:
        return RvmStream(self)


class RvmMobileNetProvider(RvmProvider):
    id = "rvm_mobilenetv3"
    label = "RVM"
    model_version = "rvm-mobilenetv3-fp32-1"
    filename = "rvm_mobilenetv3_fp32.onnx"
    url = ("https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/"
           "rvm_mobilenetv3_fp32.onnx")


class RvmResNet50Provider(RvmProvider):
    id = "rvm_resnet50"
    label = "RVM ResNet-50"
    model_version = "rvm-resnet50-fp32-1"
    filename = "rvm_resnet50_fp32.onnx"
    url = ("https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/"
           "rvm_resnet50_fp32.onnx")


# --- Registro ---------------------------------------------------------------

PROVIDERS: dict[str, BackgroundRemovalProvider] = {}


def register(provider: BackgroundRemovalProvider) -> None:
    PROVIDERS[provider.id] = provider


# El orden es el del catálogo: primero los recomendados.
register(RvmMobileNetProvider())
register(RvmResNet50Provider())
register(BiRefNetLiteProvider())
register(U2NetProvider())
register(U2NetLiteProvider())

# Proveedores asistidos por puntos (SAM 2.1). Interactivos: el pincel keep/erase
# es el prompt. Se registran igual que los automáticos; ``service`` los distingue
# por el atributo ``interactive``.
from .sam import Sam21Provider  # noqa: E402  (evita ciclo en tiempo de import)

for _bb in ("tiny", "base_plus", "large"):
    try:
        register(Sam21Provider(_bb))
    except Exception:  # noqa: BLE001 - un backbone inválido no debe tumbar el módulo
        log.warning("No se pudo registrar SAM backbone %s", _bb)


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
