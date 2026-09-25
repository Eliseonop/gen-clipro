"""Seguimiento de la selección SAM a lo largo del clip (Eliminación personalizada).

Es lo que hace el «pincel inteligente» de CapCut: el usuario marca el objeto en
UN fotograma y la selección le sigue durante todo el clip. SAM 2.1 en ONNX solo
trae el segmentador de imagen (sin la memoria de vídeo), así que el seguimiento
se hace encadenando fotogramas:

    fotograma clave  →  máscara (prompts del usuario + pincel manual)
    fotograma i ± 1  →  prompt SACADO de la máscara anterior:
                         caja de la máscara (con margen para el movimiento)
                         + punto(s) positivo(s) en su interior
                         → SAM → de las 3 candidatas, la más coherente

El prompt se recalcula en cada fotograma a partir de la propia segmentación, así
que la selección se corrige sola cuando el objeto se mueve (con puntos fijos, el
prompt se quedaba en el sitio y acababa marcando el fondo).

Con varios fotogramas marcados, cada fotograma del tramo pertenece al fotograma
clave más cercano y se propaga desde él hacia delante y hacia atrás: marcar otro
fotograma corrige el seguimiento a partir de ahí.

Todo es aritmética sobre ``provider.predict`` (decoder de SAM); los embeddings
(encoder, caro) los pone ``service`` desde su caché de disco.
"""
from __future__ import annotations

from typing import Callable, Optional

import cv2
import numpy as np

from .. import clip_bg

# Margen de la caja respecto al tamaño del objeto: absorbe el movimiento entre
# dos fotogramas del matte (a 15 fps) sin abrir tanto que entre fondo.
BOX_MARGIN = 0.12
# Mínimo de margen en fracción del lado del fotograma (objetos pequeños).
BOX_MARGIN_MIN = 0.02
# Componentes de la máscara que reciben su propio punto positivo (un objeto
# ocluido puede partirse en trozos) y área mínima relativa para contar.
MAX_COMPONENTS = 3
MIN_COMPONENT_FRAC = 0.08
# Por debajo de este número de píxeles la selección se da por perdida.
MIN_PIXELS = 16
# Peso de la coherencia con el fotograma anterior al elegir entre las 3
# candidatas de SAM (el resto es su propia confianza, iou_predictions).
CONSISTENCY_WEIGHT = 1.0

EmbedAt = Callable[[int], dict]
OnFrame = Callable[[int, np.ndarray], None]
OnStep = Callable[[int, int], None]


def logits_to_matte(logit: np.ndarray, hw: tuple[int, int]) -> np.ndarray:
    """Logits de baja resolución (256×256) → matte uint8 a ``hw`` (sigmoide)."""
    h, w = hw
    lg = logit.astype(np.float32)
    if lg.shape[:2] != (h, w):
        lg = cv2.resize(lg, (w, h), interpolation=cv2.INTER_LINEAR)
    prob = 1.0 / (1.0 + np.exp(-np.clip(lg, -30.0, 30.0)))
    return np.clip(prob * 255.0 + 0.5, 0, 255).astype(np.uint8)


def prompt_from_mask(mask: np.ndarray) -> Optional[tuple[tuple[float, float, float, float],
                                                          list[tuple[float, float, int]]]]:
    """Máscara (uint8) → (caja normalizada, puntos positivos) para el siguiente frame.

    ``None`` si la máscara está vacía (selección perdida).
    """
    binm = (mask >= 128).astype(np.uint8)
    total = int(binm.sum())
    if total < MIN_PIXELS:
        return None
    h, w = binm.shape
    ys, xs = np.nonzero(binm)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    mx = max(BOX_MARGIN * (x1 - x0 + 1), BOX_MARGIN_MIN * w)
    my = max(BOX_MARGIN * (y1 - y0 + 1), BOX_MARGIN_MIN * h)
    box = (max(0.0, (x0 - mx) / w), max(0.0, (y0 - my) / h),
           min(1.0, (x1 + 1 + mx) / w), min(1.0, (y1 + 1 + my) / h))

    # Un punto positivo en lo más «hondo» de cada trozo grande: el centro
    # geométrico puede caer fuera en formas cóncavas; el máximo de la distancia
    # al borde siempre cae dentro.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binm, connectivity=8)
    comps = sorted(range(1, n), key=lambda k: -int(stats[k, cv2.CC_STAT_AREA]))
    points: list[tuple[float, float, int]] = []
    for k in comps[:MAX_COMPONENTS]:
        if points and stats[k, cv2.CC_STAT_AREA] < MIN_COMPONENT_FRAC * total:
            break
        comp = (labels == k).astype(np.uint8)
        dist = cv2.distanceTransform(comp, cv2.DIST_L2, 5)
        yy, xx = np.unravel_index(int(np.argmax(dist)), dist.shape)
        points.append(((xx + 0.5) / w, (yy + 0.5) / h, 1))
    return box, points


def _binary_iou(a: np.ndarray, b: np.ndarray) -> float:
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 0.0


