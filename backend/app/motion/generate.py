"""Generación asistida de motion graphics ("Generar Motion", fase de PROPUESTA).

La IA recibe SOLO el contexto de un tramo (``segment_context``) y propone UNA
idea de motion graphic como JSON estricto, sin historial de conversación y sin
tocar la timeline. Esta capa es previa a crear la composición (fase 3): aquí solo
se decide QUÉ hacer.

Reutiliza el proveedor de IA configurado (``ai.providers``) y la guía de motion
(``help_content.HELP['motion']``) para no duplicar instrucciones.
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from ..ai.providers import get_provider
from ..mcp_server import help_content
from . import segment_context, themes

# Esquema de la propuesta que devuelve la IA.
PROPOSAL_KEYS = ("type", "title", "concept", "duration", "background", "elements")
MAX_ATTEMPTS = 2

_FRAMES_TOOL = {
    "name": "motion_segment_frames",
    "description": ("Devuelve un montage (imagen) de fotogramas del tramo actual para que VEAS "
                    "qué se muestra en pantalla (sale de la fuente del vídeo, sin overlays). "
                    "Llámala UNA vez, sin argumentos, antes de proponer."),
    "parameters": {"type": "object", "properties": {}, "required": []},
}


def _system_prompt(*, frames: bool) -> str:
    guide = help_content.guide("motion") or ""
    lines = [
        "Eres un diseñador de motion graphics para vídeo vertical. Recibes el "
        "contexto de UN tramo de la timeline (el guion de ese momento, lo que ya "
        "hay en pantalla, los assets y el estilo) y propones UNA idea de motion "
        "graphic que refuerce lo que se dice en ese instante.",
        "ESTILO: representación de CONCEPTO. El motion DIBUJA/ILUSTRA lo que se dice "
        "(una red neuronal, un cerebro, dos figuras, objetos que aparecen en secuencia…), "
        "no un cartel de texto. Puede tener profundidad y sombreado SUTIL (degradados "
        "suaves, sombra proyectada blanda, ligera perspectiva) para que se vea con volumen, "
        "SIN exagerar: nada de neón, glow fuerte ni colores saturados, y un solo acento "
        "sobrio. Movimiento sutil y elegante (fade + desplazamiento corto, apariciones "
        "encadenadas), nunca rebotes ni giros llamativos.",
        "Piensa como director: primero decide QUÉ figura/ilustración representa la idea del "
        "guion en ese instante y cómo aparece animada. Las tarjetas de texto, citas, listas "
        "o números SOLO cuando el guion es literalmente un dato, una cifra, una comparación "
        "o una frase para destacar; en el resto, representa el concepto con figuras/SVG. Si "
        "hay texto, que sea corto e INTEGRADO en la escena (animado con lo demás), no un "
        "cartel. Un solo protagonista domina, con espacio y un único acento. Respeta la "
        "franja de subtítulos (style.avoidY) y no repitas lo que ya está en pantalla (mira "
        "existingElements y motionInRange).",
        guide,
        "RESPONDE EXCLUSIVAMENTE con un objeto JSON (sin texto alrededor, sin ```):\n"
        "{\n"
        '  "type": "concept" | "diagram" | "callout" | "title" | "lower_third" | "list" | "quote" | "stat",\n'
        '  "title": "nombre corto de la idea",\n'
        '  "concept": "1-3 frases: qué muestra, por qué encaja con el guion y cómo se anima",\n'
        '  "duration": número en segundos (usa la duración del tramo salvo buena razón),\n'
        '  "background": "transparent" (overlay sobre el vídeo) | "opaque" (tapa el vídeo),\n'
        '  "elements": ["textos/figuras clave que llevaría, en orden"]\n'
        "}",
    ]
    if frames:
        lines.insert(2, "Tienes una herramienta para VER fotogramas del tramo: úsala UNA vez "
                        "antes de proponer para ajustar la idea a lo que se ve.")
    return "\n\n".join(x for x in lines if x)


def _user_prompt(ctx: dict, hint: str) -> str:
    sc = ctx.get("scriptContext") or {}
    tl = ctx.get("timelineContext") or {}
    sel = ctx.get("selection") or {}
    style = ctx.get("style") or {}
    fmt = style.get("format") or {}
    parts = [
        f"Tramo: {sel.get('start')}s – {sel.get('end')}s (duración {sel.get('duration')}s).",
        f"Formato: {fmt.get('width')}x{fmt.get('height')} @ {fmt.get('fps')}fps (vertical).",
        "Guion en este momento:",
        f"  · antes: {sc.get('previous') or '—'}",
        f"  · AHORA: {sc.get('current') or '(nadie habla)'}",
        f"  · después: {sc.get('next') or '—'}",
    ]
    if sc.get("keyTerms"):
        parts.append("Términos clave: " + ", ".join(sc["keyTerms"]))
    on = tl.get("existingElements") or []
    if on:
        parts.append("Ya en pantalla: " + "; ".join(
            f"{e.get('name') or e.get('kind')} ({e.get('kind')})" for e in on[:8]))
    if tl.get("motionInRange"):
        parts.append("Ya hay motion en el tramo: " + ", ".join(
            m.get("name", "?") for m in tl["motionInRange"]))
    assets = ctx.get("availableAssets") or []
    hot = [a.get("label") for a in assets if a.get("match")]
    if hot:
        parts.append("Assets relacionados: " + "; ".join(str(x) for x in hot[:6]))
    if style.get("accent"):
        parts.append(f"Color de acento del proyecto: {style['accent']}")
    if style.get("avoidY"):
        parts.append(f"No tapes la franja vertical y∈{style['avoidY']} (subtítulos).")
    if (hint or "").strip():
        parts.append("Indicación del usuario: " + hint.strip())
    parts.append("Propón la mejor idea para este tramo. Devuelve SOLO el JSON.")
    return "\n".join(parts)


def _extract_json(text: str) -> dict | None:
    """Saca el objeto JSON de la respuesta del modelo (tolera ``` y prosa)."""
    if not text:
        return None
    t = text.strip()
    if "```" in t:
        # Quita cercas ```json ... ```
        import re
        m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
        if m:
            t = m.group(1).strip()
    i, j = t.find("{"), t.rfind("}")
    if i < 0 or j <= i:
        return None
    try:
        obj = json.loads(t[i:j + 1])
        return obj if isinstance(obj, dict) else None
    except (ValueError, TypeError):
        return None


def _normalize(obj: dict, ctx: dict) -> dict:
    sel = ctx.get("selection") or {}
    default_dur = float(sel.get("duration") or 4.0)
    try:
        dur = float(obj.get("duration"))
        if dur <= 0:
            dur = default_dur
    except (TypeError, ValueError):
        dur = default_dur
    bg = str(obj.get("background") or "transparent").strip().lower()
    if bg not in ("transparent", "opaque"):
        bg = "opaque" if bg.startswith("#") else "transparent"
    elements = obj.get("elements")
    if not isinstance(elements, list):
        elements = [str(elements)] if elements else []
    return {
        "type": str(obj.get("type") or "motion").strip() or "motion",
        "title": str(obj.get("title") or "Motion graphic").strip() or "Motion graphic",
        "concept": str(obj.get("concept") or "").strip(),
        "duration": round(dur, 3),
        "background": bg,
        "elements": elements[:12],
    }


async def propose_stream(project_id: str, *, ctx: dict, hint: str = "",
                         frames: bool = False) -> AsyncIterator[dict]:
    """Emite eventos SSE: start / status / text / tool_start / tool_result /
    proposal / error / done. ``proposal`` lleva la idea ya normalizada."""
    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        yield {"type": "error", "message": reason}
        return

    # Foco: para que motion_segment_frames (sin args) use este tramo.
    sel = ctx.get("selection") or {}
    if sel.get("start") is not None:
        segment_context.set_focus(project_id, start=float(sel["start"]),
                                  end=sel.get("end"), playhead=ctx.get("currentTime"))

    async def call_tool(name: str, args: dict) -> dict:
        if name != "motion_segment_frames":
            return {"ok": False, "text": f"Herramienta no permitida aquí: {name}"}
        from ..mcp_server import tools_motion
        try:
            data = tools_motion.motion_segment_frames(project_id, **(args or {}))
            return {"ok": True, "data": data, "text": data.get("note", "")}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "text": str(exc)}

    yield {"type": "start"}
    user_msg = _user_prompt(ctx, hint)
    proposal = None
    for attempt in range(MAX_ATTEMPTS):
        captured = {"text": ""}
        events: list[dict] = []

        async def emit(ev: dict) -> None:
            if ev.get("type") == "text":
                captured["text"] += ev.get("delta", "")
            if ev.get("type") in ("status", "text", "tool_start", "tool_result"):
                events.append(ev)

        use_frames = frames and attempt == 0
        try:
            await provider.run(
                system=_system_prompt(frames=use_frames), history=[],
                user_message=user_msg, tools=[_FRAMES_TOOL] if use_frames else [],
                call_tool=call_tool, emit=emit, max_iters=3 if use_frames else 1,
            )
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"Error del modelo: {exc}"}
            return

        for ev in events:
            yield ev

        obj = _extract_json(captured["text"])
        if obj is not None:
            proposal = _normalize(obj, ctx)
            break
        # Reintento: fuerza JSON puro, sin fotogramas.
        user_msg = (_user_prompt(ctx, hint)
                    + "\n\nTu respuesta anterior no era un JSON válido. Devuelve SOLO "
                      "el objeto JSON pedido, sin texto ni ```.")

    if proposal is None:
        yield {"type": "error", "message": "La IA no devolvió una propuesta válida. Reintenta."}
        return
    yield {"type": "proposal", "proposal": proposal}
    yield {"type": "done"}


