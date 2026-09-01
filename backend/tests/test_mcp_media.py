"""Tools de MEDIA/YouTube del MCP: analyze_youtube, create_clips_from_segments, delete_media."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects
from app.mcp_server import registry, server, tools_media  # noqa: F401 (server puebla el registro)
from app.schemas import AnalyzeResponse, ClipInfo, ImageInfo, Segment, VideoInfo


def _fake_analyze(**kwargs):
    return AnalyzeResponse(
        video=VideoInfo(id="vid1", title="Mi vídeo", duration=120.0, uploader="Canal"),
        has_heatmap=True,
        segments=[
            Segment(index=0, start=10.0, end=25.0, score=0.9, duration=15.0),
            Segment(index=1, start=60.0, end=70.0, score=0.7, duration=10.0),
        ],
    )


class AnalyzeTest(unittest.TestCase):
    def test_analyze_youtube_shapes_dto(self):
        with patch("app.heatmap.analyze", side_effect=_fake_analyze):
            out = tools_media.analyze_youtube("https://youtu.be/x", max_clips=5)
        self.assertEqual(out["video"]["title"], "Mi vídeo")
        self.assertTrue(out["has_heatmap"])
        self.assertEqual(len(out["segments"]), 2)
        self.assertEqual(out["segments"][0]["duration"], 15.0)


class CreateClipsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id

    def tearDown(self):
        projects._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_starts_job_and_returns_pending(self):
        captured = {}

        def fake_start(job, req, title):
            captured["req"] = req
            captured["title"] = title

        segs = [{"start": 10.0, "end": 25.0}, {"index": 1, "start": 60.0, "end": 70.0, "score": 0.7}]
        with patch("app.jobs.start_job", side_effect=fake_start), \
             patch("app.heatmap._extract_info", return_value={"title": "T"}):
            out = tools_media.create_clips_from_segments(self.pid, "https://youtu.be/x", segs)
        self.assertEqual(out["status"], "pending")
        self.assertIn("id", out)
        req = captured["req"]
        self.assertEqual(len(req.segments), 2)
        self.assertIsInstance(req.segments[0], Segment)
        self.assertEqual(req.segments[0].duration, 15.0)   # rellenado (end-start)
        self.assertEqual(req.crop_mode.value, "center")

    def test_empty_segments_raises(self):
        with self.assertRaises(ValueError):
            tools_media.create_clips_from_segments(self.pid, "u", [])

    def test_bad_crop_mode_raises(self):
        with self.assertRaises(ValueError):
            tools_media.create_clips_from_segments(self.pid, "u", [{"start": 0, "end": 1}], crop_mode="rombo")

    def test_unknown_project_raises(self):
        with self.assertRaises(ValueError):
            tools_media.create_clips_from_segments("nope", "u", [{"start": 0, "end": 1}])


class DeleteMediaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = projects._FILE
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        self.proj_dir = self.tmp / "proj"
        self.pid = projects.create_project("Demo").id
        projects.set_folder(self.pid, str(self.proj_dir))
        projects.add_clips(self.pid, [
            ClipInfo(index=0, filename="a.mp4", url="/x", start=0.0, end=10.0)])
        (self.proj_dir / "video").mkdir(parents=True, exist_ok=True)
        self.clip_file = self.proj_dir / "video" / "a.mp4"
        self.clip_file.write_bytes(b"data")

    def tearDown(self):
        config.DATA_DIR = self._old_data
        projects._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_delete_removes_material_and_file(self):
        out = tools_media.delete_media(self.pid, "clips", "0")
        self.assertTrue(out["ok"])
        self.assertTrue(out["file_deleted"])
        self.assertFalse(self.clip_file.exists())
        self.assertEqual(projects.get_project(self.pid).clips, [])

    def test_delete_unknown_raises(self):
        with self.assertRaises(ValueError):
            tools_media.delete_media(self.pid, "clips", "99")

    def test_delete_image(self):
        (self.proj_dir / "image").mkdir(parents=True, exist_ok=True)
        img_file = self.proj_dir / "image" / "logo.png"
        img_file.write_bytes(b"png")
        projects.add_image(self.pid, ImageInfo(
            id="im1", filename="logo.png", url="/i", width=10, height=10))
        out = tools_media.delete_media(self.pid, "images", "im1")
        self.assertTrue(out["ok"])
        self.assertTrue(out["file_deleted"])
        self.assertFalse(img_file.exists())
        self.assertEqual(projects.get_project(self.pid).images, [])

    def test_bad_kind_raises(self):
        with self.assertRaises(ValueError):
            tools_media.delete_media(self.pid, "fotos", "0")


class MediaPolicyTest(unittest.TestCase):
    def test_access_levels(self):
        specs = registry.registered()
        self.assertEqual(specs["analyze_youtube"].access, "read")
        self.assertEqual(specs["create_clips_from_segments"].access, "write")
        self.assertEqual(specs["delete_media"].access, "destructive")


if __name__ == "__main__":
    unittest.main()
