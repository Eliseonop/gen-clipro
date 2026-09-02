"""Velocidad de clip (constante, tono, reverse) para preview/export."""
import unittest

from app.clip_speed import (
    SPEED_MAX,
    atempo_chain,
    audio_speed_filters,
    clip_source_duration,
    clip_speed,
    clip_timeline_duration,
    video_speed_filters,
)


class ClipSpeedTest(unittest.TestCase):
    def test_timeline_duration_is_source_over_speed(self):
        clip = {"kind": "video", "in_point": 2, "out_point": 6, "speed": 2}
        self.assertEqual(clip_source_duration(clip), 4)
        self.assertEqual(clip_timeline_duration(clip), 2)
        self.assertEqual(clip_speed(clip), 2)

    def test_text_ignores_speed(self):
        clip = {"kind": "text", "in_point": 0, "out_point": 4, "speed": 4}
        self.assertEqual(clip_speed(clip), 1)
        self.assertEqual(clip_timeline_duration(clip), 4)

    def test_image_ignores_speed(self):
        clip = {"kind": "image", "in_point": 0, "out_point": 5, "speed": 2}
        self.assertEqual(clip_speed(clip), 1)
        self.assertEqual(clip_timeline_duration(clip), 5)

    def test_missing_or_invalid_speed_is_one(self):
        self.assertEqual(clip_speed({"kind": "video"}), 1)
        self.assertEqual(clip_speed({"kind": "audio", "speed": 0}), 1)
        self.assertEqual(clip_speed({"kind": "video", "speed": 99}), SPEED_MAX)

    def test_atempo_chain_splits_outside_0_5_2(self):
        self.assertEqual(atempo_chain(4), "atempo=2.0,atempo=2.00000")
        self.assertIn("atempo=0.5", atempo_chain(0.25))

    def test_video_filters_reverse_and_speed(self):
        g = video_speed_filters({"kind": "video", "speed": 2, "reverse": True})
        self.assertIn("reverse", g)
        self.assertIn("setpts=PTS/2", g)

    def test_audio_keeps_pitch_by_default(self):
        g = audio_speed_filters({"kind": "audio", "speed": 2})
        self.assertIn("atempo=", g)
        self.assertNotIn("asetrate", g)

    def test_audio_keep_pitch_uses_atempo(self):
        g = audio_speed_filters({"kind": "audio", "speed": 2, "keep_pitch": True})
        self.assertIn("atempo=", g)
        self.assertNotIn("asetrate", g)

    def test_audio_without_keep_pitch_uses_asetrate(self):
        g = audio_speed_filters({"kind": "audio", "speed": 2, "keep_pitch": False})
        self.assertIn("asetrate=48000*2", g)
        self.assertNotIn("atempo", g)
        self.assertNotIn("asetrate=sample_rate", g)


if __name__ == "__main__":
    unittest.main()
