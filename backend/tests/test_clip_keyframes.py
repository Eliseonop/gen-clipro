import unittest

from app.clip_keyframes import clip_props_at, clip_volume_at, volume_filter


class ClipVolumeKeyframesTest(unittest.TestCase):
    def test_static_volume(self):
        self.assertAlmostEqual(clip_volume_at({"kind": "audio", "volume": 0.5}, 0), 0.5)
        self.assertEqual(volume_filter({"kind": "audio", "volume": 0.5}), "volume=0.500")
        self.assertEqual(volume_filter({"kind": "video", "volume": 0.4}), "volume=0.400")

    def test_interpolates_volume_envelope(self):
        clip = {
            "kind": "audio",
            "volume": 1,
            "keyframes": {
                "enabled": True,
                "items": [
                    {"t": 0, "interpolation": "linear", "props": {"volume": 1}},
                    {"t": 3, "interpolation": "linear", "props": {"volume": 0.3}},
                    {"t": 5, "interpolation": "linear", "props": {"volume": 0.8}},
                ],
            },
        }
        self.assertAlmostEqual(clip_volume_at(clip, 0), 1.0)
        self.assertAlmostEqual(clip_volume_at(clip, 3), 0.3)
        self.assertAlmostEqual(clip_volume_at(clip, 1.5), 0.65)
        self.assertAlmostEqual(clip_volume_at(clip, 4), 0.55)
        filt = volume_filter(clip)
        self.assertIn("eval=frame", filt)
        self.assertIn("if(lt(t", filt)

    def test_interpolates_audio_fx_intensity(self):
        clip = {
            "kind": "audio",
            "audio_fx": {"reverb": 0},
            "keyframes": {
                "enabled": True,
                "items": [
                    {"t": 0, "interpolation": "linear", "props": {"reverb": 0}},
                    {"t": 2, "interpolation": "linear", "props": {"reverb": 1}},
                ],
            },
        }
        self.assertAlmostEqual(clip_props_at(clip, 1)["reverb"], 0.5)

    def test_constant_keyframes_use_static_filter(self):
        clip = {
            "kind": "audio",
            "volume": 0.8,
            "keyframes": {
                "enabled": True,
                "items": [
                    {"t": 0, "interpolation": "linear", "props": {"volume": 0.8}},
                    {"t": 2, "interpolation": "linear", "props": {"volume": 0.8}},
                ],
            },
        }
        self.assertEqual(volume_filter(clip), "volume=0.800")

    def test_apply_volume_fade(self):
        from app.clip_keyframes import apply_volume_fade, clip_volume_at
        faded = apply_volume_fade({"kind": "audio", "volume": 1}, 5, "in", 0.5)
        self.assertAlmostEqual(clip_volume_at(faded, 0), 0.0)
        self.assertAlmostEqual(clip_volume_at(faded, 0.5), 1.0)


if __name__ == "__main__":
    unittest.main()
