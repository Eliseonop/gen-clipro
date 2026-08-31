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

from . import (
    tools_audio,
    tools_context,
    tools_edit,
    tools_jobs,
    tools_media,
    tools_read,
    tools_render,
    tools_workflow,
)

INSTRUCTIONS = (
    "Editor de vídeo (YouTube → clips verticales 9:16 → timeline → subtítulos → "
    "export). Empieza por get_project_context(project_id) para orientarte: te da "
    "formato, material, timeline, historial y las capabilities disponibles."
)

mcp = MCPServer(name="video-yt", instructions=INSTRUCTIONS)

# Registro de tools.
tools_context.register(mcp)   # Etapa 2: get_project_context
tools_read.register(mcp)      # Etapa 3: get_timeline, inspect_clip, list_media
tools_jobs.register(mcp)      # Etapa 3: get_job, wait_for_job
tools_edit.register(mcp)      # Etapa 4: edición (write/destructive) + undo/redo/checkpoints
tools_media.register(mcp)     # Etapa 5: analyze_youtube, create_clips_from_segments, delete_media
tools_audio.register(mcp)     # Etapa 6: transcribe, generate_subtitles, generate_voice, search_sfx
tools_render.register(mcp)    # Etapa 7: export_project, list_jobs, cancel_job
tools_workflow.register(mcp)  # Etapa 8: create_short_from_youtube, make_short_from_library

# Sub-app ASGI para montar en /mcp. El path interno es "/" porque el mount ya
# aporta el prefijo /mcp.
asgi_app = mcp.streamable_http_app(streamable_http_path="/")


@asynccontextmanager
async def session_lifespan():
    """Abre el session-manager del MCP. Lo usa el lifespan de FastAPI."""
    async with mcp.session_manager.run():
        yield
