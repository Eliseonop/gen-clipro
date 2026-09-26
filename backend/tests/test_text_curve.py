"""Curva como CapCut: texto en arco con Fuerza (−1…1), letra a letra en el export.
Espejo de curveOf / bendPlaced (frontend/src/lib/textstyles.js)."""
import math
import re
import unittest

from app.schemas import TimelineClip
from app.text_ass import _rows, build_ass, curve_glyphs, curve_of

W, H = 720, 1280


def _text(style=None, text="HOLA MUNDO", kf=None):
    return TimelineClip(
        id="t", track_id="T", kind="text", asset_kind="text", asset_id="t", filename="",
        start=0, in_point=0, out_point=2, source_duration=2, text=text,
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", "w": 0.95,
               "curve_on": True, "curve": 0.6, **(style or {})},
        keyframes=kf,
    )


def _dialogues(doc):
    return [ln for ln in doc.splitlines() if ln.startswith("Dialogue")]


class CurveOfTest(unittest.TestCase):
    def test_reglas(self):
        self.assertEqual(curve_of({"curve_on": True, "curve": 0.6}), 0.6)
        self.assertEqual(curve_of({"curve_on": False, "curve": 0.6}), 0.0)
        self.assertEqual(curve_of({"curve_on": True, "curve": 3}), 1.0)
        self.assertEqual(curve_of({"curve_on": True, "curve": 0.001}), 0.0)
        # Con Fondo no hay curva (CapCut no deja activarla).
        self.assertEqual(curve_of({"curve_on": True, "curve": 0.6, "bg": "#000000"}), 0.0)
        self.assertEqual(curve_of({"curve_on": True, "curve": 0.6, "bg": "none"}), 0.6)


class GlyphsTest(unittest.TestCase):
    def _glyphs(self, **style):
        st = _text(style).style
        return curve_glyphs(st, W, H, _rows(st, W, H, "HOLA MUNDO"))

    def test_una_por_letra_y_simetricas(self):
        g = self._glyphs()
        self.assertEqual("".join(ch for _gi, ch, *_ in g), "HOLAMUNDO")
        self.assertEqual({gi for gi, *_ in g}, {0, 1})
        xs = [x for *_, x, _y, _p in g]
        self.assertAlmostEqual(xs[0], -xs[-1], delta=2)

    def test_hacia_arriba_los_extremos_bajan(self):
        g = self._glyphs()
        mid = min(abs(x) for *_, x, _y, _p in g)
        center_y = next(y for *_, x, y, _p in g if abs(x) == mid)
        self.assertGreater(g[0][3], center_y)
        self.assertLess(g[0][4], 0)          # la primera letra gira a la izquierda
        self.assertGreater(g[-1][4], 0)

    def test_hacia_abajo_los_extremos_suben(self):
        g = self._glyphs(curve=-0.6)
        self.assertLess(g[0][3], min(y for *_, y, _p in g[3:6]))
        self.assertGreater(g[0][4], 0)

    def test_fuerza_maxima_media_vuelta(self):
        g = self._glyphs(curve=1.0)
        span = g[-1][4] - g[0][4]
        self.assertGreater(span, math.radians(140))
        self.assertLess(span, math.radians(185))

    def test_lineas_concentricas_conservan_su_separacion(self):
        st = _text({"w": 0.3, "curve": 0.5}).style
        rows = _rows(st, W, H, "HOLA MUNDO")
        self.assertEqual(len(rows), 2)
        g = curve_glyphs(st, W, H, rows)
        top = [(x, y) for gi, _ch, x, y, _p in g if gi == 0]
        bottom = [(x, y) for gi, _ch, x, y, _p in g if gi == 1]
        radius = max(x for x, _ in top + bottom)  # escala aproximada
        self.assertGreater(radius, 0)
        # En el centro, las líneas quedan a una línea de distancia.
        gap = min(bottom, key=lambda p: abs(p[0]))[1] - min(top, key=lambda p: abs(p[0]))[1]
        self.assertAlmostEqual(gap, 0.05 * H * 1.22, delta=6)


class ExportTest(unittest.TestCase):
    def test_un_evento_por_letra_girado(self):
        ds = [ln for ln in _dialogues(build_ass([_text()], W, H)) if ",st," in ln]
        self.assertEqual(len(ds), 9)
        angles = [float(re.search(r"\\frz(-?[\d.]+)", ln).group(1)) for ln in ds]
        self.assertGreater(angles[0], 0)       # \frz antihorario: la primera, a la izquierda
        self.assertLess(angles[-1], 0)
        self.assertTrue(all(r"\org(" in ln for ln in ds))

    def test_con_fondo_el_texto_va_recto(self):
        ds = [ln for ln in _dialogues(build_ass([_text({"bg": "#000000", "bg_opacity": 1})], W, H)) if ",st," in ln]
        self.assertEqual(len(ds), 1)

    def test_brillo_curvo_tambien(self):
        doc = build_ass([_text({"glow": True, "glow_color": "#00ff00"})], W, H)
        halo = [ln for ln in _dialogues(doc) if ",sht," in ln]
        self.assertEqual(len(halo), 9)

    def test_curva_animada_fotograma_a_fotograma(self):
        kf = {"enabled": True, "items": [{"id": "a", "t": 0, "props": {"curve": 0.0}},
                                         {"id": "b", "t": 2, "props": {"curve": 1.0}}]}
        ds = [ln for ln in _dialogues(build_ass([_text(kf=kf)], W, H, fps=30)) if ",st," in ln]
        self.assertGreater(len(ds), 9 * 20)


if __name__ == "__main__":
    unittest.main()
