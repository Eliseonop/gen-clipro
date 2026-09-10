"""Motion Studio: modelo, validación y generador HTML (Fase 0/1 MVP).

Contrato: la composición es la fuente de verdad; el generador produce un HTML
autocontenido (GSAP + runtime + fuente inline) idéntico para preview y render.
"""
import unittest

from app.clip_kind import ASSET_DISK_KIND, ffmpeg_input_args, track_kind_for_clip
from app.motion.generator import generate_html
from app.motion.models import (
    MotionAnimation,
    MotionComposition,
    MotionLayer,
    MotionTween,
)
from app.motion.validator import MotionValidationError, validate


def _comp(**kw):
    base = dict(
        id="mg_1", name="Test", width=1080, height=1920, fps=30, duration=3.0,
        layers=[MotionLayer(id="t1", type="text", content="HOLA", x=540, y=960)],
    )
    base.update(kw)
    return MotionComposition(**base)


class ValidatorTest(unittest.TestCase):
    def test_valid_composition_has_no_errors(self):
        self.assertEqual(validate(_comp()), [])

    def test_duplicate_layer_ids(self):
        c = _comp(layers=[
            MotionLayer(id="x", type="text", content="a", x=0, y=0),
            MotionLayer(id="x", type="text", content="b", x=0, y=0),
        ])
        self.assertTrue(any("duplicado" in e for e in validate(c)))

    def test_empty_text_layer_flagged(self):
        c = _comp(layers=[MotionLayer(id="t", type="text", content="  ", x=0, y=0)])
        self.assertTrue(any("sin contenido" in e for e in validate(c)))

    def test_layer_end_beyond_duration(self):
        c = _comp(duration=2.0, layers=[
            MotionLayer(id="t", type="text", content="a", x=0, y=0, start=0, end=5),
        ])
        self.assertTrue(any("supera la duración" in e for e in validate(c)))

    def test_start_not_before_end(self):
        c = _comp(layers=[
            MotionLayer(id="t", type="text", content="a", x=0, y=0, start=2, end=1),
        ])
        self.assertTrue(any("mayor que start" in e for e in validate(c)))

    def test_bad_ease_rejected(self):
        c = _comp(layers=[MotionLayer(
            id="t", type="text", content="a", x=0, y=0,
            animation=MotionAnimation(entrance=MotionTween(type="fade", ease="evil()")),
        )])
        self.assertTrue(any("ease" in e for e in validate(c)))

    def test_entrance_longer_than_life_rejected(self):
        c = _comp(duration=1.0, layers=[MotionLayer(
            id="t", type="text", content="a", x=0, y=0, start=0, end=1,
            animation=MotionAnimation(entrance=MotionTween(type="fade", duration=5)),
        )])
        self.assertTrue(any("no cabe" in e for e in validate(c)))

    def test_unsupported_layer_type_flagged(self):
        c = _comp(layers=[MotionLayer(id="t", type="lottie", content="x", x=0, y=0)])
        self.assertTrue(any("no soportado" in e for e in validate(c)))

    def test_bad_dimensions(self):
        self.assertTrue(validate(_comp(width=0)))
        self.assertTrue(validate(_comp(height=99999)))
        self.assertTrue(validate(_comp(fps=0)))

    def test_background_must_be_transparent_or_hex(self):
        self.assertEqual(validate(_comp(background="#101010")), [])
        self.assertTrue(validate(_comp(background="rojo")))


class GeneratorTest(unittest.TestCase):
    def test_html_is_self_contained(self):
        html = generate_html(_comp())
        self.assertIn("<!doctype html>", html)
        self.assertIn("GSAP 3.12", html)          # GSAP embebido
        self.assertIn("window.__seek", html)       # runtime embebido
        self.assertIn("@font-face", html)          # fuente embebida
        self.assertIn("__COMP", html)

    def test_content_is_escaped_into_json(self):
        html = generate_html(_comp(layers=[
            MotionLayer(id="t", type="text", content="A</script>B", x=0, y=0),
        ]))
        # El contenido va dentro del JSON de __COMP, no como HTML crudo.
        self.assertNotIn("A</script>B", html.split("window.__COMP")[0])

    def test_dimensions_in_css(self):
        html = generate_html(_comp(width=720, height=1280))
        self.assertIn("width:720px", html)
        self.assertIn("height:1280px", html)


