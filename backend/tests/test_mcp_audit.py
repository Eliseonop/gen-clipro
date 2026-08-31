"""Auditoría del MCP: log append-only JSONL, aislado en un tmpdir."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config
from app.mcp_server import audit


class AuditTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = config.DATA_DIR
        config.DATA_DIR = self.tmp

    def tearDown(self):
        config.DATA_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_log_appends_entry(self):
        audit.log(
            "get_project_context", "read",
            project_id="p1", param_keys=["project_id"], status="ok", ms=12.3456,
        )
        rows = audit.read_all()
        self.assertEqual(len(rows), 1)
        e = rows[0]
        self.assertEqual(e["tool"], "get_project_context")
        self.assertEqual(e["access"], "read")
        self.assertEqual(e["project_id"], "p1")
        self.assertEqual(e["param_keys"], ["project_id"])
        self.assertEqual(e["status"], "ok")
        self.assertEqual(e["ms"], 12.3)   # redondeado a 1 decimal
        self.assertIn("ts", e)

    def test_param_keys_sorted(self):
        audit.log("x", "write", param_keys=["z", "a", "m"])
        self.assertEqual(audit.read_all()[0]["param_keys"], ["a", "m", "z"])

    def test_error_truncated(self):
        audit.log("x", "read", status="error", error="E" * 500)
        self.assertEqual(len(audit.read_all()[0]["error"]), 300)

    def test_appends_multiple_lines(self):
        audit.log("a", "read")
        audit.log("b", "read")
        self.assertEqual(len(audit.read_all()), 2)

    def test_read_all_empty_when_no_file(self):
        self.assertEqual(audit.read_all(), [])


if __name__ == "__main__":
    unittest.main()
