"""Contrato de timeline_ops: operaciones estructurales puras sobre el Timeline.

Cada op NO muta la entrada y devuelve un EditResult{timeline, changed, warnings}.
Precondiciones inválidas → ValueError. Estado inválido → validate_timeline().
"""
import unittest

from app import timeline_ops as ops
from app.schemas import Timeline, TimelineClip, TimelineTrack


def base_tl():
    return Timeline(
        width=720, height=1280, fps=30,
        tracks=[
            TimelineTrack(id="V1", kind="video", name="V1"),
            TimelineTrack(id="A1", kind="audio", name="A1"),
        ],
        clips=[
            TimelineClip(id="c1", track_id="V1", kind="video", asset_kind="clips",
                         asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                         out_point=5.0, source_duration=10.0),
        ],
    )


class AddTrackTest(unittest.TestCase):
    def test_add_track_de_texto(self):
        r = ops.add_track(base_tl(), kind="text", name="Subtítulos")
        tids = [t.id for t in r.timeline.tracks]
        self.assertEqual(len(tids), 3)
        new = r.timeline.tracks[-1]
        self.assertEqual(new.kind, "text")
        self.assertIn(new.id, r.changed)
        self.assertEqual(ops.validate_timeline(r.timeline), [])

    def test_kind_invalido(self):
        with self.assertRaises(ValueError):
            ops.add_track(base_tl(), kind="pizza")


class AddClipTest(unittest.TestCase):
    def test_add_clip_asigna_id_si_falta(self):
        tl = base_tl()
        clip = {"track_id": "V1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
                "filename": "b.mp4", "start": 6.0, "in_point": 0.0, "out_point": 3.0, "source_duration": 3.0}
        r = ops.add_clip(tl, clip)
        self.assertEqual(len(r.timeline.clips), 2)
        added = r.timeline.clips[-1]
        self.assertTrue(added.id)
        self.assertIn(added.id, r.changed)
        self.assertEqual(len(tl.clips), 1)   # entrada intacta

    def test_pista_inexistente(self):
        with self.assertRaises(ValueError):
            ops.add_clip(base_tl(), {"track_id": "ZZ", "kind": "video", "asset_kind": "clips",
                                     "asset_id": "1", "filename": "b.mp4", "out_point": 2.0, "source_duration": 2.0})

    def test_kind_no_coincide_con_la_pista(self):
        with self.assertRaises(ValueError):
            ops.add_clip(base_tl(), {"track_id": "A1", "kind": "video", "asset_kind": "clips",
                                     "asset_id": "1", "filename": "b.mp4", "out_point": 2.0, "source_duration": 2.0})


class MoveClipTest(unittest.TestCase):
    def test_mueve_start(self):
        r = ops.move_clip(base_tl(), "c1", start=3.5)
        self.assertEqual(r.timeline.clips[0].start, 3.5)
        self.assertIn("c1", r.changed)

    def test_cambia_de_pista_compatible(self):
        tl = base_tl()
        tl.tracks.append(TimelineTrack(id="V2", kind="video", name="V2"))
        r = ops.move_clip(tl, "c1", track_id="V2")
        self.assertEqual(r.timeline.clips[0].track_id, "V2")

    def test_mover_a_pista_incompatible_falla(self):
        with self.assertRaises(ValueError):
            ops.move_clip(base_tl(), "c1", track_id="A1")

    def test_clip_inexistente_falla(self):
        with self.assertRaises(ValueError):
            ops.move_clip(base_tl(), "nope", start=1.0)


class RemoveTest(unittest.TestCase):
    def test_remove_clip(self):
        r = ops.remove_clip(base_tl(), "c1")
        self.assertEqual(len(r.timeline.clips), 0)
        self.assertIn("c1", r.changed)

    def test_remove_track_arrastra_sus_clips(self):
        r = ops.remove_track(base_tl(), "V1")
        self.assertEqual([t.id for t in r.timeline.tracks], ["A1"])
        self.assertEqual(len(r.timeline.clips), 0)


