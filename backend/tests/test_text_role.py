import unittest

from app.schemas import TimelineClip
from app.text_role import resolve_text_role


class ResolveTextRoleTest(unittest.TestCase):
    def test_explicito(self):
        self.assertEqual(resolve_text_role({"kind": "text", "text_role": "free"}), "free")
        self.assertEqual(resolve_text_role({"kind": "text", "text_role": "caption"}), "caption")

    def test_infiere_caption_por_origin_o_words(self):
        self.assertEqual(resolve_text_role({"kind": "text", "origin": {"transcript_id": "tr"}}), "caption")
        self.assertEqual(resolve_text_role({
            "kind": "text", "words": [{"text": "hola", "start": 0, "end": 1}],
        }), "caption")

    def test_infiere_free_sin_marcadores(self):
        self.assertEqual(resolve_text_role({"kind": "text", "text": "marca", "words": []}), "free")

    def test_no_texto(self):
        self.assertIsNone(resolve_text_role(None))
        self.assertIsNone(resolve_text_role({"kind": "video"}))

    def test_modelo_pydantic(self):
        clip = TimelineClip(
            id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t",
            filename="", text="hola", text_role="free",
        )
        self.assertEqual(resolve_text_role(clip), "free")


if __name__ == "__main__":
    unittest.main()
