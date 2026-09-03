"""Proveedores de IA. Interfaz común + Gemini (primera implementación).

El MCP permanece igual: el proveedor solo decide QUÉ tool llamar; la ejecución la
hace el agente vía el cliente MCP. Cada proveedor produce una secuencia de
eventos comunes: ``text`` / ``tool_start`` / ``tool_result`` / ``final`` /
``error``.
"""
from __future__ import annotations

from typing import AsyncIterator, Awaitable, Callable

from .. import settings

# call_tool(name, args) -> {"ok","data","text"}
CallTool = Callable[[str, dict], Awaitable[dict]]

DEFAULT_MODEL = "gemini-3.6-flash"


def ai_config() -> dict:
    """Config de IA desde ajustes: {provider, model}. Sin exponer secretos."""
    raw = (settings.load() or {}).get("ai")
    data = raw if isinstance(raw, dict) else {}
    return {
        "provider": (data.get("provider") or "gemini").strip().lower(),
        "model": (data.get("model") or DEFAULT_MODEL).strip(),
    }


class AIProvider:
    """Interfaz. Un proveedor corre el loop de tool-calling y emite eventos."""

    name = "base"

    def unavailable_reason(self) -> str | None:
        raise NotImplementedError

    async def stream(self, *, system: str, history: list, user_message: str,
                     tools: list[dict], call_tool: CallTool,
                     max_iters: int) -> AsyncIterator[dict]:
        raise NotImplementedError
        yield  # pragma: no cover


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

    async def stream(self, *, system, history, user_message, tools, call_tool, max_iters):
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

        # Historia previa (solo texto) + el mensaje del usuario.
        convo: list = []
        for m in history or []:
            role = "model" if m.get("role") == "assistant" else "user"
            convo.append(types.Content(role=role, parts=[types.Part.from_text(text=m.get("text", ""))]))
        convo.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))

        final_text = ""
        for _ in range(max_iters):
            try:
                resp = await client.aio.models.generate_content(
                    model=self._model, contents=convo, config=cfg)
            except Exception as exc:  # noqa: BLE001
                yield {"type": "error", "message": f"Gemini: {exc}"}
                return

            cand = (resp.candidates or [None])[0]
            parts = (cand.content.parts if cand and cand.content else []) or []
            calls = [p.function_call for p in parts if getattr(p, "function_call", None)]
            texts = [p.text for p in parts if getattr(p, "text", None)]
            if texts:
                chunk = "".join(texts)
                final_text = chunk
                yield {"type": "text", "delta": chunk}

            if cand and cand.content:
                convo.append(cand.content)

            if not calls:
                yield {"type": "final", "text": final_text}
                return

            resp_parts = []
            for fc in calls:
                args = dict(fc.args or {})
                yield {"type": "tool_start", "tool": fc.name, "args": args}
                result = await call_tool(fc.name, args)
                yield {"type": "tool_result", "tool": fc.name,
                       "ok": result.get("ok", False), "result": result}
                payload = (result.get("data") if result.get("ok")
                           else {"error": result.get("text") or "falló"})
                if not isinstance(payload, dict):
                    payload = {"result": payload}
                resp_parts.append(types.Part.from_function_response(name=fc.name, response=payload))
            convo.append(types.Content(role="user", parts=resp_parts))

        yield {"type": "error", "message": "Se alcanzó el límite de pasos del agente."}


def get_provider() -> AIProvider:
    """Selecciona el proveedor según ajustes (hoy: Gemini)."""
    cfg = ai_config()
    if cfg["provider"] == "gemini":
        return GeminiProvider(cfg["model"])
    # OpenAIProvider / ClaudeProvider quedan preparados arquitectónicamente.
    raise ValueError(f"Proveedor de IA no soportado todavía: {cfg['provider']}")
