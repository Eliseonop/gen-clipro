"""Plantillas VISUALES reutilizables (§11-§16): el recurso es la composición, no el texto.

Cada plantilla es una estructura que RECIBE CONTENIDO (``items``, ``data``,
``steps``, imágenes del material) y decide cómo presentarlo y animarlo. La IA
elige plantilla y rellena los huecos en vez de inventar HTML desde cero; solo si
ninguna encaja se genera una composición libre.

Estética: minimalista, editorial y clara (fondo claro por defecto, variante
oscura sobria por ``params.theme``). Movimiento legible: caída con gravedad y
asentamiento corto, revelados y trazos que se dibujan. Nada de neón ni cyberpunk.

Los PNG del material se referencian como ``asset:image/<id>`` y el generador los
incrusta; una plantilla NUNCA dibuja un logo falso: si falta la imagen, pone un
monograma sobrio.
"""
from __future__ import annotations

from typing import Any

from ..models import MotionComposition
from .base import (
    Template, composition, design_box, esc, items_of, line_color, media_html, num, p_, theme_of,
)

# Reparto del tiempo: cabecera, entrada escalonada y aire final.
_HEAD_IN = 0.45
_TAIL = 0.35

_DEMO_ITEMS = [{"label": "ChatGPT", "sublabel": "", "image": "", "value": None},
               {"label": "Claude", "sublabel": "", "image": "", "value": None},
               {"label": "Gemini", "sublabel": "", "image": "", "value": None}]


def _head(p: dict) -> str:
    """Cabecera opcional: antetítulo + título. Poco texto, mucha jerarquía."""
    kicker = str(p.get("kicker") or "").strip()
    title = str(p.get("title") or "").strip()
    if not kicker and not title:
        return ""
    parts = ['<div class="mt-head">']
    if kicker:
        parts.append(f'<div class="mt-kicker">{esc(kicker)}</div>')
    if title:
        parts.append(f'<div class="mt-title">{esc(title)}</div>')
    parts.append("</div>")
    return "".join(parts)


_HEAD_CSS = ".mt-head{display:flex;flex-direction:column;gap:14px;}"


def _head_js(delay: float = 0.0) -> str:
    return ("var head = root.querySelector('.mt-head');"
            "if (head) tl.fromTo(head, {autoAlpha:0, y:-18}, "
            f"{{autoAlpha:1, y:0, duration:0.5, ease:'power2.out'}}, {delay});")


def _stagger_js(selector: str, *, start: float) -> str:
    """Paso entre entradas, derivado de la duración real (determinista, sin random)."""
    return (f"var els = root.querySelectorAll('{selector}');"
            f"var free = Math.max(0.4, ctx.duration - {start} - {_TAIL});"
            "var step = Math.min(0.55, free / Math.max(1, els.length));")


# --- LISTAS --------------------------------------------------------------------

