"""Pegar atributos (#13): grupos, valores fijos, fusión de keyframes y la op."""
import unittest

from app.clip_attrs import ATTR_GROUP_IDS, group_applies, merge_keyframes, paste_attributes
from app.clip_keyframes import clip_props_at
from app.schemas import Timeline, TimelineClip, TimelineTrack
from app.timeline_ops import paste_clip_attributes


def _clip(cid, kind="video", **kw):
    base = TimelineClip(id=cid, track_id="V1", kind=kind, asset_kind="clips", asset_id="0",
                        filename="a.mp4", start=0, in_point=0, out_point=4, source_duration=4)
    return {**base.model_dump(), **kw}


def _full(t, **props):
    """Keyframe como los crea el editor: instantánea de TODAS las propiedades."""
    snap = {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0, "opacity": 1.0,
            "cx": 0.5, "cy": 0.5, "zoom": 1.0, "rot_x": 0.0, "rot_y": 0.0,
            "volume": 1.0, "eq": 0.0, "compressor": 0.0, "reverb": 0.0, "echo": 0.0,
            "denoise": 0.0, "distortion": 0.0}
    snap.update(props)
    return {"id": f"k{t}", "t": t, "interpolation": "linear", "props": snap}


def _zoom_anim():
    return {"enabled": True, "items": [_full(0.0, scale=1.0), _full(2.0, scale=2.0)]}


class GroupsTest(unittest.TestCase):
    def test_tipos(self):
        v, a, t, s = _clip("v"), _clip("a", "audio"), _clip("t", "text"), _clip("s", "shape")
        self.assertTrue(group_applies("transform", v, t))
        self.assertFalse(group_applies("audio", v, t))
        self.assertTrue(group_applies("audio", v, a))
        self.assertFalse(group_applies("crop", v, s))
        self.assertTrue(group_applies("style", t, _clip("t2", "text")))
        self.assertFalse(group_applies("style", t, s), "estilo solo entre clips del mismo tipo")
        self.assertFalse(group_applies("nada", v, v))


