"""Generación de imágenes con Microsoft Foundry (MAI-Image + FLUX.2) y Cloudflare
Workers AI (FLUX.2 klein/dev, cupo diario gratis) con FALLBACK.

Mismo estilo que ``foundry``: REST + ``urllib``, sin SDK. Cada deployment vive
en un RECURSO de Azure (host propio + clave propia). Se prueban en orden y, si
uno falla (cuota 429, deprecado, sin clave, caído…), se pasa al siguiente. Un
429 deja ese par recurso/modelo "enfriándose" un rato para no insistir.

Dos familias de API (verificadas contra Azure, 2026-10):
  - MAI-Image-*:  POST {host}/mai/v1/images/generations
                  {model, prompt, width, height} → data[0].b64_json (PNG)
  - FLUX.2-*:     POST {host}/providers/blackforestlabs/v1/{flux-2-pro|flux-2-flex}
                  ?api-version=preview  {model, prompt, width, height}
                  → data[0].b64_json (JPEG)
Auth: cabecera ``api-key``.

Cloudflare Workers AI (reserva gratuita, ~10k neuronas/día, se bloquea al agotarse):
  POST https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/black-forest-labs/<slug>
  multipart/form-data {prompt, width, height} → result.image (base64)
  Auth: ``Authorization: Bearer <token>``. Config ``cloudflare_ai.account_id`` +
  ``api_keys["cloudflare_ai"]``.

Config (settings ``azure_image``)::

    {"resources": [{"id": "edufoundry2",
                    "endpoint": "https://edufoundry2.services.ai.azure.com",
                    "models": ["MAI-Image-2.6", "FLUX.2-pro", ...]}, ...]}

Clave de cada recurso: ``api_keys["azure_image_<id>"]``; si falta y el host
coincide con el de Foundry (chat), se reutiliza ``api_keys["azure_foundry"]``.
Sin ``azure_image`` configurado se usa el recurso de Foundry con todos los
modelos conocidos. Las claves nunca salen al frontend.
"""
from __future__ import annotations

import base64
import json
import logging
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from . import foundry, settings

log = logging.getLogger("videoyt.foundry_image")

TIMEOUT = 120
COOLDOWN_S = 90            # tras un 429, cuánto se aparta ese recurso/modelo
DAILY_COOLDOWN_S = 3600    # cupo diario agotado (Cloudflare): no insistir en 1 h
CF_API = "https://api.cloudflare.com/client/v4/accounts"

# Orden de preferencia en modo "auto": calidad primero, luego rápidos/baratos.
MODELS: dict[str, dict] = {
    "MAI-Image-2.6":       {"family": "mai",  "label": "MAI-Image 2.6 (Microsoft)"},
    "FLUX.2-pro":          {"family": "flux", "label": "FLUX.2 pro (Black Forest Labs)"},
    "MAI-Image-2.5-Pro":   {"family": "mai",  "label": "MAI-Image 2.5 Pro"},
    "MAI-Image-2.6-Flash": {"family": "mai",  "label": "MAI-Image 2.6 Flash (rápido)"},
    "FLUX.2-flex":         {"family": "flux", "label": "FLUX.2 flex"},
    "MAI-Image-2.5":       {"family": "mai",  "label": "MAI-Image 2.5"},
    "MAI-Image-2.5-Flash": {"family": "mai",  "label": "MAI-Image 2.5 Flash (rápido)"},
    # Cloudflare: gratis con cupo diario → reserva final.
    "CF-FLUX.2-klein-9b":  {"family": "cf", "slug": "flux-2-klein-9b",
                            "label": "FLUX.2 klein 9B (Cloudflare, gratis)"},
    "CF-FLUX.2-klein-4b":  {"family": "cf", "slug": "flux-2-klein-4b",
                            "label": "FLUX.2 klein 4B (Cloudflare, gratis)"},
    "CF-FLUX.2-dev":       {"family": "cf", "slug": "flux-2-dev",
                            "label": "FLUX.2 dev (Cloudflare, gratis)"},
}
AZURE_MODELS = [m for m, v in MODELS.items() if v["family"] != "cf"]
CF_MODELS = [m for m, v in MODELS.items() if v["family"] == "cf"]

# Tamaños válidos para ambas familias (múltiplos de 16, ~1 MP).
ASPECTS: dict[str, tuple[int, int]] = {
    "9:16": (768, 1344),
    "16:9": (1344, 768),
    "1:1": (1024, 1024),
    "3:4": (896, 1184),
    "4:3": (1184, 896),
}
DEFAULT_ASPECT = "9:16"

_cool: dict[tuple[str, str], float] = {}
_cool_lock = threading.Lock()


class ImageGenError(RuntimeError):
    def __init__(self, message: str, code: str = "upstream", attempts: list | None = None):
        super().__init__(message)
        self.code = code
        self.attempts = attempts or []


# --- Configuración ------------------------------------------------------------

def _host(url: str) -> str:
    """``https://x.services.ai.azure.com/openai/v1`` → ``https://x.services.ai.azure.com``."""
    p = urlparse((url or "").strip())
    if not p.scheme or not p.netloc:
        return ""
    return f"{p.scheme}://{p.netloc}"


