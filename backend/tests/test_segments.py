"""Segmentos por referencia (Clip Editor → Crear clip) y face tracking cacheado."""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app import config, projects, segments, storage
from app.schemas import ClipInfo


class SegmentsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_out = config.OUTPUT_DIR
        projects._FILE = self.tmp / "projects.json"
        config.OUTPUT_DIR = self.tmp / "clips"
        self.pid = projects.create_project("Demo").id
        base = storage.ensure_dirs(storage.default_base(self.pid))
        (base / "video" / "src.mp4").write_bytes(b"video")
        projects.add_clips(self.pid, [ClipInfo(
            index=100000, id="srcid", filename="src.mp4", label="Entrevista",
            url=f"/api/media/{self.pid}/video/src.mp4", start=0.0, end=60.0)])
        self._probe = mock.patch.object(segments, "_file_duration", return_value=60.0)
        self._probe.start()

    def tearDown(self):
        self._probe.stop()
        projects._FILE = self._old_file
        config.OUTPUT_DIR = self._old_out
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_create_segments_by_reference(self):
        out = segments.create_segments(self.pid, "100000", [
            {"start": 12.5, "end": 20.0},
            {"start": 30.0, "end": 34.0, "label": "Remate"},
        ])
        self.assertEqual(len(out), 2)
        a, b = out
        self.assertEqual(a.filename, "src.mp4")          # sin archivo nuevo
        self.assertEqual((a.in_point, a.out_point), (12.5, 20.0))
        self.assertEqual((a.start, a.end), (12.5, 20.0))
        self.assertEqual(a.parent_id, "srcid")
        self.assertEqual(a.origin, "segment")
        self.assertEqual(b.label, "Remate")
        self.assertNotEqual(a.index, b.index)
        self.assertEqual(len(projects.get_project(self.pid).clips), 3)

    def test_segment_of_segment_keeps_root_parent(self):
        seg = segments.create_segments(self.pid, "100000", [{"start": 5, "end": 15}])[0]
        sub = segments.create_segments(self.pid, str(seg.index), [{"start": 6, "end": 8}])[0]
        self.assertEqual(sub.parent_id, "srcid")
        self.assertEqual(sub.filename, "src.mp4")

    def test_ranges_are_validated_and_clamped(self):
        with self.assertRaises(ValueError):
            segments.create_segments(self.pid, "100000", [{"start": 3, "end": 3.1}])
        seg = segments.create_segments(self.pid, "100000", [{"start": 58, "end": 99}])[0]
        self.assertEqual(seg.out_point, 60.0)
        swapped = segments.create_segments(self.pid, "100000", [{"start": 9, "end": 4}])[0]
        self.assertEqual((swapped.in_point, swapped.out_point), (4.0, 9.0))

    def test_unknown_source(self):
        with self.assertRaises(LookupError):
            segments.create_segments(self.pid, "nope", [{"start": 0, "end": 2}])

    def test_shared_file_detection(self):
        seg = segments.create_segments(self.pid, "100000", [{"start": 1, "end": 4}])[0]
        proj = projects.get_project(self.pid)
        self.assertTrue(segments.is_shared_file(proj, "src.mp4", exclude_ident=str(seg.index)))
        projects.remove_material(self.pid, "clips", str(seg.index))
        proj = projects.get_project(self.pid)
        # Solo queda el origen: si se borra él, el archivo ya no lo usa nadie más.
        self.assertFalse(segments.is_shared_file(proj, "src.mp4", exclude_ident="100000"))

    def test_file_range(self):
        ref = ClipInfo(index=1, filename="x", url="", start=10, end=20, in_point=10, out_point=20)
        rendered = ClipInfo(index=2, filename="y", url="", start=300, end=315)
        self.assertEqual(segments.file_range(ref), (10.0, 20.0))
        self.assertEqual(segments.file_range(rendered), (0.0, 15.0))


