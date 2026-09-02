import unittest

from app.clip_anim import clip_pose, interp_track
from app.schemas import TimelineClip


class ClipAnimTest(unittest.TestCase):
    def test_empty_uses_fallback(self):
        self.assertEqual(interp_track([], 1, 0.4), 0.4)

    def test_lerp_and_direct(self):
        track = [
            {"t": 0, "v": 0.2, "ease": "smooth"},
            {"t": 2, "v": 0.8, "ease": "smooth"},
            {"t": 4, "v": 0.1, "ease": "direct"},
        ]
        self.assertAlmostEqual(interp_track(track, 1, 0), 0.5)
        self.assertEqual(interp_track(track, 3, 0), 0.8)
        self.assertEqual(interp_track(track, 4, 0), 0.1)

    def test_shape_pose_keeps_static_y(self):
        clip = {
            "kind": "shape",
            "shape": {"x": 0.4, "y": 0.6, "rotation": 10, "opacity": 1},
            "anim": {"x": [{"t": 0, "v": 0.2}, {"t": 2, "v": 0.8}]},
        }
        p = clip_pose(clip, 1)
        self.assertAlmostEqual(p["x"], 0.5)
        self.assertEqual(p["y"], 0.6)

    def test_schema_acepta_anim(self):
        c = TimelineClip(
            id="c1", track_id="V2", kind="shape", asset_kind="shape",
            asset_id="arrow", filename="", start=0, in_point=0, out_point=5,
            source_duration=5,
            anim={"x": [{"t": 0, "v": 0.2}, {"t": 2, "v": 0.8}]},
        )
        self.assertEqual(c.anim["x"][0]["v"], 0.2)
        p = clip_pose(c, 1)
        self.assertAlmostEqual(p["x"], 0.5)

    def test_snapshot_keyframes(self):
        clip = {
            "kind": "shape",
            "shape": {"x": 0.2, "y": 0.4, "rotation": 0, "opacity": 1},
            "keyframes": {
                "enabled": True,
                "items": [
                    {"t": 0, "interpolation": "linear", "props": {"x": 0.2, "y": 0.4}},
                    {"t": 2, "interpolation": "linear", "props": {"x": 0.8, "y": 0.4}},
                ],
            },
        }
        p = clip_pose(clip, 1)
        self.assertAlmostEqual(p["x"], 0.5)

    def test_schema_acepta_keyframes(self):
        c = TimelineClip(
            id="c1", track_id="V1", kind="image", asset_kind="images",
            asset_id="1", filename="a.png", start=0, in_point=0, out_point=3,
            source_duration=3, opacity=0.8,
            keyframes={
                "enabled": True,
                "items": [
                    {"t": 0, "interpolation": "ease-in-out", "props": {"opacity": 0.2}},
                    {"t": 2, "interpolation": "linear", "props": {"opacity": 1}},
                ],
            },
        )
        self.assertEqual(c.opacity, 0.8)
        self.assertTrue(c.keyframes["enabled"])
        p = clip_pose(c, 1)
        self.assertAlmostEqual(p["opacity"], 0.6)


if __name__ == "__main__":
    unittest.main()
