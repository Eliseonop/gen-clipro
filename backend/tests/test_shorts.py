"""Orquestación de workflows de short (servicios pesados mockeados)."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects, shorts, timeline_store
from app.schemas import AnalyzeResponse, ClipInfo, Segment, VideoInfo


def _fake_analyze(**kwargs):
    return AnalyzeResponse(
        video=VideoInfo(id="v", title="T", duration=120.0),
        has_heatmap=True,
        segments=[Segment(index=0, start=10.0, end=25.0, score=0.9, duration=15.0),
                  Segment(index=1, start=60.0, end=68.0, score=0.6, duration=8.0)],
    )


def _fake_generate(url, segments, mode, title, project_id, video_dir, on_progress, reframe=None):
    video_dir.mkdir(parents=True, exist_ok=True)
    (video_dir / "clip0.mp4").write_bytes(b"clip")
    on_progress(1.0, "clip")
    return [ClipInfo(index=0, filename="clip0.mp4", url="/x", start=10.0, end=25.0, label="c0")]


def _fake_transcribe(path, model, language, on_progress):
    on_progress(1.0, "t")
    return {"language": "es", "duration": 2.0,
            "segments": [{"start": 0.0, "end": 2.0, "text": "hola mundo",
                          "words": [{"text": "hola", "start": 0.0, "end": 0.5},
                                    {"text": "mundo", "start": 0.6, "end": 1.0}]}]}


def _fake_render(project, timeline, out_path, on_progress):
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_bytes(b"video")
    on_progress(1.0, "ok")
    return out_path


class ShortsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.set_folder(self.pid, str(self.tmp / "proj"))
        self.progress = []

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _cb(self, frac, msg):
        self.progress.append((frac, msg))

    def test_from_youtube_full_pipeline(self):
        with patch("app.heatmap.analyze", side_effect=_fake_analyze), \
             patch("app.heatmap._extract_info", return_value={"title": "T"}), \
             patch("app.clipper.generate_clips", side_effect=_fake_generate), \
             patch("app.transcribe.run_file", side_effect=_fake_transcribe), \
             patch("app.compose.render", side_effect=_fake_render):
            out = shorts.build_short_from_youtube(self.pid, "https://youtu.be/x", on_progress=self._cb)

        self.assertIsNotNone(out["export_url"])
        self.assertEqual(out["subtitle_lines"], 1)
        # la timeline quedó en 9:16 con vídeo + texto
        tl = projects.get_project(self.pid).timeline
        self.assertEqual((tl.width, tl.height), (720, 1280))
        kinds = {c.kind for c in tl.clips}
        self.assertIn("video", kinds)
        self.assertIn("text", kinds)
        # el progreso avanza y termina en 1.0
        self.assertEqual(self.progress[-1][0], 1.0)

    def test_from_youtube_no_segments_raises(self):
        empty = AnalyzeResponse(video=VideoInfo(id="v", title="T", duration=1.0),
                                has_heatmap=False, segments=[])
        with patch("app.heatmap.analyze", return_value=empty):
            with self.assertRaises(RuntimeError):
                shorts.build_short_from_youtube(self.pid, "u", on_progress=self._cb)

    def test_from_youtube_no_export_no_subs(self):
        with patch("app.heatmap.analyze", side_effect=_fake_analyze), \
             patch("app.heatmap._extract_info", return_value={"title": "T"}), \
             patch("app.clipper.generate_clips", side_effect=_fake_generate):
            out = shorts.build_short_from_youtube(
                self.pid, "u", subtitles=False, export=False, on_progress=self._cb)
        self.assertIsNone(out["export_url"])
        self.assertEqual(out["subtitle_lines"], 0)

    def test_from_library(self):
        # un clip ya en el proyecto + su archivo en disco
        projects.add_clips(self.pid, [ClipInfo(index=5, filename="lib.mp4", url="/l",
                                               start=0.0, end=12.0, label="Lib")])
        vid = self.tmp / "proj" / "video"
        vid.mkdir(parents=True, exist_ok=True)
        (vid / "lib.mp4").write_bytes(b"clip")
        with patch("app.transcribe.run_file", side_effect=_fake_transcribe), \
             patch("app.compose.render", side_effect=_fake_render):
            out = shorts.build_short_from_library(self.pid, "5", on_progress=self._cb)
        self.assertIsNotNone(out["export_url"])
        tl = projects.get_project(self.pid).timeline
        self.assertEqual((tl.width, tl.height), (720, 1280))

    def test_from_library_unknown_clip_raises(self):
        with self.assertRaises(RuntimeError):
            shorts.build_short_from_library(self.pid, "999", on_progress=self._cb)


if __name__ == "__main__":
    unittest.main()
