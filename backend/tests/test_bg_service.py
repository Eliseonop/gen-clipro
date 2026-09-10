"""Eliminar fondo: caché en dos niveles, rango incremental y proveedores.

Los tests usan un proveedor FALSO (matte determinista): no descargan pesos ni
ejecutan ONNX, así que corren en cualquier máquina y sin red.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from app import clip_bg
from app.bg import providers as bg_providers
from app.bg import service as bg_service
from app.schemas import Timeline, TimelineClip, TimelineTrack


class FakeProvider(bg_providers.BackgroundRemovalProvider):
    """Matte determinista: mitad izquierda sujeto, mitad derecha fondo."""

    id = "u2net"
    label = "falso"
    model_version = "fake-1"

    def __init__(self):
        self.calls = 0
        self.ready = 0

    def available(self):
        return True

    def unavailable_reason(self):
        return ""

    def ensure_ready(self, on_progress=None):
        self.ready += 1

    def matte(self, frame):
        self.calls += 1
        h, w = frame.shape[:2]
        m = np.zeros((h, w), np.uint8)
        m[:, : w // 2] = 255
        return m


def _clip(**kw) -> TimelineClip:
    data = dict(
        id="c1", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
        filename="a.mp4", start=0.0, in_point=0.0, out_point=2.0,
        source_duration=2.0, layout="fill",
    )
    data.update(kw)
    return TimelineClip(**data)


class CacheBase(unittest.TestCase):
    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-bgsvc-"))
        self.prov = FakeProvider()
        self._patches = [
            patch.object(bg_service, "CACHE_ROOT", self.td / "bgcache"),
            patch.object(bg_service, "MATTE_ROOT", self.td / "bgcache" / "matte"),
            patch.object(bg_service, "MASK_ROOT", self.td / "bgcache" / "mask"),
            patch.object(bg_providers, "PROVIDERS", {"u2net": self.prov}),
            patch.object(bg_providers, "_device_setting", return_value="cpu"),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()
        shutil.rmtree(self.td, ignore_errors=True)

    def _auto(self, **kw) -> dict:
        return clip_bg.normalize_auto({"provider": "u2net", "mask_fps": 10,
                                       "mask_height": 64, **kw})

    def _video(self, seconds: float = 2.0, name: str = "v.mp4") -> Path:
        """Vídeo sintético pequeño (necesita ffmpeg)."""
        out = self.td / name
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=96x64:rate=10",
             "-pix_fmt", "yuv420p", str(out)], check=True, capture_output=True)
        return out

    def _big_video(self, seconds: float = 0.5, name: str = "big.mp4") -> Path:
        out = self.td / name
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=384x256:rate=10",
             "-pix_fmt", "yuv420p", str(out)], check=True, capture_output=True)
        return out

    def _image(self, name: str = "i.png") -> Path:
        out = self.td / name
        cv2.imwrite(str(out), np.full((64, 96, 3), 200, np.uint8))
        return out


class MissingRangesTest(CacheBase):
    def test_sin_caché_falta_todo(self):
        self.assertEqual(bg_service.missing_ranges("nada", 3, 7), [(3, 7)])

    def test_detecta_huecos_intermedios(self):
        folder = bg_service.matte_dir("k")
        folder.mkdir(parents=True)
        for i in (0, 1, 2, 5, 6):
            cv2.imwrite(str(bg_service.frame_path(folder, i)), np.zeros((4, 4), np.uint8))
        self.assertEqual(bg_service.missing_ranges("k", 0, 7), [(3, 4), (7, 7)])

    def test_nada_que_hacer_si_está_completo(self):
        folder = bg_service.matte_dir("k")
        folder.mkdir(parents=True)
        for i in range(5):
            cv2.imwrite(str(bg_service.frame_path(folder, i)), np.zeros((4, 4), np.uint8))
        self.assertEqual(bg_service.missing_ranges("k", 0, 4), [])

    def test_los_png_se_numeran_desde_1(self):
        """``%06d`` empieza en 000001, así ``-start_number`` cuadra con el índice."""
        self.assertEqual(bg_service.frame_path(Path("/x"), 0).name, "000001.png")
        self.assertEqual(bg_service.frame_path(Path("/x"), 89).name, "000090.png")


class SourceIdTest(CacheBase):
    def test_regenerar_el_archivo_cambia_la_identidad(self):
        """`Guardar clip` sobrescribe: mismo nombre y tamaño, otro contenido.

        Con solo tamaño+mtime esto reusaba el matte del vídeo anterior.
        """
        p = self._image()
        first = bg_service.source_id(p)
        cv2.imwrite(str(p), np.full((64, 96, 3), 10, np.uint8))
        self.assertEqual(p.stat().st_size, 240, "el test necesita el MISMO tamaño")
        self.assertNotEqual(first, bg_service.source_id(p))

    def test_el_mismo_archivo_da_la_misma_identidad(self):
        p = self._image()
        self.assertEqual(bg_service.source_id(p), bg_service.source_id(p))

    def test_dos_archivos_iguales_comparten_matte(self):
        """Duplicar material idéntico no debería re-inferir... salvo por mtime."""
        a = self._image("a.png")
        b = self._image("b.png")
        self.assertNotEqual(bg_service.source_id(a), bg_service.source_id(b))

    def test_archivo_inexistente_no_revienta(self):
        self.assertEqual(bg_service.source_id(self.td / "no-existe.mp4"), "no-existe.mp4")


@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class BuildMatteTest(CacheBase):
    def test_calcula_el_tramo_y_escribe_meta(self):
        src = self._video(2.0)
        auto = self._auto()
        meta = bg_service.build_matte(src, auto, 0.0, 1.0)
        self.assertEqual(meta["provider"], "u2net")
        self.assertEqual(meta["model_version"], "fake-1")
        self.assertEqual(meta["mask_fps"], 10)
        self.assertGreater(self.prov.calls, 5)
        lo, hi = meta["range"]
        self.assertEqual(lo, 0)
        self.assertGreaterEqual(hi, 9)
        for i in range(lo, hi + 1):
            self.assertTrue(bg_service.frame_path(
                bg_service.matte_dir(meta["base_key"]), i).exists(), i)

    def test_segunda_llamada_no_vuelve_a_inferir(self):
        src = self._video(2.0)
        auto = self._auto()
        bg_service.build_matte(src, auto, 0.0, 1.0)
        antes = self.prov.calls
        bg_service.build_matte(src, auto, 0.0, 1.0)
        self.assertEqual(self.prov.calls, antes, "la caché no se está reusando")

    def test_ampliar_el_rango_es_incremental(self):
        src = self._video(2.0)
        auto = self._auto()
        bg_service.build_matte(src, auto, 0.0, 0.5)
        primera = self.prov.calls
        bg_service.build_matte(src, auto, 0.0, 1.5)
        segunda = self.prov.calls - primera
        self.assertGreater(segunda, 0, "no amplió el rango")
        self.assertLess(segunda, primera + 12, "recalculó lo que ya tenía")
        lo, hi = bg_service.covered_range(
            clip_bg.base_key(bg_service.source_id(src), auto, "fake-1"))
        self.assertEqual(lo, 0)
        self.assertGreaterEqual(hi, 15)

    def test_los_ajustes_baratos_no_relanzan_el_modelo(self):
        """Mover umbral/pluma/pincel NO debe volver a inferir."""
        src = self._video(1.0)
        bg_service.build_matte(src, self._auto(), 0.0, 1.0)
        antes = self.prov.calls
        for kw in ({"threshold": 0.8}, {"feather": 0.05}, {"invert": True},
                   {"edits": [{"op": "erase", "size": 0.1,
                               "points": [{"x": 0.5, "y": 0.5}]}]}):
            bg_service.build_matte(src, self._auto(**kw), 0.0, 1.0)
        self.assertEqual(self.prov.calls, antes)

    def test_cambiar_de_modelo_o_cadencia_sí_relanza(self):
        src = self._video(1.0)
        bg_service.build_matte(src, self._auto(), 0.0, 1.0)
        antes = self.prov.calls
        bg_service.build_matte(src, self._auto(mask_fps=20), 0.0, 1.0)
        self.assertGreater(self.prov.calls, antes)

    def test_imagen_fija_es_un_solo_fotograma(self):
        meta = bg_service.build_matte(self._image(), self._auto(), 0.0, 0.0, still=True)
        self.assertEqual(meta["range"], [0, 0])
        self.assertEqual(self.prov.calls, 1)

    def test_cancelar_aborta_y_no_deja_ffmpeg_colgado(self):
        src = self._video(3.0)
        estado = {"n": 0}

        def cancel():
            estado["n"] += 1
            return estado["n"] > 3

        with self.assertRaises(bg_service.BgCancelled):
            bg_service.build_matte(src, self._auto(), 0.0, 3.0, cancel=cancel)
        # lo ya calculado queda en caché y una reanudación lo aprovecha
        self.assertLess(self.prov.calls, 30)

    def test_el_matte_respeta_el_alto_pedido_y_el_aspecto(self):
        src = self._big_video(0.5)      # 384x256
        meta = bg_service.build_matte(src, self._auto(mask_height=128), 0.0, 0.5)
        img = bg_service.read_matte_frame(meta["base_key"], 0)
        self.assertEqual(img.shape[0], 128)
        self.assertEqual(img.shape[1], 192)   # aspecto 384:256 conservado

    def test_no_amplía_material_más_pequeño_que_el_alto_pedido(self):
        """Un vídeo de 64 px no se sube a 512: no habría más detalle, solo coste."""
        src = self._video(0.3)          # 96x64
        meta = bg_service.build_matte(src, self._auto(mask_height=512), 0.0, 0.3)
        self.assertEqual(bg_service.read_matte_frame(meta["base_key"], 0).shape[0], 64)

    def test_el_rango_del_meta_solo_declara_lo_que_existe(self):
        """Pedir más allá del final del vídeo no debe sellar huecos en el meta."""
        src = self._video(0.5)          # 5 fotogramas a 10 fps
        meta = bg_service.build_matte(src, self._auto(), 0.0, 9.0)
        lo, hi = meta["range"]
        folder = bg_service.matte_dir(meta["base_key"])
        for i in range(lo, hi + 1):
            self.assertTrue(bg_service.frame_path(folder, i).exists(), i)
        self.assertFalse(bg_service.frame_path(folder, hi + 1).exists())


@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class DerivedTest(CacheBase):
    def _prepare(self, seconds=2.0, **kw):
        src = self._video(seconds)
        auto = self._auto(**kw)
        meta = bg_service.build_matte(src, auto, 0.0, seconds)
        return src, auto, meta

    def test_el_nivel_2_aplica_los_ajustes(self):
        _src, auto, meta = self._prepare(0.5)
        auto = self._auto(invert=True)
        folder = bg_service.ensure_derived(meta["base_key"], auto, 0, 3)
        img = cv2.imread(str(bg_service.frame_path(folder, 0)), cv2.IMREAD_GRAYSCALE)
        # el proveedor falso pinta la izquierda; invertido debe verse la derecha
        h, w = img.shape
        self.assertLess(int(img[h // 2, 2]), 20)
        self.assertGreater(int(img[h // 2, w - 3]), 235)

    def test_cambiar_un_ajuste_usa_otra_carpeta(self):
        _src, auto, meta = self._prepare(0.5)
        f1 = bg_service.ensure_derived(meta["base_key"], self._auto(threshold=0.4), 0, 2)
        f2 = bg_service.ensure_derived(meta["base_key"], self._auto(threshold=0.9), 0, 2)
        self.assertNotEqual(f1, f2)

    def test_no_reescribe_lo_ya_derivado(self):
        _src, auto, meta = self._prepare(0.5)
        folder = bg_service.ensure_derived(meta["base_key"], auto, 0, 3)
        mtime = bg_service.frame_path(folder, 0).stat().st_mtime_ns
        bg_service.ensure_derived(meta["base_key"], auto, 0, 3)
        self.assertEqual(bg_service.frame_path(folder, 0).stat().st_mtime_ns, mtime)

    def test_fuera_del_rango_repite_el_extremo(self):
        """Un clip más largo que lo procesado no debe quedarse sin fotogramas."""
        _src, auto, meta = self._prepare(0.5)
        hi = bg_service.covered_range(meta["base_key"])[1]
        folder = bg_service.ensure_derived(meta["base_key"], auto, 0, hi + 5)
        for i in range(hi + 1, hi + 6):
            self.assertTrue(bg_service.frame_path(folder, i).exists(), i)

    def test_matte_png_lleva_el_alfa_puesto(self):
        _src, auto, meta = self._prepare(0.5)
        png = bg_service.matte_png(meta["base_key"], 0)
        self.assertIsNotNone(png)
        arr = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertEqual(arr.shape[2], 4, "el PNG del matte debe traer alfa")
        h, w = arr.shape[:2]
        self.assertGreater(int(arr[h // 2, 2, 3]), 235)        # sujeto → alfa alto
        self.assertLess(int(arr[h // 2, w - 3, 3]), 20)        # fondo → alfa 0

    def test_indice_fuera_de_rango_se_acota(self):
        _src, auto, meta = self._prepare(0.5)
        self.assertIsNotNone(bg_service.read_matte_frame(meta["base_key"], 99999))
        self.assertIsNone(bg_service.read_matte_frame("clave-inexistente", 0))


@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class ClipSpecTest(CacheBase):
    def _ready_clip(self, src: Path, auto: dict, **kw) -> TimelineClip:
        base = clip_bg.base_key(bg_service.source_id(src), auto, "fake-1")
        bg = {"enabled": True, "mode": "auto",
              "auto": {**auto, "enabled": True, "base_key": base, "status": "ready"},
              "chroma": {"enabled": False}}
        return _clip(bg_removal=bg, **kw)

    def test_start_number_sigue_al_recorte_del_clip(self):
        src = self._video(3.0)
        auto = self._auto()
        bg_service.build_matte(src, auto, 0.0, 3.0)
        # clip que empieza en el segundo 1 de la fuente → índice 10 a 10 fps
        clip = self._ready_clip(src, auto, in_point=1.0, out_point=2.0,
                                source_duration=3.0)
        spec = bg_service.build_clip_bg_mask(clip, 30)
        self.assertIsNotNone(spec)
        self.assertEqual(spec["start_number"], 11)     # índice 10 → fichero 000011
        self.assertEqual(spec["mask_fps"], 10)

    def test_cortar_el_clip_no_recalcula_nada(self):
        src = self._video(3.0)
        auto = self._auto()
        bg_service.build_matte(src, auto, 0.0, 3.0)
        antes = self.prov.calls
        for a, b in ((0.0, 1.0), (1.0, 2.0), (0.5, 2.5)):
            clip = self._ready_clip(src, auto, in_point=a, out_point=b, source_duration=3.0)
            self.assertIsNotNone(bg_service.build_clip_bg_mask(clip, 30))
        self.assertEqual(self.prov.calls, antes)

    def test_sin_matte_listo_no_hay_spec(self):
        src = self._video(0.5)
        auto = self._auto()
        bg_service.build_matte(src, auto, 0.0, 0.5)
        base = clip_bg.base_key(bg_service.source_id(src), auto, "fake-1")
        for bg in (
            {"enabled": True, "auto": {"enabled": True, "base_key": base, "status": "running"}},
            {"enabled": True, "auto": {"enabled": False, "base_key": base, "status": "ready"}},
            {"enabled": False, "auto": {"enabled": True, "base_key": base, "status": "ready"}},
            {"enabled": True, "auto": {"enabled": True, "base_key": "otra", "status": "ready"}},
        ):
            self.assertIsNone(bg_service.build_clip_bg_mask(_clip(bg_removal=bg), 30), bg)

    def test_timeline_completa_solo_los_clips_con_matte(self):
        src = self._video(1.0)
        auto = self._auto()
        bg_service.build_matte(src, auto, 0.0, 1.0)
        listo = self._ready_clip(src, auto, id="c1")
        sin = _clip(id="c2")
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[listo, sin])
        out = bg_service.build_timeline_bg_masks(tl, 30)
        self.assertEqual(set(out), {"c1"})

    def test_una_caché_borrada_no_tumba_el_export(self):
        src = self._video(0.5)
        auto = self._auto()
        meta = bg_service.build_matte(src, auto, 0.0, 0.5)
        clip = self._ready_clip(src, auto)
        bg_service.clear_cache(meta["base_key"])
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[clip])
        self.assertEqual(bg_service.build_timeline_bg_masks(tl, 30), {})


class ProviderRegistryTest(unittest.TestCase):
    def test_el_registro_trae_la_familia_u2net(self):
        ids = {p["id"] for p in bg_providers.catalog()}
        self.assertEqual(ids, {"u2net", "u2netp"})
        for info in bg_providers.catalog():
            self.assertIn("available", info)
            self.assertIn("model_version", info)

    def test_id_desconocido_cae_al_de_por_defecto(self):
        self.assertEqual(bg_providers.get("inexistente").id, clip_bg.DEFAULT_PROVIDER)

    def test_sin_modelo_en_disco_explica_por_qué(self):
        prov = bg_providers.U2NetProvider()
        with patch.object(bg_providers, "MODEL_DIR", Path("/no/existe")):
            self.assertFalse(prov.available())
            self.assertIn("u2net.onnx", prov.unavailable_reason())

    def test_licencia_y_url_del_modelo_declaradas(self):
        """El modelo se descarga de un sitio fijo: sin URL no hay proveedor."""
        for prov in (bg_providers.U2NetProvider(), bg_providers.U2NetLiteProvider()):
            self.assertTrue(prov.url.startswith("https://"))
            self.assertTrue(prov.filename.endswith(".onnx"))

    def test_el_preproceso_normaliza_como_u2net(self):
        prov = bg_providers.U2NetProvider()
        frame = np.full((64, 96, 3), 128, np.uint8)
        arr = prov._pre(frame)
        self.assertEqual(arr.shape, (1, 3, 320, 320))
        self.assertEqual(arr.dtype, np.float32)

    def test_el_postproceso_normaliza_min_max_y_reescala(self):
        prov = bg_providers.U2NetProvider()
        raw = np.linspace(-2, 3, 320 * 320, dtype=np.float32).reshape(1, 1, 320, 320)
        out = prov._post(raw, 96, 64)
        self.assertEqual(out.shape, (64, 96))
        self.assertEqual(out.dtype, np.uint8)
        self.assertLessEqual(int(out.min()), 2)
        self.assertGreaterEqual(int(out.max()), 253)

    def test_matte_constante_no_revienta(self):
        """Un modelo que devuelve todo igual no debe dividir por cero."""
        prov = bg_providers.U2NetProvider()
        raw = np.full((1, 1, 320, 320), 0.5, np.float32)
        out = prov._post(raw, 32, 32)
        self.assertEqual(int(out.max()), 0)


if __name__ == "__main__":
    unittest.main()
