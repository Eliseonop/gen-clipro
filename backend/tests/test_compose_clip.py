import unittest

from app.compose_clip import _filter_graph
from app.schemas import CompLayer, Keyframe


class ComposeFilterTest(unittest.TestCase):
    def test_allows_three_layers_and_delay(self):
        layers = [
            CompLayer(url="/api/media/p/video/a.mp4", start=0, end=8, slot="full", delay=0),
            CompLayer(url="/api/media/p/video/b.mp4", start=0, end=3, slot="overlay", delay=2.5,
                      keyframes=[Keyframe(t=0, cx=0.5, cy=0.5)]),
            CompLayer(url="/api/media/p/video/c.mp4", start=0, end=2, slot="overlay", delay=5),
        ]
        sources = [__import__("pathlib").Path("a.mp4")] * 3
        g = _filter_graph(layers, sources, 8.0)
        self.assertIn("[v0]", g)
        self.assertIn("[v1]", g)
        self.assertIn("[v2]", g)
        self.assertIn("between(t,2.500,5.500)", g)
        self.assertIn("tpad=start_mode=add:start_duration=2.500", g)

    def test_rejects_empty(self):
        from app.compose_clip import generate_composition
        with self.assertRaises(RuntimeError):
            generate_composition("p", [], None, None, 1, __import__("pathlib").Path("."), lambda *_: None)


if __name__ == "__main__":
    unittest.main()
