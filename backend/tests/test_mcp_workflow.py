"""Tools de workflow del MCP: create_short_from_youtube, make_short_from_library."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import projects
from app.mcp_server import registry, server, tools_workflow  # noqa: F401 (server puebla el registro)
from app.schemas import ClipInfo


class WorkflowToolsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        projects.add_clips(self.pid, [ClipInfo(index=0, filename="a.mp4", url="/x",
                                               start=0.0, end=10.0)])

    def tearDown(self):
        projects._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_create_short_from_youtube_starts_job(self):
        cap = {}
        with patch("app.jobs.start_short_youtube_job",
                   side_effect=lambda job, pid, params: cap.update(pid=pid, params=params)):
            out = tools_workflow.create_short_from_youtube(self.pid, "https://youtu.be/x", count=2)
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["pid"], self.pid)
        self.assertEqual(cap["params"]["url"], "https://youtu.be/x")
        self.assertEqual(cap["params"]["count"], 2)

    def test_create_short_needs_url(self):
        with self.assertRaises(ValueError):
            tools_workflow.create_short_from_youtube(self.pid, "  ")

    def test_create_short_unknown_project(self):
        with self.assertRaises(ValueError):
            tools_workflow.create_short_from_youtube("nope", "u")

    def test_make_short_from_library_starts_job(self):
        cap = {}
        with patch("app.jobs.start_short_library_job",
                   side_effect=lambda job, pid, params: cap.update(pid=pid, params=params)):
            out = tools_workflow.make_short_from_library(self.pid, "0")
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["params"]["asset_id"], "0")

    def test_make_short_unknown_clip_raises(self):
        with self.assertRaises(ValueError):
            tools_workflow.make_short_from_library(self.pid, "99")

    def test_access_levels(self):
        specs = registry.registered()
        self.assertEqual(specs["create_short_from_youtube"].access, "write")
        self.assertEqual(specs["make_short_from_library"].access, "write")


if __name__ == "__main__":
    unittest.main()
