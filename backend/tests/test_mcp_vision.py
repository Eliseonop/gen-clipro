"""Visión del MCP: get_frame (ojos) + set_clip_ai_description (campo aparte)."""
import base64
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects
from app.mcp_server import registry, server, tools_vision  # noqa: F401
from app.schemas import ClipInfo


class VisionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        self.proj_dir = self.tmp / "proj"
        projects.set_folder(self.pid, str(self.proj_dir))
        projects.add_clips(self.pid, [ClipInfo(index=0, filename="a.mp4", url="/x",
                                               start=0.0, end=10.0, label="Intro",
                                               description="mi descripción")])
        (self.proj_dir / "video").mkdir(parents=True, exist_ok=True)
        (self.proj_dir / "video" / "a.mp4").write_bytes(b"fake")

    def tearDown(self):
        config.DATA_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_get_frame_returns_image(self):
        def fake_run(cmd, **kw):
            Path(cmd[-1]).write_bytes(b"\xff\xd8\xffJPEGDATA")

            class R:
                returncode = 0
                stderr = ""
            return R()

        with patch("app.mcp_server.tools_vision.shutil.which", return_value="ffmpeg"), \
             patch("app.mcp_server.tools_vision.subprocess.run", side_effect=fake_run):
            out = tools_vision.get_frame(self.pid, "0")
        self.assertEqual(out["clip_index"], 0)
        self.assertEqual(out["mime"], "image/jpeg")
        self.assertEqual(base64.b64decode(out["image_b64"]), b"\xff\xd8\xffJPEGDATA")
        self.assertEqual(out["at_time"], 5.0)   # centro por defecto

    def test_get_frame_unknown_clip_raises(self):
        with self.assertRaises(ValueError):
            tools_vision.get_frame(self.pid, "99")

    def test_ai_description_does_not_overwrite_user(self):
        out = tools_vision.set_clip_ai_description(self.pid, "0", "Un hombre habla a cámara")
        self.assertTrue(out["ok"])
        clip = next(c for c in projects.get_project(self.pid).clips if c.index == 0)
        self.assertEqual(clip.description_ai, "Un hombre habla a cámara")
        self.assertEqual(clip.description, "mi descripción")   # la del usuario intacta

    def test_access_levels(self):
        specs = registry.registered()
        self.assertEqual(specs["get_frame"].access, "read")
        self.assertEqual(specs["set_clip_ai_description"].access, "write")


if __name__ == "__main__":
    unittest.main()
