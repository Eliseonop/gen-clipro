"""Export de imágenes/vídeo en overlay: keyframes de pose, sin tapar el canvas."""
import unittest
from pathlib import Path
from unittest.mock import patch

from app.clip_fx import video_fx_chain
from app.compose import _overlay_video_filter
from app.schemas import Reframe, TimelineClip


def _overlay_clip(**kwargs):
    data = dict(
        id="img1", track_id="V1", kind="image", asset_kind="images",
        asset_id="1", filename="a.png",
        start=29.151, in_point=4.479, out_point=5.392, source_duration=5.392,
        layout="overlay",
        transform={"x": 0.5, "y": 0.25, "scale": 2.06, "rotation": 0},
        reframe=Reframe(crop_w=0.5, crop_h=0.75),
        appear="zoom",
    )
    data.update(kwargs)
    return TimelineClip(**data)


class OverlayExportTest(unittest.TestCase):
    @patch("app.detect.dims", return_value=(1000, 800))
    def test_keyframes_animan_escala_y_posicion(self, _dims):
        clip = _overlay_clip(keyframes={
            "enabled": True,
            "items": [
                {"id": "a", "t": 0.06, "interpolation": "linear",
                 "props": {"x": 0.5, "y": 0.25, "scale": 0.3, "rotation": 0, "opacity": 1}},
                {"id": "b", "t": 0.76, "interpolation": "linear",
                 "props": {"x": 0.5, "y": 0.25, "scale": 2.06, "rotation": 0, "opacity": 1}},
            ],
        })
        chain, xy = _overlay_video_filter(Path("a.png"), clip, 720, 1280, 0.913)
        self.assertIn("eval=frame", chain)
        self.assertIn("0.300", chain)
        self.assertIn("2.060", chain)
        # El PIP variable se coloca directamente con el overlay (que admite 't'),
        # sin 'pad' a lienzo fijo. Regresión de dos bugs que rompían el export:
        #  - 'pad' no admite 't' en x/y → "Could not open encoder before EOF".
        #  - PIP escalado > WxH → "Padded dimensions cannot be smaller than input".
        self.assertNotIn("pad=", chain)
        self.assertIn("overlay_w", xy)     # la posición animada va en el overlay
        self.assertIn("overlay_h", xy)
        self.assertTrue(xy.startswith("x='"))

    @patch("app.detect.dims", return_value=(1000, 800))
    def test_posicion_usa_tiempo_local_del_clip(self, _dims):
        # Un overlay que empieza tarde (seg. 29) mueve x de 0.2 a 0.8. El overlay
        # se evalúa en tiempo de composición, así que la expresión de posición
        # DEBE compensar con (t-start); si no, en el seg. 29 queda congelada en
        # el último keyframe (imagen sin animar / fuera de pantalla en el export).
        clip = _overlay_clip(start=29.0, keyframes={
            "enabled": True,
            "items": [
                {"id": "a", "t": 0.0, "interpolation": "linear",
                 "props": {"x": 0.2, "y": 0.5, "scale": 1.0, "rotation": 0, "opacity": 1}},
                {"id": "b", "t": 0.9, "interpolation": "linear",
                 "props": {"x": 0.8, "y": 0.5, "scale": 1.0, "rotation": 0, "opacity": 1}},
            ],
        })
        _chain, xy = _overlay_video_filter(Path("a.png"), clip, 720, 1280, 0.913, start=29.0)
        self.assertIn("(t-29.0000)", xy)   # tiempo local, no global
        self.assertNotIn("lt(t,", xy)      # nunca 't' pelado en las comparaciones

    @patch("app.detect.dims", return_value=(1000, 800))
    def test_fx_va_antes_del_scale_animado(self, _dims):
        # Un filtro que fija el tamaño del frame (eq, blur…) DESPUÉS de
        # 'scale=eval=frame' congela la animación de escala: el PIP se queda
        # pequeño en el export. El color/efectos debe inyectarse ANTES del scale.
        clip = _overlay_clip(keyframes={
            "enabled": True,
            "items": [
                {"id": "a", "t": 0.0, "interpolation": "linear",
                 "props": {"x": 0.5, "y": 0.5, "scale": 0.3, "rotation": 0, "opacity": 1}},
                {"id": "b", "t": 0.8, "interpolation": "linear",
                 "props": {"x": 0.5, "y": 0.5, "scale": 2.0, "rotation": 0, "opacity": 1}},
            ],
        }, look="saturated")
        fx = "eq=saturation=1.55:contrast=1.08"
        chain, _xy = _overlay_video_filter(Path("a.png"), clip, 720, 1280, 0.913,
                                           start=0.0, fx=fx)
        self.assertIn(fx, chain)
        self.assertLess(chain.index(fx), chain.index("scale="),
                        "el fx debe ir ANTES del scale animado")
        self.assertLess(chain.index(fx), chain.index("eval=frame"))

    @patch("app.detect.dims", return_value=(1000, 800))
    def test_crop_sigue_los_pose_keyframes_no_reframe(self, _dims):
        # Con pose-keyframes, el crop debe centrarse en el cx/cy de la POSE
        # (como reframeForDraw en el preview), no en reframe.keyframes. Si no,
        # el export recorta otra región de la imagen.
        clip = _overlay_clip(
            reframe=Reframe(crop_w=0.5, crop_h=1.0,
                            keyframes=[{"t": 0.0, "cx": 0.75, "cy": 0.5,
                                        "zoom": 1.0, "pan_mode": "smooth"}]),
            keyframes={
                "enabled": True,
                "items": [
                    {"id": "a", "t": 0.0, "interpolation": "linear",
                     "props": {"x": 0.5, "y": 0.5, "scale": 0.4, "rotation": 0,
                               "opacity": 1, "cx": 0.25, "cy": 0.5, "zoom": 1}},
                    {"id": "b", "t": 0.8, "interpolation": "linear",
                     "props": {"x": 0.5, "y": 0.5, "scale": 1.5, "rotation": 0,
                               "opacity": 1, "cx": 0.25, "cy": 0.5, "zoom": 1}},
                ],
            },
        )
        chain, _xy = _overlay_video_filter(Path("a.png"), clip, 720, 1280, 0.913)
        # pose cx=0.25, crop_w=0.5 (src 1000px) → sx=(0.25-0.25)*1000=0 (izquierda).
        # reframe cx=0.75 daría sx=500. El offset x del crop debe ser ≈0, no 500.
        import re
        m = re.search(r"crop=[^,]*?:x='?([^:']+)", chain)
        x_off = m.group(1)
        self.assertNotIn("500", x_off)   # no usa reframe cx=0.75
        self.assertIn("0", x_off)        # parte del borde izquierdo (pose cx=0.25)

    @patch("app.detect.dims", return_value=(1000, 800))
    def test_sin_keyframes_usa_transform_estatico(self, _dims):
        clip = _overlay_clip(keyframes=None)
        chain, xy = _overlay_video_filter(Path("a.png"), clip, 720, 1280, 0.913)
        self.assertNotIn("eval=frame", chain)
        self.assertIn("x=", xy)
        self.assertNotIn("overlay_w", xy)

    def test_aparicion_zoom_en_pip_no_rellena_el_lienzo(self):
        chain = video_fx_chain({"appear": "zoom"}, 1, 720, 1280, fit_canvas=False)
        self.assertNotIn("crop=720:1280:", chain)


