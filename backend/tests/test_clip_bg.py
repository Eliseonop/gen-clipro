"""Eliminar fondo: modelo del clip, matte derivado y paridad del chroma key.

El chroma key del preview y el del export deben dar el MISMO alfa. Aquí se fija
el modelo contra el ``chromakey`` REAL de FFmpeg (píxel a píxel) y contra
``despill``; ``clipBg.test.mjs`` comprueba que el JS reproduce estas mismas
tablas, así que la paridad queda cerrada por los dos lados.
"""
from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from app import clip_bg
from app.migrations import migrate_timeline
from app.schemas import Timeline, TimelineClip

# Colores de prueba: verdes puros y sucios, azules, grises y carne.
COLORS = [
    (0, 255, 0), (255, 0, 0), (128, 128, 128), (0, 120, 0), (0, 255, 120),
    (200, 200, 0), (0, 0, 255), (60, 200, 60), (90, 180, 90), (20, 140, 30),
    (210, 240, 210), (240, 190, 160), (10, 10, 10), (255, 255, 255),
]
BLOCK = 24


def _clip(**kw) -> TimelineClip:
    data = dict(
        id="c1", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
        filename="a.mp4", start=0.0, in_point=0.0, out_point=4.0,
        source_duration=4.0, layout="fill",
    )
    data.update(kw)
    return TimelineClip(**data)


def _ready_auto(**kw) -> dict:
    auto = {"enabled": True, "base_key": "abc123", "status": "ready"}
    auto.update(kw)
    return auto


def _bg(auto=None, chroma=None, **kw) -> dict:
    out = {"enabled": True, "mode": "auto", "auto": auto or {}, "chroma": chroma or {}}
    out.update(kw)
    return out


