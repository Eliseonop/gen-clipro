"""Biblioteca de templates de Motion Studio (spec §12/§13/§14).

Cada template es una composición EDITABLE parametrizable, no un vídeo cerrado.
La IA puede listarlos e instanciarlos con parámetros ({name}, {role}, colores…),
y el usuario los sigue editando en el editor visual como cualquier composición.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..models import (
    MotionAnimation,
    MotionComposition,
    MotionEffect,
    MotionLayer,
    MotionTween,
)


@dataclass
class Template:
    key: str
    name: str
    category: str            # text | social | news | cinematic | transitions
    description: str
    parameters: dict[str, Any]
    build: Callable[[str, dict[str, Any]], MotionComposition] = field(repr=False)


def _p(params: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    out = dict(defaults)
    for k, v in (params or {}).items():
        if v is not None:
            out[k] = v
    return out


# --- SOCIAL: Subscribe ---
def _subscribe(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"text": "SUSCRÍBETE", "color": "#ffffff",
                    "accent": "#ff0033", "duration": 3.0})
    dur = float(p["duration"])
    return MotionComposition(
        id=comp_id, name="Subscribe", width=1080, height=1920, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "subscribe"},
        layers=[MotionLayer(
            id="txt", type="text", content=str(p["text"]).upper(),
            x=540, y=960, z_index=1,
            style={"fontSize": 130, "color": p["color"], "background": p["accent"],
                   "padding": 28, "borderRadius": 18, "letterSpacing": 2,
                   "shadow": "0 6px 24px rgba(0,0,0,.35)"},
            animation=MotionAnimation(
                entrance=MotionTween(type="slide", direction="right", duration=0.6, ease="back.out"),
                exit=MotionTween(type="fade", duration=0.4, ease="power2.in"),
            ),
        )],
    )


# --- NEWS / TEXT: Lower third (nombre + rol) ---
def _lower_third(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"name": "John Doe", "role": "Director",
                    "color": "#ffffff", "accent": "#1e90ff", "duration": 5.0})
    dur = float(p["duration"])
    y = 1500
    return MotionComposition(
        id=comp_id, name="Lower Third", width=1080, height=1920, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "lower-third"},
        layers=[
            MotionLayer(
                id="name", type="text", content=str(p["name"]),
                x=300, y=y, z_index=2,
                style={"fontSize": 78, "color": p["color"], "align": "left",
                       "fontWeight": "700", "background": p["accent"], "padding": 16},
                animation=MotionAnimation(
                    entrance=MotionTween(type="slide", direction="left", duration=0.5, ease="power3.out"),
                    exit=MotionTween(type="slide", direction="left", duration=0.4, ease="power2.in"),
                ),
            ),
            MotionLayer(
                id="role", type="text", content=str(p["role"]),
                x=300, y=y + 80, z_index=1, start=0.15,
                style={"fontSize": 46, "color": p["color"], "align": "left",
                       "background": "#111111", "padding": 12},
                animation=MotionAnimation(
                    entrance=MotionTween(type="slide", direction="left", duration=0.5, delay=0.15, ease="power3.out"),
                    exit=MotionTween(type="fade", duration=0.4, ease="power2.in"),
                ),
            ),
        ],
    )


# --- CINEMATIC: Title reveal ---
def _title(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {"text": "TÍTULO", "color": "#ffffff", "duration": 5.0})
    dur = float(p["duration"])
    return MotionComposition(
        id=comp_id, name="Title", width=1080, height=1920, fps=30,
        duration=dur, background="transparent",
        metadata={"template": "title"},
        layers=[MotionLayer(
            id="title", type="text", content=str(p["text"]).upper(),
            x=540, y=960, z_index=1,
            style={"fontSize": 150, "color": p["color"], "letterSpacing": 6,
                   "shadow": "0 4px 30px rgba(0,0,0,.5)"},
            animation=MotionAnimation(
                entrance=MotionTween(type="scale", from_scale=0.7, duration=0.9, ease="power3.out"),
                exit=MotionTween(type="fade", duration=0.6, ease="power2.in"),
            ),
        )],
    )


# --- DIAGRAMA: Red neuronal (procedural; el modelo NO podría emitir este JSON) ---
def _neural_network(comp_id: str, params: dict[str, Any]) -> MotionComposition:
    p = _p(params, {
        "inputs": ["X1", "X2", "X3"], "hidden": 5, "output": "GATO",
        "duration": 8.0, "width": 1920, "height": 1080,
        "node": "#39d0ff", "hidden_color": "#7aa2ff", "output_color": "#ffd166",
        "edge": "#2b6cff", "background": "#0a0e1a",
    })
    W, H = int(p["width"]), int(p["height"])
    dur = float(p["duration"])
    inputs = list(p["inputs"]) or ["X1", "X2", "X3"]
    n_hidden = max(2, min(8, int(p["hidden"])))
    layers: list[MotionLayer] = []

    def col_y(n: int, i: int) -> float:
        gap = H / (n + 1)
        return gap * (i + 1)

    x_in, x_hid, x_out = W * 0.18, W * 0.5, W * 0.82
    in_pts = [(x_in, col_y(len(inputs), i)) for i in range(len(inputs))]
    hid_pts = [(x_hid, col_y(n_hidden, i)) for i in range(n_hidden)]
    out_pt = (x_out, H / 2)

    def edge(idx, x, y, x2, y2, start, color, delay):
        return MotionLayer(
            id=f"e{idx}", type="shape", x=x, y=y, z_index=1, start=start,
            shape={"kind": "line", "x2": x2, "y2": y2, "thickness": 2, "stroke": color, "glow": 6},
            animation=MotionAnimation(entrance=MotionTween(type="draw", duration=0.5, ease="power2.out")),
            effect=MotionEffect(type="flow", duration=1.2, delay=delay),
        )

    def node(nid, x, y, r, color, start, delay):
        return MotionLayer(
            id=nid, type="shape", x=x, y=y, z_index=5, start=start,
            shape={"kind": "circle", "radius": r, "fill": color, "glow": r * 0.7},
            animation=MotionAnimation(entrance=MotionTween(type="scale", from_scale=0.4, duration=0.5, ease="back.out")),
            effect=MotionEffect(type="pulse", duration=1.4, delay=delay),
        )

    ei = 0
    # Conexiones entrada→oculta (aparecen en la fase de procesamiento).
    for (ix, iy) in in_pts:
        for k, (hx, hy) in enumerate(hid_pts):
            layers.append(edge(ei, ix, iy, hx, hy, 2.0, p["edge"], (k % 5) * 0.12)); ei += 1
    # Conexiones oculta→salida.
    for k, (hx, hy) in enumerate(hid_pts):
        layers.append(edge(ei, hx, hy, out_pt[0], out_pt[1], 3.2, p["edge"], k * 0.12)); ei += 1
    # Nodos de entrada + etiquetas.
    for i, (ix, iy) in enumerate(in_pts):
        layers.append(node(f"in{i}", ix, iy, 34, p["node"], 0.2 + i * 0.15, i * 0.2))
        layers.append(MotionLayer(id=f"lb{i}", type="text", content=str(inputs[i]) if i < len(inputs) else f"X{i+1}",
                                  x=ix - 90, y=iy, z_index=6, start=0.2 + i * 0.15,
                                  style={"fontSize": 40, "color": "#cfe8ff"},
                                  animation=MotionAnimation(entrance=MotionTween(type="fade", duration=0.4))))
    # Nodos ocultos.
    for i, (hx, hy) in enumerate(hid_pts):
        layers.append(node(f"h{i}", hx, hy, 28, p["hidden_color"], 1.8 + i * 0.08, i * 0.1))
    # Nodo de salida + predicción.
    layers.append(node("out", out_pt[0], out_pt[1], 42, p["output_color"], 5.0, 0.0))
    layers.append(MotionLayer(id="pred", type="text", content=f"Predicción: {p['output']}",
                              x=W * 0.82, y=H / 2 + 90, z_index=7, start=5.4,
                              style={"fontSize": 56, "color": p["output_color"], "fontWeight": "700"},
                              animation=MotionAnimation(entrance=MotionTween(type="slide", direction="right", duration=0.5, ease="back.out"))))
    # Resumen final.
    layers.append(MotionLayer(id="flow", type="text", content="Entrada → Procesamiento → Predicción",
                              x=W / 2, y=H * 0.92, z_index=8, start=6.8,
                              style={"fontSize": 46, "color": "#ffffff"},
                              animation=MotionAnimation(entrance=MotionTween(type="fade", duration=0.5))))

    return MotionComposition(id=comp_id, name="Red neuronal", width=W, height=H, fps=30,
                             duration=dur, background=str(p["background"]),
                             metadata={"template": "neural_network"}, layers=layers)


_TEMPLATES: dict[str, Template] = {
    t.key: t for t in [
        Template("subscribe", "Subscribe", "social",
                 "Botón de SUSCRÍBETE que entra desde la derecha con rebote.",
                 {"text": "SUSCRÍBETE", "color": "#ffffff", "accent": "#ff0033", "duration": 3.0},
                 _subscribe),
        Template("lower-third", "Lower Third", "news",
                 "Rótulo inferior con nombre y rol; entra desde la izquierda.",
                 {"name": "John Doe", "role": "Director", "color": "#ffffff", "accent": "#1e90ff", "duration": 5.0},
                 _lower_third),
        Template("title", "Title Reveal", "cinematic",
                 "Título central que aparece con un zoom elegante.",
                 {"text": "TÍTULO", "color": "#ffffff", "duration": 5.0},
                 _title),
        Template("neural_network", "Red neuronal", "diagram",
                 "Diagrama animado de red neuronal: nodos de entrada→capa oculta→salida, "
                 "conexiones que se dibujan con puntos de luz viajando, y predicción final. "
                 "Ideal para explicar visualmente cómo funciona una red neuronal.",
                 {"inputs": ["X1", "X2", "X3"], "hidden": 5, "output": "GATO",
                  "duration": 8.0, "width": 1920, "height": 1080, "background": "#0a0e1a"},
                 _neural_network),
    ]
}


def list_templates() -> list[dict[str, Any]]:
    return [{"key": t.key, "name": t.name, "category": t.category,
             "description": t.description, "parameters": t.parameters}
            for t in _TEMPLATES.values()]


def instantiate(key: str, comp_id: str, params: dict[str, Any] | None = None) -> MotionComposition:
    tpl = _TEMPLATES.get(key)
    if not tpl:
        raise KeyError(f"Template desconocido: {key}")
    return tpl.build(comp_id, params or {})
