"""Adaptador stateful: apply_op / undo / redo / checkpoints sobre un proyecto real
(en un directorio temporal, sin tocar los datos del usuario)."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import projects, timeline_store
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _base_timeline():
    return Timeline(
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[TimelineClip(id="c1", track_id="V1", kind="video", asset_kind="clips",
                            asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                            out_point=5.0, source_duration=10.0)],
    )


class TimelineStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_hist = timeline_store.HISTORY_DIR
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("test").id
        projects.save_timeline(self.pid, _base_timeline().model_dump())

    def tearDown(self):
        projects._FILE = self._old_file
        timeline_store.HISTORY_DIR = self._old_hist
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _add_clip(self):
        return timeline_store.apply_op(self.pid, "add_clip", {"clip": {
            "track_id": "V1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
            "filename": "b.mp4", "start": 6.0, "in_point": 0.0, "out_point": 3.0, "source_duration": 3.0}})

    def test_apply_persiste_y_reporta(self):
        r = self._add_clip()
        self.assertEqual(len(r["timeline"]["clips"]), 2)
        self.assertEqual(len(r["changed"]), 1)
        self.assertTrue(r["can_undo"])
        # persistido de verdad
        self.assertEqual(len(projects.get_project(self.pid).timeline.clips), 2)

    def test_undo_y_redo(self):
        self._add_clip()
        u = timeline_store.undo(self.pid)
        self.assertEqual(len(u["timeline"]["clips"]), 1)      # volvió al estado previo
        self.assertTrue(u["can_redo"])
        r = timeline_store.redo(self.pid)
        self.assertEqual(len(r["timeline"]["clips"]), 2)

    def test_op_desconocida(self):
        with self.assertRaises(ValueError):
            timeline_store.apply_op(self.pid, "explota", {})

    def test_precondicion_invalida_no_persiste(self):
        with self.assertRaises(ValueError):
            timeline_store.apply_op(self.pid, "add_clip", {"clip": {
                "track_id": "ZZ", "kind": "video", "asset_kind": "clips", "asset_id": "9",
                "filename": "x.mp4", "out_point": 2.0, "source_duration": 2.0}})
        self.assertEqual(len(projects.get_project(self.pid).timeline.clips), 1)   # intacto

    def test_checkpoint_restore(self):
        timeline_store.checkpoint(self.pid, "cp1")
        self._add_clip()
        self.assertEqual(len(projects.get_project(self.pid).timeline.clips), 2)
        res = timeline_store.restore_checkpoint(self.pid, "cp1")
        self.assertEqual(len(res["timeline"]["clips"]), 1)   # volvió al checkpoint

    def test_add_subtitles_end_to_end(self):
        r = timeline_store.apply_op(self.pid, "add_subtitles", {
            "source_clip_id": "c1",
            "segments": [{"start": 0, "end": 5, "text": "uno dos tres cuatro",
                          "words": [{"text": "uno", "start": 0.0, "end": 1.0},
                                    {"text": "dos", "start": 1.0, "end": 2.0},
                                    {"text": "tres", "start": 3.0, "end": 4.0},
                                    {"text": "cuatro", "start": 4.0, "end": 5.0}]}],
            "style": {"max_words": 2}, "transcript_id": "tr1"})
        text_clips = [c for c in r["timeline"]["clips"] if c["kind"] == "text"]
        self.assertEqual(len(text_clips), 2)
        self.assertTrue(text_clips[0]["words"])            # words[] persisten
        self.assertEqual(text_clips[0]["origin"]["transcript_id"], "tr1")


if __name__ == "__main__":
    unittest.main()