class ModelTest(unittest.TestCase):
    def test_sin_campo_devuelve_none(self):
        self.assertIsNone(clip_bg.clip_bg(_clip()))
        self.assertIsNone(clip_bg.normalize_bg(None))
        self.assertIsNone(clip_bg.normalize_bg({}))

    def test_defaults_normalizados(self):
        bg = clip_bg.normalize_bg(_bg())
        self.assertEqual(bg["mode"], "auto")
        self.assertEqual(bg["auto"]["provider"], clip_bg.DEFAULT_PROVIDER)
        self.assertEqual(bg["auto"]["mask_fps"], clip_bg.DEFAULT_MASK_FPS)
        self.assertEqual(bg["auto"]["status"], "idle")
        self.assertEqual(bg["chroma"]["color"], "#00FF00")
        self.assertFalse(bg["auto"]["enabled"])
        self.assertFalse(bg["chroma"]["enabled"])

    def test_valores_fuera_de_rango_se_acotan(self):
        bg = clip_bg.normalize_bg(_bg(
            auto={"mask_fps": 999, "mask_height": 4, "threshold": 5, "feather": 9,
                  "softness": -3, "provider": "inexistente"},
            chroma={"similarity": 88, "blend": -1, "spill": 42}))
        a, c = bg["auto"], bg["chroma"]
        self.assertEqual(a["mask_fps"], clip_bg.MASK_FPS_MAX)
        self.assertEqual(a["mask_height"], clip_bg.MASK_HEIGHT_MIN)
        self.assertEqual(a["threshold"], 1.0)
        self.assertEqual(a["softness"], 0.0)
        self.assertEqual(a["feather"], clip_bg.MATTE_FEATHER_MAX)
        self.assertEqual(a["provider"], clip_bg.DEFAULT_PROVIDER)
        self.assertEqual(c["similarity"], 1.0)
        self.assertEqual(c["blend"], 0.0)
        self.assertEqual(c["spill"], 1.0)

    def test_color_hex_tolerante(self):
        for raw, want in [("0x00ff00", "#00FF00"), ("#0f0", "#00FF00"),
                          ("00FF00", "#00FF00"), ("basura", "#00FF00"),
                          ("#123456", "#123456")]:
            self.assertEqual(clip_bg.normalize_hex(raw), want, raw)

    def test_activo_solo_si_hay_matte_listo_o_croma(self):
        # auto pedido pero sin matte listo: no altera el render todavía.
        c = _clip(bg_removal=_bg(auto={"enabled": True, "status": "running"}))
        self.assertFalse(clip_bg.bg_active(c))
        self.assertTrue(clip_bg.auto_requested(c))
        # matte listo
        self.assertTrue(clip_bg.bg_active(_clip(bg_removal=_bg(auto=_ready_auto()))))
        # solo croma
        self.assertTrue(clip_bg.bg_active(_clip(bg_removal=_bg(chroma={"enabled": True}))))
        # apagado global manda sobre todo
        self.assertFalse(clip_bg.bg_active(
            _clip(bg_removal=_bg(auto=_ready_auto(), chroma={"enabled": True}, enabled=False))))

    def test_solo_video_e_imagen(self):
        for kind, ok in [("video", True), ("image", True), ("shape", False),
                         ("text", False), ("audio", False)]:
            self.assertEqual(clip_bg.bg_capable(_clip(kind=kind)), ok, kind)

    def test_edits_sin_puntos_se_descartan(self):
        bg = clip_bg.normalize_bg(_bg(auto={"edits": [
            {"op": "keep", "points": []},
            {"op": "erase", "points": [{"x": 0.5, "y": 0.5}]},
            {"op": "raro", "points": [{"x": "nan", "y": 1}]},
        ]}))
        self.assertEqual(len(bg["auto"]["edits"]), 1)
        self.assertEqual(bg["auto"]["edits"][0]["op"], "erase")

    def test_proyecto_antiguo_sin_el_campo_sigue_igual(self):
        """Es puramente aditivo: nada que migrar y nada que cambie."""
        viejo = {
            "schema_version": 1, "fps": 30, "width": 720, "height": 1280,
            "tracks": [{"id": "V1", "kind": "video", "name": "V1"}],
            "clips": [{"id": "c1", "track_id": "V1", "kind": "video",
                       "asset_kind": "clips", "asset_id": "1", "filename": "a.mp4",
                       "in_point": 0.0, "out_point": 3.0, "source_duration": 3.0}],
        }
        tl = Timeline(**migrate_timeline(viejo))
        self.assertIsNone(tl.clips[0].bg_removal)
        self.assertFalse(clip_bg.bg_active(tl.clips[0]))
        # y round-trip sin introducir el campo con valores raros
        self.assertIsNone(Timeline(**tl.model_dump()).clips[0].bg_removal)


