"""Modos de fusión (#8): mismos modos que el preview (frontend/src/lib/clipBlend.js)
y filtergraph que reproduce las fórmulas W3C del canvas. De paso: opacidad fija y
giro sin recortar en el export."""
import unittest
from pathlib import Path

from app import compose
from app.clip_blend import BLEND_MODES, blend_steps, clip_blend
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import update_clip

W, H = 360, 640
TRACKS = [TimelineTrack(id="V1", kind="video", name="V1"), TimelineTrack(id="V2", kind="video", name="V2"),
          TimelineTrack(id="T1", kind="text", name="T1")]


def _image(cid="i1", track="V2", **kw):
    kw.setdefault("transform", {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0})
    return TimelineClip(id=cid, track_id=track, kind="image", asset_kind="images", asset_id=cid,
                        filename=f"{cid}.png", start=0.0, in_point=0, out_point=2.0, source_duration=2.0,
                        layout="overlay", **kw)


def _text(**kw):
    return TimelineClip(id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t1", filename="",
                        start=0.0, in_point=0, out_point=2.0, source_duration=2.0, text="HOLA",
                        style={"font": "Arial", "size": 0.06, "color": "#ffffff", "word_fx": "none"}, **kw)


class BlendModelTest(unittest.TestCase):
    def test_modos_iguales_que_el_preview(self):
        self.assertEqual(BLEND_MODES, (
            "normal", "darken", "multiply", "color_burn", "lighten", "screen", "color_dodge",
            "overlay", "soft_light", "hard_light", "difference", "exclusion"))

    def test_clip_blend(self):
        self.assertEqual(clip_blend(_image()), "normal")
        self.assertEqual(clip_blend(_image(blend_mode="screen")), "screen")
        self.assertEqual(clip_blend({"blend_mode": "raro"}), "normal")

    def test_update_clip(self):
        tl = Timeline(tracks=TRACKS, clips=[_image()])
        out = update_clip(tl, "i1", {"blend_mode": "multiply"}).timeline
        self.assertEqual(out.clips[0].blend_mode, "multiply")
        out = update_clip(out, "i1", {"blend_mode": "normal"}).timeline
        self.assertIsNone(out.clips[0].blend_mode)
        with self.assertRaises(ValueError):
            update_clip(out, "i1", {"blend_mode": "raro"})


class BlendStepsTest(unittest.TestCase):
    def test_orden_de_entradas(self):
        # Superponer: arriba el fondo (la condición de W3C es sobre el fondo).
        steps = blend_steps("base", "lay", "overlay", "0", "out", 0, 2)
        self.assertIn("[fbk0][flr0]blend=all_mode=overlay", "".join(steps))
        # Sobreexponer: FFmpeg lo define al revés → arriba el clip.
        steps = blend_steps("base", "lay", "color_dodge", "0", "out", 0, 2)
        self.assertIn("[flr0][fbk0]blend=all_mode=dodge", "".join(steps))

    def test_luz_suave_con_lut2(self):
        joined = "".join(blend_steps("base", "lay", "soft_light", "0", "out", 1, 3))
        self.assertIn("lut2=c0=", joined)
        self.assertIn("enable='between(t,1.000,3.000)'", joined)
        self.assertNotIn("softlight", joined)

    def test_mezcla_con_el_alfa_del_clip(self):
        steps = blend_steps("base", "lay", "multiply", "7", "out", 0, 2)
        self.assertEqual(steps[-1], "[fbb7][fbx7][flm7]maskedmerge[out]")
        self.assertIn("alphaextract", steps[2])


class BlendExportTest(unittest.TestCase):
    def setUp(self):
        from app import detect
        self._saved = (compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims)
        compose._clip_path = lambda _p, _c, _s=None: Path(__file__)
        compose._has_audio = lambda _p: False
        compose._color_untagged = lambda _p: False
        detect.dims = lambda _p: (300, 200)

    def tearDown(self):
        from app import detect
        compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims = self._saved

    def _fc(self, clips):
        tl = Timeline(fps=30, width=W, height=H, tracks=TRACKS, clips=clips)
        ass, layers, _tracks = compose._prepare_texts(tl, Path("x.mp4"), W, H)
        cmd = compose.build_command(Project(id="p", name="p", created_at="n", timeline=tl), tl, Path("x.mp4"),
                                    ass_path=ass, text_layers=layers)
        return cmd[cmd.index("-filter_complex") + 1], layers

    def test_clip_normal_sin_fusion(self):
        fc, _ = self._fc([_image()])
        self.assertNotIn("blend=", fc)
        self.assertNotIn("maskedmerge", fc)

    def test_clip_fundido(self):
        fc, _ = self._fc([_image("b", "V1"), _image(blend_mode="screen")])
        self.assertIn("color=c=black@0", fc)
        self.assertIn("blend=all_mode=screen", fc)
        self.assertIn("maskedmerge", fc)

    def test_texto_fundido_va_en_capa_propia(self):
        fc, layers = self._fc([_image("b", "V1"), _text(blend_mode="overlay")])
        self.assertIn("t1", layers)
        self.assertIn("blend=all_mode=overlay", fc)
        _, layers = self._fc([_image("b", "V1"), _text()])
        self.assertNotIn("t1", layers)

    def test_opacidad_fija_se_exporta(self):
        # Antes solo se exportaba la opacidad animada: un clip al 60 % salía opaco.
        fc, _ = self._fc([_image(opacity=0.6)])
        self.assertIn("colorchannelmixer=aa=0.600", fc)
        fc, _ = self._fc([_image()])
        self.assertNotIn("colorchannelmixer", fc)

    def test_giro_fijo_no_recorta(self):
        # rotw/roth reciben el ÁNGULO (antes el ancho: la imagen perdía las esquinas).
        fc, _ = self._fc([_image(transform={"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 20})])
        self.assertIn("ow=rotw(20.000*PI/180):oh=roth(20.000*PI/180)", fc)
        self.assertNotIn("rotw(iw)", fc)


if __name__ == "__main__":
    unittest.main()
