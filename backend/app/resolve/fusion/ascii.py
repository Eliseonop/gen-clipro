"""Serializador del formato ASCII de Fusion (.setting / .comp).

Formato (verificado leyendo plantillas reales de Resolve):
    { Tools = ordered() { <Nombre> = <Op> { Inputs = {...}, ViewInfo=... } }, ActiveTool="..." }

Un input puede ser:
  - valor literal:      Key = Input { Value = 0.09, }
  - enlace a otro nodo: Key = Input { SourceOp = "Spline", Source = "Value", }
  - enum:               Key = Input { Value = FuID { "Center" }, }
  - punto (x,y):        Key = Input { Value = { 0.5, 0.5 }, }

Este módulo NO conoce nada de subtítulos: solo emite ASCII correcto.
"""
from __future__ import annotations

from typing import Iterable


# Tipos de "valor especial" para inputs, como tuplas con etiqueta.
def link(op: str, source: str = "Value") -> tuple:
    return ("link", op, source)


def fuid(name: str) -> tuple:
    return ("fuid", name)


def point(x: float, y: float) -> tuple:
    return ("point", x, y)


def fnum(v: float | int) -> str:
    """Número en formato Fusion: entero si es integral, si no decimal limpio."""
    f = float(v)
    if f == int(f):
        return str(int(f))
    return f"{f:.6f}".rstrip("0").rstrip(".")


def _esc(s: str) -> str:
    return (str(s).replace("\\", "\\\\").replace('"', '\\"')
            .replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n"))


def inp(value) -> str:
    """Renderiza el ``Input { ... }`` completo para un valor."""
    if isinstance(value, tuple):
        tag = value[0]
        if tag == "link":
            return f'Input {{ SourceOp = "{value[1]}", Source = "{value[2]}", }}'
        if tag == "fuid":
            return f'Input {{ Value = FuID {{ "{value[1]}" }}, }}'
        if tag == "point":
            return f'Input {{ Value = {{ {fnum(value[1])}, {fnum(value[2])} }}, }}'
    if isinstance(value, bool):
        return f"Input {{ Value = {1 if value else 0}, }}"
    if isinstance(value, (int, float)):
        return f"Input {{ Value = {fnum(value)}, }}"
    return f'Input {{ Value = "{_esc(value)}", }}'


def tool(name: str, op_type: str, inputs: Iterable[tuple[str, object]],
         pos: tuple[float, float] | None = None) -> str:
    """Emite un operador con sus inputs (en orden) y su ViewInfo."""
    lines = [f"\t\t{name} = {op_type} {{", "\t\t\tInputs = {"]
    for key, value in inputs:
        lines.append(f"\t\t\t\t{key} = {inp(value)},")   # coma final: Fusion la exige
    lines.append("\t\t\t},")
    if pos is not None:
        lines.append(f"\t\t\tViewInfo = OperatorInfo {{ Pos = {{ {fnum(pos[0])}, {fnum(pos[1])} }} }},")
    lines.append("\t\t},")
    return "\n".join(lines) + "\n"


def spline(name: str, keys: Iterable[tuple[float, float]],
           color: tuple[int, int, int] = (237, 142, 243), step: bool = False) -> str:
    """Emite un BezierSpline con keyframes ``[frame] = { valor }``.

    ``step=True`` hace cambios instantáneos (StepIn); si no, interpolación lineal.
    """
    flag = "StepIn = true" if step else "Linear = true"
    body = ",\n".join(
        f"\t\t\t\t[{int(f)}] = {{ {fnum(v)}, Flags = {{ {flag} }} }}"
        for f, v in keys
    )
    return (
        f"\t\t{name} = BezierSpline {{\n"
        f"\t\t\tSplineColor = {{ Red = {color[0]}, Green = {color[1]}, Blue = {color[2]} }},\n"
        f"\t\t\tNameSet = true,\n"
        f"\t\t\tKeyFrames = {{\n{body}\n\t\t\t}}\n"
        f"\t\t}},\n"
    )


def setting(tools: Iterable[str], active: str) -> str:
    """Envuelve una lista de tools ya serializados en un .setting completo."""
    return (
        "{\n\tTools = ordered() {\n"
        + "".join(tools)
        + "\t},\n"
        + f'\tActiveTool = "{active}"\n'
        + "}\n"
    )
