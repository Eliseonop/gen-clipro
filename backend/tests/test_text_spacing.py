"""Espaciado entre letras, interlineado y tamaño real de la letra (#6).

- El tamaño ASS se convierte con las métricas OS/2 de la fuente: libass toma el
  tamaño como alto de línea y el canvas como "em" (antes el texto exportado salía
  11 % más pequeño en Arial y 43 % en Anton).
- Cada línea va en su evento, a la altura del preview (``tamaño × interlineado``).
- El espaciado va en el estilo (``Spacing``) y, en textos animados, en ``\\fsp``.
"""
import re
import unittest

from app.font_metrics import ass_size_factor, text_width
from app.schemas import TimelineClip
from app.text_ass import (
    LINE_HEIGHT_DEFAULT, _line_height, _rows, animated_dialogues, build_ass, caption_dialogues,
)

W, H = 720, 1280


def _text(style=None, text="HHH\nHHH\nHHH", keyframes=None):
    return TimelineClip(
        id="t", track_id="T", kind="text", asset_kind="text", asset_id="t", filename="",
        start=0, in_point=0, out_point=1, source_duration=1, text=text,
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", "w": 0.9, **(style or {})},
        keyframes=keyframes,
    )


def _ys(lines):
    return [float(re.search(r"\\pos\([-\d.]+,([-\d.]+)\)", ln).group(1)) for ln in lines]


class FontSizeTest(unittest.TestCase):
    def test_factores_de_fuente(self):
        self.assertAlmostEqual(ass_size_factor("Arial", True), 1.117, places=2)
        self.assertAlmostEqual(ass_size_factor("Impact", False), 1.22, places=2)
        self.assertAlmostEqual(ass_size_factor("Anton", False), 1.733, places=2)
        self.assertAlmostEqual(ass_size_factor("FuenteQueNoExiste", True), ass_size_factor("Arial", True))

    def test_estilo_con_tamano_convertido(self):
        doc = build_ass([_text({"font": "Anton", "bold": False}, text="HOLA")], W, H)
        size = int(round(0.05 * H * ass_size_factor("Anton", False)))
        self.assertIn(f"Style: st,Anton,{size},", doc)

    def test_medida_como_el_canvas(self):
        self.assertGreater(text_width("Arial", True, 64, "GRAND CANYON"), 400)
        self.assertAlmostEqual(text_width("Arial", True, 64, "HH", 10) - text_width("Arial", True, 64, "HH"), 20)


class LineLayoutTest(unittest.TestCase):
    def test_una_linea_por_evento_a_la_altura_del_preview(self):
        for lh in (0.9, LINE_HEIGHT_DEFAULT, 1.8):
            lines = caption_dialogues(_text({"line_height": lh}), W, H)
            self.assertEqual(len(lines), 3)
            ys = _ys(lines)
            for a, b in zip(ys, ys[1:]):
                self.assertAlmostEqual(b - a, 0.05 * H * lh, delta=0.02)
            self.assertAlmostEqual(sum(ys) / 3, 0.5 * H, delta=0.02)   # bloque centrado

    def test_limites_del_interlineado(self):
        self.assertEqual(_line_height({}), LINE_HEIGHT_DEFAULT)
        self.assertEqual(_line_height({"line_height": 10}), 3.0)
        self.assertEqual(_line_height({"line_height": 0.1}), 0.6)

    def test_reparto_en_lineas_como_el_preview(self):
        rows = _rows({"font": "Arial", "size": 0.05, "w": 0.9}, W, H,
                     "UNO DOS TRES CUATRO CINCO SEIS SIETE OCHO NUEVE DIEZ ONCE DOCE")
        self.assertGreater(len(rows), 2)
        self.assertEqual(sum(len(r) for r in rows), 12)
        self.assertEqual(_rows({"font": "Arial", "size": 0.05}, W, H, "a\n\nb"), [["a"], [], ["b"]])

    def test_texto_girado_lineas_giran_con_el_bloque(self):
        lines = caption_dialogues(_text({"rotation": 30}), W, H)
        orgs = {re.search(r"\\org\(([^)]*)\)", ln).group(1) for ln in lines}
        self.assertEqual(orgs, {"360,640"})                             # un único centro de giro

    def test_karaoke_por_lineas_mantiene_la_palabra_activa(self):
        clip = _text({"word_fx": "highlight", "highlight_color": "#ff0000"}, text="uno dos\ntres")
        lines = caption_dialogues(clip, W, H)
        red = "\\c&H000000FF&"
        tres = [ln for ln in lines if "tres" in ln]
        self.assertTrue(tres[2].index(red) < tres[2].index("tres"))      # 3.ª ventana: "tres" activa
        self.assertNotIn(red, tres[0])


class LetterSpacingTest(unittest.TestCase):
    def test_espaciado_en_el_estilo(self):
        doc = build_ass([_text({"letter_spacing": 0.25}, text="HOLA")], W, H)
        style = next(ln for ln in doc.splitlines() if ln.startswith("Style: st,"))
        self.assertEqual(style.split(",")[13], "16")                    # 0.25 em × 64 px

    def test_espaciado_negativo_limitado(self):
        doc = build_ass([_text({"letter_spacing": -5}, text="HOLA")], W, H)
        style = next(ln for ln in doc.splitlines() if ln.startswith("Style: st,"))
        self.assertEqual(style.split(",")[13], "-32")                   # tope −0.5 em

    def test_espaciado_animado_escala_con_el_texto(self):
        base = {"x": 0.5, "y": 0.5, "rotation": 0, "opacity": 1}
        kf = {"enabled": True, "items": [
            {"id": "a", "t": 0, "interpolation": "linear", "props": {**base, "scale": 1}},
            {"id": "b", "t": 0.8, "interpolation": "linear", "props": {**base, "scale": 2}},
        ]}
        lines = animated_dialogues(_text({"letter_spacing": 0.25}, text="HOLA", keyframes=kf), W, H, fps=30)
        fsp = [float(re.search(r"\\fsp([-\d.]+)", ln).group(1)) for ln in lines]
        self.assertAlmostEqual(fsp[0], 16, delta=0.01)
        self.assertAlmostEqual(fsp[-1], 32, delta=0.01)


if __name__ == "__main__":
    unittest.main()
