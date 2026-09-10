"""Validación semántica de una ``MotionComposition`` antes de renderizar.

Pydantic ya valida tipos; aquí comprobamos reglas de negocio y devolvemos
mensajes entendibles para que la IA pueda corregir la composición (spec §18).
"""
from __future__ import annotations

from .models import (
    EASES,
    EFFECT_TYPES,
    ENTRANCE_TYPES,
    EXIT_TYPES,
    MVP_LAYER_TYPES,
    SHAPE_KINDS,
    SLIDE_DIRECTIONS,
    MotionComposition,
    MotionLayer,
)

MAX_DIMENSION = 8192
MAX_DURATION = 120.0
MIN_DURATION = 0.1


def _check_layer(layer: MotionLayer, comp: MotionComposition, seen_ids: set[str]) -> list[str]:
    errs: list[str] = []
    lid = layer.id
    if not lid or not lid.strip():
        errs.append("Hay una capa sin id.")
        lid = "(sin id)"
    elif lid in seen_ids:
        errs.append(f"Id de capa duplicado: '{lid}'.")
    seen_ids.add(lid)

    if layer.type not in MVP_LAYER_TYPES:
        errs.append(f"Capa '{lid}': tipo '{layer.type}' aún no soportado "
                    f"(soportado: {', '.join(MVP_LAYER_TYPES)}).")
    if layer.type == "text" and not (layer.content or "").strip():
        errs.append(f"Capa de texto '{lid}' sin contenido.")
    if layer.type == "shape":
        if layer.shape is None:
            errs.append(f"Capa de forma '{lid}' sin 'shape' (kind/fill…).")
        elif layer.shape.kind not in SHAPE_KINDS:
            errs.append(f"Capa '{lid}': forma '{layer.shape.kind}' no válida "
                        f"(válidas: {', '.join(SHAPE_KINDS)}).")
        elif layer.shape.kind == "line" and (layer.shape.x2 is None or layer.shape.y2 is None):
            errs.append(f"Capa de línea '{lid}': faltan x2/y2 (punto final).")
    if layer.effect and layer.effect.type not in EFFECT_TYPES:
        errs.append(f"Capa '{lid}': efecto '{layer.effect.type}' no válido "
                    f"(válidos: {', '.join(EFFECT_TYPES)}).")

    start = layer.start
    end = layer.end if layer.end is not None else comp.duration
    if start < 0:
        errs.append(f"Capa '{lid}': start negativo ({start}).")
    if end <= start:
        errs.append(f"Capa '{lid}': end ({end}) debe ser mayor que start ({start}).")
    if end > comp.duration + 1e-6:
        errs.append(f"Capa '{lid}': end ({end}) supera la duración de la "
                    f"composición ({comp.duration}s).")
    if not (0.0 <= layer.opacity <= 1.0):
        errs.append(f"Capa '{lid}': opacity fuera de rango [0,1] ({layer.opacity}).")
    if layer.scale <= 0:
        errs.append(f"Capa '{lid}': scale debe ser > 0 ({layer.scale}).")

    span = end - start
    for kind, tween, allowed in (
        ("entrada", layer.animation.entrance, ENTRANCE_TYPES),
        ("salida", layer.animation.exit, EXIT_TYPES),
    ):
        if tween is None:
            continue
        if tween.type not in allowed:
            errs.append(f"Capa '{lid}': animación de {kind} '{tween.type}' no válida "
                        f"(válidas: {', '.join(allowed)}).")
        if tween.type == "slide" and tween.direction not in SLIDE_DIRECTIONS:
            errs.append(f"Capa '{lid}': dirección de slide '{tween.direction}' no válida "
                        f"(válidas: {', '.join(SLIDE_DIRECTIONS)}).")
        if tween.ease not in EASES:
            errs.append(f"Capa '{lid}': ease '{tween.ease}' no permitido.")
        if tween.duration <= 0:
            errs.append(f"Capa '{lid}': duración de {kind} debe ser > 0.")
        elif tween.duration > span + 1e-6:
            errs.append(f"Capa '{lid}': la animación de {kind} ({tween.duration}s) no "
                        f"cabe en la vida de la capa ({span:.2f}s).")
    return errs


def validate(comp: MotionComposition) -> list[str]:
    """Devuelve una lista de errores (vacía = válida)."""
    errs: list[str] = []
    if not comp.id or not comp.id.strip():
        errs.append("La composición no tiene id.")
    if comp.width <= 0 or comp.width > MAX_DIMENSION:
        errs.append(f"Ancho inválido ({comp.width}); rango 1..{MAX_DIMENSION}.")
    if comp.height <= 0 or comp.height > MAX_DIMENSION:
        errs.append(f"Alto inválido ({comp.height}); rango 1..{MAX_DIMENSION}.")
    if comp.fps <= 0 or comp.fps > 120:
        errs.append(f"fps inválido ({comp.fps}); rango 1..120.")
    if not (MIN_DURATION <= comp.duration <= MAX_DURATION):
        errs.append(f"Duración inválida ({comp.duration}s); rango "
                    f"{MIN_DURATION}..{MAX_DURATION}.")
    if comp.background != "transparent" and not _is_css_color(comp.background):
        errs.append(f"Fondo '{comp.background}' no es 'transparent' ni un color #rrggbb.")

    seen: set[str] = set()
    for layer in comp.layers:
        errs.extend(_check_layer(layer, comp, seen))
    return errs


def _is_css_color(value: str) -> bool:
    v = (value or "").strip()
    if not (v.startswith("#") and len(v) in (4, 7, 9)):
        return False
    return all(c in "0123456789abcdefABCDEF" for c in v[1:])


class MotionValidationError(ValueError):
    """Composición inválida; ``errors`` lista los problemas legibles."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))
