"""Registro de tools del MCP: política (access), auditoría, introspección."""
import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path

from mcp.server.mcpserver import MCPServer

from app import config
from app.mcp_server import audit, registry


class RegistryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = config.DATA_DIR
        config.DATA_DIR = self.tmp
        # No destruir el registro global (server.py lo puebla): snapshot + slate limpio.
        self._saved = dict(registry._registry)
        registry._registry.clear()
        self.mcp = MCPServer("test")

    def tearDown(self):
        registry._registry.clear()
        registry._registry.update(self._saved)
        config.DATA_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_registers_with_access_level(self):
        @registry.tool(self.mcp, access="read")
        def ping(project_id: str) -> dict:
            return {"ok": True}

        specs = registry.registered()
        self.assertIn("ping", specs)
        self.assertEqual(specs["ping"].access, "read")

    def test_invalid_access_rejected(self):
        with self.assertRaises(ValueError):
            @registry.tool(self.mcp, access="banana")
            def bad():
                return None

    def test_duplicate_name_rejected(self):
        @registry.tool(self.mcp, access="read")
        def dup():
            return 1

        with self.assertRaises(ValueError):
            @registry.tool(self.mcp, access="read", name="dup")
            def other():
                return 2

    def test_wrapper_audits_ok(self):
        @registry.tool(self.mcp, access="read")
        def ok_tool(project_id: str) -> dict:
            return {"v": 1}

        self.assertEqual(ok_tool(project_id="pX"), {"v": 1})
        e = audit.read_all()[-1]
        self.assertEqual(e["tool"], "ok_tool")
        self.assertEqual(e["status"], "ok")
        self.assertEqual(e["project_id"], "pX")
        self.assertIn("ms", e)

    def test_wrapper_audits_error_and_reraises(self):
        @registry.tool(self.mcp, access="write")
        def boom(project_id: str) -> dict:
            raise ValueError("kaboom")

        with self.assertRaises(ValueError):
            boom(project_id="pE")
        e = audit.read_all()[-1]
        self.assertEqual(e["status"], "error")
        self.assertIn("kaboom", e["error"])

    def test_audit_records_keys_not_values(self):
        @registry.tool(self.mcp, access="write")
        def with_text(project_id: str, text: str) -> dict:
            return {"ok": True}

        with_text(project_id="p1", text="SECRETO-NO-LOGUEAR")
        raw = (config.DATA_DIR / "mcp_audit.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("SECRETO-NO-LOGUEAR", raw)   # el valor no se registra
        self.assertIn("text", raw)                    # la clave sí

    def test_introspection_preserved(self):
        @registry.tool(self.mcp, access="read")
        def typed(project_id: str) -> dict:
            return {}

        tools = asyncio.run(self.mcp.list_tools())
        by_name = {t.name: t for t in tools}
        self.assertIn("typed", by_name)
        self.assertIn("project_id", by_name["typed"].input_schema["properties"])


if __name__ == "__main__":
    unittest.main()
