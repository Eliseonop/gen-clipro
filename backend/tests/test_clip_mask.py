"""Máscaras de clip: modelo, alfa rasterizado, keyframes y export.

El preview recorta el alfa de la capa del clip; el export hace lo mismo con
``maskedmerge``. Estas pruebas fijan la geometría (que NO depende de la
resolución ni del aspecto) y que el filtergraph solo cambia si hay máscara.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app.clip_keyframes import KF_PROP_KEYS, static_props
from app.clip_mask import (
    MASK_KF_KEYS, MASK_TYPE_IDS, build_clip_mask, clip_masks_at, combined_alpha,
    has_mask, mask_alpha, mask_animates, mask_geometry, maskable, normalize_mask,
)
from app.compose import build_command
from app.migrations import migrate_timeline
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack

_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def _clip(**kw) -> TimelineClip:
    data = dict(
        id="c1", track_id="V1", kind="image", asset_kind="images", asset_id="1",
        filename="a.png", start=0.0, in_point=0.0, out_point=4.0,
        source_duration=4.0, layout="fill",
    )
    data.update(kw)
    return TimelineClip(**data)


def _graph(clip, mask_files=None, width=720, height=1280, extra=()):
    tmp = Path(tempfile.mkdtemp())
    img = tmp / "a.png"
    img.write_bytes(_PNG)
    tl = Timeline(
        width=width, height=height, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[clip, *extra],
    )
    proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
    with patch("app.detect.dims", return_value=(1920, 1080)), \
         patch("app.compose._clip_path", return_value=img):
        cmd = build_command(proj, tl, tmp / "out.mp4", mask_files=mask_files)
    return cmd, cmd[cmd.index("-filter_complex") + 1]


class ModeloTest(unittest.TestCase):
    def test_tipo_desconocido_cae_en_circulo(self):
        self.assertEqual(normalize_mask({"type": "nope"})["type"], "circle")
        for t in MASK_TYPE_IDS:
            self.assertEqual(normalize_mask({"type": t})["type"], t)

    def test_defaults_y_recortes(self):
        m = normalize_mask({"feather": 9, "opacity": 5, "w": -3})
        self.assertEqual(m["feather"], 0.25)
        self.assertEqual(m["opacity"], 1.0)
        self.assertEqual(m["w"], 0.01)
        self.assertTrue(m["enabled"])

    def test_texto_y_pincel_reciben_su_sub_objeto(self):
        self.assertEqual(normalize_mask({"type": "text"})["text"]["align"], "center")
        brush = normalize_mask({"type": "brush", "brush": {"points": [
            {"x": 0.1, "y": 0.2}, {"x": "mal", "y": 1}, {"x": 0.3, "y": 0.4, "m": 1},
        ]}})["brush"]
        self.assertEqual(len(brush["points"]), 2)   # el punto inválido se descarta
        self.assertEqual(brush["points"][1]["m"], 1)

    def test_maskable_solo_visuales_y_figuras(self):
        self.assertTrue(maskable({"kind": "video"}))
        self.assertTrue(maskable({"kind": "image"}))
        self.assertTrue(maskable({"kind": "shape"}))
        self.assertFalse(maskable({"kind": "text"}))
        self.assertFalse(maskable({"kind": "audio"}))

    def test_clip_sin_masks_no_tiene_mascara(self):
        self.assertFalse(has_mask(_clip()))
        self.assertTrue(has_mask(_clip(masks=[{"type": "circle"}])))
        self.assertFalse(has_mask(_clip(masks=[{"type": "circle", "enabled": False}])))


class AlfaTest(unittest.TestCase):
    def test_circulo_dentro_visible_fuera_transparente(self):
        a = mask_alpha(normalize_mask({"type": "circle", "w": 0.5, "h": 0.5}), 720, 1280)
        self.assertEqual(a.shape, (1280, 720))
        self.assertAlmostEqual(float(a[640, 360]), 1.0, places=3)
        self.assertAlmostEqual(float(a[10, 10]), 0.0, places=3)

    def test_invertir_intercambia_dentro_y_fuera(self):
        m = {"type": "circle", "w": 0.5, "h": 0.5, "invert": True}
        a = mask_alpha(normalize_mask(m), 720, 1280)
        self.assertAlmostEqual(float(a[640, 360]), 0.0, places=3)
        self.assertAlmostEqual(float(a[10, 10]), 1.0, places=3)

    def test_division_deja_ver_la_mitad_de_arriba(self):
        a = mask_alpha(normalize_mask({"type": "linear"}), 720, 1280)
        self.assertAlmostEqual(float(a[20, 360]), 1.0, places=3)
        self.assertAlmostEqual(float(a[1260, 360]), 0.0, places=3)

    def test_division_girada_180_deja_ver_la_de_abajo(self):
        a = mask_alpha(normalize_mask({"type": "linear", "rotation": 180}), 720, 1280)
        self.assertAlmostEqual(float(a[20, 360]), 0.0, places=3)
        self.assertAlmostEqual(float(a[1260, 360]), 1.0, places=3)

    def test_pluma_hace_transicion_progresiva(self):
        m = normalize_mask({"type": "circle", "w": 0.5, "h": 0.5, "feather": 0.06})
        a = mask_alpha(m, 720, 1280)
        centro = float(a[640, 360])
        borde = float(a[640 - 320, 360])       # justo en el radio
        fuera = float(a[640 - 460, 360])
        self.assertGreater(centro, 0.95)
        self.assertTrue(0.15 < borde < 0.85, borde)
        self.assertLess(fuera, 0.05)
        self.assertGreater(centro, borde)
        self.assertGreater(borde, fuera)

    def test_opacidad_deja_ver_parcialmente_lo_de_fuera(self):
        a = mask_alpha(normalize_mask({"type": "circle", "opacity": 0.4}), 720, 1280)
        self.assertAlmostEqual(float(a[640, 360]), 1.0, places=3)
        self.assertAlmostEqual(float(a[10, 10]), 0.6, places=2)

    def test_circulo_sigue_redondo_cambie_el_aspecto(self):
        # w/h van en unidades de ALTO: el diámetro en píxeles es el mismo en
        # los dos ejes tanto en 9:16 como en 16:9.
        for w, h in ((720, 1280), (1280, 720), (1080, 1080)):
            a = mask_alpha(normalize_mask({"type": "circle", "w": 0.4, "h": 0.4}), w, h)
            ys, xs = np.nonzero(a > 0.5)
            self.assertAlmostEqual(xs.max() - xs.min(), ys.max() - ys.min(), delta=2,
                                   msg=f"{w}x{h}")
            self.assertAlmostEqual(xs.max() - xs.min(), 0.4 * h, delta=3)

    def test_texto_recorta_por_las_letras(self):
        vacio = mask_alpha(normalize_mask({"type": "text", "text": {"content": ""}}), 720, 1280)
        lleno = mask_alpha(
            normalize_mask({"type": "text", "text": {"content": "VIAJE", "size": 0.14}}), 720, 1280)
        self.assertEqual(float(vacio.max()), 0.0)
        self.assertGreater(float(lleno.mean()), 0.005)
        self.assertAlmostEqual(float(lleno.max()), 1.0, places=2)

    def test_pincel_pinta_el_trazo_guardado(self):
        m = normalize_mask({"type": "brush", "brush": {"size": 0.1, "points": [
            {"x": -0.2, "y": 0.0}, {"x": 0.2, "y": 0.0},
        ]}})
        a = mask_alpha(m, 720, 1280)
        self.assertAlmostEqual(float(a[640, 360]), 1.0, places=2)   # sobre el trazo
        self.assertAlmostEqual(float(a[200, 360]), 0.0, places=3)   # lejos

    def test_varias_mascaras_se_cruzan(self):
        izq = {"type": "rectangle", "x": 0.3, "w": 0.5, "h": 2.0}
        der = {"type": "rectangle", "x": 0.7, "w": 0.5, "h": 2.0}
        both = combined_alpha([normalize_mask(izq), normalize_mask(der)], 720, 1280)
        solo = combined_alpha([normalize_mask(izq)], 720, 1280)
        self.assertGreater(int(solo.max()), 200)
        self.assertLess(int(both.sum()), int(solo.sum()))

    def test_mascara_desactivada_no_recorta(self):
        a = combined_alpha([normalize_mask({"type": "circle", "enabled": False})], 64, 64)
        self.assertEqual(int(a.min()), 255)


class KeyframesTest(unittest.TestCase):
    def test_las_claves_de_mascara_son_animables(self):
        for key in MASK_KF_KEYS:
            self.assertIn(key, KF_PROP_KEYS)

    def test_static_props_lee_la_primera_mascara(self):
        props = static_props(_clip(masks=[{"type": "circle", "x": 0.2, "y": 0.8}]))
        self.assertAlmostEqual(props["mx"], 0.2)
        self.assertAlmostEqual(props["my"], 0.8)

    def test_sin_mascara_los_defaults_no_rompen_nada(self):
        props = static_props(_clip())
        self.assertAlmostEqual(props["mx"], 0.5)
        self.assertAlmostEqual(props["mfeather"], 0.0)

    def _animado(self):
        return _clip(
            masks=[{"type": "circle", "x": 0.2}],
            keyframes={"enabled": True, "items": [
                {"id": "k1", "t": 0.0, "interpolation": "linear", "props": {"mx": 0.2}},
                {"id": "k2", "t": 4.0, "interpolation": "linear", "props": {"mx": 0.8}},
            ]},
        )

    def test_la_posicion_se_interpola_entre_keyframes(self):
        clip = self._animado()
        self.assertAlmostEqual(clip_masks_at(clip, 0.0)[0]["x"], 0.2, places=4)
        self.assertAlmostEqual(clip_masks_at(clip, 2.0)[0]["x"], 0.5, places=4)
        self.assertAlmostEqual(clip_masks_at(clip, 4.0)[0]["x"], 0.8, places=4)

    def test_mask_animates_distingue_estatica_de_animada(self):
        self.assertTrue(mask_animates(self._animado(), 4.0))
        quieta = _clip(masks=[{"type": "circle"}], keyframes={"enabled": True, "items": [
            {"id": "k1", "t": 0.0, "props": {"x": 0.2}},
            {"id": "k2", "t": 4.0, "props": {"x": 0.9}},
        ]})
        self.assertFalse(mask_animates(quieta, 4.0))
        self.assertFalse(mask_animates(_clip(masks=[{"type": "circle"}]), 4.0))

    def test_sin_keyframes_la_mascara_es_la_guardada(self):
        clip = _clip(masks=[{"type": "circle", "x": 0.33}])
        self.assertAlmostEqual(clip_masks_at(clip, 9.0)[0]["x"], 0.33)


class RasterizadoTest(unittest.TestCase):
    def test_mascara_estatica_genera_un_solo_png(self):
        tmp = Path(tempfile.mkdtemp())
        spec = build_clip_mask(_clip(masks=[{"type": "circle"}]), tmp, 128, 224, 30)
        self.assertFalse(spec["animated"])
        self.assertTrue(Path(spec["path"]).exists())

    def test_mascara_animada_genera_una_secuencia(self):
        tmp = Path(tempfile.mkdtemp())
        clip = _clip(
            out_point=1.0, source_duration=1.0, masks=[{"type": "circle"}],
            keyframes={"enabled": True, "items": [
                {"id": "k1", "t": 0.0, "props": {"mx": 0.2}},
                {"id": "k2", "t": 1.0, "props": {"mx": 0.8}},
            ]},
        )
        spec = build_clip_mask(clip, tmp, 96, 96, 10)
        self.assertTrue(spec["animated"])
        self.assertEqual(spec["frames"], 10)
        self.assertIn("%06d", spec["path"])
        self.assertEqual(len(list((tmp / "c1").glob("*.png"))), 10)

    def test_clip_sin_mascara_no_rasteriza(self):
        self.assertIsNone(build_clip_mask(_clip(), Path(tempfile.mkdtemp()), 64, 64, 30))


class ExportTest(unittest.TestCase):
    def test_sin_mascara_el_filtergraph_no_cambia(self):
        _cmd, filt = _graph(_clip())
        self.assertNotIn("maskedmerge", filt)
        self.assertIn("overlay=", filt)

    def test_con_mascara_se_compone_con_maskedmerge(self):
        spec = {"path": "m.png", "animated": False, "duration": 4.0}
        cmd, filt = _graph(_clip(masks=[{"type": "circle"}]), mask_files={"c1": spec})
        self.assertIn("maskedmerge", filt)
        self.assertIn("[base]format=gbrp,split=2[mb0][mo0]", filt)
        self.assertIn("[mb0][mt0][mk0]maskedmerge[ov0]", filt)
        # El PNG entra como input propio, DESPUÉS del material.
        self.assertEqual(cmd.count("-loop"), 2)
        self.assertIn("m.png", cmd)

    def test_la_mascara_animada_se_alinea_con_el_instante_del_clip(self):
        # El clip vive en [1.5, 3.5) de una timeline de 6 s: la secuencia de
        # máscaras se rellena clonando el primer y el último fotograma.
        spec = {"path": "d/%06d.png", "animated": True, "fps": 30, "frames": 60, "duration": 2.0}
        clip = _clip(start=1.5, out_point=2.0, source_duration=2.0, masks=[{"type": "circle"}])
        cola = _clip(id="c2", start=4.0, out_point=2.0, source_duration=2.0)
        _cmd, filt = _graph(clip, mask_files={"c1": spec}, extra=[cola])
        self.assertIn("tpad=start_mode=clone:start_duration=1.500", filt)
        self.assertIn("tpad=stop_mode=clone", filt)

    def test_una_mascara_que_llega_al_final_no_necesita_relleno_de_cola(self):
        spec = {"path": "d/%06d.png", "animated": True, "fps": 30, "frames": 60, "duration": 2.0}
        clip = _clip(start=1.5, out_point=2.0, source_duration=2.0, masks=[{"type": "circle"}])
        _cmd, filt = _graph(clip, mask_files={"c1": spec})
        self.assertNotIn("tpad=stop_mode=clone", filt)

    def test_sin_rasterizado_previo_el_clip_se_compone_igual_que_siempre(self):
        # build_command sin mask_files (p. ej. desde una prueba) no debe romper.
        _cmd, filt = _graph(_clip(masks=[{"type": "circle"}]))
        self.assertNotIn("maskedmerge", filt)


class PersistenciaTest(unittest.TestCase):
    def test_las_mascaras_sobreviven_al_modelo_y_a_la_migracion(self):
        mask = {"type": "star", "x": 0.3, "feather": 0.08, "invert": True}
        clip = _clip(masks=[mask])
        data = clip.model_dump()
        self.assertEqual(data["masks"], [mask])
        tl = {"schema_version": 1, "clips": [data], "tracks": []}
        migrado = migrate_timeline(tl)
        self.assertEqual(migrado["clips"][0]["masks"], [mask])
        vuelta = Timeline(**migrado)
        self.assertEqual(vuelta.clips[0].masks, [mask])

    def test_un_clip_viejo_sin_masks_sigue_validando(self):
        self.assertEqual(_clip().masks, [])


class GeometriaTest(unittest.TestCase):
    def test_el_centro_se_mide_sobre_ancho_y_alto(self):
        g = mask_geometry(normalize_mask({"x": 0.25, "y": 0.5}), 720, 1280)
        self.assertAlmostEqual(g["cx"], 180)
        self.assertAlmostEqual(g["cy"], 640)

    def test_el_tamano_se_mide_siempre_sobre_el_alto(self):
        g = mask_geometry(normalize_mask({"w": 0.5, "h": 0.5, "scale_x": 2}), 720, 1280)
        self.assertAlmostEqual(g["hw"], 640)
        self.assertAlmostEqual(g["hh"], 320)


if __name__ == "__main__":
    unittest.main()