class FrameIndexTest(unittest.TestCase):
    def test_indice_por_tiempo_absoluto_de_fuente(self):
        self.assertEqual(clip_bg.matte_frame_index(0.0, 15), 0)
        self.assertEqual(clip_bg.matte_frame_index(1.0, 15), 15)
        self.assertEqual(clip_bg.matte_frame_index(0.0333, 15), 0)
        self.assertEqual(clip_bg.matte_frame_index(0.0334, 15), 1)   # redondeo al más cercano
        self.assertEqual(clip_bg.matte_frame_index(-5, 15), 0)

    def test_ida_y_vuelta(self):
        for i in (0, 1, 7, 450):
            self.assertEqual(clip_bg.matte_frame_index(
                clip_bg.matte_frame_time(i, 15), 15), i)

    def test_recortar_el_clip_no_cambia_la_clave(self):
        """La clave base NO depende de in/out: cortar no invalida la caché."""
        auto = clip_bg.normalize_auto({"mask_fps": 15, "mask_height": 512})
        k1 = clip_bg.base_key("a.mp4:100:5", auto, "u2net-1")
        k2 = clip_bg.base_key("a.mp4:100:5", auto, "u2net-1")
        self.assertEqual(k1, k2)

    def test_la_clave_base_cambia_con_fuente_modelo_o_cadencia(self):
        auto = clip_bg.normalize_auto({"mask_fps": 15, "mask_height": 512})
        base = clip_bg.base_key("a.mp4:100:5", auto, "u2net-1")
        self.assertNotEqual(base, clip_bg.base_key("a.mp4:100:6", auto, "u2net-1"))
        self.assertNotEqual(base, clip_bg.base_key("a.mp4:100:5", auto, "u2net-2"))
        otra = clip_bg.normalize_auto({"mask_fps": 30, "mask_height": 512})
        self.assertNotEqual(base, clip_bg.base_key("a.mp4:100:5", otra, "u2net-1"))
        alta = clip_bg.normalize_auto({"mask_fps": 15, "mask_height": 720})
        self.assertNotEqual(base, clip_bg.base_key("a.mp4:100:5", alta, "u2net-1"))

    def test_los_ajustes_baratos_solo_mueven_la_clave_derivada(self):
        """Mover un slider NO debe re-ejecutar el modelo."""
        a1 = clip_bg.normalize_auto({"threshold": 0.5, "feather": 0.0})
        a2 = clip_bg.normalize_auto({"threshold": 0.7, "feather": 0.02})
        base = clip_bg.base_key("a.mp4:1:1", a1, "u2net-1")
        self.assertEqual(base, clip_bg.base_key("a.mp4:1:1", a2, "u2net-1"))
        self.assertNotEqual(clip_bg.derive_key(base, a1), clip_bg.derive_key(base, a2))

    def test_el_pincel_mueve_la_clave_derivada(self):
        a1 = clip_bg.normalize_auto({})
        a2 = clip_bg.normalize_auto({"edits": [
            {"op": "erase", "size": 0.1, "points": [{"x": 0.2, "y": 0.3}]}]})
        base = clip_bg.base_key("a.mp4:1:1", a1, "u2net-1")
        self.assertNotEqual(clip_bg.derive_key(base, a1), clip_bg.derive_key(base, a2))


