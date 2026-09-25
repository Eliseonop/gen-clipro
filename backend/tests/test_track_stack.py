"""Pila de capas vídeo+texto: el orden de las pistas decide qué se ve delante,
también para el texto (texto detrás de una persona). Espejo de trackStack.test.mjs."""
import tempfile
import unittest
from pathlib import Path

from app import compose, timeline_ops
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack
from app.track_stack import (buried_text_track_ids, default_track_index, display_order,
                             reorder_track, stack_layers)

W, H = 360, 640


def _tr(tid, kind, **kw):
    return TimelineTrack(id=tid, kind=kind, name=tid, **kw)


def _ids(tracks):
    return [t.id for t in tracks]


def _video(cid, track):
    return TimelineClip(id=cid, track_id=track, kind="image", asset_kind="images", asset_id=cid,
                        filename=f"{cid}.png", start=0.0, in_point=0, out_point=2.0, source_duration=2.0)


def _text(cid="t1", track="T1", **kw):
    return TimelineClip(id=cid, track_id=track, kind="text", asset_kind="text", asset_id=cid, filename="",
                        start=0.0, in_point=0, out_point=2.0, source_duration=2.0, text="HOLA",
                        style={"font": "Arial", "size": 0.06, "color": "#ffffff", "word_fx": "none"}, **kw)


class StackTest(unittest.TestCase):
    def test_video_y_texto_comparten_pila(self):
        tracks = [_tr("V1", "video"), _tr("A1", "audio"), _tr("T1", "text"), _tr("V2", "video")]
        self.assertEqual(stack_layers(tracks), {"V1": 0, "T1": 1, "V2": 2})
        self.assertEqual(_ids(display_order(tracks)), ["V2", "T1", "V1", "A1"])

    def test_pista_nueva_no_cambia_lo_que_se_ve(self):
        tracks = [_tr("V1", "video"), _tr("T1", "text"), _tr("A1", "audio")]
        self.assertEqual(default_track_index(tracks, "video"), 1)   # encima de V1, debajo de T1
        self.assertEqual(default_track_index(tracks, "text"), 3)    # al final = arriba del todo de la pila
        self.assertEqual(default_track_index(tracks, "audio"), 3)

    def test_reordenar_en_pantalla(self):
        tracks = [_tr("V1", "video"), _tr("V2", "video"), _tr("T1", "text"), _tr("A1", "audio")]
        out = reorder_track(tracks, "T1", "V2", "below")
        self.assertEqual(_ids(display_order(out)), ["V2", "T1", "V1", "A1"])
        with self.assertRaises(ValueError):
            reorder_track(tracks, "A1", "V1", "above")    # audio fuera de la pila
        with self.assertRaises(ValueError):
            reorder_track(tracks, "T1", "V2", "encima")

    def test_texto_enterrado(self):
        tracks = [_tr("V1", "video"), _tr("T1", "text"), _tr("V2", "video"), _tr("T2", "text")]
        self.assertEqual(buried_text_track_ids(tracks), {"T1"})
        self.assertEqual(buried_text_track_ids([_tr("V1", "video"), _tr("T1", "text")]), set())


class OpsTest(unittest.TestCase):
    def _tl(self):
        return Timeline(tracks=[_tr("V1", "video"), _tr("V2", "video"), _tr("T1", "text"), _tr("A1", "audio")])

    def test_reorder_track(self):
        res = timeline_ops.reorder_track(self._tl(), "T1", "V2", "below")
        self.assertEqual(_ids(res.timeline.tracks), ["V1", "T1", "V2", "A1"])
        self.assertEqual(res.changed, ["T1"])

    def test_add_track_video_no_tapa_los_textos(self):
        res = timeline_ops.add_track(self._tl(), "video", track_id="V3")
        self.assertEqual(_ids(res.timeline.tracks), ["V1", "V2", "V3", "T1", "A1"])


class ExportOrderTest(unittest.TestCase):
    def setUp(self):
        from app import detect
        self._saved = (compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims)
        compose._clip_path = lambda _p, _c, _s=None: Path(__file__)
        compose._has_audio = lambda _p: False
        compose._color_untagged = lambda _p: False
        detect.dims = lambda _p: (300, 200)

    def tearDown(self):
        from app import detect
        compose._clip_path, compose._has_audio, compose._color_untagged, detect.dims = self._saved

    def _fc(self, tracks, clips):
        tl = Timeline(fps=30, width=W, height=H, tracks=tracks, clips=clips)
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "x.mp4"
            ass, layers, track_layers = compose._prepare_texts(tl, out, W, H)
            cmd = compose.build_command(Project(id="p", name="p", created_at="n", timeline=tl), tl, out,
                                        ass_path=ass, text_layers=layers, track_text_layers=track_layers)
        return cmd[cmd.index("-filter_complex") + 1], ass, track_layers

    def test_texto_encima_va_en_el_ass_global(self):
        fc, ass, track_layers = self._fc([_tr("V1", "video"), _tr("T1", "text")], [_video("a", "V1"), _text()])
        self.assertEqual(track_layers, {})
        self.assertIsNotNone(ass)
        self.assertNotIn("color=c=black@0", fc)

    def test_texto_detras_del_video_se_compone_en_su_capa(self):
        # V1 vídeo completo · T1 texto · V2 recorte encima: el texto va ANTES del overlay de V2.
        tracks = [_tr("V1", "video"), _tr("T1", "text"), _tr("V2", "video")]
        fc, ass, track_layers = self._fc(tracks, [_video("a", "V1"), _text(), _video("b", "V2")])
        self.assertEqual(set(track_layers), {"T1"})
        self.assertIsNone(ass)                        # no queda ningún texto encima de todo
        steps = fc.split(";")
        text_at = next(i for i, s in enumerate(steps) if "[tko0]" in s and "overlay" in s)
        top_at = next(i for i, s in enumerate(steps) if s.startswith("[tko0]") and "overlay" in s)
        self.assertLess(text_at, top_at)              # V2 se superpone sobre la capa del texto

    def test_pista_de_texto_oculta_no_se_exporta(self):
        tracks = [_tr("V1", "video"), _tr("T1", "text", hidden=True)]
        _fc, ass, track_layers = self._fc(tracks, [_video("a", "V1"), _text()])
        self.assertIsNone(ass)
        self.assertEqual(track_layers, {})


if __name__ == "__main__":
    unittest.main()
