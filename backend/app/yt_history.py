"""Historial de enlaces de YouTube consultados (analyze)."""
from __future__ import annotations

import time

from . import settings

LIMIT = 40


def _as_items(raw) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out = []
    for x in raw:
        if not isinstance(x, dict):
            continue
        url = str(x.get("url") or "").strip()
        if not url:
            continue
        out.append({
            "url": url,
            "title": str(x.get("title") or url),
            "video_id": str(x.get("video_id") or ""),
            "at": int(x.get("at") or 0),
        })
    return out


def _key(item: dict) -> str:
    return (item.get("video_id") or "").strip() or (item.get("url") or "").strip()


def _video_fields(video) -> tuple[str, str]:
    if video is None:
        return "", ""
    if isinstance(video, dict):
        return str(video.get("id") or ""), str(video.get("title") or "")
    return str(getattr(video, "id", None) or ""), str(getattr(video, "title", None) or "")


def record(url: str, video=None, limit: int = LIMIT) -> list[dict]:
    url = (url or "").strip()
    data = settings.load()
    items = _as_items(data.get("yt_history"))
    if not url:
        return items
    video_id, title = _video_fields(video)
    key = video_id or url
    items = [
        x for x in items
        if _key(x) != key and (x.get("url") or "").strip() != url
    ]
    items.insert(0, {
        "url": url,
        "title": title or url,
        "video_id": video_id,
        "at": int(time.time()),
    })
    cap = max(1, int(limit or LIMIT))
    items = items[:cap]
    settings.save({"yt_history": items})
    return items


def remove(url_or_id: str) -> list[dict]:
    needle = (url_or_id or "").strip()
    items = _as_items(settings.load().get("yt_history"))
    if needle:
        items = [
            x for x in items
            if _key(x) != needle and (x.get("url") or "").strip() != needle
        ]
    settings.save({"yt_history": items})
    return items
