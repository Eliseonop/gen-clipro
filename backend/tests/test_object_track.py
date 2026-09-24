"""Seguimiento de objetos (#15): tracker, punto fuente→salida, keyframes y op."""
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from app.clip_keyframes import clip_props_at
from app.clip_layout import source_point_to_output
from app.object_track import follow_keys, track_object
from app.schemas import Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import follow_object

# Mismo caso que frontend/src/lib/objectTrack.test.mjs.
VIDEO = {"id": "v", "kind": "video", "layout": "overlay", "start": 2, "in_point": 1, "out_point": 5,
         "speed": 2, "flip_h": True, "transform": {"x": 0.5, "y": 0.45, "scale": 0.4, "rotation": 15},
         "reframe": {"zoom": 1, "crop_w": 1, "crop_h": 1}}
FOLLOWER = {"id": "t", "kind": "text", "start": 2.2, "in_point": 0, "out_point": 3,
            "style": {"x": 0.3, "y": 0.7, "scale": 1.2, "rotation": 5}}
TRACK = [
    {"t": 1.0, "cx": 0.30, "cy": 0.40, "s": 1.0, "rot": 0, "ok": True},
    {"t": 1.5, "cx": 0.35, "cy": 0.42, "s": 1.1, "rot": 4, "ok": True},
    {"t": 2.0, "cx": 0.42, "cy": 0.45, "s": 1.25, "rot": 9, "ok": True},
    {"t": 2.5, "cx": 0.50, "cy": 0.50, "s": 1.4, "rot": 15, "ok": True},
    {"t": 3.0, "cx": 0.58, "cy": 0.52, "s": 1.5, "rot": 22, "ok": True},
    {"t": 4.0, "cx": 0.70, "cy": 0.55, "s": 1.6, "rot": 30, "ok": True},
]
DIMS = {"srcW": 1920, "srcH": 1080, "outW": 720, "outH": 1280}


class SourcePointTest(unittest.TestCase):
    def test_igual_que_el_editor(self):
        # Valores de sourcePointToOutput (clipLayout.js) para los mismos clips.
        cases = [
            ({"kind": "video", "layout": "overlay", "in_point": 0, "out_point": 10, "start": 0,
              "transform": {"x": 0.4, "y": 0.6, "scale": 0.5, "rotation": 20},
              "reframe": {"zoom": 1, "crop_w": 0.6, "crop_h": 0.8, "keyframes": [{"t": 0, "cx": 0.4, "cy": 0.5}]}},
             (0.3, 0.7), 2, (0.223405, 0.653635)),
            ({"kind": "video", "layout": "overlay", "flip_h": True, "in_point": 0, "out_point": 10, "start": 0,
              "transform": {"x": 0.5, "y": 0.5, "scale": 0.3, "rotation": -35}, "reframe": {"zoom": 1}},
             (0.8, 0.2), 1, (0.225971, 0.515228)),
            ({"kind": "video", "layout": "overlay", "in_point": 1, "out_point": 9, "start": 3,
              "transform": {"x": 0.5, "y": 0.5, "scale": 0.4, "rotation": 0},
              "reframe": {"zoom": 1, "crop_w": 1, "crop_h": 1},
              "keyframes": {"enabled": True, "items": [
                  {"id": "a", "t": 0, "interpolation": "linear", "props": {"x": 0.3, "scale": 0.4, "rotation": 0}},
                  {"id": "b", "t": 4, "interpolation": "ease-in-out", "props": {"x": 0.7, "scale": 0.8, "rotation": 45}}]}},
             (0.25, 0.75), 3, (0.085072, 0.443870)),
        ]
        for clip, (nx, ny), local, (ex, ey) in cases:
            x, y = source_point_to_output(clip, nx, ny, 1920, 1080, 720, 1280, clip["in_point"] + local, local)
            self.assertAlmostEqual(x, ex, places=5)
            self.assertAlmostEqual(y, ey, places=5)


