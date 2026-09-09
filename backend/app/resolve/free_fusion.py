"""Generador Fusion para DaVinci Resolve Free.

Convierte el documento interno (Project) en UNA composición Fusion (.setting) que
cubre todo el vídeo: un Text+ por palabra, colocado por layout, con:
  - pop  -> pulso de tamaño (Size) centrado en el inicio de la palabra,
  - karaoke/highlight -> color de la palabra activa (Red1/Green1/Blue1),
  - typewriter/one -> aparición progresiva (vía GlobalIn del nodo).
Los Text+ se combinan con Merges y salen por un MediaOut.

Uso: el usuario crea un clip Fusion / Fusion Composition que cubra el vídeo y
pega este setting (o se instala como plantilla de Título). Asume que la comp
empieza en t=0 del vídeo.

Limitaciones v1 (documentadas): 'bounce' cae a pop; 'highlight' se trata como
color (la caja de fondo por palabra llega después); el ancho de palabra es
estimado (métrica real con Pillow en la siguiente iteración).
"""
from __future__ import annotations

from pathlib import Path

from app.resolve.base import ExportResult, ProgressCb
from app.resolve.fusion import ascii as fa
from app.resolve.fusion import nodes
from app.resolve.fusion.validate import assert_connected
from app.resolve.fusion.fonts import resolve_font
from app.resolve.schemas import Project
from app.resolve.styles import resolve_animation, resolve_style, get_preset
from app.resolve.timing import word_active_windows

# Modelo de layout aproximado (semilla; la métrica real con Pillow llega después).
_CHAR_W = 0.62     # ancho medio de carácter en unidades de Size (Open Sans Bold ~0.6)
_LINE_H = 1.35     # alto de línea en unidades de Size
_COL = 132         # separación entre columnas en el editor de nodos (solo estético)


def _hex_rgb01(h: str) -> tuple[float, float, float]:
    s = (h or "#FFFFFF").strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) < 6:
        s = "FFFFFF"
    return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)


def _word_width(text: str, size: float, aspect: float) -> float:
    """Ancho normalizado (X) estimado de una palabra."""
    return len(text) * size * _CHAR_W / aspect


def _layout(texts: list[str], line_breaks: list[int], size: float,
            base_x: float, base_y_fusion: float, aspect: float,
            gap: float = 0.05) -> list[tuple[float, float]]:
    """Centros (x,y) normalizados (coords Fusion, Y arriba) de cada palabra.

    ``gap`` es el hueco entre palabras (X normalizada), configurable vía estilo.
    """
    # Reparte en líneas según line_breaks.
    lines: list[list[int]] = []
    cur: list[int] = []
    bset = set(line_breaks)
    for i in range(len(texts)):
        cur.append(i)
        if i in bset:
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)

    line_h = size * _LINE_H
    n = len(lines)
    y_top = base_y_fusion + (n - 1) * line_h / 2.0
    centers: list[tuple[float, float]] = [(base_x, base_y_fusion)] * len(texts)
    for li, line in enumerate(lines):
        y = y_top - li * line_h
        widths = [_word_width(texts[i], size, aspect) for i in line]
        total = sum(widths) + gap * (len(line) - 1)
        x = base_x - total / 2.0
        for i, wdt in zip(line, widths):
            centers[i] = (round(x + wdt / 2.0, 4), round(y, 4))
            x += wdt + gap
    return centers


def _pop_keys(w_start_f: int, size: float, scale: list[float], dur_f: int) -> list[tuple[int, float]]:
    peak = w_start_f + max(1, round(dur_f * 0.45))
    settle = w_start_f + max(2, dur_f)
    pk = scale[1] if len(scale) > 1 else 1.15
    return [(max(0, w_start_f - 1), size), (peak, size * pk), (settle, size)]


