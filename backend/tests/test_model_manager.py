"""Gestor de modelos: descarga por inactividad, uno pesado a la vez, en uso."""
from __future__ import annotations

import unittest

from app import model_manager as mm


class ModelManagerTest(unittest.TestCase):
    def setUp(self):
        self.t = [1000.0]
        mm._set_clock(lambda: self.t[0])
        mm._models.clear()
        self.dropped = []

    def tearDown(self):
        mm._models.clear()
        import time
        mm._set_clock(time.monotonic)

    def _reg(self, name, heavy=False):
        mm.register(name, lambda: self.dropped.append(name), heavy=heavy)

    def test_descarga_por_inactividad(self):
        self._reg("a")
        self._reg("b")
        self.t[0] += 200
        mm.touch("b")
        self.t[0] += 150
        self.assertEqual(mm.unload_idle(300), ["a"])
        self.assertEqual(self.dropped, ["a"])
        self.assertEqual([m["name"] for m in mm.loaded()], ["b"])

    def test_cero_minutos_no_descarga(self):
        self._reg("a")
        self.t[0] += 10_000
        self.assertEqual(mm.unload_idle(0), [])

    def test_en_uso_no_se_descarga(self):
        self._reg("a")
        with mm.in_use("a"):
            self.t[0] += 10_000
            self.assertEqual(mm.unload_idle(1), [])
            self.assertEqual(mm.unload_all(), [])
        # al salir del bloque cuenta como usado ahora
        self.assertEqual(mm.unload_idle(1), [])
        self.t[0] += 5
        self.assertEqual(mm.unload_idle(1), ["a"])

    def test_un_pesado_a_la_vez(self):
        self._reg("light")
        self._reg("big1", heavy=True)
        self._reg("big2", heavy=True)
        self.assertEqual(self.dropped, ["big1"])
        self.assertEqual(sorted(m["name"] for m in mm.loaded()), ["big2", "light"])

    def test_pesado_en_uso_no_se_expulsa(self):
        self._reg("big1", heavy=True)
        with mm.in_use("big1"):
            self._reg("big2", heavy=True)
        self.assertEqual(self.dropped, [])

    def test_forget_y_unload(self):
        self._reg("a")
        mm.forget("a")
        self.assertFalse(mm.unload("a"))
        self.assertEqual(self.dropped, [])

    def test_informe_de_memoria(self):
        self._reg("a")
        rep = mm.memory_report()
        self.assertGreaterEqual(rep["rss_bytes"], 0)
        self.assertEqual(rep["models"][0]["name"], "a")


class ProviderRegistrationTest(unittest.TestCase):
    """Los motores reales se registran al cargar y se sueltan al descargar."""

    def test_proveedor_onnx_se_registra_y_se_suelta(self):
        from app.bg import providers

        prov = providers.U2NetLiteProvider()
        fake = object()

        def _load(_cb=None):
            prov._session = fake
            return True

        prov._load = _load
        mm._models.clear()
        prov.ensure_ready()
        self.assertIn("bg:u2netp", [m["name"] for m in mm.loaded()])
        self.assertTrue(mm.unload("bg:u2netp"))
        self.assertIsNone(prov._session)
        mm._models.clear()


if __name__ == "__main__":
    unittest.main()
