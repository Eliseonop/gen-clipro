"""Fase 3: errores estructurados. Verifica que por el camino MCP las tools
devuelven is_error + JSON {"error":{code,message,retryable,param?,hint?}}."""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.ai.mcp_client import _result_data
from app.mcp_server import registry, server
from mcp import Client


class StructuredErrorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _err(self, name, args):
        async def go():
            async with Client(server.mcp) as c:
                return _result_data(await c.call_tool(name, args))
        res = asyncio.run(go())
        self.assertFalse(res["ok"])
        self.assertIsInstance(res["data"], dict)
        return res["data"]["error"]

    def test_resource_not_found_from_heuristic(self):
        err = self._err("get_project_context", {"project_id": "nope"})
        self.assertEqual(err["code"], "resource_not_found")
        self.assertFalse(err["retryable"])

    def test_invalid_parameter_with_param(self):
        p = projects.create_project("X")
        err = self._err("create_clips_from_segments",
                        {"project_id": p.id, "url": "u",
                         "segments": [{"start": 0, "end": 1}], "crop_mode": "zzz"})
        self.assertEqual(err["code"], "invalid_parameter")
        self.assertEqual(err["param"], "crop_mode")
        self.assertTrue(err["retryable"])

    def test_tts_engine_invalid(self):
        p = projects.create_project("X")
        err = self._err("generate_voice", {"project_id": p.id, "text": "hola", "engine": "xxx"})
        self.assertEqual(err["code"], "invalid_parameter")
        self.assertEqual(err["param"], "engine")

    def test_job_not_found_resource(self):
        err = self._err("get_job", {"job_id": "no-existe"})
        self.assertEqual(err["code"], "resource_not_found")

    def test_all_codes_are_known(self):
        # Los códigos que emitimos están en el enum cerrado.
        p = projects.create_project("X")
        for args in (
            ("get_project_context", {"project_id": "x"}),
            ("create_clips_from_segments", {"project_id": p.id, "url": "u",
                                            "segments": [{"start": 0, "end": 1}], "crop_mode": "z"}),
        ):
            err = self._err(*args)
            self.assertIn(err["code"], registry.ERROR_CODES)


if __name__ == "__main__":
    unittest.main()