def generate_comp(project: Project, whole_clip_visible: bool = False) -> str:
    """Documento interno -> texto .setting de una composición Fusion completa.

    ``whole_clip_visible=True``: todos los Text+ válidos durante todo el clip
    (para probar UNA frase como plantilla de Título, sin depender de fps/duración
    del timeline). Por defecto (False) cada palabra vive solo en su tramo, para el
    comp de vídeo completo colocado como clip Fusion.
    """
    preset = get_preset(project.preset)
    st = resolve_style(preset, project.style)
    an = resolve_animation(preset, project.animation)

    fps = float(project.fps) or 30.0
    W, H = int(project.w), int(project.h)
    aspect = (W / H) if H else 1.777
    fx = set(an.get("word_fx", []))
    mode = an.get("mode", "accumulate")
    size = float(st["size"])
    dur_f = max(1, round(float(an.get("duration", 0.18)) * fps))
    pop_scale = list(an.get("pop_scale", [0.8, 1.15, 1.0]))
    base_rgb = _hex_rgb01(st["color"])
    hi_rgb = _hex_rgb01(st["highlight_color"])
    base_x = float(st["x"])
    base_y_fusion = 1.0 - float(st["y"])   # pantalla (0=arriba) -> Fusion (0=abajo)
    word_gap = float(st.get("word_gap", 0.05))
    # Fallback de fuente: nunca emitir una fuente que Resolve no tenga.
    font, font_style, _font_note = resolve_font(
        str(st.get("font", "Open Sans")), str(st.get("font_style", "Bold")))
    do_karaoke = bool(fx & {"karaoke", "highlight"})
    do_pop = "pop" in fx

    _last_end = project.segments[-1].end if project.segments else (project.duration or 1.0)
    total_frames = max(1, round(float(project.duration or _last_end) * fps))

    tools: list[str] = []
    text_nodes: list[str] = []
    row = 0

    for si, seg in enumerate(project.segments):
        words = project.seg_words(seg)
        if not words:
            continue
        texts = [w.text for w in words]
        centers = _layout(texts, seg.line_breaks, size, base_x, base_y_fusion, aspect, word_gap)
        windows = word_active_windows(words, seg.end)
        seg_in = round(seg.start * fps)
        seg_out = round(seg.end * fps)

        for wi, w in enumerate(words):
            node = f"w{si}_{wi}"
            cx, cy = centers[wi]
            w_start_f = round(w.start * fps)
            win_end_f = round(windows[wi][1] * fps)

            if whole_clip_visible:
                gin, gout = None, None   # válido en todo el clip (título de 1 frase)
            elif mode == "one":
                gin, gout = w_start_f, win_end_f
            elif mode == "typewriter" or "typewriter" in fx:
                gin, gout = w_start_f, seg_out
            else:
                gin, gout = seg_in, seg_out

            size_val: object = size
            if do_pop:
                sname = f"{node}_sz"
                tools.append(fa.spline(sname, _pop_keys(w_start_f, size, pop_scale, dur_f)))
                size_val = sname

            rgb_links: dict[str, str] = {}
            if do_karaoke:
                for ch, b, hv in (("Red1", base_rgb[0], hi_rgb[0]),
                                  ("Green1", base_rgb[1], hi_rgb[1]),
                                  ("Blue1", base_rgb[2], hi_rgb[2])):
                    cname = f"{node}_{ch}"
                    tools.append(fa.spline(
                        cname,
                        [(0, b), (w_start_f, hv), (win_end_f, b)],
                        color=(200, 200, 120), step=True,
                    ))
                    rgb_links[ch] = cname

            # Cada word se dibuja ENCIMA de su Merge (misma columna) -> flujo claro.
            col = (row + 1) * _COL
            tools.append(nodes.text_plus(
                node, text=w.text, cx=cx, cy=cy, w=W, h=H,
                size=size_val, font=font, font_style=font_style,
                rgb=base_rgb, rgb_links=rgb_links,
                global_in=gin, global_out=gout, pos=(col, -_COL),
            ))
            text_nodes.append(node)
            row += 1

    # Fondo transparente base: garantiza que MediaOut siempre tenga fotograma
    # (evita "No frame available"). Válido en todo el clip en modo título.
    bg_out = None if whole_clip_visible else total_frames
    tools.append(nodes.background_transparent("BG", W, H, bg_out, pos=(0, 0)))

    # Cadena de Merges (Over) en FILA horizontal: BG -> Merge1 -> ... -> MediaOut.
    # Cada word queda justo encima de su Merge -> el flujo se lee de izq. a der.
    prev = "BG"
    for i, node in enumerate(text_nodes, start=1):
        m = f"Merge{i}"
        tools.append(nodes.merge(m, prev, node, pos=(i * _COL, 0)))
        prev = m

    # MediaOut alineado en la MISMA fila, a la derecha del último Merge:
    # la conexión es una línea recta e inequívoca.
    tools.append(nodes.media_out("MediaOut1", prev, pos=((len(text_nodes) + 1) * _COL, 0)))
    # Garantía: no se emite nunca un grafo suelto o incompleto.
    return assert_connected(fa.setting(tools, "MediaOut1"))


class FreeFusionTarget:
    """Target Resolve Free: genera un .setting de Fusion."""
    name = "fusion"

    def export(self, project: Project, out_dir: Path,
               on_progress: ProgressCb | None = None) -> ExportResult:
        if on_progress:
            on_progress(0.1, "Generando composición Fusion…")
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = (project.id or "subtitles")
        path = out_dir / f"{stem}.setting"
        path.write_text(generate_comp(project), encoding="utf-8")
        if on_progress:
            on_progress(1.0, "Composición Fusion lista.")
        return ExportResult(
            method="fusion",
            files=[str(path)],
            message="Composición Fusion generada.",
            install_hint=("Crea un clip Fusion que cubra el vídeo, entra en la página Fusion, "
                          "y pega el contenido del .setting; conecta el último Merge a MediaOut1. "
                          "O instálalo como plantilla en Templates/Edit/Titles y reinicia Resolve."),
        )


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) >= 3:
        proj = Project.from_dict(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
        Path(sys.argv[2]).write_text(generate_comp(proj), encoding="utf-8")
        print(f"OK -> {sys.argv[2]}")
    else:
        print("uso: python -m app.resolve.free_fusion <project.json> <out.setting>")
