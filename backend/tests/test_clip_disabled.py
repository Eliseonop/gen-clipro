"""Clip desactivado (#10, tecla V): sigue en la timeline pero no se ve, no suena ni
se exporta; la duración del proyecto no cambia (como el preview)."""
import unittest
from pathlib import Path

from app import compose
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.text_ass import build_ass
from app.timeline_ops import update_clip

W, H = 360, 640
TRACKS = [TimelineTrack(id="V1", kind="video", name="V1"), TimelineTrack(id="T1", kind="text", name="T1")]


def _video(cid, start, **kw):
    return TimelineClip(id=cid, track_id="V1", kind="video", asset_kind="clips", asset_id=cid,
                        filename=f"{cid}.mp4", start=start, in_point=0, out_point=2.0, source_duration=2.0, **kw)


def _text(**kw):
    return TimelineClip(id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t1", filename="",
                        start=0.0, in_point=0, out_point=2.0, source_duration=2.0, text="HOLA",
                        style={"font": "Arial", "size": 0.06, "color": "#ffffff", "word_fx": "none"}, **kw)


class DisabledTest(unittest.TestCase):
    def setUp(self):
        from app import detect
        self._saved = (compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims)
        compose._clip_path = lambda _p, _c, _s=None: Path(__file__)
        compose._has_audio = lambda _p: True
        compose._color_untagged = lambda _p: False
        detect.dims = lambda _p: (640, 360)

    def tearDown(self):
        from app import detect
        compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims = self._saved

    def _cmd(self, clips):
        tl = Timeline(fps=30, width=W, height=H, tracks=TRACKS, clips=clips)
        ass, layers = compose._prepare_texts(tl, Path("x.mp4"), W, H)
        return compose.build_command(Project(id="p", name="p", created_at="n", timeline=tl), tl, Path("x.mp4"),
                                     ass_path=ass, text_layers=layers)

    def test_ni_imagen_ni_sonido_y_misma_duracion(self):
        cmd = self._cmd([_video("a", 0.0), _video("b", 2.0, disabled=True)])
        fc = cmd[cmd.index("-filter_complex") + 1]
        self.assertEqual(cmd.count("-i"), 1)             # solo el material del clip activo
        self.assertEqual(fc.count("overlay="), 1)
        self.assertEqual(fc.count("atrim="), 1)
        self.assertEqual(cmd[cmd.index("-t") + 1], "4.000")   # la duración no cambia

    def test_texto_desactivado(self):
        self.assertNotIn("HOLA", build_ass([_text(disabled=True)], W, H))
        self.assertIn("HOLA", build_ass([_text()], W, H))
        cmd = self._cmd([_video("a", 0.0), _text(disabled=True)])
        self.assertNotIn("drawtext", cmd[cmd.index("-filter_complex") + 1])

    def test_update_clip(self):
        tl = Timeline(tracks=TRACKS, clips=[_text()])
        out = update_clip(tl, "t1", {"disabled": True}).timeline
        self.assertTrue(out.clips[0].disabled)
        self.assertFalse(update_clip(out, "t1", {"disabled": False}).timeline.clips[0].disabled)


if __name__ == "__main__":
    unittest.main()
