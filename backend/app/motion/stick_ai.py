"""IA de HISTORIAS CON STICKMAN: guion → storyboard (JSON) para ``stick.js``.

La IA solo decide la puesta en escena con un vocabulario cerrado (poses,
expresiones, efectos, cámara, escenario); el motor hace la animación. Primero fija
un reparto (character bible) que no cambia entre planos y reutiliza el reparto
existente del proyecto para mantener la continuidad entre escenas.
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from ..ai.providers import get_provider
from . import stick
from .generate import _extract_json

MAX_ATTEMPTS = 2


def _vocab(d: dict[str, str]) -> str:
    return ", ".join(f"{k} ({v})" for k, v in d.items())


def system_prompt() -> str:
    return "\n\n".join([
        "Eres director de animación y storyboard artist. Conviertes un guion o idea en una "
        "escena animada de STICKMAN (figuras de palitos con ropa de color) para vídeo corto. "
        "No dibujas: eliges la puesta en escena con un vocabulario CERRADO y un motor la anima.",
        "PROCESO: 1) Fija el REPARTO (character bible): cada personaje con aspecto fijo (cuerpo, "
        "pelo, ropa y colores). Ese aspecto NO cambia nunca entre planos. 2) Elige UN escenario. "
        "3) Divide la historia en 3-7 PLANOS de 1.2-4 s que cuenten la acción con claridad: "
        "planteamiento → giro → reacción. 4) En cada plano elige cámara, poses, expresiones, "
        "posiciones y efectos que hagan legible lo que pasa.",
        "VOCABULARIO (usa SOLO estas claves):\n"
        f"- pose: {_vocab(stick.POSES)}\n"
        f"- expression: {_vocab(stick.EXPRESSIONS)}\n"
        f"- fx: {_vocab(stick.FX)}\n"
        f"- camera: {_vocab(stick.CAMERAS)}\n"
        f"- environment.preset: {_vocab(stick.ENVIRONMENTS)}\n"
        f"- style.preset: {_vocab(stick.STYLES)}\n"
        f"- body: {_vocab(stick.BODIES)} · hair: {_vocab(stick.HAIRS)}\n"
        f"- outfit: {_vocab(stick.OUTFITS)} · accessory: {_vocab(stick.ACCESSORIES)}",
        "PUESTA EN ESCENA:\n"
        "- x = posición horizontal 0..1 (0 izquierda, 1 derecha; <0 o >1 = fuera de cuadro). "
        "Para entrar/salir o desplazarse usa to_x con pose walk/run. Separa a los personajes ≥0.3.\n"
        "- facing: 1 mira a la derecha, -1 a la izquierda. Si dos personajes interactúan, que se miren.\n"
        "- Continuidad: un personaje que sigue en el plano siguiente mantiene su x (salvo que se mueva) "
        "y su pose de partida debe tener sentido (tras fall → lie; tras lie → lie o get_up).\n"
        "- Cámara: empieza con wide para situar; usa medium/close + focus (id) en el momento clave o la reacción.\n"
        "- fx con target (id) y at (segundos dentro del plano) para marcar el instante: impact en un golpe, "
        "shake en un frenazo/choque, exclaim/question para sorpresa/duda, laugh para risas, speed al correr.\n"
        "- moving (bool, solo escenario bus): true si el bus avanza, false si está detenido o frena.\n"
        "- caption: texto breve en pantalla (≤ 6 palabras, en el idioma del guion) solo en planos que lo "
        "necesiten; description: qué ocurre en el plano (1 frase, en el idioma del guion).",
        "CONTENIDO SENSIBLE: si hay violencia, accidentes o agresiones, represéntalos de forma NO gráfica: "
        "poses (strike/push/hit/fall), líneas de impacto y reacciones; nunca sangre, heridas ni armas en "
        "detalle. La identidad de un personaje (origen, edad, etc.) se refleja con respeto en 'description' "
        "y en ropa/pelo; nunca con rasgos caricaturizados ni estereotipos.",
        "RESPONDE EXCLUSIVAMENTE con un objeto JSON (sin ``` ni texto):\n"
        "{\n"
        '  "title": "título corto", "logline": "la historia en 1 frase",\n'
        '  "style": {"preset": "clean", "captions": true},\n'
        '  "environment": {"preset": "bus", "description": "detalle del lugar"},\n'
        '  "characters": [{"id": "leo", "name": "Leo", "role": "protagonista", "body": "man", '
        '"hair": "short", "outfit": "shirt_pants", "shirt": "#2563eb", "pants": "#334155", '
        '"accessory": "none", "description": "aspecto y rasgos para prompts"}],\n'
        '  "shots": [{"duration": 2.0, "description": "...", "caption": "", "camera": "wide", '
        '"focus": "leo", "moving": true, "fx": [{"type": "shake", "at": 0.3}], '
        '"actors": [{"id": "leo", "pose": "hold_rail", "expression": "neutral", "x": 0.35, "facing": 1}]}]\n'
        "}",
    ])


def user_prompt(script: str, *, duration: float | None, style: str | None,
                environment: str | None, cast: list[dict[str, Any]]) -> str:
    parts = [f"GUION / IDEA:\n{script.strip()}"]
    if duration:
        parts.append(f"Duración total objetivo: {duration:g} s (reparte los planos para sumarla).")
    if style and style in stick.STYLES:
        parts.append(f"Estilo visual obligatorio: style.preset = {style}.")
    if environment and environment in stick.ENVIRONMENTS and environment != "auto":
        parts.append(f"Escenario obligatorio: environment.preset = {environment}.")
    if cast:
        sheet = [{k: c.get(k) for k in ("id", "name", "role", "body", "hair", "hair_color", "outfit",
                                        "shirt", "pants", "accessory", "accent_color", "description")}
                 for c in cast]
        parts.append(
            "REPARTO YA EXISTENTE EN EL PROYECTO (continuidad): si el guion usa a alguno de estos "
            "personajes, REUTILIZA exactamente su id y su aspecto; crea nuevos solo si hace falta:\n"
            + json.dumps(sheet, ensure_ascii=False))
    parts.append("Devuelve SOLO el JSON del storyboard.")
    return "\n\n".join(parts)


def _merge_cast(sb: dict[str, Any], cast: list[dict[str, Any]]) -> dict[str, Any]:
    """Fuerza el aspecto del reparto existente (la IA a veces 'retoca' la ropa)."""
    by_id = {c["id"]: c for c in cast if isinstance(c, dict) and c.get("id")}
    for ch in sb.get("characters") or []:
        prev = by_id.get(ch.get("id"))
        if prev:
            for k in ("body", "hair", "hair_color", "outfit", "shirt", "pants", "accessory", "accent_color"):
                if prev.get(k) is not None:
                    ch[k] = prev[k]
            if prev.get("description") and not ch.get("description"):
                ch["description"] = prev["description"]
    return sb


async def storyboard_stream(*, script: str, duration: float | None = None, style: str | None = None,
                            environment: str | None = None,
                            cast: list[dict[str, Any]] | None = None) -> AsyncIterator[dict]:
    """Eventos: start / status / storyboard / error / done."""
    if not (script or "").strip():
        yield {"type": "error", "message": "Escribe primero qué pasa en la escena."}
        return
    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        yield {"type": "error", "message": reason}
        return

    cast = cast or []
    yield {"type": "start"}
    yield {"type": "status", "message": "Creando reparto y planos…"}
    msg = user_prompt(script, duration=duration, style=style, environment=environment, cast=cast)

    async def no_tools(name: str, args: dict) -> dict:
        return {"ok": False, "text": "Sin herramientas: responde con el JSON."}

    for attempt in range(MAX_ATTEMPTS):
        captured = {"text": ""}

        async def emit(ev: dict) -> None:
            if ev.get("type") == "text":
                captured["text"] += ev.get("delta", "")

        try:
            await provider.run(system=system_prompt(), history=[], user_message=msg, tools=[],
                               call_tool=no_tools, emit=emit, max_iters=1)
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"Error del modelo: {exc}"}
            return
        obj = _extract_json(captured["text"])
        if obj and isinstance(obj.get("shots"), list) and obj["shots"]:
            obj["script"] = script.strip()
            if style in stick.STYLES:
                obj.setdefault("style", {})
                if isinstance(obj["style"], dict):
                    obj["style"]["preset"] = style
            sb = stick.normalize(_merge_cast(obj, cast), duration=duration)
            yield {"type": "storyboard", "storyboard": sb}
            yield {"type": "done"}
            return
        yield {"type": "status", "message": "Ajustando el storyboard…"}
        msg = msg + "\n\nTu respuesta anterior no era un JSON válido con 'shots'. Devuelve SOLO el objeto JSON."

    yield {"type": "error", "message": "La IA no devolvió un storyboard válido. Prueba otra vez."}


async def storyboard_sse(**kwargs) -> AsyncIterator[str]:
    async for ev in storyboard_stream(**kwargs):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
