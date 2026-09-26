"""Sombra paralela del texto = preview (frontend/src/lib/textShadow.test.mjs).

El export la dibuja como un evento ASS aparte (capa por debajo del texto, estilo
``sh<id>`` sin caja) con ``\\blur`` calibrado a la gaussiana del preview.
"""
import math
import re
import unittest

from app.schemas import TimelineClip
from app.text_ass import (
    GLOW_SIGMA_MAX, LIBASS_BLUR_SIGMA, SHADOW_DEFAULTS, animated_dialogues, build_ass, shadow_dialogues,
    text_glow, text_shadow,
)

W, H = 400, 400


def _clip(style=None, keyframes=None, text="HOLA"):
    return TimelineClip(
        id="t", track_id="T1", kind="text", asset_kind="text", asset_id="t", filename="",
        start=0, in_point=0, out_point=1, source_duration=1, text=text,
        style={"font": "Arial", "size": 0.1, "color": "#ffffff", "word_fx": "none", **(style or {})},
        keyframes=keyframes,
    )


SH = {"shadow": True, "shadow_color": "#ff0000", "shadow_opacity": 1, "shadow_distance": 0.3,
      "shadow_angle": 90, "shadow_blur": 0.2}


class GlowParamsTest(unittest.TestCase):
    """Brillo completo (CapCut): color propio, Intensidad, Intervalo, desplazamiento y estilo."""

    def test_color_propio_o_el_de_la_sombra(self):
        self.assertEqual(text_glow({"glow": True, "shadow_color": "#123456"}, 40)["color"], "#123456")
        self.assertEqual(text_glow({"glow": True, "shadow_color": "#123456", "glow_color": "#abcdef"}, 40)["color"], "#abcdef")
        self.assertIsNone(text_glow({"glow": False}, 40))
        self.assertIsNone(text_glow({"glow": True, "glow_intensity": 0}, 40))

    def test_intervalo_desplazamiento_y_estilo(self):
        g = text_glow({"glow": True, "glow_intensity": 0.5, "glow_range": 1, "glow_dx": 0.5, "glow_dy": 0.25}, 40)
        self.assertEqual(g["opacity"], 0.5)
        self.assertAlmostEqual(g["sigma"], GLOW_SIGMA_MAX * 40)
        self.assertEqual((g["dx"], g["dy"]), (20.0, -10.0))           # Y hacia arriba
        self.assertEqual(g["spread"], 0.0)
        self.assertGreater(text_glow({"glow": True, "glow_style": "strong"}, 40)["spread"], 0)

    def test_intenso_engorda_la_silueta(self):
        doc = build_ass([_clip({"glow": True, "glow_style": "strong", "border_width": 2})], W, H)
        halo = next(ln for ln in doc.splitlines() if ln.startswith("Dialogue") and ",sht," in ln)
        bord = float(re.search(r"\\bord([\d.]+)", halo).group(1))
        self.assertGreater(bord, 2)


class TextShadowParamsTest(unittest.TestCase):
    def test_sin_sombra_o_con_brillo(self):
        self.assertIsNone(text_shadow({}, 40))
        self.assertIsNone(text_shadow({"shadow": True, "shadow_opacity": 0}, 40))
        # Con Brillo, la silueta de debajo es su halo (no la sombra paralela).
        glow = text_shadow({"shadow": True, "glow": True, "glow_color": "#00ff00"}, 40)
        self.assertEqual(glow["color"], "#00ff00")
        self.assertEqual((glow["dx"], glow["dy"]), (0.0, 0.0))

    def test_defaults_iguales_que_el_preview(self):
        d = text_shadow({"shadow": True}, 40)
        self.assertEqual(d["color"], "#000000")
        self.assertAlmostEqual(d["opacity"], SHADOW_DEFAULTS["opacity"])
        self.assertAlmostEqual(d["dx"], math.cos(math.pi / 4) * 0.06 * 40)
        self.assertAlmostEqual(d["dy"], math.sin(math.pi / 4) * 0.06 * 40)
        self.assertAlmostEqual(d["sigma"], 0.05 * 40)

    def test_angulo_distancia_desenfoque(self):
        s = text_shadow(SH, 40)
        self.assertAlmostEqual(s["dx"], 0, places=9)
        self.assertAlmostEqual(s["dy"], 12)
        self.assertAlmostEqual(s["sigma"], 8)

    def test_limites(self):
        s = text_shadow({"shadow": True, "shadow_distance": 5, "shadow_angle": 0, "shadow_blur": -1,
                         "shadow_opacity": 3}, 10)
        self.assertAlmostEqual(s["dx"], 10)
        self.assertAlmostEqual(s["sigma"], 0)
        self.assertAlmostEqual(s["opacity"], 1)


