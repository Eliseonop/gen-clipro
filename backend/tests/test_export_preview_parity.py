"""El export de fill debe recortar y transicionar como el preview (Resultado).

El preview usa crop cover (pose cx/cy/zoom o reframe.zoom) + clipFxAt.
Antes el ffmpeg de fill sin reframe.keyframes hacía letterbox y el wipe no
existía: un 16:9 recortado en el editor salía entero y sin transiciones.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.clip_fx import FX_DUR, clip_fx_at, overlay_xy_for_fx, video_fx_chain
from app.compose import _fill_base_cropscale, build_command
from app.schemas import Project, Reframe, Timeline, TimelineClip, TimelineTrack

_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)

APPEAR = ("none", "fade", "dissolve", "wipe", "zoom", "slide_left", "slide_up", "pop")
EXIT = ("none", "fade", "dissolve", "wipe", "zoom", "slide_right", "slide_down", "pop")


def _clip(**kw):
    data = dict(
        id="c1", track_id="V1", kind="image", asset_kind="images",
        asset_id="1", filename="a.png", start=0.0, in_point=0.0,
        out_point=4.0, source_duration=4.0, layout="fill",
    )
    data.update(kw)
    return TimelineClip(**data)


def _graph(clip, width=1280, height=720, src=(1920, 1080)):
    tmp = Path(tempfile.mkdtemp())
    img = tmp / "a.png"
    img.write_bytes(_PNG)
    tl = Timeline(
        width=width, height=height, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[clip],
    )
    proj = Project(id="p", name="p", source_video="x", created_at="2026-01-01T00:00:00")
    with patch("app.detect.dims", return_value=src), \
         patch("app.compose._clip_path", return_value=img):
        cmd = build_command(proj, tl, tmp / "out.mp4")
    return cmd[cmd.index("-filter_complex") + 1]


class FillCropMatchesPreviewTest(unittest.TestCase):
    @patch("app.detect.dims", return_value=(1920, 1080))
    def test_zoom_sin_keyframes_de_reframe_no_hace_letterbox(self, _dims):
        # Preview: geomFor(zoom) recorta. Export antiguo: pad decrease (barras).
        clip = _clip(reframe=Reframe(zoom=0.6, keyframes=[]))
        cs = _fill_base_cropscale(Path("a.png"), clip, 1280, 720)
        self.assertIn("crop=", cs)
        self.assertNotIn("force_original_aspect_ratio=decrease", cs)
        self.assertIn("scale=1280:720", cs)

    @patch("app.detect.dims", return_value=(1920, 1080))
    def test_16x9_a_9x16_es_cover_no_letterbox(self, _dims):
        clip = _clip()
        cs = _fill_base_cropscale(Path("a.png"), clip, 720, 1280)
        self.assertIn("crop=", cs)
        self.assertNotIn("force_original_aspect_ratio=decrease", cs)

    @patch("app.detect.dims", return_value=(1920, 1080))
    def test_pose_cx_dirige_el_crop_no_el_centro(self, _dims):
        clip = _clip(
            reframe=Reframe(zoom=1.0, keyframes=[]),
            keyframes={
                "enabled": True,
                "items": [
                    {"id": "a", "t": 0.0, "interpolation": "linear",
                     "props": {"cx": 0.2, "cy": 0.5, "zoom": 0.7,
                               "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1}},
                    {"id": "b", "t": 2.0, "interpolation": "linear",
                     "props": {"cx": 0.8, "cy": 0.5, "zoom": 0.7,
                               "x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1}},
                ],
            },
        )
        cs = _fill_base_cropscale(Path("a.png"), clip, 1280, 720)
        self.assertIn("crop=", cs)
        self.assertIn("x='", cs)
        self.assertNotIn("force_original_aspect_ratio=decrease", cs)

    def test_export_16x9_con_zoom_entra_en_el_filtergraph(self):
        clip = _clip(reframe=Reframe(zoom=0.55, keyframes=[]), appear="none")
        fc = _graph(clip, 1280, 720)
        self.assertIn("crop=", fc)
        self.assertNotIn("force_original_aspect_ratio=decrease", fc)


class TransitionParityTest(unittest.TestCase):
    def test_cada_aparicion_dejan_rastro_en_ffmpeg(self):
        dur, W, H = 4.0, 1280, 720
        for appear in APPEAR:
            clip = {"appear": appear, "exit": "none"}
            fx = clip_fx_at(clip, 0, dur)
            chain = video_fx_chain(clip, dur, W, H)
            xy = overlay_xy_for_fx("x=0:y=0", clip, 0.0, dur, W, H)
            if appear == "none":
                self.assertEqual(chain, "")
                continue
            if appear in ("fade", "dissolve", "pop"):
                self.assertEqual(fx["opacity"], 0)
                self.assertIn("fade=t=in", chain, appear)
            if appear == "wipe":
                self.assertEqual(fx["wipe"], 0)
                self.assertIn("geq=", chain)
            if appear in ("zoom", "pop"):
                self.assertNotEqual(fx["scale"], 1)
                self.assertIn("eval=frame", chain, appear)
            if appear == "slide_left":
                self.assertEqual(fx["tx"], 1)
                self.assertNotEqual(xy, "x=0:y=0")
            if appear == "slide_up":
                self.assertEqual(fx["ty"], 1)
                self.assertNotEqual(xy, "x=0:y=0")

    def test_cada_salida_dejan_rastro_en_ffmpeg(self):
        dur, W, H = 4.0, 1280, 720
        for exit_ in EXIT:
            clip = {"appear": "none", "exit": exit_}
            fx = clip_fx_at(clip, dur, dur)
            chain = video_fx_chain(clip, dur, W, H)
            xy = overlay_xy_for_fx("x=0:y=0", clip, 0.0, dur, W, H)
            if exit_ == "none":
                self.assertEqual(chain, "")
                continue
            if exit_ in ("fade", "dissolve", "pop"):
                self.assertEqual(fx["opacity"], 0)
                self.assertIn("fade=t=out", chain, exit_)
            if exit_ == "wipe":
                self.assertEqual(fx["wipe"], 0)
                self.assertIn("geq=", chain)
            if exit_ in ("zoom", "pop"):
                self.assertNotEqual(fx["scale"], 1)
                self.assertIn("eval=frame", chain, exit_)
            if exit_ == "slide_right":
                self.assertEqual(fx["tx"], 1)
                self.assertNotEqual(xy, "x=0:y=0")
            if exit_ == "slide_down":
                self.assertEqual(fx["ty"], 1)
                self.assertNotEqual(xy, "x=0:y=0")

    def test_wipe_en_canvas_16x9_entra_en_el_comando(self):
        clip = _clip(appear="wipe", exit="fade")
        fc = _graph(clip, 1280, 720)
        self.assertIn("geq=", fc)
        self.assertIn("fade=t=out", fc)

    def test_zoom_aparicion_en_canvas_16x9(self):
        clip = _clip(appear="zoom")
        fc = _graph(clip, 1280, 720)
        self.assertIn("eval=frame", fc)
        self.assertIn(f"crop=1280:720:", fc)

    def test_mitad_de_wipe_es_visible_a_medias(self):
        fx = clip_fx_at({"appear": "wipe"}, FX_DUR / 2, 4)
        self.assertAlmostEqual(fx["wipe"], 0.5)


class FillPoseKeepsCropTest(unittest.TestCase):
    def test_pose_de_posicion_no_tira_el_encuadre(self):
        clip = _clip(
            reframe=Reframe(zoom=0.5, keyframes=[]),
            appear="fade",
            keyframes={
                "enabled": True,
                "items": [
                    {"id": "a", "t": 0.0, "interpolation": "linear",
                     "props": {"x": 0.3, "y": 0.5, "scale": 0.8, "rotation": 0,
                               "opacity": 1, "cx": 0.4, "cy": 0.5, "zoom": 0.5}},
                    {"id": "b", "t": 1.0, "interpolation": "linear",
                     "props": {"x": 0.7, "y": 0.5, "scale": 1.0, "rotation": 10,
                               "opacity": 1, "cx": 0.4, "cy": 0.5, "zoom": 0.5}},
                ],
            },
        )
        fc = _graph(clip, 1280, 720)
        self.assertIn("crop=", fc)
        self.assertIn("fade=t=in", fc)
        self.assertNotIn("force_original_aspect_ratio=decrease", fc)


if __name__ == "__main__":
    unittest.main()
