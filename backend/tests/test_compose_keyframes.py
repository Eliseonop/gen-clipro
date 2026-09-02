import unittest

from app.compose import _shifted_keyframes
from app.schemas import Keyframe, Reframe


class ShiftedKeyframesTest(unittest.TestCase):
    def test_builds_local_keyframes(self):
        rf = Reframe(keyframes=[
            Keyframe(t=2.0, cx=0.4, cy=0.5),
            Keyframe(t=4.0, cx=0.6, cy=0.5),
        ])
        out = _shifted_keyframes(rf, 1.5, 3.0, 1)
        self.assertEqual(len(out), 2)
        self.assertIsInstance(out[0], Keyframe)
        self.assertAlmostEqual(out[0].t, 0.5)
        self.assertAlmostEqual(out[0].cx, 0.4)
        self.assertAlmostEqual(out[1].t, 2.5)
        self.assertAlmostEqual(out[1].cx, 0.6)


if __name__ == "__main__":
    unittest.main()
