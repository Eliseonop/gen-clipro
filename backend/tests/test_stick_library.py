"""Sticks: colecciones con stick.json → menú "Agregar Stick" agrupado por expresión."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import stick_library


def _touch(p: Path):
    p.write_bytes(b"x")


class StickLibraryTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        # Stick con manifiesto.
        sci = self.root / "scientist_stick"
        sci.mkdir()
        _touch(sci / "Sad_wiping_tear.mp4")
        _touch(sci / "Happy_thumbs.mp4")
        _touch(sci / "Happy_laughing.jpeg")
        _touch(sci / "Mystery.png")           # sin expresión → otros
        _touch(sci / "ghost.mp4")             # NO está en el manifiesto
        (sci / "stick.json").write_text(json.dumps({
            "schema": "stick/1", "name": "Scientific", "emoji": "🔬", "order": 0,
            "chroma": {"color": "#00FF00"},
            "expressions": [
                {"id": "happy", "label": "Feliz", "emoji": "😄"},
                {"id": "sad", "label": "Triste", "emoji": "😢"},
                {"id": "otros", "label": "Otros", "emoji": "✨"},
            ],
            "items": [
                {"file": "Sad_wiping_tear.mp4", "kind": "video", "expression": "sad", "title": "Limpiando lágrima"},
                {"file": "Happy_thumbs.mp4", "kind": "video", "expression": "happy", "title": "Pulgar arriba"},
                {"file": "Happy_laughing.jpeg", "kind": "image", "expression": "happy", "title": "Riendo"},
                {"file": "Mystery.png", "kind": "image", "expression": "otros", "title": "Misterio"},
                {"file": "missing.mp4", "kind": "video", "expression": "sad", "title": "No existe"},
            ],
        }, ensure_ascii=False), encoding="utf-8")
        # Colección normal SIN manifiesto → no es stick.
        fondos = self.root / "fondos"
        fondos.mkdir()
        _touch(fondos / "bg.jpg")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_list_solo_carpetas_con_manifiesto(self):
        with patch("app.collections.get_root", return_value=self.root):
            out = stick_library.list_sticks()
        self.assertTrue(out["available"])
        self.assertEqual([s["id"] for s in out["sticks"]], ["scientist_stick"])
        s = out["sticks"][0]
        self.assertEqual(s["name"], "Scientific")
        self.assertEqual(s["order"], 0)
        self.assertEqual(s["kinds"], {"video": 2, "image": 2})

    def test_detail_agrupa_por_expresion_en_orden(self):
        with patch("app.collections.get_root", return_value=self.root):
            d = stick_library.stick_detail("scientist_stick")
        self.assertEqual(d["chroma_color"], "#00FF00")
        # Vídeo: happy antes que sad (orden de la taxonomía); "missing.mp4" se ignora.
        self.assertEqual([g["id"] for g in d["video"]], ["happy", "sad"])
        happy = d["video"][0]
        self.assertEqual(happy["label"], "Feliz")
        self.assertEqual(len(happy["items"]), 1)
        card = happy["items"][0]
        self.assertEqual(card["title"], "Pulgar arriba")
        self.assertEqual(card["expression"], "happy")
        self.assertEqual(card["chroma_color"], "#00FF00")
        self.assertTrue(card["id"].startswith("col_scientist_stick/"))
        self.assertIn("/api/collections/file/", card["url"])
        # Imagen: happy + otros.
        self.assertEqual([g["id"] for g in d["image"]], ["happy", "otros"])

    def test_detail_stick_inexistente(self):
        with patch("app.collections.get_root", return_value=self.root):
            with self.assertRaises(LookupError):
                stick_library.stick_detail("no_existe")


if __name__ == "__main__":
    unittest.main()