def _stack_list(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Lista apilada: cada item CAE desde arriba y se asienta ENCIMA del anterior.

    La pila crece de abajo arriba (column-reverse): el primer item es la base, así
    cada caída atraviesa hueco vacío y nunca pasa por delante de una tarjeta ya puesta.
    """
    p = p_(params, {"kicker": "", "title": "", "items": None, "theme": None, "accent": None,
                    "duration": 6.0, "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    items = items_of(p["items"], limit=6, fallback=_DEMO_ITEMS)
    rows = "".join(
        f'<li class="sl-item mt-card">{media_html(it)}'
        f'<span class="sl-txt"><b>{esc(it["label"])}</b>'
        + (f'<em>{esc(it["sublabel"])}</em>' if it["sublabel"] else "")
        + "</span></li>"
        for it in items)
    markup = f'<div class="mt sl">{_head(p)}<ul class="sl-items">{rows}</ul></div>'
    css = _HEAD_CSS + f"""
.sl{{padding:72px 58px;gap:52px;}}
.sl-items{{list-style:none;display:flex;flex-direction:column-reverse;gap:26px;margin:0;padding:0;}}
.sl-item{{display:flex;align-items:center;gap:30px;padding:28px 34px;}}
.sl-item .mt-media{{width:104px;height:104px;font-size:46px;border-radius:24px;}}
.sl-txt{{display:flex;flex-direction:column;gap:6px;min-width:0;}}
.sl-txt b{{font-family:{th['font_display']};font-weight:800;font-size:54px;
  letter-spacing:-0.5px;color:{th['text']};}}
.sl-txt em{{font-style:normal;font-weight:600;font-size:34px;color:{th['muted']};}}
"""
    js = _head_js() + _stagger_js(".sl-item", start=_HEAD_IN) + f"""
els.forEach(function (el, i) {{
  var t = {_HEAD_IN} + i * step;
  var fall = Math.min(0.46, step * 1.5);
  tl.fromTo(el, {{autoAlpha: 0, y: -170}},
    {{autoAlpha: 1, y: 0, duration: fall, ease: 'power3.in'}}, t);
  tl.fromTo(el, {{scaleY: 0.86, scaleX: 1.05}},
    {{scaleY: 1, scaleX: 1, duration: 0.28, ease: 'power2.out', transformOrigin: '50% 100%'}},
    t + fall);
}});
"""
    return composition(comp_id, "Lista apilada", "stack_list", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


def _card_grid(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Cuadrícula: los items entran y ocupan su posición (composición limpia tipo grid)."""
    p = p_(params, {"kicker": "", "title": "", "items": None, "columns": 2, "theme": None,
                    "accent": None, "duration": 5.5, "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    items = items_of(p["items"], limit=8, fallback=_DEMO_ITEMS)
    cols = max(2, min(3, int(num(p["columns"], 2))))
    cells = "".join(
        f'<li class="cg-cell mt-card">{media_html(it)}'
        f'<span class="cg-label">{esc(it["label"])}</span>'
        + (f'<span class="cg-sub">{esc(it["sublabel"])}</span>' if it["sublabel"] else "")
        + "</li>"
        for it in items)
    markup = f'<div class="mt cg">{_head(p)}<ul class="cg-grid">{cells}</ul></div>'
    css = _HEAD_CSS + f"""
.cg{{padding:72px 50px;gap:56px;}}
.cg-grid{{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat({cols}, 1fr);gap:28px;}}
.cg-cell{{display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:18px;padding:40px 24px;text-align:center;}}
.cg-cell .mt-media{{width:130px;height:130px;font-size:56px;border-radius:26px;}}
.cg-label{{font-family:{th['font_display']};font-weight:800;font-size:42px;
  letter-spacing:-0.3px;color:{th['text']};}}
.cg-sub{{font-weight:600;font-size:30px;color:{th['muted']};}}
"""
    js = _head_js() + _stagger_js(".cg-cell", start=_HEAD_IN) + f"""
els.forEach(function (el, i) {{
  tl.fromTo(el, {{autoAlpha: 0, y: 46, scale: 0.94}},
    {{autoAlpha: 1, y: 0, scale: 1, duration: Math.min(0.6, step * 2.2), ease: 'power3.out'}},
    {_HEAD_IN} + i * step);
}});
"""
    return composition(comp_id, "Cuadrícula", "card_grid", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


def _sequence_rows(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Filas editoriales: entran desde la izquierda con una regla fina que se dibuja."""
    p = p_(params, {"kicker": "", "title": "", "items": None, "numbered": True, "theme": None,
                    "accent": None, "duration": 6.0, "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    items = items_of(p["items"], limit=6, fallback=_DEMO_ITEMS)
    numbered = bool(p["numbered"])
    rows = "".join(
        '<li class="sq-row">'
        + (f'<span class="sq-n">{i + 1:02d}</span>' if numbered else "")
        + f'<span class="sq-txt"><b>{esc(it["label"])}</b>'
        + (f'<em>{esc(it["sublabel"])}</em>' if it["sublabel"] else "")
        + '</span><span class="sq-rule"></span></li>'
        for i, it in enumerate(items))
    markup = f'<div class="mt sq">{_head(p)}<ul class="sq-rows">{rows}</ul></div>'
    css = _HEAD_CSS + f"""
.sq{{padding:80px 58px;gap:54px;}}
.sq-rows{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:34px;}}
.sq-row{{position:relative;display:flex;align-items:baseline;gap:26px;padding-bottom:26px;}}
.sq-n{{font-family:{th['font_display']};font-weight:800;font-size:34px;color:{th['accent_ink']};
  letter-spacing:1px;flex:0 0 auto;}}
.sq-txt{{display:flex;flex-direction:column;gap:8px;min-width:0;}}
.sq-txt b{{font-family:{th['font_display']};font-weight:800;font-size:52px;
  letter-spacing:-0.5px;color:{th['text']};line-height:1.1;}}
.sq-txt em{{font-style:normal;font-weight:600;font-size:32px;color:{th['muted']};}}
.sq-rule{{position:absolute;left:0;right:0;bottom:0;height:2px;background:{th['border']};
  transform-origin:0% 50%;}}
"""
    js = _head_js() + _stagger_js(".sq-row", start=_HEAD_IN) + f"""
els.forEach(function (el, i) {{
  var t = {_HEAD_IN} + i * step;
  tl.fromTo(el.querySelectorAll('.sq-n, .sq-txt'), {{autoAlpha: 0, x: -34}},
    {{autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out'}}, t);
  tl.fromTo(el.querySelector('.sq-rule'), {{scaleX: 0}},
    {{scaleX: 1, duration: 0.55, ease: 'power2.inOut'}}, t + 0.1);
}});
"""
    return composition(comp_id, "Filas editoriales", "sequence_rows", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- COMPARACIONES -------------------------------------------------------------

def _versus(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Cara a cara: dos columnas que entran desde los lados con un divisor que se dibuja."""
    p = p_(params, {"kicker": "", "title": "", "left": None, "right": None, "divider": "VS",
                    "theme": None, "accent": None, "duration": 5.5,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    pair = items_of([p["left"] or {"label": "Opción A"}, p["right"] or {"label": "Opción B"}],
                    limit=2, fallback=[{"label": "Opción A"}, {"label": "Opción B"}])
    left, right = pair[0], (pair[1] if len(pair) > 1 else pair[0])

    def side(it: dict, cls: str) -> str:
        return (f'<div class="vs-side {cls} mt-card">{media_html(it)}'
                f'<div class="vs-label">{esc(it["label"])}</div>'
                + (f'<div class="vs-sub">{esc(it["sublabel"])}</div>' if it["sublabel"] else "")
                + "</div>")

    divider = str(p["divider"] or "").strip()
    mid = f'<div class="vs-mid"><span class="vs-line"></span>' \
          + (f'<span class="vs-tag">{esc(divider)}</span>' if divider else "") \
          + '<span class="vs-line"></span></div>'
    markup = (f'<div class="mt vs">{_head(p)}'
              f'<div class="vs-body">{side(left, "is-left")}{mid}{side(right, "is-right")}</div></div>')
    css = _HEAD_CSS + f"""
.vs{{padding:72px 58px;gap:48px;}}
.vs-body{{display:flex;flex-direction:column;align-items:stretch;gap:20px;}}
.vs-side{{display:flex;flex-direction:column;align-items:center;gap:20px;
  padding:48px 32px;text-align:center;}}
.vs-side .mt-media{{width:150px;height:150px;font-size:64px;border-radius:30px;}}
.vs-label{{font-family:{th['font_display']};font-weight:800;font-size:56px;
  letter-spacing:-0.6px;color:{th['text']};line-height:1.08;}}
.vs-sub{{font-weight:600;font-size:32px;color:{th['muted']};}}
.vs-mid{{display:flex;align-items:center;gap:22px;padding:6px 0;}}
.vs-line{{flex:1;height:2px;background:{line_color(th)};transform-origin:50% 50%;}}
.vs-tag{{font-family:{th['font_display']};font-weight:800;font-size:38px;letter-spacing:3px;
  color:{th['accent_text']};background:{th['accent']};padding:12px 26px;border-radius:999px;}}
"""
    js = _head_js() + f"""
tl.fromTo(root.querySelector('.is-left'), {{autoAlpha: 0, x: -70}},
  {{autoAlpha: 1, x: 0, duration: 0.6, ease: 'power3.out'}}, 0.35);
tl.fromTo(root.querySelector('.is-right'), {{autoAlpha: 0, x: 70}},
  {{autoAlpha: 1, x: 0, duration: 0.6, ease: 'power3.out'}}, 0.5);
tl.fromTo(root.querySelectorAll('.vs-line'), {{scaleX: 0}},
  {{scaleX: 1, duration: 0.5, ease: 'power2.inOut'}}, 0.75);
var tag = root.querySelector('.vs-tag');
if (tag) tl.fromTo(tag, {{autoAlpha: 0, scale: 0.7}},
  {{autoAlpha: 1, scale: 1, duration: 0.42, ease: 'power2.out'}}, 0.85);
"""
    return composition(comp_id, "Comparación (cara a cara)", "versus", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


def _before_after(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Antes / después: el panel derecho se revela con un barrido sobre el izquierdo."""
    p = p_(params, {"kicker": "", "title": "", "before": None, "after": None,
                    "before_label": "ANTES", "after_label": "DESPUÉS",
                    "theme": None, "accent": None, "duration": 5.0,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    pair = items_of([p["before"] or {"label": "Estado inicial"}, p["after"] or {"label": "Resultado"}],
                    limit=2, fallback=[{"label": "Antes"}, {"label": "Después"}])
    before, after = pair[0], (pair[1] if len(pair) > 1 else pair[0])

    def panel(it: dict, tag: str, cls: str) -> str:
        return (f'<div class="ba-panel {cls} mt-card">'
                f'<span class="ba-tag">{esc(tag)}</span>{media_html(it)}'
                f'<div class="ba-label">{esc(it["label"])}</div>'
                + (f'<div class="ba-sub">{esc(it["sublabel"])}</div>' if it["sublabel"] else "")
                + "</div>")

    markup = (f'<div class="mt ba">{_head(p)}<div class="ba-body">'
              f'{panel(before, str(p["before_label"]), "is-before")}'
              f'{panel(after, str(p["after_label"]), "is-after")}</div></div>')
    css = _HEAD_CSS + f"""
.ba{{padding:72px 58px;gap:48px;}}
.ba-body{{display:flex;flex-direction:column;gap:30px;}}
.ba-panel{{position:relative;display:flex;flex-direction:column;align-items:center;gap:18px;
  padding:52px 32px 42px;text-align:center;overflow:hidden;}}
.ba-panel .mt-media{{width:150px;height:150px;font-size:64px;border-radius:30px;}}
.ba-tag{{font-weight:800;font-size:28px;letter-spacing:4px;color:{th['muted']};}}
.is-after .ba-tag{{color:{th['accent_ink']};}}
.ba-label{{font-family:{th['font_display']};font-weight:800;font-size:50px;
  letter-spacing:-0.5px;color:{th['text']};line-height:1.1;}}
.ba-sub{{font-weight:600;font-size:30px;color:{th['muted']};}}
"""
    js = _head_js() + f"""
tl.fromTo(root.querySelector('.is-before'), {{autoAlpha: 0, y: 34}},
  {{autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out'}}, 0.3);
tl.fromTo(root.querySelector('.is-after'),
  {{autoAlpha: 0, clipPath: 'inset(0% 100% 0% 0%)'}},
  {{autoAlpha: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'power2.inOut'}}, 0.75);
tl.fromTo(root.querySelectorAll('.is-after .ba-label, .is-after .ba-sub'),
  {{autoAlpha: 0, y: 16}},
  {{autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out'}}, 1.15);
"""
    return composition(comp_id, "Antes / después", "before_after", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- DIAGRAMAS -----------------------------------------------------------------

def _flow_steps(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Proceso: cajas encadenadas por flechas que se dibujan una tras otra."""
    p = p_(params, {"kicker": "", "title": "", "steps": None, "orientation": "auto",
                    "theme": None, "accent": None, "duration": 6.5,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    steps = items_of(p["steps"], limit=5,
                     fallback=[{"label": "Entrada"}, {"label": "Proceso"}, {"label": "Resultado"}])
    orientation = str(p["orientation"]).strip().lower()
    # "auto": en vertical (9:16) la cadena baja; en apaisado va de izquierda a derecha.
    horizontal = (orientation.startswith("h") if orientation in ("horizontal", "vertical", "h", "v")
                  else int(p["width"]) > int(p["height"]))

    nodes = []
    for i, it in enumerate(steps):
        if i:
            nodes.append('<div class="fl-link"><span class="fl-stem"></span>'
                         '<span class="fl-head-arrow"></span></div>')
        media = media_html(it) if it.get("image") else ""
        nodes.append(
            f'<div class="fl-node mt-card">{media}'
            f'<div class="fl-label">{esc(it["label"])}</div>'
            + (f'<div class="fl-sub">{esc(it["sublabel"])}</div>' if it["sublabel"] else "")
            + "</div>")
    # En horizontal cada caja tiene el ancho que deje el lienzo: el cuerpo de letra se
    # ajusta para que la palabra más larga quepa entera (nunca "Velo-cida-d").
    _, box_w, _ = design_box(int(p["width"]), int(p["height"]))
    content_w = min(box_w - 116, 1500)
    link_w = 74 if content_w > 900 else 40
    per_node = (content_w - link_w * (len(steps) - 1)) / len(steps) - 40
    longest = max((len(w) for it in steps for w in it["label"].split()), default=1)
    h_font = max(18, min(38, int(per_node / (max(1, longest) * 0.62))))
    markup = (f'<div class="mt fl {"is-h" if horizontal else "is-v"}">{_head(p)}'
              f'<div class="fl-body">{"".join(nodes)}</div></div>')
    arrow = th["accent_ink"]
    css = _HEAD_CSS + f"""
.fl{{padding:72px 58px;gap:48px;}}
.fl-body{{display:flex;align-items:center;justify-content:center;gap:10px;}}
.fl.is-v .fl-body{{flex-direction:column;}}
.fl.is-h .fl-body{{flex-direction:row;}}
.fl-node{{display:flex;flex-direction:column;align-items:center;gap:14px;
  padding:34px 30px;text-align:center;min-width:46%;}}
.fl.is-h .fl-body{{max-width:1500px;}}
.fl.is-h .fl-node{{min-width:0;flex:1 1 0;padding:30px 20px;}}
.fl.is-h .fl-label{{font-size:{h_font}px;overflow-wrap:break-word;}}
.fl-node .mt-media{{width:96px;height:96px;font-size:42px;border-radius:22px;}}
.fl-label{{font-family:{th['font_display']};font-weight:800;font-size:44px;
  letter-spacing:-0.4px;color:{th['text']};line-height:1.12;}}
.fl-sub{{font-weight:600;font-size:28px;color:{th['muted']};}}
.fl-link{{display:flex;align-items:center;justify-content:center;flex:0 0 auto;}}
.fl.is-v .fl-link{{flex-direction:column;height:74px;}}
.fl.is-h .fl-link{{flex-direction:row;width:{link_w}px;}}
.fl.is-v .fl-stem{{width:3px;flex:1;background:{arrow};transform-origin:50% 0%;}}
.fl.is-h .fl-stem{{height:3px;flex:1;background:{arrow};transform-origin:0% 50%;}}
.fl.is-v .fl-head-arrow{{width:0;height:0;border-left:11px solid transparent;
  border-right:11px solid transparent;border-top:15px solid {arrow};}}
.fl.is-h .fl-head-arrow{{width:0;height:0;border-top:11px solid transparent;
  border-bottom:11px solid transparent;border-left:15px solid {arrow};}}
"""
    axis = "scaleY" if not horizontal else "scaleX"
    js = _head_js() + f"""
var nodes = root.querySelectorAll('.fl-node');
var links = root.querySelectorAll('.fl-link');
var free = Math.max(0.6, ctx.duration - {_HEAD_IN} - {_TAIL});
var step = Math.min(0.85, free / Math.max(1, nodes.length));
nodes.forEach(function (el, i) {{
  var t = {_HEAD_IN} + i * step;
  tl.fromTo(el, {{autoAlpha: 0, y: 30, scale: 0.96}},
    {{autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out'}}, t);
  var link = links[i];
  if (link) {{
    tl.fromTo(link.querySelector('.fl-stem'), {{{axis}: 0}},
      {{{axis}: 1, duration: Math.min(0.42, step * 0.6), ease: 'power2.inOut'}}, t + 0.42);
    tl.fromTo(link.querySelector('.fl-head-arrow'), {{autoAlpha: 0, scale: 0.6}},
      {{autoAlpha: 1, scale: 1, duration: 0.24, ease: 'power2.out'}}, t + 0.42 + Math.min(0.42, step * 0.6));
  }}
}});
"""
    return composition(comp_id, "Proceso / flujo", "flow_steps", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


def _decision_tree(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Árbol: un nodo raíz se abre en ramas que se dibujan hacia sus hojas."""
    p = p_(params, {"kicker": "", "title": "", "root": "Pregunta", "branches": None,
                    "theme": None, "accent": None, "duration": 6.0,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    branches = items_of(p["branches"], limit=4,
                        fallback=[{"label": "Sí"}, {"label": "No"}])
    leaves = "".join(
        f'<div class="dt-leaf mt-card"><div class="dt-leaf-label">{esc(it["label"])}</div>'
        + (f'<div class="dt-leaf-sub">{esc(it["sublabel"])}</div>' if it["sublabel"] else "")
        + "</div>"
        for it in branches)
    stems = "".join('<span class="dt-stem"></span>' for _ in branches)
    # Con space-around, el centro de la rama i está en (2i+1)/(2n): la barra va
    # del centro de la primera al de la última.
    edge = 100 / (2 * len(branches))
    markup = (f'<div class="mt dt">{_head(p)}<div class="dt-body">'
              f'<div class="dt-root mt-card">{esc(p["root"])}</div>'
              f'<div class="dt-trunk"></div>'
              f'<div class="dt-fork"><span class="dt-bar" style="left:{edge:.2f}%;right:{edge:.2f}%"></span>'
              f'<div class="dt-stems">{stems}</div></div>'
              f'<div class="dt-leaves">{leaves}</div></div></div>')
    line = line_color(th)
    css = _HEAD_CSS + f"""
.dt{{padding:72px 50px;gap:44px;}}
.dt-body{{display:flex;flex-direction:column;align-items:center;}}
.dt-root{{padding:32px 44px;font-family:{th['font_display']};font-weight:800;font-size:48px;
  letter-spacing:-0.4px;color:{th['text']};text-align:center;max-width:82%;line-height:1.12;}}
.dt-trunk{{width:3px;height:64px;background:{line};transform-origin:50% 0%;}}
.dt-fork{{position:relative;width:100%;}}
.dt-bar{{position:absolute;top:0;height:3px;background:{line};transform-origin:50% 50%;}}
.dt-stems{{display:flex;width:100%;justify-content:space-around;align-items:flex-start;}}
.dt-stem{{width:3px;height:54px;background:{line};transform-origin:50% 0%;}}
.dt-leaves{{display:flex;width:100%;justify-content:space-around;gap:18px;align-items:stretch;}}
.dt-leaf{{flex:1;padding:30px 20px;text-align:center;display:flex;flex-direction:column;gap:10px;
  justify-content:center;}}
.dt-leaf-label{{font-family:{th['font_display']};font-weight:800;font-size:40px;
  color:{th['accent_ink']};line-height:1.12;}}
.dt-leaf-sub{{font-weight:600;font-size:27px;color:{th['muted']};line-height:1.2;}}
"""
    js = _head_js() + f"""
tl.fromTo(root.querySelector('.dt-root'), {{autoAlpha: 0, y: -26}},
  {{autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out'}}, 0.3);
tl.fromTo(root.querySelector('.dt-trunk'), {{scaleY: 0}},
  {{scaleY: 1, duration: 0.4, ease: 'power2.inOut'}}, 0.8);
var bar = root.querySelector('.dt-bar');
if (root.querySelectorAll('.dt-stem').length > 1) {{
  tl.fromTo(bar, {{scaleX: 0}}, {{scaleX: 1, duration: 0.36, ease: 'power2.inOut'}}, 1.1);
}} else {{
  bar.style.display = 'none';
}}
tl.fromTo(root.querySelectorAll('.dt-stem'), {{scaleY: 0}},
  {{scaleY: 1, duration: 0.36, stagger: 0.12, ease: 'power2.inOut'}}, 1.4);
tl.fromTo(root.querySelectorAll('.dt-leaf'), {{autoAlpha: 0, y: 26}},
  {{autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.12, ease: 'power3.out'}}, 1.65);
"""
    return composition(comp_id, "Árbol de decisión", "decision_tree", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


def _concept_map(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Mapa conceptual: un centro y hasta 6 satélites unidos por radios que se dibujan."""
    p = p_(params, {"kicker": "", "title": "", "center": "Concepto", "items": None,
                    "theme": None, "accent": None, "duration": 6.5,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    items = items_of(p["items"], limit=6,
                     fallback=[{"label": "Idea A"}, {"label": "Idea B"}, {"label": "Idea C"}])
    n = len(items)
    # Geometría en un lienzo cuadrado virtual de 100x100 (%): centro + corona.
    import math
    nodes, spokes = [], []
    for i, it in enumerate(items):
        ang = -math.pi / 2 + (2 * math.pi * i / n)
        cx, cy = 50 + 36 * math.cos(ang), 50 + 36 * math.sin(ang)
        length = math.hypot(36 * math.cos(ang), 36 * math.sin(ang))
        deg = math.degrees(ang)
        spokes.append(
            f'<span class="cm-spoke" style="left:50%;top:50%;width:{length}%;'
            f'transform:rotate({deg:.2f}deg)"></span>')
        nodes.append(
            f'<div class="cm-node mt-card" style="left:{cx:.2f}%;top:{cy:.2f}%">'
            f'{media_html(it) if it.get("image") else ""}'
            f'<span>{esc(it["label"])}</span></div>')
    markup = (f'<div class="mt cm">{_head(p)}<div class="cm-body">{"".join(spokes)}'
              f'<div class="cm-center mt-card">{esc(p["center"])}</div>'
              f'{"".join(nodes)}</div></div>')
    css = _HEAD_CSS + f"""
.cm{{padding:58px 44px;gap:36px;}}
.cm-body{{position:relative;width:100%;aspect-ratio:1/1;}}
.cm-spoke{{position:absolute;height:3px;background:{line_color(th)};
  transform-origin:0% 50%;}}
.cm-center{{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  padding:26px 32px;max-width:40%;text-align:center;
  font-family:{th['font_display']};font-weight:800;font-size:40px;line-height:1.1;
  color:{th['accent_text']};background:{th['accent']};border-color:transparent;}}
.cm-node{{position:absolute;transform:translate(-50%,-50%);padding:18px 22px;max-width:32%;
  display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;
  font-family:{th['font_display']};font-weight:700;font-size:30px;line-height:1.14;
  color:{th['text']};}}
.cm-node .mt-media{{width:64px;height:64px;font-size:28px;border-radius:16px;}}
"""
    js = _head_js() + f"""
tl.fromTo(root.querySelector('.cm-center'), {{autoAlpha: 0, scale: 0.7}},
  {{autoAlpha: 1, scale: 1, duration: 0.5, ease: 'power3.out'}}, 0.3);
var spokes = root.querySelectorAll('.cm-spoke');
var nodes = root.querySelectorAll('.cm-node');
var free = Math.max(0.5, ctx.duration - 0.9 - {_TAIL});
var step = Math.min(0.4, free / Math.max(1, nodes.length));
nodes.forEach(function (el, i) {{
  var t = 0.8 + i * step;
  tl.fromTo(spokes[i], {{scaleX: 0}},
    {{scaleX: 1, duration: 0.34, ease: 'power2.inOut'}}, t);
  tl.fromTo(el, {{autoAlpha: 0, scale: 0.8}},
    {{autoAlpha: 1, scale: 1, duration: 0.4, ease: 'power3.out'}}, t + 0.22);
}});
"""
    return composition(comp_id, "Mapa conceptual", "concept_map", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- DATOS ---------------------------------------------------------------------

def _line_graph(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Gráfico de línea minimal: el trazo SVG se dibuja y el punto final se marca."""
    p = p_(params, {"kicker": "", "title": "", "data": None, "unit": "",
                    "x_labels": None, "theme": None, "accent": None, "duration": 6.0,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    raw = p["data"] if isinstance(p["data"], list) else []
    points: list[tuple[str, float]] = []
    for d in raw[:12]:
        if isinstance(d, dict):
            points.append((str(d.get("label") or ""), num(d.get("value"), 0.0)))
        else:
            points.append(("", num(d, 0.0)))
    if len(points) < 2:
        points = [("2020", 12), ("2021", 28), ("2022", 24), ("2023", 52), ("2024", 78)]

    vals = [v for _, v in points]
    vmin, vmax = min(vals), max(vals)
    span = (vmax - vmin) or 1.0
    # Viewbox 0..1000 x 0..520, con margen para que el trazo no toque el borde.
    coords = []
    for i, (_, v) in enumerate(points):
        x = 40 + (920 * i / (len(points) - 1))
        y = 470 - (420 * (v - vmin) / span)
        coords.append((x, y))
    path = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in coords)
    area = path + f" L {coords[-1][0]:.1f} 500 L {coords[0][0]:.1f} 500 Z"
    grid = "".join(f'<line class="lg-grid" x1="40" y1="{y}" x2="960" y2="{y}"/>'
                   for y in (110, 240, 370, 500))
    dots = "".join(f'<circle class="lg-dot" cx="{x:.1f}" cy="{y:.1f}" r="9"/>'
                   for x, y in coords)
    labels = "".join(f'<span>{esc(lbl)}</span>' for lbl, _ in points)
    last_val = points[-1][1]
    unit = str(p["unit"] or "")
    markup = (f'<div class="mt lg">{_head(p)}'
              f'<div class="lg-panel mt-card">'
              f'<div class="lg-peak"><b class="lg-val" data-value="{last_val:g}" '
              f'data-unit="{esc(unit)}">0{esc(unit)}</b></div>'
              f'<svg class="lg-svg" viewBox="0 0 1000 520" preserveAspectRatio="none">'
              f'{grid}<path class="lg-area" d="{area}"/>'
              f'<path class="lg-line" d="{path}"/>{dots}</svg>'
              f'<div class="lg-x">{labels}</div></div></div>')
    css = _HEAD_CSS + f"""
.lg{{padding:72px 50px;gap:44px;}}
.lg-panel{{padding:44px 38px 34px;display:flex;flex-direction:column;gap:22px;}}
.lg-peak{{display:flex;justify-content:flex-end;}}
.lg-val{{font-family:{th['font_display']};font-weight:900;font-size:92px;line-height:1;
  letter-spacing:-2px;color:{th['accent_ink']};}}
.lg-svg{{width:100%;height:520px;overflow:visible;}}
.lg-grid{{stroke:{th['border']};stroke-width:2;}}
.lg-area{{fill:{th['accent']};opacity:0.10;}}
.lg-line{{fill:none;stroke:{th['accent_ink']};stroke-width:7;stroke-linecap:round;
  stroke-linejoin:round;}}
.lg-dot{{fill:{th['surface']};stroke:{th['accent_ink']};stroke-width:5;}}
.lg-x{{display:flex;justify-content:space-between;font-weight:600;font-size:28px;
  color:{th['muted']};}}
"""
    js = _head_js() + f"""
var line = root.querySelector('.lg-line');
var len = line.getTotalLength();
line.style.strokeDasharray = len;
tl.fromTo(root.querySelector('.lg-panel'), {{autoAlpha: 0, y: 30}},
  {{autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out'}}, 0);
var draw = Math.min(1.6, Math.max(0.8, ctx.duration * 0.35));
tl.fromTo(line, {{strokeDashoffset: len}},
  {{strokeDashoffset: 0, duration: draw, ease: 'power2.inOut'}}, 0.4);
tl.fromTo(root.querySelector('.lg-area'), {{autoAlpha: 0}},
  {{autoAlpha: 1, duration: 0.5, ease: 'power2.out'}}, 0.4 + draw * 0.5);
var dots = root.querySelectorAll('.lg-dot');
dots.forEach(function (d, i) {{
  tl.fromTo(d, {{autoAlpha: 0, scale: 0.4}},
    {{autoAlpha: 1, scale: 1, duration: 0.24, ease: 'power2.out', transformOrigin: '50% 50%'}},
    0.4 + draw * (i / Math.max(1, dots.length - 1)));
}});
var el = root.querySelector('.lg-val');
var target = parseFloat(el.getAttribute('data-value')) || 0;
var unit = el.getAttribute('data-unit') || '';
var o = {{ v: 0 }};
tl.fromTo(o, {{ v: 0 }}, {{ v: target, duration: draw, ease: 'power2.inOut',
  onUpdate: function () {{ el.textContent = Math.round(o.v) + unit; }} }}, 0.4);
tl.fromTo(root.querySelectorAll('.lg-x span'), {{autoAlpha: 0, y: 10}},
  {{autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out'}}, 0.5);
"""
    return composition(comp_id, "Gráfico de línea", "line_graph", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- TIEMPO --------------------------------------------------------------------

def _timeline_track(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Timeline histórico: un eje que se dibuja y los hitos aparecen en orden."""
    p = p_(params, {"kicker": "", "title": "", "events": None, "theme": None, "accent": None,
                    "duration": 7.0, "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    events = items_of(p["events"], limit=5,
                      fallback=[{"label": "1822", "sublabel": "Navier formula el problema"},
                                {"label": "1845", "sublabel": "Stokes completa la ecuación"},
                                {"label": "2000", "sublabel": "Problema del milenio"}])
    rows = "".join(
        f'<li class="tt-ev"><span class="tt-dot"></span>'
        f'<span class="tt-txt"><b>{esc(it["label"])}</b>'
        + (f'<em>{esc(it["sublabel"])}</em>' if it["sublabel"] else "")
        + "</span></li>"
        for it in events)
    markup = (f'<div class="mt tt">{_head(p)}<div class="tt-body">'
              f'<span class="tt-axis"></span><ul class="tt-events">{rows}</ul></div></div>')
    css = _HEAD_CSS + f"""
.tt{{padding:72px 58px;gap:48px;}}
.tt-body{{position:relative;padding-left:52px;}}
.tt-axis{{position:absolute;left:13px;top:12px;bottom:12px;width:3px;
  background:{line_color(th)};transform-origin:50% 0%;}}
.tt-events{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:46px;}}
.tt-ev{{position:relative;display:flex;align-items:flex-start;}}
.tt-dot{{position:absolute;left:-46px;top:12px;width:24px;height:24px;border-radius:50%;
  background:{th['accent']};box-shadow:0 0 0 7px {th['bg']};}}
.tt-txt{{display:flex;flex-direction:column;gap:10px;min-width:0;}}
.tt-txt b{{font-family:{th['font_display']};font-weight:800;font-size:56px;
  letter-spacing:-0.6px;color:{th['accent_ink']};line-height:1;}}
.tt-txt em{{font-style:normal;font-weight:600;font-size:34px;color:{th['text']};line-height:1.22;}}
"""
    js = _head_js() + f"""
var axis = root.querySelector('.tt-axis');
var evs = root.querySelectorAll('.tt-ev');
var free = Math.max(0.6, ctx.duration - {_HEAD_IN} - {_TAIL});
var step = Math.min(0.9, free / Math.max(1, evs.length));
tl.fromTo(axis, {{scaleY: 0}},
  {{scaleY: 1, duration: Math.min(1.2, step * evs.length), ease: 'power2.inOut'}}, {_HEAD_IN});
evs.forEach(function (el, i) {{
  var t = {_HEAD_IN} + 0.18 + i * step;
  tl.fromTo(el.querySelector('.tt-dot'), {{autoAlpha: 0, scale: 0.3}},
    {{autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out'}}, t);
  tl.fromTo(el.querySelector('.tt-txt'), {{autoAlpha: 0, x: 30}},
    {{autoAlpha: 1, x: 0, duration: 0.5, ease: 'power3.out'}}, t + 0.08);
}});
"""
    return composition(comp_id, "Timeline histórico", "timeline_track", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- ASSETS (§15: los PNG mandan) ----------------------------------------------

def _asset_showcase(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """1-3 imágenes del material como protagonistas, con sombra suave y entrada escalonada."""
    p = p_(params, {"kicker": "", "title": "", "items": None, "caption": "",
                    "theme": None, "accent": None, "duration": 5.0,
                    "width": 1080, "height": 1920, "opaque": False})
    th = theme_of(p)
    items = items_of(p["items"], limit=3, fallback=[{"label": "Asset"}])
    tiles = "".join(
        f'<figure class="as-tile">{media_html(it, cls="mt-media as-media")}'
        + (f'<figcaption>{esc(it["label"])}</figcaption>' if it["label"] else "")
        + "</figure>"
        for it in items)
    caption = str(p["caption"] or "").strip()
    markup = (f'<div class="mt as">{_head(p)}<div class="as-row">{tiles}</div>'
              + (f'<div class="as-caption">{esc(caption)}</div>' if caption else "")
              + "</div>")
    css = _HEAD_CSS + f"""
.as{{padding:86px 58px;gap:44px;align-items:center;}}
.as-row{{display:flex;align-items:center;justify-content:center;gap:40px;width:100%;}}
.as-tile{{margin:0;display:flex;flex-direction:column;align-items:center;gap:20px;flex:1;}}
.as-media{{width:100%;aspect-ratio:1/1;max-width:340px;border-radius:32px;
  filter:drop-shadow(0 26px 40px rgba(15,23,42,.24));}}
.as-media.is-mono{{font-size:96px;}}
.as .mt-head,.as-tile figcaption,.as-caption{{background:{th['surface']};
  border-radius:{th['radius']}px;box-shadow:{th['shadow']};}}
.as .mt-head{{width:auto;padding:18px 28px;align-items:center;text-align:center;}}
.as-tile figcaption{{font-family:{th['font_display']};font-weight:800;font-size:36px;
  letter-spacing:-0.3px;color:{th['text']};text-align:center;padding:8px 22px;}}
.as-caption{{width:auto;font-weight:600;font-size:30px;color:{th['text']};text-align:center;
  max-width:84%;padding:12px 24px;}}
"""
    js = _head_js() + f"""
var tiles = root.querySelectorAll('.as-tile');
var free = Math.max(0.4, ctx.duration - {_HEAD_IN} - {_TAIL});
var step = Math.min(0.45, free / Math.max(1, tiles.length));
tiles.forEach(function (el, i) {{
  tl.fromTo(el, {{autoAlpha: 0, y: 54, scale: 0.9}},
    {{autoAlpha: 1, y: 0, scale: 1, duration: 0.65, ease: 'power3.out'}},
    {_HEAD_IN} + i * step);
}});
var cap = root.querySelector('.as-caption');
if (cap) tl.fromTo(cap, {{autoAlpha: 0, y: 18}},
  {{autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out'}},
  {_HEAD_IN} + step * tiles.length);
"""
    return composition(comp_id, "Assets protagonistas", "asset_showcase", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- CONCEPTUALES ---------------------------------------------------------------

def _annotate(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Anotación sobre el vídeo: una flecha se dibuja hasta un punto y aparece la etiqueta.

    Overlay transparente por defecto: señala algo que YA está en pantalla (§2).
    ``target_x``/``target_y`` van en 0..1 sobre el lienzo.
    """
    p = p_(params, {"label": "Aquí", "sublabel": "", "target_x": 0.5, "target_y": 0.45,
                    "side": "auto", "theme": None, "accent": None, "duration": 4.0,
                    "width": 1080, "height": 1920, "opaque": False})
    th = theme_of(p)
    tx = max(0.05, min(0.95, num(p["target_x"], 0.5)))
    ty = max(0.05, min(0.95, num(p["target_y"], 0.45)))
    side = str(p["side"]).strip().lower()
    if side not in ("left", "right"):
        side = "right" if tx < 0.5 else "left"
    # La etiqueta se aparta del punto hacia el lado libre.
    lx = min(0.92, tx + 0.16) if side == "right" else max(0.08, tx - 0.16)
    ly = max(0.08, ty - 0.14)
    x1, y1 = tx * 1000, ty * 1000
    x2, y2 = lx * 1000, ly * 1000
    markup = (f'<div class="mt an">'
              f'<svg class="an-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">'
              f'<path class="an-leader" d="M {x2:.1f} {y2:.1f} L {x1:.1f} {y1:.1f}"/></svg>'
              f'<span class="an-ring" style="left:{tx * 100:.2f}%;top:{ty * 100:.2f}%"></span>'
              f'<div class="an-label mt-card is-{side}" '
              f'style="left:{lx * 100:.2f}%;top:{ly * 100:.2f}%">'
              f'<b>{esc(p["label"])}</b>'
              + (f'<em>{esc(p["sublabel"])}</em>' if str(p["sublabel"] or "").strip() else "")
              + "</div></div>")
    css = f"""
.an-svg{{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}}
.an-leader{{fill:none;stroke:{th['accent_ink']};stroke-width:5;stroke-linecap:round;}}
.an-ring{{position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;
  border:5px solid {th['accent_ink']};}}
.an-label{{position:absolute;padding:20px 26px;max-width:46%;display:flex;flex-direction:column;
  gap:8px;}}
.an-label.is-right{{transform:translate(0,-100%);}}
.an-label.is-left{{transform:translate(-100%,-100%);}}
.an-label b{{font-family:{th['font_display']};font-weight:800;font-size:44px;
  letter-spacing:-0.4px;color:{th['text']};line-height:1.1;}}
.an-label em{{font-style:normal;font-weight:600;font-size:28px;color:{th['muted']};}}
"""
    js = """
var leader = root.querySelector('.an-leader');
var len = leader.getTotalLength();
leader.style.strokeDasharray = len;
tl.fromTo(leader, { strokeDashoffset: len },
  { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' }, 0.1);
tl.fromTo(root.querySelector('.an-ring'), { autoAlpha: 0, scale: 0.4 },
  { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'power3.out', transformOrigin: '50% 50%' }, 0.45);
tl.fromTo(root.querySelector('.an-label'), { autoAlpha: 0, y: 16 },
  { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.2);
"""
    return composition(comp_id, "Anotación sobre el vídeo", "annotate", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]), flow=False)


def _assemble(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    """Piezas dispersas que convergen y se ensamblan en una composición limpia."""
    p = p_(params, {"kicker": "", "title": "", "items": None, "result": "",
                    "theme": None, "accent": None, "duration": 5.5,
                    "width": 1080, "height": 1920, "opaque": True})
    th = theme_of(p)
    items = items_of(p["items"], limit=5, fallback=_DEMO_ITEMS)
    # Desplazamientos de partida fijos (deterministas): cada pieza viene de un lado.
    offsets = [(-260, -180), (250, -150), (-230, 190), (240, 200), (0, -280)]
    pieces = "".join(
        f'<div class="ab-piece mt-card" data-dx="{offsets[i % len(offsets)][0]}" '
        f'data-dy="{offsets[i % len(offsets)][1]}">'
        f'{media_html(it) if it.get("image") else ""}'
        f'<span>{esc(it["label"])}</span></div>'
        for i, it in enumerate(items))
    result = str(p["result"] or "").strip()
    markup = (f'<div class="mt ab">{_head(p)}<div class="ab-stage">{pieces}</div>'
              + (f'<div class="ab-result">{esc(result)}</div>' if result else "")
              + "</div>")
    css = _HEAD_CSS + f"""
.ab{{padding:80px 58px;gap:44px;align-items:center;}}
.ab-stage{{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:20px;
  width:100%;}}
.ab-piece{{display:flex;align-items:center;gap:16px;padding:22px 28px;
  font-family:{th['font_display']};font-weight:800;font-size:38px;color:{th['text']};}}
.ab-piece .mt-media{{width:64px;height:64px;font-size:28px;border-radius:16px;}}
.ab-result{{font-family:{th['font_display']};font-weight:800;font-size:46px;
  letter-spacing:-0.4px;color:{th['accent_ink']};text-align:center;max-width:86%;line-height:1.14;}}
"""
    js = _head_js() + f"""
var pieces = root.querySelectorAll('.ab-piece');
var free = Math.max(0.5, ctx.duration - {_HEAD_IN} - {_TAIL} - 0.5);
var step = Math.min(0.28, free / Math.max(1, pieces.length));
pieces.forEach(function (el, i) {{
  var dx = parseFloat(el.getAttribute('data-dx')) || 0;
  var dy = parseFloat(el.getAttribute('data-dy')) || 0;
  tl.fromTo(el, {{autoAlpha: 0, x: dx, y: dy, scale: 0.8}},
    {{autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.7, ease: 'power3.out'}},
    {_HEAD_IN} + i * step);
}});
var res = root.querySelector('.ab-result');
if (res) tl.fromTo(res, {{autoAlpha: 0, y: 20}},
  {{autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out'}},
  {_HEAD_IN} + step * pieces.length + 0.5);
"""
    return composition(comp_id, "Piezas que se ensamblan", "assemble", th, p,
                       markup=markup, css=css, js=js, opaque=bool(p["opaque"]))


# --- Registro -------------------------------------------------------------------

_ITEMS_SLOT = ("items: lista de {label, sublabel?, image?}. 'image' = id de una imagen "
               "del material (se incrusta el PNG real; si falta, se dibuja un monograma).")

TEMPLATES: list[Template] = [
    Template(
        "stack_list", "Lista apilada", "list",
        "Los elementos CAEN desde arriba uno tras otro y se apilan de abajo arriba (el "
        "primero es la base) con un asentamiento corto. Cada uno puede llevar su PNG "
        "del material dentro de la tarjeta.",
        {"kicker": "", "title": "", "items": [{"label": "ChatGPT", "image": None}],
         "theme": "light", "accent": None, "duration": 6.0, "opaque": True},
        _stack_list,
        tags=["lista", "enumerar", "apilar", "caida", "logos", "marcas"],
        best_for="Enumerar 3-6 cosas del mismo tipo (herramientas, marcas, causas, pasos sueltos).",
        slots={"items": _ITEMS_SLOT, "kicker": "antetítulo corto opcional",
               "title": "título corto opcional"},
        accepts_images=True,
    ),
    Template(
        "card_grid", "Cuadrícula", "list",
        "Los elementos entran y ocupan su celda en una cuadrícula de 2-3 columnas. "
        "Composición equilibrada para mostrar un conjunto de una vez.",
        {"kicker": "", "title": "", "items": [{"label": "A", "image": None}], "columns": 2,
         "theme": "light", "accent": None, "duration": 5.5, "opaque": True},
        _card_grid,
        tags=["cuadricula", "grid", "conjunto", "iconos", "logos", "panorama"],
        best_for="Enseñar un conjunto completo a la vez (4-8 elementos) en vez de uno a uno.",
        slots={"items": _ITEMS_SLOT, "columns": "2 o 3"},
        accepts_images=True,
    ),
    Template(
        "sequence_rows", "Filas editoriales", "list",
        "Filas numeradas que entran desde la izquierda con una regla fina que se dibuja "
        "bajo cada una. Estética de prensa, muy legible y sobria.",
        {"kicker": "", "title": "", "items": [{"label": "Punto", "sublabel": ""}],
         "numbered": True, "theme": "light", "accent": None, "duration": 6.0, "opaque": True},
        _sequence_rows,
        tags=["lista", "puntos", "claves", "editorial", "numerado", "pasos"],
        best_for="Claves, razones o pasos donde cada punto lleva una frase de apoyo.",
        slots={"items": _ITEMS_SLOT, "numbered": "true para 01, 02, 03…"},
        accepts_images=False,
    ),
    Template(
        "versus", "Comparación (cara a cara)", "compare",
        "Dos bloques que entran desde lados opuestos con un divisor y una etiqueta central. "
        "Cada lado admite su PNG del material.",
        {"kicker": "", "title": "", "left": {"label": "Navier"}, "right": {"label": "Stokes"},
         "divider": "VS", "theme": "light", "accent": None, "duration": 5.5, "opaque": True},
        _versus,
        tags=["comparacion", "versus", "contraste", "dos", "frente a"],
        best_for="Contraponer DOS cosas: personas, enfoques, opciones, cifras.",
        slots={"left": "{label, sublabel?, image?}", "right": "{label, sublabel?, image?}",
               "divider": "texto del centro (VS, ó, →) o vacío"},
        accepts_images=True,
    ),
    Template(
        "before_after", "Antes / después", "compare",
        "Dos paneles apilados; el segundo se revela con un barrido sobre el primero. "
        "Para mostrar un cambio de estado.",
        {"kicker": "", "title": "", "before": {"label": "Antes"}, "after": {"label": "Después"},
         "before_label": "ANTES", "after_label": "DESPUÉS",
         "theme": "light", "accent": None, "duration": 5.0, "opaque": True},
        _before_after,
        tags=["antes", "despues", "cambio", "evolucion", "transformacion", "resultado"],
        best_for="Un cambio o transformación: situación previa frente a resultado.",
        slots={"before": "{label, sublabel?, image?}", "after": "{label, sublabel?, image?}"},
        accepts_images=True,
    ),
    Template(
        "flow_steps", "Proceso / flujo", "diagram",
        "Cajas encadenadas por flechas que se dibujan una tras otra. Vertical por "
        "defecto (ideal en 9:16); horizontal si el formato es apaisado.",
        {"kicker": "", "title": "", "steps": [{"label": "Entrada"}, {"label": "Proceso"}],
         "orientation": "auto", "theme": "light", "accent": None,
         "duration": 6.5, "opaque": True},
        _flow_steps,
        tags=["proceso", "flujo", "pasos", "como funciona", "mecanismo", "cadena", "flechas"],
        best_for="Explicar CÓMO funciona algo: una secuencia de 2-5 etapas encadenadas.",
        slots={"steps": "lista de {label, sublabel?, image?} en orden",
               "orientation": "auto (según formato) | vertical | horizontal"},
        accepts_images=True,
    ),
    Template(
        "decision_tree", "Árbol de decisión", "diagram",
        "Un nodo raíz del que salen ramas que se dibujan hacia sus hojas. Para "
        "bifurcaciones, consecuencias o clasificaciones.",
        {"kicker": "", "title": "", "root": "¿Pregunta?",
         "branches": [{"label": "Sí"}, {"label": "No"}],
         "theme": "light", "accent": None, "duration": 6.0, "opaque": True},
        _decision_tree,
        tags=["arbol", "decision", "bifurcacion", "ramas", "clasificacion", "si no"],
        best_for="Una pregunta o causa que se abre en 2-4 caminos o consecuencias.",
        slots={"root": "texto del nodo raíz", "branches": "lista de {label, sublabel?}"},
        accepts_images=False,
    ),
    Template(
        "concept_map", "Mapa conceptual", "diagram",
        "Un concepto central y hasta 6 satélites unidos por radios que se dibujan. "
        "Para relacionar ideas alrededor de un tema.",
        {"kicker": "", "title": "", "center": "Concepto",
         "items": [{"label": "Idea A"}, {"label": "Idea B"}],
         "theme": "light", "accent": None, "duration": 6.5, "opaque": True},
        _concept_map,
        tags=["mapa", "conceptual", "relacion", "alrededor", "componentes", "partes"],
        best_for="Un concepto y las piezas que lo rodean o lo componen (sin orden entre ellas).",
        slots={"center": "concepto central", "items": _ITEMS_SLOT},
        accepts_images=True,
    ),
    Template(
        "line_graph", "Gráfico de línea", "data",
        "Trazo SVG que se dibuja sobre una rejilla fina, puntos que se marcan y el "
        "último valor contando. Para una evolución en el tiempo.",
        {"kicker": "", "title": "",
         "data": [{"label": "2020", "value": 12}, {"label": "2024", "value": 78}],
         "unit": "", "theme": "light", "accent": None, "duration": 6.0, "opaque": True},
        _line_graph,
        tags=["grafico", "linea", "evolucion", "tendencia", "crecimiento", "serie", "datos"],
        best_for="Una serie que sube o baja con el tiempo (2-12 puntos).",
        slots={"data": "lista de {label, value}", "unit": "sufijo del número (%, M, €…)"},
        accepts_images=False,
    ),
    Template(
        "timeline_track", "Timeline histórico", "time",
        "Eje vertical que se dibuja con hitos fechados que aparecen en orden. Para "
        "situar acontecimientos en el tiempo.",
        {"kicker": "", "title": "",
         "events": [{"label": "1822", "sublabel": "Navier formula el problema"}],
         "theme": "light", "accent": None, "duration": 7.0, "opaque": True},
        _timeline_track,
        tags=["timeline", "cronologia", "historia", "fechas", "años", "hitos", "linea temporal"],
        best_for="Fechas o años concretos en orden cronológico (no para un simple antes/después).",
        slots={"events": "lista de {label: fecha/año, sublabel: qué pasó}"},
        accepts_images=False,
    ),
    Template(
        "asset_showcase", "Assets protagonistas", "asset",
        "1-3 imágenes del material a gran tamaño con sombra suave y entrada escalonada. "
        "Overlay transparente por defecto: la imagen manda, no la tarjeta.",
        {"kicker": "", "title": "", "items": [{"label": "", "image": None}], "caption": "",
         "theme": "light", "accent": None, "duration": 5.0, "opaque": False},
        _asset_showcase,
        tags=["imagen", "png", "foto", "retrato", "logo", "asset", "mostrar"],
        best_for="Enseñar imágenes REALES del material (retratos, logos, capturas) como protagonistas.",
        slots={"items": _ITEMS_SLOT, "caption": "pie de foto corto opcional"},
        accepts_images=True,
    ),
    Template(
        "annotate", "Anotación sobre el vídeo", "concept",
        "Overlay transparente: una flecha se dibuja hasta un punto de la imagen, un "
        "círculo lo marca y aparece una etiqueta corta. Señala algo que YA se ve.",
        {"label": "Aquí", "sublabel": "", "target_x": 0.5, "target_y": 0.45, "side": "auto",
         "theme": "light", "accent": None, "duration": 4.0, "opaque": False},
        _annotate,
        tags=["flecha", "señalar", "anotar", "destacar", "sobre el video", "overlay", "apuntar"],
        best_for="Señalar un detalle del vídeo que ya está en pantalla sin taparlo.",
        slots={"label": "etiqueta corta", "target_x": "0..1 horizontal", "target_y": "0..1 vertical"},
        accepts_images=False,
    ),
    Template(
        "assemble", "Piezas que se ensamblan", "concept",
        "Las piezas entran desde distintas direcciones y convergen en una composición "
        "limpia, con una conclusión opcional debajo.",
        {"kicker": "", "title": "", "items": [{"label": "Pieza"}], "result": "",
         "theme": "light", "accent": None, "duration": 5.5, "opaque": True},
        _assemble,
        tags=["ensamblar", "agrupar", "converger", "juntar", "suma", "conjunto", "unir"],
        best_for="Varias partes que se juntan para formar una idea o un resultado común.",
        slots={"items": _ITEMS_SLOT, "result": "frase corta de cierre opcional"},
        accepts_images=True,
    ),
]
