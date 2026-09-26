"""Diseño del texto como CapCut: B / U / I y May./min. (TT, tt, Tt).

- Cursiva y subrayado van en el estilo ASS (campos ``Italic`` / ``Underline``).
- May./min. solo cambia cómo se ve: el export usa el texto transformado, el
  guardado no cambia (espejo de ``applyTextCase`` del preview).
"""
import re
import unittest

from app.schemas import TimelineClip
from app.text_ass import apply_text_case, build_ass, caption_dialogues, stretch_of

W, H = 720, 1280


def _text(style=None, text="hola MUNDO"):
    return TimelineClip(
        id="t", track_id="T", kind="text", asset_kind="text", asset_id="t", filename="",
        start=0, in_point=0, out_point=1, source_duration=1, text=text,
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", **(style or {})},
    )


def _style_fields(doc: str) -> list[str]:
    line = next(ln for ln in doc.splitlines() if ln.startswith("Style: st,"))
    return line.split(",")


class TextCaseTest(unittest.TestCase):
    def test_modos(self):
        self.assertEqual(apply_text_case("hola MUNDO", "upper"), "HOLA MUNDO")
        self.assertEqual(apply_text_case("hola MUNDO", "lower"), "hola mundo")
        self.assertEqual(apply_text_case("hola MUNDO\nqué tal", "title"), "Hola Mundo\nQué Tal")
        self.assertEqual(apply_text_case("hola", None), "hola")
        self.assertEqual(apply_text_case("hola", "raro"), "hola")
        self.assertEqual(apply_text_case(None, "upper"), "")

    def test_titulo_respeta_espacios_y_saltos(self):
        self.assertEqual(apply_text_case("  a  b\n c", "title"), "  A  B\n C")

    def test_export_usa_el_texto_transformado(self):
        doc = build_ass([_text({"text_case": "upper"})], W, H)
        self.assertIn("HOLA MUNDO", doc)
        self.assertNotIn("hola", doc)

    def test_la_pista_tambien_puede_fijarlo(self):
        class Track:
            id = "T"
            style = {"text_case": "lower"}
        doc = build_ass([_text()], W, H, [Track()])
        self.assertIn("hola mundo", doc)

    def test_sin_modo_no_toca_el_texto(self):
        self.assertIn("hola MUNDO", build_ass([_text()], W, H))


class DesignFlagsTest(unittest.TestCase):
    def test_cursiva_y_subrayado_en_el_estilo(self):
        f = _style_fields(build_ass([_text({"italic": True, "underline": True})], W, H))
        # Name, Fontname, Fontsize, Primary, Secondary, Outline, Back, Bold, Italic, Underline…
        self.assertEqual(f[8], "-1")
        self.assertEqual(f[9], "-1")

    def test_por_defecto_sin_cursiva_ni_subrayado(self):
        f = _style_fields(build_ass([_text()], W, H))
        self.assertEqual(f[8], "0")
        self.assertEqual(f[9], "0")


class FarPositionTest(unittest.TestCase):
    """Como CapCut (−5000 en X/Y): un texto puede empezar muy fuera del cuadro."""

    def test_posicion_muy_fuera_se_respeta(self):
        line = caption_dialogues(_text({"x": -8.0, "y": 9.5}, text="HOLA"), W, H)[0]
        x, y = (float(v) for v in re.search(r"\\pos\(([-\d.]+),([-\d.]+)\)", line).groups())
        self.assertAlmostEqual(x, -8.0 * W, delta=1)
        self.assertAlmostEqual(y, 9.5 * H, delta=1)


class BackgroundBoxTest(unittest.TestCase):
    """Fondo: caja por línea en el color de fondo (libass BorderStyle 4), aunque no
    haya contorno. Antes (BorderStyle 3) salía en el color del contorno o no salía."""

    def test_caja_en_backcolour_sin_contorno(self):
        f = _style_fields(build_ass([_text({"bg": "#7b2cff", "bg_opacity": 1, "border_width": 0})], W, H))
        # …, BackColour (6), …, BorderStyle (15), Outline (16), Shadow (17)
        self.assertEqual(f[6], "&H00FF2C7B&")
        self.assertEqual(f[15], "4")
        self.assertEqual(f[16], "0")

    def test_color_y_opacidad_de_la_caja_en_linea(self):
        doc = build_ass([_text({"bg": "#000000", "bg_opacity": 0.5, "word_fx": "highlight",
                                "inactive_opacity": 0.5}, text="hola mundo")], W, H)
        line = next(ln for ln in doc.splitlines() if ln.startswith("Dialogue"))
        # Cada palabra repite la caja con SU opacidad (no la de la palabra inactiva).
        self.assertEqual(line.count(r"\4c&H00000000&\4a&H80&"), 2)

    def test_brillo_no_usa_la_sombra_del_estilo_con_caja(self):
        f = _style_fields(build_ass([_text({"bg": "#111111", "glow": True})], W, H))
        self.assertEqual(f[17], "0")

    def test_sin_fondo_no_hay_caja(self):
        doc = build_ass([_text()], W, H)
        self.assertEqual(_style_fields(doc)[15], "1")
        self.assertNotIn(r"\4c&H00", next(ln for ln in doc.splitlines() if ln.startswith("Dialogue")))


class StretchTest(unittest.TestCase):
    """Escala uniforme apagada: Escala X / Y del texto (fscx / fscy y distancias estiradas)."""

    def test_solo_con_el_interruptor_apagado(self):
        self.assertEqual(stretch_of({"stretch_x": 2, "stretch_y": 0.5}), (1.0, 1.0))
        self.assertEqual(stretch_of({"scale_split": True, "stretch_x": 2, "stretch_y": 0.5}), (2.0, 0.5))
        self.assertEqual(stretch_of({"scale_split": True}), (1.0, 1.0))
        self.assertEqual(stretch_of({"scale_split": True, "stretch_x": 1000}), (100.0, 1.0))

    def test_letras_y_lineas_estiradas(self):
        base = {"w": 0.3, "x": 0.5, "y": 0.5}
        flat = build_ass([_text(base, text="hola mundo que tal")], W, H)
        wide = build_ass([_text({**base, "scale_split": True, "stretch_x": 2, "stretch_y": 0.5},
                                text="hola mundo que tal")], W, H)
        self.assertIn(r"\fscx200\fscy50", wide)

        def ys(doc):
            return [float(m) for m in re.findall(r"\\pos\([-\d.]+,([-\d.]+)\)", doc)]

        def gap(v):
            return max(v) - min(v)

        self.assertAlmostEqual(gap(ys(wide)), gap(ys(flat)) * 0.5, delta=1)


if __name__ == "__main__":
    unittest.main()