# --- Fase 3: generación de la composición (borrador con preview) --------------

CREATE_MAX_ITERS = 6

# Herramientas que puede usar la IA al GENERAR (subconjunto de motion). Sin
# add_to_timeline: aquí solo se crea el borrador; insertarlo es un paso aparte.
_CREATE_TOOLS = [
    {"name": "motion_list_templates",
     "description": "Lista los templates de motion graphics (subscribe, lower-third, "
                    "title, neural_network…) con sus parámetros.",
     "parameters": {"type": "object", "properties": {}, "required": []}},
    {"name": "motion_create_composition",
     "description": "Crea la composición del motion graphic. Pasa 'composition' (JSON con "
                    "layers/estilos/animaciones) o 'template' + 'params'. La duración y el "
                    "formato del tramo se fuerzan automáticamente. Devuelve composition_id.",
     "parameters": {"type": "object", "properties": {
         "composition": {"type": "object"},
         "template": {"type": "string"},
         "params": {"type": "object"},
     }, "required": []}},
    {"name": "motion_update_composition",
     "description": "Corrige la composición ya creada (mismo borrador) si algo falló o "
                    "para afinarla. Pasa 'composition' con el JSON completo.",
     "parameters": {"type": "object", "properties": {
         "composition": {"type": "object"},
     }, "required": ["composition"]}},
]


