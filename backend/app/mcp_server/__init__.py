"""MCP server: capa de control para que una IA opere el editor.

Se monta en el mismo proceso FastAPI (ver ``app.main``) y expone las tools en
``/mcp`` por transporte streamable-HTTP. Las tools llaman in-process a los
servicios existentes (``projects``, ``timeline_store``, ``jobs``) → comparten el
estado vivo con el editor del humano.
"""
