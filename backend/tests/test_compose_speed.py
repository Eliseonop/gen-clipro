import unittest

from app.compose import _clip_duration
from app.schemas import TimelineClip


def _clip(**kw):
    base = dict(
        id="c1", track_id="V1", kind="video", asset_kind="clips",
        asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
        out_point=4.0, source_duration=4.0,
    )
    base.update(kw)
    return TimelineClip(**base)


class ComposeClipDurationTest(unittest.TestCase):
    def test_default_speed_keeps_source_length(self):
        self.assertEqual(_clip_duration(_clip()), 4.0)

    def test_speed_two_halves_timeline_duration(self):
        self.assertEqual(_clip_duration(_clip(speed=2)), 2.0)

    def test_text_speed_does_not_shrink(self):
        c = _clip(kind="text", asset_kind="text", asset_id="t", filename="", text="hola", speed=2)
        self.assertEqual(_clip_duration(c), 4.0)


if __name__ == "__main__":
    unittest.main()
