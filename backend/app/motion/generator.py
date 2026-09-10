"""Composition Generator: ``MotionComposition`` → HTML/CSS/GSAP autocontenido.

El MISMO HTML se usa para el preview en el navegador (iframe) y para el render
determinista (Playwright), lo que garantiza paridad visual (spec §6/§7/§19).
Todo va inline (GSAP, runtime, fuente) para que la página sea reproducible sin
red y bit a bit idéntica en ambos contextos.
"""
from __future__ import annotations

import base64
import json
from functools import lru_cache
from pathlib import Path

from .models import MotionComposition

_DIR = Path(__file__).parent
_GSAP = _DIR / "vendor" / "gsap.min.js"
_RUNTIME = _DIR / "runtime.js"
_FONT = _DIR.parent / "fonts" / "Anton-Regular.ttf"


@lru_cache(maxsize=1)
def _gsap_src() -> str:
    return _GSAP.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _runtime_src() -> str:
    return _RUNTIME.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _anton_data_uri() -> str:
    try:
        raw = _FONT.read_bytes()
    except OSError:
        return ""
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:font/ttf;base64,{b64}"


def _css(comp: MotionComposition) -> str:
    bg = "transparent" if comp.background == "transparent" else comp.background
    font_uri = _anton_data_uri()
    font_face = (
        f"@font-face{{font-family:'Anton';src:url('{font_uri}') format('truetype');"
        "font-weight:400;font-style:normal;font-display:block;}"
        if font_uri else ""
    )
    return f"""
{font_face}
*{{margin:0;padding:0;box-sizing:border-box;}}
html,body{{background:transparent;overflow:hidden;}}
#stage{{position:relative;width:{comp.width}px;height:{comp.height}px;
  background:{bg};overflow:hidden;transform-origin:top left;}}
.mg-layer{{position:absolute;}}
.mg-center{{position:absolute;transform:translate(-50%,-50%);
  will-change:transform,opacity;}}
.mg-anim{{display:inline-block;}}
.mg-text{{white-space:pre-wrap;display:inline-block;width:max-content;}}
.mg-circle,.mg-rect{{display:inline-block;}}
.mg-circle{{border-radius:50%;}}
.mg-linewrap{{position:absolute;top:0;left:0;}}
.mg-line{{display:block;border-radius:2px;}}
.mg-dot{{position:absolute;top:0;left:0;border-radius:50%;background:#fff;
  box-shadow:0 0 10px #bfefff;}}
"""


def generate_html(comp: MotionComposition) -> str:
    """Devuelve el documento HTML completo y autocontenido de la composición."""
    comp_json = json.dumps(comp.model_dump(), ensure_ascii=False)
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{comp.name}</title>
<style>{_css(comp)}</style>
</head>
<body>
<div id="stage"></div>
<script>{_gsap_src()}</script>
<script>window.__COMP = {comp_json};</script>
<script>{_runtime_src()}</script>
</body>
</html>"""
