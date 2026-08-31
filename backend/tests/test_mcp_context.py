"""Tool get_project_context: introspección viva, camino feliz y error, auditado."""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.mcp_server import audit, server, tools_context


def _call(name, args):
    return asyncio.run(server.mcp.call_tool(name, args))


class ContextToolTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = projects._FILE
        self._old_hist = timeline_store.HISTORY_DIR
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"

    def tearDown(self):
        config.DATA_DIR = self._old_data
        projects._FILE = self._old_file
        timeline_store.HISTORY_DIR = self._old_hist
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_tool_listed_by_mcp_with_schema(self):
        tools = asyncio.run(server.mcp.list_tools())
        by_name = {t.name: t for t in tools}
        self.assertIn("get_project_context", by_name)
        schema = by_name["get_project_context"].input_schema
        self.assertIn("project_id", schema["properties"])

    def test_context_of_real_project(self):
        proj = projects.create_project("Demo MCP")
        ctx = tools_context.get_project_context(proj.id)
        self.assertEqual(ctx["project"]["name"], "Demo MCP")
        self.assertFalse(ctx["timeline"]["present"])
        self.assertIn("capabilities", ctx)

    def test_unknown_project_raises(self):
        with self.assertRaises(ValueError):
            tools_context.get_project_context("noexiste")

    def test_call_tool_end_to_end_audits(self):
        proj = projects.create_project("E2E")
        res = _call("get_project_context", {"project_id": proj.id})
        self.assertFalse(res.is_error)
        payload = json.loads(res.content[0].text)
        self.assertEqual(payload["project"]["id"], proj.id)
        e = audit.read_all()[-1]
        self.assertEqual(e["tool"], "get_project_context")
        self.assertEqual(e["access"], "read")
        self.assertEqual(e["status"], "ok")
        self.assertEqual(e["project_id"], proj.id)

    def test_call_tool_error_is_audited(self):
        # mcp 2.x propaga la excepción de la tool; lo que importa es que quedó
        # auditada con status=error antes de re-lanzar.
        with self.assertRaises(Exception):
            _call("get_project_context", {"project_id": "noexiste"})
        e = audit.read_all()[-1]
        self.assertEqual(e["status"], "error")
        self.assertEqual(e["tool"], "get_project_context")


if __name__ == "__main__":
    unittest.main()
