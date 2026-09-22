"""Piezas comunes de la biblioteca de plantillas.

``Template`` describe una composición EDITABLE parametrizable. Vive aquí (y no en
``__init__``) para que ``visual.py`` pueda registrarse sin import circular.

Dirección visual (§14 de la spec de "Generar recurso"): minimalista, limpia,
editorial y moderna. Fondo CLARO por defecto, con variante oscura sobria
disponible por ``params.theme``; nunca neón, glow fuerte ni interfaces falsas.
Los tokens vienen de ``themes.py``.

Contrato del bloque ``js`` (lo aplica el runtime y lo exige el validador):
- Es el CUERPO de una función ``(tl, root, gsap, ctx)``.
- SIEMPRE ``tl.fromTo(...)``; nunca ``tl.from()``/``tl.to()`` para entradas, o el
  preview se rebobina mal y a la segunda pasada los elementos quedan invisibles.
- Nada de ``Date.now``/``Math.random``: el render debe ser determinista.
"""
from __future__ import annotations

import html as _html
from dataclasses import dataclass, field
from typing import Any, Callable

from .. import themes
from ..models import MotionComposition, MotionLayer


@dataclass
class Template:
    key: str
    name: str
    category: str            # text | list | social | news | data | diagram | cinematic | asset | time
    description: str
    parameters: dict[str, Any]
    build: Callable[[str, dict[str, Any]], MotionComposition] = field(repr=False)
    # --- metadatos para que la IA ELIJA plantilla en vez de inventar (§13/§16) ---
    tags: list[str] = field(default_factory=list)
    best_for: str = ""                                  # cuándo usarla, en una línea
    slots: dict[str, str] = field(default_factory=dict)  # contenido dinámico que acepta
    accepts_images: bool = False                        # puede incrustar PNG del material (§15)


