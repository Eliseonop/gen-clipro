"""Servicio de Eliminar fondo: extracción de fotogramas, caché y matte derivado.

Caché en DOS niveles, dentro de ``data/bgcache/``:

    matte/<base_key>/000001.png   NIVEL 1 — CARO (una inferencia por fotograma)
                     meta.json    rango calculado, cadencia, tamaño de la fuente
    mask/<derive_key>/000001.png  NIVEL 2 — BARATO (derivado del nivel 1)

``base_key``   = fuente + proveedor + versión de modelo + mask_fps + mask_height
``derive_key`` = base_key + threshold/softness/feather/invert/edits

Consecuencias que sostienen todo el diseño:

* Los fotogramas se indexan por **tiempo ABSOLUTO de la fuente**
  (``idx = round(t·mask_fps)``), no por el recorte del clip → cortar, mover,
  duplicar o recortar el clip **no invalida la caché**.
* Mover un slider (umbral, pluma, pincel…) solo cambia ``derive_key``: se
  recalcula el nivel 2, que es aritmética sobre PNGs. **El modelo no se
  vuelve a ejecutar.**
* El preview descarga fotogramas del **nivel 1** (inmutables, cacheables por
  HTTP) y aplica la derivación en JS; el export materializa el **nivel 2** y lo
  mete en ``alphamerge``. Preview y export leen los MISMOS fotogramas, así que
  la paridad es estructural, no aproximada.
* El rango es **incremental**: pedir un tramo nuevo solo procesa lo que falta.
"""
from __future__ import annotations

import hashlib
import json
import logging
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from .. import clip_bg, config, gpu
from . import providers

log = logging.getLogger("videoyt.bg")

CACHE_ROOT = config.DATA_DIR / "bgcache"
MATTE_ROOT = CACHE_ROOT / "matte"
MASK_ROOT = CACHE_ROOT / "mask"
# Embeddings del encoder SAM (nivel 1 de la vía asistida): caros y, sobre todo,
# INDEPENDIENTES de los puntos → se cachean por fotograma y se reutilizan cuando
# el usuario cambia el prompt; solo el decoder (barato) se vuelve a lanzar.
EMBED_ROOT = CACHE_ROOT / "embed"

# Tope de fotogramas por matte (mismo espíritu que MAX_MASK_FRAMES de clip_mask).
MAX_MATTE_FRAMES = 9000
# Margen (s) que se procesa a cada lado del tramo pedido: absorbe recortes
# posteriores del clip sin volver a lanzar el job.
RANGE_MARGIN = 0.5

ProgressCb = Optional[Callable[[float, str], None]]
_build_lock = threading.Lock()


class BgCancelled(RuntimeError):
    """El job pidió cancelar durante la extracción."""


# --- Rutas y metadatos ------------------------------------------------------

def matte_dir(base_key: str) -> Path:
    return MATTE_ROOT / str(base_key)


def mask_dir(derive_key: str) -> Path:
    return MASK_ROOT / str(derive_key)


def frame_path(folder: Path, index: int) -> Path:
    """Los PNG se numeran ``index + 1`` para que ``%06d`` empiece en 000001."""
    return folder / f"{int(index) + 1:06d}.png"


def frame_pattern(folder: Path) -> str:
    return str(folder / "%06d.png")


def read_meta(base_key: str) -> Optional[dict]:
    p = matte_dir(base_key) / "meta.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:  # noqa: BLE001 - meta corrupto = como si no hubiera caché
        return None


def write_meta(base_key: str, meta: dict) -> None:
    folder = matte_dir(base_key)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


_FINGERPRINT_BYTES = 64 * 1024


def source_id(path: Path) -> str:
    """Identidad del archivo fuente: tamaño + mtime + huella del contenido.

    Si el material se regenera (mismo nombre, otro contenido) la clave cambia y
    el matte se recalcula, en vez de quedarse pegado al vídeo anterior. Tamaño y
    mtime no bastan: "Guardar clip" sobrescribe el archivo y una regeneración del
    mismo tamaño dentro del mismo tick del reloj reusaría el matte viejo. Por eso
    se añade un sha1 de los primeros y últimos 64 KiB — coste constante, sea el
    vídeo de 2 MB o de 2 GB.
    """
    p = Path(path)
    try:
        st = p.stat()
    except OSError:
        return p.name
    h = hashlib.sha1()
    try:
        with open(p, "rb") as fh:
            h.update(fh.read(_FINGERPRINT_BYTES))
            if st.st_size > _FINGERPRINT_BYTES:
                fh.seek(max(0, st.st_size - _FINGERPRINT_BYTES))
                h.update(fh.read(_FINGERPRINT_BYTES))
    except OSError:
        return f"{p.name}:{st.st_size}:{st.st_mtime_ns}"
    return f"{p.name}:{st.st_size}:{st.st_mtime_ns}:{h.hexdigest()[:16]}"


