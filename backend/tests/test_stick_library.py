"""Sticks: colecciones con stick.json → menú "Agregar Stick" agrupado por expresión."""
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import collections, stick_library


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
        _touch(sci / "ghost.mp4")             # NO está en el manifiesto → otros
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
        # ghost.mp4 no está en el manifiesto pero sí en la carpeta: cuenta (en «otros»).
        self.assertEqual(s["kinds"], {"video": 3, "image": 2})

    def test_detail_agrupa_por_expresion_en_orden(self):
        with patch("app.collections.get_root", return_value=self.root):
            d = stick_library.stick_detail("scientist_stick")
        self.assertEqual(d["chroma_color"], "#00FF00")
        # Vídeo: happy antes que sad (orden de la taxonomía); "missing.mp4" se ignora
        # y ghost.mp4 (fuera del manifiesto, sin subcarpeta) cae en «otros».
        self.assertEqual([g["id"] for g in d["video"]], ["happy", "sad", "otros"])
        self.assertEqual(d["video"][2]["items"][0]["title"], "ghost")
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

    def test_subcarpeta_categoriza_y_carpeta_propia_es_categoria(self):
        sci = self.root / "scientist_stick"
        (sci / "Triste").mkdir()
        _touch(sci / "Triste" / "llora_1080p_20260916183013.mp4")
        (sci / "bailando").mkdir()
        _touch(sci / "bailando" / "baile.gif")
        with patch("app.collections.get_root", return_value=self.root):
            d = stick_library.stick_detail("scientist_stick")
        sad = next(g for g in d["video"] if g["id"] == "sad")
        titles = [c["title"] for c in sad["items"]]
        self.assertIn("llora", titles)                      # sin _1080p ni timestamp
        self.assertEqual(sad["items"][-1]["rel"], "Triste/llora_1080p_20260916183013.mp4")
        # «bailando» no es una expresión: categoría propia, y el GIF va con las imágenes.
        dance = next(g for g in d["image"] if g["id"] == "bailando")
        self.assertEqual(dance["label"], "bailando")
        self.assertTrue(dance["items"][0]["animated"])
        self.assertIn("bailando", [e["id"] for e in d["expressions"]])

    def test_groups_incluye_expresiones_vacias_en_orden(self):
        with patch("app.collections.get_root", return_value=self.root):
            d = stick_library.stick_detail("scientist_stick")
        self.assertEqual([g["id"] for g in d["groups"]], ["happy", "sad", "otros"])
        happy = d["groups"][0]
        self.assertEqual(sorted(c["stick_kind"] for c in happy["items"]), ["image", "video"])

    def test_crear_stick_con_carpetas_por_expresion(self):
        with patch("app.collections.get_root", return_value=self.root):
            d = stick_library.create_stick("Robot Ñu", emoji="🤖", chroma_color="#0000FF")
            again = stick_library.create_stick("Robot Ñu")
            listed = [s["id"] for s in stick_library.list_sticks()["sticks"]]
        self.assertEqual(d["id"], "robot_nu")
        self.assertEqual(again["id"], "robot_nu_2")          # no pisa el existente
        folder = self.root / "robot_nu"
        self.assertTrue((folder / "stick.json").is_file())
        self.assertTrue((folder / "triste").is_dir())
        self.assertTrue((folder / "enojado").is_dir())
        man = json.loads((folder / "stick.json").read_text(encoding="utf-8"))
        self.assertEqual(man["chroma"]["color"], "#0000FF")
        self.assertEqual(man["order"], 1)                    # detrás de scientist (0)
        self.assertEqual(d["chroma_color"], "#0000FF")
        self.assertEqual(len(d["groups"]), len(stick_library.DEFAULT_EXPRESSIONS))
        self.assertEqual(listed[:2], ["scientist_stick", "robot_nu"])

    def test_crear_stick_sin_nombre_o_color_invalido(self):
        with patch("app.collections.get_root", return_value=self.root):
            with self.assertRaises(ValueError):
                stick_library.create_stick("   ")
            d = stick_library.create_stick("Gato", chroma_color="verde")
        self.assertEqual(d["chroma_color"], stick_library.DEFAULT_CHROMA)

    def test_subir_a_una_expresion(self):
        with patch("app.collections.get_root", return_value=self.root):
            stick_library.create_stick("Robot")
            out = stick_library.add_files("robot", [
                ("salta.mp4", io.BytesIO(b"v")),
                ("salta.mp4", io.BytesIO(b"v2")),            # mismo nombre → salta_2.mp4
                ("notas.txt", io.BytesIO(b"t")),
            ], expression="happy")
        self.assertEqual(out["saved"], ["feliz/salta.mp4", "feliz/salta_2.mp4"])
        self.assertEqual(len(out["errors"]), 1)
        happy = next(g for g in out["detail"]["groups"] if g["id"] == "happy")
        self.assertEqual(len(happy["items"]), 2)

    def test_subir_expresion_desconocida(self):
        with patch("app.collections.get_root", return_value=self.root):
            stick_library.create_stick("Robot")
            with self.assertRaises(ValueError):
                stick_library.add_files("robot", [("a.mp4", io.BytesIO(b"v"))], expression="bailar")

    def test_recategorizar_no_mueve_el_archivo(self):
        sci = self.root / "scientist_stick"
        with patch("app.collections.get_root", return_value=self.root):
            d = stick_library.set_expression("scientist_stick", "ghost.mp4", "sad")
            d2 = stick_library.set_expression("scientist_stick", "Happy_thumbs.mp4", "sad")
            with self.assertRaises(LookupError):
                stick_library.set_expression("scientist_stick", "../fondos/bg.jpg", "sad")
            with self.assertRaises(ValueError):
                stick_library.set_expression("scientist_stick", "ghost.mp4", "nope")
        self.assertTrue((sci / "ghost.mp4").is_file())
        sad = next(g for g in d["video"] if g["id"] == "sad")
        self.assertIn("ghost", [c["title"] for c in sad["items"]])
        man = json.loads((sci / "stick.json").read_text(encoding="utf-8"))
        by_file = {it["file"]: it for it in man["items"]}
        self.assertEqual(by_file["ghost.mp4"]["expression"], "sad")
        self.assertEqual(by_file["Happy_thumbs.mp4"]["expression"], "sad")
        self.assertEqual(by_file["Happy_thumbs.mp4"]["title"], "Pulgar arriba")   # conserva título
        self.assertNotIn("happy", [g["id"] for g in d2["video"]])


