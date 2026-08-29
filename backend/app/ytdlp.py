"""Opciones compartidas de yt-dlp, con cookies para vídeos con restricción de edad.

YouTube exige una sesión iniciada para el age-gate y, a veces, para el
anti-bot. Orden de intentos:

1. ``backend/data/youtube_cookies.txt`` o ``YTDLP_COOKIES``
2. Navegador de ``YTDLP_BROWSER`` / ``settings.youtube_browser``
3. Sin cookies (vídeos públicos)
4. Edge → Chrome → Firefox (``--cookies-from-browser``)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Iterator, TypeVar

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from . import config, settings

T = TypeVar("T")

BROWSERS = ("edge", "chrome", "firefox")
COOKIE_ENV = "YTDLP_COOKIES"
BROWSER_ENV = "YTDLP_BROWSER"

_AUTH_NEEDLES = (
    "sign in to confirm your age",
    "sign in to confirm you're not a bot",
    "sign in to confirm you’re not a bot",
    "use --cookies",
    "age-restricted",
    "login required",
    "not a bot",
)
_COOKIE_SOURCE_NEEDLES = (
    "could not copy",
    "cookies database",
    "failed to decrypt",
    "dpapi",
    "unable to load cookies",
    "cookie database",
    "could not find",
    "unsupported keyring",
)

AUTH_HINT = (
    "YouTube pide iniciar sesión por restricción de edad o verificación anti-bot. "
    "Inicia sesión en YouTube en Edge, Chrome o Firefox con una cuenta que tenga "
    "la edad confirmada y vuelve a intentar. También puedes exportar las cookies "
    "a backend/data/youtube_cookies.txt (formato Netscape)."
)


def _msg(exc: BaseException) -> str:
    return str(exc).lower()


def is_auth_error(exc: BaseException) -> bool:
    msg = _msg(exc)
    return any(n in msg for n in _AUTH_NEEDLES)


def is_cookie_source_error(exc: BaseException) -> bool:
    msg = _msg(exc)
    return any(n in msg for n in _COOKIE_SOURCE_NEEDLES)


def friendly_error(exc: BaseException) -> str:
    if is_auth_error(exc) or is_cookie_source_error(exc):
        return AUTH_HINT
    return str(exc)


def _cookie_file() -> Path:
    env = (os.environ.get(COOKIE_ENV) or "").strip()
    if env:
        return Path(env)
    return config.DATA_DIR / "youtube_cookies.txt"


def _configured_browser() -> str | None:
    env = (os.environ.get(BROWSER_ENV) or "").strip().lower()
    raw = env
    if not raw:
        data = settings.load() or {}
        raw = (data.get("youtube_browser") or "").strip().lower()
    if raw in ("", "auto", "none", "off"):
        return None
    return raw


def auth_attempts(base: dict) -> Iterator[dict]:
    """Genera dicts de opciones de YoutubeDL, del más específico al fallback."""
    base = dict(base)
    cookie = _cookie_file()
    used_file = cookie.is_file()
    configured = _configured_browser()

    if used_file:
        yield {**base, "cookiefile": str(cookie)}
    if configured:
        yield {**base, "cookiesfrombrowser": (configured,)}
    if not used_file and not configured:
        yield dict(base)

    for browser in BROWSERS:
        if browser != configured:
            yield {**base, "cookiesfrombrowser": (browser,)}


def _remember_browser(attempt: dict) -> None:
    pair = attempt.get("cookiesfrombrowser")
    if not pair:
        return
    current = ((settings.load() or {}).get("youtube_browser") or "").strip().lower()
    if current not in ("", "auto"):
        return
    try:
        settings.save({"youtube_browser": pair[0]})
    except Exception:
        pass


def call(opts: dict, fn: Callable[[Any], T]) -> T:
    """Ejecuta ``fn(ydl)`` reintentando con cookies si YouTube pide sesión."""
    last: BaseException | None = None
    for attempt in auth_attempts(opts):
        try:
            with YoutubeDL(attempt) as ydl:
                result = fn(ydl)
            _remember_browser(attempt)
            return result
        except Exception as exc:  # noqa: BLE001 - hay que clasificar el error de yt-dlp
            last = exc
            if is_cookie_source_error(exc) or is_auth_error(exc):
                continue
            raise
    if last is None:
        raise RuntimeError("No se pudo ejecutar yt-dlp.")
    raise DownloadError(friendly_error(last)) from last
