"""Proveedores de IA. Interfaz común + Gemini (primera implementación).

El MCP permanece igual: el proveedor solo decide QUÉ tool llamar; la ejecución la
hace el agente (``call_tool``). El proveedor **emite** eventos comunes vía
``emit`` (async): ``text`` (por tokens) / ``tool_start`` / ``tool_result`` /
``final`` / ``error``. Los eventos de progreso de jobs los inyecta el agente por
el mismo ``emit``.
"""
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from .. import settings

CallTool = Callable[[str, dict], Awaitable[dict]]  # (name, args) -> {ok,data,text}
Emit = Callable[[dict], Awaitable[None]]

DEFAULT_MODEL = "gemini-3.6-flash"

RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY = 1.5  # s; backoff exponencial (1.5, 3, 6)


def _status_code(exc: Exception) -> int | None:
    """Código HTTP del error (openai usa ``status_code``; google-genai ``code``)."""
    c = getattr(exc, "status_code", None)
    if c is None:
        c = getattr(exc, "code", None)
    try:
        return int(c)
    except (TypeError, ValueError):
        return None


def _retryable(exc: Exception) -> bool:
    """¿SATURACIÓN transitoria (5xx) que conviene reintentar? (429/404/401 no)."""
    code = _status_code(exc)
    if code in (500, 502, 503, 504):
        return True
    if code is not None:
        return False  # tiene código y no es 5xx → no reintentar
    s = str(exc).lower()
    return any(k in s for k in ("overloaded", "high demand", "try again later", "temporarily unavailable"))


def _friendly_error(exc: Exception) -> str:
    """Mensaje claro (neutral de proveedor) según el tipo de error."""
    s = str(exc)
    low = s.lower()
    code = _status_code(exc)
    if code == 429 or "resource_exhausted" in low or "quota" in low or "rate limit" in low:
        return ("Has llegado al límite/cuota del proveedor. Espera al reinicio, "
                "cambia de modelo en Configuración (Chat IA), o usa un plan con más límite.")
    if code == 404 or "unavailable for free" in low or "no endpoints" in low or "not a valid model" in low:
        return "El modelo elegido no está disponible. Cámbialo en Configuración (Chat IA)."
    if code in (401, 403) or "api key" in low or "api_key" in low or "unauthor" in low or "permission" in low:
        return "Problema con la API key del proveedor. Revísala en Configuración."
    if code in (500, 502, 503, 504) or "overloaded" in low or "high demand" in low:
        return "El proveedor está saturado ahora mismo. Inténtalo de nuevo en un momento."
    return f"Error del modelo: {s}"


# Proveedores OpenAI-compatibles (misma clase, distinto base_url/key).
# ``key=None`` → servidor local sin API key (LM Studio / Ollama).
OPENAI_COMPATIBLE = {
    "openai": {"base_url": None, "key": "openai", "default_model": "gpt-4o-mini"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "key": "openrouter",
                   # Auto-router GRATIS de OpenRouter: elige solo un modelo free
                   # disponible con function-calling (resiliente a rate-limits).
                   "default_model": "openrouter/free"},
    # LM Studio local (OpenAI-compatible). El modelo es el que tengas cargado.
    "lmstudio": {"base_url": "http://localhost:1234/v1", "key": None,
                 "default_model": "qwen2.5-7b-instruct"},
}


def _api_keys() -> dict:
    keys = (settings.load() or {}).get("api_keys")
    return keys if isinstance(keys, dict) else {}


def _has_key(name: str) -> bool:
    return bool(str(_api_keys().get(name) or "").strip())


def _auto_provider() -> str:
    """Sin config: prioriza un proveedor con MODELOS GRATIS (OpenRouter) si hay key."""
    if _has_key("openrouter"):
        return "openrouter"
    from .. import gemini_tts
    if gemini_tts.api_key():
        return "gemini"
    if _has_key("openai"):
        return "openai"
    return "gemini"


def _default_model(provider: str) -> str:
    if provider == "gemini":
        return DEFAULT_MODEL
    spec = OPENAI_COMPATIBLE.get(provider)
    return spec["default_model"] if spec else DEFAULT_MODEL