def _contiguous_range(base_key: str, want_lo: int, want_hi: int) -> Optional[tuple[int, int]]:
    """Tramo CONTIGUO de fotogramas que existe de verdad en disco.

    El rango pedido y el extraído no siempre coinciden: pedir hasta el final de
    un vídeo de 0,5 s a 10 fps son 6 índices pero solo hay 5 fotogramas. Sellar
    en el meta el rango PEDIDO dejaba huecos que luego reventaban el export, así
    que el meta se sella con lo que hay.
    """
    folder = matte_dir(base_key)
    if not folder.exists():
        return None
    lo = int(want_lo)
    while lo <= int(want_hi) and not frame_path(folder, lo).exists():
        lo += 1
    if lo > int(want_hi):
        return None
    hi = lo
    while frame_path(folder, hi + 1).exists():
        hi += 1
    return lo, hi


# --- Rango pedido por un clip -----------------------------------------------

def clip_range(clip, meta: Optional[dict] = None) -> tuple[float, float]:
    """Tramo de la FUENTE que necesita el clip, con margen."""
    from ..clip_kind import is_still_clip

    if is_still_clip(clip):
        dur = float((meta or {}).get("source_duration") or 0.0)
        return 0.0, max(0.0, dur)
    inp = float(clip_bg._get(clip, "in_point", 0.0) or 0.0)
    out = float(clip_bg._get(clip, "out_point", 0.0) or 0.0)
    t0 = max(0.0, inp - RANGE_MARGIN)
    t1 = max(t0, out + RANGE_MARGIN)
    return t0, t1


def index_range(t0: float, t1: float, mask_fps: int) -> tuple[int, int]:
    i0 = clip_bg.matte_frame_index(t0, mask_fps)
    i1 = max(i0, clip_bg.matte_frame_index(t1, mask_fps))
    return i0, i1


def missing_ranges(base_key: str, i0: int, i1: int) -> list[tuple[int, int]]:
    """Sub-rangos (inclusive) que faltan en la caché. Vacío = nada que hacer."""
    folder = matte_dir(base_key)
    if not folder.exists():
        return [(i0, i1)]
    out: list[tuple[int, int]] = []
    start: Optional[int] = None
    for i in range(i0, i1 + 1):
        if frame_path(folder, i).exists():
            if start is not None:
                out.append((start, i - 1))
                start = None
        elif start is None:
            start = i
    if start is not None:
        out.append((start, i1))
    return out


def covered_range(base_key: str) -> Optional[tuple[int, int]]:
    meta = read_meta(base_key)
    if not meta:
        return None
    rng = meta.get("range")
    if not isinstance(rng, list) or len(rng) != 2:
        return None
    return int(rng[0]), int(rng[1])


# --- Extracción de fotogramas (nunca el vídeo entero en RAM) ---------------

def _probe(path: Path) -> dict:
    from .. import detect
    return detect.video_info(Path(path))