class StaticTest(unittest.TestCase):
    def test_no_toca_contenido_ni_tiempos(self):
        src = _clip("A", transform={"x": 0.2, "y": 0.7, "scale": 1.5, "rotation": 10},
                    layout="overlay", effects={"blur": 2}, look="warm", volume=0.3, speed=2.0)
        dst = _clip("B", filename="b.mp4", start=9, in_point=1, out_point=3, volume=1.0)
        out = paste_attributes(dst, src, list(ATTR_GROUP_IDS))
        for k in ("id", "filename", "start", "in_point", "out_point", "track_id"):
            self.assertEqual(out[k], dst[k])
        self.assertEqual(out["transform"], {"x": 0.2, "y": 0.7, "scale": 1.5, "rotation": 10})
        self.assertEqual(out["layout"], "overlay")
        self.assertEqual(out["effects"], {"blur": 2})
        self.assertEqual(out["look"], "warm")
        self.assertEqual(out["volume"], 0.3)
        self.assertEqual(out["speed"], 2.0)
        self.assertEqual(dst["volume"], 1.0, "no muta la entrada")

    def test_solo_los_grupos_elegidos(self):
        src = _clip("A", transform={"x": 0.2}, effects={"blur": 2}, flip_h=True)
        out = paste_attributes(_clip("B"), src, ["flip"])
        self.assertTrue(out["flip_h"])
        self.assertIsNone(out["effects"])
        self.assertIsNone(out["transform"])

    def test_pose_y_opacidad_entre_tipos(self):
        src = _clip("A", transform={"x": 0.3, "y": 0.6, "scale": 2, "rotation": 45}, opacity=0.4,
                    blend_mode="screen")
        txt = _clip("T", "text", style={"x": 0.5, "y": 0.9, "font": "Anton", "opacity": 1})
        out = paste_attributes(txt, src, ["transform", "blend"])
        self.assertEqual((out["style"]["x"], out["style"]["y"]), (0.3, 0.6))
        self.assertEqual((out["style"]["scale"], out["style"]["rotation"]), (2, 45))
        self.assertEqual(out["style"]["opacity"], 0.4)
        self.assertEqual(out["style"]["font"], "Anton")
        self.assertEqual(out["blend_mode"], "screen")
        back = paste_attributes(src, out, ["blend"])
        self.assertEqual(back["opacity"], 0.4)

    def test_estilo_de_texto_conserva_su_sitio(self):
        src = _clip("A", "text", style={"font": "Anton", "color": "#ff0", "x": 0.1, "y": 0.1, "rot_x": 30})
        dst = _clip("B", "text", style={"font": "Arial", "x": 0.5, "y": 0.8})
        out = paste_attributes(dst, src, ["style"])
        self.assertEqual(out["style"], {"font": "Anton", "color": "#ff0", "x": 0.5, "y": 0.8})

    def test_estilo_de_figura_no_cambia_geometria(self):
        src = _clip("A", "shape", shape={"type": "star", "fill": "#111111", "stroke": "#222222",
                                          "strokeWidth": 9, "w": 0.9, "x": 0.1})
        dst = _clip("B", "shape", shape={"type": "rect", "fill": "#e53935", "w": 0.3, "x": 0.5})
        out = paste_attributes(dst, src, ["style"])
        self.assertEqual(out["shape"], {"type": "rect", "fill": "#111111", "stroke": "#222222",
                                        "strokeWidth": 9, "w": 0.3, "x": 0.5})

    def test_recorte_conserva_master_del_destino(self):
        src = _clip("A", reframe={"zoom": 0.6, "crop_w": 0.5, "crop_h": 0.5, "master": True,
                                  "keyframes": [{"t": 0, "cx": 0.3, "cy": 0.5}]})
        out = paste_attributes(_clip("B", reframe={"zoom": 1, "master": False}), src, ["crop"])
        self.assertEqual(out["reframe"]["crop_w"], 0.5)
        self.assertFalse(out["reframe"]["master"])
        self.assertEqual(out["reframe"]["keyframes"][0]["cx"], 0.3)

    def test_croma_no_pega_el_recorte_ia(self):
        src = _clip("A", bg_removal={"enabled": True, "mode": "chroma",
                                     "chroma": {"enabled": True, "color": "#00ff00"},
                                     "outline": {"enabled": True, "width": 8},
                                     "auto": {"enabled": True, "base_key": "SRC"}})
        dst = _clip("B", bg_removal={"enabled": True, "auto": {"enabled": True, "base_key": "DST"}})
        out = paste_attributes(dst, src, ["chroma"])
        self.assertEqual(out["bg_removal"]["auto"]["base_key"], "DST")
        self.assertEqual(out["bg_removal"]["chroma"]["color"], "#00ff00")
        self.assertEqual(out["bg_removal"]["outline"]["width"], 8)
        # Sin recorte ni croma en el origen → se quita el del destino (si no hay IA).
        self.assertIsNone(paste_attributes(_clip("C", bg_removal={"chroma": {"enabled": True}}),
                                           _clip("D"), ["chroma"])["bg_removal"])

    def test_mascaras_con_ids_nuevos(self):
        src = _clip("A", masks=[{"id": "m1", "type": "circle", "w": 0.3}])
        out = paste_attributes(_clip("B"), src, ["mask"])
        self.assertEqual(out["masks"][0]["w"], 0.3)
        self.assertNotEqual(out["masks"][0]["id"], "m1")


