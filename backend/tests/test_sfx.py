"""Alta de SFX: copia el audio, registra JSON y crea categoría si hace falta."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import sfx


def _write_lib(tmp: Path) -> None:
    other = tmp / "13_OTHER"
    other.mkdir()
    (other / "old.mp3").write_bytes(b"old-audio")
    data = {
        "generado": "2026-08-31",
        "total": 1,
        "categorias": {
            "13_OTHER": {
                "etiqueta": "Other / Ambience",
                "uso_tipico": "sin clasificar",
                "cantidad": 1,
            }
        },
        "sonidos": [{
            "sonido": "old",
            "archivo": "old.mp3",
            "carpeta": "13_OTHER",
            "categoria": "Other / Ambience",
            "uso_tipico": "sin clasificar",
        }],
    }
    (tmp / "sfx_library.json").write_text(json.dumps(data), encoding="utf-8")


class AddSfxTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        _write_lib(self.tmp)
        self.patcher = patch("app.sfx.get_base", return_value=self.tmp)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_copies_file_and_registers_json(self):
        item = sfx.add_sound("boom.mp3", b"ID3xxxx", category_id="13_OTHER")
        dest = self.tmp / "13_OTHER" / "boom.mp3"
        self.assertTrue(dest.exists())
        self.assertEqual(dest.read_bytes(), b"ID3xxxx")
        self.assertEqual(item["id"], "13_OTHER/boom.mp3")
        self.assertEqual(item["folder"], "13_OTHER")
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["categorias"]["13_OTHER"]["cantidad"], 2)
        last = data["sonidos"][-1]
        self.assertEqual(last["archivo"], "boom.mp3")
        self.assertEqual(last["carpeta"], "13_OTHER")
        self.assertEqual(last["categoria"], "Other / Ambience")

    def test_name_defaults_to_filename_stem(self):
        item = sfx.add_sound("Fast whoosh.mp3", b"xx", category_id="13_OTHER")
        self.assertEqual(item["name"], "Fast whoosh")
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertEqual(data["sonidos"][-1]["sonido"], "Fast whoosh")

    def test_stores_custom_name(self):
        item = sfx.add_sound("a.mp3", b"xx", name="  Golpe duro  ", category_id="13_OTHER")
        self.assertEqual(item["name"], "Golpe duro")

    def test_creates_new_numbered_category(self):
        item = sfx.add_sound("swish.wav", b"RIFF", new_category="Whoosh")
        self.assertEqual(item["folder"], "14_WHOOSH")
        self.assertEqual(item["category"], "Whoosh")
        self.assertTrue((self.tmp / "14_WHOOSH" / "swish.wav").exists())
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertIn("14_WHOOSH", data["categorias"])
        self.assertEqual(data["categorias"]["14_WHOOSH"]["etiqueta"], "Whoosh")
        self.assertEqual(data["categorias"]["14_WHOOSH"]["cantidad"], 1)

    def test_rejects_non_audio(self):
        with self.assertRaises(ValueError):
            sfx.add_sound("foto.png", b"xx", category_id="13_OTHER")

    def test_uniquifies_duplicate_filename(self):
        item = sfx.add_sound("old.mp3", b"new", category_id="13_OTHER")
        self.assertEqual(item["file"], "old_2.mp3")
        self.assertTrue((self.tmp / "13_OTHER" / "old_2.mp3").exists())
        self.assertEqual((self.tmp / "13_OTHER" / "old.mp3").read_bytes(), b"old-audio")

    def test_stores_custom_uso(self):
        item = sfx.add_sound(
            "a.mp3", b"xx", category_id="13_OTHER", uso="Transición rápida entre escenas",
        )
        self.assertEqual(item["uso"], "Transición rápida entre escenas")
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertEqual(data["sonidos"][-1]["uso_tipico"], "Transición rápida entre escenas")


class AddSfxNoLibraryTest(unittest.TestCase):
    def test_rejects_missing_library(self):
        with patch("app.sfx.get_base", return_value=None):
            with self.assertRaises(ValueError):
                sfx.add_sound("a.mp3", b"xx")

    def test_creates_json_when_missing(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            (tmp / "13_OTHER").mkdir()
            (tmp / "13_OTHER" / "scan.mp3").write_bytes(b"scan")
            with patch("app.sfx.get_base", return_value=tmp):
                item = sfx.add_sound("new.mp3", b"xx", category_id="13_OTHER")
            self.assertEqual(item["id"], "13_OTHER/new.mp3")
            data = json.loads((tmp / "sfx_library.json").read_text(encoding="utf-8"))
            names = {s["archivo"] for s in data["sonidos"]}
            self.assertIn("scan.mp3", names)
            self.assertIn("new.mp3", names)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class AddSfxHttpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        _write_lib(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_post_sfx_returns_added_item(self):
        from fastapi.testclient import TestClient
        from app.main import app

        with patch("app.sfx.get_base", return_value=self.tmp):
            client = TestClient(app)
            res = client.post(
                "/api/sfx",
                data={"name": "Golpe", "category_id": "13_OTHER"},
                files={"file": ("hit.mp3", b"ID3data", "audio/mpeg")},
            )
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["added"]["name"], "Golpe")
        self.assertEqual(body["added"]["folder"], "13_OTHER")
        self.assertGreaterEqual(body["total"], 2)


class UpdateSfxTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        _write_lib(self.tmp)
        self.patcher = patch("app.sfx.get_base", return_value=self.tmp)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_updates_name_and_uso_in_place(self):
        item = sfx.update_sound(
            "13_OTHER/old.mp3", name="Viejo", uso="ambiente",
        )
        self.assertEqual(item["name"], "Viejo")
        self.assertEqual(item["uso"], "ambiente")
        self.assertEqual(item["id"], "13_OTHER/old.mp3")
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertEqual(data["sonidos"][0]["sonido"], "Viejo")
        self.assertEqual(data["sonidos"][0]["uso_tipico"], "ambiente")

    def test_moves_file_when_category_changes(self):
        item = sfx.update_sound("13_OTHER/old.mp3", new_category="Whoosh")
        self.assertEqual(item["folder"], "14_WHOOSH")
        self.assertTrue((self.tmp / "14_WHOOSH" / "old.mp3").exists())
        self.assertFalse((self.tmp / "13_OTHER" / "old.mp3").exists())
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertEqual(data["categorias"]["13_OTHER"]["cantidad"], 0)
        self.assertEqual(data["categorias"]["14_WHOOSH"]["cantidad"], 1)
        self.assertEqual(data["sonidos"][0]["carpeta"], "14_WHOOSH")

    def test_rejects_unknown_id(self):
        with self.assertRaises(ValueError):
            sfx.update_sound("13_OTHER/nope.mp3", name="x")


class CreateSfxCategoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        _write_lib(self.tmp)
        self.patcher = patch("app.sfx.get_base", return_value=self.tmp)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_creates_numbered_folder_and_json(self):
        cat = sfx.create_category("Whoosh")
        self.assertEqual(cat["id"], "14_WHOOSH")
        self.assertEqual(cat["label"], "Whoosh")
        self.assertEqual(cat["count"], 0)
        self.assertTrue((self.tmp / "14_WHOOSH").is_dir())
        data = json.loads((self.tmp / "sfx_library.json").read_text(encoding="utf-8"))
        self.assertEqual(data["categorias"]["14_WHOOSH"]["etiqueta"], "Whoosh")

    def test_reuses_existing_label(self):
        cat = sfx.create_category("Other / Ambience")
        self.assertEqual(cat["id"], "13_OTHER")
        self.assertFalse((self.tmp / "14_OTHER_AMBIENCE").exists())

    def test_rejects_empty_label(self):
        with self.assertRaises(ValueError):
            sfx.create_category("  ")


if __name__ == "__main__":
    unittest.main()
