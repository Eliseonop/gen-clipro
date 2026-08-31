"""Tools de EDICIÓN del MCP: wrappers semánticos sobre timeline_store."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.mcp_server import registry, server, tools_edit  # noqa: F401 (server puebla el registro)
from app.schemas import AudioInfo, ClipInfo


class EditToolsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = projects._FILE
        self._old_hist = timeline_store.HISTORY_DIR
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.add_clips(self.pid, [
            ClipInfo(index=0, filename="a.mp4", url="/x", start=0.0, end=10.0, label="Intro"),
            ClipInfo(index=1, filename="b.mp4", url="/y", start=0.0, end=6.0, label="B"),
        ])
        projects.add_audio(self.pid, AudioInfo(
            id="a1", filename="v.m4a", url="/z", duration=8.0, label="Voz"))

    def tearDown(self):
        config.DATA_DIR = self._old_data
        projects._FILE = self._old_file
        timeline_store.HISTORY_DIR = self._old_hist
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _add_clip0(self):
        res = tools_edit.add_to_timeline(self.pid, "clips", "0")
        return res, res["changed"][-1]

    def test_add_to_timeline_creates_track_and_clip(self):
        res, clip_id = self._add_clip0()
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["timeline"]["clips"]), 1)
        self.assertEqual(len(res["timeline"]["tracks"]), 1)
        self.assertEqual(res["timeline"]["tracks"][0]["kind"], "video")
        self.assertTrue(res["can_undo"])

    def test_second_video_clip_reuses_track(self):
        self._add_clip0()
        res = tools_edit.add_to_timeline(self.pid, "clips", "1", start=10.0)
        self.assertEqual(len(res["timeline"]["tracks"]), 1)   # no crea otra pista
        self.assertEqual(len(res["timeline"]["clips"]), 2)

    def test_add_audio_creates_audio_track(self):
        self._add_clip0()
        res = tools_edit.add_to_timeline(self.pid, "audios", "a1")
        kinds = {t["kind"] for t in res["timeline"]["tracks"]}
        self.assertEqual(kinds, {"video", "audio"})

    def test_add_unknown_asset_raises(self):
        with self.assertRaises(ValueError):
            tools_edit.add_to_timeline(self.pid, "clips", "99")

    def test_move_clip(self):
        _, cid = self._add_clip0()
        res = tools_edit.move_clip(self.pid, cid, start=5.0)
        clip = res["timeline"]["clips"][0]
        self.assertEqual(clip["start"], 5.0)

    def test_split_clip(self):
        _, cid = self._add_clip0()
        res = tools_edit.split_clip(self.pid, cid, at_time=4.0)
        self.assertEqual(len(res["timeline"]["clips"]), 2)

    def test_set_clip_layout_position(self):
        _, cid = self._add_clip0()
        res = tools_edit.set_clip_layout(self.pid, cid, position="top")
        self.assertEqual(res["timeline"]["clips"][0]["frame"], "top")

    def test_set_clip_layout_invalid_position_raises(self):
        _, cid = self._add_clip0()
        with self.assertRaises(ValueError):
            tools_edit.set_clip_layout(self.pid, cid, position="diagonal")

    def test_reframe_clip_manual(self):
        _, cid = self._add_clip0()
        res = tools_edit.reframe_clip(self.pid, cid, mode="manual", zoom=0.7,
                                      pan_from={"cx": 0.3, "cy": 0.5})
        self.assertTrue(res["timeline"]["clips"][0]["has_reframe"])

    def test_remove_clip_then_undo_restores(self):
        _, cid = self._add_clip0()
        res = tools_edit.remove_clip(self.pid, cid)
        self.assertEqual(len(res["timeline"]["clips"]), 0)
        res2 = tools_edit.undo(self.pid)
        self.assertEqual(len(res2["timeline"]["clips"]), 1)

    def test_redo_after_undo(self):
        _, cid = self._add_clip0()
        tools_edit.remove_clip(self.pid, cid)
        tools_edit.undo(self.pid)
        res = tools_edit.redo(self.pid)
        self.assertEqual(len(res["timeline"]["clips"]), 0)

    def test_set_project_format(self):
        self._add_clip0()
        res = tools_edit.set_project_format(self.pid, aspect="1:1")
        self.assertEqual(res["timeline"]["format"]["aspect"], "1:1")

    def test_add_and_remove_track(self):
        r1 = tools_edit.add_track(self.pid, "text", name="Subs")
        tid = r1["changed"][0]
        self.assertEqual(len(r1["timeline"]["tracks"]), 1)
        r2 = tools_edit.remove_track(self.pid, tid)
        self.assertEqual(len(r2["timeline"]["tracks"]), 0)

    def test_checkpoint_and_restore(self):
        self._add_clip0()
        tools_edit.checkpoint(self.pid, "uno")
        tools_edit.add_to_timeline(self.pid, "clips", "1", start=10.0)  # estado con 2 clips
        res = tools_edit.restore_checkpoint(self.pid, "uno")
        self.assertEqual(len(res["timeline"]["clips"]), 1)

    def test_add_subtitles_from_segments(self):
        _, cid = self._add_clip0()
        segments = [{"start": 0.0, "end": 2.0, "text": "hola mundo",
                     "words": [{"text": "hola", "start": 0.0, "end": 0.5},
                               {"text": "mundo", "start": 0.6, "end": 1.0}]}]
        res = tools_edit.add_subtitles(self.pid, cid, segments)
        text_clips = [c for c in res["timeline"]["clips"] if c["kind"] == "text"]
        self.assertGreaterEqual(len(text_clips), 1)


class EditPolicyTest(unittest.TestCase):
    def test_access_levels(self):
        specs = registry.registered()
        self.assertEqual(specs["remove_clip"].access, "destructive")
        self.assertEqual(specs["remove_track"].access, "destructive")
        self.assertEqual(specs["add_to_timeline"].access, "write")
        self.assertEqual(specs["undo"].access, "write")


if __name__ == "__main__":
    unittest.main()
