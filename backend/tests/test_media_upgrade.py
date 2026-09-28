"""Subir calidad: detectar otras versiones del mismo vídeo y cambiarlas en la timeline."""
import shutil
import tempfile
import unittest
from pathlib import Path
import unittest.mock
from unittest.mock import patch

from app import config, media_upgrade, projects, timeline_ops, timeline_store
from app.schemas import ClipInfo, Reframe, Timeline

YT = "https://www.youtube.com/watch?v=abc"

# (ancho, alto) de cada archivo: _dims se simula (no hay vídeos reales).
DIMS = {
    "tramo.mp4": (1920, 1080),   # tramo guardado desde el Clip Editor (12 s → 27 s)
    "low.mp4": (854, 480),       # vídeo completo en 480p
    "baked.mp4": (720, 1280),    # recorte 9:16 horneado: otra imagen
    "other.mp4": (1920, 1080),   # otro vídeo de YouTube
    "hq.mp4": (3840, 2160),      # el bueno: vídeo completo en 4K
}


def _clip(index, filename, start, end, **kw):
    return ClipInfo(index=index, id=str(index), filename=filename,
                    url=f"/api/media/p/video/{filename}", start=start, end=end, **kw)


class MediaUpgradeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (projects._FILE, config.DATA_DIR, timeline_store.HISTORY_DIR)
        projects._FILE = self.tmp / "projects.json"
        config.DATA_DIR = self.tmp
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("A").id
        projects.set_folder(self.pid, str(self.tmp / "proj"))
        projects.add_clips(self.pid, [
            _clip(1, "tramo.mp4", 12.0, 27.0, origin="youtube", source_url=YT,
                  reframe=Reframe(master=True)),
            _clip(2, "low.mp4", 0.0, 100.0, origin="youtube", provider="youtube",
                  external_id="abc", source_url=YT),
            _clip(3, "low.mp4", 30.0, 40.0, in_point=30.0, out_point=40.0, parent_id="2",
                  source_url=YT),
            _clip(4, "baked.mp4", 50.0, 60.0, origin="youtube", source_url=YT),
            _clip(5, "other.mp4", 0.0, 50.0, origin="youtube", provider="youtube",
                  external_id="zzz", source_url="https://youtu.be/zzz"),
            _clip(6, "hq.mp4", 0.0, 100.0, origin="youtube", provider="youtube",
                  external_id="abc", source_url=YT),
        ])
        tl = {
            "tracks": [{"id": "v1", "kind": "video", "name": "V1"}],
            "clips": [
                self._tl("c1", "1", "tramo.mp4", 0, 2.0, 5.0, 15.0,
                         reframe={"zoom": 0.5, "keyframes": [{"t": 2.5, "cx": 0.3}]},
                         beats={"times": [3.0]},
                         bg_removal={"enabled": True, "mode": "auto",
                                     "auto": {"enabled": True, "provider": "sam21_tiny",
                                              "base_key": "k", "status": "ready",
                                              "edits": [{"op": "keep", "t": 3.0,
                                                         "points": [{"x": 0.5, "y": 0.5}]}]}}),
                self._tl("c2", "3", "low.mp4", 5, 30.0, 40.0, 100.0, ref_segment=True),
                self._tl("c3", "4", "baked.mp4", 15, 0.0, 5.0, 10.0),
                self._tl("c4", "5", "other.mp4", 20, 0.0, 5.0, 50.0),
            ],
        }
        projects.save_timeline(self.pid, Timeline(**tl).model_dump())
        self._dims = patch.object(media_upgrade, "_dims", lambda project, c: DIMS.get(c.filename, (0, 0)))
        self._dims.start()

    def tearDown(self):
        self._dims.stop()
        projects._FILE, config.DATA_DIR, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    @staticmethod
    def _tl(cid, asset_id, filename, start, a, b, dur, **kw):
        return {"id": cid, "track_id": "v1", "kind": "video", "asset_kind": "clips",
                "asset_id": asset_id, "filename": filename, "start": start,
                "in_point": a, "out_point": b, "source_duration": dur, **kw}

    def _clips(self):
        return {c.id: c for c in projects.get_project(self.pid).timeline.clips}

    def test_find_versions_detects_lower_same_video(self):
        info = media_upgrade.find_versions(self.pid, "6")
        self.assertEqual(info["material"]["youtube_id"], "abc")
        self.assertEqual(info["material"]["quality"], 2160)
        by = {v["index"]: v for v in info["versions"]}
        self.assertNotIn(5, by, "otro vídeo de YouTube")
        self.assertNotIn(3, by, "los segmentos van con su archivo")
        self.assertEqual({v["index"] for v in info["upgradable"]}, {1, 2})
        self.assertEqual(by[1]["offset"], 12.0)
        self.assertEqual(by[2]["timeline_uses"], 1)
        self.assertFalse(by[4]["compatible"])
        self.assertIn("proporción", by[4]["reason"])

    def test_replace_keeps_edit_and_shifts_file_times(self):
        res = media_upgrade.replace_with(self.pid, "6")
        self.assertEqual(sorted(res["changed"]), ["c1", "c2"])
        self.assertEqual(res["segments"], 1)
        cl = self._clips()
        c1 = cl["c1"]
        self.assertEqual((c1.filename, c1.asset_id), ("hq.mp4", "6"))
        # El tramo empezaba en el 12 s del original.
        self.assertEqual((c1.in_point, c1.out_point), (14.0, 17.0))
        self.assertEqual(c1.source_duration, 100.0)
        self.assertTrue(c1.ref_segment)
        self.assertEqual(c1.reframe.keyframes[0].t, 14.5)
        self.assertEqual(c1.reframe.keyframes[0].cx, 0.3)
        self.assertEqual(c1.beats["times"], [15.0])
        auto = c1.bg_removal["auto"]
        self.assertEqual((auto["base_key"], auto["status"]), ("", "idle"))
        self.assertEqual(auto["edits"][0]["t"], 15.0)
        self.assertEqual((cl["c2"].filename, cl["c2"].in_point, cl["c2"].out_point), ("hq.mp4", 30.0, 40.0))
        self.assertEqual(cl["c3"].filename, "baked.mp4")
        self.assertEqual(cl["c4"].filename, "other.mp4")
        # El segmento por referencia pasa al archivo nuevo.
        seg = next(c for c in projects.get_project(self.pid).clips if c.index == 3)
        self.assertEqual((seg.filename, seg.parent_id, seg.in_point), ("hq.mp4", "6", 30.0))
        # Deshacible.
        timeline_store.undo(self.pid)
        self.assertEqual(self._clips()["c1"].filename, "tramo.mp4")

    def test_explicit_incompatible_version_is_rejected(self):
        with self.assertRaises(ValueError):
            media_upgrade.replace_with(self.pid, "6", ["4"])

    def test_nothing_to_replace(self):
        res = media_upgrade.replace_with(self.pid, "5")
        self.assertEqual(res["replaced"], 0)
        self.assertTrue(res["warnings"])

    def test_youtube_sources_from_timeline(self):
        src = media_upgrade.youtube_sources(self.pid)
        self.assertEqual(set(src), {"abc", "zzz"})
        self.assertEqual(media_upgrade.youtube_sources(self.pid, YT), {"abc": YT})

    def test_best_full_version(self):
        clip, q = media_upgrade.best_full_version(self.pid, "abc")
        self.assertEqual((clip.index, q), (6, 2160))
        self.assertIsNone(media_upgrade.best_full_version(self.pid, "nope"))

    def _run_workflow(self, params, max_quality, download=None):
        from app import jobs, youtube_video
        info = {"formats": [{"format_id": "x", "format_note": f"{max_quality}p", "width": 16,
                             "height": max_quality, "vcodec": "vp9", "acodec": "none"}]}
        fail = AssertionError("no debía descargar")
        with patch.object(youtube_video, "fetch_info", lambda url: info), \
             patch.object(youtube_video, "download_to_project", download or unittest.mock.Mock(side_effect=fail)):
            job = jobs.create_job()
            jobs._run_upgrade_quality(job.id, self.pid, params)
        return jobs.get_job(job.id)

    def test_workflow_reuses_downloaded_hq(self):
        job = self._run_workflow({"url": YT}, 2160)
        self.assertEqual(job.status.value, "done", job.error)
        v = job.result["videos"][0]
        self.assertEqual((v["downloaded"], v["quality"], v["replaced"]), (False, 2160, 2))
        self.assertEqual(self._clips()["c1"].filename, "hq.mp4")

    def test_workflow_downloads_when_missing(self):
        def fake(project, url, quality, on_progress, info=None):
            clip = _clip(7, "other4k.mp4", 0.0, 50.0, origin="youtube", provider="youtube",
                         external_id="zzz", source_url=url)
            projects.add_clips(self.pid, [clip])
            return clip, 2160

        DIMS["other4k.mp4"] = (3840, 2160)
        job = self._run_workflow({"url": "https://youtu.be/zzz"}, 2160, download=fake)
        self.assertEqual(job.status.value, "done", job.error)
        v = job.result["videos"][0]
        self.assertEqual((v["downloaded"], v["replaced"]), (True, 1))
        self.assertEqual(self._clips()["c4"].filename, "other4k.mp4")


