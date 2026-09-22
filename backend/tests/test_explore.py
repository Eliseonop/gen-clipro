"""Búsqueda e importación de material externo (Pexels / GIPHY)."""
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.schemas import ExploreItem, ImageInfo
from app.media_search import (
    map_giphy_gif,
    map_pexels_photo,
    map_pexels_video,
    map_pixabay_photo,
    map_pixabay_video,
    map_unsplash_photo,
    merge_items,
    pick_video_download,
    pick_video_preview,
)
from app.asset_import import allowed_download_url


class MapProvidersTest(unittest.TestCase):
    def test_pexels_photo(self):
        item = map_pexels_photo({
            "id": 99,
            "width": 1080,
            "height": 1920,
            "photographer": "Ada",
            "url": "https://www.pexels.com/photo/99/",
            "alt": "clock tower",
            "src": {"original": "https://images.pexels.com/o.jpg", "medium": "https://images.pexels.com/m.jpg"},
        })
        self.assertEqual(item["id"], "pexels:photo:99")
        self.assertEqual(item["kind"], "photo")
        self.assertEqual(item["author"], "Ada")
        self.assertEqual(item["download_url"], "https://images.pexels.com/o.jpg")
        self.assertEqual(item["thumb_url"], "https://images.pexels.com/m.jpg")

    def test_pexels_video_preview_no_es_4k(self):
        files = [
            {"quality": "uhd", "file_type": "video/mp4", "width": 3840, "link": "https://videos.pexels.com/4k.mp4"},
            {"quality": "hd", "file_type": "video/mp4", "width": 1280, "link": "https://videos.pexels.com/hd.mp4"},
            {"quality": "sd", "file_type": "video/mp4", "width": 480, "link": "https://videos.pexels.com/sd.mp4"},
        ]
        self.assertEqual(pick_video_preview(files), "https://videos.pexels.com/sd.mp4")
        self.assertEqual(pick_video_download(files), "https://videos.pexels.com/hd.mp4")
        item = map_pexels_video({
            "id": 7,
            "width": 1920,
            "height": 1080,
            "duration": 8,
            "image": "https://images.pexels.com/thumb.jpg",
            "url": "https://www.pexels.com/video/7/",
            "user": {"name": "Bob"},
            "video_files": files,
        })
        self.assertEqual(item["kind"], "video")
        self.assertEqual(item["preview_url"], "https://videos.pexels.com/sd.mp4")
        self.assertEqual(item["download_url"], "https://videos.pexels.com/hd.mp4")
        self.assertEqual(item["duration"], 8)

    def test_giphy_gif(self):
        item = map_giphy_gif({
            "id": "abc",
            "title": "shocked",
            "url": "https://giphy.com/gifs/abc",
            "username": "giphy",
            "images": {
                "original": {"url": "https://media.giphy.com/o.gif", "width": "480", "height": "270"},
                "preview_gif": {"url": "https://media.giphy.com/p.gif"},
                "original_still": {"url": "https://media.giphy.com/s.png"},
            },
        })
        self.assertEqual(item["kind"], "gif")
        self.assertEqual(item["preview_url"], "https://media.giphy.com/p.gif")
        self.assertEqual(item["thumb_url"], "https://media.giphy.com/s.png")

    def test_pixabay_photo(self):
        item = map_pixabay_photo({
            "id": 42,
            "tags": "clock, time",
            "user": "Ada",
            "pageURL": "https://pixabay.com/photos/clock-42/",
            "webformatURL": "https://pixabay.com/get/web.jpg",
            "largeImageURL": "https://pixabay.com/get/large.jpg",
            "imageWidth": 1920,
            "imageHeight": 1080,
        })
        self.assertEqual(item["id"], "pixabay:photo:42")
        self.assertEqual(item["kind"], "photo")
        self.assertEqual(item["provider"], "pixabay")
        self.assertEqual(item["download_url"], "https://pixabay.com/get/large.jpg")
        self.assertEqual(item["thumb_url"], "https://pixabay.com/get/web.jpg")
        self.assertEqual(item["author"], "Ada")

    def test_pixabay_video_elige_stream_usable(self):
        item = map_pixabay_video({
            "id": 7,
            "tags": "ocean",
            "user": "Bob",
            "duration": 12,
            "pageURL": "https://pixabay.com/videos/ocean-7/",
            "videos": {
                "large": {"url": "https://cdn.pixabay.com/large.mp4", "width": 3840, "height": 2160, "thumbnail": "https://cdn.pixabay.com/l.jpg"},
                "medium": {"url": "https://cdn.pixabay.com/medium.mp4", "width": 1920, "height": 1080},
                "tiny": {"url": "https://cdn.pixabay.com/tiny.mp4", "width": 640, "height": 360},
            },
        })
        self.assertEqual(item["kind"], "video")
        # medium (1920) es el mayor ≤ 1920, no el 4K.
        self.assertEqual(item["download_url"], "https://cdn.pixabay.com/medium.mp4")
        self.assertEqual(item["width"], 1920)
        # preview = el más ligero (tiny).
        self.assertEqual(item["preview_url"], "https://cdn.pixabay.com/tiny.mp4")
        self.assertEqual(item["duration"], 12)

    def test_unsplash_photo(self):
        item = map_unsplash_photo({
            "id": "xY",
            "description": "a clock",
            "alt_description": "wall clock",
            "width": 4000,
            "height": 3000,
            "urls": {"full": "https://images.unsplash.com/full", "small": "https://images.unsplash.com/small"},
            "links": {"html": "https://unsplash.com/photos/xY"},
            "user": {"name": "Cлеo"},
        })
        self.assertEqual(item["id"], "unsplash:photo:xY")
        self.assertEqual(item["kind"], "photo")
        self.assertEqual(item["download_url"], "https://images.unsplash.com/full")
        self.assertEqual(item["thumb_url"], "https://images.unsplash.com/small")
        self.assertEqual(item["title"], "a clock")
        self.assertEqual(item["author"], "Cлеo")
        self.assertEqual(item["source_url"], "https://unsplash.com/photos/xY")

    def test_merge_intercala(self):
        a = [{"id": "p1"}, {"id": "p2"}]
        b = [{"id": "v1"}]
        c = [{"id": "g1"}, {"id": "g2"}]
        self.assertEqual([x["id"] for x in merge_items(a, b, c)], ["p1", "v1", "g1", "p2", "g2"])