def _resource_name(host: str) -> str:
    return (urlparse(host).netloc or "").split(".")[0]


def cloudflare_account() -> str:
    data = settings.load() or {}
    return str((data.get("cloudflare_ai") or {}).get("account_id") or "").strip()


def _azure_resources() -> list[dict]:
    data = settings.load() or {}
    raw = (data.get("azure_image") or {}).get("resources")
    out: list[dict] = []
    if isinstance(raw, list):
        for r in raw:
            if not isinstance(r, dict):
                continue
            host = _host(str(r.get("endpoint") or ""))
            rid = str(r.get("id") or _resource_name(host)).strip()
            models = [str(m) for m in (r.get("models") or []) if str(m) in AZURE_MODELS]
            if host and rid and models:
                out.append({"id": rid, "provider": "azure", "endpoint": host, "models": models})
    if out:
        return out
    host = _host(foundry.endpoint())
    if host:
        return [{"id": _resource_name(host), "provider": "azure", "endpoint": host,
                 "models": list(AZURE_MODELS)}]
    return []


def resources() -> list[dict]:
    """Recursos configurados [{id, provider, endpoint, models}] (sin claves)."""
    out = _azure_resources()
    acc = cloudflare_account()
    if acc:
        out.append({"id": "cloudflare", "provider": "cloudflare",
                    "endpoint": f"{CF_API}/{acc}/ai/run", "models": list(CF_MODELS)})
    return out


def _key_for(res: dict) -> str:
    if res.get("provider") == "cloudflare":
        return settings.api_key("cloudflare_ai")
    key = settings.api_key(f"azure_image_{res['id']}")
    if key:
        return key
    if _host(foundry.endpoint()) == res["endpoint"]:
        return foundry.api_key()
    return ""


def status() -> dict:
    """Estado para el frontend: recursos, modelos y si tienen clave (sin valores)."""
    now = time.monotonic()
    res = []
    for r in resources():
        res.append({**r, "has_key": bool(_key_for(r)),
                    "cooling": [m for m in r["models"]
                                if _cool.get((r["id"], m), 0) > now]})
    usable = [m for m in MODELS if any(r["has_key"] and m in r["models"] for r in res)]
    return {
        "available": bool(usable),
        "reason": None if usable else (
            "Configura un recurso de Foundry con su clave o Cloudflare Workers AI."),
        "resources": res,
        "cloudflare": {"account_id": cloudflare_account(),
                       "has_key": bool(settings.api_key("cloudflare_ai"))},
        "models": [{"id": m, "label": MODELS[m]["label"], "family": MODELS[m]["family"],
                    "available": m in usable} for m in MODELS],
        "aspects": list(ASPECTS),
    }


# --- Transporte ---------------------------------------------------------------

def _url(host: str, model: str) -> str:
    if MODELS[model]["family"] == "cf":
        return f"{host}/@cf/black-forest-labs/{MODELS[model]['slug']}"
    if MODELS[model]["family"] == "mai":
        return f"{host}/mai/v1/images/generations"
    slug = model.lower().replace(".", "-")          # FLUX.2-pro → flux-2-pro
    return f"{host}/providers/blackforestlabs/v1/{slug}?api-version=preview"


def _post(url: str, key: str, body: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "video-yt/1.0", "api-key": key})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _post_cf(url: str, token: str, fields: dict) -> dict:
    """Cloudflare FLUX.2 solo acepta multipart/form-data (aunque sea solo texto)."""
    boundary = f"----videoyt{int(time.time() * 1000)}"
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
             f"\r\n\r\n{value}\r\n" for name, value in fields.items()]
    parts.append(f"--{boundary}--\r\n")
    req = urllib.request.Request(
        url, data="".join(parts).encode("utf-8"), method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                 "Accept": "application/json", "User-Agent": "video-yt/1.0",
                 "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _error_of(exc: Exception) -> tuple[str, str]:
    """(code, mensaje corto) de un fallo de transporte."""
    if isinstance(exc, urllib.error.HTTPError):
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "ignore")[:300]
        except Exception:  # noqa: BLE001
            pass
        low = detail.lower()
        if exc.code == 429 and any(w in low for w in ("daily", "allocation", "neurons")):
            return "daily_quota", "cupo diario gratis agotado (se renueva a las 00:00 UTC)"
        if exc.code == 429:
            return "rate_limit", "cuota/límite por minuto alcanzado (429)"
        if exc.code in (401, 403):
            return "auth", f"clave rechazada ({exc.code})"
        if exc.code == 404:
            return "model_unavailable", "deployment no encontrado (404)"
        if exc.code == 400 and any(w in low for w in ("content", "safety", "moderat", "policy", "nsfw")):
            return "content_filter", "el filtro de contenido rechazó el prompt"
        return "upstream", f"HTTP {exc.code}: {detail or exc.reason}"
    if isinstance(exc, TimeoutError) or "timed out" in str(exc).lower():
        return "timeout", f"sin respuesta en {TIMEOUT}s"
    return "network", str(getattr(exc, "reason", exc))[:200]


