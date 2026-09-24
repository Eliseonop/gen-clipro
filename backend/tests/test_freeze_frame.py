"""Congelar fotograma (#11): op de la timeline (espejo de lib/freezeFrame.js) y
extracción del fotograma con FFmpeg. De paso: split con velocidad e invertido."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import cv2

from app.freeze import extract_still
from app.schemas import Reframe, Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import freeze_frame, split_clip

IMAGE = {"id": "img1", "filename": "f.png", "label": "congelado"}
TRACKS = [TimelineTrack(id="V1", kind="video", name="V1"), TimelineTrack(id="V2", kind="video", name="V2")]


def _video(cid="v", start=0.0, out=6.0, **kw):
    return TimelineClip(id=cid, track_id=kw.pop("track_id", "V1"), kind="video", asset_kind="clips",
                        asset_id="0", filename="a.mp4", start=start, in_point=0.0, out_point=out,
                        source_duration=out, **kw)


def _by_id(tl):
    return {c.id: c for c in tl.clips}


class FreezeOpTest(unittest.TestCase):
    def test_parte_inserta_y_desplaza(self):
        tl = Timeline(tracks=TRACKS, clips=[_video(), _video("w", start=6.0, out=2.0),
                                            _video("o", start=3.0, out=2.0, track_id="V2")])
        res = freeze_frame(tl, "v", 2.0, IMAGE, 3.0)
        clips = res.timeline.clips
        left, frozen, right = clips[0], clips[1], clips[2]
        self.assertEqual((left.id, left.out_point), ("v", 2.0))
        self.assertEqual((frozen.kind, frozen.start, frozen.out_point), ("image", 2.0, 3.0))
        self.assertEqual(frozen.asset_id, "img1")
        self.assertEqual((right.in_point, right.out_point, right.start), (2.0, 6.0, 5.0))
        by = _by_id(res.timeline)
        self.assertEqual(by["w"].start, 9.0)       # misma pista: se desplaza
        self.assertEqual(by["o"].start, 3.0)       # otra pista: no se toca

    def test_pose_y_recorte_congelados(self):
        base = {"y": 0.5, "scale": 1.0, "rotation": 0.0, "opacity": 1.0}
        kf = {"enabled": True, "items": [
            {"id": "a", "t": 0.0, "interpolation": "linear", "props": {**base, "x": 0.2}},
            {"id": "b", "t": 4.0, "interpolation": "linear", "props": {**base, "x": 0.8}},
        ]}
        v = _video(layout="overlay", keyframes=kf, flip_h=True, blend_mode="screen",
                   effects={"blur": 0.2}, reframe=Reframe(zoom=0.5, keyframes=[]))
        res = freeze_frame(Timeline(tracks=TRACKS, clips=[v]), "v", 2.0, IMAGE)
        frozen, right = res.timeline.clips[1], res.timeline.clips[2]
        self.assertAlmostEqual(frozen.transform["x"], 0.5)
        self.assertIsNone(frozen.keyframes)
        self.assertEqual((frozen.flip_h, frozen.blend_mode, frozen.effects), (True, "screen", {"blur": 0.2}))
        self.assertEqual(frozen.layout, "overlay")
        # La parte derecha continúa la animación (antes la reiniciaba).
        self.assertEqual([k["t"] for k in right.keyframes["items"]], [-2.0, 2.0])

    def test_encuadre_de_fuente_en_ese_instante(self):
        rf = Reframe(zoom=0.6, keyframes=[{"t": 0, "cx": 0.3}, {"t": 4, "cx": 0.7}])
        res = freeze_frame(Timeline(tracks=TRACKS, clips=[_video(reframe=rf)]), "v", 2.0, IMAGE)
        kfs = res.timeline.clips[1].reframe.keyframes
        self.assertEqual(len(kfs), 1)
        self.assertAlmostEqual(kfs[0].cx, 0.5, places=3)

    def test_en_los_bordes(self):
        res = freeze_frame(Timeline(tracks=TRACKS, clips=[_video()]), "v", 0.02, IMAGE)
        frozen, v = res.timeline.clips
        self.assertEqual((frozen.start, v.start, v.in_point), (0.0, 3.0, 0.0))
        res = freeze_frame(Timeline(tracks=TRACKS, clips=[_video()]), "v", 5.98, IMAGE)
        v, frozen = res.timeline.clips
        self.assertEqual((v.start, v.out_point, frozen.start), (0.0, 6.0, 6.0))

    def test_velocidad(self):
        res = freeze_frame(Timeline(tracks=TRACKS, clips=[_video(speed=2.0)]), "v", 1.0, IMAGE)
        left, frozen, right = res.timeline.clips
        self.assertEqual((left.out_point, right.in_point, right.start), (2.0, 2.0, 4.0))

    def test_solo_video(self):
        img = TimelineClip(id="i", track_id="V1", kind="image", asset_kind="images", asset_id="x",
                           filename="x.png", out_point=3, source_duration=3)
        with self.assertRaises(ValueError):
            freeze_frame(Timeline(tracks=TRACKS, clips=[img]), "i", 1.0, IMAGE)


class SplitTest(unittest.TestCase):
    def test_split_con_velocidad(self):
        # Antes el corte ignoraba la velocidad (2x: el segundo 1 de la barra es el 2 de la fuente).
        res = split_clip(Timeline(tracks=TRACKS, clips=[_video(speed=2.0)]), "v", 1.0)
        a, b = res.timeline.clips
        self.assertEqual((a.out_point, b.in_point, b.start), (2.0, 2.0, 1.0))

    def test_split_invertido(self):
        res = split_clip(Timeline(tracks=TRACKS, clips=[_video(reverse=True)]), "v", 2.0)
        a, b = res.timeline.clips
        self.assertEqual((a.in_point, a.out_point), (4.0, 6.0))
        self.assertEqual((b.in_point, b.out_point, b.start), (0.0, 4.0, 2.0))


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg no disponible")
class ExtractStillTest(unittest.TestCase):
    def test_fotograma_a_resolucion_nativa(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "rb.mp4"
            subprocess.run(["ffmpeg", "-y", "-v", "error",
                            "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=1",
                            "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1",
                            "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]",
                            "-pix_fmt", "yuv420p", str(src)], check=True)
            for t, want in ((0.5, "red"), (1.5, "blue")):
                out = Path(td) / f"{t}.png"
                out.write_bytes(extract_still(src, t))
                img = cv2.imread(str(out))
                self.assertEqual(img.shape[:2], (180, 320))
                b, g, r = (int(v) for v in img[90, 160])
                self.assertEqual("red" if r > b else "blue", want)
            # Pasado el final devuelve el último fotograma en vez de fallar.
            self.assertTrue(extract_still(src, 5.0))


if __name__ == "__main__":
    unittest.main()
