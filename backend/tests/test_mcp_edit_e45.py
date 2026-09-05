"""Etapa 4.5 — tools de edición nuevas + fetch_image (integración por apply_op)."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects, timeline_store
from app.mcp_server import registry, server, tools_edit, tools_media  # noqa: F401
from app.schemas import ImageInfo, Timeline, TimelineClip, TimelineTrack


def _timeline():
    return Timeline(
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips",
                            asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                            out_point=10.0, source_duration=10.0)],
    )


class EditE45Test(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, _timeline().model_dump())

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _clip(self, cid="v"):
        return next(c for c in projects.get_project(self.pid).timeline.clips if c.id == cid)

    def test_update_clip_opacity_persists(self):
        res = tools_edit.update_clip(self.pid, "v", {"opacity": 0.5})
        self.assertTrue(res["ok"])
        self.assertEqual(self._clip().opacity, 0.5)

    def test_update_clip_multi_prop_one_undo(self):
        # Varias propiedades en un patch → una sola entrada de historial.
        res = tools_edit.update_clip(self.pid, "v", {"opacity": 0.8, "position": "top"})
        self.assertTrue(res["ok"])
        self.assertEqual(self._clip().opacity, 0.8)
        self.assertEqual(self._clip().frame, "top")
        tools_edit.undo(self.pid)
        self.assertIsNone(self._clip().opacity)
        self.assertNotEqual(self._clip().frame, "top")

    def test_update_clip_unknown_key_raises(self):
        with self.assertRaises(ValueError):
            tools_edit.update_clip(self.pid, "v", {"kolor": "rojo"})

    def test_set_clip_effects_persists(self):
        tools_edit.set_clip_effects(self.pid, "v", {"blur": 4})
        self.assertEqual(self._clip().effects["blur"], 4)

    def test_set_clip_volume_persists(self):
        tools_edit.set_clip_volume(self.pid, "v", volume=0.25, muted=True)
        c = self._clip()
        self.assertAlmostEqual(c.volume, 0.25)
        self.assertTrue(c.muted)

    def test_rename_track_persists(self):
        res = tools_edit.rename_track(self.pid, "V1", "Principal")
        self.assertTrue(res["ok"])
        names = [t["name"] for t in res["timeline"]["tracks"]]
        self.assertIn("Principal", names)

    def test_add_shape_persists(self):
        res = tools_edit.add_shape(self.pid, shape={"type": "rect", "fill": "#00ff00"})
        shapes = [c for c in projects.get_project(self.pid).timeline.clips if c.kind == "shape"]
        self.assertEqual(len(shapes), 1)
        self.assertTrue(res["ok"])

    def test_add_sfx_creates_audio_clip(self):
        with patch("app.sfx.resolve", return_value=Path("x/whoosh.wav")), \
             patch("app.mcp_server.tools_edit._probe_duration", return_value=1.5):
            res = tools_edit.add_to_timeline(self.pid, "sfx", "whoosh/a.wav")
        self.assertTrue(res["ok"])
        tl = projects.get_project(self.pid).timeline
        sfxc = [c for c in tl.clips if c.asset_kind == "sfx"]
        self.assertEqual(len(sfxc), 1)
        self.assertEqual(sfxc[0].kind, "audio")
        self.assertEqual(sfxc[0].filename, "whoosh/a.wav")
        self.assertIn("audio", {t.kind for t in tl.tracks})

    def test_add_sfx_unknown_raises(self):
        with patch("app.sfx.resolve", return_value=None):
            with self.assertRaises(ValueError):
                tools_edit.add_to_timeline(self.pid, "sfx", "nope")

    def test_duplicate_clip_persists(self):
        tools_edit.duplicate_clip(self.pid, "v")
        clips = projects.get_project(self.pid).timeline.clips
        self.assertEqual(len(clips), 2)
        self.assertTrue(any(c.dup_of == "v" for c in clips))

    def test_undo_reverts_new_op(self):
        tools_edit.update_clip(self.pid, "v", {"opacity": 0.3})
        tools_edit.undo(self.pid)
        self.assertIsNone(self._clip().opacity)

    def test_animate_clip_persists(self):
        res = tools_edit.animate_clip(self.pid, "v", "spin_in", duration=0.4)
        self.assertTrue(res["ok"])
        kf = self._clip().keyframes
        self.assertTrue(kf["enabled"])
        self.assertGreater(kf["items"][0]["props"]["rotation"], 300)

    def test_animate_clip_follow_audio(self):
        tl = _timeline()
        tl.tracks.append(TimelineTrack(id="A1", kind="audio", name="SFX"))
        tl.clips.append(TimelineClip(
            id="sfx1", track_id="A1", kind="audio", asset_kind="sfx",
            asset_id="w", filename="whoosh.wav", start=0.0, in_point=0.0,
            out_point=1.0, source_duration=1.0,
        ))
        projects.save_timeline(self.pid, tl.model_dump())
        env = [(0.0, 0.0), (0.4, 1.0)]
        with patch("app.mcp_server.tools_edit._follow_audio_envelope", return_value=(env, [])):
            res = tools_edit.animate_clip(self.pid, "v", "slide_left", follow_audio_id="sfx1")
        self.assertTrue(res["ok"])
        x0 = self._clip().keyframes["items"][0]["props"]["x"]
        self.assertLess(x0, 0.0)


class FetchImageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Demo").id

    def tearDown(self):
        config.DATA_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_fetch_image_adds_to_project(self):
        info = ImageInfo(id="im1", filename="x.png", url="/i", width=100, height=50, label="X")
        with patch("app.images.fetch_image", return_value=("x.png", b"png")), \
             patch("app.images.import_image", return_value=info):
            out = tools_media.fetch_image(self.pid, "https://x/y.png")
        self.assertTrue(out["ok"])
        self.assertEqual(out["image"]["id"], "im1")

    def test_fetch_image_needs_url(self):
        with self.assertRaises(ValueError):
            tools_media.fetch_image(self.pid, "  ")


class RegistrationTest(unittest.TestCase):
    def test_new_tools_registered_as_write(self):
        specs = registry.registered()
        for name in ("update_clip", "set_clip_effects", "set_clip_audio_fx",
                     "set_clip_volume", "set_track_audio", "rename_track",
                     "set_clip_keyframes", "animate_clip", "duplicate_clip", "add_shape",
                     "link_tracks", "unlink_track", "fetch_image"):
            self.assertIn(name, specs)
            self.assertEqual(specs[name].access, "write")


if __name__ == "__main__":
    unittest.main()
