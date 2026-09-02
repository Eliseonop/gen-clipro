import unittest

from app.clip_fx import FX_DUR, audio_fx_chain, clip_fx_at, effects_ffmpeg, look_ffmpeg, overlay_xy_for_fx, video_fx_chain
from app.schemas import TimelineClip


class ClipFxAtTest(unittest.TestCase):
    def test_missing_fields_are_identity(self):
        fx = clip_fx_at({}, 1, 4)
        self.assertEqual(fx["opacity"], 1)
        self.assertEqual(fx["scale"], 1)
        self.assertEqual(fx["tx"], 0)
        self.assertEqual(fx["ty"], 0)

    def test_fade_in_starts_transparent(self):
        clip = {"appear": "fade", "exit": "none"}
        self.assertEqual(clip_fx_at(clip, 0, 4)["opacity"], 0)
        self.assertEqual(clip_fx_at(clip, FX_DUR, 4)["opacity"], 1)
        self.assertAlmostEqual(clip_fx_at(clip, FX_DUR / 2, 4)["opacity"], 0.5)

    def test_fade_out_independent_of_appear(self):
        clip = {"appear": "none", "exit": "fade"}
        self.assertEqual(clip_fx_at(clip, 2, 4)["opacity"], 1)
        self.assertEqual(clip_fx_at(clip, 4, 4)["opacity"], 0)

    def test_zoom_in_starts_scaled_up(self):
        clip = {"appear": "zoom"}
        self.assertGreater(clip_fx_at(clip, 0, 4)["scale"], 1.1)
        self.assertEqual(clip_fx_at(clip, FX_DUR, 4)["scale"], 1)

    def test_slide_left_enters_from_right(self):
        clip = {"appear": "slide_left"}
        self.assertEqual(clip_fx_at(clip, 0, 4)["tx"], 1)
        self.assertEqual(clip_fx_at(clip, FX_DUR, 4)["tx"], 0)

    def test_short_clip_windows_do_not_overlap(self):
        clip = {"appear": "fade", "exit": "fade"}
        self.assertEqual(clip_fx_at(clip, 0, 0.5)["opacity"], 0)
        self.assertEqual(clip_fx_at(clip, 0.25, 0.5)["opacity"], 1)
        self.assertEqual(clip_fx_at(clip, 0.5, 0.5)["opacity"], 0)


class ClipFxFfmpegTest(unittest.TestCase):
    def test_none_adds_no_chain(self):
        self.assertEqual(video_fx_chain({"appear": "none", "exit": "none", "look": "none"}, 4, 720, 1280), "")

    def test_fade_in_uses_alpha_fade(self):
        chain = video_fx_chain({"appear": "fade"}, 4, 720, 1280)
        self.assertIn("fade=t=in", chain)
        self.assertIn("alpha=1", chain)

    def test_bw_look_desaturates(self):
        filt = look_ffmpeg("bw")
        self.assertTrue("hue=s=0" in filt or "colorchannelmixer" in filt)

    def test_slide_offsets_overlay_x(self):
        xy = overlay_xy_for_fx("x=0:y=0", {"appear": "slide_left"}, 1.0, 4.0, 720, 1280)
        self.assertIn("x=", xy)
        self.assertIn("720", xy)


class TimelineClipFxFieldsTest(unittest.TestCase):
    def test_old_clips_default_to_none(self):
        c = TimelineClip(
            id="c1", track_id="V1", kind="video", asset_kind="clips",
            asset_id="1", filename="a.mp4",
        )
        self.assertEqual(c.appear, "none")
        self.assertEqual(c.exit, "none")
        self.assertEqual(c.look, "none")
        self.assertEqual(c.frame, "full")
        self.assertIsNone(c.effects)
        self.assertIsNone(c.audio_fx)


class ClipEffectsTest(unittest.TestCase):
    def test_blur_and_grayscale_in_ffmpeg(self):
        chain = effects_ffmpeg({"effects": {"blur": 2, "grayscale": True}}, 720, 1280)
        self.assertIn("gblur", chain)
        self.assertIn("hue=s=0", chain)

    def test_audio_echo_filter(self):
        chain = audio_fx_chain({"audio_fx": {"echo": True}})
        self.assertIn("aecho", chain)

    def test_dissolve_uses_alpha_fade(self):
        chain = video_fx_chain({"appear": "dissolve"}, 4, 720, 1280)
        self.assertIn("fade=t=in", chain)


if __name__ == "__main__":
    unittest.main()
