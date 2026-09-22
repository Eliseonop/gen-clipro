"""Biblioteca de templates de Motion Studio (spec §12/§13/§14).

Cada template es una composición EDITABLE parametrizable, no un vídeo cerrado.
La IA puede listarlos e instanciarlos con parámetros ({name}, {role}, colores…),
y el usuario los sigue editando en el editor visual como cualquier composición.

Dirección visual: minimalista y moderno tipo Tailwind UI — superficies limpias
(tarjetas con borde fino + sombra suave), paleta neutra con UN acento, tipografía
Inter, mucho espacio y animaciones sutiles (fade + desplazamientos cortos, sin
rebotes ni neón). Los tokens vienen de ``themes.py``.
"""
from __future__ import annotations

from typing import Any

import html as _html

from .. import themes
from ..models import (
    MotionAnimation,
    MotionComposition,
    MotionLayer,
    MotionTween,
)
from . import user, visual
from .base import Template
from .base import p_ as _p
from .base import theme_of as _theme_of

__all__ = ["Template", "list_templates", "catalog", "instantiate", "get"]


# --- SOCIAL: Subscribe (botón CTA limpio) ---
def _subscribe(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"text": "SUSCRÍBETE", "theme": None, "accent": None, "duration": 3.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    return MotionComposition(
        id=comp_id, name="Subscribe", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "subscribe", "theme": th},
        layers=[MotionLayer(
            id="btn", type="text", content=str(p["text"]).upper(),
            x=W / 2, y=H * 0.72, z_index=1,
            style={"font": th["font_body"], "fontSize": 60, "color": th["accent_text"],
                   "fontWeight": "800", "background": th["accent"], "padding": 34,
                   "borderRadius": 999, "letterSpacing": 1},
            animation=MotionAnimation(
                entrance=MotionTween(type="scale", from_scale=0.9, duration=0.5, ease=themes.EASE_POP),
                exit=MotionTween(type="fade", duration=0.4, ease="power2.in"),
            ),
        )],
    )


# --- NEWS: Lower third (tarjeta con nombre + rol) ---
def _lower_third(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"name": "Nombre Apellido", "role": "Cargo / Rol",
                    "theme": None, "accent": None, "duration": 5.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    markup = (
        '<div class="lt">'
        '<span class="lt-bar"></span>'
        '<div class="lt-txt">'
        f'<div class="lt-name">{_html.escape(str(p["name"]))}</div>'
        f'<div class="lt-role">{_html.escape(str(p["role"]))}</div>'
        '</div></div>'
    )
    css = f"""
.lt{{position:absolute;left:7%;right:7%;bottom:16%;display:flex;align-items:stretch;gap:26px;
  background:{th['surface']};border:1px solid {th['border']};border-radius:{th['radius']}px;
  padding:30px 34px;box-shadow:{th['shadow']};}}
.lt-bar{{flex:0 0 auto;width:8px;border-radius:999px;background:{th['accent']};transform-origin:50% 100%;}}
.lt-txt{{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;}}
.lt-name{{font-family:{th['font_display']};font-weight:800;color:{th['text']};font-size:60px;
  line-height:1.05;letter-spacing:-0.5px;}}
.lt-role{{font-family:{th['font_body']};font-weight:600;color:{th['muted']};font-size:38px;}}
"""
    js = (
        "tl.fromTo(root.querySelector('.lt'),{autoAlpha:0,y:44},{autoAlpha:1,y:0,duration:0.6,ease:'power3.out'},0);"
        "tl.fromTo(root.querySelector('.lt-bar'),{scaleY:0},{scaleY:1,duration:0.5,ease:'power3.out'},0.18);"
        "tl.fromTo(root.querySelectorAll('.lt-name,.lt-role'),{autoAlpha:0,x:-18},{autoAlpha:1,x:0,duration:0.5,"
        "stagger:0.1,ease:'power2.out'},0.24);"
    )
    return MotionComposition(
        id=comp_id, name="Lower Third", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "lower-third", "theme": th},
        layers=[MotionLayer(id="card", type="html", x=0, y=0, width=W, height=H,
                            html=markup, css=css, js=js)],
    )