def p_(params: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    """Mezcla ``params`` sobre ``defaults`` ignorando los None."""
    out = dict(defaults)
    for k, v in (params or {}).items():
        if v is not None:
            out[k] = v
    return out


def theme_of(p: dict[str, Any]) -> dict:
    return themes.resolve_theme(p.get("theme"), accent=p.get("accent"))


def esc(v: Any) -> str:
    return _html.escape(str(v if v is not None else ""))


# --- Assets del proyecto (§15: los PNG son protagonistas) ----------------------

def img_src(value: Any) -> str:
    """Normaliza la referencia de imagen de un item a algo que el runtime resuelva.

    El generador sustituye ``asset:image/<id>`` por un data URI, así que un id de
    material del proyecto basta. Se respetan URLs y data URIs ya formadas.
    """
    v = str(value or "").strip()
    if not v:
        return ""
    if v.startswith(("asset:image/", "data:", "http://", "https://", "/")):
        return v
    return f"asset:image/{v}"


def monogram(label: str) -> str:
    """Inicial para el hueco de un item sin imagen (nunca dibujamos un logo falso)."""
    t = (label or "").strip()
    return esc(t[0].upper()) if t else "•"


def media_html(item: dict, *, cls: str = "mt-media") -> str:
    """Hueco visual de un item: su PNG real si lo hay, si no un monograma sobrio."""
    src = img_src(item.get("image"))
    if src:
        return f'<span class="{cls}"><img src="{esc(src)}" alt=""></span>'
    return f'<span class="{cls} is-mono"><b>{monogram(item.get("label"))}</b></span>'


def items_of(raw: Any, *, limit: int = 6, fallback: list[dict] | None = None) -> list[dict]:
    """Normaliza ``items`` a ``[{label, sublabel, image, value}]``.

    Acepta una lista de strings (``["ChatGPT", "Claude"]``) o de objetos, que es
    como la IA rellena la plantilla (§12).
    """
    def normalize(source: Any) -> list[dict]:
        out: list[dict] = []
        for raw_item in (source if isinstance(source, list) else []):
            if isinstance(raw_item, str):
                item: dict = {"label": raw_item}
            elif isinstance(raw_item, dict):
                item = dict(raw_item)
            else:
                continue
            label = str(item.get("label") or item.get("text") or item.get("name") or "").strip()
            if not label and not item.get("image"):
                continue
            out.append({
                "label": label,
                "sublabel": str(item.get("sublabel") or item.get("sub")
                                or item.get("caption") or "").strip(),
                "image": item.get("image") or item.get("asset") or item.get("asset_id") or "",
                "value": item.get("value"),
            })
            if len(out) >= limit:
                break
        return out

    # El fallback pasa por la MISMA normalización: si no, a una plantilla le
    # llegaría un item sin 'sublabel'/'image' y reventaría al formatear.
    return normalize(raw) or normalize(fallback)


def num(value: Any, default: float = 0.0) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return f if f == f else default   # NaN → default


# --- CSS base compartido -------------------------------------------------------

# Lienzo de DISEÑO: las plantillas se maquetan en px sobre 720x1280 y se escalan
# al formato real. Sin esto un 1080x1920 saldría con todo un tercio más pequeño y
# un 16:9 no cabría de alto.
DESIGN_W = 720
DESIGN_H = 1280
# Ancho máximo del contenido en formatos apaisados/cuadrados (en px de diseño).
CONTENT_MAX_W = 820


def design_box(width: int, height: int) -> tuple[float, float, float]:
    """``(k, box_w, box_h)``: escala y tamaño del lienzo de diseño que, escalado
    por ``k``, cubre exactamente ``width x height``. Se ajusta a la dimensión que
    más limita, así un 16:9 conserva el alto de diseño y gana ancho."""
    k = min(width / DESIGN_W, height / DESIGN_H)
    return k, width / k, height / k


def line_color(th: dict) -> str:
    """Color de conectores (flechas, radios, ejes): más marcado que un borde."""
    return th.get("line") or th["muted"]


def base_css(th: dict, *, opaque: bool, width: int = DESIGN_W, height: int = DESIGN_H) -> str:
    """Reset y tokens comunes. ``opaque`` pinta el lienzo (escena que tapa el vídeo);
    si no, la plantilla es un overlay transparente sobre la imagen."""
    page = f"background:{th['bg']};" if opaque else "background:transparent;"
    k, bw, bh = design_box(width, height)
    return f"""
.mt{{position:absolute;left:0;top:0;width:{bw:.2f}px;height:{bh:.2f}px;
  transform:scale({k:.5f});transform-origin:0 0;box-sizing:border-box;{page}
  font-family:{th['font_body']};color:{th['text']};
  display:flex;flex-direction:column;justify-content:center;}}
.mt-flow{{align-items:center;}}
.mt-flow > *{{width:100%;max-width:{CONTENT_MAX_W}px;}}
.mt *{{box-sizing:border-box;}}
.mt-kicker{{font-family:{th['font_body']};font-weight:700;font-size:34px;letter-spacing:5px;
  text-transform:uppercase;color:{th['accent_ink']};}}
.mt-title{{font-family:{th['font_display']};font-weight:800;font-size:64px;line-height:1.06;
  letter-spacing:-1px;color:{th['text']};}}
.mt-sub{{font-family:{th['font_body']};font-weight:600;font-size:36px;color:{th['muted']};}}
.mt-media{{display:flex;align-items:center;justify-content:center;overflow:hidden;
  border-radius:{max(8, int(th['radius']) - 4)}px;background:transparent;flex:0 0 auto;}}
.mt-media img{{width:100%;height:100%;object-fit:contain;display:block;}}
.mt-media.is-mono{{background:{th['accent']};color:{th['accent_text']};
  font-family:{th['font_display']};font-weight:800;}}
.mt-card{{background:{th['surface']};border:1px solid {th['border']};
  border-radius:{th['radius']}px;box-shadow:{th['shadow']};}}
"""


def full_layer(layer_id: str, width: int, height: int, markup: str, css: str,
               js: str) -> MotionLayer:
    """Capa html a lienzo completo. Origen ARRIBA-IZQUIERDA (x=0,y=0): centrarla
    con x=W/2 empujaría el contenido fuera de cuadro."""
    return MotionLayer(id=layer_id, type="html", x=0, y=0, width=width, height=height,
                       html=markup, css=css, js=js)


def composition(comp_id: str, name: str, key: str, th: dict, p: dict, *,
                markup: str, css: str, js: str, opaque: bool = False,
                flow: bool = True) -> MotionComposition:
    """Envuelve un bloque html en una composición lista para el editor.

    ``flow`` = maqueta en columna centrada (casi todas). Las plantillas que
    posicionan en absoluto sobre el lienzo (anotación) van con ``flow=False``.
    """
    W, H = int(p["width"]), int(p["height"])
    if flow:
        markup = markup.replace('class="mt ', 'class="mt mt-flow ', 1)
    css_all = base_css(th, opaque=opaque, width=W, height=H) + css
    return MotionComposition(
        id=comp_id, name=name, width=W, height=H, fps=30,
        duration=max(0.5, float(p["duration"])),
        background=th["bg"] if opaque else "transparent",
        metadata={"template": key, "theme": th},
        layers=[full_layer(key.replace("-", "_"), W, H, markup, css_all, js)],
    )
