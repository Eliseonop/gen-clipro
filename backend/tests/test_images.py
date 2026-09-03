"""Imagen como material: storage, duración still y args de ffmpeg."""
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app import projects, storage
from app.clip_kind import IMAGE_DEFAULT_DUR, clip_fits_track, is_still_clip
from app.schemas import ImageInfo, TimelineClip


class ClipKindImageTest(unittest.TestCase):
    def test_image_fits_video_track_not_audio(self):
        self.assertTrue(clip_fits_track("image", "video"))
        self.assertFalse(clip_fits_track("image", "audio"))
        self.assertFalse(clip_fits_track("image", "text"))

    def test_still_clip_detects_kind_and_asset(self):
        self.assertTrue(is_still_clip({"kind": "image"}))
        self.assertTrue(is_still_clip(SimpleNamespace(kind="video", asset_kind="images")))
        self.assertFalse(is_still_clip({"kind": "video", "asset_kind": "clips"}))


class StorageImageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.proj = SimpleNamespace(id="p1", folder=str(self.tmp))
        storage.ensure_dirs(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_ensure_dirs_crea_image(self):
        self.assertTrue((self.tmp / "image").is_dir())
        self.assertTrue((self.tmp / "video").is_dir())
        self.assertTrue((self.tmp / "audio").is_dir())

    def test_resolve_media_image(self):
        path = self.tmp / "image" / "logo.png"
        path.write_bytes(b"fake-png")
        got = storage.resolve_media(self.proj, "image", "logo.png")
        self.assertEqual(got, path.resolve())

    def test_resolve_media_rechaza_kind_invalido(self):
        self.assertIsNone(storage.resolve_media(self.proj, "pdf", "x.pdf"))

    def test_try_local_media_decodifica_espacios(self):
        path = self.tmp / "video" / "Ver pelicula.mp4"
        path.write_bytes(b"fake-mp4")
        url = "/api/media/p1/video/Ver%20pelicula.mp4"
        with patch("app.projects.get_project", return_value=self.proj):
            got = storage.try_local_media(url)
        self.assertEqual(got, path.resolve())

    def test_try_local_media_ignora_youtube(self):
        self.assertIsNone(storage.try_local_media("https://www.youtube.com/watch?v=abc"))
        self.assertFalse(storage.is_media_url("https://www.youtube.com/watch?v=abc"))
        self.assertTrue(storage.is_media_url("/api/media/p1/video/Ver%20pelicula.mp4"))


class ImageInfoSchemaTest(unittest.TestCase):
    def test_image_info_minimo(self):
        info = ImageInfo(id="ab12", filename="meme.png", url="/api/media/p/image/meme.png", width=800, height=600)
        self.assertEqual(info.id, "ab12")
        self.assertEqual(info.width, 800)
        self.assertEqual(info.origin, "upload")

    def test_timeline_clip_image_acepta_reframe(self):
        c = TimelineClip(
            id="c1", track_id="V2", kind="image", asset_kind="images",
            asset_id="ab12", filename="meme.png", start=10, in_point=0,
            out_point=IMAGE_DEFAULT_DUR, source_duration=IMAGE_DEFAULT_DUR,
            layout="fill",
        )
        self.assertEqual(c.kind, "image")
        self.assertEqual(c.out_point, 5.0)
        self.assertEqual(c.layout, "fill")


class FfmpegStillInputTest(unittest.TestCase):
    def test_image_input_loops_still(self):
        from app.clip_kind import ffmpeg_input_args
        clip = TimelineClip(
            id="c1", track_id="V1", kind="image", asset_kind="images",
            asset_id="i", filename="a.png", out_point=5.0, source_duration=5.0,
        )
        args = ffmpeg_input_args(clip, Path("a.png"), 30)
        self.assertEqual(args[:4], ["-loop", "1", "-framerate", "30"])
        self.assertIn("-i", args)
        self.assertIn("a.png", args[-1])

    def test_still_partido_trimea_desde_cero(self):
        from app.clip_kind import ffmpeg_input_args, ffmpeg_trim_window
        clip = TimelineClip(
            id="c1", track_id="V1", kind="image", asset_kind="images",
            asset_id="i", filename="a.png", in_point=2.5, out_point=5.0,
            source_duration=5.0,
        )
        tin, tout = ffmpeg_trim_window(clip)
        self.assertEqual((tin, tout), (0.0, 2.5))
        args = ffmpeg_input_args(clip, Path("a.png"), 30)
        self.assertEqual(args[4:6], ["-t", "2.550"])

    def test_video_trim_usa_in_out(self):
        from app.clip_kind import ffmpeg_trim_window
        clip = TimelineClip(
            id="c1", track_id="V1", kind="video", asset_kind="clips",
            asset_id="0", filename="a.mp4", in_point=1.0, out_point=4.0,
            source_duration=10.0,
        )
        self.assertEqual(ffmpeg_trim_window(clip), (1.0, 4.0))

    def test_video_input_is_plain(self):
        from app.clip_kind import ffmpeg_input_args
        clip = TimelineClip(
            id="c1", track_id="V1", kind="video", asset_kind="clips",
            asset_id="0", filename="a.mp4", out_point=4.0, source_duration=4.0,
        )
        self.assertEqual(ffmpeg_input_args(clip, Path("a.mp4"), 30), ["-i", "a.mp4"])


class ImageImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = projects._FILE
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Img").id
        projects.set_folder(self.pid, str(self.tmp / "proj"))

    def tearDown(self):
        projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_import_guarda_png_sin_convertir(self):
        from app.images import import_image
        proj = projects.get_project(self.pid)
        info = import_image(proj, "meme.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
        self.assertEqual(info.origin, "upload")
        self.assertTrue(info.filename.endswith(".png"))
        path = storage.resolve_media(proj, "image", info.filename)
        self.assertTrue(path.exists())
        self.assertEqual(path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        again = projects.get_project(self.pid)
        self.assertEqual(len(again.images), 1)
        self.assertEqual(again.images[0].id, info.id)

    def test_import_guarda_descripcion(self):
        from app.images import import_image
        proj = projects.get_project(self.pid)
        info = import_image(proj, "meme.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, description="logo canal")
        self.assertEqual(info.description, "logo canal")

    def test_import_sin_extension_si_es_png(self):
        from app.images import import_image
        proj = projects.get_project(self.pid)
        info = import_image(proj, "captura", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
        self.assertTrue(info.filename.endswith(".png"))

    def test_ext_invalida(self):
        from app.images import import_image
        proj = projects.get_project(self.pid)
        with self.assertRaises(ValueError):
            import_image(proj, "nota.txt", b"hola")

    def test_import_jpeg_guarda_png(self):
        import cv2
        import numpy as np
        from app.images import import_image
        img = np.zeros((12, 16, 3), dtype=np.uint8)
        img[:] = (40, 90, 200)
        ok, buf = cv2.imencode(".jpg", img)
        self.assertTrue(ok)
        proj = projects.get_project(self.pid)
        info = import_image(proj, "foto.jpg", buf.tobytes())
        self.assertTrue(info.filename.endswith(".png"))
        path = storage.resolve_media(proj, "image", info.filename)
        self.assertEqual(path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(info.width, 16)
        self.assertEqual(info.height, 12)

    def test_import_webp_guarda_png(self):
        import cv2
        import numpy as np
        from app.images import import_image
        img = np.zeros((10, 10, 3), dtype=np.uint8)
        img[:] = (10, 200, 80)
        ok, buf = cv2.imencode(".webp", img)
        if not ok:
            self.skipTest("este OpenCV no escribe WebP")
        proj = projects.get_project(self.pid)
        info = import_image(proj, "sticker.webp", buf.tobytes())
        self.assertTrue(info.filename.endswith(".png"))
        path = storage.resolve_media(proj, "image", info.filename)
        self.assertEqual(path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")


class ImageFetchTest(unittest.TestCase):
    def test_rechaza_file_url(self):
        from app.images import fetch_image
        with self.assertRaises(ValueError):
            fetch_image("file:///C:/Users/x/foto.png")

    def test_descarga_png(self):
        from unittest.mock import patch
        from app.images import fetch_image
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

        class FakeResp:
            def __init__(self, data):
                self._buf = data
                self.headers = {}
            def read(self, n=-1):
                if n < 0:
                    n = len(self._buf)
                chunk, self._buf = self._buf[:n], self._buf[n:]
                return chunk
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        with patch("app.images.urlopen", return_value=FakeResp(png)):
            name, data = fetch_image("https://cdn.example.com/path/meme.png")
        self.assertEqual(name, "meme.png")
        self.assertEqual(data, png)

    def test_html_no_es_imagen(self):
        from unittest.mock import patch
        from app.images import fetch_image

        class FakeResp:
            def __init__(self, data):
                self._buf = data
                self.headers = {}
            def read(self, n=-1):
                if n < 0:
                    n = len(self._buf)
                chunk, self._buf = self._buf[:n], self._buf[n:]
                return chunk
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False

        with patch("app.images.urlopen", return_value=FakeResp(b"<html>no</html>")):
            with self.assertRaises(ValueError):
                fetch_image("https://example.com/page")


try:
    from app.compose import build_command
    _HAS_COMPOSE = True
except Exception:
    _HAS_COMPOSE = False

# 1×1 RGBA PNG válido (para compose, no un header suelto).
_PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


@unittest.skipUnless(_HAS_COMPOSE, "compose deps missing")
class ComposeStillCommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        storage.ensure_dirs(self.tmp)
        (self.tmp / "image" / "logo.png").write_bytes(_PNG_1X1)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_still_partido_no_usa_in_out_de_fuente(self):
        from app.schemas import Project, Timeline, TimelineTrack
        proj = Project(
            id="p1", name="x", created_at="t", folder=str(self.tmp),
            images=[ImageInfo(id="i", filename="logo.png", url="/i")],
        )
        tl = Timeline(
            tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
            clips=[TimelineClip(
                id="c1", track_id="V1", kind="image", asset_kind="images",
                asset_id="i", filename="logo.png", start=0.0,
                in_point=2.5, out_point=5.0, source_duration=5.0, layout="fill",
            )],
        )
        cmd = build_command(proj, tl, self.tmp / "out.mp4")
        joined = " ".join(cmd)
        self.assertIn("-loop", joined)
        self.assertIn("trim=0.000:2.500", joined)
        self.assertNotIn("trim=2.500:5.000", joined)


if __name__ == "__main__":
    unittest.main()
