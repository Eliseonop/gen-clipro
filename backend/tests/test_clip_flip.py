"""Voltear horizontal / vertical (#7): mismo espejo en el preview (canvas.js,
textstyles.js, shapes.js) y en el export (hflip/vflip, libass, rasterizado)."""
import unittest
from pathlib import Path

from app import compose
from app.clip_layout import clip_flip, flip_filters
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.shapes import flip_geometry, rasterize_shape
from app.text_ass import _rotation_tags, build_ass
from app.timeline_ops import update_clip

W, H = 360, 640


def _text(**kw):
    return TimelineClip(
        id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t1", filename="",
        start=0.0, in_point=0, out_point=2.0, source_duration=2.0, text="REFLEJO",
        style={"font": "Arial", "size": 0.06, "color": "#ffffff", "word_fx": "none", "x": 0.5, "y": 0.5},
        **kw,
    )


def _shape(**kw):
    return TimelineClip(
        id="s1", track_id="V1", kind="shape", asset_kind="shape", asset_id="s1", filename="",
        start=0.0, in_point=0, out_point=2.0, source_duration=2.0,
        shape={"type": "arrow", "x": 0.5, "y": 0.5, "w": 0.6, "h": 0.2, "fill": "#ffffff"},
        **kw,
    )


class FlipModelTest(unittest.TestCase):
    def test_por_defecto_sin_voltear(self):
        self.assertEqual(clip_flip(_text()), (False, False))
        self.assertEqual(clip_flip({"flip_v": True}), (False, True))

    def test_filtros_solo_para_video_e_imagen(self):
        video = {"kind": "video", "flip_h": True, "flip_v": True}
        self.assertEqual(flip_filters(video), "hflip,vflip")
        self.assertEqual(flip_filters({"kind": "image", "flip_v": True}), "vflip")
        self.assertEqual(flip_filters({"kind": "image"}), "")
        # Figuras y textos se voltean en su propio render (rasterizado / libass).
        self.assertEqual(flip_filters({"kind": "shape", "flip_h": True}), "")
        self.assertEqual(flip_filters({"kind": "text", "flip_h": True}), "")

    def test_update_clip(self):
        tl = Timeline(tracks=[TimelineTrack(id="T1", kind="text", name="T1")], clips=[_text()])
        out = update_clip(tl, "t1", {"flip_v": True}).timeline
        self.assertEqual(clip_flip(out.clips[0]), (False, True))
        out = update_clip(out, "t1", {"flip_h": True, "flip_v": False}).timeline
        self.assertEqual(clip_flip(out.clips[0]), (True, False))


class FlipTextTest(unittest.TestCase):
    def test_tags(self):
        self.assertEqual(_rotation_tags(0, 10, 20), "")
        self.assertEqual(_rotation_tags(0, 10, 20, (True, False)), "\\org(10,20)\\fry180")
        self.assertEqual(_rotation_tags(0, 10, 20, (False, True)), "\\org(10,20)\\frx180")
        # Con un solo volteo el giro cambia de signo (el espejo de libass va
        # después del giro; el del preview, antes).
        self.assertEqual(_rotation_tags(30, 10, 20, (False, True)), "\\org(10,20)\\frz30\\frx180")
        # Los dos a la vez = giro de 180°.
        self.assertEqual(_rotation_tags(30, 10, 20, (True, True)), "\\org(10,20)\\frz-210")

    def test_ass_volteado(self):
        doc = build_ass([_text(flip_v=True)], W, H)
        self.assertIn("\\frx180", doc)
        self.assertIn("\\org(180,320)", doc)
        self.assertNotIn("\\frx180", build_ass([_text()], W, H))

    def test_slide_up_volteado_sigue_subiendo(self):
        # \move se refleja alrededor del \org: se invierte para que el texto suba.
        clip = _text(flip_v=True)
        clip.style = {**clip.style, "block_appear": "slide_up"}
        doc = build_ass([clip], W, H)
        self.assertIn("\\move(180,298,180,320,0,180)", doc)


class FlipShapeTest(unittest.TestCase):
    def test_geometria(self):
        geo = {"fills": [[(10, 20), (90, 20), (50, 80)]], "strokes": [[(0, 0), (100, 50)]]}
        self.assertIs(flip_geometry(geo), geo)
        out = flip_geometry(geo, (True, False))
        self.assertEqual(out["fills"][0], [(90, 20), (10, 20), (50, 80)])
        out = flip_geometry(geo, (False, True))
        self.assertEqual(out["strokes"][0], [(0, 100), (100, 50)])

    def test_flecha_volteada_es_el_espejo(self):
        a = rasterize_shape(_shape().shape, W, H)[..., 3]
        b = rasterize_shape(_shape().shape, W, H, flip=(True, False))[..., 3]
        self.assertGreater(int(a.sum()), 0)
        # Centrada en el cuadro: el espejo de la flecha es su volteo horizontal.
        diff = abs(a[:, ::-1].astype(int) - b.astype(int))
        self.assertLess(float((diff > 64).mean()), 0.002)


class FlipExportTest(unittest.TestCase):
    def _fc(self, clip, tracks):
        tl = Timeline(fps=30, width=W, height=H, tracks=tracks, clips=[clip])
        proj = Project(id="p", name="p", created_at="n", timeline=tl)
        compose._clip_path = lambda _p, _c, _s=None: Path(__file__)  # noqa: E731
        compose._has_audio = lambda _p: False
        compose._color_untagged = lambda _p: False
        from app import detect
        detect.dims = lambda _p: (640, 360)
        cmd = compose.build_command(proj, tl, Path("x.mp4"))
        return cmd[cmd.index("-filter_complex") + 1]

    def setUp(self):
        from app import detect
        self._saved = (compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims)

    def tearDown(self):
        from app import detect
        compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims = self._saved

    def _video(self, **kw):
        return TimelineClip(
            id="v1", track_id="V1", kind="video", asset_kind="clips", asset_id="0", filename="a.mp4",
            start=0.0, in_point=0, out_point=2.0, source_duration=2.0, **kw)

    def test_objeto_libre_voltea_tras_el_recorte(self):
        clip = self._video(layout="overlay", flip_h=True,
                           transform={"x": 0.5, "y": 0.5, "scale": 0.5, "rotation": 20})
        fc = self._fc(clip, [TimelineTrack(id="V1", kind="video", name="V1")])
        self.assertRegex(fc, r"crop=[^,]+,hflip,scale=")
        self.assertLess(fc.index("hflip"), fc.index("rotate="))

    def test_fill_voltea(self):
        fc = self._fc(self._video(flip_v=True), [TimelineTrack(id="V1", kind="video", name="V1")])
        self.assertIn("vflip", fc)
        self.assertNotIn("hflip", fc)


if __name__ == "__main__":
    unittest.main()