# --- CINEMATIC: Title reveal (título centrado limpio) ---
def _title(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"text": "TÍTULO", "theme": None, "accent": None, "duration": 5.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    return MotionComposition(
        id=comp_id, name="Title", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "title", "theme": th},
        layers=[MotionLayer(
            id="title", type="text", content=str(p["text"]).upper(),
            x=W / 2, y=H / 2, z_index=1, width=W * 0.86,
            style={"font": th["font_display"], "fontSize": 120, "color": th["text"],
                   "fontWeight": "800", "letterSpacing": -1, "lineHeight": 1.05,
                   "align": "center", "shadow": "0 2px 14px rgba(15,23,42,.18)"},
            animation=MotionAnimation(
                entrance=MotionTween(type="slide", direction="up", distance=40,
                                     duration=0.8, ease=themes.EASE_OUT),
                exit=MotionTween(type="fade", duration=0.5, ease="power2.in"),
            ),
        )],
    )


# --- TEXT: Título pro (antetítulo + título + subrayado que se dibuja) ---
def _pro_title(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"kicker": "CAPÍTULO 01", "title": "EL GRAN TÍTULO",
                    "theme": None, "accent": None, "duration": 4.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    cx, cy = W / 2, H / 2
    title = str(p["title"]).upper()
    box = W * 0.86
    big = 118 if len(title) <= 14 else (92 if len(title) <= 24 else 68)
    lines = max(1, min(3, (len(title) * big * 0.6) // box + 1))
    title_h = big * 1.08 * lines
    return MotionComposition(
        id=comp_id, name="Título pro", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "pro_title", "theme": th},
        layers=[
            MotionLayer(id="kicker", type="text", content=str(p["kicker"]).upper(),
                        x=cx, y=cy - title_h / 2 - 60, z_index=2, start=0.0, width=box,
                        style={"font": th["font_body"], "fontSize": 34, "color": th["accent"],
                               "fontWeight": "700", "letterSpacing": 6, "align": "center"},
                        animation=MotionAnimation(
                            entrance=MotionTween(type="slide", direction="down", distance=26,
                                                 duration=0.5, ease=themes.EASE_OUT),
                            exit=MotionTween(type="fade", duration=0.4, ease="power2.in"))),
            MotionLayer(id="title", type="text", content=title,
                        x=cx, y=cy, z_index=3, start=0.12, width=box,
                        style={"font": th["font_display"], "fontSize": big, "color": th["text"],
                               "fontWeight": "800", "letterSpacing": -1, "lineHeight": 1.05,
                               "align": "center", "shadow": "0 2px 14px rgba(15,23,42,.16)"},
                        animation=MotionAnimation(
                            entrance=MotionTween(type="slide", direction="up", distance=40,
                                                 duration=0.7, delay=0.12, ease=themes.EASE_OUT),
                            exit=MotionTween(type="fade", duration=0.5, ease="power2.in"))),
            MotionLayer(id="rule", type="shape", x=cx - 120, y=cy + title_h / 2 + 46, z_index=1, start=0.5,
                        shape={"kind": "line", "x2": cx + 120, "y2": cy + title_h / 2 + 46,
                               "thickness": 6, "stroke": th["accent"]},
                        animation=MotionAnimation(
                            entrance=MotionTween(type="draw", duration=0.6, delay=0.5, ease=themes.EASE_INOUT),
                            exit=MotionTween(type="fade", duration=0.4, ease="power2.in"))),
        ],
    )


# --- LIST: Lista / bullets (tarjeta con aparición escalonada) ---
def _bullet_list(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"title": "3 CLAVES", "items": ["Primer punto", "Segundo punto", "Tercer punto"],
                    "theme": None, "accent": None, "duration": 6.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    items = [str(x) for x in (list(p["items"]) or [])][:6] or ["Punto 1", "Punto 2", "Punto 3"]
    lis = "".join(
        f'<li class="bl-item"><span class="bl-dot"></span>'
        f'<span class="bl-t">{_html.escape(t)}</span></li>' for t in items)
    markup = (f'<div class="bl-wrap"><div class="bl"><div class="bl-title">{_html.escape(str(p["title"]).upper())}</div>'
              f'<ul class="bl-items">{lis}</ul></div></div>')
    css = f"""
.bl-wrap{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}}
.bl{{width:84%;max-height:74%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;
  gap:28px;background:{th['surface']};border:1px solid {th['border']};border-radius:{th['radius']}px;
  padding:52px;box-shadow:{th['shadow']};overflow:hidden;}}
.bl-title{{font-family:{th['font_display']};font-weight:800;color:{th['text']};font-size:66px;
  letter-spacing:-0.5px;}}
.bl-items{{list-style:none;display:flex;flex-direction:column;gap:26px;}}
.bl-item{{display:flex;align-items:center;gap:24px;}}
.bl-dot{{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:{th['accent']};}}
.bl-t{{font-family:{th['font_body']};font-weight:600;color:{th['text']};font-size:50px;line-height:1.15;}}
"""
    js = (
        "tl.fromTo(root.querySelector('.bl'),{autoAlpha:0,y:36},{autoAlpha:1,y:0,duration:0.55,ease:'power3.out'},0);"
        "tl.fromTo(root.querySelector('.bl-title'),{autoAlpha:0,y:-14},{autoAlpha:1,y:0,duration:0.45,ease:'power2.out'},0.15);"
        "tl.fromTo(root.querySelectorAll('.bl-item'),{autoAlpha:0,x:-24},{autoAlpha:1,x:0,duration:0.5,"
        "stagger:0.13,ease:'power2.out'},0.3);"
    )
    return MotionComposition(
        id=comp_id, name="Lista", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "bullet_list", "theme": th},
        layers=[MotionLayer(id="list", type="html", x=0, y=0, width=W, height=H,
                            html=markup, css=css, js=js)],
    )


# --- TEXT: Cita / pull-quote (barra de acento + cita + autor) ---
def _quote(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"quote": "Una idea que merece destacarse.", "author": "— Autor",
                    "theme": None, "accent": None, "duration": 5.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    markup = (f'<div class="q"><div class="q-mark">“</div>'
              f'<div class="q-text">{_html.escape(str(p["quote"]))}</div>'
              f'<div class="q-author">{_html.escape(str(p["author"]))}</div></div>')
    css = f"""
.q{{position:absolute;left:9%;right:9%;top:50%;transform:translateY(-50%);
  border-left:6px solid {th['accent']};padding:8px 0 8px 44px;}}
.q-mark{{font-family:{th['font_display']};font-weight:900;color:{th['accent']};font-size:120px;
  line-height:0.6;height:70px;}}
.q-text{{font-family:{th['font_display']};font-weight:700;color:{th['text']};font-size:64px;
  line-height:1.22;letter-spacing:-0.5px;margin-top:14px;}}
.q-author{{font-family:{th['font_body']};font-weight:600;color:{th['muted']};font-size:40px;margin-top:28px;}}
"""
    js = (
        "tl.fromTo(root.querySelector('.q'),{autoAlpha:0,x:-24},{autoAlpha:1,x:0,duration:0.6,ease:'power3.out'},0);"
        "tl.fromTo(root.querySelector('.q-mark'),{autoAlpha:0,scale:0.6},{autoAlpha:1,scale:1,transformOrigin:'0% 0%',"
        "duration:0.5,ease:'power2.out'},0.12);"
        "tl.fromTo(root.querySelector('.q-text'),{autoAlpha:0,y:16},{autoAlpha:1,y:0,duration:0.6,ease:'power2.out'},0.2);"
        "tl.fromTo(root.querySelector('.q-author'),{autoAlpha:0,y:12},{autoAlpha:1,y:0,duration:0.5,ease:'power2.out'},0.4);"
    )
    return MotionComposition(
        id=comp_id, name="Cita", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "quote", "theme": th},
        layers=[MotionLayer(id="quote", type="html", x=0, y=0, width=W, height=H,
                            html=markup, css=css, js=js)],
    )


# --- DATA: Estadística / número grande (tarjeta con conteo animado) ---
_STAT_JS = """
var el = root.querySelector('.st-val');
var card = root.querySelector('.st');
tl.fromTo(card, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0);
tl.fromTo(root.querySelector('.st-label'), { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.15);
tl.fromTo(root.querySelector('.st-sub'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.5);
if (el) {
  var target = parseFloat(el.getAttribute('data-value')) || 0;
  var suffix = el.getAttribute('data-suffix') || '';
  var prefix = el.getAttribute('data-prefix') || '';
  var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
  var o = { v: 0 };
  tl.fromTo(o, { v: 0 }, { v: target, duration: 1.1, ease: 'power2.out',
    onUpdate: function () { el.textContent = prefix + o.v.toFixed(dec) + suffix; } }, 0.25);
}
"""


def _stat(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"label": "CRECIMIENTO", "value": 87, "prefix": "", "suffix": "%",
                    "decimals": 0, "sub": "respecto al año anterior",
                    "theme": None, "accent": None, "duration": 4.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    try:
        value = float(p["value"])
    except (TypeError, ValueError):
        value = 0.0
    dec = max(0, min(3, int(p["decimals"])))
    markup = (
        '<div class="st">'
        f'<div class="st-label">{_html.escape(str(p["label"]).upper())}</div>'
        f'<div class="st-num"><span class="st-val" data-value="{value:g}" '
        f'data-prefix="{_html.escape(str(p["prefix"]))}" data-suffix="{_html.escape(str(p["suffix"]))}" '
        f'data-dec="{dec}">{_html.escape(str(p["prefix"]))}0{_html.escape(str(p["suffix"]))}</span></div>'
        f'<div class="st-sub">{_html.escape(str(p["sub"]))}</div>'
        '</div>'
    )
    css = f"""
.st{{position:absolute;left:8%;right:8%;top:50%;transform:translateY(-50%);
  background:{th['surface']};border:1px solid {th['border']};border-radius:{th['radius']}px;
  padding:64px 56px;box-shadow:{th['shadow']};text-align:center;}}
.st-label{{font-family:{th['font_body']};font-weight:700;color:{th['muted']};font-size:38px;
  letter-spacing:4px;}}
.st-num{{margin:18px 0;}}
.st-val{{font-family:{th['font_display']};font-weight:900;color:{th['accent']};font-size:220px;
  line-height:1;letter-spacing:-4px;}}
.st-sub{{font-family:{th['font_body']};font-weight:600;color:{th['text']};font-size:44px;}}
"""
    return MotionComposition(
        id=comp_id, name="Estadística", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "stat", "theme": th},
        layers=[MotionLayer(id="stat", type="html", x=0, y=0, width=W, height=H,
                            html=markup, css=css, js=_STAT_JS)],
    )


# --- DATA: Gráfico de barras (barras que crecen + conteo) ---
_BAR_JS = """
var bars = root.querySelectorAll('.gm-bar');
var vals = root.querySelectorAll('.gm-val');
var head = root.querySelector('.gm-head');
tl.fromTo(root.querySelector('.gm-panel'), { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out' }, 0);
if (head) tl.fromTo(head, { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.15);
bars.forEach(function (bar, i) {
  tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: 0.7, ease: 'power3.out' }, 0.3 + i * 0.12);
});
root.querySelectorAll('.gm-cat').forEach(function (el, i) {
  tl.fromTo(el, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.35 + i * 0.12);
});
vals.forEach(function (el, i) {
  var target = parseFloat(el.getAttribute('data-value')) || 0;
  var unit = el.getAttribute('data-unit') || '';
  var o = { v: 0 };
  tl.fromTo(o, { v: 0 }, { v: target, duration: 0.8, ease: 'power2.out',
    onUpdate: function () { el.textContent = Math.round(o.v) + unit; } }, 0.35 + i * 0.12);
});
"""


def _bar_chart(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"title": "RESULTADOS", "unit": "",
                    "data": [{"label": "A", "value": 40}, {"label": "B", "value": 75},
                             {"label": "C", "value": 55}],
                    "theme": None, "accent": None, "duration": 6.0,
                    "width": 1080, "height": 1920})
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    unit = str(p["unit"])
    rows = [d for d in (list(p["data"]) or []) if isinstance(d, dict)][:6] or [{"label": "A", "value": 1}]
    vmax = max((float(d.get("value") or 0) for d in rows), default=1) or 1

    cols = []
    for d in rows:
        val = float(d.get("value") or 0)
        pct = max(4, round(val / vmax * 100))
        label = _html.escape(str(d.get("label", "")))
        cols.append(
            f'<div class="gm-col">'
            f'<div class="gm-val" data-value="{val:g}" data-unit="{_html.escape(unit)}">0{_html.escape(unit)}</div>'
            f'<div class="gm-track"><div class="gm-bar" style="height:{pct}%"></div></div>'
            f'<div class="gm-cat">{label}</div>'
            f'</div>')
    markup = (f'<div class="gm-panel">'
              f'<div class="gm-head">{_html.escape(str(p["title"]).upper())}</div>'
              f'<div class="gm-chart">{"".join(cols)}</div>'
              f'</div>')
    radius = int(th["radius"])
    css = f"""
.gm-panel{{position:absolute;left:7%;right:7%;top:24%;bottom:24%;
  background:{th['surface']};border:1px solid {th['border']};border-radius:{radius}px;
  padding:56px 48px;display:flex;flex-direction:column;gap:36px;box-shadow:{th['shadow']};}}
.gm-head{{font-family:{th['font_display']};font-weight:800;color:{th['text']};
  font-size:60px;letter-spacing:-0.5px;}}
.gm-chart{{flex:1;display:flex;align-items:flex-end;justify-content:space-around;gap:28px;}}
.gm-col{{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;gap:16px;}}
.gm-val{{font-family:{th['font_display']};font-weight:800;color:{th['text']};font-size:44px;}}
.gm-track{{width:100%;flex:1;display:flex;align-items:flex-end;}}
.gm-bar{{width:100%;background:{th['accent']};
  border-radius:{max(6, radius // 2)}px {max(6, radius // 2)}px 4px 4px;transform-origin:50% 100%;}}
.gm-cat{{font-family:{th['font_body']};font-weight:600;color:{th['muted']};font-size:40px;}}
"""
    return MotionComposition(
        id=comp_id, name="Gráfico de barras", width=W, height=H, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "bar_chart", "theme": th},
        layers=[MotionLayer(id="chart", type="html", x=0, y=0, width=W, height=H,
                            html=markup, css=css, js=_BAR_JS)],
    )


