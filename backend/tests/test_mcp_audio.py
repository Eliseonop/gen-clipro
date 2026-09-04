"""Tools de Transcripción/Audio del MCP: transcribe, generate_subtitles, generate_voice, search_sfx."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import projects
from app.mcp_server import registry, server, tools_audio  # noqa: F401 (server puebla el registro)
from app.schemas import ClipInfo


class ProjectAudioTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id
        projects.add_clips(self.pid, [
            ClipInfo(index=0, filename="a.mp4", url="/x", start=0.0, end=10.0)])

    def tearDown(self):
        projects._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_transcribe_source_starts_job(self):
        cap = {}
        with patch("app.jobs.start_transcribe_job", side_effect=lambda j, r, t: cap.update(req=r, title=t)), \
             patch("app.heatmap._extract_info", return_value={"title": "T"}):
            out = tools_audio.transcribe(self.pid, source="https://youtu.be/x", model="small")
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["req"].url, "https://youtu.be/x")
        self.assertEqual(cap["req"].model, "small")

    def test_transcribe_clip_starts_job(self):
        cap = {}
        with patch("app.jobs.start_clip_transcribe_job",
                   side_effect=lambda job, pid, index, model, language: cap.update(index=index, model=model)):
            out = tools_audio.transcribe(self.pid, clip_index="0", model="base")
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["index"], "0")

    def test_transcribe_requires_exactly_one_mode(self):
        with self.assertRaises(ValueError):
            tools_audio.transcribe(self.pid)  # ninguno
        with self.assertRaises(ValueError):
            tools_audio.transcribe(self.pid, source="u", clip_index="0")  # ambos

    def test_transcribe_unknown_clip_raises(self):
        with self.assertRaises(ValueError):
            tools_audio.transcribe(self.pid, clip_index="99")

    def test_generate_subtitles_starts_job(self):
        cap = {}
        with patch("app.jobs.start_subtitles_job",
                   side_effect=lambda job, pid, filename, ak, model, lang, scope, src=None: cap.update(fn=filename, ak=ak)):
            out = tools_audio.generate_subtitles(self.pid, filename="v.m4a", asset_kind="audios")
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["fn"], "v.m4a")

    def test_generate_subtitles_needs_filename(self):
        with self.assertRaises(ValueError):
            tools_audio.generate_subtitles(self.pid, filename="")

    def test_generate_voice_starts_job(self):
        cap = {}
        with patch("app.tts.available", return_value=True), \
             patch("app.jobs.start_tts_job", side_effect=lambda j, r: cap.update(req=r)):
            out = tools_audio.generate_voice(self.pid, text="hola", voice="ef_dora")
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["req"].text, "hola")
        self.assertEqual(cap["req"].engine, "kokoro")

    def test_generate_voice_empty_text_raises(self):
        with self.assertRaises(ValueError):
            tools_audio.generate_voice(self.pid, text="   ")

    def test_generate_voice_engine_unavailable_raises(self):
        with patch("app.tts.available", return_value=False):
            with self.assertRaises(ValueError):
                tools_audio.generate_voice(self.pid, text="hola")

    def test_generate_voice_gemini_starts_job(self):
        cap = {}
        with patch("app.gemini_tts.unavailable_reason", return_value=None), \
             patch("app.jobs.start_tts_job", side_effect=lambda j, r: cap.update(req=r)):
            out = tools_audio.generate_voice(self.pid, text="hola", engine="gemini",
                                             voice="Kore", style="documentary")
        self.assertEqual(out["status"], "pending")
        self.assertEqual(cap["req"].engine, "gemini")
        self.assertEqual(cap["req"].voice, "Kore")
        self.assertEqual(cap["req"].style, "documentary")

    def test_generate_voice_gemini_unavailable_raises(self):
        with patch("app.gemini_tts.unavailable_reason", return_value="Falta la API key"):
            with self.assertRaises(ValueError):
                tools_audio.generate_voice(self.pid, text="hola", engine="gemini")


class SearchSfxTest(unittest.TestCase):
    def test_search_sfx_shapes_dto(self):
        fake = {
            "available": True, "base": "/sfx", "total": 2,
            "categories": [{"id": "whoosh", "label": "Whoosh", "count": 1}],
            "items": [
                {"id": "whoosh/a.wav", "name": "A", "category": "whoosh", "uso": "transición", "url": "/api/sfx/file/x"},
                {"id": "impact/b.wav", "name": "B", "category": "impact", "uso": "golpe", "url": "/api/sfx/file/y"},
            ],
        }
        with patch("app.sfx.search", return_value=fake):
            out = tools_audio.search_sfx(query="a")
        self.assertTrue(out["available"])
        self.assertEqual(out["total"], 2)
        self.assertEqual(out["categories"], ["whoosh"])
        self.assertEqual(out["items"][0]["name"], "A")


class AudioPolicyTest(unittest.TestCase):
    def test_access_levels(self):
        specs = registry.registered()
        self.assertEqual(specs["transcribe"].access, "write")
        self.assertEqual(specs["generate_subtitles"].access, "write")
        self.assertEqual(specs["generate_voice"].access, "write")
        self.assertEqual(specs["search_sfx"].access, "read")


if __name__ == "__main__":
    unittest.main()
