"""Resolución de fuentes con fallback seguro.

Problema: si un preset pide una fuente que NO está instalada (p.ej. "Anton"),
Text+ falla en Resolve con "font not found". Además Resolve trae SUS PROPIAS
fuentes (Open Sans, Noto…) que ni aparecen en la carpeta de Windows, así que no
basta con mirar el sistema.

Estrategia:
  1) fuentes que Resolve trae de serie  -> siempre válidas,
  2) fuentes instaladas en Windows (registro) -> válidas,
  3) cualquier otra                     -> se sustituye por FALLBACK.

Devuelve SIEMPRE una fuente que renderiza, y avisa de la sustitución para que la
UI pueda decir "Anton no instalada, usando Open Sans" y ofrecer instalarla.
"""
from __future__ import annotations

from functools import lru_cache

FALLBACK = "Open Sans"
FALLBACK_STYLE = "Bold"

# Fuentes que DaVinci Resolve 21 incluye de serie (subconjunto seguro y estable).
RESOLVE_BUNDLED = {
    "open sans", "noto sans", "noto serif", "roboto", "dejavu sans", "arial",
}


@lru_cache(maxsize=1)
def installed_windows_fonts() -> frozenset[str]:
    """Familias instaladas en Windows (nombres del registro, en minúsculas).

    Lee HKLM y HKCU. Fuera de Windows (o si falla) devuelve conjunto vacío; en
    ese caso solo cuentan las fuentes RESOLVE_BUNDLED (comportamiento seguro).
    """
    names: set[str] = set()
    try:
        import winreg  # solo Windows
    except ImportError:
        return frozenset()
    key_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
    for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(root, key_path) as k:
                i = 0
                while True:
                    try:
                        val_name, _, _ = winreg.EnumValue(k, i)
                    except OSError:
                        break
                    i += 1
                    # "Anton (TrueType)" / "Open Sans Bold (TrueType)" -> familia
                    fam = val_name.split("(")[0].strip().lower()
                    if fam:
                        names.add(fam)
                        # primera palabra (para "Anton Regular" -> "anton")
                        names.add(fam.split()[0])
        except OSError:
            continue
    return frozenset(names)


def is_available(font: str) -> bool:
    f = (font or "").strip().lower()
    if not f:
        return False
    if f in RESOLVE_BUNDLED:
        return True
    inst = installed_windows_fonts()
    return f in inst or f.split()[0] in inst


def resolve_font(font: str, style: str) -> tuple[str, str, str | None]:
    """(font, style) -> (font_ok, style_ok, aviso|None).

    Si la fuente existe, la respeta. Si no, sustituye por FALLBACK y devuelve un
    aviso legible; el estilo también cae a FALLBACK_STYLE al cambiar de familia.
    """
    if is_available(font):
        return font, style, None
    aviso = f"Fuente '{font}' no instalada; usando '{FALLBACK}'."
    return FALLBACK, FALLBACK_STYLE, aviso