class ShapeLayerTest(unittest.TestCase):
    def test_circle_layer_valid(self):
        c = _comp(layers=[MotionLayer(id="n1", type="shape", x=100, y=100,
                                      shape={"kind": "circle", "radius": 30, "fill": "#39d0ff", "glow": 12})])
        self.assertEqual(validate(c), [])

    def test_shape_without_shape_obj_flagged(self):
        c = _comp(layers=[MotionLayer(id="s", type="shape", x=0, y=0)])
        self.assertTrue(any("sin 'shape'" in e for e in validate(c)))

    def test_line_requires_endpoints(self):
        c = _comp(layers=[MotionLayer(id="l", type="shape", x=0, y=0,
                                      shape={"kind": "line"})])
        self.assertTrue(any("x2/y2" in e for e in validate(c)))
        c2 = _comp(layers=[MotionLayer(id="l", type="shape", x=0, y=0,
                                       shape={"kind": "line", "x2": 500, "y2": 200})])
        self.assertEqual(validate(c2), [])

    def test_bad_effect_flagged(self):
        c = _comp(layers=[MotionLayer(id="n", type="shape", x=0, y=0,
                                      shape={"kind": "circle"}, effect={"type": "explode"})])
        self.assertTrue(any("efecto" in e for e in validate(c)))

    def test_draw_entrance_allowed_for_line(self):
        from app.motion.models import MotionAnimation, MotionTween
        c = _comp(layers=[MotionLayer(id="l", type="shape", x=0, y=0,
                                      shape={"kind": "line", "x2": 300, "y2": 0},
                                      animation=MotionAnimation(entrance=MotionTween(type="draw", duration=0.5)))])
        self.assertEqual(validate(c), [])

    def test_generator_has_shape_classes(self):
        c = _comp(layers=[MotionLayer(id="n", type="shape", x=100, y=100,
                                      shape={"kind": "circle", "radius": 20})])
        html = generate_html(c)
        self.assertIn(".mg-circle", html)
        self.assertIn(".mg-line", html)
        self.assertIn(".mg-dot", html)


class TemplateTest(unittest.TestCase):
    def test_neural_network_template_valid(self):
        from app.motion import templates
        keys = [t["key"] for t in templates.list_templates()]
        self.assertIn("neural_network", keys)
        comp = templates.instantiate("neural_network", "nn", {"output": "PERRO", "hidden": 4})
        self.assertEqual(validate(comp), [])
        kinds = {}
        for l in comp.layers:
            k = l.type if l.type != "shape" else l.shape.kind
            kinds[k] = kinds.get(k, 0) + 1
        self.assertGreater(kinds.get("line", 0), 0)    # conexiones
        self.assertGreater(kinds.get("circle", 0), 0)  # nodos
        self.assertTrue(any(l.content == "Predicción: PERRO" for l in comp.layers))


class ClipKindTest(unittest.TestCase):
    def test_motion_maps_to_video_track(self):
        self.assertEqual(track_kind_for_clip("motion"), "video")

    def test_motion_asset_disk_kind(self):
        self.assertEqual(ASSET_DISK_KIND.get("motion"), "motion")

    def test_motion_input_forces_vp9_decoder(self):
        # El decoder VP9 por defecto no expone el alfa; hay que forzar libvpx-vp9
        # o la zona transparente del motion graphic saldría negra al componer.
        args = ffmpeg_input_args({"kind": "motion"}, "/x/mg.webm", 30)
        self.assertEqual(args[:2], ["-c:v", "libvpx-vp9"])
        self.assertIn("-i", args)

    def test_video_input_unchanged(self):
        self.assertEqual(ffmpeg_input_args({"kind": "video"}, "/x/v.mp4", 30), ["-i", "/x/v.mp4"])


if __name__ == "__main__":
    unittest.main()
