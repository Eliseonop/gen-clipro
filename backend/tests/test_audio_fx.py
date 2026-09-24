"""Efectos y filtros de sonido (#16): definición, grafo de FFmpeg, op y export real."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app.audio_fx import (
    AUDIO_FX, AUDIO_FX_IDS, audio_fx_graph, compressor_makeup, ffmpeg_node, stage_weights,
)
from app.clip_keyframes import AUDIO_FX_KEYS, clip_props_at
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import set_clip_audio_fx

ROOT = Path(__file__).resolve().parents[2]


def _kf(*pairs, key="underwater"):
    return {"enabled": True, "items": [
        {"id": f"k{i}", "t": t, "interpolation": "linear", "props": {key: v}} for i, (t, v) in enumerate(pairs)]}


class SpecTest(unittest.TestCase):
    def test_claves_animables(self):
        self.assertEqual(AUDIO_FX_IDS, AUDIO_FX_KEYS)

    @unittest.skipUnless(shutil.which("node"), "sin node")
    def test_mismas_definiciones_que_el_editor(self):
        code = ("import('./src/lib/audioFx.js').then((m) => console.log(JSON.stringify("
                "m.AUDIO_FX.map((f) => ({ id: f.id, group: f.group, stages: f.stages })))))")
        out = subprocess.run(["node", "-e", code], cwd=ROOT / "frontend", capture_output=True,
                             text=True, check=True).stdout
        js = json.loads(out)
        py = [{"id": f["id"], "group": f["group"], "stages": f["stages"]} for f in AUDIO_FX]
        self.assertEqual(json.loads(json.dumps(py)), js)

    def test_pesos_de_etapa(self):
        self.assertEqual(stage_weights(0, 1), [1, 0])
        self.assertEqual(stage_weights(0.25, 1), [0.75, 0.25])
        self.assertEqual(stage_weights(0.5, 3), [0, 0.5, 0.5, 0])
        self.assertEqual(stage_weights(1, 3), [0, 0, 0, 1])

    def test_nodos(self):
        self.assertEqual(ffmpeg_node({"t": "lowpass", "f": 380, "q": 0.9}), "lowpass=f=380:t=q:w=0.9")
        self.assertEqual(ffmpeg_node({"t": "lowshelf", "f": 160, "g": 5}), "lowshelf=f=160:t=s:w=1:g=5")
        self.assertEqual(ffmpeg_node({"t": "echo", "in": 0.8, "out": 0.9, "delay": 1.0, "decay": 0.3}),
                         "aecho=0.8:0.9:1000:0.3")
        self.assertAlmostEqual(compressor_makeup({"threshold": -20, "ratio": 8}), 3.3497, places=3)
        self.assertIn("tanh(4*val(0))/0.999329", ffmpeg_node({"t": "drive", "k": 4}))


class GraphTest(unittest.TestCase):
    def test_sin_efectos(self):
        self.assertEqual(audio_fx_graph({"audio_fx": {}}, "a", "x"), ([], "a"))
        self.assertEqual(audio_fx_graph({"audio_fx": {"echo": 0}}, "a", "x"), ([], "a"))

    def test_entero_sin_mezcla(self):
        steps, out = audio_fx_graph({"audio_fx": {"echo": True}}, "a", "x")
        self.assertEqual(steps, ["[a]aecho=0.8:0.9:1000:0.3[xf3]"])
        self.assertEqual(out, "xf3")

    def test_mezcla_fija(self):
        steps, _ = audio_fx_graph({"audio_fx": {"eq": 0.5}}, "a", "x")
        self.assertEqual(steps[0], "[a]asplit=2[xf0s0][xf0s1]")
        self.assertEqual(steps[1], "[xf0s0]volume=0.5000[xf0m0]")
        self.assertIn("equalizer=f=3000", steps[2])
        self.assertTrue(steps[3].endswith("amix=inputs=2:normalize=0:duration=first[xf0]"))
        # Bajo el agua a medias: solo las dos etapas intermedias (sin la seca).
        steps, _ = audio_fx_graph({"audio_fx": {"underwater": 0.5}}, "a", "x")
        self.assertEqual(steps[0], "[a]asplit=2[xf6s1][xf6s2]")

    def test_animado_sigue_la_envolvente(self):
        steps, _ = audio_fx_graph({"audio_fx": {}, "keyframes": _kf((0, 0), (2, 1))}, "a", "x")
        self.assertEqual(steps[0], "[a]asplit=4[xf6s0][xf6s1][xf6s2][xf6s3]")
        self.assertTrue(all("eval=frame" in s for s in steps[1:5]))
        # Keyframes constantes = efecto fijo.
        steps, _ = audio_fx_graph({"audio_fx": {}, "keyframes": _kf((0, 1), (2, 1))}, "a", "x")
        self.assertEqual(len(steps), 1)


class OpTest(unittest.TestCase):
    def _tl(self):
        return Timeline(tracks=[TimelineTrack(id="A1", kind="audio", name="A1")],
                        clips=[TimelineClip(id="au", track_id="A1", kind="audio", asset_kind="audios",
                                            asset_id="1", filename="m.mp3", out_point=6, source_duration=6)])

    def test_valida_claves(self):
        with self.assertRaises(ValueError):
            set_clip_audio_fx(self._tl(), "au", {"underwater_x": 1})

    def test_rampa(self):
        r = set_clip_audio_fx(self._tl(), "au", {"underwater": 1}, ramp={"start": 2, "end": 3.5})
        c = r.timeline.clips[0]
        self.assertEqual(c.audio_fx["underwater"], 1)
        self.assertAlmostEqual(clip_props_at(c, 1.0)["underwater"], 0.0)
        self.assertAlmostEqual(clip_props_at(c, 2.75)["underwater"], 0.5, places=3)
        self.assertAlmostEqual(clip_props_at(c, 5.0)["underwater"], 1.0)
        with self.assertRaises(ValueError):
            set_clip_audio_fx(self._tl(), "au", {"underwater": 1}, ramp={"start": 4, "end": 9})


@unittest.skipUnless(shutil.which("ffmpeg"), "sin ffmpeg")
class FfmpegTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.noise = self.tmp / "n.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                        "anoisesrc=d=4:c=white:a=0.3:r=48000", "-ac", "2", str(self.noise)], check=True)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _render(self, clip):
        steps, out = audio_fx_graph(clip, "ain", "x")
        graph = ";".join(["[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[ain]",
                          *steps, f"[{out}]anull[aout]"])
        dst = self.tmp / "o.f32"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(self.noise), "-filter_complex", graph,
                        "-map", "[aout]", "-f", "f32le", "-ac", "1", "-ar", "48000", str(dst)], check=True)
        return np.fromfile(dst, dtype=np.float32)

    @staticmethod
    def _treble(x, a, b):
        seg = x[int(a * 48000):int(b * 48000)]
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        f = np.fft.rfftfreq(len(seg), 1 / 48000)
        return spec[f > 3000].sum() / spec.sum()

    def test_bajo_el_agua_se_va_cerrando(self):
        y = self._render({"audio_fx": {}, "keyframes": _kf((0, 0), (2, 1))})
        r = [self._treble(y, a, a + 0.3) for a in (0.0, 0.85, 1.7, 3.0)]
        self.assertGreater(r[0], 0.8)
        self.assertTrue(r[0] > r[1] > r[2] > r[3], r)
        self.assertLess(r[1], 0.5, "a mitad ya se nota")
        self.assertLess(r[3], 0.06)

    def test_todos_los_efectos_se_exportan(self):
        for fid in AUDIO_FX_IDS:
            y = self._render({"audio_fx": {fid: 0.7}})
            self.assertTrue(np.isfinite(y).all() and np.abs(y).max() > 0.01, fid)

    def test_grafo_del_export_completo(self):
        from app.compose import build_command

        png = self.tmp / "a.png"
        import cv2
        cv2.imwrite(str(png), np.zeros((64, 36, 3), np.uint8))
        tl = Timeline(width=180, height=320, fps=25,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                              TimelineTrack(id="A1", kind="audio", name="A1")],
                      clips=[TimelineClip(id="v", track_id="V1", kind="image", asset_kind="images", asset_id="1",
                                          filename="a.png", out_point=3, source_duration=3),
                             TimelineClip(id="a", track_id="A1", kind="audio", asset_kind="audios", asset_id="2",
                                          filename="n.wav", out_point=3, source_duration=4,
                                          audio_fx={"telephone": 0.6, "reverb": 1},
                                          keyframes=_kf((0, 0), (2, 1)))])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        out = self.tmp / "o.mp4"
        with patch("app.compose._clip_path", side_effect=lambda _p, c, *a: png if c.kind == "image" else self.noise):
            cmd = build_command(proj, tl, out)
        r = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-600:])
        self.assertTrue(out.exists() and out.stat().st_size > 1000)


if __name__ == "__main__":
    unittest.main()
