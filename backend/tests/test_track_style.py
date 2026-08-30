import unittest

from app.schemas import Timeline, TimelineTrack


class TrackStylePersistTest(unittest.TestCase):
    def test_text_track_keeps_theme_style(self):
        tl = Timeline.model_validate({
            "tracks": [{
                "id": "T1",
                "kind": "text",
                "name": "T1",
                "style": {"theme": "karaoke", "color": "#ffffff", "highlight_color": "#ff3b5c"},
            }],
            "clips": [],
        })
        dumped = tl.model_dump()
        self.assertEqual(dumped["tracks"][0]["style"]["theme"], "karaoke")
        self.assertEqual(dumped["tracks"][0]["style"]["highlight_color"], "#ff3b5c")


if __name__ == "__main__":
    unittest.main()