class DeriveMatteTest(unittest.TestCase):
    def _auto(self, **kw):
        return clip_bg.normalize_auto(kw)

    def test_umbral_duro_binariza(self):
        raw = np.arange(256, dtype=np.uint8).reshape(1, 256)
        raw = np.repeat(raw, 8, axis=0)
        out = clip_bg.derive_matte(raw, self._auto(threshold=0.5, softness=0.0))
        self.assertEqual(int(out[0, 10]), 0)
        self.assertEqual(int(out[0, 250]), 255)
        # softness=0 deja una ventana mínima de 0.002 (evita dividir por cero),
        # así que como mucho un nivel de la rampa cae a medio camino.
        medios = [v for v in np.unique(out).tolist() if 3 < v < 252]
        self.assertEqual(medios, [], f"la transición no es dura: {medios}")

    def test_los_niveles_salen_de_la_lut_no_de_float32(self):
        """La LUT se construye en float de 64 bits, igual que el JS.

        La entrada 96 con umbral 0,5 y suavizado 0,25 cae justo en el .5 de la
        rampa: en float32 daba 2 y en float64 da 1. Da igual cuál sea "mejor",
        lo que no puede pasar es que el preview diga una cosa y el export otra.
        """
        auto = self._auto(threshold=0.5, softness=0.25)
        lut = clip_bg.matte_lut(auto)
        self.assertEqual(int(lut[96]), 1)
        self.assertEqual(int(lut[0]), 0)
        self.assertEqual(int(lut[255]), 255)

    def test_ventana_de_suavizado_hace_rampa(self):
        raw = np.arange(256, dtype=np.uint8).reshape(1, 256).repeat(8, axis=0)
        out = clip_bg.derive_matte(raw, self._auto(threshold=0.5, softness=1.0))
        self.assertGreater(len(np.unique(out)), 100)
        self.assertEqual(int(out[0, 0]), 0)
        self.assertEqual(int(out[0, 255]), 255)

    def test_invertir_intercambia_sujeto_y_fondo(self):
        raw = np.zeros((8, 8), np.uint8)
        raw[:, 4:] = 255
        normal = clip_bg.derive_matte(raw, self._auto(threshold=0.5, softness=0.0))
        inv = clip_bg.derive_matte(raw, self._auto(threshold=0.5, softness=0.0, invert=True))
        np.testing.assert_array_equal(normal, 255 - inv)

    def test_pincel_conservar_recupera_zona_borrada_por_la_ia(self):
        raw = np.zeros((64, 64), np.uint8)          # la IA no vio nada
        auto = self._auto(edits=[{"op": "keep", "size": 0.4,
                                  "points": [{"x": 0.5, "y": 0.5}]}])
        out = clip_bg.derive_matte(raw, auto)
        self.assertEqual(int(out[32, 32]), 255)     # centro recuperado
        self.assertEqual(int(out[2, 2]), 0)         # esquina sigue fuera

    def test_pincel_eliminar_manda_sobre_la_ia(self):
        raw = np.full((64, 64), 255, np.uint8)      # la IA lo dio todo por sujeto
        auto = self._auto(edits=[{"op": "erase", "size": 0.4,
                                  "points": [{"x": 0.5, "y": 0.5}]}])
        out = clip_bg.derive_matte(raw, auto)
        self.assertEqual(int(out[32, 32]), 0)
        self.assertEqual(int(out[2, 2]), 255)

    def test_eliminar_gana_a_conservar_en_el_mismo_punto(self):
        raw = np.zeros((64, 64), np.uint8)
        auto = self._auto(edits=[
            {"op": "keep", "size": 0.5, "points": [{"x": 0.5, "y": 0.5}]},
            {"op": "erase", "size": 0.5, "points": [{"x": 0.5, "y": 0.5}]},
        ])
        self.assertEqual(int(clip_bg.derive_matte(raw, auto)[32, 32]), 0)

    def test_pluma_difumina_el_borde(self):
        raw = np.zeros((128, 128), np.uint8)
        raw[:, 64:] = 255
        duro = clip_bg.derive_matte(raw, self._auto(threshold=0.5, softness=0.0))
        blando = clip_bg.derive_matte(raw, self._auto(threshold=0.5, softness=0.0, feather=0.05))
        self.assertEqual(len(np.unique(duro)), 2)
        self.assertGreater(len(np.unique(blando)), 10)

    def test_el_trazo_se_escala_con_el_lienzo(self):
        """Las coordenadas son normalizadas: el resultado no depende del tamaño."""
        auto = self._auto(edits=[{"op": "keep", "size": 0.5,
                                  "points": [{"x": 0.5, "y": 0.5}]}])
        chico = clip_bg.derive_matte(np.zeros((64, 64), np.uint8), auto)
        grande = clip_bg.derive_matte(np.zeros((256, 256), np.uint8), auto)
        # misma fracción de píxeles cubiertos (±2%)
        self.assertAlmostEqual((chico > 127).mean(), (grande > 127).mean(), delta=0.02)


