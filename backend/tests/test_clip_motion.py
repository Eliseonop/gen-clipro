"""Presets de animate_clip (keyframe generation, sin ffmpeg)."""
import unittest

from app import clip_motion as m
from app.schemas import TimelineClip


def _clip(**kw):
    data = dict(
        id="v", track_id="V1", kind="video", asset_kind="clips",
        asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
        out_point=4.0, source_duration=4.0,
    )
    data.update(kw)
    return TimelineClip(**data)


class MotionNormalizeTest(unittest.TestCase):
    def test_aliases(self):
        self.assertEqual(m.normalize_motion("zoom"), "zoom_in")
        self.assertEqual(m.normalize_motion("slide-left"), "slide_left")
        with self.assertRaises(ValueError):
            m.normalize_motion("teletransporte")


class BuildItemsTest(unittest.TestCase):
    def test_zoom_in_fill_uses_zoom_not_scale(self):
        items = m.build_motion_items(_clip(), "zoom_in", duration=0.5)
        self.assertGreaterEqual(len(items), 2)
        z0 = items[0]["props"]["zoom"]
        z1 = items[1]["props"]["zoom"]
        self.assertAlmostEqual(z0, 1.0, places=2)
        self.assertLess(z1, z0)
        self.assertAlmostEqual(items[0]["props"]["scale"], 1.0, places=2)

    def test_zoom_in_overlay_uses_scale(self):
        items = m.build_motion_items(_clip(layout="overlay"), "zoom_in", duration=0.5)
        self.assertLess(items[0]["props"]["scale"], items[1]["props"]["scale"])

    def test_spin_in_starts_rotated_and_hidden(self):
        items = m.build_motion_items(_clip(), "spin_in", duration=0.4, turns=1)
        self.assertGreater(items[0]["props"]["rotation"], 300)
        self.assertLess(items[0]["props"]["opacity"], 0.05)
        self.assertAlmostEqual(items[1]["props"]["rotation"], 0.0, places=1)
        self.assertGreater(items[1]["props"]["opacity"], 0.9)

    def test_slide_left_starts_offscreen(self):
        items = m.build_motion_items(_clip(), "slide_left")
        self.assertLess(items[0]["props"]["x"], 0.0)
        self.assertAlmostEqual(items[1]["props"]["x"], 0.5, places=2)

    def test_envelope_drives_opacity(self):
        env = [(0.0, 0.0), (0.2, 0.4), (0.5, 1.0)]
        items = m.build_motion_items(_clip(), "fade_in", envelope=env)
        self.assertAlmostEqual(items[0]["props"]["opacity"], 0.0, places=2)
        self.assertAlmostEqual(items[-1]["props"]["opacity"], 1.0, places=2)
        self.assertGreaterEqual(len(items), 3)

    def test_appear_holds_after_sfx_peak(self):
        env = [(0.0, 0.0), (0.2, 1.0), (0.5, 0.0), (1.0, 0.0)]
        items = m.build_motion_items(_clip(), "slide_left", envelope=env)
        self.assertLess(items[0]["props"]["x"], 0.0)
        self.assertAlmostEqual(items[-1]["props"]["x"], 0.5, places=2)
        self.assertGreater(items[-1]["props"]["opacity"], 0.9)

    def test_downsample(self):
        pts = [(i / 100, i / 100) for i in range(100)]
        out = m.downsample_envelope(pts, max_n=10)
        self.assertEqual(len(out), 10)
        self.assertEqual(out[0][0], 0.0)
        self.assertAlmostEqual(out[-1][0], 0.99, places=2)


class OverlapTest(unittest.TestCase):
    def test_overlap_window(self):
        v = _clip(start=1.0, out_point=4.0)  # 1 → 5
        a = _clip(id="s", kind="audio", asset_kind="sfx", start=2.0, out_point=5.0)  # 2 → 7
        lo, hi = m.overlap_window(v, a)
        self.assertAlmostEqual(lo, 2.0)
        self.assertAlmostEqual(hi, 5.0)

    def test_no_overlap(self):
        v = _clip(start=0.0, out_point=1.0)
        a = _clip(id="s", kind="audio", asset_kind="sfx", start=8.0, out_point=9.0)
        self.assertIsNone(m.overlap_window(v, a))


if __name__ == "__main__":
    unittest.main()
