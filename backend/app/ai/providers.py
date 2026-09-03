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
# Solo SATURACIÓN temporal (no la cuota 429, que reintentar no arregla).
_RETRYABLE_TOKENS = ("503", "unavailable", "500", "internal")


def _retryable(exc: Exception) -> bool:
    """¿Error transitorio del proveedor (saturación) que conviene reintentar?"""
    code = getattr(exc, "code", None)
    if code in (500, 503):
        return True
    s = str(exc).lower()
    return any(tok in s for tok in _RETRYABLE_TOKENS)


def _friendly_error(exc: Exception) -> str:
    """Mensaje claro para el usuario según el tipo de error del proveedor."""
    s = str(exc)
    low = s.lower()
    code = getattr(exc, "code", None)
    if code == 429 or "resource_exhausted" in low or "quota" in low:
        return ("Has agotado la cuota de Gemini (el free tier limita las peticiones "
                "por día/minuto). Espera al reinicio de la cuota, cambia el modelo "
                "en Configuración, o usa un plan con más límite.")
    if code == 503 or "unavailable" in low:
        return "Gemini está saturado ahora mismo. Inténtalo de nuevo en un momento."
    if code in (401, 403) or "api key" in low or "api_key" in low or "permission" in low:
        return "Problema con la API key de Gemini. Revísala en Configuración."
    return f"Gemini: {s}"


def ai_config() -> dict:
    raw = (settings.load() or {}).get("ai")
    data = raw if isinstance(raw, dict) else {}
    return {
        "provider": (data.get("provider") or "gemini").strip().lower(),
        "model": (data.get("model") or DEFAULT_MODEL).strip(),
    }


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


def get_provider() -> AIProvider:
    cfg = ai_config()
    if cfg["provider"] == "gemini":
        return GeminiProvider(cfg["model"])
    raise ValueError(f"Proveedor de IA no soportado todavía: {cfg['provider']}")
