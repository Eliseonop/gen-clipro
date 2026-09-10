"""Eliminar fondo de punta a punta con el MODELO REAL.

Vídeo → ONNX → matte en caché → derivado → export con FFmpeg → píxeles.

Se salta si ``backend/models/u2netp.onnx`` no está en disco (el modelo se
descarga la primera vez que se usa la función, no al correr los tests), así que
la suite sigue verde en una máquina limpia y sin red.
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
from app.compose import _filter_script_cmd, build_command
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack

MODEL = bg_providers.MODEL_DIR / "u2netp.onnx"
W, H = 192, 256


def _subject_video(path: Path, seconds: float = 1.0, fps: int = 10) -> Path:
    """Vídeo sintético: un óvalo claro (el "sujeto") sobre fondo oscuro."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    vw = cv2.VideoWriter(str(path), fourcc, fps, (W, H))
    n = max(1, int(seconds * fps))
    for i in range(n):
        frame = np.full((H, W, 3), 24, np.uint8)
        cx = int(W * 0.5 + (i - n / 2) * 1.5)
        cv2.ellipse(frame, (cx, H // 2), (44, 80), 0, 0, 360, (235, 220, 205), -1)
        vw.write(frame)
    vw.release()
    return path


@unittest.skipUnless(MODEL.exists(), f"requiere el modelo {MODEL.name} en disco")
@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class EndToEndTest(unittest.TestCase):
    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-bge2e-"))
        self._patches = [
            patch.object(bg_service, "CACHE_ROOT", self.td / "bgcache"),
            patch.object(bg_service, "MATTE_ROOT", self.td / "bgcache" / "matte"),
            patch.object(bg_service, "MASK_ROOT", self.td / "bgcache" / "mask"),
            patch.object(bg_providers, "_device_setting", return_value="cpu"),
        ]
        for p in self._patches:
            p.start()
        self.src = _subject_video(self.td / "subject.mp4")

    def tearDown(self):
        for p in self._patches:
            p.stop()
        bg_providers.get("u2netp").close()
        shutil.rmtree(self.td, ignore_errors=True)

    def _auto(self, **kw) -> dict:
        return clip_bg.normalize_auto(
            {"provider": "u2netp", "mask_fps": 10, "mask_height": 256, **kw})

    def test_el_modelo_separa_sujeto_y_fondo(self):
        auto = self._auto()
        meta = bg_service.build_matte(self.src, auto, 0.0, 1.0)
        self.assertEqual(meta["provider"], "u2netp")
        m = bg_service.read_matte_frame(meta["base_key"], 0)
        self.assertIsNotNone(m)
        h, w = m.shape
        # el sujeto está en el centro; las esquinas son fondo
        self.assertGreater(int(m[h // 2, w // 2]), 200, "el sujeto debería ser opaco")
        self.assertLess(int(m[4, 4]), 60, "la esquina debería ser fondo")
        self.assertLess(int(m[h - 5, w - 5]), 60)

    def test_export_completo_deja_ver_la_pista_inferior(self):
        auto = self._auto()
        meta = bg_service.build_matte(self.src, auto, 0.0, 1.0)
        base = meta["base_key"]

        # V1 = fondo rojo liso; V2 = el vídeo del sujeto con el fondo eliminado
        red = self.td / "red.png"
        cv2.imwrite(str(red), np.full((H, W, 3), (0, 0, 255), np.uint8))

        def clip(cid, tid, kind, fn, **kw):
            data = dict(
                id=cid, track_id=tid, kind=kind,
                asset_kind="images" if kind == "image" else "clips",
                asset_id="1", filename=fn, start=0.0, in_point=0.0, out_point=1.0,
                source_duration=1.0, layout="fill")
            data.update(kw)
            return TimelineClip(**data)

        subject = clip("c2", "V2", "video", "subject.mp4", bg_removal={
            "enabled": True, "mode": "auto",
            "auto": {**auto, "enabled": True, "base_key": base, "status": "ready"},
            "chroma": {"enabled": False},
        })
        tl = Timeline(
            width=W, height=H, fps=10,
            tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                    TimelineTrack(id="V2", kind="video", name="V2")],
            clips=[clip("c1", "V1", "image", "red.png"), subject])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")

        bg_files = bg_service.build_timeline_bg_masks(tl, 10)
        self.assertIn("c2", bg_files, "el matte del clip debería estar preparado")
        paths = {"c1": red, "c2": self.src}
        out = self.td / "out.mp4"
        with patch("app.compose._clip_path",
                   side_effect=lambda project, c, shape_files=None: paths[c.id]):
            cmd = build_command(proj, tl, out, bg_files=bg_files)
        res = subprocess.run(_filter_script_cmd(cmd, self.td), capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stderr[-2500:])

        png = self.td / "frame.png"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "0.3", "-i", str(out),
                        "-frames:v", "1", str(png)], check=True, capture_output=True)
        img = cv2.imread(str(png))
        centro = img[H // 2, W // 2]      # BGR
        esquina = img[6, 6]
        # centro = el sujeto (claro, poco saturado de rojo puro)
        self.assertGreater(int(centro[0]), 120, "el sujeto no se ve en el centro")
        self.assertGreater(int(centro[1]), 120)
        # esquina = el rojo de V1 asomando por donde se quitó el fondo
        self.assertGreater(int(esquina[2]), 180, "la pista inferior no asoma")
        self.assertLess(int(esquina[0]), 70)
        self.assertLess(int(esquina[1]), 70)

    def test_el_pincel_de_corrección_cambia_el_derivado(self):
        auto = self._auto()
        meta = bg_service.build_matte(self.src, auto, 0.0, 0.4)
        base = meta["base_key"]
        # borrar el centro (donde está el sujeto) con un trazo grande
        con_pincel = self._auto(edits=[{"op": "erase", "size": 0.6,
                                        "points": [{"x": 0.5, "y": 0.5}]}])
        f0 = bg_service.ensure_derived(base, auto, 0, 0)
        f1 = bg_service.ensure_derived(base, con_pincel, 0, 0)
        self.assertNotEqual(f0, f1, "el pincel debe cambiar la clave derivada")
        a = cv2.imread(str(bg_service.frame_path(f0, 0)), cv2.IMREAD_GRAYSCALE)
        b = cv2.imread(str(bg_service.frame_path(f1, 0)), cv2.IMREAD_GRAYSCALE)
        h, w = a.shape
        self.assertGreater(int(a[h // 2, w // 2]), 200)
        self.assertLess(int(b[h // 2, w // 2]), 20, "el trazo no borró el centro")

    def test_reabrir_el_proyecto_no_vuelve_a_ejecutar_el_modelo(self):
        """La condición que pedía el diseño: misma config → cero inferencias."""
        auto = self._auto()
        meta = bg_service.build_matte(self.src, auto, 0.0, 1.0)
        prov = bg_providers.get("u2netp")
        with patch.object(prov, "matte",
                          side_effect=AssertionError("no debería inferir nada")):
            again = bg_service.build_matte(self.src, auto, 0.0, 1.0)
        self.assertEqual(again["base_key"], meta["base_key"])
        self.assertEqual(again["range"], meta["range"])


if __name__ == "__main__":
    unittest.main()
