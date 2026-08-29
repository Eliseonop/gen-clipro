import unittest

from app.reframe_math import frame_at


class FrameAtTest(unittest.TestCase):
    def test_smooth_zoom_and_center(self):
        kfs = [
            {"t": 0, "cx": 0.2, "cy": 0.5, "zoom": 1, "pan_mode": "smooth"},
            {"t": 2, "cx": 0.8, "cy": 0.5, "zoom": 0.5, "pan_mode": "smooth"},
        ]
        mid = frame_at(kfs, 1)
        self.assertAlmostEqual(mid["cx"], 0.5)
        self.assertAlmostEqual(mid["zoom"], 0.75)

    def test_direct_holds_until_arrival(self):
        kfs = [
            {"t": 0, "cx": 0.2, "cy": 0.5, "zoom": 1, "pan_mode": "smooth"},
            {"t": 2, "cx": 0.8, "cy": 0.5, "zoom": 0.5, "pan_mode": "direct"},
        ]
        hold = frame_at(kfs, 1)
        self.assertAlmostEqual(hold["cx"], 0.2)
        self.assertAlmostEqual(hold["zoom"], 1)


if __name__ == "__main__":
    unittest.main()
