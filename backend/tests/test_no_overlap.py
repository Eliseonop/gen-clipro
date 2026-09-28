"""Una pista nunca tiene dos clips a la vez (espejo de noOverlap.js del editor).

``no_overlap.settle_timeline`` resuelve lo que monta cada operación y
``timeline_store.apply_op`` lo aplica a todas: el MCP no puede montar clips.
"""
import shutil
import tempfile
import unittest
from pathlib import Path

from app import no_overlap, projects, timeline_ops, timeline_store
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _clip(cid, track, start, dur, **kw):
    return TimelineClip(id=cid, track_id=track, kind=kw.pop("kind", "video"), asset_kind="clips",
                        asset_id="0", filename="a.mp4", start=start, in_point=0.0,
                        out_point=dur, source_duration=max(dur, 30.0), **kw)


def _tl(clips, tracks=None):
    return Timeline(tracks=tracks or [
        TimelineTrack(id="V1", kind="video", name="V1"),
        TimelineTrack(id="V2", kind="video", name="V2"),
        TimelineTrack(id="A1", kind="audio", name="A1"),
    ], clips=clips)


def _by_id(tl):
    return {c.id: c for c in tl.clips}


class SettleTest(unittest.TestCase):
    def setUp(self):
        # V1: a [0-5) b [5-9)   V2: up [0-3)
        self.before = _tl([_clip("a", "V1", 0, 5), _clip("b", "V1", 5, 4), _clip("up", "V2", 0, 3)])

    def test_sin_cambios_devuelve_lo_mismo(self):
        after = self.before.model_copy(deep=True)
        out, created, notes = no_overlap.settle_timeline(self.before, after)
        self.assertIs(out, after)
        self.assertEqual((created, notes), ([], []))

    def test_crecer_empuja_a_los_de_detras(self):
        after = self.before.model_copy(deep=True)
        _by_id(after)["a"].speed = 0.5                      # a pasa a medir 10 s
        out, created, _ = no_overlap.settle_timeline(self.before, after)
        self.assertEqual(_by_id(out)["b"].start, 10.0)
        self.assertEqual(_by_id(out)["b"].track_id, "V1")
        self.assertEqual(_by_id(out)["up"].start, 0.0)      # otra pista: intacta
        self.assertEqual(created, [])

    def test_redondeo_no_mueve_nada(self):
        after = self.before.model_copy(deep=True)
        _by_id(after)["a"].out_point = 5.03
        out, _, _ = no_overlap.settle_timeline(self.before, after)
        self.assertEqual(_by_id(out)["b"].start, 5.0)

    def test_nuevo_encima_sube_a_la_vecina_libre(self):
        after = self.before.model_copy(deep=True)
        after.clips.append(_clip("n", "V1", 6, 2))
        out, created, notes = no_overlap.settle_timeline(self.before, after)
        self.assertEqual(_by_id(out)["n"].track_id, "V2")   # V2 libre en 6-8
        self.assertEqual(_by_id(out)["n"].start, 6.0)       # mismo instante
        self.assertEqual(created, [])
        self.assertTrue(any("n" in x for x in notes))

    def test_nuevo_encima_sin_vecina_libre_crea_pista(self):
        after = self.before.model_copy(deep=True)
        after.clips.append(_clip("n", "V1", 1, 1))          # V2 ocupada en 1-2
        out, created, _ = no_overlap.settle_timeline(self.before, after)
        self.assertEqual(len(created), 1)
        self.assertEqual(_by_id(out)["n"].track_id, created[0])
        # Justo encima de V1 en la pila (después en el array).
        self.assertEqual([t.id for t in out.tracks], ["V1", created[0], "V2", "A1"])
        self.assertEqual(timeline_ops.track_overlaps(out, "V1"), [])

    def test_texto_nuevo_copia_el_estilo_de_su_pista(self):
        tracks = [TimelineTrack(id="T1", kind="text", name="T1", style={"font": "X"})]
        before = _tl([_clip("s", "T1", 0, 4, kind="text", text="hola")], tracks)
        after = before.model_copy(deep=True)
        after.clips.append(_clip("t", "T1", 1, 2, kind="text", text="adiós"))
        out, created, _ = no_overlap.settle_timeline(before, after)
        nt = next(t for t in out.tracks if t.id == created[0])
        self.assertEqual(nt.kind, "text")
        self.assertEqual(nt.style, {"font": "X"})

    def test_solape_antiguo_no_se_toca(self):
        before = _tl([_clip("p", "V1", 0, 5), _clip("q", "V1", 2, 5)])
        after = before.model_copy(deep=True)
        _by_id(after)["p"].opacity = 0.5
        out, _, _ = no_overlap.settle_timeline(before, after)
        self.assertIs(out, after)

    def test_pista_magnetica_sin_huecos(self):
        tracks = [TimelineTrack(id="V1", kind="video", name="V1", magnetic=True)]
        before = _tl([_clip("a", "V1", 0, 5), _clip("b", "V1", 5, 4)], tracks)
        after = before.model_copy(deep=True)
        after.clips = [c for c in after.clips if c.id != "a"]   # borrar a cierra el hueco
        out, _, _ = no_overlap.settle_timeline(before, after)
        self.assertEqual(_by_id(out)["b"].start, 0.0)
        # Insertar en el corte de b: el nuevo va delante y b se empuja.
        after2 = before.model_copy(deep=True)
        after2.clips.append(_clip("n", "V1", 5, 1))
        out2, _, _ = no_overlap.settle_timeline(before, after2)
        self.assertEqual([_by_id(out2)[k].start for k in ("a", "n", "b")], [0.0, 5.0, 6.0])


