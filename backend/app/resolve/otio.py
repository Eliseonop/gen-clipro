"""Generador OpenTimelineIO (.otio) para importar en DaVinci Resolve (Free).

Según la doc de Resolve, el import de OTIO (File > Import > Timeline) NO pasa por
el puente de scripting, así que es una vía de importación robusta también en Free.

OTIO modela cada pista como una **secuencia** (sin offset por clip): rellenamos
los huecos con ``Gap`` para colocar cada clip en su instante. Módulo PURO: recibe
``FcpItem`` con rutas absolutas y emite el JSON OTIO.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from app.resolve.fcpxml import FcpItem


def _rt(value_frames: int, rate: int) -> dict:
    return {"OTIO_SCHEMA": "RationalTime.1", "rate": rate, "value": int(value_frames)}


def _range(start_frames: int, dur_frames: int, rate: int) -> dict:
    return {
        "OTIO_SCHEMA": "TimeRange.1",
        "start_time": _rt(start_frames, rate),
        "duration": _rt(max(1, dur_frames), rate),
    }


def _gap(dur_frames: int, rate: int) -> dict:
    return {
        "OTIO_SCHEMA": "Gap.1",
        "name": "gap",
        "source_range": _range(0, dur_frames, rate),
    }


def _clip(item: FcpItem, rate: int) -> dict:
    in_f = round(item.src_in * rate)
    dur_f = max(1, round(item.duration * rate))
    src_total = max(dur_f, round((item.src_duration or item.duration) * rate))
    return {
        "OTIO_SCHEMA": "Clip.1",
        "name": item.name,
        "source_range": _range(in_f, dur_f, rate),
        "media_reference": {
            "OTIO_SCHEMA": "ExternalReference.1",
            "target_url": Path(item.path).resolve().as_uri(),
            "available_range": _range(0, src_total, rate),
        },
    }


def _track(name: str, kind: str, items: list[FcpItem], rate: int) -> dict:
    """Una pista OTIO: clips ordenados por offset con Gaps para respetar posición."""
    children: list[dict] = []
    cursor = 0
    for it in sorted(items, key=lambda x: x.offset):
        off_f = round(it.offset * rate)
        if off_f > cursor:
            children.append(_gap(off_f - cursor, rate))
            cursor = off_f
        elif off_f < cursor:
            # Solape en la misma pista: lo empujamos al final del anterior.
            off_f = cursor
        children.append(_clip(it, rate))
        cursor = off_f + max(1, round(it.duration * rate))
    return {"OTIO_SCHEMA": "Track.1", "name": name, "kind": kind, "children": children}


def build_otio(
    *,
    fps: int,
    items: Iterable[FcpItem],
    project_name: str = "Dynamic Subtitles",
) -> str:
    """Construye el JSON OTIO. Vídeo (lane>0) y audio (lane<0) en pistas separadas."""
    rate = int(fps) or 30
    items = list(items)

    # Agrupa por (tipo, índice de pista = |lane|).
    vids: dict[int, list[FcpItem]] = {}
    auds: dict[int, list[FcpItem]] = {}
    for it in items:
        idx = abs(it.lane) or 1
        (vids if it.kind == "video" else auds).setdefault(idx, []).append(it)

    tracks: list[dict] = []
    # Audio primero o vídeo primero no importa para Resolve; ponemos vídeo arriba.
    for idx in sorted(vids):
        tracks.append(_track(f"V{idx}", "Video", vids[idx], rate))
    for idx in sorted(auds):
        tracks.append(_track(f"A{idx}", "Audio", auds[idx], rate))

    doc = {
        "OTIO_SCHEMA": "Timeline.1",
        "name": project_name,
        "global_start_time": _rt(0, rate),
        "tracks": {
            "OTIO_SCHEMA": "Stack.1",
            "name": "tracks",
            "children": tracks,
        },
    }
    return json.dumps(doc, indent=2, ensure_ascii=False)
