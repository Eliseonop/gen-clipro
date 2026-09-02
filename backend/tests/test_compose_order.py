import unittest

from app.compose import overlay_order
from app.schemas import TimelineClip


def _clip(id, track_id, start, kind="image"):
    return TimelineClip(
        id=id, track_id=track_id, kind=kind, asset_kind="images",
        asset_id="0", filename="a.png", start=start, in_point=0.0,
        out_point=2.0, source_duration=2.0,
    )


class OverlayOrderTest(unittest.TestCase):
    def test_same_track_uses_list_order_not_start(self):
        clips = [
            _clip("back", "V1", start=5.0),
            _clip("front", "V1", start=0.0, kind="shape"),
        ]
        self.assertEqual(overlay_order(clips, ["V1"]), ["back", "front"])

    def test_upper_track_stays_in_front(self):
        clips = [
            _clip("top", "V2", start=0.0),
            _clip("bot", "V1", start=0.0),
        ]
        self.assertEqual(overlay_order(clips, ["V1", "V2"]), ["bot", "top"])


if __name__ == "__main__":
    unittest.main()