class FullFrameTest(unittest.TestCase):
    def test_saved_identity_reframe_is_full_frame(self):
        from app.schemas import Keyframe
        # «Guardar clip» sin mover nada: keyframes centrados a zoom 1, no master.
        rf = Reframe(zoom=1.0, keyframes=[Keyframe(t=0, cx=0.5, zoom=1.0), Keyframe(t=5, cx=0.5, zoom=1.0)])
        self.assertTrue(media_upgrade._full_frame(rf))
        self.assertTrue(media_upgrade._full_frame(None))
        self.assertFalse(media_upgrade._full_frame(Reframe(zoom=0.6)))
        self.assertFalse(media_upgrade._full_frame(Reframe(keyframes=[Keyframe(t=0, cx=0.3, zoom=0.5)])))
        self.assertFalse(media_upgrade._full_frame(Reframe(crop_w=0.5)))
        self.assertFalse(media_upgrade._full_frame(Reframe(dual_crop=True)))


class ReplaceMediaOpTest(unittest.TestCase):
    def test_clamps_to_new_duration_and_skips_library(self):
        tl = Timeline(tracks=[{"id": "v1", "kind": "video", "name": "V1"}], clips=[
            {"id": "a", "track_id": "v1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
             "filename": "old.mp4", "in_point": 0, "out_point": 10, "source_duration": 10},
            {"id": "b", "track_id": "v1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
             "filename": "old.mp4", "in_point": 0, "out_point": 3, "source_duration": 10,
             "start": 20, "asset_scope": "library"},
        ])
        res = timeline_ops.replace_media(tl, [{"filename": "old.mp4", "delta": 5}],
                                         {"asset_id": "9", "filename": "new.mp4", "duration": 12})
        a = next(c for c in res.timeline.clips if c.id == "a")
        self.assertEqual((a.in_point, a.out_point, a.filename), (5.0, 12.0, "new.mp4"))
        b = next(c for c in res.timeline.clips if c.id == "b")
        self.assertEqual(b.filename, "old.mp4")
        self.assertEqual(res.changed, ["a"])
        self.assertTrue(any("biblioteca" in w for w in res.warnings))
        self.assertEqual(timeline_ops.validate_timeline(res.timeline), [])
        # La entrada no se toca.
        self.assertEqual(tl.clips[0].filename, "old.mp4")


if __name__ == "__main__":
    unittest.main()
