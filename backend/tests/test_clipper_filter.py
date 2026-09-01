import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import clipper
from app.schemas import Keyframe


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

    def test_long_filter_goes_to_script_file(self):
        with tempfile.TemporaryDirectory() as d:
            args = clipper._vf_args("crop=" + ("x" * 9000), Path(d), complex_graph=False)
            self.assertEqual(args[0], "-filter_script:v")
            self.assertTrue(Path(args[1]).exists())
            self.assertGreater(Path(args[1]).stat().st_size, 8000)


if __name__ == "__main__":
    unittest.main()
