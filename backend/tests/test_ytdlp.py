import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from yt_dlp.utils import DownloadError


class AuthErrorTest(unittest.TestCase):
    def test_detects_age_gate(self):
        from app.ytdlp import is_auth_error

        exc = DownloadError(
            "ERROR: [youtube] ngN7eJUQyXk: Sign in to confirm your age. "
            "This video may be inappropriate for some users. Use --cookies-from-browser"
        )
        self.assertTrue(is_auth_error(exc))

    def test_detects_bot_check(self):
        from app.ytdlp import is_auth_error

        self.assertTrue(is_auth_error(DownloadError("Sign in to confirm you’re not a bot")))
        self.assertTrue(is_auth_error(DownloadError("Sign in to confirm you're not a bot")))

    def test_ignores_unrelated_errors(self):
        from app.ytdlp import is_auth_error

        self.assertFalse(is_auth_error(DownloadError("Video unavailable")))
        self.assertFalse(is_auth_error(RuntimeError("FFmpeg falló")))


class CookieSourceErrorTest(unittest.TestCase):
    def test_detects_missing_browser_db(self):
        from app.ytdlp import is_cookie_source_error

        self.assertTrue(is_cookie_source_error(Exception("could not copy chrome cookies database")))
        self.assertTrue(is_cookie_source_error(Exception("Failed to decrypt with DPAPI")))
        self.assertFalse(is_cookie_source_error(Exception("HTTP Error 404")))


class FriendlyErrorTest(unittest.TestCase):
    def test_age_gate_is_spanish_and_actionable(self):
        from app.ytdlp import friendly_error

        msg = friendly_error(
            DownloadError("ERROR: [youtube] x: Sign in to confirm your age. Use --cookies")
        )
        self.assertIn("restricción de edad", msg.lower())
        self.assertIn("youtube_cookies.txt", msg)
        self.assertNotIn("yt-dlp/wiki/FAQ", msg)

    def test_other_errors_keep_original(self):
        from app.ytdlp import friendly_error

        self.assertEqual(friendly_error(RuntimeError("boom")), "boom")


def _patch_no_auth():
    return (
        patch("app.ytdlp.settings.load", return_value={}),
        patch.dict(os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False),
    )


class AuthAttemptsTest(unittest.TestCase):
    def test_anonymous_then_browsers_when_nothing_configured(self):
        from app.ytdlp import auth_attempts

        with patch("app.ytdlp.settings.load", return_value={}), patch.dict(
            os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False
        ), patch("app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")):
            attempts = list(auth_attempts({"quiet": True, "format": "best"}))

        self.assertEqual(attempts[0]["format"], "best")
        self.assertNotIn("cookiefile", attempts[0])
        self.assertNotIn("cookiesfrombrowser", attempts[0])
        browsers = [a["cookiesfrombrowser"][0] for a in attempts[1:]]
        self.assertEqual(browsers, ["edge", "chrome", "firefox"])

    def test_cookie_file_goes_first(self):
        from app.ytdlp import auth_attempts

        with tempfile.NamedTemporaryFile(delete=False) as fh:
            path = fh.name
        try:
            with patch("app.ytdlp.settings.load", return_value={}), patch.dict(
                os.environ, {"YTDLP_COOKIES": path, "YTDLP_BROWSER": ""}, clear=False
            ):
                attempts = list(auth_attempts({"quiet": True}))
        finally:
            os.unlink(path)

        self.assertEqual(attempts[0]["cookiefile"], path)
        self.assertNotIn("cookiesfrombrowser", attempts[0])

    def test_configured_browser_goes_first(self):
        from app.ytdlp import auth_attempts

        with patch("app.ytdlp.settings.load", return_value={"youtube_browser": "firefox"}), patch.dict(
            os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False
        ), patch("app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")):
            attempts = list(auth_attempts({}))

        self.assertEqual(attempts[0]["cookiesfrombrowser"], ("firefox",))
        rest = [a["cookiesfrombrowser"][0] for a in attempts[1:] if "cookiesfrombrowser" in a]
        self.assertNotIn("firefox", rest)

    def test_env_browser_overrides_settings(self):
        from app.ytdlp import auth_attempts

        with patch("app.ytdlp.settings.load", return_value={"youtube_browser": "chrome"}), patch.dict(
            os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": "edge"}, clear=False
        ), patch("app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")):
            attempts = list(auth_attempts({}))

        self.assertEqual(attempts[0]["cookiesfrombrowser"], ("edge",))


