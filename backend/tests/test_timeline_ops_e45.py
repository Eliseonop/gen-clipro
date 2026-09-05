"""Etapa 4.5 — ops nuevas de propiedades por-clip / figuras (timeline_ops puro)."""
import unittest

from app import timeline_ops as ops
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _tl():
    return Timeline(
        width=720, height=1280, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                TimelineTrack(id="A1", kind="audio", name="A1"),
                TimelineTrack(id="T1", kind="text", name="T1")],
        clips=[
            TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips",
                         asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                         out_point=10.0, source_duration=10.0),
            TimelineClip(id="au", track_id="A1", kind="audio", asset_kind="audios",
                         asset_id="a1", filename="v.m4a", start=0.0, in_point=0.0,
                         out_point=8.0, source_duration=8.0),
            TimelineClip(id="t", track_id="T1", kind="text", asset_kind="text",
                         asset_id="x", filename="", start=0.0, in_point=0.0,
                         out_point=3.0, text="hola"),
        ],
    )


def _clip(res, cid):
    return next(c for c in res.timeline.clips if c.id == cid)


class PropertyOpsTest(unittest.TestCase):
    def test_opacity(self):
        r = ops.set_clip_opacity(_tl(), "v", 0.4)
        self.assertEqual(_clip(r, "v").opacity, 0.4)
        with self.assertRaises(ValueError):
            ops.set_clip_opacity(_tl(), "v", 1.5)

    def test_speed(self):
        r = ops.set_clip_speed(_tl(), "v", speed=2.0, keep_pitch=False, reverse=True)
        c = _clip(r, "v")
        self.assertEqual((c.speed, c.keep_pitch, c.reverse), (2.0, False, True))
        with self.assertRaises(ValueError):
            ops.set_clip_speed(_tl(), "t", speed=2.0)   # texto no
        with self.assertRaises(ValueError):
            ops.set_clip_speed(_tl(), "v", speed=99)     # fuera de rango

    def test_transition(self):
        r = ops.set_clip_transition(_tl(), "v", appear="dissolve", exit="wipe")
        c = _clip(r, "v")
        self.assertEqual((c.appear, c.exit), ("dissolve", "wipe"))
        with self.assertRaises(ValueError):
            ops.set_clip_transition(_tl(), "v", appear="teletransporte")

    def test_text_role(self):
        r = ops.set_text_role(_tl(), "t", "free")
        self.assertEqual(_clip(r, "t").text_role, "free")
        with self.assertRaises(ValueError):
            ops.set_text_role(_tl(), "v", "caption")   # no-texto
        with self.assertRaises(ValueError):
            ops.set_text_role(_tl(), "t", "otro")

    def test_update_clip_composes_multiple_props(self):
        r = ops.update_clip(_tl(), "v", {"opacity": 0.6, "speed": 1.5,
                                         "appear": "fade", "position": "bottom"})
        c = _clip(r, "v")
        self.assertEqual(c.opacity, 0.6)
        self.assertEqual(c.speed, 1.5)
        self.assertEqual(c.appear, "fade")
        self.assertEqual(c.frame, "bottom")
        self.assertEqual(r.changed, ["v"])

    def test_update_clip_role_on_text(self):
        r = ops.update_clip(_tl(), "t", {"role": "free"})
        self.assertEqual(_clip(r, "t").text_role, "free")

    def test_update_clip_validates(self):
        with self.assertRaises(ValueError):
            ops.update_clip(_tl(), "v", {})                    # patch vacío
        with self.assertRaises(ValueError):
            ops.update_clip(_tl(), "v", {"nope": 1})           # clave desconocida
        with self.assertRaises(ValueError):
            ops.update_clip(_tl(), "v", {"opacity": 5})        # rango inválido (sub-op)

    def test_effects_merge(self):
        tl = _tl()
        r1 = ops.set_clip_effects(tl, "v", {"blur": 3})
        r2 = ops.set_clip_effects(r1.timeline, "v", {"grayscale": True})
        eff = _clip(r2, "v").effects
        self.assertEqual(eff["blur"], 3)          # se conserva (merge)
        self.assertTrue(eff["grayscale"])
        r3 = ops.set_clip_effects(r2.timeline, "v", {"sepia": True}, replace=True)
        self.assertEqual(_clip(r3, "v").effects, {"sepia": True})
        with self.assertRaises(ValueError):
            ops.set_clip_effects(_tl(), "au", {"blur": 1})   # audio no es visual

    def test_audio_fx(self):
        r = ops.set_clip_audio_fx(_tl(), "au", {"reverb": 0.3})
        self.assertEqual(_clip(r, "au").audio_fx["reverb"], 0.3)
        with self.assertRaises(ValueError):
            ops.set_clip_audio_fx(_tl(), "t", {"reverb": 0.3})   # texto no

    def test_clip_volume_and_mute(self):
        r = ops.set_clip_volume(_tl(), "au", volume=0.4, muted=True)
        c = _clip(r, "au")
        self.assertAlmostEqual(c.volume, 0.4)
        self.assertTrue(c.muted)
        with self.assertRaises(ValueError):
            ops.set_clip_volume(_tl(), "t", volume=0.5)

    def test_clip_volume_fade_creates_keyframes(self):
        r = ops.set_clip_volume(_tl(), "au", fade="in")
        kf = _clip(r, "au").keyframes
        self.assertTrue(kf["enabled"])
        self.assertGreaterEqual(len(kf["items"]), 2)
        self.assertAlmostEqual(kf["items"][0]["props"]["volume"], 0.0)

    def test_track_audio_applies_to_all(self):
        r = ops.set_track_audio(_tl(), "A1", volume=0.2, muted=True)
        self.assertAlmostEqual(_clip(r, "au").volume, 0.2)
        self.assertTrue(_clip(r, "au").muted)

    def test_rename_track(self):
        r = ops.rename_track(_tl(), "A1", "SFX")
        t = next(x for x in r.timeline.tracks if x.id == "A1")
        self.assertEqual(t.name, "SFX")
        with self.assertRaises(ValueError):
            ops.rename_track(_tl(), "A1", "   ")

    def test_keyframes_set_and_clear(self):
        kf = {"enabled": True, "items": [{"id": "k1", "t": 0.0, "props": {"scale": 1.0}}]}
        r = ops.set_clip_keyframes(_tl(), "v", kf)
        self.assertTrue(_clip(r, "v").keyframes["enabled"])
        r2 = ops.set_clip_keyframes(r.timeline, "v", None)
        self.assertIsNone(_clip(r2, "v").keyframes)
        with self.assertRaises(ValueError):
            ops.set_clip_keyframes(_tl(), "v", {"items": "no-lista"})

    def test_animate_clip_spin_in(self):
        r = ops.animate_clip(_tl(), "v", "spin_in", duration=0.4)
        c = _clip(r, "v")
        self.assertTrue(c.keyframes["enabled"])
        self.assertGreaterEqual(len(c.keyframes["items"]), 2)
        self.assertGreater(c.keyframes["items"][0]["props"]["rotation"], 300)

    def test_animate_clip_zoom_in_writes_reframe(self):
        r = ops.animate_clip(_tl(), "v", "zoom_in", duration=0.5)
        c = _clip(r, "v")
        self.assertIsNotNone(c.reframe)
        self.assertGreaterEqual(len(c.reframe.keyframes), 2)
        self.assertGreater(c.reframe.keyframes[0].zoom, c.reframe.keyframes[1].zoom)

    def test_animate_clip_rejects_audio(self):
        with self.assertRaises(ValueError):
            ops.animate_clip(_tl(), "au", "fade_in")

    def test_animate_clip_envelope(self):
        env = [(0.0, 0.0), (0.3, 1.0)]
        r = ops.animate_clip(_tl(), "v", "slide_left", envelope=env)
        xs = [it["props"]["x"] for it in _clip(r, "v").keyframes["items"]]
        self.assertLess(xs[0], 0.0)
        self.assertAlmostEqual(xs[-1], 0.5, places=2)

    def test_duplicate(self):
        r = ops.duplicate_clip(_tl(), "v")
        self.assertEqual(len(r.timeline.clips), 4)
        dup = next(c for c in r.timeline.clips if c.id in r.changed)
        self.assertEqual(dup.dup_of, "v")
        self.assertNotEqual(dup.id, "v")


