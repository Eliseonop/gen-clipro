"""Cliente MCP in-process para el agente.

Usa el ``Client`` del SDK ``mcp`` 2.x conectado **al mismo objeto MCPServer**
que ya vive en el proceso (``mcp_server.server.mcp``): descubre las 44 tools
dinámicamente y las ejecuta por el mismo camino que cualquier otro cliente
(registry → política → auditoría → timeline_store). No hay salto HTTP ni tools
duplicadas.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

from mcp import Client

from ..mcp_server import server

# Claves de JSON-Schema que aceptan los proveedores (Gemini/OpenAI) en las
# declaraciones de función. El resto se descarta para no romper el schema.
_SCHEMA_KEYS = {"type", "properties", "required", "items", "enum", "description"}


def _clean_schema(schema) -> dict:
    """Poda un JSON-Schema a lo que entiende el function-calling de los LLM."""
    if not isinstance(schema, dict):
        return {"type": "object", "properties": {}}
    out: dict = {}
    for k, v in schema.items():
        if k not in _SCHEMA_KEYS:
            continue
        if k == "properties" and isinstance(v, dict):
            out[k] = {pk: _clean_schema(pv) for pk, pv in v.items()}
        elif k == "items":
            out[k] = _clean_schema(v)
        else:
            out[k] = v
    if out.get("type") == "object" and "properties" not in out:
        out["properties"] = {}
    return out


def _result_data(res) -> dict:
    """Normaliza el CallToolResult a ``{ok, data, text}``.

    En error, el SDK prefija el texto con ``Error executing tool <name>: `` antes
    del JSON estructurado ``{"error":{code,…}}``; se extrae ese JSON a ``data``
    para que el agente pueda leer el código/hint/retryable.
    """
    texts = []
    for block in res.content or []:
        t = getattr(block, "text", None)
        if t:
            texts.append(t)
    text = "\n".join(texts)
    data = None
    if text:
        try:
            data = json.loads(text)
        except (ValueError, TypeError):
            data = None
        if data is None and res.is_error:
            brace = text.find("{")
            if brace != -1:
                try:
                    data = json.loads(text[brace:])
                except (ValueError, TypeError):
                    data = None
    return {"ok": not res.is_error, "data": data, "text": text}


class McpToolset:
    """Sesión abierta contra el MCP in-process para un turno de chat."""

    def __init__(self, client: Client):
        self._client = client

    @classmethod
    @asynccontextmanager
    async def open(cls):
        async with Client(server.mcp) as client:
            yield cls(client)

    async def tool_specs(self) -> list[dict]:
        """Declaraciones de función provider-agnósticas (name/description/parameters)."""
        res = await self._client.list_tools()
        return [
            {
                "name": t.name,
                "description": t.description or "",
                "parameters": _clean_schema(t.input_schema),
            }
            for t in res.tools
        ]

    async def call(self, name: str, args: dict | None) -> dict:
        res = await self._client.call_tool(name, args or {})
        return _result_data(res)