class KeyframesTest(unittest.TestCase):
    def test_animacion_no_pisa_volumen_ni_posicion_del_destino(self):
        src = _clip("A", keyframes=_zoom_anim())
        dst = _clip("B", volume=0.5, transform={"x": 0.2, "y": 0.3})
        out = paste_attributes(dst, src, ["animation"])
        for k in out["keyframes"]["items"]:
            self.assertEqual(set(k["props"]), {"scale"}, "solo lo que de verdad anima")
        p = clip_props_at(out, 1.0)
        self.assertAlmostEqual(p["scale"], 1.5)
        self.assertAlmostEqual(p["volume"], 0.5)
        self.assertAlmostEqual(p["x"], 0.2)
        self.assertAlmostEqual(p["y"], 0.3)

    def test_conserva_el_fundido_del_destino(self):
        fade = {"enabled": True, "items": [_full(0.0, volume=0.0), _full(1.0, volume=1.0)]}
        dst = _clip("B", keyframes=fade)
        out = paste_attributes(dst, _clip("A", keyframes=_zoom_anim()), ["animation"])
        for t in (0.0, 0.5, 1.0, 2.0):
            p = clip_props_at(out, t)
            self.assertAlmostEqual(p["volume"], clip_props_at(dst, t)["volume"], places=5)
            self.assertAlmostEqual(p["scale"], 1.0 + min(t, 2.0) / 2.0, places=5)

    def test_origen_sin_animacion_quita_la_del_destino(self):
        anim = {"enabled": True, "items": [_full(0.0, scale=1, volume=0.0), _full(1.0, scale=3, volume=1.0)]}
        dst = _clip("B", keyframes=anim)
        out = paste_attributes(dst, _clip("A"), ["animation"])
        self.assertAlmostEqual(clip_props_at(out, 1.0)["scale"], 1.0)
        self.assertAlmostEqual(clip_props_at(out, 0.5)["volume"], 0.5)

    def test_posicion_pegada_se_ve_aunque_haya_keyframes(self):
        # El destino anima la escala; su x fija quedaba repetida en cada keyframe.
        dst = _clip("B", keyframes=_zoom_anim())
        out = paste_attributes(dst, _clip("A", transform={"x": 0.1, "y": 0.9}), ["transform"])
        p = clip_props_at(out, 1.0)
        self.assertAlmostEqual(p["x"], 0.1)
        self.assertAlmostEqual(p["scale"], 1.5)

    def test_ambos_animan_en_instantes_distintos(self):
        fade = {"enabled": True, "items": [_full(0.0, volume=0.0), _full(0.5, volume=1.0),
                                           _full(3.0, volume=0.2)]}
        dst = _clip("B", keyframes=fade)
        src = _clip("A", keyframes=_zoom_anim())
        out = paste_attributes(dst, src, ["animation"])
        times = [k["t"] for k in out["keyframes"]["items"]]
        self.assertEqual(times, [0.0, 0.5, 2.0, 3.0])
        for t in times:  # en los instantes clave es exacto
            p = clip_props_at(out, t)
            self.assertAlmostEqual(p["volume"], clip_props_at(dst, t)["volume"], places=5)
            self.assertAlmostEqual(p["scale"], clip_props_at(src, t)["scale"], places=5)

    def test_destino_con_keyframes_apagados_sin_nada_que_pegar(self):
        kf = {"enabled": False, "items": [_full(0.0, scale=3)]}
        self.assertEqual(merge_keyframes(_clip("B", keyframes=kf), _clip("A"), ["x"]), kf)


class OpTest(unittest.TestCase):
    def _tl(self):
        clips = [
            TimelineClip(id="A", track_id="V1", kind="video", asset_kind="clips", asset_id="0",
                         filename="a.mp4", out_point=4, source_duration=4, flip_h=True, opacity=0.5),
            TimelineClip(id="B", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
                         filename="b.mp4", start=4, out_point=4, source_duration=4),
            TimelineClip(id="T", track_id="T1", kind="text", asset_kind="text", asset_id="t",
                         filename="", text="hola", out_point=2, source_duration=2, style={"x": 0.5}),
            TimelineClip(id="S", track_id="A1", kind="audio", asset_kind="audios", asset_id="s",
                         filename="s.mp3", out_point=2, source_duration=2),
        ]
        tracks = [TimelineTrack(id="V1", kind="video", name="V1"), TimelineTrack(id="T1", kind="text", name="T1"),
                  TimelineTrack(id="A1", kind="audio", name="A1")]
        return Timeline(tracks=tracks, clips=clips)

    def test_varios_destinos_en_una_op(self):
        r = paste_clip_attributes(self._tl(), "A", ["B", "T", "S", "A"], ["flip", "blend"])
        by = {c.id: c for c in r.timeline.clips}
        self.assertTrue(by["B"].flip_h and by["T"].flip_h)
        self.assertEqual(by["B"].opacity, 0.5)
        self.assertEqual(by["T"].style["opacity"], 0.5)
        self.assertEqual(r.changed, ["B", "T"])
        self.assertTrue(any("S" in w for w in r.warnings))

    def test_sin_grupos_pega_todo_lo_que_aplique(self):
        r = paste_clip_attributes(self._tl(), "A", ["B"])
        self.assertTrue(next(c for c in r.timeline.clips if c.id == "B").flip_h)
        self.assertEqual(r.warnings, [])

    def test_errores(self):
        with self.assertRaises(ValueError):
            paste_clip_attributes(self._tl(), "A", ["B"], ["nada"])
        with self.assertRaises(ValueError):
            paste_clip_attributes(self._tl(), "A", ["A"])
        with self.assertRaises(ValueError):
            paste_clip_attributes(self._tl(), "A", ["S"], ["flip"])
        with self.assertRaises(ValueError):
            paste_clip_attributes(self._tl(), "A", ["ZZ"], ["flip"])


if __name__ == "__main__":
    unittest.main()
