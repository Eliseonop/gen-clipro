import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from app import settings, yt_history


class YtHistoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = settings._FILE
        settings._FILE = self.tmp / "settings.json"

    def tearDown(self):
        settings._FILE = self._old

    def test_record_prepends_and_dedupes_by_video_id(self):
        video = SimpleNamespace(id="abc123", title="Hola mundo")
        yt_history.record("https://youtu.be/abc123", video)
        yt_history.record("https://www.youtube.com/watch?v=abc123", video)
        items = settings.load().get("yt_history") or []
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["video_id"], "abc123")
        self.assertEqual(items[0]["title"], "Hola mundo")
        self.assertIn("watch?v=abc123", items[0]["url"])

    def test_record_caps_at_limit(self):
        for i in range(5):
            yt_history.record(f"https://youtu.be/id{i}", SimpleNamespace(id=f"id{i}", title=f"V{i}"), limit=3)
        items = settings.load()["yt_history"]
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["video_id"], "id4")
        self.assertEqual([x["video_id"] for x in items], ["id4", "id3", "id2"])

    def test_remove_by_video_id_or_url(self):
        yt_history.record("https://youtu.be/aaa", SimpleNamespace(id="aaa", title="A"))
        yt_history.record("https://youtu.be/bbb", SimpleNamespace(id="bbb", title="B"))
        yt_history.remove("aaa")
        items = settings.load()["yt_history"]
        self.assertEqual([x["video_id"] for x in items], ["bbb"])
        yt_history.remove("https://youtu.be/bbb")
        self.assertEqual(settings.load()["yt_history"], [])


if __name__ == "__main__":
    unittest.main()
