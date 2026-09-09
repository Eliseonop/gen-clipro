"""Generador de FCPXML para importar un timeline en DaVinci Resolve (Free).

Resolve Free importa FCPXML (File > Import > Timeline). Este módulo arma un
timeline con los clips de vídeo y audio del proyecto colocados en el tiempo, para
que al importarlo aparezca la escaleta montada y solo haya que rematar.

Estrategia (robusta y simple): la storyline primaria es un ``<gap>`` que abarca
toda la duración, y **cada clip va como "connected clip"** en su ``lane`` (vídeo
en lanes positivos, audio en negativos). Así no hay que secuenciar la primaria y
Resolve reparte los clips en sus pistas por lane.

Tiempos en fracciones racionales múltiplos de ``1/fps s`` (frame-aligned). Es un
módulo PURO: recibe rutas absolutas ya resueltas y no toca disco.

⚠️ La importación de FCPXML en Resolve es quisquillosa; esto es un primer
generador a validar en Resolve real (los subtítulos fiables van por el .srt).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape


@dataclass
class FcpItem:
    """Un clip a colocar en el timeline importable."""
    path: str            # ruta absoluta al archivo de medio
    kind: str            # "video" | "audio"
    offset: float        # posición en el timeline (s)
    duration: float      # duración en el timeline (s)
    src_in: float = 0.0  # inicio dentro del material fuente (s)
    src_duration: float = 0.0  # duración total del material (s); 0 = usa duration
    lane: int = 1        # +N vídeo (arriba), -N audio (abajo)
    name: str = "clip"


@dataclass
class FcpCaption:
    text: str
    offset: float
    duration: float


def _t(seconds: float, fps: int) -> str:
    """Segundos -> tiempo FCPXML racional, alineado a frame: ``<frames>/<fps>s``."""
    frames = max(0, round(float(seconds) * fps))
    return f"{frames}/{fps}s"


def _asset_id(index: int) -> str:
    return f"a{index}"


def build_fcpxml(
    *,
    fps: int,
    width: int,
    height: int,
    duration: float,
    items: Iterable[FcpItem],
    project_name: str = "Dynamic Subtitles",
    captions: Iterable[FcpCaption] | None = None,
) -> str:
    """Construye el documento FCPXML (string). ``items`` ya trae rutas absolutas."""
    fps = int(fps) or 30
    items = list(items)
    caps = list(captions or [])
    total = max(float(duration or 0.0),
                *[it.offset + it.duration for it in items] or [0.0],
                *[c.offset + c.duration for c in caps] or [0.0])
    if total <= 0:
        total = 1.0

    # Recursos: formato + un asset por archivo único.
    fmt = (f'    <format id="r1" name="FFVideoFormat{height}p{fps}" '
           f'frameDuration="1/{fps}s" width="{width}" height="{height}" '
           f'colorSpace="1-1-1 (Rec. 709)"/>')

    assets: list[str] = []
    asset_of: dict[str, str] = {}   # path -> asset id
    idx = 0
    for it in items:
        if it.path in asset_of:
            continue
        idx += 1
        aid = _asset_id(idx)
        asset_of[it.path] = aid
        has_v = "1" if it.kind == "video" else "0"
        has_a = "1"  # asumimos audio presente; inofensivo si no lo hay
        dur = _t(it.src_duration or it.duration, fps)
        src = Path(it.path).resolve().as_uri()   # file:///C:/...
        fmt_attr = ' format="r1"' if it.kind == "video" else ""
        assets.append(
            f'    <asset id="{aid}" name="{escape(it.name)}" start="0s" '
            f'duration="{dur}" hasVideo="{has_v}" hasAudio="{has_a}"'
            f'{fmt_attr} audioSources="1" audioChannels="2" audioRate="48000">\n'
            f'      <media-rep kind="original-media" src="{escape(src)}"/>\n'
            f'    </asset>'
        )

    # Spine: gap primario + connected clips por lane.
    conn: list[str] = []
    for it in items:
        aid = asset_of[it.path]
        offset = _t(it.offset, fps)
        dur = _t(it.duration, fps)
        start = _t(it.src_in, fps)
        conn.append(
            f'          <asset-clip ref="{aid}" lane="{it.lane}" offset="{offset}" '
            f'name="{escape(it.name)}" duration="{dur}" start="{start}" '
            f'format="r1" tcFormat="NDF"/>'
        )

    cap_lane = (max([it.lane for it in items], default=0) + 1)
    cap_xml: list[str] = []
    if caps:
        # Una caption por segmento (Resolve las mapea a una pista de subtítulos).
        for i, c in enumerate(caps, start=1):
            cap_xml.append(
                f'          <caption lane="{cap_lane}" offset="{_t(c.offset, fps)}" '
                f'name="c{i}" duration="{_t(c.duration, fps)}" '
                f'role="iTT?captionFormat=ITT.es">\n'
                f'            <text><text-style ref="ts{i}">{escape(c.text)}</text-style></text>\n'
                f'            <text-style-def id="ts{i}">\n'
                f'              <text-style font="Helvetica" fontSize="48" fontColor="1 1 1 1" '
                f'bold="1" alignment="center"/>\n'
                f'            </text-style-def>\n'
                f'          </caption>'
            )

    gap = (f'        <gap name="Gap" offset="0s" duration="{_t(total, fps)}" start="0s">\n'
           + ("\n".join(conn) + "\n" if conn else "")
           + ("\n".join(cap_xml) + "\n" if cap_xml else "")
           + '        </gap>')

    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE fcpxml>\n'
        '<fcpxml version="1.9">\n'
        '  <resources>\n'
        f'{fmt}\n'
        + ("\n".join(assets) + "\n" if assets else "")
        + '  </resources>\n'
        '  <library>\n'
        f'    <event name="{escape(project_name)}">\n'
        f'      <project name="{escape(project_name)}">\n'
        f'        <sequence format="r1" duration="{_t(total, fps)}" '
        'tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">\n'
        '        <spine>\n'
        f'{gap}\n'
        '        </spine>\n'
        '        </sequence>\n'
        '      </project>\n'
        '    </event>\n'
        '  </library>\n'
        '</fcpxml>\n'
    )
    return doc
