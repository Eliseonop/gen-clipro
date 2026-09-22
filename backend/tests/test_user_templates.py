"""Plantillas guardadas por el usuario (§16): lo que salió bien se reutiliza.

Una composición validada se guarda con sus textos e imágenes como ranuras; al
instanciarla se sustituyen y se escala al formato de destino.
"""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config
from app.motion import resource_ai
from app.motion import templates as motion_templates
from app.motion.generator import generate_html
from app.motion.models import MotionComposition, MotionLayer
from app.motion.templates import user
from app.motion.validator import validate


def _free_comp() -> MotionComposition:
    """Una composición «libre» como las que escribe la IA: html + texto + forma."""
    html = ('<div class="scene"><h2>Navier &amp; Stokes</h2>'
            '<img src="asset:image/img_navier"><p>Dos siglos de ecuaciones</p>'
            '<style>.x{}</style></div>')
    return MotionComposition(
        id="mg_free", name="Libre", width=720, height=1280, duration=4.0,
        metadata={"draft": True, "source": "generate_motion", "project_id": "p1", "range": [0, 4]},
        layers=[
            MotionLayer(id="blk", type="html", x=0, y=0, width=720, height=1280, html=html,
                        css=".scene{position:absolute;inset:0}",
                        js="tl.fromTo(root.querySelector('h2'),{autoAlpha:0},{autoAlpha:1,duration:0.4},0);"),
            MotionLayer(id="t1", type="text", content="Fluidos", x=360, y=1100,
                        style={"fontSize": 60}),
            MotionLayer(id="s1", type="shape", x=100, y=200,
                        shape={"kind": "circle", "radius": 40, "fill": "#4f46e5"}),
        ],
    )


class UserTemplatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = config.DATA_DIR
        config.DATA_DIR = self.tmp
        self.copied = []

    def tearDown(self):
        config.DATA_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _copy(self, pid, iid):
        self.copied.append((pid, iid))
        return f"lib_{iid}"

    def _save(self, **kw):
        return user.save("p1", _free_comp(), name=kw.pop("name", "Dos científicos"),
                         best_for="Presentar a dos personajes históricos", copy_images=self._copy, **kw)

    def test_guardar_extrae_ranuras_y_copia_imagenes(self):
        saved = self._save(tags=["historia"])
        self.assertTrue(saved["key"].startswith("u_dos_cientificos_"))
        self.assertEqual(saved["texts"], ["Navier & Stokes", "Dos siglos de ecuaciones", "Fluidos"])
        self.assertEqual(saved["images"], ["lib_img_navier"])     # ya apunta a la Biblioteca
        self.assertEqual(self.copied, [("p1", "img_navier")])
        entry = user._load()[0]
        # Lo que era del borrador de un tramo no viaja a la plantilla.
        for k in ("draft", "source", "range", "project_id"):
            self.assertNotIn(k, entry["composition"]["metadata"])

    def test_aparece_en_el_catalogo_y_la_ia_puede_elegirla(self):
        saved = self._save()
        row = next(r for r in motion_templates.catalog() if r["key"] == saved["key"])
        self.assertEqual(row["category"], "user")
        self.assertIn("«Navier & Stokes»", row["slots"]["texts"])
        self.assertIn("lib_img_navier", row["slots"]["images"])
        ctx = {"selection": {"duration": 3.0}, "availableAssets": [], "style": {}}
        rows = resource_ai.normalize_suggestions(
            {"suggestions": [{"label": "Reusar", "template": saved["key"], "params": {}}]}, ctx)
        self.assertEqual(rows[0]["template"], saved["key"])

    def test_instanciar_sustituye_textos_e_imagenes(self):
        saved = self._save()
        comp = motion_templates.instantiate(saved["key"], "mg_new", {
            "texts": {"Navier & Stokes": "Euler & Bernoulli", "Fluidos": "Presión"},
            "images": {"lib_img_navier": "img_euler"},
            "width": 720, "height": 1280, "duration": 3.0,
        })
        self.assertEqual(validate(comp), [])
        html = comp.layers[0].html
        self.assertIn("Euler &amp; Bernoulli", html)        # sustituido ya escapado
        self.assertNotIn("Navier", html)
        self.assertIn("asset:image/img_euler", html)
        self.assertEqual(comp.layers[1].content, "Presión")
        self.assertEqual(comp.duration, 3.0)
        self.assertTrue(comp.metadata["user_template"])
        self.assertIn("__COMP", generate_html(comp))

    def test_se_escala_a_otro_formato(self):
        saved = self._save()
        comp = motion_templates.instantiate(saved["key"], "mg_hd", {"width": 1080, "height": 1920})
        self.assertEqual((comp.width, comp.height), (1080, 1920))
        blk, txt, shp = comp.layers
        self.assertIn("transform:scale(1.50000)", blk.html)
        self.assertEqual((blk.width, blk.height), (1080, 1920))
        self.assertAlmostEqual(txt.x, 540)
        self.assertAlmostEqual(txt.style["fontSize"], 90)
        self.assertAlmostEqual(shp.shape.radius, 60)
        self.assertEqual(validate(comp), [])

    def test_otra_proporcion_se_centra(self):
        saved = self._save()
        comp = motion_templates.instantiate(saved["key"], "mg_land", {"width": 1920, "height": 1080})
        blk = comp.layers[0]
        k = 1080 / 1280
        self.assertIn(f"transform:scale({k:.5f})", blk.html)
        self.assertIn(f"left:{(1920 - 720 * k) / 2:.1f}px", blk.html)
        self.assertEqual(validate(comp), [])

    def test_borrar(self):
        saved = self._save()
        self.assertTrue(user.delete(saved["key"]))
        self.assertFalse(user.delete(saved["key"]))
        self.assertIsNone(motion_templates.get(saved["key"]))

    def test_validaciones(self):
        with self.assertRaises(ValueError):
            self._save(name="   ")
        empty = MotionComposition(id="e", layers=[])
        with self.assertRaises(ValueError):
            user.save("p1", empty, name="Vacía", copy_images=self._copy)

    def test_imagen_que_ya_no_existe_no_rompe_el_guardado(self):
        def missing(pid, iid):
            raise LookupError("no está")
        saved = user.save("p1", _free_comp(), name="Sin imagen", copy_images=missing)
        self.assertEqual(saved["images"], ["img_navier"])

    def test_textos_ignoran_estilos_y_basura(self):
        comp = MotionComposition(id="c", layers=[MotionLayer(
            id="h", type="html", width=10, height=10,
            html="<div><style>.a{color:red}</style><b>Hola</b> <i> · </i><b>Hola</b></div>")])
        self.assertEqual(user.texts_of(comp), ["Hola"])

    def test_galeria_resuelve_imagenes_de_biblioteca_sin_proyecto(self):
        """El preview de la galería instancia sin proyecto: las imágenes lib_ deben
        verse igual (antes salían rotas)."""
        from unittest import mock

        from app.motion import assets
        comp = MotionComposition(id="c", layers=[MotionLayer(
            id="h", type="html", width=10, height=10,
            html='<img src="asset:image/lib_abc"><img src="asset:image/img_local">')])
        with mock.patch.object(assets, "data_uri_for", side_effect=lambda pid, iid: f"data:{pid}|{iid}"):
            self.assertEqual(assets.embedded_assets(comp), {"lib_abc": "data:|lib_abc"})
            comp.metadata["project_id"] = "p9"
            self.assertEqual(assets.embedded_assets(comp),
                             {"lib_abc": "data:p9|lib_abc", "img_local": "data:p9|img_local"})

    def test_sin_fichero_no_hay_plantillas(self):
        self.assertEqual(user.list_saved(), [])
        self.assertEqual(user.as_templates(), [])


if __name__ == "__main__":
    unittest.main()