class OverlayChainOrderTest(unittest.TestCase):
    @patch("app.detect.dims", return_value=(1000, 800))
    def test_cadena_overlays_va_en_orden_temporal(self, _dims):
        # La cadena de overlays DEBE ser monótona en el tiempo aunque el orden en
        # la lista esté desordenado: si no, FFmpeg congela los scale=eval=frame de
        # PIPs posteriores (imágenes que crecen se quedan estáticas en el export).
        import re
        import tempfile
        from app import compose
        from app.schemas import Project, Timeline, TimelineTrack, TimelineClip
        tmp = Path(tempfile.mkdtemp())
        img = tmp / "a.png"
        img.write_bytes(b"x")
        # A empieza TARDE (start=20) pero va primero en la lista; B empieza pronto.
        A = TimelineClip(id="A", track_id="V1", kind="image", asset_kind="images",
                         asset_id="1", filename="a.png", start=20.0, in_point=0.0,
                         out_point=2.0, source_duration=2.0)
        B = TimelineClip(id="B", track_id="V1", kind="image", asset_kind="images",
                         asset_id="1", filename="a.png", start=5.0, in_point=0.0,
                         out_point=2.0, source_duration=2.0)
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[A, B])
        proj = Project(id="p", name="p", source_video="x",
                       created_at="2026-01-01T00:00:00")
        with patch.object(compose, "_clip_path", return_value=img):
            cmd = compose.build_command(proj, tl, tmp / "out.mp4")
        fc = cmd[cmd.index("-filter_complex") + 1]
        starts = [float(s) for s in re.findall(r"between\(t,([\d.]+),", fc)]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(starts[0], 5.0)   # el que empieza antes va primero


if __name__ == "__main__":
    unittest.main()