@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class ChromaKeyParityTest(unittest.TestCase):
    """El chroma key del modelo debe ser IDÉNTICO al de ffmpeg, píxel a píxel."""

    @classmethod
    def setUpClass(cls):
        cls.td = Path(tempfile.mkdtemp(prefix="vy-chroma-"))
        img = np.zeros((BLOCK, BLOCK * len(COLORS), 3), np.uint8)
        for i, (r, g, b) in enumerate(COLORS):
            img[:, i * BLOCK:(i + 1) * BLOCK] = (b, g, r)
        cls.src = cls.td / "in.png"
        cv2.imwrite(str(cls.src), img)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.td, ignore_errors=True)

    def _ffmpeg(self, chain: str) -> np.ndarray:
        out = self.td / "out.png"
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(self.src),
             "-vf", f"{chain},format=rgba", "-frames:v", "1", str(out)],
            check=True, capture_output=True)
        img = cv2.imread(str(out), cv2.IMREAD_UNCHANGED)
        # centro de cada bloque (lejos del borde: chromakey promedia el vecindario)
        return np.array([img[BLOCK // 2, i * BLOCK + BLOCK // 2]
                         for i in range(len(COLORS))])

    def test_uv_del_fotograma_igual_que_swscale(self):
        """``frame_uv`` debe dar el MISMO entero que swscale, no un aproximado.

        Con coma flotante se desvía 1 LSB en algunos colores y el alfa del croma
        dejaría de coincidir con el export. De ahí la aritmética de punto fijo.
        """
        planes = self.td / "planes.raw"
        w, h = BLOCK * len(COLORS), BLOCK
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(self.src),
             "-vf", "format=yuva444p", "-f", "rawvideo", "-pix_fmt", "yuva444p",
             str(planes)], check=True, capture_output=True)
        raw = np.fromfile(planes, np.uint8)
        p = w * h
        U = raw[p:2 * p].reshape(h, w)
        V = raw[2 * p:3 * p].reshape(h, w)
        for i, (r, g, b) in enumerate(COLORS):
            cx = i * BLOCK + BLOCK // 2
            self.assertEqual(clip_bg.frame_uv(r, g, b),
                             (int(U[h // 2, cx]), int(V[h // 2, cx])),
                             f"rgb=({r},{g},{b})")

    def test_alfa_identico_al_de_ffmpeg(self):
        casos = [
            {"color": "#00FF00", "similarity": 0.20, "blend": 0.10},
            {"color": "#00FF00", "similarity": 0.30, "blend": 0.35},
            {"color": "#00FF00", "similarity": 0.10, "blend": 0.0},
            {"color": "#0000FF", "similarity": 0.25, "blend": 0.20},
            {"color": "#3CC83C", "similarity": 0.15, "blend": 0.25},
            {"color": "#00FF00", "similarity": 0.45, "blend": 0.60},
        ]
        for raw in casos:
            chroma = clip_bg.normalize_chroma({**raw, "enabled": True})
            got = self._ffmpeg(",".join(clip_bg.chroma_filters(chroma)))
            for i, (r, g, b) in enumerate(COLORS):
                self.assertEqual(
                    int(got[i][3]), clip_bg.chroma_alpha8(r, g, b, chroma),
                    f"{raw} rgb=({r},{g},{b})")

    def test_despill_identico_al_de_ffmpeg(self):
        for spill in (0.35, 1.0):
            chroma = clip_bg.normalize_chroma(
                {"enabled": True, "color": "#00FF00", "similarity": 0.9,
                 "blend": 0.0, "spill": spill})
            got = self._ffmpeg(",".join(clip_bg.chroma_filters(chroma)))
            for i, (r, g, b) in enumerate(COLORS):
                want = clip_bg.despill_rgb(r, g, b, chroma)
                # BGR en cv2; ±1 por el redondeo en coma flotante de ffmpeg
                for ch, name in ((2, "R"), (1, "G"), (0, "B")):
                    self.assertLessEqual(
                        abs(int(got[i][ch]) - want[2 - ch]), 1,
                        f"spill={spill} rgb=({r},{g},{b}) canal {name}")

    def test_el_verde_puro_necesita_tolerancia_minima(self):
        """La clave usa rango COMPLETO y el fotograma LIMITADO: diff nunca es 0."""
        chroma = clip_bg.normalize_chroma({"enabled": True, "color": "#00FF00"})
        self.assertGreater(clip_bg.chroma_alpha8(0, 255, 0,
                                                 {**chroma, "similarity": 0.01,
                                                  "blend": 0.0}), 0)
        self.assertEqual(clip_bg.chroma_alpha8(0, 255, 0, chroma), 0)


class GoldenFixtureTest(unittest.TestCase):
    """``shared/bg_chroma_golden.json`` ancla el espejo JS↔Python.

    El JS no puede llamar a FFmpeg, así que la paridad se cierra en dos saltos:
    Python == FFmpeg (los tests de arriba) y JS == Python (este fixture, que lee
    también ``frontend/src/lib/clipBg.test.mjs``). Si alguien toca la fórmula de
    un lado, uno de los dos tests salta.
    """

    GOLDEN = Path(__file__).resolve().parents[2] / "shared" / "bg_chroma_golden.json"

    def setUp(self):
        import json
        self.golden = json.loads(self.GOLDEN.read_text(encoding="utf-8"))
        self.colors = [tuple(c) for c in self.golden["colors"]]

    def test_uv_del_fotograma(self):
        for c, want in zip(self.colors, self.golden["frame_uv"]):
            self.assertEqual(list(clip_bg.frame_uv(*c)), want, c)

    def test_alfa_del_croma(self):
        for case in self.golden["chroma"]:
            chroma = clip_bg.normalize_chroma({**case["chroma"], "enabled": True})
            self.assertEqual(list(clip_bg.chroma_key_uv(chroma["color"])),
                             case["key_uv"], case["chroma"])
            for c, want in zip(self.colors, case["alpha"]):
                self.assertEqual(clip_bg.chroma_alpha8(*c, chroma), want,
                                 f"{case['chroma']} {c}")

    def test_despill(self):
        for case in self.golden["despill"]:
            chroma = clip_bg.normalize_chroma(
                {**case["chroma"], "enabled": True, "similarity": 0.9, "blend": 0.0})
            for c, want in zip(self.colors, case["rgb"]):
                self.assertEqual(list(clip_bg.despill_rgb(*c, chroma)), want,
                                 f"{case['chroma']} {c}")

    def test_niveles_del_matte(self):
        for case in self.golden["levels"]:
            auto = clip_bg.normalize_auto(case["auto"])
            self.assertEqual(clip_bg.matte_lut(auto).tolist(), case["lut"], case["auto"])

    def test_la_lut_es_el_resultado_exacto_sin_pluma_ni_pincel(self):
        """Sin pluma ni correcciones, derive_matte == LUT (nada de coma flotante)."""
        ramp = np.arange(256, dtype=np.uint8).reshape(1, 256)
        for case in self.golden["levels"]:
            auto = clip_bg.normalize_auto(case["auto"])
            self.assertEqual(clip_bg.derive_matte(ramp, auto)[0].tolist(),
                             clip_bg.matte_lut(auto).tolist(), case["auto"])


class ChromaFiltersTest(unittest.TestCase):
    def test_apagado_no_genera_filtros(self):
        self.assertEqual(clip_bg.chroma_filters(clip_bg.normalize_chroma({})), [])

    def test_sin_derrame_no_mete_despill(self):
        c = clip_bg.normalize_chroma({"enabled": True, "spill": 0})
        chain = clip_bg.chroma_filters(c)
        self.assertNotIn("despill", ",".join(chain))
        # yuva444p es obligatorio: sin él chromakey promedia el croma submuestreado
        self.assertEqual(chain[0], "format=yuva444p")

    def test_con_derrame_mete_despill_con_el_tipo_correcto(self):
        verde = clip_bg.chroma_filters(clip_bg.normalize_chroma(
            {"enabled": True, "color": "#00FF00", "spill": 0.5}))
        azul = clip_bg.chroma_filters(clip_bg.normalize_chroma(
            {"enabled": True, "color": "#0000FF", "spill": 0.5}))
        self.assertIn("despill=type=green", ",".join(verde))
        self.assertIn("green=-0.500000", ",".join(verde))
        self.assertIn("despill=type=blue", ",".join(azul))
        self.assertIn("blue=-0.500000", ",".join(azul))


if __name__ == "__main__":
    unittest.main()