def _decode(payload: dict) -> bytes:
    payload = payload or {}
    data = payload.get("data") or []
    b64 = (data[0] or {}).get("b64_json") if data else None
    if not b64 and isinstance(payload.get("result"), dict):      # Cloudflare
        b64 = payload["result"].get("image")
    if not b64:
        raise ValueError("la respuesta no trae imagen")
    return base64.b64decode(b64)


# --- Generación con fallback ----------------------------------------------------

def candidates(model: str | None = None) -> list[tuple[dict, str]]:
    """Pares (recurso, modelo) en orden de intento. ``model`` concreto va primero;
    los que están enfriándose (429 reciente) se mandan al final."""
    res = resources()
    pairs = [(r, m) for m in MODELS for r in res if m in r["models"]]
    if model and model != "auto":
        pairs.sort(key=lambda p: p[1] != model)
    now = time.monotonic()
    pairs.sort(key=lambda p: _cool.get((p[0]["id"], p[1]), 0) > now)
    return pairs


def generate(prompt: str, *, aspect: str = DEFAULT_ASPECT, model: str | None = None,
             strict: bool = False) -> dict:
    """Genera UNA imagen. Devuelve {data, ext, model, resource, width, height, attempts}.

    ``strict`` = solo el ``model`` pedido (sin saltar a otros modelos, aunque sí
    a otros recursos que lo tengan)."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ImageGenError("Escribe qué imagen quieres generar.", "bad_request")
    if model and model != "auto" and model not in MODELS:
        raise ImageGenError(f"Modelo desconocido: {model}", "bad_request")
    width, height = ASPECTS.get(aspect) or ASPECTS[DEFAULT_ASPECT]
    pairs = candidates(model)
    if strict and model and model != "auto":
        pairs = [p for p in pairs if p[1] == model]
    if not pairs:
        raise ImageGenError("No hay modelos de imagen configurados.", "not_configured")

    attempts: list[dict] = []
    for res, m in pairs:
        key = _key_for(res)
        if not key:
            attempts.append({"resource": res["id"], "model": m, "code": "no_key",
                             "error": "falta la clave de este recurso"})
            continue
        t0 = time.monotonic()
        try:
            url = _url(res["endpoint"], m)
            if MODELS[m]["family"] == "cf":
                payload = _post_cf(url, key, {"prompt": prompt, "width": width, "height": height})
            else:
                payload = _post(url, key, {"model": m, "prompt": prompt,
                                           "width": width, "height": height})
            data = _decode(payload)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            code, msg = (_error_of(exc) if not isinstance(exc, ValueError)
                         else ("upstream", str(exc)))
            if code in ("rate_limit", "daily_quota"):
                wait = DAILY_COOLDOWN_S if code == "daily_quota" else COOLDOWN_S
                with _cool_lock:
                    _cool[(res["id"], m)] = time.monotonic() + wait
            log.warning("Imagen %s@%s falló (%s): %s", m, res["id"], code, msg)
            attempts.append({"resource": res["id"], "model": m, "code": code, "error": msg})
            continue
        log.info("Imagen %s@%s ok en %.1fs (%d bytes)", m, res["id"],
                 time.monotonic() - t0, len(data))
        ext = ".jpg" if data[:3] == b"\xff\xd8\xff" else ".png"
        attempts.append({"resource": res["id"], "model": m, "code": "ok"})
        return {"data": data, "ext": ext, "model": m, "resource": res["id"],
                "provider": res.get("provider", "azure"),
                "width": width, "height": height, "attempts": attempts}

    codes = {a["code"] for a in attempts}
    if codes <= {"no_key"}:
        code = "not_configured"
    elif codes <= {"rate_limit", "daily_quota", "no_key"}:
        code = "rate_limit"
    elif "content_filter" in codes:
        code = "content_filter"
    else:
        code = "upstream"
    msg = {
        "not_configured": "Ningún recurso de imagen tiene clave configurada.",
        "rate_limit": "Todos los modelos están al límite por minuto. Espera un momento.",
        "content_filter": "El filtro de contenido rechazó el prompt en todos los modelos.",
    }.get(code, "Ningún modelo pudo generar la imagen.")
    raise ImageGenError(msg, code, attempts)


def generate_to_project(project_id: str, prompt: str, *, aspect: str = DEFAULT_ASPECT,
                        model: str | None = None, strict: bool = False,
                        label: str | None = None) -> dict:
    """Genera una imagen y la añade al material del proyecto (``origin="ai"``).
    Devuelve {image: ImageInfo-dict, model, resource, attempts}."""
    from . import images, projects
    project = projects.get_project(project_id)
    if project is None:
        raise ImageGenError("Proyecto no encontrado.", "not_found")
    out = generate(prompt, aspect=aspect, model=model, strict=strict)
    short = " ".join(prompt.split()[:6])[:48] or "imagen IA"
    info = images.import_image(
        project, f"ia_{out['model']}{out['ext']}", out["data"],
        description=prompt.strip(), label=label or short,
        origin="ai", source="generated", provider=f"{out['provider']}:{out['model']}")
    return {"image": info.model_dump(), "model": out["model"], "resource": out["resource"],
            "attempts": out["attempts"]}
