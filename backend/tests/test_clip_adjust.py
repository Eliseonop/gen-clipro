"""Máscaras estilo CapCut: rollo de película, máscara de ajuste, ajustes de color
y máscara en textos (export)."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import clip_adjust as adj
from app.clip_fx import effects_ffmpeg
from app.clip_mask import clip_masks_at, has_adjust_mask, has_mask, mask_alpha, normalize_mask
from app.compose import build_command
from app.schemas import Project, Timeline, TimelineClip, TimelineTrack

_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def _clip(**kw) -> TimelineClip:
    data = dict(id="c1", track_id="V1", kind="video", asset_kind="clips", asset_id="1",
                filename="a.mp4", start=0.0, in_point=0.0, out_point=4.0,
                source_duration=4.0, layout="overlay", frame="free")
    data.update(kw)
    return TimelineClip(**data)


class FilmMaskTest(unittest.TestCase):
    def test_banda_horizontal(self):
        m = normalize_mask({"type": "film", "x": 0.5, "y": 0.5, "w": 1, "h": 0.2})
        a = mask_alpha(m, 100, 200)       # alto 200 → banda de 40 px centrada
        self.assertGreater(a[100, 50], 0.99)
        self.assertGreater(a[100, 0], 0.99)          # infinita en horizontal
        self.assertLess(a[20, 50], 0.01)
        self.assertLess(a[180, 50], 0.01)

    def test_girada_90_es_vertical(self):
        m = normalize_mask({"type": "film", "x": 0.5, "y": 0.5, "h": 0.1, "rotation": 90})
        a = mask_alpha(m, 200, 200)
        self.assertGreater(a[5, 100], 0.99)
        self.assertLess(a[100, 5], 0.01)


class AdjustTargetTest(unittest.TestCase):
    def test_target_por_defecto_y_valido(self):
        self.assertEqual(normalize_mask({})["target"], "clip")
        self.assertEqual(normalize_mask({"target": "adjust"})["target"], "adjust")
        self.assertEqual(normalize_mask({"target": "raro"})["target"], "clip")

    def test_las_de_ajuste_no_recortan_pero_animan(self):
        c = _clip(masks=[{"type": "circle", "target": "adjust", "x": 0.2}],
                  keyframes={"enabled": True, "items": [{"id": "k", "t": 0, "props": {"mx": 0.7}}]})
        self.assertFalse(has_mask(c))
        self.assertTrue(has_adjust_mask(c))
        self.assertEqual(clip_masks_at(c, 0), [])
        got = clip_masks_at(c, 0, include_adjust=True)
        self.assertAlmostEqual(got[0]["x"], 0.7)     # el keyframe cae en la de ajuste


class ColorMatrixTest(unittest.TestCase):
    def test_sin_ajustes(self):
        self.assertIsNone(adj.color_matrix({}))
        self.assertEqual(adj.colorchannelmixer({"brightness": 0.2}), "")

    def test_exposicion_un_paso_duplica(self):
        m = adj.color_matrix({"exposure": 1})
        for r in range(3):
            for c in range(3):
                self.assertAlmostEqual(m[r][c], 2.0 if r == c else 0.0, places=6)

    def test_temperatura_y_tono(self):
        m = adj.color_matrix({"temperature": 1})
        self.assertAlmostEqual(m[0][0], 1.18, places=6)
        self.assertAlmostEqual(m[2][2], 0.82, places=6)
        h = adj.color_matrix({"hue": 180})
        self.assertAlmostEqual(h[0][0], 0.213 - 0.787, places=6)
        self.assertEqual(adj.adjust_value({"hue": 999}, "hue"), 180.0)   # acotado

    def test_export_usa_colorchannelmixer_al_final(self):
        chain = effects_ffmpeg(_clip(effects={"contrast": 0.2, "exposure": 0.5}), 720, 1280)
        self.assertTrue(chain.endswith(adj.colorchannelmixer({"exposure": 0.5})))
        self.assertIn("eq=contrast=1.200", chain)


class AdjustPassesTest(unittest.TestCase):
    def _tl(self, **kw):
        return Timeline(width=720, height=1280, fps=30,
                        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                        clips=[_clip(**kw), _clip(id="c2", start=4.0)])

    def test_expande_base_y_fantasma(self):
        tl = self._tl(effects={"exposure": 0.6, "blur": 2},
                      masks=[{"type": "circle", "target": "adjust"}, {"type": "rectangle"}])
        out = adj.expand_adjust_passes(tl)
        self.assertEqual([c.id for c in out.clips], ["c1", "c1__adj", "c2"])
        base, ghost = out.clips[0], out.clips[1]
        self.assertEqual(base.effects, {"blur": 2})               # sin ajustes de color
        self.assertEqual(ghost.effects["exposure"], 0.6)
        self.assertEqual([m["target"] for m in ghost.masks], ["clip", "clip"])
        self.assertTrue(ghost.muted)
        self.assertEqual(len(clip_masks_at(base, 0)), 1)          # solo el rectángulo
        self.assertEqual(len(clip_masks_at(ghost, 0)), 2)         # rectángulo ∩ ajuste
        self.assertEqual(len(tl.clips), 2)                        # la entrada no se toca

    def test_sin_ajuste_de_color_no_expande(self):
        tl = self._tl(masks=[{"type": "circle", "target": "adjust"}])
        self.assertEqual(len(adj.expand_adjust_passes(tl).clips), 2)
        plain = self._tl()
        self.assertIs(adj.expand_adjust_passes(plain), plain)


class TextMaskExportTest(unittest.TestCase):
    def test_texto_enmascarado_va_en_su_capa(self):
        tmp = Path(tempfile.mkdtemp())
        img = tmp / "a.png"
        img.write_bytes(_PNG)
        text = TimelineClip(id="t1", track_id="T1", kind="text", asset_kind="text", asset_id="t",
                            filename="", start=0.0, in_point=0.0, out_point=3.0,
                            source_duration=3.0, text="HOLA",
                            masks=[{"type": "linear", "x": 0.5, "y": 0.5}])
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                              TimelineTrack(id="T1", kind="text", name="T1")],
                      clips=[_clip(kind="image", asset_kind="images", filename="a.png", layout="fill"), text])
        mask_png = tmp / "t1.png"
        mask_png.write_bytes(_PNG)
        layer = tmp / "out.mt0.ass"
        layer.write_text("", encoding="utf-8")
        proj = Project(id="p", name="p", created_at="2026-01-01T00:00:00")
        with patch("app.detect.dims", return_value=(1080, 1920)), \
             patch("app.compose._clip_path", return_value=img):
            cmd = build_command(proj, tl, tmp / "out.mp4",
                                mask_files={"t1": {"path": str(mask_png), "animated": False, "duration": 3.0}},
                                text_layers={"t1": layer})
        graph = cmd[cmd.index("-filter_complex") + 1]
        self.assertIn(":alpha=1", graph)
        self.assertIn("alphamerge[tkl0]", graph)
        self.assertIn("blend=all_mode=multiply", graph)
        self.assertIn(str(mask_png), cmd)


if __name__ == "__main__":
    unittest.main()