# --- DIAGRAMA: Red neuronal (procedural, reskin limpio sin neón) ---
def _neural_network(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {
        "inputs": ["X1", "X2", "X3"], "hidden": 5, "output": "GATO",
        "duration": 8.0, "width": 1920, "height": 1080,
        "theme": None, "accent": None,
    })
    th = _theme_of(p)
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    inputs = list(p["inputs"]) or ["X1", "X2", "X3"]
    n_hidden = max(2, min(8, int(p["hidden"])))
    accent = th["accent"]
    edge_color = th["border"]
    node_stroke = th["accent"]
    layers: list[MotionLayer] = []

    def col_y(n: int, i: int) -> float:
        gap = H / (n + 1)
        return gap * (i + 1)

    x_in, x_hid, x_out = W * 0.18, W * 0.5, W * 0.82
    in_pts = [(x_in, col_y(len(inputs), i)) for i in range(len(inputs))]
    hid_pts = [(x_hid, col_y(n_hidden, i)) for i in range(n_hidden)]
    out_pt = (x_out, H / 2)

    def edge(idx, x, y, x2, y2, start, delay):
        return MotionLayer(
            id=f"e{idx}", type="shape", x=x, y=y, z_index=1, start=start,
            shape={"kind": "line", "x2": x2, "y2": y2, "thickness": 2, "stroke": edge_color},
            animation=MotionAnimation(entrance=MotionTween(type="draw", duration=0.5, ease="power2.out")),
        )

    def node(nid, x, y, r, fill, start):
        return MotionLayer(
            id=nid, type="shape", x=x, y=y, z_index=5, start=start,
            shape={"kind": "circle", "radius": r, "fill": fill, "stroke": node_stroke,
                   "thickness": 2, "shadow": th["shadow"]},
            animation=MotionAnimation(entrance=MotionTween(type="scale", from_scale=0.6,
                                      duration=0.5, ease=themes.EASE_OUT)),
        )

    ei = 0
    for (ix, iy) in in_pts:
        for k, (hx, hy) in enumerate(hid_pts):
            layers.append(edge(ei, ix, iy, hx, hy, 2.0, (k % 5) * 0.12)); ei += 1
    for k, (hx, hy) in enumerate(hid_pts):
        layers.append(edge(ei, hx, hy, out_pt[0], out_pt[1], 3.2, k * 0.12)); ei += 1
    for i, (ix, iy) in enumerate(in_pts):
        layers.append(node(f"in{i}", ix, iy, 34, accent, 0.2 + i * 0.15))
        layers.append(MotionLayer(id=f"lb{i}", type="text", content=str(inputs[i]) if i < len(inputs) else f"X{i+1}",
                                  x=ix - 90, y=iy, z_index=6, start=0.2 + i * 0.15,
                                  style={"font": th["font_body"], "fontSize": 40, "color": th["muted"], "fontWeight": "700"},
                                  animation=MotionAnimation(entrance=MotionTween(type="fade", duration=0.4))))
    for i, (hx, hy) in enumerate(hid_pts):
        layers.append(node(f"h{i}", hx, hy, 28, th["surface"], 1.8 + i * 0.08))
    layers.append(node("out", out_pt[0], out_pt[1], 42, accent, 5.0))
    layers.append(MotionLayer(id="pred", type="text", content=f"Predicción: {p['output']}",
                              x=W * 0.82, y=H / 2 + 96, z_index=7, start=5.4,
                              style={"font": th["font_display"], "fontSize": 52, "color": th["text"], "fontWeight": "800"},
                              animation=MotionAnimation(entrance=MotionTween(type="slide", direction="up", distance=30,
                                                                            duration=0.5, ease=themes.EASE_OUT))))
    layers.append(MotionLayer(id="flow", type="text", content="Entrada → Procesamiento → Predicción",
                              x=W / 2, y=H * 0.92, z_index=8, start=6.8,
                              style={"font": th["font_body"], "fontSize": 44, "color": th["muted"], "fontWeight": "600"},
                              animation=MotionAnimation(entrance=MotionTween(type="fade", duration=0.5))))

    return MotionComposition(id=comp_id, name="Red neuronal", width=W, height=H, fps=30,
                             duration=dur, background=th["bg"],
                             metadata={"template": "neural_network", "theme": th}, layers=layers)


