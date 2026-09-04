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
        audit.reset_runtime()

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

    def test_read_recent_limit_and_project(self):
        audit.log("a", "read", project_id="p1")
        audit.log("b", "write", project_id="p2")
        audit.log("c", "read", project_id="p1")
        audit.log("d", "read")
        recent = audit.read_recent(limit=2, project_id="p1")
        self.assertEqual([e["tool"] for e in recent], ["c", "d"])
        self.assertEqual(len(audit.read_recent(limit=1)), 1)

    def test_endpoint_lista_entradas(self):
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import app

        rows = [{"ts": "t", "tool": "get_timeline", "access": "read", "status": "ok"}]
        with patch("app.mcp_server.audit.read_recent", return_value=rows):
            res = TestClient(app).get("/api/mcp/audit?project_id=p1&limit=10")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["entries"][0]["tool"], "get_timeline")
        self.assertIn("active", res.json())

    def test_extract_meta_skips_text_keeps_ids(self):
        meta = audit.extract_meta("generate_voice", {
            "text": "SECRETO", "engine": "gemini", "voice": "Kore", "clip_id": "c1",
        })
        self.assertNotIn("text", meta)
        self.assertEqual(meta["engine"], "gemini")
        self.assertEqual(meta["voice"], "Kore")
        self.assertEqual(meta["clip_id"], "c1")

    def test_extract_meta_resolves_whisper_from_settings(self):
        from unittest.mock import patch
        with patch("app.transcribe_settings.resolve", return_value="small"):
            meta = audit.extract_meta("generate_subtitles", {"filename": "a.wav"})
        self.assertEqual(meta["model"], "small")
        self.assertEqual(meta["model_source"], "ajustes")
        self.assertEqual(meta["filename"], "a.wav")

    def test_begin_finish_active(self):
        tok = audit.begin("set_clip_volume", "write", project_id="p1", meta={"clip_id": "c9"})
        live = audit.active("p1")
        self.assertEqual(len(live), 1)
        self.assertEqual(live[0]["tool"], "set_clip_volume")
        self.assertEqual(live[0]["status"], "run")
        audit.finish(tok, status="ok", ms=4, param_keys=["clip_id"])
        self.assertEqual(audit.active("p1"), [])
        self.assertEqual(audit.read_all()[-1]["meta"]["clip_id"], "c9")

    def test_track_job_until_done(self):
        from app import jobs
        from app.schemas import JobStatus
        job = jobs.create_job()
        audit.track_job(job.id, "generate_subtitles", "write",
                        project_id="p1", meta={"model": "base", "clip_id": "c1"})
        live = audit.active("p1")
        self.assertEqual(live[0]["job_id"], job.id)
        self.assertEqual(live[0]["meta"]["model"], "base")
        job.status = JobStatus.done
        self.assertEqual(audit.active("p1"), [])


if __name__ == "__main__":
    unittest.main()
