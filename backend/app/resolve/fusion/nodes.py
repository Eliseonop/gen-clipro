"""Constructores de nodos Fusion de alto nivel (Text+, Merge, MediaOut).

Devuelven cadenas ASCII listas para ``ascii.setting([...])``. Aíslan los nombres
exactos de inputs de cada operador (verificados contra Resolve).
"""
from __future__ import annotations

from app.resolve.fusion import ascii as fa


def text_plus(name: str, *, text: str, cx: float, cy: float, w: int, h: int,
              size, font: str, font_style: str,
              rgb: tuple[float, float, float] = (1.0, 1.0, 1.0),
              rgb_links: dict[str, str] | None = None,
              alpha=1.0, global_in: int | None = None, global_out: int | None = None,
              pos: tuple[float, float] | None = None) -> str:
    """Un nodo Text+ centrado en (cx,cy) (coords Fusion: Y hacia arriba).

    ``size`` y los canales de color pueden ser un número (estático) o el nombre
    de un BezierSpline (se enlaza). ``global_in/out`` limitan la validez del nodo
    (visibilidad por rango de frames, sin necesidad de animar el alfa).
    """
    rgb_links = rgb_links or {}
    inputs: list[tuple[str, object]] = []
    if global_in is not None:
        inputs.append(("GlobalIn", global_in))
    if global_out is not None:
        inputs.append(("GlobalOut", global_out))
    inputs += [
        ("Width", w),
        ("Height", h),
        ("UseFrameFormatSettings", 1),
        ('["Gamut.SLogVersion"]', fa.fuid("SLog2")),
        ("Center", fa.point(cx, cy)),
        ("LayoutRotation", 1),
        ("TransformRotation", 1),
        ("StyledText", text),
        ("Font", font),
        ("Style", font_style),
        ("Size", fa.link(size) if isinstance(size, str) else size),
    ]
    for ch, default in (("Red1", rgb[0]), ("Green1", rgb[1]), ("Blue1", rgb[2])):
        inputs.append((ch, fa.link(rgb_links[ch]) if ch in rgb_links else default))
    inputs.append(("Alpha1", fa.link(alpha) if isinstance(alpha, str) else alpha))
    return fa.tool(name, "TextPlus", inputs, pos)


def merge(name: str, bg: str, fg: str, pos: tuple[float, float] | None = None) -> str:
    return fa.tool(name, "Merge", [
        ("Background", fa.link(bg, "Output")),
        ("Foreground", fa.link(fg, "Output")),
        ("PerformDepthMerge", 0),
    ], pos)


def media_out(name: str, src: str, pos: tuple[float, float] | None = None) -> str:
    # Formato real de Resolve: Input (conexión a la última etapa) + Index="0".
    return fa.tool(name, "MediaOut", [
        ("Input", fa.link(src, "Output")),
        ("Index", "0"),
    ], pos)


def background_transparent(name: str, w: int, h: int, global_out: int | None = None,
                           pos: tuple[float, float] | None = None) -> str:
    """Fondo transparente (base del merge) válido en todo el clip.

    Garantiza que MediaOut siempre tenga un fotograma (evita 'No frame available').
    ``global_out=None`` deja el nodo válido en todo el rango de la comp.
    """
    inputs: list[tuple[str, object]] = []
    if global_out is not None:
        inputs.append(("GlobalOut", global_out))
    inputs += [
        ("Width", w),
        ("Height", h),
        ("UseFrameFormatSettings", 1),
        ("TopLeftAlpha", 0),
        ("TopRightAlpha", 0),
        ("BottomLeftAlpha", 0),
        ("BottomRightAlpha", 0),
        ("Alpha", 0),
    ]
    return fa.tool(name, "Background", inputs, pos)
