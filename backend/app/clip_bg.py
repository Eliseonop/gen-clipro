"""Eliminar fondo: modelo del clip, matte derivado y chroma key.

Espejo de ``frontend/src/lib/clipBg.js``. Es la CAPA DE FUENTE del clip: decide
qué píxeles del material original son opacos ANTES del recorte/pose/efectos.
No toca el archivo: todo vive en ``clip.bg_removal``.

Se compone con ``clip_mask`` sin solaparse — son dos etapas distintas:

    fuente ─► [clip_bg: chroma + matte IA]  ─► crop/pose/fx ─► overlay
                                                                  └─► [clip_mask: maskedmerge]
      espacio FUENTE                                          espacio SALIDA

Coordenadas del pincel de corrección (independientes de la resolución):
  x, y   → fracción del ancho/alto de la FUENTE (0-1).
  size   → diámetro en fracción del ALTO de la fuente (el pincel sale redondo).

Orden de derivación del matte (fijo; preview y export deben coincidir):
  1. niveles (threshold / softness)   2. pluma (feather)
  3. invertir                          4. correcciones del pincel

Chroma key: replica EXACTAMENTE ``chromakey`` de FFmpeg (validado bit a bit
contra ffmpeg 9 en ``tests/test_clip_bg.py``). Ojo al detalle que importa: el
color de la CLAVE se convierte a UV en rango COMPLETO (JPEG) mientras que el
fotograma llega en rango LIMITADO (CCIR). Es una peculiaridad de FFmpeg, pero
el export la tiene, así que el preview la reproduce.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Optional

import cv2
import numpy as np

# Proveedores de segmentación conocidos (el registro real vive en app/bg).
BG_PROVIDER_IDS = ("u2net", "u2netp")
DEFAULT_PROVIDER = "u2net"

BG_MODES = ("auto", "chroma")
BG_KIND_OK = frozenset({"video", "image"})

MATTE_FEATHER_MAX = 0.15        # en unidades de ALTO de la fuente
MASK_FPS_MIN, MASK_FPS_MAX = 1, 60
MASK_HEIGHT_MIN, MASK_HEIGHT_MAX = 128, 1080
DEFAULT_MASK_FPS = 15
DEFAULT_MASK_HEIGHT = 512

EDIT_OPS = ("keep", "erase")
BG_STATUS = ("idle", "running", "ready", "error")


def _num(v: Any, default: float) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    if n != n or n in (float("inf"), float("-inf")):
        return default
    return n


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def _get(clip: Any, key: str, default: Any = None) -> Any:
    if isinstance(clip, dict):
        return clip.get(key, default)
    return getattr(clip, key, default)


# --- Modelo -----------------------------------------------------------------

def normalize_hex(raw: Any, default: str = "#00FF00") -> str:
    text = str(raw or "").strip()
    if text.startswith("0x") or text.startswith("0X"):
        text = "#" + text[2:]
    if not text.startswith("#"):
        text = "#" + text
    body = text[1:]
    if len(body) == 3:
        body = "".join(ch * 2 for ch in body)
    if len(body) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in body):
        return default
    return "#" + body.upper()


def hex_rgb(color: str) -> tuple[int, int, int]:
    h = normalize_hex(color)[1:]
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def normalize_edit(raw: Any) -> Optional[dict]:
    e = raw if isinstance(raw, dict) else {}
    op = e.get("op") if e.get("op") in EDIT_OPS else "erase"
    pts: list[dict] = []
    for p in (e.get("points") or []):
        if not isinstance(p, dict):
            continue
        x, y = _num(p.get("x"), float("nan")), _num(p.get("y"), float("nan"))
        if x != x or y != y:
            continue
        pt = {"x": x, "y": y}
        if p.get("m"):
            pt["m"] = 1
        pts.append(pt)
    if not pts:
        return None
    return {"op": op, "size": _clamp(_num(e.get("size"), 0.08), 0.002, 1.0), "points": pts}


def normalize_auto(raw: Any) -> dict:
    a = raw if isinstance(raw, dict) else {}
    provider = a.get("provider") if a.get("provider") in BG_PROVIDER_IDS else DEFAULT_PROVIDER
    status = a.get("status") if a.get("status") in BG_STATUS else "idle"
    edits = [e for e in (normalize_edit(x) for x in (a.get("edits") or [])) if e]
    return {
        "enabled": bool(a.get("enabled")),
        "provider": provider,
        "model_version": str(a.get("model_version") or ""),
        "base_key": str(a.get("base_key") or ""),
        "status": status,
        "error": str(a.get("error") or "") or None,
        "mask_fps": int(_clamp(_num(a.get("mask_fps"), DEFAULT_MASK_FPS), MASK_FPS_MIN, MASK_FPS_MAX)),
        "mask_height": int(_clamp(_num(a.get("mask_height"), DEFAULT_MASK_HEIGHT),
                                  MASK_HEIGHT_MIN, MASK_HEIGHT_MAX)),
        "threshold": _clamp(_num(a.get("threshold"), 0.5), 0.0, 1.0),
        "softness": _clamp(_num(a.get("softness"), 0.25), 0.0, 1.0),
        "feather": _clamp(_num(a.get("feather"), 0.0), 0.0, MATTE_FEATHER_MAX),
        "invert": bool(a.get("invert")),
        "edits": edits,
    }


def normalize_chroma(raw: Any) -> dict:
    c = raw if isinstance(raw, dict) else {}
    return {
        "enabled": bool(c.get("enabled")),
        "color": normalize_hex(c.get("color")),
        # Mismos nombres que FFmpeg para que no haya traducción que fallar.
        "similarity": _clamp(_num(c.get("similarity"), 0.20), 1e-5, 1.0),
        "blend": _clamp(_num(c.get("blend"), 0.10), 0.0, 1.0),
        "spill": _clamp(_num(c.get("spill"), 0.0), 0.0, 1.0),
    }


def normalize_bg(raw: Any) -> Optional[dict]:
    """Normaliza ``clip.bg_removal``. ``None`` (o nada activo) → ``None``."""
    if not isinstance(raw, dict) or not raw:
        return None
    mode = raw.get("mode") if raw.get("mode") in BG_MODES else "auto"
    out = {
        "enabled": raw.get("enabled") is not False,
        "mode": mode,
        "auto": normalize_auto(raw.get("auto")),
        "chroma": normalize_chroma(raw.get("chroma")),
    }
    return out


def clip_bg(clip: Any) -> Optional[dict]:
    return normalize_bg(_get(clip, "bg_removal"))


def bg_capable(clip: Any) -> bool:
    """¿El clip admite eliminar fondo? Vídeo e imagen (incluye GIF)."""
    return _get(clip, "kind") in BG_KIND_OK


def auto_active(bg: Optional[dict]) -> bool:
    if not bg or not bg.get("enabled"):
        return False
    a = bg["auto"]
    return bool(a["enabled"] and a["base_key"] and a["status"] == "ready")


def chroma_active(bg: Optional[dict]) -> bool:
    if not bg or not bg.get("enabled"):
        return False
    c = bg["chroma"]
    return bool(c["enabled"])


def bg_active(clip: Any) -> bool:
    """True si el clip debe llevar alfa de fuente en preview y export."""
    if not bg_capable(clip):
        return False
    bg = clip_bg(clip)
    return auto_active(bg) or chroma_active(bg)


def auto_requested(clip: Any) -> bool:
    """El usuario pidió eliminación automática (aunque aún no haya matte)."""
    bg = clip_bg(clip)
    return bool(bg and bg.get("enabled") and bg["auto"]["enabled"])


# --- Índice de fotograma del matte ------------------------------------------

def matte_frame_index(src_t: float, mask_fps: int) -> int:
    """Fotograma del matte para un instante ABSOLUTO de la fuente (0-based).

    Indexar por tiempo de fuente (y no por el recorte del clip) es lo que hace
    que cortar, mover o duplicar el clip NO invalide la caché.
    ``round`` para igualar el redondeo del filtro ``fps`` de FFmpeg.
    """
    fps = max(MASK_FPS_MIN, int(mask_fps or DEFAULT_MASK_FPS))
    return max(0, int(math.floor(max(0.0, _num(src_t, 0.0)) * fps + 0.5)))


def matte_frame_time(index: int, mask_fps: int) -> float:
    fps = max(MASK_FPS_MIN, int(mask_fps or DEFAULT_MASK_FPS))
    return max(0, int(index)) / float(fps)


# --- Derivación del matte (espejo exacto del JS) ----------------------------

def matte_levels(alpha: float, threshold: float, softness: float) -> float:
    """Remapeo de niveles: ventana ``softness`` centrada en ``threshold``."""
    half = max(0.002, float(softness) * 0.5)
    lo = float(threshold) - half
    hi = float(threshold) + half
    return _clamp((alpha - lo) / (hi - lo), 0.0, 1.0)


def matte_lut(auto: dict) -> np.ndarray:
    """LUT de 256 entradas con niveles + invertir.

    Se construye con la MISMA aritmética (float de 64 bits, mismo orden de
    operaciones y mismo redondeo) que ``applyMatteLevels`` en el JS: así el
    preview y el export no pueden desviarse ni 1/255. Hacerlo con arrays float32
    de numpy desviaba justo los valores que caen en el .5 de la rampa.
    """
    invert = bool(auto["invert"])
    half = max(0.002, float(auto["softness"]) * 0.5)
    lo = float(auto["threshold"]) - half
    span = (float(auto["threshold"]) + half) - lo
    lut = np.empty(256, dtype=np.uint8)
    for i in range(256):
        v = _clamp((i / 255.0 - lo) / span, 0.0, 1.0)
        if invert:
            v = 1.0 - v
        lut[i] = min(255, int(math.floor(v * 255.0 + 0.5)))
    return lut


def feather_alpha(alpha: np.ndarray, sigma: float) -> np.ndarray:
    """Gauss equivalente a ``filter: blur(Npx)`` del canvas (igual que clip_mask)."""
    if sigma <= 0.3:
        return alpha
    h, w = alpha.shape
    step = max(1, int(sigma // 16))
    if step > 1:
        small = cv2.resize(alpha, (max(2, w // step), max(2, h // step)),
                           interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigma / step)
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(alpha, (0, 0), sigma)


def paint_edit(img: np.ndarray, edit: dict) -> None:
    """Rasteriza un trazo del pincel en ``img`` (uint8, 0/255) sobre su lienzo."""
    h, w = img.shape[:2]
    pts = edit.get("points") or []
    if not pts:
        return
    thick = max(1, int(round(_num(edit.get("size"), 0.08) * h)))
    strokes: list[list[tuple[int, int]]] = []
    stroke: list[tuple[int, int]] = []
    for p in pts:
        if p.get("m") and stroke:
            strokes.append(stroke)
            stroke = []
        stroke.append((int(round(p["x"] * w)), int(round(p["y"] * h))))
    if stroke:
        strokes.append(stroke)
    for s in strokes:
        if len(s) == 1:
            cv2.circle(img, s[0], max(1, thick // 2), 255, -1, lineType=cv2.LINE_AA)
        else:
            arr = np.array(s, dtype=np.int32)
            cv2.polylines(img, [arr], False, 255, thick, lineType=cv2.LINE_AA)
            # Tapa el hueco de los extremos redondeados en trazos muy gruesos.
            cv2.circle(img, s[0], max(1, thick // 2), 255, -1, lineType=cv2.LINE_AA)
            cv2.circle(img, s[-1], max(1, thick // 2), 255, -1, lineType=cv2.LINE_AA)


def edits_alpha(edits: list[dict], width: int, height: int, op: str) -> Optional[np.ndarray]:
    """Alfa (0-1) de todas las correcciones de un tipo, o ``None`` si no hay."""
    picked = [e for e in (edits or []) if e.get("op") == op]
    if not picked:
        return None
    img = np.zeros((max(2, int(height)), max(2, int(width))), dtype=np.uint8)
    for e in picked:
        paint_edit(img, e)
    return img.astype(np.float32) / 255.0


def derive_matte(matte: np.ndarray, auto: dict) -> np.ndarray:
    """Matte crudo del modelo (uint8) → alfa final del clip (uint8).

    Orden FIJO, el mismo que el JS: niveles → invertir → pluma → correcciones.
    Los niveles y el invertir salen de ``matte_lut`` (LUT de 256 entradas), que
    es idéntica en los dos lados; el resto son operaciones que conmutan o son
    exactas, así que preview y export coinciden.
    """
    src = matte[:, :, 0] if matte.ndim == 3 else matte
    a = cv2.LUT(np.ascontiguousarray(src, dtype=np.uint8), matte_lut(auto))
    h, w = a.shape
    out = a.astype(np.float32) / 255.0
    out = feather_alpha(out, float(auto["feather"]) * h)
    keep = edits_alpha(auto["edits"], w, h, "keep")
    if keep is not None:
        out = np.maximum(out, keep)
    erase = edits_alpha(auto["edits"], w, h, "erase")
    if erase is not None:
        out = np.minimum(out, 1.0 - erase)
    if float(auto["feather"]) <= 0.0 and keep is None and erase is None:
        return a          # sin pluma ni pincel la LUT ya es el resultado exacto
    return np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


# --- Chroma key (espejo bit a bit de FFmpeg) --------------------------------

# Coeficientes de punto fijo de swscale para RGB → U/V (BT.601 rango limitado).
# Son los que usa FFmpeg al pasar el material a ``yuva444p``. Con coma flotante
# el resultado se desvía 1 LSB en algunos colores y el alfa del croma dejaría de
# coincidir con el export; verificado con 3000 colores en test_clip_bg.py.
_SW_SHIFT = 15
_SW_OFFSET = 4210943
_SW_RU, _SW_GU, _SW_BU = -4865, -9528, 14392
_SW_RV, _SW_GV, _SW_BV = 14392, -12061, -2332


def frame_uv(r: int, g: int, b: int) -> tuple[int, int]:
    """U,V del FOTOGRAMA: BT.601 rango LIMITADO, con la aritmética de swscale."""
    u = (_SW_RU * r + _SW_GU * g + _SW_BU * b + _SW_OFFSET) >> _SW_SHIFT
    v = (_SW_RV * r + _SW_GV * g + _SW_BV * b + _SW_OFFSET) >> _SW_SHIFT
    return max(0, min(255, u)), max(0, min(255, v))


def chroma_key_uv(color: str) -> tuple[int, int]:
    """U,V de la CLAVE: BT.601 rango COMPLETO (JPEG), como hace ``chromakey``."""
    r, g, b = hex_rgb(color)
    u = round(-0.168736 * r - 0.331264 * g + 0.5 * b + 128)
    v = round(0.5 * r - 0.418688 * g - 0.081312 * b + 128)
    return max(0, min(255, int(u))), max(0, min(255, int(v)))


_CHROMA_NORM = 255.0 * 255.0 * 2.0


def chroma_alpha8(r: int, g: int, b: int, chroma: dict) -> int:
    """Alfa (0-255) de un píxel. Referencia usada por los tests de paridad."""
    u, v = frame_uv(r, g, b)
    ku, kv = chroma_key_uv(chroma["color"])
    du, dv = u - ku, v - kv
    diff = math.sqrt((du * du + dv * dv) / _CHROMA_NORM)
    blend = float(chroma["blend"])
    sim = float(chroma["similarity"])
    if blend > 1e-4:
        a = _clamp((diff - sim) / blend, 0.0, 1.0)
    else:
        a = 1.0 if diff > sim else 0.0
    return int(a * 255.0)   # FFmpeg trunca al convertir a uint8


def despill_type(color: str) -> str:
    """``green`` o ``blue`` según el canal dominante de la clave."""
    _r, g, b = hex_rgb(color)
    return "blue" if b > g else "green"


DESPILL_MIX = 0.5


def despill_rgb(r: int, g: int, b: int, chroma: dict) -> tuple[int, int, int]:
    """Supresión de derrame. Espejo de ``despill`` (mix=0.5, escala = -spill)."""
    spill = float(chroma["spill"])
    if spill <= 1e-4:
        return r, g, b
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    if despill_type(chroma["color"]) == "blue":
        smap = max(0.0, bf - (rf * DESPILL_MIX + gf * (1.0 - DESPILL_MIX)))
        bf = max(0.0, bf - spill * smap)
    else:
        smap = max(0.0, gf - (rf * DESPILL_MIX + bf * (1.0 - DESPILL_MIX)))
        gf = max(0.0, gf - spill * smap)
    return int(rf * 255.0), int(gf * 255.0), int(bf * 255.0)


def chroma_filters(chroma: dict) -> list[str]:
    """Filtros FFmpeg del chroma key, en orden. Vacío si está apagado.

    ``format=yuva444p`` es obligatorio: con croma submuestreado, ``chromakey``
    promedia el vecindario y el preview (que mira 1 píxel) dejaría de coincidir.
    """
    if not chroma.get("enabled"):
        return []
    r, g, b = hex_rgb(chroma["color"])
    parts = [
        "format=yuva444p",
        f"chromakey=color=0x{r:02X}{g:02X}{b:02X}"
        f":similarity={chroma['similarity']:.6f}:blend={chroma['blend']:.6f}",
    ]
    spill = float(chroma["spill"])
    if spill > 1e-4:
        kind = despill_type(chroma["color"])
        scale = f"{kind}={-spill:.6f}"
        parts.append(
            f"despill=type={kind}:mix={DESPILL_MIX:.3f}:expand=0:{scale}:brightness=0"
        )
    return parts


# --- Claves de caché --------------------------------------------------------

def _digest(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def base_key(source_id: str, auto: dict, model_version: str) -> str:
    """Clave del matte CRUDO: fuente + modelo + cadencia/resolución del matte.

    No incluye threshold/softness/feather/invert/edits: eso es derivado barato y
    mover un slider no debe volver a ejecutar el modelo.
    """
    return _digest({
        "src": str(source_id),
        "provider": auto["provider"],
        "model": str(model_version),
        "fps": int(auto["mask_fps"]),
        "h": int(auto["mask_height"]),
    })


def derive_key(base: str, auto: dict) -> str:
    """Clave del matte DERIVADO: base + ajustes + correcciones del pincel."""
    return _digest({
        "base": str(base),
        "thr": round(float(auto["threshold"]), 5),
        "soft": round(float(auto["softness"]), 5),
        "fea": round(float(auto["feather"]), 5),
        "inv": bool(auto["invert"]),
        "edits": auto["edits"],
    })