# Filosofía de movimiento: lo que separa un motion pro y limpio de "texto + una línea".
MOTION_PHILOSOPHY = (
    "FILOSOFÍA DE DISEÑO (obligatoria — representación de concepto, sobria):\n"
    "1. UN protagonista por plano: una figura/ilustración (o un dato) DOMINA; lo demás "
    "es soporte. Nada compite con el elemento principal.\n"
    "2. REPRESENTA la idea: dibuja el concepto del guion con figuras/SVG (redes, cerebros, "
    "objetos, siluetas, flechas, apariciones encadenadas de elementos). Las TARJETAS de "
    "texto solo cuando el contenido es puramente datos, cifras, comparaciones o una frase "
    "para destacar. Si hay texto, corto e INTEGRADO en la escena, no un cartel suelto.\n"
    "3. Profundidad y sombreado SUTIL permitidos: degradados suaves, sombra proyectada "
    "blanda, ligera perspectiva CSS para dar volumen. Pero SIN exagerar: nada de neón, glow "
    "fuerte ni colores saturados; UN acento sobrio del tema.\n"
    "4. Jerarquía tipográfica: display grueso (Inter 800) para el titular/dato, cuerpo "
    "legible para el resto, antetítulo pequeño en acento o gris.\n"
    "5. Movimiento SUTIL y elegante: entradas con fade + desplazamiento corto (16–44px) "
    "usando power2.out/power3.out; reveals con power2.inOut y apariciones encadenadas "
    "(stagger 0.08–0.15s). NUNCA back/elastic/bounce (rebotes) ni giros llamativos.\n"
    "6. Remate discreto: un fade o un elemento que se asienta; sin efectos estridentes.\n"
    "7. Respeta la franja de subtítulos (style.avoidY): no la tapes.\n"
    "8. Sincroniza con el guion: el motion refuerza lo que se dice en ese instante."
)


def _theme_brief(theme: dict) -> str:
    return (
        "MARCA / TOKENS (úsalos, no inventes colores ni fuentes):\n"
        f"- fondo: {theme['bg']}  · superficie: {theme['surface']}\n"
        f"- texto: {theme['text']}  · apagado: {theme['muted']}\n"
        f"- ACENTO: {theme['accent']} (úsalo para lo que quieres resaltar)\n"
        f"- fuente display (titulares/datos): {theme['font_display']}\n"
        f"- fuente cuerpo: {theme['font_body']}  · radio: {theme['radius']}px\n"
        "En plantillas pasa params theme y accent; en JSON pon estos valores en style.font/color."
    )