def ai_config() -> dict:
    raw = (settings.load() or {}).get("ai")
    data = raw if isinstance(raw, dict) else {}
    provider = (data.get("provider") or "").strip().lower() or _auto_provider()
    model = (data.get("model") or "").strip() or _default_model(provider)
    base_url = (data.get("base_url") or "").strip() or None  # override para local/custom
    return {"provider": provider, "model": model, "base_url": base_url}


class AIProvider:
    name = "base"

    def unavailable_reason(self) -> str | None:
        raise NotImplementedError

    async def run(self, *, system: str, history: list, user_message: str,
                  tools: list[dict], call_tool: CallTool, emit: Emit,
                  max_iters: int) -> str:
        """Corre el loop de tool-calling, emitiendo eventos. Devuelve el texto final."""
        raise NotImplementedError


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, model: str | None = None):
        self._model = model or ai_config()["model"]

    def unavailable_reason(self) -> str | None:
        from .. import gemini_tts
        return gemini_tts.unavailable_reason()

    def _key(self) -> str:
        from .. import gemini_tts
        return gemini_tts.api_key()

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self._key())
        fn_decls = [
            types.FunctionDeclaration(
                name=t["name"], description=t["description"],
                parameters=t["parameters"] or None,
            )
            for t in tools
        ]
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            tools=[types.Tool(function_declarations=fn_decls)],
            temperature=0.3,
        )

        convo: list = []
        for m in history or []:
            role = "model" if m.get("role") == "assistant" else "user"
            convo.append(types.Content(role=role, parts=[types.Part.from_text(text=m.get("text", ""))]))
        convo.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))

        final_text = ""
        for _ in range(max_iters):
            turn_text = ""
            calls = []
            turn_parts = []   # parts CRUDOS del modelo (conservan thought_signature)
            got = False
            for attempt in range(RETRY_ATTEMPTS):
                turn_text, calls, turn_parts = "", [], []
                try:
                    stream = await client.aio.models.generate_content_stream(
                        model=self._model, contents=convo, config=cfg)
                    async for chunk in stream:
                        cand = (chunk.candidates or [None])[0]
                        parts = (cand.content.parts if cand and cand.content else []) or []
                        for p in parts:
                            turn_parts.append(p)
                            if getattr(p, "text", None):
                                turn_text += p.text
                                await emit({"type": "text", "delta": p.text})
                            if getattr(p, "function_call", None):
                                calls.append(p.function_call)
                    got = True
                    break
                except Exception as exc:  # noqa: BLE001
                    # Reintenta errores transitorios (503/429/500) si aún no hubo texto.
                    if _retryable(exc) and not turn_text and attempt < RETRY_ATTEMPTS - 1:
                        await emit({"type": "status", "message": "El modelo está saturado; reintentando…"})
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    await emit({"type": "error", "message": _friendly_error(exc)})
                    return final_text
            if not got:
                return final_text

            if turn_text:
                final_text = turn_text
            # Reusar los parts originales: Gemini 3.x exige el thought_signature
            # de cada functionCall al devolverlo en el historial.
            convo.append(types.Content(role="model", parts=turn_parts or [types.Part.from_text(text="")]))

            if not calls:
                await emit({"type": "final", "text": final_text})
                return final_text

            resp_parts = []
            for fc in calls:
                args = dict(fc.args or {})
                await emit({"type": "tool_start", "tool": fc.name, "args": args})
                result = await call_tool(fc.name, args)
                await emit({"type": "tool_result", "tool": fc.name,
                            "ok": result.get("ok", False), "result": result})
                payload = (result.get("data") if result.get("ok")
                           else {"error": result.get("text") or "falló"})
                if not isinstance(payload, dict):
                    payload = {"result": payload}
                resp_parts.append(types.Part.from_function_response(name=fc.name, response=payload))
            convo.append(types.Content(role="user", parts=resp_parts))

        await emit({"type": "error", "message": "Se alcanzó el límite de pasos del agente."})
        return final_text