def keyframe_mask(provider, emb: dict, kf: dict, hw: tuple[int, int]) -> np.ndarray:
    """Selección de un fotograma MARCADO: prompts inteligentes + pincel manual.

    * Trazos inteligentes → SAM completa el objeto (hace falta al menos un +).
    * Pincel manual → se suma tal cual; borrador manual → se resta tal cual.
    """
    h, w = hw
    mask = np.zeros((h, w), np.uint8)
    points = list(kf.get("points") or [])
    if any(lab == 1 for _, _, lab in points):
        logits, iou = provider.predict(emb, points, hw)
        mask = logits_to_matte(logits[int(np.argmax(iou))], hw)
    manual = kf.get("manual") or []
    keep = clip_bg.edits_alpha(manual, w, h, "keep")
    erase = clip_bg.edits_alpha(manual, w, h, "erase")
    if keep is None and erase is None:
        return mask
    out = mask.astype(np.float32) / 255.0
    if keep is not None:
        out = np.maximum(out, keep)
    if erase is not None:
        out = np.minimum(out, 1.0 - erase)
    return np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


def propagate_step(provider, emb: dict, prev: np.ndarray, hw: tuple[int, int]) -> np.ndarray:
    """Máscara del fotograma vecino a partir de la máscara ``prev``."""
    prompt = prompt_from_mask(prev)
    if prompt is None:
        return np.zeros(hw, np.uint8)
    box, points = prompt
    logits, iou = provider.predict(emb, points, hw, box=box)
    prev_bin = prev >= 128
    best, best_score, best_mask = 0, -1e9, None
    for k in range(len(iou)):
        cand = logits_to_matte(logits[k], hw)
        score = float(iou[k]) + CONSISTENCY_WEIGHT * _binary_iou(cand >= 128, prev_bin)
        if score > best_score:
            best, best_score, best_mask = k, score, cand
    return best_mask if best_mask is not None else np.zeros(hw, np.uint8)


def owner_spans(keys: list[int], n: int) -> list[tuple[int, int, int]]:
    """(clave, primero, último): cada fotograma pertenece a la clave más cercana.

    En empate gana la clave anterior. Los tramos cubren ``[0, n-1]`` sin huecos.
    """
    ks = sorted(set(int(k) for k in keys))
    out: list[tuple[int, int, int]] = []
    for j, k in enumerate(ks):
        lo = 0 if j == 0 else (ks[j - 1] + k) // 2 + 1
        hi = n - 1 if j == len(ks) - 1 else (k + ks[j + 1]) // 2
        out.append((k, lo, hi))
    return out


def track(provider, n: int, embed_at: EmbedAt, keyframes: dict[int, dict],
          hw: tuple[int, int], on_frame: OnFrame,
          on_step: Optional[OnStep] = None,
          cancel: Optional[Callable[[], bool]] = None) -> None:
    """Selección de los ``n`` fotogramas del tramo, siguiendo los fotogramas clave.

    ``keyframes`` va indexado por posición RELATIVA al tramo (0..n-1).
    ``on_frame(i, matte)`` recibe cada fotograma (en orden de propagación, no en
    orden temporal). Sin fotogramas clave, todo el tramo sale vacío.
    """
    if n <= 0:
        return
    if not keyframes:
        empty = np.zeros(hw, np.uint8)
        for i in range(n):
            on_frame(i, empty)
        return
    done = 0

    def emit(i: int, m: np.ndarray) -> None:
        nonlocal done
        on_frame(i, m)
        done += 1
        if on_step:
            on_step(done, n)

    for key, lo, hi in owner_spans(list(keyframes), n):
        if cancel and cancel():
            raise TrackCancelled("cancelado")
        base = keyframe_mask(provider, embed_at(key), keyframes[key], hw)
        emit(key, base)
        prev = base
        for i in range(key + 1, hi + 1):            # hacia delante
            if cancel and cancel():
                raise TrackCancelled("cancelado")
            prev = propagate_step(provider, embed_at(i), prev, hw)
            emit(i, prev)
        prev = base
        for i in range(key - 1, lo - 1, -1):        # hacia atrás
            if cancel and cancel():
                raise TrackCancelled("cancelado")
            prev = propagate_step(provider, embed_at(i), prev, hw)
            emit(i, prev)


def relative_keyframes(keyframes: dict[int, dict], i0: int, n: int,
                       wrap: bool = False) -> dict[int, dict]:
    """Índices ABSOLUTOS del matte → posición en el tramo ``[i0, i0+n-1]``.

    Las marcas fuera del tramo se acotan a su borde (o dan la vuelta si ``wrap``,
    para GIFs en bucle). Si dos marcas caen en el mismo fotograma se fusionan.
    """
    out: dict[int, dict] = {}
    for idx, kf in keyframes.items():
        rel = int(idx) - int(i0)
        rel = rel % n if wrap and n > 0 else max(0, min(n - 1, rel))
        dst = out.setdefault(rel, {"points": [], "manual": []})
        dst["points"].extend(kf.get("points") or [])
        dst["manual"].extend(kf.get("manual") or [])
    return out


class TrackCancelled(RuntimeError):
    """El job pidió cancelar durante el seguimiento."""
