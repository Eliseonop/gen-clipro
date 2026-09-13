"""Biblioteca de letras: catálogo, fallback por nombre de archivo y rutas seguras."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import letters


class LettersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        letters._cache.update(key=None, data=None)
        self._p = patch.object(letters.config, "LETTERS_DIR", self.tmp)
        self._p.start()

    def tearDown(self):
        self._p.stop()
        letters._cache.update(key=None, data=None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _png(self, name, w=30, h=40):
        ihdr = b"\x00\x00\x00\rIHDR" + w.to_bytes(4, "big") + h.to_bytes(4, "big")
        (self.tmp / name).write_bytes(letters._PNG_MAGIC + ihdr)

    def test_sin_carpeta_no_disponible(self):
        with patch.object(letters.config, "LETTERS_DIR", self.tmp / "nope"):
            self.assertEqual(letters.library(), {"available": False, "styles": [], "glyphs": []})

    def test_tokens(self):
        self.assertEqual(letters.token_to_char("A"), "A")
        self.assertEqual(letters.token_to_char("mA"), "a")
        self.assertEqual(letters.token_to_char("7"), "7")
        self.assertEqual(letters.token_to_char("sQST"), "?")
        self.assertIsNone(letters.token_to_char("sZZZ"))

    def test_fallback_por_nombre(self):
        for n in ("REASON01_A_00001.png", "REASON01_mA_00002.png", "LEGACY_7_00003.png",
                  "LEGACY_sEXC_00004.png", "basura.png", "REASON01_xx_00005.png"):
            self._png(n)
        lib = letters.library()
        self.assertTrue(lib["available"])
        self.assertEqual(lib["styles"], ["LEGACY", "REASON01"])
        chars = sorted(g["char"] for g in lib["glyphs"])
        self.assertEqual(chars, ["!", "7", "A", "a"], "distingue A de a y descarta nombres inválidos")
        self.assertEqual({(g["w"], g["h"]) for g in lib["glyphs"]}, {(30, 40)}, "tamaño desde la cabecera PNG")
        self.assertEqual({(g["w"], g["h"]) for g in lib["glyphs"]}, {(30, 40)}, "tamaño desde la cabecera PNG")

    def test_catalogo_manda_y_omite_huerfanos(self):
        self._png("X1_B_00001.png")
        (self.tmp / "catalog.json").write_text(json.dumps({"entries": [
            {"filename": "X1_B_00001.png", "character": "B", "style": "X1", "size": [10, 20]},
            {"filename": "X1_C_00002.png", "character": "C", "style": "X1"},
        ]}), encoding="utf-8")
        lib = letters.library()
        self.assertEqual(len(lib["glyphs"]), 1)
        g = lib["glyphs"][0]
        self.assertEqual((g["char"], g["w"], g["h"]), ("B", 10, 20))
        self.assertEqual(g["url"], "/api/letters/file/X1_B_00001.png")

    def test_resolve_no_sale_de_la_carpeta(self):
        self._png("X1_B_00001.png")
        self.assertIsNotNone(letters.resolve("X1_B_00001.png"))
        self.assertIsNone(letters.resolve("../config.py"))
        self.assertIsNone(letters.resolve("..\\X1_B_00001.png"))
        self.assertIsNone(letters.resolve("nope.png"))


if __name__ == "__main__":
    unittest.main()
