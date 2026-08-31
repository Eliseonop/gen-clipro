"""YouTube → Audio: validación de URL y job que crea un audio de proyecto."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, jobs, projects
from app.schemas import YouTubeAudioRequest


class YoutubeUrlTest(unittest.TestCase):
    def test_accepts_watch_shorts_and_youtu_be(self):
        from app.youtube_audio import is_youtube_url

        self.assertTrue(is_youtube_url("https://www.youtube.com/watch?v=abc"))
        self.assertTrue(is_youtube_url("https://youtu.be/abc"))
        self.assertTrue(is_youtube_url("https://m.youtube.com/watch?v=abc"))
        self.assertTrue(is_youtube_url("youtube.com/watch?v=abc"))
        self.assertTrue(is_youtube_url("https://www.youtube.com/shorts/abc"))
        self.assertTrue(is_youtube_url("https://www.youtube.com/live/abc"))

    def test_rejects_empty_and_other_hosts(self):
        from app.youtube_audio import is_youtube_url

        self.assertFalse(is_youtube_url(""))
        self.assertFalse(is_youtube_url("https://vimeo.com/1"))
        self.assertFalse(is_youtube_url("not a url"))

    def test_extracts_video_id(self):
        from app.youtube_audio import youtube_id_from_url

        self.assertEqual(youtube_id_from_url("https://www.youtube.com/watch?v=dQw4w9wgGcQ"), "dQw4w9wgGcQ")
        self.assertEqual(youtube_id_from_url("https://youtu.be/dQw4w9wgGcQ"), "dQw4w9wgGcQ")
        self.assertEqual(youtube_id_from_url("https://www.youtube.com/shorts/dQw4w9wgGcQ"), "dQw4w9wgGcQ")


class YoutubeAudioJobTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_data = config.DATA_DIR
        projects._FILE = self.tmp / "projects.json"
        config.DATA_DIR = self.tmp   # aísla la biblioteca (list_library lee de DATA_DIR)
        self.proj_dir = self.tmp / "proj"
        self.pid = projects.create_project("A").id
        projects.set_folder(self.pid, str(self.proj_dir))

    def tearDown(self):
        projects._FILE = self._old_file
        config.DATA_DIR = self._old_data
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_job_crea_audio_de_proyecto_no_de_biblioteca(self):
        from app.library import list_library

        def fake_extract(url, out_path, on_progress):
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            Path(out_path).write_bytes(b"m4a")
            on_progress(1.0, "ok")
            return {"duration": 3.2, "title": "Mi canción", "video_id": "abc123"}

        with patch("app.youtube_audio.extract_audio", side_effect=fake_extract):
            job = jobs.create_job()
            jobs._run_youtube_audio(job.id, YouTubeAudioRequest(
                project_id=self.pid, url="https://www.youtube.com/watch?v=abc123",
            ))
        job = jobs.get_job(job.id)
        self.assertEqual(job.status.value, "done")
        proj = projects.get_project(self.pid)
        self.assertEqual(len(proj.audios), 1)
        a = proj.audios[0]
        self.assertEqual(a.origin, "youtube")
        self.assertEqual(a.source, "external")
        self.assertEqual(a.youtube_id, "abc123")
        self.assertEqual(a.label, "Mi canción")
        self.assertTrue(a.filename.endswith(".m4a"))
        self.assertEqual(list_library()["audios"], [])
        self.assertTrue((self.proj_dir / "audio" / a.filename).exists())

    def test_job_error_no_deja_audio(self):
        with patch("app.youtube_audio.extract_audio", side_effect=RuntimeError("boom")):
            job = jobs.create_job()
            jobs._run_youtube_audio(job.id, YouTubeAudioRequest(
                project_id=self.pid, url="https://youtu.be/abc",
            ))
        job = jobs.get_job(job.id)
        self.assertEqual(job.status.value, "error")
        self.assertEqual(projects.get_project(self.pid).audios, [])


class YoutubeAudioHttpTest(unittest.TestCase):
    def test_url_invalida_400_sin_job(self):
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        res = client.post("/api/youtube-audio", json={"project_id": "nope", "url": "https://vimeo.com/1"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("YouTube", res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