def _create_system_prompt(theme: dict) -> str:
    guide = help_content.guide("motion") or ""
    return "\n\n".join(x for x in [
        "Eres un DIRECTOR de motion graphics de nivel profesional. Generas UNA composición "
        "que REPRESENTA el concepto del tramo (dibuja/ilustra la idea con figuras animadas), "
        "a partir de la idea aprobada. Puede tener profundidad y sombreado SUTIL (degradados "
        "suaves, sombra blanda, ligera perspectiva) para dar volumen, pero SIN exagerar: "
        "nada de neón, glow fuerte ni colores saturados, y un solo acento sobrio del tema.",
        _theme_brief(theme),
        MOTION_PHILOSOPHY,
        "CÓMO CONSTRUIRLA — elige la vía correcta:\n"
        "(A) Vía PRINCIPAL para representar un concepto: una CAPA type:'html' (bloque "
        "HTML+GSAP) con SVG/figuras que ilustran la idea. Es la que permite dibujar redes, "
        "cerebros, objetos, apariciones encadenadas y profundidad. IMPORTANTE: la capa html "
        "a pantalla completa va con x=0, y=0, width=W, height=H (origen ARRIBA-IZQUIERDA; "
        "llena el lienzo). NO la centres con x=W/2,y=H/2 (eso empuja el contenido fuera de "
        "cuadro). Solo las capas text/shape usan x,y = CENTRO en px.\n"
        "(B) Si la idea es puramente un dato/lista/cita/título, usa una PLANTILLA (pro_title, "
        "title, bullet_list, quote, stat, bar_chart, lower-third, subscribe, neural_network): "
        "motion_list_templates → motion_create_composition con template+params (theme y "
        "accent). No fuerces plantilla cuando el guion pide representar un concepto.\n"
        "REGLAS de la capa html (para la vía A): {type:'html', html, css, js}. "
        "'html' = markup SIN <script>; 'css' = estilos; 'js' = CUERPO de una función "
        "(tl, root, gsap, ctx) que añade tweens a la timeline 'tl' del bloque (queda "
        "seekable/determinista). ctx={width,height,duration,life,start,end,theme}. Reglas del "
        "bloque (OBLIGATORIAS): usa SIEMPRE tl.fromTo(el,{estado inicial},{estado final,...}) "
        "y NUNCA tl.from()/tl.to() para animar entradas — con .from() el preview se rebobina mal "
        "y en la 2ª reproducción los elementos quedan invisibles; .fromTo() es seekable hacia "
        "atrás. NADA de Date.now/Math.random (rompe el render determinista); para contar un "
        "número anima un objeto proxy con fromTo({v:0},{v:target,onUpdate...}) y escribe "
        "textContent en onUpdate; envuelve <img>/<video> en un <div> y anima el <div> (nunca "
        "width/height/top/left del media directamente).\n"
        "(D) Para overlays simples de texto/formas, emite 'composition' con layers text/shape.",
        "REGLAS: (1) UNA sola llamada a motion_create_composition con TODO. (2) NO uses "
        "motion_add_to_timeline (aquí solo se crea el borrador). (3) Si el validador da error, "
        "corrige con motion_update_composition. (4) No expliques; solo llama a las herramientas. "
        "La duración y el formato ya se fuerzan al tramo.",
        guide,
    ] if x)


def _create_user_prompt(ctx: dict, proposal: dict) -> str:
    sel = ctx.get("selection") or {}
    style = ctx.get("style") or {}
    fmt = style.get("format") or {}
    sc = ctx.get("scriptContext") or {}
    parts = [
        "IDEA APROBADA:",
        f"  · tipo: {proposal.get('type')}",
        f"  · título: {proposal.get('title')}",
        f"  · concepto: {proposal.get('concept')}",
        f"  · fondo: {proposal.get('background')} "
        f"({'overlay sobre el vídeo' if proposal.get('background') == 'transparent' else 'tapa el vídeo'})",
    ]
    if proposal.get("elements"):
        els = [e if isinstance(e, str) else (e.get("name") or e.get("content") or str(e))
               for e in proposal["elements"]]
        parts.append("  · elementos: " + "; ".join(els))
    parts += [
        f"Duración del tramo: {sel.get('duration')}s. Formato: "
        f"{fmt.get('width')}x{fmt.get('height')} @ {fmt.get('fps')}fps (vertical).",
    ]
    if sc.get("current"):
        parts.append(f"Guion en ese momento: «{sc['current']}»")
    if style.get("accent"):
        parts.append(f"Color de acento del proyecto: {style['accent']} (úsalo como acento).")
    if style.get("avoidY"):
        parts.append(f"No coloques nada en la franja vertical y∈{style['avoidY']} (subtítulos).")
    parts.append("Genera la composición ahora.")
    return "\n".join(parts)


