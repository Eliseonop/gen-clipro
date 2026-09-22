"""Microsoft Foundry (Azure AI Foundry / Azure OpenAI): capa de IA GENERATIVA.

Adaptador independiente de Speech y Vision: **complementa** esos servicios, no
los reemplaza. Igual que ``azure_tts``/``azure_stt``/``azure_vision`` habla por
REST + ``urllib`` (sin SDK ni dependencias nuevas) contra el endpoint
OpenAI-compatible de Azure (``chat/completions``), que es la API documentada de
Azure OpenAI en Foundry.

Este módulo es SOLO transporte + configuración + normalización de errores. La
lógica de las funciones (mejorar guion, hooks, títulos…) vive en
``foundry_ops`` para poder cambiar de modelo/deployment sin tocar los prompts.

Credenciales (nunca se exponen al frontend):
  - clave:      env ``AZURE_FOUNDRY_KEY`` / ``AZURE_OPENAI_API_KEY``
                o settings ``api_keys["azure_foundry"]``
  - endpoint:   env ``AZURE_FOUNDRY_ENDPOINT`` / ``AZURE_OPENAI_ENDPOINT``
                o settings ``azure_foundry_endpoint``
                (ej. ``https://<recurso>.openai.azure.com``)
  - deployment: env ``AZURE_FOUNDRY_DEPLOYMENT`` / ``AZURE_FOUNDRY_MODEL`` /
                ``AZURE_OPENAI_DEPLOYMENT``  o settings ``azure_foundry_deployment``
                (el NOMBRE DEL DEPLOYMENT que creaste en Foundry, no el del modelo
                base; es configurable para poder cambiar de modelo después)
  - api-version: env ``AZURE_FOUNDRY_API_VERSION`` o settings
                ``azure_foundry_api_version`` (por defecto una GA estable)

Nada de esto está hardcodeado: todo se resuelve desde entorno o settings.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Optional

from . import settings

log = logging.getLogger("videoyt.foundry")

# Versión de API GA estable de Azure OpenAI. Configurable (algunos modelos nuevos
# de Foundry piden versiones más recientes). No se inventa: es la ruta documentada.
_DEFAULT_API_VERSION = "2024-10-21"

# Techo de tiempo por petición (s). Las operaciones son cortas (texto), pero un
# modelo lento no debe colgar la request del editor indefinidamente.
DEFAULT_TIMEOUT = 60


# --- Configuración (entorno → settings) --------------------------------------

def api_key() -> str:
    env = (os.environ.get("AZURE_FOUNDRY_KEY")
           or os.environ.get("AZURE_OPENAI_API_KEY") or "").strip()
    if env:
        return env
    return settings.api_key("azure_foundry")


def endpoint() -> str:
    env = (os.environ.get("AZURE_FOUNDRY_ENDPOINT")
           or os.environ.get("AZURE_OPENAI_ENDPOINT") or "").strip()
    if env:
        return env.rstrip("/")
    data = settings.load() or {}
    return str(data.get("azure_foundry_endpoint") or "").strip().rstrip("/")


def deployment() -> str:
    env = (os.environ.get("AZURE_FOUNDRY_DEPLOYMENT")
           or os.environ.get("AZURE_FOUNDRY_MODEL")
           or os.environ.get("AZURE_OPENAI_DEPLOYMENT") or "").strip()
    if env:
        return env
    data = settings.load() or {}
    return str(data.get("azure_foundry_deployment") or "").strip()


def api_version() -> str:
    env = (os.environ.get("AZURE_FOUNDRY_API_VERSION") or "").strip()
    if env:
        return env
    data = settings.load() or {}
    return str(data.get("azure_foundry_api_version") or "").strip() or _DEFAULT_API_VERSION


def unavailable_reason() -> Optional[str]:
    if not api_key():
        return "Falta la clave de Microsoft Foundry. Configúrala o define AZURE_FOUNDRY_KEY."
    if not endpoint():
        return "Falta el endpoint de Foundry. Configúralo o define AZURE_FOUNDRY_ENDPOINT."
    if not deployment():
        return ("Falta el nombre del deployment/modelo de Foundry. Configúralo o define "
                "AZURE_FOUNDRY_DEPLOYMENT.")
    return None


def available() -> bool:
    return unavailable_reason() is None


def config_public() -> dict:
    """Config NO sensible para el frontend/status (nunca la clave)."""
    ep = endpoint()
    return {
        "available": available(),
        "reason": unavailable_reason(),
        "endpoint": ep,
        "deployment": deployment(),
        "model": deployment(),        # alias: el "modelo" que ve el usuario es su deployment
        "api_version": api_version(),
        "endpoint_style": "foundry-v1" if _is_v1_endpoint(ep) else "azure-openai",
    }


# Hay DOS familias de endpoint de Foundry, con rutas distintas:
#   1) Azure AI Foundry v1 (OpenAI-compatible): ``https://<rec>.services.ai.azure.com/openai/v1``
#      → POST ``{base}/chat/completions`` con ``model`` en el cuerpo, sin api-version.
#      Auth: ``Authorization: Bearer <key>`` (como el SDK de OpenAI) o ``api-key``.
#   2) Azure OpenAI clásico: ``https://<rec>.openai.azure.com``
#      → POST ``{ep}/openai/deployments/{deployment}/chat/completions?api-version=``.
#      Auth: cabecera ``api-key``.

def _is_v1_endpoint(ep: str) -> bool:
    low = (ep or "").lower()
    return "services.ai.azure.com" in low or "/openai/v1" in low


def _v1_base(ep: str) -> str:
    """Normaliza cualquier variante que pegue el usuario a ``.../openai/v1``."""
    ep = (ep or "").rstrip("/")
    if ep.endswith("/chat/completions"):
        ep = ep[: -len("/chat/completions")]
    if ep.endswith("/openai/v1"):
        return ep
    if ep.endswith("/openai"):
        return ep + "/v1"
    return ep + "/openai/v1"


def _chat_url() -> tuple[str, str]:
    """Devuelve (url, kind) donde kind ∈ {'v1', 'classic'}."""
    ep = endpoint()
    if _is_v1_endpoint(ep):
        return _v1_base(ep) + "/chat/completions", "v1"
    return (f"{ep}/openai/deployments/{deployment()}/chat/completions"
            f"?api-version={api_version()}"), "classic"


# Modelos de razonamiento (gpt-5*, o1/o3/o4): NO admiten ``temperature`` y usan
# ``max_completion_tokens`` en vez de ``max_tokens``.
def _is_reasoning_model(name: str) -> bool:
    n = (name or "").lower()
    return n.startswith(("gpt-5", "gpt5", "o1", "o3", "o4"))


class FoundryError(RuntimeError):
    """Error de Foundry con un ``code`` estable para el frontend/status."""

    def __init__(self, message: str, code: str = "foundry_error"):
        super().__init__(message)
        self.code = code


def _raise_http(exc: urllib.error.HTTPError) -> None:
    detail = exc.read().decode("utf-8", "ignore")[:400]
    if exc.code in (401, 403):
        raise FoundryError("Foundry rechazó la clave/endpoint (401/403). Revísalos.",
                           "auth") from exc
    if exc.code == 404:
        raise FoundryError(
            "Deployment/modelo no encontrado en Foundry (404). Revisa el nombre del "
            "deployment y la api-version.", "model_unavailable") from exc
    if exc.code == 429:
        raise FoundryError(
            "Foundry: límite de peticiones/cuota alcanzado (429). Espera y reintenta.",
            "rate_limit") from exc
    if exc.code == 400:
        raise _BadRequest(detail)
    raise FoundryError(f"Foundry falló ({exc.code}): {detail or exc.reason}",
                       "upstream") from exc


class _BadRequest(FoundryError):
    """400 de Azure (p. ej. ``response_format`` no soportado por el modelo)."""

    def __init__(self, detail: str):
        super().__init__(f"Foundry rechazó la petición (400): {detail}", "bad_request")
        self.detail = detail


def _headers(style: str, key: str) -> dict:
    base = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "video-yt/1.0",
    }
    if style == "bearer":
        base["Authorization"] = f"Bearer {key}"
    else:
        base["api-key"] = key
    return base


def _post(url: str, kind: str, body: dict, *, timeout: int) -> dict:
    """POST a ``chat/completions`` con la auth adecuada. El endpoint v1 usa
    ``Authorization: Bearer`` (como el SDK de OpenAI); si diera 401/403 reintenta
    con la cabecera ``api-key`` (y viceversa en el clásico)."""
    key = api_key()
    data = json.dumps(body).encode("utf-8")
    # v1 → bearer primero (comportamiento del SDK de OpenAI); clásico → api-key.
    styles = ["bearer", "api-key"] if kind == "v1" else ["api-key", "bearer"]
    # Log seguro: nunca la clave ni el prompt; solo tamaño y destino.
    log.info("Foundry chat → kind=%s bytes=%d", kind, len(data))
    t0 = time.monotonic()
    last_http: urllib.error.HTTPError | None = None
    for i, style in enumerate(styles):
        req = urllib.request.Request(
            url, data=data, headers=_headers(style, key), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                payload = json.loads(r.read().decode("utf-8"))
            log.info("Foundry chat ← %.1fs (auth=%s)", time.monotonic() - t0, style)
            return payload
        except urllib.error.HTTPError as exc:
            # Solo el fallo de AUTH justifica probar el otro estilo de cabecera.
            if exc.code in (401, 403) and i < len(styles) - 1:
                last_http = exc
                continue
            _raise_http(exc)
            raise  # inalcanzable; _raise_http siempre lanza
        except (TimeoutError, urllib.error.URLError) as exc:
            reason = getattr(exc, "reason", exc)
            if isinstance(reason, TimeoutError) or "timed out" in str(reason).lower():
                raise FoundryError(
                    f"Foundry no respondió a tiempo ({timeout}s). Reintenta o sube el timeout.",
                    "timeout") from exc
            raise FoundryError(f"No se pudo conectar con Foundry: {reason}", "network") from exc
    if last_http is not None:
        _raise_http(last_http)
    raise FoundryError("Foundry: fallo de autenticación.", "auth")


def _adjust_body_for_400(body: dict, detail: str | None) -> bool:
    """Auto-corrige el cuerpo según el 400 del modelo (params no soportados).
    Devuelve True si cambió algo (para reintentar). Un ajuste por pasada."""
    low = (detail or "").lower()
    if "response_format" in low and "response_format" in body:
        body.pop("response_format", None)
        return True
    if "reasoning_effort" in low and "reasoning_effort" in body:
        body.pop("reasoning_effort", None)
        return True
    if "temperature" in low and "temperature" in body:
        body.pop("temperature", None)
        return True
    if "max_completion_tokens" in low:
        # "usa max_completion_tokens en vez de max_tokens" (gpt-5, o-series)
        if "max_tokens" in low and "max_tokens" in body:
            body["max_completion_tokens"] = body.pop("max_tokens")
            return True
        # "max_completion_tokens no soportado" (modelos antiguos) → volver a max_tokens
        if "max_tokens" not in low and "max_completion_tokens" in body:
            body["max_tokens"] = body.pop("max_completion_tokens")
            return True
    return False


def normalize_response(payload: dict | None) -> dict:
    """Respuesta de ``chat/completions`` → {text, model, usage, finish_reason}.

    Función pura: solo mapea lo que Azure devuelve (sin exponer nada sensible).
    """
    payload = payload or {}
    choices = payload.get("choices") or []
    text, finish = "", None
    if choices:
        msg = (choices[0] or {}).get("message") or {}
        text = (msg.get("content") or "").strip()
        finish = (choices[0] or {}).get("finish_reason")
    usage = payload.get("usage") or {}
    return {
        "text": text,
        "model": payload.get("model") or deployment(),
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        },
        "finish_reason": finish,
    }


def chat(messages: list[dict], *, temperature: float = 0.5,
         max_tokens: int | None = 800, json_mode: bool = False,
         timeout: int = DEFAULT_TIMEOUT) -> dict:
    """Un turno de chat contra el deployment configurado. Devuelve la respuesta
    normalizada.

    Adapta los parámetros al modelo: los de razonamiento (gpt-5, o1/o3/o4) no
    admiten ``temperature`` y usan ``max_completion_tokens``. Si el modelo aún
    rechaza algún parámetro (400), se auto-corrige y reintenta."""
    reason = unavailable_reason()
    if reason:
        raise FoundryError(reason, "not_configured")
    if not messages:
        raise FoundryError("No hay mensajes que enviar.", "bad_request")

    model = deployment()
    reasoning = _is_reasoning_model(model)
    url, kind = _chat_url()

    body: dict = {"messages": messages}
    if kind == "v1":
        body["model"] = model          # en la API v1 el modelo va en el cuerpo
    if reasoning:
        # Sin temperature; presupuesto generoso para dejar sitio al contenido
        # (los tokens de razonamiento consumen del mismo tope).
        if max_tokens:
            body["max_completion_tokens"] = max(int(max_tokens), 2048)
        body["reasoning_effort"] = "low"
    else:
        body["temperature"] = float(temperature)
        if max_tokens:
            body["max_tokens"] = int(max_tokens)
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    for attempt in range(5):
        try:
            payload = _post(url, kind, body, timeout=timeout)
            return normalize_response(payload)
        except _BadRequest as exc:
            if attempt < 4 and _adjust_body_for_400(body, exc.detail):
                log.warning("Foundry 400; auto-ajuste de parámetros y reintento (%s).",
                            (exc.detail or "")[:120])
                continue
            raise
    raise FoundryError("Foundry: no se pudo completar la petición.", "upstream")


def complete(prompt: str, *, system: str | None = None, **kwargs) -> dict:
    """Atajo: un ``system`` opcional + un ``user`` prompt → respuesta normalizada."""
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return chat(messages, **kwargs)
