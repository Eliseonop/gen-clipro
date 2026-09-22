"""Azure AI Vision (Image Analysis 4.0): OCR + análisis de imagen.

Adaptador independiente del TTS/STT: usa SU PROPIO recurso (Vision), con clave y
**endpoint** (no región). Igual que ``azure_tts``/``azure_stt`` habla por REST +
``urllib`` (sin SDK ni dependencias nuevas).

Credenciales (nunca se exponen al frontend):
  - clave:    env ``AZURE_VISION_KEY``  o  settings ``api_keys["azure_vision"]``
  - endpoint: env ``AZURE_VISION_ENDPOINT``  o  settings ``azure_vision_endpoint``
              (ej. ``https://edu-speech.cognitiveservices.azure.com``)

La respuesta de Azure se normaliza a una estructura interna limpia para que el
frontend no dependa del formato de Azure. No se inventan campos: solo se mapea lo
que Azure devuelve.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

from . import settings

log = logging.getLogger("videoyt.azure_vision")

_API_VERSION = "2024-02-01"

# Features de Image Analysis 4.0. ``read`` es el OCR. ``caption`` puede no estar
# disponible en todas las regiones; si Azure lo rechaza, se reintenta sin él.
_ANALYZE_FEATURES = ["caption", "tags", "objects", "people", "read"]
_OCR_FEATURES = ["read"]


def api_key() -> str:
    env = (os.environ.get("AZURE_VISION_KEY") or "").strip()
    if env:
        return env
    return settings.api_key("azure_vision")


def endpoint() -> str:
    env = (os.environ.get("AZURE_VISION_ENDPOINT") or "").strip()
    if env:
        return env.rstrip("/")
    data = settings.load() or {}
    return str(data.get("azure_vision_endpoint") or "").strip().rstrip("/")


def unavailable_reason() -> Optional[str]:
    if not api_key():
        return "Falta la clave de Azure Vision. Configúrala o define AZURE_VISION_KEY."
    if not endpoint():
        return "Falta el endpoint de Azure Vision. Configúralo o define AZURE_VISION_ENDPOINT."
    return None


def available() -> bool:
    return unavailable_reason() is None


def _request(image_bytes: bytes, features: list[str], language: str, key: str, ep: str) -> dict:
    feats = ",".join(features)
    url = (f"{ep}/computervision/imageanalysis:analyze"
           f"?api-version={_API_VERSION}&features={feats}"
           f"&language={language}&gender-neutral-caption=true")
    req = urllib.request.Request(
        url,
        data=image_bytes,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/octet-stream",
            "Accept": "application/json",
            "User-Agent": "video-yt/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:400]
        if exc.code in (401, 403):
            raise RuntimeError("Azure rechazó la clave/endpoint de Vision (401/403). Revísalos.") from exc
        if exc.code == 429:
            raise RuntimeError("Azure Vision: límite de peticiones alcanzado (429). Espera y reintenta.") from exc
        if exc.code == 400:
            raise _BadRequest(detail)
        raise RuntimeError(f"Azure Vision falló ({exc.code}): {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"No se pudo conectar con Azure Vision: {exc.reason}") from exc


class _BadRequest(RuntimeError):
    """400 de Azure (p. ej. una feature no soportada en la región)."""


def _box(bb: dict | None) -> Optional[dict]:
    if not isinstance(bb, dict):
        return None
    return {
        "x": int(bb.get("x", 0)),
        "y": int(bb.get("y", 0)),
        "w": int(bb.get("w", 0)),
        "h": int(bb.get("h", 0)),
    }


def normalize_ocr(read_result: dict | None) -> dict:
    """``readResult`` de Azure → {text, lines[], words[]}. Función pura."""
    read_result = read_result or {}
    lines_out: list[dict] = []
    words_out: list[dict] = []
    all_text: list[str] = []
    for block in read_result.get("blocks") or []:
        for line in block.get("lines") or []:
            ltext = (line.get("text") or "").strip()
            if ltext:
                all_text.append(ltext)
            lwords = []
            for w in line.get("words") or []:
                wt = (w.get("text") or "").strip()
                if not wt:
                    continue
                item = {"text": wt}
                if w.get("confidence") is not None:
                    item["confidence"] = round(float(w["confidence"]), 3)
                if w.get("boundingPolygon"):
                    item["polygon"] = w["boundingPolygon"]
                lwords.append(item)
                words_out.append(item)
            lines_out.append({"text": ltext, "words": lwords,
                              "polygon": line.get("boundingPolygon")})
    return {"text": "\n".join(all_text).strip(), "lines": lines_out, "words": words_out}


def normalize_analysis(payload: dict | None) -> dict:
    """Respuesta de Image Analysis → estructura interna limpia. Función pura.

    Solo mapea lo que Azure devuelva (los campos ausentes quedan vacíos/None).
    """
    payload = payload or {}
    md = payload.get("metadata") or {}

    caption = None
    caption_conf = None
    if isinstance(payload.get("captionResult"), dict):
        caption = (payload["captionResult"].get("text") or "").strip() or None
        if payload["captionResult"].get("confidence") is not None:
            caption_conf = round(float(payload["captionResult"]["confidence"]), 3)

    tags = []
    for t in (payload.get("tagsResult") or {}).get("values") or []:
        name = (t.get("name") or "").strip()
        if name:
            tags.append({"name": name,
                         "confidence": round(float(t.get("confidence", 0)), 3)})

    objects = []
    for o in (payload.get("objectsResult") or {}).get("values") or []:
        otags = o.get("tags") or []
        name = (otags[0].get("name") if otags else "").strip() if otags else ""
        conf = otags[0].get("confidence") if otags else None
        objects.append({
            "name": name or None,
            "confidence": round(float(conf), 3) if conf is not None else None,
            "box": _box(o.get("boundingBox")),
        })

    people = []
    for p in (payload.get("peopleResult") or {}).get("values") or []:
        conf = p.get("confidence")
        # Azure devuelve muchas detecciones de baja confianza; el frontend filtra,
        # pero descartamos el ruido extremo aquí.
        if conf is not None and float(conf) < 0.3:
            continue
        people.append({
            "confidence": round(float(conf), 3) if conf is not None else None,
            "box": _box(p.get("boundingBox")),
        })

    ocr = normalize_ocr(payload.get("readResult"))

    return {
        "caption": caption,
        "caption_confidence": caption_conf,
        "tags": tags,
        "objects": objects,
        "people": people,
        "ocr_text": ocr["text"],
        "read": ocr,
        "width": md.get("width"),
        "height": md.get("height"),
    }


def _analyze_raw(image_bytes: bytes, features: list[str], language: str) -> dict:
    reason = unavailable_reason()
    if reason:
        raise RuntimeError(reason)
    if not image_bytes:
        raise RuntimeError("Imagen vacía o no válida.")
    key, ep = api_key(), endpoint()
    try:
        return _request(image_bytes, features, language, key, ep)
    except _BadRequest as exc:
        # Reintento sin 'caption'/'people' (no soportadas en algunas regiones).
        fallback = [f for f in features if f not in ("caption", "people")]
        if fallback and fallback != features:
            log.warning("Azure Vision 400 (%s); reintento con %s", str(exc)[:120], fallback)
            return _request(image_bytes, fallback, language, key, ep)
        raise RuntimeError(f"Azure Vision rechazó la petición (400): {exc}") from exc


def analyze_image(image_bytes: bytes, language: str = "en") -> dict:
    """Análisis completo (caption, tags, objects, people, OCR) normalizado."""
    payload = _analyze_raw(image_bytes, _ANALYZE_FEATURES, language)
    return normalize_analysis(payload)


def ocr_image(image_bytes: bytes, language: str = "en") -> dict:
    """Solo OCR (texto, líneas, palabras, confianza) normalizado."""
    payload = _analyze_raw(image_bytes, _OCR_FEATURES, language)
    return normalize_ocr(payload.get("readResult"))
