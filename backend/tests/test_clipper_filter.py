import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app import clipper
from app.schemas import ClipRequest, Keyframe, Reframe, Segment


class ReframeFilterLengthTest(unittest.TestCase):
    @patch("app.detect.dims", return_value=(1280, 720))
    def test_pan_mode_on_keyframes_does_not_explode_filter(self, _dims):
        # El editor pone pan_mode='smooth' en cada keyframe. Eso no debe
        # muestrear 20 fps en todo el tramo (WinError 206 en Windows).
        kfs = [
            Keyframe(t=float(i), cx=0.4 + i * 0.005, cy=0.5, pan_mode="smooth")
            for i in range(0, 28, 3)
        ]
        filt = clipper._single_reframe_filter(Path("x.mp4"), 1.0, kfs, "smooth", 720, 1280)
        self.assertLess(len(filt), 4000, f"filtro demasiado largo ({len(filt)} chars)")

    def test_download_source_uses_local_file_not_ytdlp(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            (tmp / "video").mkdir()
            src = tmp / "video" / "Ver pelicula.mp4"
            src.write_bytes(b"fake-mp4")
            proj = SimpleNamespace(id="p1", folder=str(tmp))
            url = "/api/media/p1/video/Ver%20pelicula.mp4"
            msgs = []
            with patch("app.projects.get_project", return_value=proj), \
                 patch("app.clipper.ytdlp.call") as ydl:
                got = clipper._download_source(url, tmp, lambda f, m: msgs.append(m))
            self.assertEqual(got.resolve(), src.resolve())
            ydl.assert_not_called()
            self.assertTrue(any("local" in m.lower() for m in msgs))

    def test_long_filter_goes_to_script_file(self):
        with tempfile.TemporaryDirectory() as d:
            args = clipper._vf_args("crop=" + ("x" * 9000), Path(d), complex_graph=False)
            self.assertEqual(args[0], "-filter_script:v")
            self.assertTrue(Path(args[1]).exists())
            self.assertGreater(Path(args[1]).stat().st_size, 8000)


class OutputFormatTest(unittest.TestCase):
    """El formato elegido en el editor (9:16, 16:9, 1:1…) debe llegar al recorte.

    Antes toda la tubería estaba fija a 720x1280 y guardar un clip en 16:9
    producía igualmente un archivo vertical. Estos tests fijan que cada filtro
    escala al ``out_w``/``out_h`` pedido y que sin él se mantiene el vertical.
    """

    def test_clip_request_defaults_to_vertical(self):
        req = ClipRequest(url="u", project_id="p", segments=[])
        self.assertEqual((req.width, req.height), (720, 1280))

    def test_clip_request_accepts_landscape(self):
        req = ClipRequest(url="u", project_id="p", segments=[], width=1280, height=720)
        self.assertEqual((req.width, req.height), (1280, 720))

    def test_center_crop_scales_to_requested_format(self):
        self.assertIn("scale=1280:720", clipper._crop_filter(clipper.CropMode.center, 1280, 720))
        self.assertIn("scale=1080:1080", clipper._crop_filter(clipper.CropMode.center, 1080, 1080))
        # Sin formato → vertical por compatibilidad con clips antiguos.
        self.assertIn("scale=720:1280", clipper._crop_filter(clipper.CropMode.center))

    @patch("app.detect.face_center_x", return_value=None)
    @patch("app.detect.dims", return_value=(1920, 1080))
    def test_smart_face_scales_to_requested_format(self, _dims, _face):
        filt_916 = clipper._smart_face_filter(Path("x.mp4"), Segment(index=1, start=0, end=1, score=1, duration=1), 720, 1280)
        self.assertIn("scale=720:1280", filt_916)
        filt_169 = clipper._smart_face_filter(Path("x.mp4"), Segment(index=1, start=0, end=1, score=1, duration=1), 1280, 720)
        self.assertIn("scale=1280:720", filt_169)
        # 16:9 sobre fuente 16:9 → recorte a fotograma completo, sin salirse.
        self.assertIn("crop=1920:1080:0:0", filt_169)

    @patch("app.detect.dims", return_value=(1920, 1080))
    def test_reframe_filter_scales_to_requested_format(self, _dims):
        rf = Reframe(zoom=1.0, keyframes=[Keyframe(t=0.0, cx=0.5, cy=0.5)])
        filt_916, _ = clipper._reframe_filter(Path("x.mp4"), rf, 720, 1280)
        self.assertIn("scale=720:1280", filt_916)
        filt_169, _ = clipper._reframe_filter(Path("x.mp4"), rf, 1280, 720)
        self.assertIn("scale=1280:720", filt_169)

    @patch("app.detect.face_center_x", return_value=None)
    @patch("app.detect.dims", return_value=(1920, 1080))
    def test_cut_clip_threads_format_into_filter(self, _dims, _face):
        # _cut_clip debe pasar out_w/out_h al filtro (no quedarse en el vertical).
        seen = {}

        def fake_run(base, filt, maps_a, maps_an, out_path, seg_index, **kw):
            seen["filt"] = " ".join(filt)

        with patch("app.clipper._run_ffmpeg_cut", side_effect=fake_run):
            clipper._cut_clip(
                Path("src.mp4"), Segment(index=1, start=0, end=1, score=1, duration=1),
                clipper.CropMode.smart_face, Path("out.mp4"),
                out_w=1280, out_h=720,
            )
        self.assertIn("scale=1280:720", seen["filt"])


class CutAudioArgsTest(unittest.TestCase):
    def test_unity_volume_skips_filter(self):
        self.assertEqual(clipper._cut_audio_args(None), ([], False))
        self.assertEqual(clipper._cut_audio_args({"kind": "video", "volume": 1}), ([], False))

    def test_lower_volume(self):
        af, strip = clipper._cut_audio_args({"kind": "video", "volume": 0.25})
        self.assertEqual(af, ["-af", "volume=0.250"])
        self.assertFalse(strip)

    def test_muted_strips_audio(self):
        af, strip = clipper._cut_audio_args({"kind": "video", "volume": 1, "muted": True})
        self.assertEqual(af, [])
        self.assertTrue(strip)


if __name__ == "__main__":
    unittest.main()
