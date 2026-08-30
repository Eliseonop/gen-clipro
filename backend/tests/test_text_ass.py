import unittest

from app.schemas import TimelineClip
from app.text_ass import active_word_index, ass_bgr, ass_time, build_ass, caption_dialogues


class TextAssTest(unittest.TestCase):
    def test_word_index_matches_preview(self):
        self.assertEqual(active_word_index(4, -0.1, 2), -1)
        self.assertEqual(active_word_index(4, 0, 2), 0)
        self.assertEqual(active_word_index(4, 0.5, 2), 1)
        self.assertEqual(active_word_index(4, 2, 2), 3)

    def test_ass_color_is_bgr(self):
        self.assertEqual(ass_bgr("#ff3b5c"), "&H005C3BFF&")

    def test_ass_time(self):
        self.assertEqual(ass_time(0), "0:00:00.00")
        self.assertEqual(ass_time(65.5), "0:01:05.50")

    def test_karaoke_emits_one_event_per_word(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=1.0, in_point=0.0, out_point=2.0, source_duration=2.0,
            text="hola mundo",
            style={"theme": "karaoke", "word_fx": "glow", "color": "#ffffff", "highlight_color": "#ff3b5c"},
        )
        lines = caption_dialogues(clip, 720, 1280)
        self.assertEqual(len(lines), 2)
        self.assertIn("hola", lines[0])
        self.assertIn("mundo", lines[1])
        self.assertTrue(any("Dialogue:" in ln for ln in lines))

    def test_build_ass_includes_playres(self):
        clip = TimelineClip(
            id="c1", track_id="T1", kind="text", asset_kind="text", asset_id="t1",
            filename="", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
            text="hola",
            style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "highlight"},
        )
        doc = build_ass([clip], 720, 1280)
        self.assertIn("PlayResX: 720", doc)
        self.assertIn("PlayResY: 1280", doc)
        self.assertIn("Dialogue:", doc)


if __name__ == "__main__":
    unittest.main()
