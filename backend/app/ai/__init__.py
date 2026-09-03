"""Chat IA nativo del editor: agente que opera el MCP existente.

NO duplica tools ni lógica del editor. Un ``AIProvider`` (Gemini primero) decide
qué tools llamar; un cliente MCP **in-process** (``Client(mcp)``) las ejecuta
contra el MCP server ya existente (misma política + auditoría + timeline_store).
"""