class ApplyOpNoOverlapTest(unittest.TestCase):
    """El MCP pasa por apply_op: tampoco puede montar clips."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_file = projects._FILE
        self._old_hist = timeline_store.HISTORY_DIR
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("test").id
        projects.save_timeline(self.pid, _tl([_clip("a", "V1", 0, 5), _clip("up", "V2", 0, 3)]).model_dump())

    def tearDown(self):
        projects._FILE = self._old_file
        timeline_store.HISTORY_DIR = self._old_hist
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_add_clip_encima_sube_de_pista(self):
        r = timeline_store.apply_op(self.pid, "add_clip", {"clip": {
            "track_id": "V1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
            "filename": "b.mp4", "start": 1.0, "in_point": 0.0, "out_point": 2.0, "source_duration": 2.0}})
        tl = Timeline(**r["timeline"])
        new = next(c for c in tl.clips if c.id not in ("a", "up"))
        self.assertNotIn(new.track_id, ("V1", "V2"))      # V1 y V2 ocupadas en 1-3
        self.assertIn(new.track_id, r["changed"])          # la pista creada se reporta
        self.assertFalse(any(w.startswith("solape en ") for w in r["warnings"]))
        for t in tl.tracks:
            self.assertEqual(timeline_ops.track_overlaps(tl, t.id), [])

    def test_move_clip_encima_sube_de_pista(self):
        timeline_store.apply_op(self.pid, "add_clip", {"clip": {
            "id": "b", "track_id": "V1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
            "filename": "b.mp4", "start": 6.0, "in_point": 0.0, "out_point": 2.0, "source_duration": 2.0}})
        r = timeline_store.apply_op(self.pid, "move_clip", {"clip_id": "b", "start": 4.0})
        tl = Timeline(**r["timeline"])
        self.assertEqual(_by_id(tl)["b"].track_id, "V2")   # V2 libre en 4-6
        self.assertEqual(_by_id(tl)["b"].start, 4.0)

    def test_velocidad_empuja_a_los_de_detras(self):
        timeline_store.apply_op(self.pid, "add_clip", {"clip": {
            "id": "b", "track_id": "V1", "kind": "video", "asset_kind": "clips", "asset_id": "1",
            "filename": "b.mp4", "start": 5.0, "in_point": 0.0, "out_point": 2.0, "source_duration": 2.0}})
        r = timeline_store.apply_op(self.pid, "set_clip_speed", {"clip_id": "a", "speed": 0.5})
        tl = Timeline(**r["timeline"])
        self.assertEqual(_by_id(tl)["b"].start, 10.0)
        self.assertEqual(_by_id(tl)["b"].track_id, "V1")


if __name__ == "__main__":
    unittest.main()