async def create_stream(project_id: str, *, ctx: dict, proposal: dict,
                        variant_of: str | None = None) -> AsyncIterator[dict]:
    """Genera el BORRADOR de composición para el tramo. Emite start / status / text /
    tool_start / tool_result / created / error / done. ``created`` lleva composition_id.

    ``variant_of`` (Regenerar): actualiza ESE borrador en vez de crear otro."""
    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        yield {"type": "error", "message": reason}
        return

    sel = ctx.get("selection") or {}
    if sel.get("start") is None or sel.get("end") is None:
        yield {"type": "error", "message": "Falta el rango del tramo."}
        return
    for_range = {"start": float(sel["start"]), "end": float(sel["end"])}
    theme = themes.resolve_theme(None, accent=(ctx.get("style") or {}).get("accent"))

    queue: asyncio.Queue = asyncio.Queue()
    state = {"cid": variant_of}   # id del borrador (se reutiliza si ya existe)

    async def emit(ev: dict) -> None:
        await queue.put(ev)

    async def call_tool(name: str, args: dict) -> dict:
        from ..mcp_server import tools_motion
        args = dict(args or {})
        try:
            if name == "motion_list_templates":
                return {"ok": True, "data": tools_motion.motion_list_templates()}
            if name == "motion_create_composition":
                args["for_range"] = for_range
                if state["cid"]:
                    # Ya hay borrador (regenerar o segunda llamada): actualízalo, no crees otro.
                    comp = args.get("composition")
                    if comp is None and args.get("template"):
                        # Instancia el template y actualiza el mismo id.
                        tmp = tools_motion.motion_create_composition(project_id, **args)
                        # tmp es un borrador nuevo; fusiónalo sobre el id fijo y borra el temporal.
                        from . import service as motion_service
                        new = motion_service.get_composition(project_id, tmp["composition_id"])
                        motion_service.delete_composition(project_id, tmp["composition_id"])
                        data = tools_motion.motion_update_composition(
                            project_id, state["cid"], new.model_dump(), for_range=for_range)
                    else:
                        data = tools_motion.motion_update_composition(
                            project_id, state["cid"], comp or {}, for_range=for_range)
                else:
                    data = tools_motion.motion_create_composition(project_id, **args)
                    state["cid"] = data.get("composition_id")
                return {"ok": True, "data": data}
            if name == "motion_update_composition":
                if not state["cid"]:
                    return {"ok": False, "text": "Crea la composición primero con motion_create_composition."}
                data = tools_motion.motion_update_composition(
                    project_id, state["cid"], args.get("composition") or {}, for_range=for_range)
                return {"ok": True, "data": data}
            return {"ok": False, "text": f"Herramienta no permitida al generar: {name}"}
        except Exception as exc:  # noqa: BLE001  (incluye MCPError → texto para que la IA corrija)
            return {"ok": False, "text": getattr(exc, "message", None) or str(exc)}

    async def worker() -> None:
        try:
            await provider.run(
                system=_create_system_prompt(theme), history=[],
                user_message=_create_user_prompt(ctx, proposal), tools=_CREATE_TOOLS,
                call_tool=call_tool, emit=emit, max_iters=CREATE_MAX_ITERS,
            )
        except Exception as exc:  # noqa: BLE001
            await emit({"type": "error", "message": f"Error del modelo: {exc}"})
        finally:
            await queue.put(None)

    yield {"type": "start"}
    task = asyncio.create_task(worker())
    try:
        while True:
            ev = await queue.get()
            if ev is None:
                break
            yield ev
    finally:
        await task

    if state["cid"]:
        from . import service as motion_service
        comp = motion_service.get_composition(project_id, state["cid"])
        yield {"type": "created", "composition_id": state["cid"],
               "version": comp.version if comp else None,
               "duration": comp.duration if comp else None}
    else:
        yield {"type": "error", "message": "La IA no llegó a generar la composición. Reintenta."}
    yield {"type": "done"}


async def sse(project_id: str, **kwargs) -> AsyncIterator[str]:
    """Envuelve ``propose_stream`` como stream SSE (``data: {json}\\n\\n``)."""
    async for ev in propose_stream(project_id, **kwargs):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"


async def create_sse(project_id: str, **kwargs) -> AsyncIterator[str]:
    """Envuelve ``create_stream`` como stream SSE."""
    async for ev in create_stream(project_id, **kwargs):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
