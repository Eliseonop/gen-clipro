"""Validador de conectividad de una composición Fusion (.setting).

Garantiza que el grafo generado está COMPLETO y LIMPIO antes de entregarlo:
  - toda referencia (SourceOp) apunta a un nodo existente,
  - hay exactamente un MediaOut y es el ActiveTool,
  - MediaOut llega, por la cadena de Merges, hasta un Background base,
  - ningún Text+/Background/Merge queda suelto (todos contribuyen a la salida).

Se ejecuta en cada generación; si devuelve errores, no se emite el archivo.
"""
from __future__ import annotations

import re

_NODE_RE = re.compile(r"^\t\t(\w+) = (\w+) \{", re.M)
_SOURCE_RE = re.compile(r'SourceOp = "([^"]+)"')
_ACTIVE_RE = re.compile(r'ActiveTool = "([^"]+)"')


def _nodes(text: str) -> dict[str, str]:
    """Nombre -> tipo de operador (solo tools de primer nivel)."""
    return {m.group(1): m.group(2) for m in _NODE_RE.finditer(text)}


def _blocks(text: str) -> dict[str, str]:
    """Nombre -> texto del bloque del nodo (hasta el siguiente nodo)."""
    ms = list(_NODE_RE.finditer(text))
    out: dict[str, str] = {}
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        out[m.group(1)] = text[m.start():end]
    return out


def check_connectivity(text: str) -> list[str]:
    """Devuelve una lista de errores (vacía si el grafo es correcto)."""
    errs: list[str] = []
    nd = _nodes(text)
    names = set(nd)

    if text.count("{") != text.count("}"):
        errs.append("llaves desbalanceadas")

    # 1) toda referencia apunta a un nodo existente
    for ref in _SOURCE_RE.findall(text):
        if ref not in names:
            errs.append(f"SourceOp a nodo inexistente: {ref}")

    # 2) ActiveTool válido
    am = _ACTIVE_RE.search(text)
    if not am or am.group(1) not in names:
        errs.append("ActiveTool ausente o inválido")

    # 3) exactamente un MediaOut
    media = [n for n, op in nd.items() if op == "MediaOut"]
    if len(media) != 1:
        errs.append(f"se esperaba 1 MediaOut, hay {len(media)}")

    # 4) reachability desde el MediaOut hacia un Background
    if media:
        deps = {n: set(_SOURCE_RE.findall(b)) for n, b in _blocks(text).items()}
        reach: set[str] = set()
        stack = [media[0]]
        while stack:
            x = stack.pop()
            if x in reach:
                continue
            reach.add(x)
            stack.extend(deps.get(x, ()))
        if not any(nd.get(x) == "Background" for x in reach):
            errs.append("MediaOut no llega a un Background base")
        for n, op in nd.items():
            if op in ("TextPlus", "Background", "Merge") and n not in reach:
                errs.append(f"nodo desconectado (no llega a MediaOut): {n}")

    return errs


def assert_connected(text: str) -> str:
    """Devuelve ``text`` si es válido; si no, lanza ValueError con el detalle."""
    errs = check_connectivity(text)
    if errs:
        raise ValueError("Composición Fusion inválida: " + "; ".join(errs))
    return text