class StickApiTest(unittest.TestCase):
    """Rutas HTTP de la Biblioteca: crear stick/carpeta, subir (multipart) y recategorizar."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        from fastapi.testclient import TestClient
        from app.main import app
        self.client = TestClient(app)
        self.patcher = patch("app.collections.get_root", return_value=self.root)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        shutil.rmtree(self.root, ignore_errors=True)

    def test_flujo_completo(self):
        r = self.client.post("/api/sticks", json={"name": "Robot", "emoji": "🤖", "chroma_color": "#00ff00"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["id"], "robot")
        r = self.client.post("/api/sticks/robot/items", data={"expression": "sad"},
                             files=[("files", ("llora.mp4", b"v", "video/mp4")),
                                    ("files", ("cara.png", b"i", "image/png"))])
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["saved"], ["triste/llora.mp4", "triste/cara.png"])
        sad = next(g for g in r.json()["detail"]["groups"] if g["id"] == "sad")
        self.assertEqual(len(sad["items"]), 2)
        r = self.client.patch("/api/sticks/robot/items", json={"file": "triste/cara.png", "expression": "happy"})
        self.assertEqual(r.status_code, 200, r.text)
        happy = next(g for g in r.json()["groups"] if g["id"] == "happy")
        self.assertEqual([c["rel"] for c in happy["items"]], ["triste/cara.png"])
        # Solo archivos no soportados → 400 con el motivo.
        r = self.client.post("/api/sticks/robot/items", data={"expression": "sad"},
                             files=[("files", ("notas.txt", b"t", "text/plain"))])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.post("/api/sticks", json={"name": ""}).status_code, 400)
        self.assertEqual(self.client.get("/api/sticks/nada").status_code, 404)

    def test_carpeta_normal(self):
        r = self.client.post("/api/collections", json={"name": "Fondos"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["id"], "Fondos")
        r = self.client.post("/api/collections/Fondos/files", files=[("files", ("cielo.jpg", b"i", "image/jpeg"))])
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["saved"][0]["filename"], "Fondos/cielo.jpg")
        self.assertEqual(self.client.post("/api/collections/NoExiste/files",
                                          files=[("files", ("a.jpg", b"i", "image/jpeg"))]).status_code, 404)


class CollectionsWriteTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "fondos").mkdir()
        (self.root / "sticky").mkdir()
        (self.root / "sticky" / "stick.json").write_text("{}", encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_crear_carpeta_y_subir(self):
        with patch("app.collections.get_root", return_value=self.root):
            cid = collections.create_collection("Fondos nuevos")
            dup = collections.create_collection("Fondos nuevos")
            out = collections.add_files(cid, [("cielo.png", io.BytesIO(b"i")), ("x.exe", io.BytesIO(b"e"))])
            with self.assertRaises(LookupError):
                collections.add_files("no_existe", [("a.png", io.BytesIO(b"i"))])
            cols = {c["id"]: c for c in collections.list_collections()["collections"]}
        self.assertEqual(cid, "Fondos nuevos")
        self.assertEqual(dup, "Fondos nuevos 2")
        self.assertEqual([s["filename"] for s in out["saved"]], ["Fondos nuevos/cielo.png"])
        self.assertEqual(len(out["errors"]), 1)
        self.assertTrue((self.root / "Fondos nuevos" / "cielo.png").is_file())
        self.assertTrue(cols["sticky"]["stick"])
        self.assertFalse(cols["fondos"]["stick"])


if __name__ == "__main__":
    unittest.main()
