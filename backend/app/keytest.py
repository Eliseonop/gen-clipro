"""Prueba de API keys: verifica que cada clave autentica contra su proveedor.

Cada probe hace una llamada ligera y autenticada (normalmente GET de bajo coste).
Resultado por clave: ok=True (válida), ok=False (inválida/sin permiso), ok=None
(no comprobable: sin probe o error de red). Se usa User-Agent de navegador para
evitar bloqueos WAF (p.ej. Cloudflare 1010 de Groq con el UA por defecto).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from . import settings
from .ai import providers as ai_providers

_UA = "Mozilla/5.0 (compatible; VideoYT-KeyTest/1.0)"
_TIMEOUT = 12


def _http(url: str, headers: dict, timeout: int = _TIMEOUT) -> int:
    """Devuelve el código HTTP (o -1 si no hubo respuesta)."""
    req = urllib.request.Request(url, headers={"User-Agent": _UA, **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status or 200
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return -1


def _classify(code: int) -> tuple[bool | None, str]:
    if code == -1:
        return None, "No se pudo comprobar (red o proveedor no responde)."
    if 200 <= code < 300:
        return True, "OK"
    if code == 429:
        return True, "Válida (límite de peticiones ahora mismo)."
    if code in (401, 403):
        return False, "Clave inválida o sin permiso."
    if code == 400:
        return True, "Autenticación correcta."
    if code == 404:
        return None, "No comprobable (endpoint no encontrado)."
    return None, f"Respuesta inesperada (HTTP {code})."


def _openai_compatible(provider: str, key: str) -> tuple[bool | None, str]:
    spec = ai_providers.OPENAI_COMPATIBLE.get(provider) or {}
    base = spec.get("base_url") or "https://api.openai.com/v1"
    return _classify(_http(base.rstrip("/") + "/models", {"Authorization": f"Bearer {key}"}))


def _gemini(key: str) -> tuple[bool | None, str]:
    return _classify(_http(
        f"https://generativelanguage.googleapis.com/v1beta/models?key={key}", {}))


# Probes por proveedor: fn(key) -> (ok, message). Ausente = no comprobable.
_PROBES = {
    "gemini": _gemini,
    "anthropic": lambda k: _classify(_http(
        "https://api.anthropic.com/v1/models",
        {"x-api-key": k, "anthropic-version": "2023-06-01"})),
    "elevenlabs": lambda k: _classify(_http(
        "https://api.elevenlabs.io/v1/user", {"xi-api-key": k})),
    "pexels": lambda k: _classify(_http(
        "https://api.pexels.com/v1/search?query=a&per_page=1", {"Authorization": k})),
    "giphy": lambda k: _classify(_http(
        f"https://api.giphy.com/v1/gifs/search?api_key={k}&q=a&limit=1", {})),
    "pixabay": lambda k: _classify(_http(
        f"https://pixabay.com/api/?key={k}&q=a&per_page=3", {})),
    "unsplash": lambda k: _classify(_http(
        "https://api.unsplash.com/photos?per_page=1", {"Authorization": f"Client-ID {k}"})),
    "youtube": lambda k: _classify(_http(
        f"https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key={k}", {})),
    "replicate": lambda k: _classify(_http(
        "https://api.replicate.com/v1/account", {"Authorization": f"Bearer {k}"})),
    "assemblyai": lambda k: _classify(_http(
        "https://api.assemblyai.com/v2/transcript?limit=1", {"authorization": k})),
    "stability": lambda k: _classify(_http(
        "https://api.stability.ai/v1/user/account", {"Authorization": f"Bearer {k}"})),
    "removebg": lambda k: _classify(_http(
        "https://api.remove.bg/v1.0/account", {"X-Api-Key": k})),
}


def probe(provider: str, key: str) -> dict:
    """Prueba una clave. Devuelve {ok, message} (ok True/False/None)."""
    key = str(key or "").strip()
    if not key:
        return {"ok": False, "message": "Vacía."}
    try:
        if provider in ai_providers.OPENAI_COMPATIBLE and ai_providers.OPENAI_COMPATIBLE[provider]["key"] is not None:
            ok, msg = _openai_compatible(provider, key)
        elif provider in _PROBES:
            ok, msg = _PROBES[provider](key)
        else:
            return {"ok": None, "message": "No comprobable automáticamente."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": None, "message": f"No se pudo comprobar: {exc}"}
    return {"ok": ok, "message": msg}


def test_all() -> dict:
    """Prueba TODAS las claves registradas (primaria + extra), en paralelo.

    Devuelve {provider: [{index, ok, message}]}. No expone los valores.
    """
    data = settings.load()
    providers_set = set((data.get("api_keys") or {}).keys()) | set((data.get("api_keys_extra") or {}).keys())
    jobs: list[tuple[str, int, str]] = []
    for prov in providers_set:
        for idx, key in enumerate(settings.keys_for(prov)):
            jobs.append((prov, idx, key))

    results: dict[str, list] = {}
    if not jobs:
        return {"results": results}

    def run(job):
        prov, idx, key = job
        res = probe(prov, key)
        return prov, {"index": idx, **res}

    with ThreadPoolExecutor(max_workers=min(8, len(jobs))) as ex:
        for prov, entry in ex.map(run, jobs):
            results.setdefault(prov, []).append(entry)
    for prov in results:
        results[prov].sort(key=lambda e: e["index"])
    return {"results": results}
