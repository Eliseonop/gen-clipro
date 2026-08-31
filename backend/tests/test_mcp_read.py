"""Tools de lectura del MCP: get_timeline, inspect_clip, list_media."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.mcp_server import tools_read
from app.schemas import (
    AudioInfo,
    ClipInfo,
    Keyframe,
    Reframe,
    Timeline,
    TimelineClip,
    TimelineTrack,
    Transcript,
    TranscriptSegment,
    Word,
)


def _timeline() -> Timeline:
    return Timeline(
        width=720, height=1280, fps=30,
        tracks=[
            TimelineTrack(id="V1", kind="video", name="V1"),
            TimelineTrack(id="T1", kind="text", name="T1"),
        ],
        clips=[
            TimelineClip(
                id="c1", track_id="V1", kind="video", asset_kind="clips",
                asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                out_point=10.0, source_duration=10.0, look="cinematic",
                reframe=Reframe(zoom=0.8, keyframes=[Keyframe(t=0.0, cx=0.5, cy=0.5)]),
            ),
            TimelineClip(
                id="t1", track_id="T1", kind="text", asset_kind="clips",
                asset_id="x", filename="", start=0.0, in_point=0.0, out_point=3.0,
                text="hola mundo",
                words=[Word(text="hola", start=0.0, end=0.5),
                       Word(text="mundo", start=0.6, end=1.0)],
            ),
        ],
    )


class ReadToolsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = projects._FILE
        self._old_hist = timeline_store.HISTORY_DIR
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, _timeline().model_dump())

    def tearDown(self):
        config.DATA_DIR = self._old_data
        projects._FILE = self._old_file
        timeline_store.HISTORY_DIR = self._old_hist
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_get_timeline_is_scannable_no_heavy_data(self):
        tl = tools_read.get_timeline(self.pid)
        self.assertTrue(tl["present"])
        self.assertEqual(tl["format"]["aspect"], "9:16")
        self.assertEqual(len(tl["clips"]), 2)
        c1 = next(c for c in tl["clips"] if c["id"] == "c1")
        self.assertTrue(c1["has_reframe"])
        self.assertEqual(c1["look"], "cinematic")
        # datos pesados NO deben aparecer en el resumen
        self.assertNotIn("words", c1)
        self.assertNotIn("reframe", c1)
        t1 = next(c for c in tl["clips"] if c["id"] == "t1")
        self.assertEqual(t1["text"], "hola mundo")
        self.assertEqual(t1["word_count"], 2)

    def test_inspect_clip_has_full_detail(self):
        clip = tools_read.inspect_clip(self.pid, "c1")
        self.assertEqual(clip["id"], "c1")
        self.assertIsNotNone(clip["reframe"])
        self.assertEqual(len(clip["reframe"]["keyframes"]), 1)
        self.assertIn("timeline_duration", clip)

    def test_inspect_clip_words(self):
        clip = tools_read.inspect_clip(self.pid, "t1")
        self.assertEqual(len(clip["words"]), 2)
        self.assertEqual(clip["words"][0]["text"], "hola")

    def test_inspect_unknown_clip_raises(self):
        with self.assertRaises(ValueError):
            tools_read.inspect_clip(self.pid, "nope")

    def test_list_media(self):
        projects.add_clips(self.pid, [
            ClipInfo(index=0, filename="a.mp4", url="/x", start=0.0, end=10.0,
                     label="Intro", origin="youtube", source="external"),
        ])
        projects.add_audio(self.pid, AudioInfo(
            id="a1", filename="v.m4a", url="/y", duration=30.0, label="Voz",
            engine="kokoro", origin="tts", source="generated"))
        projects.add_transcript(self.pid, Transcript(
            id="tr1", model="base", language="es", title="Guion",
            segments=[TranscriptSegment(start=0.0, end=1.0, text="hola")]))
        media = tools_read.list_media(self.pid)
        self.assertEqual(media["clips"][0]["label"], "Intro")
        self.assertEqual(media["clips"][0]["origin"], "youtube")
        self.assertEqual(media["audios"][0]["engine"], "kokoro")
        self.assertEqual(media["transcripts"][0]["segment_count"], 1)

    def test_unknown_project_raises(self):
        with self.assertRaises(ValueError):
            tools_read.get_timeline("noexiste")


if __name__ == "__main__":
    unittest.main()
