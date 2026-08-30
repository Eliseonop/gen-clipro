import unittest

from app.sfx import FAVORITES_CAT, filter_sfx_items, with_favorites_category


class SfxFavoritesFilterTest(unittest.TestCase):
    def setUp(self):
        self.items = [
            {"id": "a/one.mp3", "name": "one", "folder": "a", "category": "risas", "uso": ""},
            {"id": "b/two.mp3", "name": "two", "folder": "b", "category": "golpe", "uso": ""},
        ]

    def test_favoritos_keeps_starred_ids(self):
        out = filter_sfx_items(self.items, q="", category=FAVORITES_CAT, favorite_ids=["b/two.mp3"])
        self.assertEqual([it["id"] for it in out], ["b/two.mp3"])

    def test_empty_favorites_is_empty_list(self):
        out = filter_sfx_items(self.items, q="", category="favoritos", favorite_ids=[])
        self.assertEqual(out, [])

    def test_normal_category_still_matches_folder(self):
        out = filter_sfx_items(self.items, q="", category="golpe", favorite_ids=["a/one.mp3"])
        self.assertEqual([it["id"] for it in out], ["b/two.mp3"])

    def test_injects_favoritos_category_first(self):
        cats = with_favorites_category(
            [{"id": "risas", "label": "Risas", "count": 1}],
            self.items,
            ["a/one.mp3", "missing"],
        )
        self.assertEqual(cats[0]["id"], "favoritos")
        self.assertEqual(cats[0]["count"], 1)
        self.assertEqual(cats[1]["id"], "risas")


if __name__ == "__main__":
    unittest.main()
