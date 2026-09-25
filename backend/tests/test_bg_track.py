"""Eliminación personalizada: marcas por fotograma y aritmética del seguimiento.

Solo lógica pura (sin vídeo ni modelo). El seguimiento de extremo a extremo con
un SAM falso vive en ``test_bg_service.SamTrackingTest``.
"""
from __future__ import annotations

import unittest

import numpy as np

from app import clip_bg
from app.bg import sam_track


class EditModelTest(unittest.TestCase):
    def test_conserva_fotograma_y_herramienta(self):
        e = clip_bg.normalize_edit({"op": "keep", "points": [{"x": 0.5, "y": 0.5}],
                                    "t": 1.23456, "tool": "manual"})
        self.assertEqual(e["t"], 1.235)
        self.assertEqual(e["tool"], "manual")

    def test_sin_t_ni_tool_no_añade_claves(self):
        """Los trazos de U²-Net no cambian: sus claves de caché siguen iguales."""
        e = clip_bg.normalize_edit({"op": "erase", "points": [{"x": 0.1, "y": 0.2}]})
        self.assertNotIn("t", e)
        self.assertNotIn("tool", e)

    def test_valores_raros_se_descartan(self):
        e = clip_bg.normalize_edit({"points": [{"x": 0, "y": 0}], "t": -3, "tool": "lazo"})
        self.assertNotIn("t", e)
        self.assertNotIn("tool", e)

    def test_la_marca_entra_en_la_clave_del_matte_sam(self):
        base = {"provider": "sam21_base_plus",
                "edits": [{"op": "keep", "points": [{"x": 0.5, "y": 0.5}], "t": 0.0}]}
        moved = {"provider": "sam21_base_plus",
                 "edits": [{"op": "keep", "points": [{"x": 0.5, "y": 0.5}], "t": 1.0}]}
        k1 = clip_bg.base_key("src", clip_bg.normalize_auto(base), "v")
        k2 = clip_bg.base_key("src", clip_bg.normalize_auto(moved), "v")
        self.assertNotEqual(k1, k2)


class KeyframesTest(unittest.TestCase):
    def _e(self, t=None, op="keep", tool=None, pts=((0.5, 0.5),)):
        e = {"op": op, "size": 0.05, "points": [{"x": x, "y": y} for x, y in pts]}
        if t is not None:
            e["t"] = t
        if tool:
            e["tool"] = tool
        return e

    def test_agrupa_por_fotograma_del_matte(self):
        kfs = clip_bg.sam_keyframes([self._e(0.0), self._e(0.02, op="erase"), self._e(1.0)], 15, 0)
        self.assertEqual(sorted(kfs), [0, 15])
        self.assertEqual([lab for *_, lab in kfs[0]["points"]], [1, 0])

    def test_separa_pincel_manual_de_inteligente(self):
        kfs = clip_bg.sam_keyframes([self._e(0.5, tool="manual"), self._e(0.5, tool="smart")], 10, 0)
        self.assertEqual(len(kfs[5]["manual"]), 1)
        self.assertEqual(len(kfs[5]["points"]), 1)

    def test_marcas_antiguas_sin_t_van_al_fotograma_por_defecto(self):
        kfs = clip_bg.sam_keyframes([self._e()], 15, 42)
        self.assertEqual(list(kfs), [42])

    def test_un_trazo_largo_se_muestrea(self):
        pts = [(i / 100, 0.5) for i in range(100)]
        got = clip_bg.stroke_prompt_points(self._e(pts=pts))
        self.assertEqual(len(got), clip_bg.SMART_POINTS_PER_STROKE)
        self.assertAlmostEqual(got[0][0], 0.0)
        self.assertAlmostEqual(got[-1][0], 0.99)


class TrackMathTest(unittest.TestCase):
    def test_cada_fotograma_es_del_clave_mas_cercano(self):
        spans = sam_track.owner_spans([2, 10], 14)
        self.assertEqual(spans, [(2, 0, 6), (10, 7, 13)])
        covered = [i for _, lo, hi in spans for i in range(lo, hi + 1)]
        self.assertEqual(covered, list(range(14)))

    def test_un_solo_clave_cubre_todo(self):
        self.assertEqual(sam_track.owner_spans([5], 9), [(5, 0, 8)])

    def test_indices_relativos_se_acotan_y_fusionan(self):
        kfs = {3: {"points": [(0.1, 0.1, 1)], "manual": []},
               20: {"points": [(0.2, 0.2, 1)], "manual": []},
               99: {"points": [(0.3, 0.3, 1)], "manual": []}}
        rel = sam_track.relative_keyframes(kfs, 10, 5)
        self.assertEqual(sorted(rel), [0, 4])
        self.assertEqual(len(rel[4]["points"]), 2)      # 20 y 99 → último fotograma

    def test_en_bucle_dan_la_vuelta(self):
        rel = sam_track.relative_keyframes({12: {"points": [], "manual": []}}, 0, 10, wrap=True)
        self.assertEqual(list(rel), [2])

    def test_prompt_desde_la_mascara(self):
        m = np.zeros((100, 200), np.uint8)
        m[20:60, 50:90] = 255
        box, pts = sam_track.prompt_from_mask(m)
        x0, y0, x1, y1 = box
        self.assertLess(x0, 50 / 200)
        self.assertGreater(x1, 90 / 200)
        self.assertLess(y0, 20 / 100)
        self.assertGreater(y1, 60 / 100)
        (px, py, lab), = pts
        self.assertEqual(lab, 1)
        self.assertTrue(50 / 200 < px < 90 / 200 and 20 / 100 < py < 60 / 100)

    def test_prompt_de_mascara_vacia_es_none(self):
        self.assertIsNone(sam_track.prompt_from_mask(np.zeros((10, 10), np.uint8)))

    def test_un_punto_por_trozo_grande(self):
        m = np.zeros((100, 200), np.uint8)
        m[10:50, 10:50] = 255
        m[60:90, 150:190] = 255
        m[0:2, 198:200] = 255                            # mota: no merece punto
        _, pts = sam_track.prompt_from_mask(m)
        self.assertEqual(len(pts), 2)

    def test_logits_a_matte(self):
        lg = np.full((4, 4), -10.0, np.float32)
        lg[:2] = 10.0
        m = sam_track.logits_to_matte(lg, (8, 8))
        self.assertEqual(m.shape, (8, 8))
        self.assertEqual(int(m[0, 0]), 255)
        self.assertEqual(int(m[-1, -1]), 0)


if __name__ == "__main__":
    unittest.main()
