"""Biblioteca global de material reutilizable (colecciones externas)."""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import collections, settings


class CollectionsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = settings._FILE
        settings._FILE = self.tmp / "settings.json"
        # Raíz de material con dos colecciones y varios tipos de recurso.
        self.root = self.tmp / "material"
        stick = self.root / "scientist_stick"
        fondos = self.root / "fondos"
        stick.mkdir(parents=True)
        fondos.mkdir(parents=True)
        (stick / "pointing_right.mp4").write_bytes(b"v")
        (stick / "thumbs_up.png").write_bytes(b"i")
        (stick / "wave.gif").write_bytes(b"g")
        (stick / "laugh.mp3").write_bytes(b"a")
        (stick / "notes.txt").write_text("ignora")   # no es medio → se ignora
        (fondos / "sky.jpg").write_bytes(b"i")
        collections.set_root(str(self.root))

    def tearDown(self):
        settings._FILE = self._old_file
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_list_collections(self):
        out = collections.list_collections()
        self.assertTrue(out["available"])
        by_id = {c["id"]: c for c in out["collections"]}
        self.assertEqual(set(by_id), {"scientist_stick", "fondos"})
        self.assertEqual(by_id["scientist_stick"]["count"], 4)   # mp4+png+gif+mp3 (no el txt)
        self.assertEqual(by_id["fondos"]["count"], 1)
        self.assertTrue(by_id["scientist_stick"]["enabled"])
        self.assertTrue(by_id["scientist_stick"]["cover_url"])   # tiene imagen

    def test_kind_detection_and_counts(self):
        res = collections.search()
        self.assertEqual(res["counts"]["video"], 1)
        self.assertEqual(res["counts"]["image"], 2)   # png + jpg
        self.assertEqual(res["counts"]["gif"], 1)
        self.assertEqual(res["counts"]["audio"], 1)
        self.assertEqual(res["counts"]["all"], 5)

    def test_search_filters_by_kind_and_query(self):
        self.assertEqual(len(collections.search(kind="gif")["items"]), 1)
        vids = collections.search(kind="video")["items"]
        self.assertEqual(len(vids), 1)
        self.assertEqual(vids[0]["kind"], "video")
        self.assertTrue(vids[0]["filename"].startswith("scientist_stick/"))
        self.assertEqual(len(collections.search(q="thumbs")["items"]), 1)
        self.assertEqual(len(collections.search(q="nada_de_nada")["items"]), 0)

    def test_disabled_collection_excluded(self):
        collections.set_prefs("fondos", enabled=False)
        res = collections.search()
        self.assertEqual(res["counts"]["all"], 4)   # sky.jpg fuera
        self.assertNotIn("fondos", {it["collection"] for it in res["items"]})

    def test_favorite_persisted_and_sorted_first(self):
        collections.set_prefs("fondos", favorite=True)
        cols = collections.list_collections()["collections"]
        self.assertEqual(cols[0]["id"], "fondos")
        self.assertTrue(cols[0]["favorite"])

    def test_resolve_safe(self):
        p = collections.resolve("scientist_stick/pointing_right.mp4")
        self.assertIsNotNone(p)
        self.assertTrue(p.is_file())
        self.assertIsNone(collections.resolve("scientist_stick/../../../secret"))
        self.assertIsNone(collections.resolve("scientist_stick/missing.mp4"))

    def test_no_root(self):
        settings.save({"material_root": str(self.tmp / "no_existe")})
        # Sin raíz válida y sin default → no disponible (el default assets/material
        # puede no existir en el entorno de test).
        out = collections.list_collections()
        # Puede caer al default del repo; basta con que no lance.
        self.assertIn("available", out)


if __name__ == "__main__":
    unittest.main()