class FollowKeysTest(unittest.TestCase):
    def test_igual_que_el_editor(self):
        keys = follow_keys(VIDEO, FOLLOWER, TRACK, DIMS, 0.1, 2.5, "position_scale_rotation", 0.1)
        self.assertEqual([k["t"] for k in keys], [0.05, 0.3, 0.55, 0.8, 1.3])
        self.assertEqual(keys[1], {"t": 0.3, "x": 0.3, "y": 0.7, "scale": 1.2, "rotation": 5.0},
                         "en el instante marcado conserva su pose")
        self.assertEqual(keys[0], {"t": 0.05, "x": 0.37678, "y": 0.70109, "scale": 1.056, "rotation": 10.0})
        self.assertEqual(keys[4]["x"], -0.00402, "vídeo volteado: el objeto va a la derecha y el texto a la izquierda")
        self.assertEqual(keys[4]["rotation"], -16.0)

    def test_modos(self):
        pos = follow_keys(VIDEO, FOLLOWER, TRACK, DIMS, 0.1, 2.5, "position")
        self.assertTrue(all(set(k) == {"t", "x", "y"} for k in pos))
        ps = follow_keys(VIDEO, FOLLOWER, TRACK, DIMS, 0.1, 2.5, "position_scale")
        self.assertTrue(all("scale" in k and "rotation" not in k for k in ps))
        with self.assertRaises(ValueError):
            follow_keys(VIDEO, FOLLOWER, TRACK, DIMS, 0.1, 2.5, "nada")


class OpTest(unittest.TestCase):
    def test_follow_object_escribe_keyframes(self):
        tl = Timeline(tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                              TimelineTrack(id="T1", kind="text", name="T1")],
                      clips=[TimelineClip(track_id="V1", asset_kind="clips", asset_id="0", filename="a.mp4",
                                          source_duration=6, **VIDEO),
                             TimelineClip(track_id="T1", asset_kind="text", asset_id="t", filename="",
                                          text="hola", source_duration=3, **FOLLOWER,
                                          keyframes={"enabled": True, "items": [
                                              {"id": "old", "t": 0.6, "interpolation": "linear", "props": {"opacity": 0.2}},
                                              {"id": "keep", "t": 2.5, "interpolation": "linear", "props": {"opacity": 0.5}}]})])
        r = follow_object(tl, "t", "v", TRACK, 0.1, 2.5, DIMS, "position_scale")
        t = next(c for c in r.timeline.clips if c.id == "t")
        ids = [k["id"] for k in t.keyframes["items"]]
        self.assertNotIn("old", ids, "los keyframes dentro del tramo seguido se sustituyen")
        self.assertIn("keep", ids, "los de fuera se quedan")
        self.assertAlmostEqual(clip_props_at(t, 0.3)["x"], 0.3, places=4)
        self.assertAlmostEqual(clip_props_at(t, 0.8)["x"], 0.12428, places=4)
        self.assertAlmostEqual(clip_props_at(t, 0.8)["scale"], 1.44, places=4)
        with self.assertRaises(ValueError):
            follow_object(tl, "v", "v", TRACK, 0.1, 2.5, DIMS)
        with self.assertRaises(ValueError):
            follow_object(tl, "v", "t", TRACK, 0.1, 2.5, DIMS)


