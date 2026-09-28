"""YouTube → vídeo completo: calidades disponibles, formato elegido y job al material."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, jobs, projects
from app.schemas import YouTubeVideoRequest
from app.youtube_video import available_qualities, format_spec, quality_of, resolve_quality


def _v(fid, note, w, h, vcodec="avc1.640028", fps=30, size=None, acodec="none", **kw):
    return {"format_id": fid, "format_note": note, "width": w, "height": h, "vcodec": vcodec,
            "acodec": acodec, "fps": fps, "filesize": size, "ext": "mp4", **kw}


AUDIO = {"format_id": "140", "vcodec": "none", "acodec": "mp4a.40.2", "ext": "m4a", "abr": 129, "filesize": 10}
OPUS = {"format_id": "251", "vcodec": "none", "acodec": "opus", "ext": "webm", "abr": 140, "filesize": 12}
STORYBOARD = {"format_id": "sb0", "format_note": "storyboard", "vcodec": "none", "acodec": "none",
              "ext": "mhtml", "width": 320, "height": 180}

INFO = {"formats": [
    STORYBOARD, AUDIO, OPUS,
    _v("18", "360p", 640, 360, acodec="mp4a.40.2", size=50),
    _v("136", "720p", 1280, 720, size=300),
    _v("137", "1080p", 1920, 1080, size=600),
    _v("248", "1080p", 1920, 1080, vcodec="vp9", size=500),
    _v("313", "2160p", 3840, 2160, vcodec="vp9", size=4000),
    _v("701", "2160p60 HDR", 3840, 2160, vcodec="av01.0.13M.10", fps=60, size=5000,
       dynamic_range="HDR10"),
    _v("160", "144p", 256, 144, size=5),
]}


class QualityTest(unittest.TestCase):
    def test_quality_is_youtube_label_short_side(self):
        self.assertEqual(quality_of(_v("x", "1080p60", 1920, 1080)), 1080)
        # Short vertical: YouTube lo llama 1080p aunque mida 1920 de alto.
        self.assertEqual(quality_of(_v("x", None, 1080, 1920)), 1080)
        self.assertIsNone(quality_of({"format_id": "a"}))

    def test_available_qualities_best_first_without_tiny_or_storyboards(self):
        qs = available_qualities(INFO)
        self.assertEqual([q["quality"] for q in qs], [2160, 1080, 720, 360])
        # 1080p: H.264 (137) + m4a → tamaño vídeo + audio.
        self.assertEqual(qs[1]["size"], 610)
        # 360p muxed (18) ya lleva audio: no se suma.
        self.assertEqual(qs[-1]["size"], 50)

    def test_spec_prefers_sdr_and_h264_and_adds_audio(self):
        # 2160p: el HDR (701) tiene más fps, pero se prefiere SDR (313).
        self.assertTrue(format_spec(INFO, 2160).startswith("313+bestaudio"))
        self.assertTrue(format_spec(INFO, 1080).startswith("137+bestaudio[ext=m4a]"))
        self.assertEqual(format_spec(INFO, 360), "18")
        with self.assertRaises(ValueError):
            format_spec(INFO, 1440)

    def test_resolve_quality_defaults_to_best_and_falls_back_lower(self):
        qs = available_qualities(INFO)
        self.assertEqual(resolve_quality(qs, None), 2160)
        self.assertEqual(resolve_quality(qs, 1080), 1080)
        self.assertEqual(resolve_quality(qs, 1440), 1080)
        self.assertEqual(resolve_quality(qs, 240), 360)
        self.assertIsNone(resolve_quality([], None))


class YoutubeVideoJobTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_data = config.DATA_DIR
        projects._FILE = self.tmp / "projects.json"
        config.DATA_DIR = self.tmp
        self.proj_dir = self.tmp / "proj"
        self.pid = projects.create_project("A").id
        projects.set_folder(self.pid, str(self.proj_dir))

    def tearDown(self):
        projects._FILE = self._old_file
        config.DATA_DIR = self._old_data
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_job_adds_full_video_to_material(self):
        seen = {}

        def fake_download(url, quality, dest_dir, on_progress, info=None):
            seen["quality"] = quality
            path = Path(dest_dir) / "source.mp4"
            path.write_bytes(b"mp4")
            on_progress(0.5, "…")
            return {"path": path, "quality": 1080, "title": "Mi vídeo: 1/2", "video_id": "abc123"}

        with patch("app.youtube_video.download", side_effect=fake_download):
            job = jobs.create_job()
            jobs._run_youtube_video(job.id, YouTubeVideoRequest(
                project_id=self.pid, url="https://www.youtube.com/watch?v=abc123", quality=1080,
            ))
        job = jobs.get_job(job.id)
        self.assertEqual(job.status.value, "done", job.error)
        self.assertEqual(seen["quality"], 1080)
        clips = projects.get_project(self.pid).clips
        self.assertEqual(len(clips), 1)
        c = clips[0]
        self.assertEqual((c.origin, c.provider, c.external_id), ("youtube", "youtube", "abc123"))
        self.assertEqual(c.label, "Mi vídeo: 1/2 · 1080p")
        self.assertTrue(c.filename.endswith(".mp4"))
        self.assertTrue((self.proj_dir / "video" / c.filename).exists())
        # El temporal de la descarga no se queda en la carpeta del proyecto.
        self.assertEqual([p.name for p in self.proj_dir.glob(".ytdl-*")], [])

    def test_job_error_leaves_no_clip(self):
        with patch("app.youtube_video.download", side_effect=RuntimeError("boom")):
            job = jobs.create_job()
            jobs._run_youtube_video(job.id, YouTubeVideoRequest(
                project_id=self.pid, url="https://youtu.be/abc",
            ))
        job = jobs.get_job(job.id)
        self.assertEqual(job.status.value, "error")
        self.assertIn("boom", job.error)
        self.assertEqual(projects.get_project(self.pid).clips, [])


class YoutubeVideoHttpTest(unittest.TestCase):
    def test_invalid_url_400(self):
        from fastapi.testclient import TestClient
        from app.main import app

        res = TestClient(app).post("/api/youtube-video", json={"project_id": "nope", "url": "https://vimeo.com/1"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("YouTube", res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