class CallRetryTest(unittest.TestCase):
    def _ydl_factory(self):
        created = []

        def factory(opts):
            inst = MagicMock()
            inst.opts = opts
            inst.__enter__.return_value = inst
            inst.__exit__.return_value = False
            created.append(inst)
            return inst

        return factory, created

    def test_retries_age_gate_with_browser_cookies(self):
        from app.ytdlp import call

        factory, created = self._ydl_factory()
        age = DownloadError("Sign in to confirm your age. Use --cookies")

        def fn(ydl):
            if "cookiesfrombrowser" not in ydl.opts:
                raise age
            return {"id": "ngN7eJUQyXk"}

        with patch("app.ytdlp.YoutubeDL", side_effect=factory), patch(
            "app.ytdlp.settings.load", return_value={}
        ), patch("app.ytdlp.settings.save") as save, patch.dict(
            os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False
        ), patch("app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")):
            result = call({"quiet": True}, fn)

        self.assertEqual(result["id"], "ngN7eJUQyXk")
        self.assertGreaterEqual(len(created), 2)
        save.assert_called()
        self.assertEqual(save.call_args[0][0]["youtube_browser"], "edge")

    def test_skips_broken_browser_cookie_store(self):
        from app.ytdlp import call

        factory, _ = self._ydl_factory()
        age = DownloadError("Sign in to confirm your age")
        n = {"i": 0}

        def fn(ydl):
            n["i"] += 1
            if n["i"] == 1:
                raise age
            if ydl.opts.get("cookiesfrombrowser") == ("edge",):
                raise Exception("could not copy chrome cookies database")
            return {"ok": True}

        with patch("app.ytdlp.YoutubeDL", side_effect=factory), patch(
            "app.ytdlp.settings.load", return_value={}
        ), patch("app.ytdlp.settings.save"), patch.dict(
            os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False
        ), patch("app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")):
            result = call({}, fn)

        self.assertEqual(result, {"ok": True})

    def test_non_auth_errors_are_not_retried(self):
        from app.ytdlp import call

        factory, created = self._ydl_factory()

        def fn(ydl):
            raise DownloadError("Video unavailable")

        with patch("app.ytdlp.YoutubeDL", side_effect=factory), patch(
            "app.ytdlp.settings.load", return_value={}
        ), patch.dict(os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False), patch(
            "app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")
        ):
            with self.assertRaises(DownloadError) as ctx:
                call({}, fn)

        self.assertEqual(str(ctx.exception), "Video unavailable")
        self.assertEqual(len(created), 1)

    def test_exhausted_auth_retries_use_friendly_message(self):
        from app.ytdlp import call

        factory, _ = self._ydl_factory()

        def fn(ydl):
            raise DownloadError("Sign in to confirm your age")

        with patch("app.ytdlp.YoutubeDL", side_effect=factory), patch(
            "app.ytdlp.settings.load", return_value={}
        ), patch("app.ytdlp.settings.save"), patch.dict(
            os.environ, {"YTDLP_COOKIES": "", "YTDLP_BROWSER": ""}, clear=False
        ), patch("app.ytdlp._cookie_file", return_value=Path("/no/such/cookies.txt")):
            with self.assertRaises(DownloadError) as ctx:
                call({}, fn)

        self.assertIn("restricción de edad", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main()