class ShapeOpTest(unittest.TestCase):
    def test_add_shape_creates_clip_on_video_track(self):
        r = ops.add_shape(_tl(), shape={"type": "rect", "fill": "#ff0000"})
        shape_clips = [c for c in r.timeline.clips if c.kind == "shape"]
        self.assertEqual(len(shape_clips), 1)
        self.assertEqual(shape_clips[0].track_id, "V1")   # reusa la pista de vídeo
        # estado válido (shape en pista de vídeo pasa validación)
        self.assertEqual(ops.validate_timeline(r.timeline), [])

    def test_add_shape_creates_track_when_none(self):
        empty = Timeline(tracks=[], clips=[])
        r = ops.add_shape(empty, shape={"type": "star"})
        self.assertEqual(len([t for t in r.timeline.tracks if t.kind == "video"]), 1)
        self.assertEqual(len([c for c in r.timeline.clips if c.kind == "shape"]), 1)

    def test_add_shape_rejects_non_video_track(self):
        with self.assertRaises(ValueError):
            ops.add_shape(_tl(), shape={"type": "rect"}, track_id="A1")


class LinkTracksTest(unittest.TestCase):
    def test_link_and_unlink(self):
        r = ops.link_tracks(_tl(), "A1", "T1")
        track = next(t for t in r.timeline.tracks if t.id == "A1")
        self.assertEqual(track.linked_track_id, "T1")
        r2 = ops.unlink_track(r.timeline, "A1")
        self.assertIsNone(next(t for t in r2.timeline.tracks if t.id == "A1").linked_track_id)

    def test_link_missing_target_raises(self):
        with self.assertRaises(ValueError):
            ops.link_tracks(_tl(), "A1", "NOPE")


class CapabilitiesTest(unittest.TestCase):
    def test_new_capabilities_present(self):
        from app.mcp_server import dto
        caps = dto.capabilities()
        for c in ("media.shape", "clip.opacity:0-1", "clip.effects:blur|grayscale|sepia|brightness|contrast|saturation",
                  "clip.keyframes:x|y|scale|rotation|opacity|volume|audio_fx", "voice:kokoro|piper|gemini", "tracks.link"):
            self.assertIn(c, caps)
        self.assertIn("clip.animate:zoom|spin|slide|fade|pop|pulse|follow_audio", caps)


if __name__ == "__main__":
    unittest.main()