class OpenAICompatibleProvider(AIProvider):
    """OpenAI y OpenRouter (API compatible): streaming + tool-calling. Un mismo
    código, distinto ``base_url``/key. OpenRouter da modelos GRATIS con tools."""

    def __init__(self, provider: str, model: str, base_url: str | None = None):
        self.name = provider
        self._model = model
        spec = OPENAI_COMPATIBLE[provider]
        self._base_url = base_url or spec["base_url"]
        self._key_name = spec["key"]   # None → local sin key

    def _key(self) -> str:
        if self._key_name is None:
            return "lm-studio"   # los servidores locales ignoran la key
        return str(_api_keys().get(self._key_name) or "").strip()

    def unavailable_reason(self) -> str | None:
        if self._key_name is not None and not str(_api_keys().get(self._key_name) or "").strip():
            return f"Falta la API key de {self.name}. Añádela en Configuración."
        try:
            import openai  # noqa: F401
        except ImportError:
            return "Falta el paquete openai (pip install openai)."
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        import json as _json

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._key(), base_url=self._base_url)
        oai_tools = [
            {"type": "function", "function": {
                "name": t["name"], "description": t["description"],
                "parameters": t["parameters"] or {"type": "object", "properties": {}}}}
            for t in tools
        ]
        messages: list = [{"role": "system", "content": system}]
        for m in history or []:
            messages.append({"role": "assistant" if m.get("role") == "assistant" else "user",
                             "content": m.get("text", "")})
        messages.append({"role": "user", "content": user_message})

        final_text = ""
        for _ in range(max_iters):
            turn_text = ""
            slots: dict = {}
            got = False
            for attempt in range(RETRY_ATTEMPTS):
                turn_text, slots = "", {}
                try:
                    stream = await client.chat.completions.create(
                        model=self._model, messages=messages,
                        tools=oai_tools or None, stream=True, temperature=0.3)
                    async for chunk in stream:
                        choice = (chunk.choices or [None])[0]
                        delta = choice.delta if choice else None
                        if not delta:
                            continue
                        if getattr(delta, "content", None):
                            turn_text += delta.content
                            await emit({"type": "text", "delta": delta.content})
                        for tc in (getattr(delta, "tool_calls", None) or []):
                            slot = slots.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                            if tc.id:
                                slot["id"] = tc.id
                            if tc.function:
                                if tc.function.name:
                                    slot["name"] = tc.function.name
                                if tc.function.arguments:
                                    slot["args"] += tc.function.arguments
                    got = True
                    break
                except Exception as exc:  # noqa: BLE001
                    if _retryable(exc) and not turn_text and attempt < RETRY_ATTEMPTS - 1:
                        await emit({"type": "status", "message": "El modelo está saturado; reintentando…"})
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    await emit({"type": "error", "message": _friendly_error(exc)})
                    return final_text
            if not got:
                return final_text

            if turn_text:
                final_text = turn_text
            calls = [slots[i] for i in sorted(slots)]
            asst: dict = {"role": "assistant", "content": turn_text or None}
            if calls:
                asst["tool_calls"] = [
                    {"id": c["id"] or f"call_{i}", "type": "function",
                     "function": {"name": c["name"], "arguments": c["args"] or "{}"}}
                    for i, c in enumerate(calls)
                ]
            messages.append(asst)

            if not calls:
                await emit({"type": "final", "text": final_text})
                return final_text

            for i, c in enumerate(calls):
                try:
                    args = _json.loads(c["args"] or "{}")
                except (ValueError, TypeError):
                    args = {}
                await emit({"type": "tool_start", "tool": c["name"], "args": args})
                result = await call_tool(c["name"], args)
                await emit({"type": "tool_result", "tool": c["name"],
                            "ok": result.get("ok", False), "result": result})
                payload = result.get("data") if result.get("ok") else {"error": result.get("text") or "falló"}
                messages.append({"role": "tool", "tool_call_id": asst["tool_calls"][i]["id"],
                                 "content": _json.dumps(payload, ensure_ascii=False)})

        await emit({"type": "error", "message": "Se alcanzó el límite de pasos del agente."})
        return final_text


def get_provider() -> AIProvider:
    cfg = ai_config()
    provider = cfg["provider"]
    if provider == "gemini":
        return GeminiProvider(cfg["model"])
    if provider in OPENAI_COMPATIBLE:
        return OpenAICompatibleProvider(provider, cfg["model"], cfg.get("base_url"))
    raise ValueError(f"Proveedor de IA no soportado: {provider}")
