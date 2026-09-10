"""Eliminar fondo en el export: filtergraph y composición real con FFmpeg.

Lo que se fija aquí:
  * El alfa se aplica en el espacio del MATERIAL (antes del recorte), igual que
    el preview, que sustituye el elemento fuente por un recorte con alfa.
  * ``chromakey`` y ``alphamerge`` SOBREESCRIBEN el alfa: los dos alfas se
    multiplican a mano y entran una sola vez.
  * Sin eliminación de fondo el filtergraph NO cambia (cero regresión).
  * Y sobre todo: FFmpeg de verdad compone lo que se espera (el test e2e).
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

from app.compose import _filter_script_cmd, build_command
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


def _ready(**kw) -> dict:
    """``bg_removal`` con matte automático listo."""
    auto = {"enabled": True, "base_key": "abc", "status": "ready",
            "mask_fps": 15, "mask_height": 256}
    auto.update(kw.pop("auto", {}))
    chroma = {"enabled": False}
    chroma.update(kw.pop("chroma", {}))
    return {"enabled": True, "mode": "auto", "auto": auto, "chroma": chroma}


def _spec(start_number: int = 1, mask_fps: int = 15) -> dict:
    return {"path": "/tmp/m/%06d.png", "start_number": start_number,
            "mask_fps": mask_fps, "frames": 60, "duration": 4.0,
            "width": 192, "height": 256}


def _graph(clip, bg_files=None, width=720, height=1280, src=(1080, 1920), extra=()):
    tmp = Path(tempfile.mkdtemp())
    img = tmp / "a.png"
    img.write_bytes(_PNG)
    tl = Timeline(
        width=width, height=height, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[clip, *extra],
    )
    proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
    with patch("app.detect.dims", return_value=src), \
         patch("app.compose._clip_path", return_value=img):
        cmd = build_command(proj, tl, tmp / "out.mp4", bg_files=bg_files)
    return cmd, cmd[cmd.index("-filter_complex") + 1]


class NoRegressionTest(unittest.TestCase):
    def test_sin_bg_removal_el_filtergraph_no_cambia(self):
        base = _graph(_clip())[1]
        con_param = _graph(_clip(), bg_files={})[1]
        self.assertEqual(base, con_param)
        for token in ("alphamerge", "chromakey", "bgcut", "bgm0", "alphaextract"):
            self.assertNotIn(token, base, token)

    def test_bg_pedido_pero_sin_matte_no_toca_el_filtergraph(self):
        """Mientras el job no acaba, el clip se ve y exporta como siempre."""
        clip = _clip(bg_removal=_ready(auto={"status": "running", "base_key": ""}))
        self.assertEqual(_graph(clip)[1], _graph(_clip())[1])

    def test_desactivar_bg_vuelve_al_filtergraph_de_siempre(self):
        clip = _clip(bg_removal={**_ready(), "enabled": False})
        self.assertEqual(_graph(clip, bg_files={"c1": _spec()})[1], _graph(_clip())[1])

    def test_matte_en_caché_pero_clip_de_tipo_no_apto(self):
        clip = _clip(kind="shape", asset_kind="shape",
                     shape={"type": "rect"}, bg_removal=_ready())
        graph = _graph(clip, bg_files={"c1": _spec()})[1]
        self.assertNotIn("alphamerge", graph)


class FilterGraphTest(unittest.TestCase):
    def test_matte_entra_por_alphamerge_antes_del_recorte(self):
        cmd, graph = _graph(_clip(bg_removal=_ready()), bg_files={"c1": _spec()})
        self.assertIn("alphamerge", graph)
        # el alfa se aplica ANTES del crop/scale del clip
        cut = graph.index("alphamerge")
        crop = graph.index("crop=") if "crop=" in graph else graph.index("scale=720")
        self.assertLess(cut, crop, "el matte debe aplicarse antes del recorte")
        # y el stream del matte se escala al tamaño del MATERIAL, no al de salida
        self.assertIn("scale=1080:1920", graph)

    def test_start_number_alinea_el_matte_con_el_recorte_del_clip(self):
        """Cortar el clip solo mueve el número de arranque: nada que regenerar."""
        cmd, _ = _graph(_clip(bg_removal=_ready()), bg_files={"c1": _spec(start_number=91)})
        i = cmd.index("-start_number")
        self.assertEqual(cmd[i + 1], "91")
        self.assertEqual(cmd[i - 2], "-framerate")
        self.assertEqual(cmd[i + 2], "-i")
        self.assertEqual(cmd[i + 3], "/tmp/m/%06d.png")

    def test_solo_croma_no_necesita_streams_extra(self):
        clip = _clip(bg_removal=_ready(
            auto={"enabled": False, "base_key": "", "status": "idle"},
            chroma={"enabled": True, "color": "#00FF00"}))
        cmd, graph = _graph(clip)
        self.assertIn("chromakey=color=0x00FF00", graph)
        self.assertIn("format=yuva444p", graph)
        self.assertNotIn("alphamerge", graph)
        self.assertNotIn("-start_number", cmd)

    def test_croma_y_matte_juntos_multiplican_los_alfas(self):
        """chromakey y alphamerge sobreescriben el alfa: hay que multiplicar."""
        clip = _clip(bg_removal=_ready(chroma={"enabled": True}))
        _cmd, graph = _graph(clip, bg_files={"c1": _spec()})
        self.assertIn("alphaextract", graph)
        self.assertIn("blend=all_mode=multiply", graph)
        self.assertIn("alphamerge", graph)
        self.assertLess(graph.index("alphaextract"), graph.index("alphamerge"))

    def test_el_alfa_sobrevive_al_recorte_y_al_overlay(self):
        _cmd, graph = _graph(_clip(bg_removal=_ready()), bg_files={"c1": _spec()})
        self.assertIn("format=gbrap", graph)
        self.assertIn("format=auto", graph)   # overlay debe elegir formato con alfa

    def test_velocidad_y_reverse_se_heredan_sin_duplicar_filtros(self):
        """El alfa va antes: la velocidad la aplica la cadena de siempre, una vez."""
        clip = _clip(kind="video", asset_kind="clips", filename="a.mp4",
                     speed=2.0, reverse=True, bg_removal=_ready())
        _cmd, graph = _graph(clip, bg_files={"c1": _spec()})
        self.assertEqual(graph.count("setpts=PTS/2.000000"), 1)
        self.assertEqual(graph.count("reverse"), 1)
        self.assertLess(graph.index("alphamerge"), graph.index("reverse"))

    def test_convive_con_la_máscara_de_composición(self):
        """Son dos etapas: matte en espacio fuente, máscara en espacio salida."""
        clip = _clip(bg_removal=_ready(),
                     masks=[{"id": "m0", "type": "circle", "enabled": True}])
        mask_files = {"c1": {"path": "/tmp/k.png", "animated": False, "duration": 4.0}}
        _cmd, graph = _graph(clip, bg_files={"c1": _spec()})
        self.assertIn("alphamerge", graph)
        cmd2, graph2 = _graph(clip, bg_files={"c1": _spec()})
        self.assertIn("alphamerge", graph2)
        # con las dos activas, la máscara sigue componiendo por maskedmerge
        with patch("app.detect.dims", return_value=(1080, 1920)):
            tmp = Path(tempfile.mkdtemp())
            img = tmp / "a.png"
            img.write_bytes(_PNG)
            tl = Timeline(width=720, height=1280, fps=30,
                          tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                          clips=[clip])
            proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
            with patch("app.compose._clip_path", return_value=img):
                cmd3 = build_command(proj, tl, tmp / "o.mp4",
                                     mask_files=mask_files, bg_files={"c1": _spec()})
        g3 = cmd3[cmd3.index("-filter_complex") + 1]
        self.assertIn("maskedmerge", g3)
        self.assertIn("alphamerge", g3)
        self.assertLess(g3.index("alphamerge"), g3.index("maskedmerge"))

    def test_indices_de_input_no_pisan_los_de_la_máscara(self):
        clip_a = _clip(id="c1", bg_removal=_ready(),
                       masks=[{"id": "m0", "type": "circle", "enabled": True}])
        mask_files = {"c1": {"path": "/tmp/k.png", "animated": False, "duration": 4.0}}
        tmp = Path(tempfile.mkdtemp())
        img = tmp / "a.png"
        img.write_bytes(_PNG)
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                      clips=[clip_a])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        with patch("app.detect.dims", return_value=(1080, 1920)), \
             patch("app.compose._clip_path", return_value=img):
            cmd = build_command(proj, tl, tmp / "o.mp4", mask_files=mask_files,
                                bg_files={"c1": _spec()})
        graph = cmd[cmd.index("-filter_complex") + 1]
        # material=0, máscara=1, matte=2 → cada stream se usa una sola vez
        self.assertIn("[1:v]", graph)
        self.assertIn("[2:v]", graph)
        self.assertEqual(len([a for a in cmd if a == "-i"]), 3)


@unittest.skipUnless(shutil.which("ffmpeg"), "requiere ffmpeg en el PATH")
class RealCompositionTest(unittest.TestCase):
    """Export de verdad: el matte y el croma deben dejar ver la pista inferior."""

    W, H = 240, 320

    def setUp(self):
        self.td = Path(tempfile.mkdtemp(prefix="vy-bge2e-"))
        W, H = self.W, self.H
        # V1 = fondo rojo; V2 = croma verde con un cuadrado azul en el centro
        cv2.imwrite(str(self.td / "red.png"), np.full((H, W, 3), (0, 0, 255), np.uint8))
        green = np.full((H, W, 3), (0, 255, 0), np.uint8)
        green[H // 4:3 * H // 4, W // 4:3 * W // 4] = (255, 0, 0)
        cv2.imwrite(str(self.td / "green.png"), green)
        # matte a MEDIA resolución (como la caché real): blanco solo en la mitad izq
        self.seq = self.td / "matte"
        self.seq.mkdir()
        m = np.zeros((H // 2, W // 2), np.uint8)
        m[:, :W // 4] = 255
        cv2.imwrite(str(self.seq / "000001.png"), m)

    def tearDown(self):
        shutil.rmtree(self.td, ignore_errors=True)

    def _render(self, bg_removal, with_matte=True):
        W, H = self.W, self.H

        def clip(cid, tid, fn, **kw):
            d = dict(id=cid, track_id=tid, kind="image", asset_kind="images",
                     asset_id="1", filename=fn, start=0.0, in_point=0.0,
                     out_point=1.0, source_duration=1.0, layout="fill")
            d.update(kw)
            return TimelineClip(**d)

        tl = Timeline(
            width=W, height=H, fps=15,
            tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                    TimelineTrack(id="V2", kind="video", name="V2")],
            clips=[clip("c1", "V1", "red.png"),
                   clip("c2", "V2", "green.png", bg_removal=bg_removal)])
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        paths = {"c1": self.td / "red.png", "c2": self.td / "green.png"}
        bg_files = {"c2": {"path": str(self.seq / "%06d.png"), "start_number": 1,
                           "mask_fps": 15, "frames": 1, "duration": 1.0,
                           "width": W // 2, "height": H // 2}} if with_matte else {}
        with patch("app.compose._clip_path",
                   side_effect=lambda project, c, shape_files=None: paths[c.id]):
            cmd = build_command(proj, tl, self.td / "out.mp4", bg_files=bg_files)
        res = subprocess.run(_filter_script_cmd(cmd, self.td),
                             capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stderr[-2000:])
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(self.td / "out.mp4"),
                        "-frames:v", "1", str(self.td / "f.png")],
                       check=True, capture_output=True)
        return cv2.imread(str(self.td / "f.png"))

    def _rgb(self, img, x, y):
        b, g, r = img[y, x]
        return int(r), int(g), int(b)

    def _cerca(self, got, want, msg="", delta=6):
        for a, b in zip(got, want):
            self.assertLessEqual(abs(a - b), delta, f"{msg}: {got} != {want}")

    def test_matte_deja_ver_la_pista_inferior(self):
        bg = {"enabled": True, "mode": "auto",
              "auto": {"enabled": True, "base_key": "k", "status": "ready",
                       "mask_fps": 15, "mask_height": self.H // 2,
                       "threshold": 0.5, "softness": 0.0},
              "chroma": {"enabled": False}}
        img = self._render(bg)
        W, H = self.W, self.H
        # mitad izquierda (matte=1): se ve V2 (azul en el centro, verde arriba)
        self._cerca(self._rgb(img, W // 2 - 40, H // 2), (0, 0, 255), "azul visible")
        self._cerca(self._rgb(img, 10, 10), (0, 255, 0), "verde visible (sin croma)")
        # mitad derecha (matte=0): se ve V1
        self._cerca(self._rgb(img, W // 2 + 40, H // 2), (255, 0, 0), "rojo de V1")
        self._cerca(self._rgb(img, W - 10, 10), (255, 0, 0), "rojo de V1")

    def test_croma_y_matte_juntos(self):
        bg = {"enabled": True, "mode": "auto",
              "auto": {"enabled": True, "base_key": "k", "status": "ready",
                       "mask_fps": 15, "mask_height": self.H // 2,
                       "threshold": 0.5, "softness": 0.0},
              "chroma": {"enabled": True, "color": "#00FF00",
                         "similarity": 0.20, "blend": 0.02, "spill": 0.0}}
        img = self._render(bg)
        W, H = self.W, self.H
        self._cerca(self._rgb(img, W // 2 - 40, H // 2), (0, 0, 255), "azul: matte 1 + no croma")
        self._cerca(self._rgb(img, W // 2 + 40, H // 2), (255, 0, 0), "matte 0 → V1")
        self._cerca(self._rgb(img, 10, 10), (255, 0, 0), "verde recortado por croma → V1")
        self._cerca(self._rgb(img, W - 10, 10), (255, 0, 0), "matte 0 y croma → V1")

    def test_solo_croma_sin_matte(self):
        bg = {"enabled": True, "mode": "chroma",
              "auto": {"enabled": False},
              "chroma": {"enabled": True, "color": "#00FF00",
                         "similarity": 0.20, "blend": 0.02, "spill": 0.0}}
        img = self._render(bg, with_matte=False)
        W, H = self.W, self.H
        # el cuadrado azul se ve entero (a los dos lados) y el verde desaparece
        self._cerca(self._rgb(img, W // 2 - 40, H // 2), (0, 0, 255), "azul izq")
        self._cerca(self._rgb(img, W // 2 + 40, H // 2), (0, 0, 255), "azul der")
        self._cerca(self._rgb(img, 10, 10), (255, 0, 0), "verde → V1")
        self._cerca(self._rgb(img, W - 10, 10), (255, 0, 0), "verde → V1")

    def test_invertir_el_matte_intercambia_las_mitades(self):
        bg = {"enabled": True, "mode": "auto",
              "auto": {"enabled": True, "base_key": "k", "status": "ready",
                       "mask_fps": 15, "mask_height": self.H // 2,
                       "threshold": 0.5, "softness": 0.0, "invert": True},
              "chroma": {"enabled": False}}
        # invert vive en la derivación (nivel 2 de la caché), así que aquí se
        # simula invirtiendo el PNG ya derivado, que es lo que ve el export.
        m = cv2.imread(str(self.seq / "000001.png"), cv2.IMREAD_GRAYSCALE)
        cv2.imwrite(str(self.seq / "000001.png"), 255 - m)
        img = self._render(bg)
        W, H = self.W, self.H
        self._cerca(self._rgb(img, W // 2 - 40, H // 2), (255, 0, 0), "izq ahora es V1")
        self._cerca(self._rgb(img, W // 2 + 40, H // 2), (0, 0, 255), "der ahora es azul")


if __name__ == "__main__":
    unittest.main()
