"""Horneado de efectos de vídeo (fx_bake): pila, margen, caché y Chromium real."""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app import fx_bake, fx_catalog
from app.schemas import Keyframe, Project, Reframe, Timeline, TimelineClip, TimelineTrack


def _clip(**kw):
    data = dict(id="c1", track_id="V1", kind="image", asset_kind="images", asset_id="1",
                filename="a.png", start=0.0, in_point=0.0, out_point=1.0, source_duration=1.0,
                layout="overlay", transform={"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0},
                reframe=Reframe(crop_w=1.0, crop_h=1.0))
    data.update(kw)
    return TimelineClip(**data)


def _playwright_ok() -> bool:
    try:
        import playwright  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return fx_catalog.RUNTIME_PATH.exists() and bool(shutil.which("ffmpeg"))


class StackTest(unittest.TestCase):
    def test_pila_normalizada(self):
        c = _clip(vfx=[
            {"uid": "a", "effect": "glitch_rgb", "params": {"amount": 9}},
            {"uid": "b", "effect": "no_existe"},
            {"uid": "c", "effect": "vhs", "enabled": False},
            {"uid": "d", "effect": "shake", "from": 0.5, "to": 0.2},
        ])
        e = fx_bake.active_vfx(c)
        self.assertEqual([x["effect"] for x in e], ["glitch_rgb", "shake"])
        self.assertEqual(e[0]["params"]["amount"], 1.0)
        self.assertEqual(e[1]["to"], 0.5)              # to nunca antes de from
        self.assertTrue(fx_bake.has_vfx(c))
        self.assertFalse(fx_bake.has_vfx(_clip(kind="text", vfx=[{"effect": "vhs"}])))

    def test_margen_solo_en_objeto_libre_sin_recorte(self):
        self.assertTrue(fx_bake.pad_allowed(_clip(), 400, 300, 720, 1280))
        self.assertFalse(fx_bake.pad_allowed(_clip(reframe=Reframe(crop_w=0.5, crop_h=1.0)), 400, 300, 720, 1280))
        self.assertFalse(fx_bake.pad_allowed(_clip(layout="fill"), 400, 300, 720, 1280))

    def test_clave_cambia_con_los_parametros(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "a.png"
            p.write_bytes(b"x")
            e1 = fx_bake.active_vfx(_clip(vfx=[{"effect": "vhs", "params": {"amount": 0.3}}]))
            e2 = fx_bake.active_vfx(_clip(vfx=[{"effect": "vhs", "params": {"amount": 0.4}}]))
            k1 = fx_bake.bake_key(_clip(), p, 30, e1, False)
            self.assertEqual(k1, fx_bake.bake_key(_clip(), p, 30, e1, False))
            self.assertNotEqual(k1, fx_bake.bake_key(_clip(), p, 30, e2, False))
            self.assertNotEqual(k1, fx_bake.bake_key(_clip(), p, 24, e1, False))

    def test_copia_horneada(self):
        c = _clip(kind="video", asset_kind="clips", filename="v.mp4", in_point=2.0, out_point=6.0,
                  speed=2.0, reframe=Reframe(keyframes=[Keyframe(t=2.0, cx=0.3, cy=0.5, zoom=1.0),
                                                        Keyframe(t=6.0, cx=0.7, cy=0.5, zoom=1.0)]))
        b = fx_bake.baked_clip(c, Path("x/abc.webm"))
        self.assertEqual((b.in_point, b.out_point, b.speed), (0.0, 2.0, 1.0))
        self.assertEqual([k.t for k in b.reframe.keyframes], [0.0, 2.0])   # fuente → local
        self.assertIsNone(b.vfx)
        img = fx_bake.baked_clip(_clip(), Path("x/abc.webm"))
        self.assertEqual((img.kind, img.asset_kind), ("video", "clips"))

    def test_build_command_separa_imagen_y_audio(self):
        from app import compose
        with tempfile.TemporaryDirectory() as td:
            vid = Path(td) / "v.mp4"
            vid.write_bytes(b"x")
            baked = Path(td) / "baked.webm"
            baked.write_bytes(b"x")
            c = _clip(kind="video", asset_kind="clips", filename="v.mp4", vfx=[{"effect": "vhs"}])
            tl = Timeline(width=720, height=1280, fps=30,
                          tracks=[TimelineTrack(id="V1", kind="video", name="V1")], clips=[c])
            proj = Project(id="p", name="p", source_video="x", created_at="2026-01-01T00:00:00")
            with patch.object(compose, "_clip_path", return_value=vid), \
                    patch.object(compose, "_has_audio", return_value=True), \
                    patch("app.detect.dims", return_value=(720, 1280)):
                cmd = compose.build_command(proj, tl, Path(td) / "out.mp4",
                                            fx_baked={"c1": (fx_bake.baked_clip(c, baked), baked)})
            ins = [cmd[i + 1] for i, a in enumerate(cmd) if a == "-i"]
            self.assertIn(str(baked), ins)     # la imagen, del horneado
            self.assertIn(str(vid), ins)       # el audio, del original


@unittest.skipUnless(_playwright_ok(), "sin Playwright/Chromium, ffmpeg o runtime de efectos")
class ChromiumBakeTest(unittest.TestCase):
    """Hornea de verdad en Chromium headless (lento: unos segundos)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="vy-fxtest-"))
        import cv2
        img = np.zeros((240, 160, 4), np.uint8)
        img[60:180, 40:120] = (40, 90, 200, 255)       # sujeto opaco con fondo transparente
        cls.png = cls.tmp / "sujeto.png"
        cv2.imwrite(str(cls.png), img)
        cls.mp4 = cls.tmp / "barra.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                        "testsrc2=size=320x240:rate=30:duration=1", "-pix_fmt", "yuv420p", str(cls.mp4)],
                       check=True)
        cls.cache = patch.object(fx_bake, "CACHE_DIR", cls.tmp / "cache")
        cls.cache.start()

    @classmethod
    def tearDownClass(cls):
        cls.cache.stop()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _frames(self, path: Path, n: int):
        out = subprocess.run(["ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(path),
                              "-frames:v", str(n), "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                             capture_output=True, check=True).stdout
        return out

    def test_papel_con_margen_y_video_con_shader(self):
        from app import compose, detect
        proj = Project(id="p", name="p", source_video="x", created_at="2026-01-01T00:00:00")
        paper = _clip(id="paper", vfx=[{"uid": "p1", "effect": "paper_cutout",
                                        "params": {"jitter": False, "shadow": False}}])
        vid = _clip(id="vid", kind="video", asset_kind="clips", filename="barra.mp4",
                    vfx=[{"uid": "g1", "effect": "glitch_rgb"}])
        tl = Timeline(width=720, height=1280, fps=30,
                      tracks=[TimelineTrack(id="V1", kind="video", name="V1")], clips=[paper, vid])
        paths = {"paper": self.png, "vid": self.mp4}
        with patch.object(compose, "_clip_path", side_effect=lambda _p, c, *_a: paths[c.id]):
            baked = fx_bake.bake_timeline(proj, tl)
            again = fx_bake.bake_timeline(proj, tl)          # segunda vez: caché
        self.assertEqual(set(baked), {"paper", "vid"})
        self.assertEqual(baked["paper"][1], again["paper"][1])

        # Papel: el lienzo crece con el margen (0,2 del lado menor a cada lado) y
        # el borde blanco rasgado queda FUERA de la imagen original.
        pw, ph = detect.dims(baked["paper"][1])
        P = round(0.2 * 160)
        self.assertEqual((pw, ph), (160 + 2 * P, 240 + 2 * P))
        raw = self._frames(baked["paper"][1], 1)
        f0 = np.frombuffer(raw, np.uint8).reshape(ph, pw, 4)
        self.assertEqual(f0[:4, :4, 3].max(), 0)              # esquina: transparente
        cy = P + 120
        row = f0[cy, :, :]
        left_edge = P + 40                                     # borde izquierdo del sujeto
        border = row[left_edge - 8: left_edge - 2]
        self.assertGreater(int(border[:, 3].max()), 200)       # hay papel fuera del sujeto
        paper_px = border[border[:, 3] > 200]
        self.assertGreater(int(paper_px[:, :3].mean()), 180)   # y es claro (blanco con arrugas)

        # Vídeo con shader: mismo tamaño que la fuente y un fotograma por 1/30 s.
        vw, vh = detect.dims(baked["vid"][1])
        self.assertEqual((vw, vh), (320, 240))
        raw = self._frames(baked["vid"][1], 100)
        # 29-30: el export recorta un pelín antes del final del archivo (fotograma
        # negro en EOF, ver clip_kind.ffmpeg_trim_window) y el overlay repite el último.
        self.assertIn(len(raw) // (vw * vh * 4), (29, 30))


@unittest.skipUnless(_playwright_ok(), "sin Playwright/Chromium o runtime de efectos")
class ShaderCatalogTest(unittest.TestCase):
    def test_todos_los_shaders_compilan_y_pintan(self):
        """Cada efecto del catálogo compila y pinta un fotograma sin errores."""
        with fx_bake.FxBaker() as b:
            b._ensure()
            errors = b._page.evaluate("window.__fx.compileAll()")
            self.assertEqual(errors, [], errors)
            ids = [e["id"] for e in fx_catalog.effects() if e["engine"] != "generator"]
            bad = b._page.evaluate("""(ids) => {
              const src = document.createElement('canvas'); src.width = 64; src.height = 96
              const g = src.getContext('2d'); g.fillStyle = '#3080e0'; g.fillRect(8, 8, 48, 80)
              const out = []
              for (const id of ids) {
                try {
                  const r = window.__fx.renderVfx({ source: src, w: 64, h: 96, t: 0.37, clipDur: 2,
                    entries: [{ uid: 'x', effect: id, v: 1, enabled: true, params: {}, from: 0, to: null }],
                    padAllowed: true, key: 'test', maxSide: 256, target: document.createElement('canvas') })
                  const px = r.canvas.getContext('2d').getImageData(0, 0, r.canvas.width, r.canvas.height).data
                  let alpha = 0
                  for (let i = 3; i < px.length; i += 4) alpha = Math.max(alpha, px[i])
                  if (!alpha) out.push({ id, error: 'fotograma vacío' })
                } catch (e) { out.push({ id, error: String(e.message || e) }) }
              }
              return out
            }""", ids)
            self.assertEqual(bad, [], bad)


if __name__ == "__main__":
    unittest.main()