@unittest.skipUnless(shutil.which("ffmpeg"), "sin ffmpeg")
class TrackerTest(unittest.TestCase):
    """Vídeo sintético: un objeto con textura se mueve, crece y gira sobre un fondo con
    textura; se marca a mitad del clip y se sigue hacia delante y hacia atrás."""

    W, H, FPS, DUR = 480, 270, 25, 2.4

    def truth(self, t):
        u = t / self.DUR
        return 110 + 250 * u, 110 + 50 * math.sin(u * math.pi), 1.0 + 0.4 * u, 25 * u

    def setUp(self):
        rng = np.random.default_rng(3)
        bg = cv2.GaussianBlur((rng.random((self.H, self.W, 3)) * 255).astype(np.uint8), (0, 0), 2)
        obj = np.zeros((64, 64, 3), np.uint8)
        for i in range(8):
            for j in range(8):
                obj[i * 8:(i + 1) * 8, j * 8:(j + 1) * 8] = rng.integers(0, 255, 3)
        self.tmp = Path(tempfile.mkdtemp())
        self.video = self.tmp / "s.mp4"
        proc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
             "-s", f"{self.W}x{self.H}", "-r", str(self.FPS), "-i", "-",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", str(self.video)],
            stdin=subprocess.PIPE)
        for k in range(int(self.DUR * self.FPS)):
            cx, cy, s, rot = self.truth(k / self.FPS)
            m = cv2.getRotationMatrix2D((32, 32), -rot, s)
            m[0, 2] += cx - 32
            m[1, 2] += cy - 32
            mask = cv2.warpAffine(np.full((64, 64), 255, np.uint8), m, (self.W, self.H))
            frame = bg.copy()
            warped = cv2.warpAffine(obj, m, (self.W, self.H))
            frame[mask > 127] = warped[mask > 127]
            proc.stdin.write(frame.tobytes())
        proc.stdin.close()
        proc.wait()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sigue_posicion_escala_y_giro(self):
        at = 1.2
        cx, cy, s, rot = self.truth(at)
        box = {"cx": cx / self.W, "cy": cy / self.H, "w": 60 * s / self.W, "h": 60 * s / self.H}
        res = track_object(self.video, box, at, 0.0, self.DUR)
        tr = res["track"]
        self.assertEqual(len(tr), int(self.DUR * self.FPS))
        self.assertAlmostEqual(tr[0]["t"], 0.0, places=3)
        self.assertTrue(all(p["ok"] for p in tr))
        err = [math.hypot(p["cx"] * self.W - self.truth(p["t"])[0], p["cy"] * self.H - self.truth(p["t"])[1])
               for p in tr]
        self.assertLess(float(np.median(err)), 1.0)
        self.assertLess(max(err), 3.0)
        for p in tr:
            _, _, ts, trot = self.truth(p["t"])
            self.assertAlmostEqual(p["s"] * s, ts, delta=0.03 * ts)
            self.assertAlmostEqual(p["rot"] + rot, trot, delta=1.5)

    def test_mcp_track_object_aplica_al_texto(self):
        """De punta a punta: tool MCP → job → keyframes en el texto que acompaña."""
        import time
        from unittest.mock import patch

        from app import compose, config, jobs, projects, timeline_store
        from app.mcp_server.tools_edit import track_object as mcp_track_object

        old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp / "data"
        projects._FILE = config.DATA_DIR / "projects.json"
        timeline_store.HISTORY_DIR = config.DATA_DIR / "history"
        try:
            pid = projects.create_project("track").id
            tl = Timeline(width=self.W, height=self.H, fps=self.FPS,
                          tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                                  TimelineTrack(id="T1", kind="text", name="T1")],
                          clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                                              filename="s.mp4", out_point=self.DUR, source_duration=self.DUR,
                                              layout="overlay", transform={"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0},
                                              reframe={"zoom": 1, "crop_w": 1, "crop_h": 1}),
                                 TimelineClip(id="t", track_id="T1", kind="text", asset_kind="text", asset_id="t",
                                              filename="", text="aquí", out_point=self.DUR,
                                              source_duration=self.DUR, style={"x": 0.3, "y": 0.4})])
            projects.save_timeline(pid, tl.model_dump())
            at = 1.2
            cx, cy, s, _ = self.truth(at)
            box = {"cx": cx / self.W, "cy": cy / self.H, "w": 60 * s / self.W, "h": 60 * s / self.H}
            with patch.object(compose, "_clip_path", return_value=self.video):
                job = mcp_track_object(pid, "v", box, at, follower_clip_id="t", mode="position")
                for _ in range(200):
                    j = jobs.get_job(job["id"])
                    if j.status.value in ("done", "error"):
                        break
                    time.sleep(0.05)
            self.assertEqual(j.status.value, "done", j.error)
            t = next(c for c in projects.get_project(pid).timeline.clips if c.id == "t")
            self.assertTrue(t.keyframes["enabled"])
            # El vídeo ocupa todo el cuadro sin girar: el texto se desplaza lo mismo que el objeto.
            for lt in (0.0, 1.2, 2.2):
                ox, oy, _, _ = self.truth(lt)
                p = clip_props_at(t, lt)
                self.assertAlmostEqual(p["x"], 0.3 + (ox - cx) / self.W, delta=0.01)
                self.assertAlmostEqual(p["y"], 0.4 + (oy - cy) / self.H, delta=0.01)
        finally:
            config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = old

    def test_recuadro_sin_detalle(self):
        with self.assertRaises(ValueError):
            track_object(self.video, {"cx": 0.5, "cy": 0.5, "w": 0.005, "h": 0.005}, 1.0, 0, self.DUR)


if __name__ == "__main__":
    unittest.main()