class SearchPartialTest(unittest.TestCase):
    def test_giphy_ok_pexels_falla(self):
        from app.media_search import MediaSearchService

        svc = MediaSearchService()

        def fake_json(url, headers=None, timeout=12):
            if "giphy" in url:
                return {
                    "data": [{
                        "id": "z",
                        "title": "clock",
                        "url": "https://giphy.com/gifs/z",
                        "images": {"original": {"url": "https://media.giphy.com/z.gif", "width": "10", "height": "10"}},
                    }],
                    "pagination": {"total_count": 1, "count": 1, "offset": 0},
                }
            raise ValueError("Pexels caído")

        with patch("app.media_search.settings.api_key", side_effect=lambda n: "k"), \
             patch("app.media_search._fetch_json", side_effect=fake_json):
            out = svc.search("clock")
        self.assertTrue(out["partial"])
        self.assertEqual(out["warning"], "Algunas fuentes no están disponibles.")
        self.assertEqual(len(out["items"]), 1)
        self.assertEqual(out["items"][0]["provider"], "giphy")

    def test_sin_query_no_llama(self):
        from app.media_search import MediaSearchService
        with patch("app.media_search._fetch_json") as fetch:
            out = MediaSearchService().search("  ")
        fetch.assert_not_called()
        self.assertEqual(out["items"], [])

    def test_sin_claves_aviso_conjunto(self):
        from app.media_search import MediaSearchService
        with patch("app.media_search.settings.api_key", return_value=""), \
             patch("app.media_search._fetch_json") as fetch:
            out = MediaSearchService().search("time machine")
        fetch.assert_not_called()
        self.assertEqual(out["items"], [])
        self.assertIn("Pexels", out["warning"])
        self.assertIn("GIPHY", out["warning"])


class AllowedUrlTest(unittest.TestCase):
    def test_hosts(self):
        self.assertTrue(allowed_download_url("https://images.pexels.com/photos/1.jpg"))
        self.assertTrue(allowed_download_url("https://media4.giphy.com/media/x.gif"))
        self.assertTrue(allowed_download_url("https://player.vimeocdn.com/x.mp4"))
        self.assertTrue(allowed_download_url("https://pixabay.com/get/abc123.jpg"))
        self.assertTrue(allowed_download_url("https://images.unsplash.com/photo-123"))
        self.assertFalse(allowed_download_url("https://evil.example/steal"))
        self.assertFalse(allowed_download_url("file:///etc/passwd"))


class ImportExploreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.proj = SimpleNamespace(id="p1", folder=str(self.tmp), clips=[], images=[])

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_import_gif_conserva_formato_y_metadata(self):
        from app.asset_import import AssetImportService
        gif = b"GIF89a" + b"\x00" * 24
        item = ExploreItem(
            provider="giphy",
            external_id="abc",
            kind="gif",
            title="shocked",
            download_url="https://media.giphy.com/abc.gif",
            author="Giphy",
            source_url="https://giphy.com/gifs/abc",
            license_info="GIPHY",
        )
        saved = []

        def fake_import(project, filename, data, **kwargs):
            saved.append((filename, data, kwargs))
            return ImageInfo(
                id="i1", filename="shocked_i1.gif", url="/x",
                origin=kwargs.get("origin"), provider=kwargs.get("provider"),
                external_id=kwargs.get("external_id"), author=kwargs.get("author"),
                source_url=kwargs.get("source_url"), license_info=kwargs.get("license_info"),
            )

        with patch("app.asset_import.projects.get_project", return_value=self.proj), \
             patch("app.asset_import._download", return_value=gif), \
             patch("app.asset_import.images.import_image", side_effect=fake_import):
            out = AssetImportService().import_item("p1", item)
        self.assertEqual(out["kind"], "images")
        self.assertTrue(saved[0][2]["keep_gif"])
        self.assertEqual(saved[0][2]["provider"], "giphy")
        self.assertEqual(out["item"]["external_id"], "abc")