def _stick_scene(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    from .. import stick
    return stick.demo_template(comp_id, params)


_LEGACY: list[Template] = [
        Template("stick_scene", "Historia con stickman", "story",
                 "Escena animada de stickman (reparto, escenario, planos con poses, cámara y "
                 "efectos) a partir de un storyboard. Para contar una anécdota o ilustrar el guion. "
                 "Pasa params.storyboard (ver motion_create_stick_scene) o usa el ejemplo.",
                 {"storyboard": None, "theme": "light"},
                 _stick_scene),
        Template("pro_title", "Título pro", "titles",
                 "Título grande con antetítulo en acento y un subrayado que se dibuja. "
                 "Limpio y con jerarquía; para abrir un tema o marcar un capítulo.",
                 {"kicker": "CAPÍTULO 01", "title": "EL GRAN TÍTULO", "theme": "light",
                  "accent": None, "duration": 4.0},
                 _pro_title),
        Template("title", "Título simple", "titles",
                 "Título central grande que aparece con un desplazamiento sutil. Minimalista.",
                 {"text": "TÍTULO", "theme": "light", "accent": None, "duration": 5.0},
                 _title),
        Template("bullet_list", "Lista / bullets", "text",
                 "Tarjeta con lista de 2-6 puntos y aparición escalonada. "
                 "Para enumerar claves, pasos o ventajas.",
                 {"title": "3 CLAVES", "items": ["Primer punto", "Segundo punto", "Tercer punto"],
                  "theme": "light", "accent": None, "duration": 6.0},
                 _bullet_list),
        Template("quote", "Cita", "text",
                 "Pull-quote elegante con barra de acento a la izquierda, cita y autor. "
                 "Para destacar una frase o testimonio.",
                 {"quote": "Una idea que merece destacarse.", "author": "— Autor",
                  "theme": "light", "accent": None, "duration": 5.0},
                 _quote),
        Template("stat", "Estadística", "data",
                 "Número grande con conteo animado dentro de una tarjeta, con etiqueta y "
                 "subtítulo. Para resaltar UNA cifra o dato clave. Pasa value, prefix, suffix.",
                 {"label": "CRECIMIENTO", "value": 87, "prefix": "", "suffix": "%",
                  "sub": "respecto al año anterior", "theme": "light", "accent": None, "duration": 4.0},
                 _stat),
        Template("bar_chart", "Gráfico de barras", "data",
                 "Tarjeta con barras que crecen, conteo numérico animado y etiquetas. "
                 "Para comparar 2-6 valores. Pasa data=[{label,value}], unit.",
                 {"title": "RESULTADOS", "unit": "%",
                  "data": [{"label": "A", "value": 40}, {"label": "B", "value": 75}, {"label": "C", "value": 55}],
                  "theme": "light", "accent": None, "duration": 6.0},
                 _bar_chart),
        Template("lower-third", "Lower Third", "social",
                 "Rótulo inferior tipo tarjeta con nombre y rol; entra desde abajo con suavidad.",
                 {"name": "Nombre Apellido", "role": "Cargo / Rol", "theme": "light",
                  "accent": None, "duration": 5.0},
                 _lower_third),
        Template("subscribe", "Suscríbete", "social",
                 "Botón CTA limpio (pill) que aparece con un ligero zoom. Para llamadas a la acción.",
                 {"text": "SUSCRÍBETE", "theme": "light", "accent": None, "duration": 3.0},
                 _subscribe),
        Template("neural_network", "Red neuronal", "science",
                 "Diagrama animado de red neuronal (entrada→oculta→salida) con conexiones que "
                 "se dibujan y predicción final. Estilo limpio, sin neón. Para explicar cómo "
                 "funciona una red neuronal.",
                 {"inputs": ["X1", "X2", "X3"], "hidden": 5, "output": "GATO",
                  "duration": 8.0, "width": 1920, "height": 1080, "theme": "light", "accent": None},
                 _neural_network),
]

# Las plantillas VISUALES van primero: son las que queremos que la IA elija por
# defecto (§2 — el recurso es una composición, no un cartel de texto).
_TEMPLATES: dict[str, Template] = {t.key: t for t in [*visual.TEMPLATES, *_LEGACY]}

# Pistas de selección para las plantillas heredadas (las visuales las traen ya).
_LEGACY_HINTS: dict[str, dict[str, Any]] = {
    "stat": {"tags": ["cifra", "dato", "porcentaje", "numero", "estadistica"],
             "best_for": "UNA cifra que hay que clavar (un porcentaje, un total)."},
    "bar_chart": {"tags": ["barras", "comparar valores", "ranking", "datos"],
                  "best_for": "Comparar 2-6 magnitudes entre sí."},
    "bullet_list": {"tags": ["lista", "bullets", "claves"],
                    "best_for": "Lista simple en tarjeta; para algo más visual usa stack_list."},
    "quote": {"tags": ["cita", "frase", "testimonio"],
              "best_for": "Destacar una frase textual de alguien."},
    "pro_title": {"tags": ["titulo", "capitulo", "apertura"],
                  "best_for": "Abrir un tema o marcar un capítulo."},
    "title": {"tags": ["titulo"], "best_for": "Un título suelto y nada más."},
    "lower-third": {"tags": ["rotulo", "nombre", "cargo"],
                    "best_for": "Presentar a quien habla en pantalla."},
    "subscribe": {"tags": ["cta", "suscribete"], "best_for": "Llamada a la acción."},
    "neural_network": {"tags": ["red neuronal", "ia", "diagrama"],
                       "best_for": "Explicar una red neuronal concreta."},
    "stick_scene": {"tags": ["stickman", "historia", "personaje"],
                    "best_for": "Contar una anécdota con figuras humanas."},
}


def _row(t: Template) -> dict[str, Any]:
    hints = _LEGACY_HINTS.get(t.key, {})
    return {"key": t.key, "name": t.name, "category": t.category,
            "description": t.description, "parameters": t.parameters,
            "tags": t.tags or hints.get("tags", []),
            "best_for": t.best_for or hints.get("best_for", ""),
            "slots": t.slots, "accepts_images": t.accepts_images}


def _all() -> dict[str, Template]:
    """Fijas + guardadas por el usuario (§16). Las del usuario se leen en cada
    llamada: se añaden y borran en caliente desde el editor."""
    return {**_TEMPLATES, **{t.key: t for t in user.as_templates()}}


def list_templates() -> list[dict[str, Any]]:
    return [_row(t) for t in _all().values()]


def get(key: str) -> Template | None:
    return _all().get(key)


def catalog(*, visual_only: bool = False) -> list[dict[str, Any]]:
    """Catálogo COMPACTO para el selector de la IA (§13): sin el JSON de parámetros
    por defecto, que gasta tokens y no ayuda a elegir."""
    rows = visual.TEMPLATES if visual_only else list(_all().values())
    out = []
    for t in rows:
        r = _row(t)
        out.append({k: v for k, v in
                    {"key": r["key"], "name": r["name"], "category": r["category"],
                     "best_for": r["best_for"], "tags": r["tags"], "slots": r["slots"],
                     "accepts_images": r["accepts_images"]}.items() if v})
    return out


def instantiate(key: str, comp_id: str, params: dict[str, Any] | None = None) -> MotionComposition:
    tpl = get(key)
    if not tpl:
        raise KeyError(f"Template desconocido: {key}")
    return tpl.build(comp_id, params or {})
