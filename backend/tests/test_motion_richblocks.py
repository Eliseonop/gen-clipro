"""Bloques HTML+GSAP, temas y plantillas pulidas (calidad pro de motion)."""
import unittest

from app.motion import templates as T
from app.motion import themes
from app.motion.generator import generate_html
from app.motion.models import MotionComposition, MotionLayer
from app.motion.validator import validate


class ThemeTest(unittest.TestCase):
    def test_default_is_light_and_accent_override(self):
        self.assertEqual(themes.DEFAULT_THEME, "light")
        t = themes.resolve_theme(None)
        self.assertEqual(t["accent"], themes.THEMES[themes.DEFAULT_THEME]["accent"])
        t2 = themes.resolve_theme("dark", accent="#E07B1A")
        self.assertEqual(t2["accent"], "#E07B1A")

    def test_unknown_theme_falls_back_to_default(self):
        self.assertEqual(themes.resolve_theme("nope")["bg"],
                         themes.THEMES[themes.DEFAULT_THEME]["bg"])

    def test_bad_accent_ignored(self):
        self.assertEqual(themes.resolve_theme("dark", accent="rojo")["accent"],
                         themes.THEMES["dark"]["accent"])

    def test_themes_carry_neutral_tokens(self):
        for key in themes.THEMES:
            th = themes.resolve_theme(key)
            self.assertIn("border", th)
            self.assertIn("shadow", th)


class HtmlLayerValidationTest(unittest.TestCase):
    def _comp(self, layer):
        return MotionComposition(id="c", width=1080, height=1920, fps=30, duration=4.0,
                                 layers=[layer])

    def test_valid_html_layer(self):
        c = self._comp(MotionLayer(id="h", type="html", html="<div>x</div>", js="tl.from(root,{})"))
        self.assertEqual(validate(c), [])

    def test_html_layer_needs_html_or_js(self):
        c = self._comp(MotionLayer(id="h", type="html"))
        self.assertTrue(any("falta 'html' o 'js'" in e for e in validate(c)))

    def test_script_in_html_rejected(self):
        c = self._comp(MotionLayer(id="h", type="html", html="<script>alert(1)</script>"))
        self.assertTrue(any("<script>" in e for e in validate(c)))

    def test_oversized_js_rejected(self):
        c = self._comp(MotionLayer(id="h", type="html", html="<i></i>", js="x" * 20001))
        self.assertTrue(any("demasiado grande" in e for e in validate(c)))


class TemplateTest(unittest.TestCase):
    def test_all_templates_valid(self):
        for t in T.list_templates():
            comp = T.instantiate(t["key"], "mg_t", {})
            self.assertEqual(validate(comp), [], f"{t['key']} debería validar")

    def test_templates_listed(self):
        keys = {t["key"] for t in T.list_templates()}
        self.assertTrue({"pro_title", "title", "bullet_list", "quote", "stat",
                         "bar_chart", "lower-third", "subscribe", "neural_network"} <= keys)

    def test_stat_counts_and_uses_theme(self):
        comp = T.instantiate("stat", "mg_s", {"value": 87, "suffix": "%", "accent": "#0ea5e9"})
        self.assertEqual(len(comp.layers), 1)
        layer = comp.layers[0]
        self.assertEqual(layer.type, "html")
        self.assertIn("data-value=\"87\"", layer.html)
        self.assertIn("onUpdate", layer.js)
        self.assertEqual(comp.metadata["theme"]["accent"], "#0ea5e9")

    def test_html_templates_use_fromto_not_from(self):
        # gsap.from()/to() no se rebobinan bien → 2ª reproducción invisible. Las
        # plantillas html deben usar SOLO fromTo() para ser seekables.
        for t in T.list_templates():
            comp = T.instantiate(t["key"], "mg_f", {})
            for layer in comp.layers:
                if layer.type == "html" and layer.js:
                    self.assertNotIn("tl.from(", layer.js, f"{t['key']}: usa tl.from()")
                    self.assertNotIn("tl.to(", layer.js, f"{t['key']}: usa tl.to()")

    def test_templates_have_no_neon_glow(self):
        # El rediseño limpio no debe emitir glow (neón) en las formas.
        for t in T.list_templates():
            comp = T.instantiate(t["key"], "mg_g", {})
            for layer in comp.layers:
                if layer.type == "shape" and layer.shape:
                    self.assertFalse(layer.shape.glow, f"{t['key']} no debería tener glow")

    def test_bar_chart_is_html_block_with_data(self):
        comp = T.instantiate("bar_chart", "mg_b",
                             {"unit": "%", "accent": "#E07B1A",
                              "data": [{"label": "A", "value": 20}, {"label": "B", "value": 80}]})
        self.assertEqual(len(comp.layers), 1)
        layer = comp.layers[0]
        self.assertEqual(layer.type, "html")
        self.assertIn("gm-bar", layer.html)
        self.assertIn("data-value=\"80\"", layer.html)
        self.assertEqual(comp.metadata["theme"]["accent"], "#E07B1A")

    def test_bar_chart_renders_html_with_js(self):
        comp = T.instantiate("bar_chart", "mg_b", {})
        html = generate_html(comp)
        self.assertIn("gm-bar", html)
        self.assertIn("onUpdate", html)              # el conteo animado
        self.assertIn("fonts.googleapis", html)      # fuentes pro cargadas

    def test_pro_title_uses_accent(self):
        comp = T.instantiate("pro_title", "mg_p", {"accent": "#ff0044", "kicker": "K", "title": "T"})
        colors = {l.style.get("color") for l in comp.layers if l.type == "text"}
        strokes = {l.shape.stroke for l in comp.layers if l.type == "shape" and l.shape}
        self.assertIn("#ff0044", colors | strokes)


if __name__ == "__main__":
    unittest.main()
