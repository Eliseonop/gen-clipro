"""Fuentes del export y sus métricas.

El preview (canvas) usa el tamaño de letra CSS: el "em". libass (el ``.ass`` del
export) no: su tamaño de letra es el alto de LÍNEA según las métricas OS/2 de la
fuente (compatibilidad con VSFilter)::

    em = tamaño_ass · unitsPerEm / (usWinAscent + usWinDescent)

Así que con el mismo número la letra exportada salía más pequeña que en el
preview: Arial ~11 %, Impact ~18 %, Anton ~43 % (medido con FFmpeg 9).
``ass_size_factor`` devuelve el factor para convertir el tamaño del preview al
del ``.ass``.
"""
from __future__ import annotations

import struct
from functools import lru_cache
from pathlib import Path

# Fuentes del sistema (Windows) + fuentes embebidas del proyecto.
FONT_DIR = Path("C:/Windows/Fonts")
BUNDLED_FONT_DIR = Path(__file__).resolve().parent / "fonts"
FONTS = {
    "Arial": "arial.ttf", "Arial Black": "ariblk.ttf", "Impact": "impact.ttf",
    "Georgia": "georgia.ttf", "Verdana": "verdana.ttf", "Times New Roman": "times.ttf",
    "Courier New": "cour.ttf", "Comic Sans MS": "comic.ttf", "Trebuchet MS": "trebuc.ttf",
    "Segoe UI": "segoeui.ttf", "Segoe UI Black": "seguibl.ttf", "Calibri": "calibri.ttf",
    "Bahnschrift": "bahnschrift.ttf", "Tahoma": "tahoma.ttf", "Consolas": "consola.ttf",
}
FONTS_BOLD = {
    "Arial": "arialbd.ttf", "Georgia": "georgiab.ttf", "Verdana": "verdanab.ttf",
    "Times New Roman": "timesbd.ttf", "Courier New": "courbd.ttf", "Trebuchet MS": "trebucbd.ttf",
    "Segoe UI": "segoeuib.ttf", "Calibri": "calibrib.ttf", "Tahoma": "tahomabd.ttf",
    "Consolas": "consolab.ttf",
}
BUNDLED_FONTS = {
    "Anton": "Anton-Regular.ttf",
}


def resolve_font_path(name: str, bold: bool = False) -> Path:
    """Ruta al TTF: primero fuentes embebidas (Anton…), luego Windows/Fonts."""
    bundled = BUNDLED_FONTS.get(name)
    if bundled:
        p = BUNDLED_FONT_DIR / bundled
        if p.exists():
            return p
    fn = (FONTS_BOLD.get(name) if bold else None) or FONTS.get(name, "arial.ttf")
    p = FONT_DIR / fn
    if not p.exists():
        p = FONT_DIR / "arial.ttf"
    return p


def _tables(data: bytes) -> dict[bytes, bytes]:
    num = struct.unpack(">H", data[4:6])[0]
    out: dict[bytes, bytes] = {}
    for i in range(num):
        tag, _chk, off, length = struct.unpack(">4sIII", data[12 + 16 * i: 28 + 16 * i])
        out[tag] = data[off: off + length]
    return out


@lru_cache(maxsize=64)
def _line_height_em(path: str) -> float:
    """(usWinAscent + usWinDescent) / unitsPerEm (hhea si no hay OS/2); 1 si no se puede leer."""
    try:
        t = _tables(Path(path).read_bytes())
        upm = struct.unpack(">H", t[b"head"][18:20])[0]
        os2 = t.get(b"OS/2")
        if os2 and len(os2) >= 78:
            win_asc, win_desc = struct.unpack(">HH", os2[74:78])
            height = win_asc + win_desc
        else:
            asc, desc = struct.unpack(">hh", t[b"hhea"][4:8])
            height = asc - desc
        return height / upm if upm and height > 0 else 1.0
    except Exception:  # noqa: BLE001 — fuente ilegible: sin corrección
        return 1.0


def ass_size_factor(name: str | None, bold: bool = True) -> float:
    """Tamaño ASS = tamaño del preview (em) × este factor."""
    return _line_height_em(str(resolve_font_path(name or "Arial", bold)))


@lru_cache(maxsize=256)
def _pil_font(path: str, size: float):
    from PIL import ImageFont

    return ImageFont.truetype(path, size)


def text_width(name: str | None, bold: bool, em_px: float, text: str,
               letter_spacing_px: float = 0.0) -> float:
    """Ancho de ``text`` como lo mide ``ctx.measureText`` en el preview (mismo TTF,
    tamaño en "em", ``letterSpacing`` tras cada carácter). Sirve para repartir el
    texto en líneas igual que ``wrapWordRows``."""
    size = max(1.0, round(float(em_px) * 4) / 4)
    try:
        w = _pil_font(str(resolve_font_path(name or "Arial", bold)), size).getlength(text or "")
    except Exception:  # noqa: BLE001 — sin Pillow/fuente: estimación
        w = len(text or "") * em_px * 0.55
    return w + letter_spacing_px * len(text or "")