class SplitClipTest(unittest.TestCase):
    def test_split_en_dos(self):
        r = ops.split_clip(base_tl(), "c1", at_time=2.0)
        cs = r.timeline.clips
        self.assertEqual(len(cs), 2)
        a, b = cs[0], cs[1]
        # primera mitad [0,2] de la fuente [0,2]; segunda [2,5] de la fuente [2,5]
        self.assertAlmostEqual(a.start, 0.0)
        self.assertAlmostEqual(a.in_point, 0.0)
        self.assertAlmostEqual(a.out_point, 2.0)
        self.assertAlmostEqual(b.start, 2.0)
        self.assertAlmostEqual(b.in_point, 2.0)
        self.assertAlmostEqual(b.out_point, 5.0)
        self.assertEqual(len(r.changed), 2)
        self.assertNotEqual(a.id, b.id)

    def test_split_reparte_words(self):
        tl = Timeline(
            tracks=[TimelineTrack(id="T1", kind="text", name="T1")],
            clips=[TimelineClip(id="t1", track_id="T1", kind="text", asset_kind="text",
                                asset_id="t", filename="", start=10.0, in_point=0.0,
                                out_point=4.0, source_duration=4.0, text="uno dos tres",
                                words=[{"text": "uno", "start": 0.0, "end": 1.0},
                                       {"text": "dos", "start": 2.0, "end": 3.0},
                                       {"text": "tres", "start": 3.0, "end": 4.0}])],
        )
        r = ops.split_clip(tl, "t1", at_time=12.0)   # rel = 2.0
        a, b = r.timeline.clips
        self.assertEqual([w.text for w in a.words], ["uno"])          # start < 2
        self.assertEqual([w.text for w in b.words], ["dos", "tres"])  # start >= 2 (regla de borde)
        self.assertAlmostEqual(b.words[0].start, 0.0)                 # re-relativizado al 2º clip

    def test_split_fuera_de_rango_falla(self):
        with self.assertRaises(ValueError):
            ops.split_clip(base_tl(), "c1", at_time=9.0)


class SetClipLayoutTest(unittest.TestCase):
    def test_top_con_duracion(self):
        r = ops.set_clip_layout(base_tl(), "c1", position="top", duration=3.0)
        c = r.timeline.clips[0]
        self.assertEqual(c.frame, "top")
        self.assertAlmostEqual(c.out_point - c.in_point, 3.0)

    def test_position_invalida(self):
        with self.assertRaises(ValueError):
            ops.set_clip_layout(base_tl(), "c1", position="diagonal")


class SetProjectFormatTest(unittest.TestCase):
    def test_por_aspecto(self):
        r = ops.set_project_format(base_tl(), aspect="16:9")
        self.assertEqual((r.timeline.width, r.timeline.height), (1280, 720))

    def test_explicito(self):
        r = ops.set_project_format(base_tl(), width=1080, height=1920, fps=60)
        self.assertEqual((r.timeline.width, r.timeline.height, r.timeline.fps), (1080, 1920, 60))

    def test_aspecto_invalido(self):
        with self.assertRaises(ValueError):
            ops.set_project_format(base_tl(), aspect="21:9")


class ValidateTest(unittest.TestCase):
    def test_detecta_estado_invalido(self):
        tl = base_tl()
        tl.clips.append(TimelineClip(id="bad", track_id="ZZ", kind="video", asset_kind="clips",
                                     asset_id="9", filename="x.mp4", start=-1.0, in_point=2.0,
                                     out_point=1.0, source_duration=5.0))
        issues = ops.validate_timeline(tl)
        self.assertTrue(any("ZZ" in i for i in issues))          # pista inexistente
        self.assertTrue(any("bad" in i for i in issues))
        self.assertGreaterEqual(len(issues), 2)

    def test_timeline_sano_sin_incidencias(self):
        self.assertEqual(ops.validate_timeline(base_tl()), [])


if __name__ == "__main__":
    unittest.main()
