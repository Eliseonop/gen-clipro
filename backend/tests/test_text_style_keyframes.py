"""Keyframes del estilo del texto (Color, Trazo, Fondo, Sombra), como CapCut.

Espejo de ``clipKeyframes.js`` (textStyleAt / withTextStyleKf): cada propiedad
de estilo lleva sus propios keyframes y un item de solo estilo no toca la pose.
"""
import re
import unittest

from app.clip_attrs import paste_attributes
from app.clip_keyframes import clip_props_at, text_style_animates, text_style_at, with_text_style_kf
from app.schemas import TimelineClip
from app.text_ass import build_ass, text_animates

W, H = 720, 1280


def _kf(t, **props):
    return {"id": f"k{t}", "t": t, "interpolation": "linear", "props": props}


def _text(items, style=None, dur=2.0):
    return TimelineClip(
        id="t", track_id="T", kind="text", asset_kind="text", asset_id="t", filename="",
        start=0, in_point=0, out_point=dur, source_duration=dur, text="HOLA",
        style={"font": "Arial", "size": 0.05, "color": "#ffffff", "word_fx": "none", **(style or {})},
        keyframes={"enabled": True, "items": items},
    )


class InterpTest(unittest.TestCase):
    def test_item_de_solo_estilo_no_toca_la_pose(self):
        c = _text([_kf(0, x=0.2, y=0.5), _kf(1, color="#ff0000"), _kf(2, x=0.8, y=0.5)])
        self.assertAlmostEqual(clip_props_at(c, 1)["x"], 0.5)

    def test_color_se_mezcla_en_rgb(self):
        c = _text([_kf(0, color="#ff0000"), _kf(2, color="#0000ff", border_width=6)])
        self.assertEqual(text_style_at(c, 1)["color"], "#800080")
        self.assertEqual(text_style_at(c, 1)["border_width"], 6.0)
        self.assertTrue(text_style_animates(c))

    def test_un_solo_valor_no_anima(self):
        c = _text([_kf(0, x=0.5, color="#00ff00")])
        self.assertEqual(text_style_at(c, 1), {"color": "#00ff00"})
        self.assertFalse(text_style_animates(c))

    def test_valores_no_validos_se_ignoran(self):
        c = _text([_kf(0, bg="none", color="rojo")])
        self.assertEqual(text_style_at(c, 0), {})

    def test_sin_keyframes_activos_no_hay_estilo_animado(self):
        c = _text([_kf(0, color="#ff0000")]).model_copy(update={"keyframes": {"enabled": False, "items": []}})
        self.assertEqual(text_style_at(c, 0), {})

    def test_las_casillas_mandan(self):
        off = with_text_style_kf({"bg": "none", "border_width": 0}, {"bg": "#111111", "border_width": 5})
        self.assertEqual((off["bg"], off["border_width"]), ("none", 0))
        on = with_text_style_kf({"bg": "#000000", "border_width": 2}, {"bg": "#111111", "border_width": 5})
        self.assertEqual((on["bg"], on["border_width"]), ("#111111", 5))


class ExportTest(unittest.TestCase):
    def _dialogues(self, doc):
        return [ln for ln in doc.splitlines() if ln.startswith("Dialogue")]

    def test_color_animado_va_fotograma_a_fotograma(self):
        c = _text([_kf(0, color="#ff0000"), _kf(2, color="#0000ff")])
        self.assertTrue(text_animates(c, 30))
        seq = [re.findall(r"\\c&H00([0-9A-F]{6})&", ln)[0] for ln in self._dialogues(build_ass([c], W, H, fps=30))]
        self.assertEqual(seq[0], "0000FF")               # rojo al principio (BGR)
        self.assertGreater(int(seq[-1][:2], 16), 0xF0)  # casi azul en el último fotograma
        self.assertGreater(len(set(seq)), 10)

    def test_grosor_del_trazo_animado(self):
        c = _text([_kf(0, border_width=1), _kf(2, border_width=9)], style={"border_width": 4})
        bords = {float(m) for ln in self._dialogues(build_ass([c], W, H, fps=30))
                 for m in re.findall(r"\\bord([\d.]+)", ln)}
        self.assertEqual(min(bords), 1.0)
        self.assertGreater(max(bords), 8.8)

    def test_un_keyframe_de_color_fija_el_color_del_texto_quieto(self):
        c = _text([_kf(0, x=0.5, y=0.5, color="#00ff00")])
        doc = build_ass([c], W, H)
        self.assertFalse(text_animates(c, 30))
        self.assertIn(r"\c&H0000FF00&", self._dialogues(doc)[0])

    def test_fondo_animado_en_la_caja(self):
        c = _text([_kf(0, bg="#000000"), _kf(2, bg="#ffffff")], style={"bg": "#000000", "bg_opacity": 1})
        # Texto animado: la caja va dibujada (forma \p1 detrás del texto), en su color.
        boxes = [ln for ln in self._dialogues(build_ass([c], W, H, fps=30)) if r"\p1" in ln]
        seq = [re.findall(r"\\c&H00([0-9A-F]{6})&", ln)[0] for ln in boxes]
        self.assertEqual(seq[0], "000000")
        self.assertGreater(int(seq[-1][:2], 16), 0xF0)


class PasteAttributesTest(unittest.TestCase):
    def _txt(self, cid, items):
        return {"id": cid, "kind": "text", "style": {"x": 0.5, "y": 0.5},
                "keyframes": {"enabled": True, "items": items}}

    def test_pegar_animacion_conserva_el_color_animado(self):
        red = self._txt("R", [_kf(0, color="#ff0000"), _kf(1, color="#0000ff")])
        moving = self._txt("M", [_kf(0, x=0.2), _kf(2, x=0.8)])
        out = paste_attributes(red, moving, ["animation"])
        self.assertEqual(text_style_at(out, 0.5)["color"], "#800080")
        self.assertAlmostEqual(clip_props_at(out, 1)["x"], 0.5)

    def test_pegar_estilo_trae_el_color_animado(self):
        red = self._txt("R", [_kf(0, color="#ff0000"), _kf(1, color="#0000ff")])
        moving = self._txt("M", [_kf(0, x=0.2), _kf(2, x=0.8)])
        out = paste_attributes(moving, red, ["style"])
        self.assertEqual(text_style_at(out, 1)["color"], "#0000ff")
        self.assertAlmostEqual(clip_props_at(out, 1)["x"], 0.5)


if __name__ == "__main__":
    unittest.main()