class TextShadowAssTest(unittest.TestCase):
    def test_evento_sombra_desplazado_y_desenfocado(self):
        clip = _clip(SH)
        ev = shadow_dialogues(clip, W, H, clip.style, layer=4)
        self.assertEqual(len(ev), 1)
        self.assertTrue(ev[0].startswith("Dialogue: 4,"))
        self.assertIn(",sht,", ev[0])
        self.assertIn("\\pos(200,212)", ev[0])            # 0.3 em de 40 px hacia abajo
        self.assertIn(f"\\blur{8 / LIBASS_BLUR_SIGMA:.2f}".rstrip("0"), ev[0])
        self.assertIn("\\c&H000000FF&", ev[0])            # rojo en BGR

    def test_build_ass_capas_y_estilo_sin_caja(self):
        doc = build_ass([_clip({**SH, "bg": "#111111"})], W, H)
        self.assertIn("Style: sht,", doc)
        sh_style = next(ln for ln in doc.splitlines() if ln.startswith("Style: sht,"))
        main_style = next(ln for ln in doc.splitlines() if ln.startswith("Style: st,"))
        self.assertEqual(sh_style.split(",")[15], "1")    # BorderStyle 1: la sombra no lleva caja
        self.assertEqual(main_style.split(",")[15], "4")  # el texto sí (caja en BackColour)
        self.assertEqual(main_style.split(",")[17], "0")  # y ya no usa la sombra del estilo
        layers = [int(ln.split(",")[0].split()[1]) for ln in doc.splitlines() if ln.startswith("Dialogue")]
        self.assertEqual(sorted(layers), [0, 1])

    def test_texto_sin_sombra_no_genera_eventos_extra(self):
        doc = build_ass([_clip()], W, H)
        self.assertNotIn("Style: sht,", doc)
        self.assertEqual(doc.count("Dialogue:"), 1)

    def test_brillo_va_en_su_evento_debajo_del_texto(self):
        doc = build_ass([_clip({"glow": True, "shadow": True, "glow_color": "#00ff00"})], W, H)
        main_style = next(ln for ln in doc.splitlines() if ln.startswith("Style: st,"))
        self.assertEqual(main_style.split(",")[17], "0")          # ya no es la sombra del estilo
        self.assertIn("Style: sht,", doc)
        halo = next(ln for ln in doc.splitlines() if ln.startswith("Dialogue") and ",sht," in ln)
        self.assertIn(r"\c&H1900FF00&", halo)                    # verde, intensidad 0,9
        self.assertIn(r"\blur", halo)

    def test_texto_animado_lleva_sombra_por_fotograma(self):
        kf = {"enabled": True, "items": [
            {"id": "a", "t": 0, "interpolation": "linear", "props": {"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1}},
            {"id": "b", "t": 1, "interpolation": "linear", "props": {"x": 0.5, "y": 0.5, "scale": 2, "rotation": 0, "opacity": 1}},
        ]}
        clip = _clip(SH, keyframes=kf)
        ev = animated_dialogues(clip, W, H, clip.style, fps=30, layer=0, shadow=True)
        ys = [float(re.search(r"\\pos\([-\d.]+,([-\d.]+)\)", e).group(1)) for e in ev]
        # La distancia crece con la escala del texto: 12 px → casi 24 px.
        self.assertAlmostEqual(ys[0] - 200, 12, delta=0.05)
        self.assertGreater(ys[-1] - 200, 23)


if __name__ == "__main__":
    unittest.main()