def _still_frame(path: Path, height: int) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"No se puede leer la imagen: {path}")
    h, w = img.shape[:2]
    tw = max(2, int(round(w * (height / max(1, h)))))
    tw -= tw % 2
    out = cv2.resize(img, (max(2, tw), int(height)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def _extract_size(path: Path, height: int) -> tuple[int, int]:
    from .. import detect
    w, h = detect.dims(Path(path))
    if w <= 0 or h <= 0:
        img = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if img is None:
            raise RuntimeError(f"No se pueden leer las dimensiones de {path}")
        h, w = img.shape[:2]
    th = min(int(height), int(h)) if h > 0 else int(height)
    th = max(2, th - (th % 2))
    tw = max(2, int(round(w * (th / max(1, h)))))
    tw -= tw % 2
    return max(2, tw), th


def _iter_frames(path: Path, t0: float, count: int, mask_fps: int,
                 width: int, height: int, cancel: Optional[Callable[[], bool]] = None):
    """Fotogramas RGB del tramo, uno a uno, por tubería de ffmpeg.

    ``rawvideo`` a ``width x height``: se lee exactamente un fotograma por
    iteración, así que la memoria es constante sea el vídeo de 10 s o de 2 h.
    """
    exe = shutil.which("ffmpeg") or "ffmpeg"
    frame_bytes = width * height * 3
    cmd = [
        exe, "-hide_banner", "-loglevel", "error", "-nostdin",
        "-ss", f"{max(0.0, t0):.6f}", "-i", str(path),
        "-vf", f"fps={int(mask_fps)},scale={width}:{height}:flags=bicubic",
        "-frames:v", str(int(count)),
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(int(count)):
            if cancel and cancel():
                raise BgCancelled("cancelado")
            buf = proc.stdout.read(frame_bytes)
            if not buf or len(buf) < frame_bytes:
                break
            yield np.frombuffer(buf, np.uint8).reshape(height, width, 3)
    finally:
        # Nunca dejar ffmpeg huérfano: cerrar la tubería y matar si sigue vivo.
        try:
            if proc.stdout:
                proc.stdout.close()
        except Exception:  # noqa: BLE001
            pass
        if proc.poll() is None:
            proc.kill()
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            pass
        try:
            if proc.stderr:
                proc.stderr.close()
        except Exception:  # noqa: BLE001
            pass


# Tope de fotogramas que se retienen en RAM para la mediana temporal. Por
# encima, el suavizado se omite (raro: son clips larguísimos a mask_fps).
SMOOTH_FRAME_CAP = 1500


def _temporal_median(frames: list[np.ndarray], window: int) -> list[np.ndarray]:
    """Mediana temporal por fotograma con ventana centrada (anti-parpadeo).

    La mediana descarta fotogramas atípicos (el destello de un frame suelto) sin
    arrastrar el contorno, que es lo que pasaría con una media exponencial.
    """
    if window <= 1 or len(frames) < 2:
        return frames
    arr = np.stack(frames, 0)              # [T, H, W] uint8
    t = arr.shape[0]
    half = window // 2
    out = np.empty_like(arr)
    for i in range(t):
        lo = max(0, i - half)
        hi = min(t, i + half + 1)
        out[i] = np.median(arr[lo:hi], axis=0).astype(np.uint8)
    return [out[i] for i in range(t)]


# --- Vía asistida (SAM): embeddings cacheados por fotograma -----------------

def _embed_key(src_id: str, provider, mask_fps: int, height: int) -> str:
    """Clave de los embeddings: fuente + backbone + cadencia/alto. SIN puntos."""
    return clip_bg._digest({
        "src": str(src_id),
        "enc": getattr(provider, "id", ""),
        "ver": getattr(provider, "model_version", ""),
        "fps": int(mask_fps),
        "h": int(height),
    })


def _embeddings(provider, embed_key: str, index: int, frame: np.ndarray) -> dict:
    """Embeddings del fotograma ``index`` (cacheados en disco). Encode si faltan."""
    folder = EMBED_ROOT / embed_key
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / f"{int(index) + 1:06d}.npz"
    if p.exists():
        try:
            with np.load(p) as data:
                return {k: data[k] for k in data.files}
        except Exception:  # noqa: BLE001 - npz corrupto → recalcular
            pass
    emb = provider.encode(frame)
    try:
        np.savez(p, **emb)
    except Exception:  # noqa: BLE001 - sin disco → seguir sin cachear
        pass
    return emb


# --- Nivel 1: matte crudo del modelo ---------------------------------------

def build_matte(path: Path, auto: dict, t0: float, t1: float, still: bool = False,
                on_progress: ProgressCb = None,
                cancel: Optional[Callable[[], bool]] = None) -> dict:
    """Asegura el matte crudo del tramo ``[t0, t1]``. Devuelve el meta resultante.

    Es **incremental**: solo procesa los fotogramas que falten en la caché.
    """
    provider = providers.get(auto["provider"])
    provider.ensure_ready(on_progress)
    mask_fps = int(auto["mask_fps"])
    key = clip_bg.base_key(source_id(path), auto, provider.model_version)
    folder = matte_dir(key)
    folder.mkdir(parents=True, exist_ok=True)

    info = _probe(path)
    src_dur = float(info.get("duration") or 0.0)
    width, height = _extract_size(path, int(auto["mask_height"]))

    if still and src_dur <= 0.0:
        i0 = i1 = 0
    else:
        limit = src_dur if src_dur > 0 else t1
        i0, i1 = index_range(max(0.0, t0), min(t1, limit), mask_fps)
        if i1 - i0 + 1 > MAX_MATTE_FRAMES:
            i1 = i0 + MAX_MATTE_FRAMES - 1

    todo = missing_ranges(key, i0, i1)
    total = sum(b - a + 1 for a, b in todo)
    device = gpu.onnx_device_label(gpu.onnx_providers(providers._device_setting()))
    if total:
        log.info("Eliminar fondo: %d fotograma(s) con %s en %s (%dx%d @ %d fps)",
                 total, provider.id, device, width, height, mask_fps)
    window = clip_bg.stabilize_window(auto)
    # Vía asistida (SAM): el matte sale de encode (cacheado) + decode(puntos).
    interactive = bool(getattr(provider, "interactive", False))
    points = clip_bg.edits_to_points(auto["edits"]) if interactive else []
    embed_key = _embed_key(source_id(path), provider, mask_fps, height) if interactive else ""
    done = 0
    t_start = time.time()
    for a, b in todo:
        count = b - a + 1
        is_still = still and src_dur <= 0.0
        if is_still:
            frames = iter([_still_frame(path, height)])
        else:
            frames = _iter_frames(path, clip_bg.matte_frame_time(a, mask_fps), count,
                                  mask_fps, width, height, cancel)
        # Suavizado temporal: se retiene el tramo en RAM, se calcula la mediana
        # centrada y se escribe. Se omite en imágenes fijas y en tramos enormes.
        smooth = window > 1 and not is_still and count <= SMOOTH_FRAME_CAP
        buffered: list[np.ndarray] = []
        idx = a
        for frame in frames:
            if cancel and cancel():
                raise BgCancelled("cancelado")
            if interactive:
                emb = _embeddings(provider, embed_key, idx if not smooth else a + len(buffered), frame)
                m = provider.decode(emb, points, (height, width))
            else:
                m = provider.matte(frame)
            if smooth:
                buffered.append(m)
            else:
                cv2.imwrite(str(frame_path(folder, idx)), m)
                idx += 1
            done += 1
            if on_progress and total:
                rate = done / max(0.01, time.time() - t_start)
                left = (total - done) / max(0.01, rate)
                on_progress(min(0.99, done / total),
                            f"Separando sujeto y fondo ({done}/{total}) · {device}"
                            f" · queda ~{int(left)}s")
        if smooth:
            for k, m in enumerate(_temporal_median(buffered, window)):
                cv2.imwrite(str(frame_path(folder, a + k)), m)
    prev = covered_range(key)
    want_lo = min(i0, prev[0]) if prev else i0
    real = _contiguous_range(key, want_lo, max(i1, prev[1] if prev else i1))
    if real is None:
        raise RuntimeError(
            "No se pudo extraer ningún fotograma del material para eliminar el fondo.")
    lo, hi = real
    meta = {
        "base_key": key,
        "provider": provider.id,
        "model_version": provider.model_version,
        "mask_fps": mask_fps,
        "mask_height": height,
        "width": width,
        "height": height,
        "source_duration": round(src_dur, 3),
        "source_id": source_id(path),
        "range": [int(lo), int(hi)],
        "device": device,
        "updated_at": int(time.time()),
    }
    write_meta(key, meta)
    return meta


# --- Nivel 2: matte derivado (ajustes + correcciones del pincel) -----------

def read_matte_frame(base_key: str, index: int) -> Optional[np.ndarray]:
    """Fotograma crudo del nivel 1, con recorte al rango disponible."""
    rng = covered_range(base_key)
    if rng is None:
        return None
    idx = max(rng[0], min(rng[1], int(index)))
    p = frame_path(matte_dir(base_key), idx)
    if not p.exists():
        return None
    img = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
    return img


def matte_png(base_key: str, index: int) -> Optional[bytes]:
    """PNG RGBA del matte crudo con **alfa = matte**.

    Servir el alfa ya puesto deja que el canvas del preview recorte con
    ``destination-in`` sin recorrer píxeles para convertir luminancia en alfa.
    """
    m = read_matte_frame(base_key, index)
    if m is None:
        return None
    h, w = m.shape[:2]
    rgba = np.empty((h, w, 4), np.uint8)
    rgba[:, :, 0] = 255
    rgba[:, :, 1] = 255
    rgba[:, :, 2] = 255
    rgba[:, :, 3] = m
    ok, buf = cv2.imencode(".png", rgba)
    return buf.tobytes() if ok else None


def ensure_derived(base_key: str, auto: dict, i0: int, i1: int) -> Optional[Path]:
    """Materializa el nivel 2 para ``[i0, i1]``. Devuelve su carpeta.

    Solo escribe los fotogramas que falten: cambiar un ajuste rehace PNGs, que
    es aritmética, no inferencia.
    """
    rng = covered_range(base_key)
    if rng is None:
        return None
    key = clip_bg.derive_key(base_key, auto)
    folder = mask_dir(key)
    folder.mkdir(parents=True, exist_ok=True)
    lo = max(rng[0], int(i0))
    hi = min(rng[1], max(int(i1), int(i0)))
    with _build_lock:
        for idx in range(lo, hi + 1):
            dest = frame_path(folder, idx)
            if dest.exists():
                continue
            raw = read_matte_frame(base_key, idx)
            if raw is None:
                continue
            cv2.imwrite(str(dest), clip_bg.derive_matte(raw, auto))
        # Los índices fuera del rango cacheado (clip más largo que lo procesado)
        # repiten el extremo, igual que ``eof_action=repeat`` del overlay.
        for idx in range(int(i0), lo):
            dest = frame_path(folder, idx)
            if not dest.exists():
                shutil.copyfile(frame_path(folder, lo), dest)
        for idx in range(hi + 1, int(i1) + 1):
            dest = frame_path(folder, idx)
            if not dest.exists():
                shutil.copyfile(frame_path(folder, hi), dest)
    return folder


def build_clip_bg_mask(clip, fps: int) -> Optional[dict]:
    """Especificación del matte de un clip para el filtergraph del export.

    ``None`` si el clip no tiene eliminación automática lista. No lanza: si la
    caché desapareció, el export sigue (sin matte) en vez de romperse.
    """
    from ..clip_kind import is_still_clip
    from ..clip_speed import clip_source_duration

    bg = clip_bg.clip_bg(clip)
    if not clip_bg.bg_capable(clip) or not clip_bg.auto_active(bg):
        return None
    auto = bg["auto"]
    base = auto["base_key"]
    meta = read_meta(base)
    if not meta:
        return None
    mask_fps = int(meta.get("mask_fps") or auto["mask_fps"])
    inp = float(clip_bg._get(clip, "in_point", 0.0) or 0.0)
    src_dur = max(0.04, clip_source_duration(clip))
    if is_still_clip(clip):
        i0 = 0
        i1 = max(0, int(covered_range(base)[1]) if covered_range(base) else 0)
        loop_dur = float(meta.get("source_duration") or 0.0)
        if loop_dur > 0:
            i1 = min(i1, clip_bg.matte_frame_index(loop_dur, mask_fps))
    else:
        i0 = clip_bg.matte_frame_index(inp, mask_fps)
        i1 = clip_bg.matte_frame_index(inp + src_dur, mask_fps)
    folder = ensure_derived(base, auto, i0, i1)
    if folder is None:
        return None
    return {
        "path": frame_pattern(folder),
        "start_number": int(i0) + 1,
        "mask_fps": mask_fps,
        "frames": int(i1 - i0 + 1),
        "duration": round(src_dur, 3),
        "width": int(meta.get("width") or 0),
        "height": int(meta.get("height") or 0),
    }


def build_timeline_bg_masks(timeline, fps: int) -> dict[str, dict]:
    """Matte derivado de todos los clips de la timeline, por id de clip."""
    out: dict[str, dict] = {}
    for c in getattr(timeline, "clips", []) or []:
        try:
            spec = build_clip_bg_mask(c, fps)
        except Exception as exc:  # noqa: BLE001 - un matte roto no tumba el export
            log.warning("Eliminar fondo: no se pudo preparar el matte de %s (%s)",
                        getattr(c, "id", "?"), exc)
            continue
        if spec:
            out[str(clip_bg._get(c, "id"))] = spec
    return out


# --- Mantenimiento ----------------------------------------------------------

def cache_stats() -> dict:
    def folder_size(root: Path) -> tuple[int, int]:
        n = size = 0
        if root.exists():
            for p in root.rglob("*.png"):
                n += 1
                try:
                    size += p.stat().st_size
                except OSError:
                    pass
        return n, size

    m_n, m_b = folder_size(MATTE_ROOT)
    k_n, k_b = folder_size(MASK_ROOT)
    return {
        "matte_frames": m_n, "matte_bytes": m_b,
        "mask_frames": k_n, "mask_bytes": k_b,
        "entries": len([p for p in MATTE_ROOT.iterdir() if p.is_dir()]) if MATTE_ROOT.exists() else 0,
        "root": str(CACHE_ROOT),
    }


def prune_derived(keep: set[str] | None = None) -> int:
    """Borra niveles 2 que ya no referencia nadie. El nivel 1 no se toca."""
    if not MASK_ROOT.exists():
        return 0
    keep = keep or set()
    removed = 0
    for folder in list(MASK_ROOT.iterdir()):
        if folder.is_dir() and folder.name not in keep:
            shutil.rmtree(folder, ignore_errors=True)
            removed += 1
    return removed


def clear_cache(base_key: str | None = None) -> None:
    if base_key:
        shutil.rmtree(matte_dir(base_key), ignore_errors=True)
        return
    shutil.rmtree(CACHE_ROOT, ignore_errors=True)
