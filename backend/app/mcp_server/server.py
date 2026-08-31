"""Punto de ensamblado del MCP server.

Crea el ``MCPServer``, registra las tools y prepara lo que ``app.main`` necesita
para montarlo en el mismo proceso FastAPI:

- ``asgi_app``: la sub-app Starlette (streamable-HTTP) a montar en ``/mcp``.
- ``session_lifespan``: context manager async que corre el session-manager del
  MCP; ``app.main`` lo abre dentro del ``lifespan`` de FastAPI (montar una
  sub-app NO ejecuta su lifespan por sí solo).

El schema HTTP interno de la sub-app se sirve en ``/`` porque se monta bajo
``/mcp`` → el endpoint final es ``POST http://<host>/mcp``.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from mcp.server.mcpserver import MCPServer

from . import tools_context

INSTRUCTIONS = (
    "Editor de vídeo (YouTube → clips verticales 9:16 → timeline → subtítulos → "
    "export). Empieza por get_project_context(project_id) para orientarte: te da "
    "formato, material, timeline, historial y las capabilities disponibles."
)

mcp = MCPServer(name="video-yt", instructions=INSTRUCTIONS)

# Registro de tools (Etapa 2: solo lectura de contexto).
tools_context.register(mcp)

# Sub-app ASGI para montar en /mcp. El path interno es "/" porque el mount ya
# aporta el prefijo /mcp.
asgi_app = mcp.streamable_http_app(streamable_http_path="/")


@asynccontextmanager
async def session_lifespan():
    """Abre el session-manager del MCP. Lo usa el lifespan de FastAPI."""
    async with mcp.session_manager.run():
        yield
