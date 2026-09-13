"""Biblioteca de letras recortadas (*ransom letters*) para Paper Animator.

Vive en ``config.LETTERS_DIR`` (``assets/alfnum``), una carpeta plana generada
por Letter Lab::

    {ESTILO}_{TOKEN}_{ID}.png      REASON01_A_00188.png
    catalog.json                   índice (carácter, estilo, tamaño…)

El TOKEN existe porque Windows no distingue mayúsculas en los nombres y algunos
símbolos son ilegales: ``A`` mayúscula, ``mA`` minúscula, ``7`` dígito,
``sQST`` símbolo ``?``. Aquí solo se traduce de vuelta a carácter: la decisión de
QUÉ variante usa cada letra de una frase la toma el frontend (paperText.js), que
es quien la guarda en la composición para que el render sea reproducible.

Si falta ``catalog.json`` se reconstruye el índice a partir de los nombres, así
que basta con soltar PNG bien nombrados en la carpeta.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

from . import config

# Mismo mapa que letterlab/naming.py (la herramienta que genera la carpeta).
SYMBOLS: dict[str, str] = {
    "?": "sQST", "!": "sEXC", "*": "sAST", ";": "sSEM", ":": "sCOL",
    ",": "sCOM", ".": "sDOT", '"': "sQUO", "'": "sAPO", "&": "sAMP",
    "-": "sHYP", "#": "sHSH", "@": "sAT_", "$": "sUSD", "%": "sPCT",
    "+": "sPLS", "=": "sEQL", "/": "sSLH", "(": "sLPR", ")": "sRPR",
}
_SYMBOLS_INV = {v: k for k, v in SYMBOLS.items()}
_FILENAME_RE = re.compile(
    r"^(?P<style>[A-Z0-9]{2,16})_(?P<token>[A-Z0-9]|m[A-Z]|s[A-Z_]{3})_(?P<id>\d{5,})\.png$"
)

_PNG_MAGIC = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

_cache: dict = {"key": None, "data": None}


def base_dir() -> Path:
    return config.LETTERS_DIR


def token_to_char(token: str) -> str | None:
    """``'A'→'A'``, ``'mA'→'a'``, ``'7'→'7'``, ``'sQST'→'?'``; None si no es válido."""
    if len(token) == 1:
        return token
    if len(token) == 2 and token[0] == "m":
        return token[1].lower()
    return _SYMBOLS_INV.get(token)


def png_size(path: Path) -> tuple[int, int] | None:
    """(ancho, alto) leyendo la cabecera IHDR del PNG, sin decodificar la imagen."""
    try:
        with path.open("rb") as f:
            head = f.read(24)
    except OSError:
        return None
    if len(head) < 24 or head[:8] != _PNG_MAGIC:
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def _glyph(base: Path, filename: str, char: str, style: str, size=None) -> dict:
    if not (isinstance(size, (list, tuple)) and len(size) >= 2 and size[0] and size[1]):
        size = png_size(base / filename) or (None, None)
    w, h = size[0], size[1]
    return {
        "file": filename,
        "char": char,
        "style": style,
        "w": w,
        "h": h,
        "url": f"/api/letters/file/{quote(filename)}",
    }


def _from_catalog(base: Path, data: dict) -> list[dict]:
    out = []
    for e in data.get("entries") or []:
        filename = str(e.get("filename") or "")
        char = e.get("character")
        style = e.get("style")
        if not filename or not isinstance(char, str) or len(char) != 1 or not style:
            continue
        if not (base / filename).is_file():
            continue  # entrada huérfana: el catálogo no manda sobre el disco
        out.append(_glyph(base, filename, char, str(style), e.get("size")))
    return out


def _from_filenames(base: Path) -> list[dict]:
    out = []
    for p in sorted(base.glob("*.png")):
        m = _FILENAME_RE.match(p.name)
        char = token_to_char(m.group("token")) if m else None
        if char:
            out.append(_glyph(base, p.name, char, m.group("style")))
    return out


def library() -> dict:
    """``{available, styles, glyphs}``. Se cachea por mtime de la carpeta y del catálogo."""
    base = base_dir()
    if not base.is_dir():
        return {"available": False, "styles": [], "glyphs": []}
    catalog = base / "catalog.json"
    key = (str(base), base.stat().st_mtime_ns, catalog.stat().st_mtime_ns if catalog.is_file() else 0)
    if _cache["key"] == key:
        return _cache["data"]

    glyphs: list[dict] = []
    if catalog.is_file():
        try:
            glyphs = _from_catalog(base, json.loads(catalog.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            glyphs = []
    if not glyphs:
        glyphs = _from_filenames(base)

    styles = sorted({g["style"] for g in glyphs})
    data = {"available": bool(glyphs), "styles": styles, "glyphs": glyphs}
    _cache.update(key=key, data=data)
    return data


def resolve(filename: str) -> Path | None:
    """Ruta de un PNG de la biblioteca, sin permitir salir de la carpeta."""
    name = Path(filename or "").name
    if name != filename or not name.lower().endswith(".png"):
        return None
    path = base_dir() / name
    return path if path.is_file() else None
