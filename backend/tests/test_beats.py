"""Beats automáticos y marcadores (#12): detección sobre pistas sintéticas (golpes a
tempo conocido, con hi-hats a contratiempo) y ops de la timeline."""
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from app import beats
from app.mcp_server import dto
from app.schemas import Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import set_clip_beats, set_markers

SR = 44100


def _track(bpm: float, dur: float = 20.0, start: float = 0.8, offbeat: bool = True) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(7)
    n = int(SR * dur)
    y = rng.normal(0, 0.02, n).astype(np.float32)
    period = 60.0 / bpm
    clicks = np.arange(start, dur - 0.3, period)
    for k, t in enumerate(clicks):
        s = int(t * SR)
        L = int(0.12 * SR)
        kick = np.sin(2 * np.pi * 60 * np.arange(L) / SR) * np.exp(-np.arange(L) / (0.02 * SR))
        kick *= 1.0 if k % 4 == 0 else 0.7
        kick[: int(0.004 * SR)] += rng.normal(0, 0.3, int(0.004 * SR))   # clic del parche
        y[s:s + L] += kick[: max(0, min(L, n - s))]
        if offbeat:
            s2 = int((t + period / 2) * SR)
            L2 = int(0.03 * SR)
            hh = rng.normal(0, 0.25, L2) * np.exp(-np.arange(L2) / (0.005 * SR))
            y[s2:s2 + L2] += hh[: max(0, min(L2, n - s2))]
    return y, clicks


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg no disponible")
class DetectBeatsTest(unittest.TestCase):
    def test_tempo_y_golpes(self):
        with tempfile.TemporaryDirectory() as td:
            for bpm in (90, 128, 174):
                y, clicks = _track(bpm)
                p = Path(td) / f"t{bpm}.wav"
                sf.write(str(p), y, SR)
                res = beats.detect_beats(p)
                self.assertAlmostEqual(res["bpm"], bpm, delta=1.5)
                det = np.array(res["times"])
                # Cada golpe tiene un beat a menos de 50 ms (no el contratiempo).
                err = np.array([np.min(np.abs(det - c)) for c in clicks])
                self.assertGreaterEqual(float(np.mean(err < 0.05)), 0.95, (bpm, err.max()))
                self.assertLess(abs(float(np.median([det[np.argmin(np.abs(det - c))] - c for c in clicks]))), 0.02)

    def test_sin_audio_suficiente(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "corto.wav"
            sf.write(str(p), np.zeros(100, np.float32), SR)
            with self.assertRaises(ValueError):
                beats.detect_beats(p)


def _audio(**kw):
    return TimelineClip(id="a", track_id="A1", kind="audio", asset_kind="audios", asset_id="x",
                        filename="x.mp3", out_point=10.0, source_duration=10.0, **kw)


class BeatOpsTest(unittest.TestCase):
    def test_set_clip_beats(self):
        tl = Timeline(tracks=[TimelineTrack(id="A1", kind="audio", name="A1")], clips=[_audio()])
        out = set_clip_beats(tl, "a", {"times": [1.5, 0.5, 1.0], "bpm": 120.04, "every": 2}).timeline
        self.assertEqual(out.clips[0].beats, {"times": [0.5, 1.0, 1.5], "bpm": 120.0, "every": 2})
        self.assertEqual(dto.timeline_detail(out)["clips"][0]["beats"], {"bpm": 120.0, "count": 3, "every": 2})
        self.assertIsNone(set_clip_beats(out, "a", None).timeline.clips[0].beats)
        with self.assertRaises(ValueError):
            set_clip_beats(tl, "a", {"times": [1.0], "every": 3})

    def test_marcadores(self):
        tl = Timeline(tracks=[TimelineTrack(id="A1", kind="audio", name="A1")], clips=[_audio()])
        out = set_markers(tl, [{"t": 3.0, "label": "drop"}, {"t": 1.25}]).timeline
        self.assertEqual([m["t"] for m in out.markers], [1.25, 3.0])
        self.assertEqual(out.markers[1]["label"], "drop")
        self.assertEqual(dto.timeline_detail(out)["markers"], out.markers)
        # Viaja con la timeline (se guarda y se recarga).
        self.assertEqual(Timeline(**out.model_dump()).markers, out.markers)
        with self.assertRaises(ValueError):
            set_markers(tl, [{"label": "sin t"}])


if __name__ == "__main__":
    unittest.main()