class SeedKeyframesTest(unittest.TestCase):
    def test_no_faces_centers_at_range_start(self):
        kfs = segments.seed_keyframes([], 12.0, 20.0)
        self.assertEqual(len(kfs), 1)
        self.assertEqual((kfs[0].t, kfs[0].cx), (12.0, 0.5))

    def test_median_ignores_outlier_and_anchors_ends(self):
        track = [{"t": 10.2, "cx": 0.30, "cy": 0.4}, {"t": 10.5, "cx": 0.31, "cy": 0.4},
                 {"t": 10.8, "cx": 0.95, "cy": 0.4}]          # falso positivo suelto
        kfs = segments.seed_keyframes(track, 10.0, 11.0)
        self.assertAlmostEqual(kfs[0].cx, 0.31, places=2)
        self.assertEqual(kfs[0].t, 10.0)
        self.assertEqual(kfs[-1].t, 11.0)
        for k in kfs:
            self.assertTrue(10.0 <= k.t <= 11.0)

    def test_deadzone_avoids_jitter(self):
        track = [{"t": 0.5 + i, "cx": 0.5 + (0.01 if i % 2 else 0.0), "cy": 0.5} for i in range(10)]
        kfs = segments.seed_keyframes(track, 0.0, 10.0)
        # Movimiento mínimo → cámara quieta: solo los extremos anclados + el primero.
        self.assertLessEqual(len(kfs), 3)


class FaceTrackMaterialTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_out = config.OUTPUT_DIR
        projects._FILE = self.tmp / "projects.json"
        config.OUTPUT_DIR = self.tmp / "clips"
        self.pid = projects.create_project("Demo").id
        base = storage.ensure_dirs(storage.default_base(self.pid))
        (base / "video" / "src.mp4").write_bytes(b"video")
        projects.add_clips(self.pid, [ClipInfo(
            index=100000, id="srcid", filename="src.mp4",
            url=f"/api/media/{self.pid}/video/src.mp4", start=0.0, end=60.0)])
        with mock.patch.object(segments, "_file_duration", return_value=60.0):
            self.seg = segments.create_segments(self.pid, "100000", [{"start": 20, "end": 26}])[0]
        self.fake = {
            "track": [{"t": 21.0, "cx": 0.7, "cy": 0.4, "w": 0.1, "h": 0.2},
                      {"t": 25.0, "cx": 0.3, "cy": 0.4, "w": 0.1, "h": 0.2}],
            "duration": 6.0, "width": 1920, "height": 1080, "fps": 30.0, "samples": 12,
        }

    def tearDown(self):
        projects._FILE = self._old_file
        config.OUTPUT_DIR = self._old_out
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_tracks_segment_range_and_caches_on_material(self):
        from app import detect
        with mock.patch.object(detect, "face_track", return_value=self.fake) as ft:
            track, cached = segments.face_track_material(self.pid, str(self.seg.index), lambda *_: None)
        self.assertFalse(cached)
        kwargs = ft.call_args.kwargs
        self.assertEqual((kwargs["start"], kwargs["end"]), (20.0, 26.0))   # rango del segmento
        self.assertEqual((track.start, track.end), (20.0, 26.0))
        mat = segments.find_clip(projects.get_project(self.pid), str(self.seg.index))
        self.assertIsNotNone(mat.face_track)
        self.assertTrue(mat.reframe.keyframes)
        self.assertTrue(all(20.0 <= k.t <= 26.0 for k in mat.reframe.keyframes))
        self.assertEqual(mat.reframe.face_track_mode, "smooth")

        # Segunda vez: no se vuelve a analizar.
        with mock.patch.object(detect, "face_track", side_effect=AssertionError("no debía analizar")):
            again, cached = segments.face_track_material(self.pid, str(self.seg.index), lambda *_: None)
        self.assertTrue(cached)
        self.assertEqual(len(again.track), 2)

    def test_custom_range_is_not_persisted(self):
        from app import detect
        with mock.patch.object(detect, "face_track", return_value=self.fake):
            segments.face_track_material(self.pid, "100000", lambda *_: None, start=5, end=9)
        src = segments.find_clip(projects.get_project(self.pid), "100000")
        self.assertIsNone(src.face_track)


class McpResolveSegmentTest(unittest.TestCase):
    def test_reference_clip_offsets_in_point(self):
        from app.mcp_server import tools_edit
        seg = ClipInfo(index=7, filename="src.mp4", url="", start=12, end=18, in_point=12, out_point=18)
        proj = mock.Mock(clips=[seg])
        info = tools_edit._resolve_asset(proj, "clips", "7")
        self.assertEqual(info["offset"], 12.0)
        self.assertEqual(info["source_duration"], 6.0)


if __name__ == "__main__":
    unittest.main()
