"""Tools de DIRECCIÓN DE ESCENA: la escaleta de tramos del guion y su pack de contexto.

Cierra el gap del doc `docs/DIRECCION_ESCENA_FLUJO_Y_MCP.md` (§2.2 A/D/E): hasta
ahora la cadena de dirección de escena vivía solo en HTTP + UI y el MCP solo
conocía Motion. Estos tools son envolturas finas de ``app/scene_direction.py``
(la misma lógica, ya probada, que usan los endpoints HTTP), para que una IA
externa pueda LEER la escaleta, pedir el PACK compacto de un tramo (lo único que
ve un modelo pequeño) y editar la escaleta.

Cubre las Fases 1-3 del roadmap: LEER/DIRIGIR la escaleta (get/status/pack/…),
la capa editorial (metadata semántica, rol de material, composición híbrida) y
GENERAR ESCENA por MCP (versiones BLOQUEANTES de las etapas SSE de Generar Escena).
"""
from __future__ import annotations

import asyncio
import threading

from .. import projects, scene_direction
from ..motion import scene as motion_scene
from .registry import MCPError, tool

# Campos de un tramo que la IA puede modificar (mismos que el PATCH HTTP).
_PATCH_KEYS = {"status", "composition_id", "placed_clip_id", "mode", "instruction",
               "strict", "materials", "reference_id", "start", "end", "text",
               "composition_intent", "complexity", "no_visual", "components"}


def _project_or_raise(project_id: str):
    proj = projects.get_project(project_id)
    if proj is None:
        raise MCPError("resource_not_found", f"Proyecto no encontrado: {project_id}")
    return proj


def scene_direction_get(project_id: str) -> dict:
    """Escaleta de tramos del guion + el guion en frases con tiempos, los modos y el
    catálogo de materiales. Es el punto de entrada para dirigir: muestra qué tramos hay,
    su modo/estado y qué material puede elegir la IA (título + descripción)."""
    proj = _project_or_raise(project_id)
    units, source = scene_direction.script_units(proj)
    return {
        **scene_direction.load(proj),
        "script_source": source,
        "units": units,
        "modes": [{"key": k, **v} for k, v in scene_direction.MODES.items()],
        "materials": scene_direction.material_catalog(proj),
        "duration": scene_direction.timeline_duration(proj),
    }


def scene_direction_status(project_id: str) -> dict:
    """Mapa del montaje: por cada tramo su estado (empty→ready→generated→placed), modo y si
    ya tiene material/escena, más un recuento y la lista de tramos que aún necesitan visual
    (``pending``). Es el 'estás aquí' que una IA autónoma recorre para saber qué falta."""
    proj = _project_or_raise(project_id)
    return scene_direction.status_summary(proj)


def scene_direction_pack(project_id: str, segment: dict, segments: list | None = None,
                         pace: str = "medio") -> dict:
    """PACK de contexto de UN tramo: lo ÚNICO que ve la IA para decidir qué se muestra.

    Compacto y ya decidido (≈300-500 tokens) para funcionar con cualquier modelo, incluso
    pequeño. Pasa ``segment`` ({start, end, mode?, instruction?, strict?, materials?,
    reference_id?}); ``segments`` opcional da el contexto de vecinos (si no, se lee la
    escaleta guardada). Devuelve:
      - ``text``: el prompt EXACTO (incluye ya la ZONA DE SUBTÍTULOS a respetar).
      - ``pack``: los datos estructurados (voz, subtítulos con tiempos, dirección,
        materiales elegidos o candidatos, referencia, vecinos y ``style``/safe-area).
      - ``tokens`` estimados, ``skeleton`` (beats ya cortados: solo rellenas QUÉ se ve) y
        ``brief_defaults`` (arranque del brief de Generar Escena)."""
    proj = _project_or_raise(project_id)
    seg = scene_direction.normalize_segment(segment)
    if seg is None:
        raise MCPError("invalid_parameter",
                       "Tramo inválido: pasa 'segment' con al menos {start, end} (segundos).",
                       retryable=True, param="segment")
    if isinstance(segments, list):
        doc = scene_direction.normalize_doc({"segments": segments})
    else:
        doc = scene_direction.load(proj)
    pack = scene_direction.build_pack(proj, seg, doc)
    text = scene_direction.pack_text(pack)
    pace_val = motion_scene.PACES.get(str(pace or "medio"), motion_scene.PACES["medio"])
    return {
        "pack": pack,
        "text": text,
        "tokens": scene_direction.estimate_tokens(text),
        "skeleton": scene_direction.skeleton_beats(pack, pace=pace_val),
        "brief_defaults": scene_direction.brief_defaults(pack),
    }


def scene_rank_materials(project_id: str, text: str, limit: int = 5) -> dict:
    """Materiales del proyecto y de la biblioteca ORDENADOS por relevancia a un texto
    (narración o intención del tramo). Úsalo para buscar candidatos a demanda, sin pedir el
    pack entero. Devuelve título + descripción + ``match`` (nº de términos coincidentes)."""
    proj = _project_or_raise(project_id)
    if not (text or "").strip():
        raise MCPError("invalid_parameter", "Pasa 'text' (la narración o la idea del tramo).",
                       retryable=True, param="text")
    catalog = scene_direction.material_catalog(proj)
    try:
        n = max(1, min(int(limit or 5), 20))
    except (TypeError, ValueError):
        n = 5
    return {"materials": scene_direction.rank_materials(catalog, text, limit=n),
            "catalog_size": len(catalog)}


def scene_direction_auto_split(project_id: str, segments: list | None = None) -> dict:
    """PROPONE una escaleta cortando el guion en tramos de ≈6 s, conservando los tramos que
    ya tienen dirección. NO guarda (usa scene_direction_set para persistir). Pasa
    ``segments`` para conservar tu escaleta en curso; si no, se conserva la guardada."""
    proj = _project_or_raise(project_id)
    if isinstance(segments, list):
        keep = scene_direction.normalize_doc({"segments": segments})["segments"]
    else:
        keep = scene_direction.load(proj)["segments"]
    return {"segments": scene_direction.auto_segments(proj, keep=keep)}


def scene_direction_update_segment(project_id: str, segment_id: str, patch: dict) -> dict:
    """Actualiza campos de UN tramo (modo, instruction, strict, materials, reference_id,
    start/end, text, status, composition_id, placed_clip_id). Úsalo para dirigir un tramo o
    marcar su estado tras montar su escena. Devuelve la escaleta completa ya guardada."""
    _project_or_raise(project_id)
    if not isinstance(patch, dict) or not patch:
        raise MCPError("invalid_parameter", "Pasa 'patch' con los campos a cambiar.",
                       retryable=True, param="patch")
    clean = {k: v for k, v in patch.items() if k in _PATCH_KEYS}
    if not clean:
        raise MCPError("invalid_parameter",
                       f"Ningún campo válido en 'patch'. Permitidos: {sorted(_PATCH_KEYS)}.",
                       retryable=True, param="patch")
    try:
        return scene_direction.update_segment(project_id, segment_id, clean)
    except LookupError as exc:
        raise MCPError("resource_not_found", str(exc))


def scene_place_material(project_id: str, segment_id: str, material: dict | None = None,
                         role: str = "full", source: dict | None = None, size: float | None = None,
                         pos: str | None = None, opacity: float | None = None,
                         transform: dict | None = None) -> dict:
    """Coloca un material del tramo en la timeline (sin IA, determinista, deshacible con undo).

    Sin ``material`` usa el elegido en el tramo. ``role`` (§3.4): full (pantalla completa,
    por defecto) · broll · background · overlay · pip · side_panel · circular · reference.
    ``source={in,out}`` = fragmento del material (§3.7). ``size`` = fracción del ancho (roles
    overlay; p.ej. 0.4 para un PiP). ``pos`` = ancla (center/top_left/top_right/left/right/
    bottom_left/bottom_right…, siempre por encima de los subtítulos). ``opacity`` 0–1.
    ``transform={x,y,scale,rotation}`` fuerza la colocación exacta (x/y = centro 0–1;
    scale = px-fuente→px-salida). Para composición híbrida, coloca varios materiales y añade
    motion/stickman con las tools de motion. Devuelve el clip creado."""
    _project_or_raise(project_id)
    if role not in scene_direction.MATERIAL_ROLES:
        raise MCPError("invalid_parameter",
                       f"role inválido. Usa uno de: {list(scene_direction.MATERIAL_ROLES)}.",
                       retryable=True, param="role")
    try:
        return scene_direction.place_material(project_id, segment_id, material, role=role, source=source,
                                              size=size, pos=pos, opacity=opacity, transform=transform)
    except LookupError as exc:
        raise MCPError("resource_not_found", str(exc))
    except ValueError as exc:
        raise MCPError("invalid_parameter", str(exc), retryable=True)


def scene_set_material_meta(project_id: str, kind: str, material_id: str, meta: dict,
                            scope: str = "project") -> dict:
    """Guarda metadata SEMÁNTICA de un material (vídeo o imagen) para elegir y componer mejor.

    ``kind`` 'clips' | 'images'; ``material_id`` = index del clip / id de la imagen; ``scope``
    'project' (por defecto) | 'library'. ``meta`` (todo opcional): ``subjects`` [], ``actions``
    [], ``environment``, ``mood``, ``composition``, ``visual_content``, ``suggested_usage`` y
    ``visual_priority`` (protagonista|apoyo|fondo). ``meta={}`` la limpia. Alimenta el ranking
    (scene_rank_materials) y el pack. Descubre los materiales con scene_direction_get."""
    if scope not in ("project", "library"):
        raise MCPError("invalid_parameter", "scope debe ser 'project' o 'library'.",
                       retryable=True, param="scope")
    if scope == "project":
        _project_or_raise(project_id)
    try:
        return scene_direction.set_material_meta(project_id, kind, str(material_id), meta or {}, scope=scope)
    except ValueError as exc:
        raise MCPError("invalid_parameter", str(exc), retryable=True)
    except LookupError as exc:
        raise MCPError("resource_not_found", str(exc))


def scene_direction_set(project_id: str, segments: list) -> dict:
    """Guarda la escaleta ENTERA (lista de tramos). Reemplaza la existente. Normaliza y
    ordena por tiempo; descarta tramos inválidos y referencias rotas. Devuelve lo guardado."""
    _project_or_raise(project_id)
    if not isinstance(segments, list):
        raise MCPError("invalid_parameter", "Pasa 'segments' como lista de tramos.",
                       retryable=True, param="segments")
    try:
        return scene_direction.save(project_id, {"segments": segments})
    except LookupError as exc:
        raise MCPError("resource_not_found", str(exc))


# --- Generar Escena por MCP (Fase 3): versiones BLOQUEANTES de las etapas SSE -----------
# Las 3 etapas de Generar Escena (questions/plan/build) son generadores async con eventos
# SSE. Aquí se ejecutan hasta el final y se devuelve solo el resultado (JSON), que es lo
# que una IA por MCP necesita (no streaming). Espejo de `_scene_request` de app/main.py.

def scene_reuse_reference(project_id: str, segment_id: str) -> dict:
    """Modo 'reinforce': copia la escena del tramo de REFERENCIA a este tramo, reescalada a
    su duración (sin IA). El tramo debe tener mode='reinforce' y un reference_id con escena.
    Deja el borrador enlazado (status 'generated'). Deshacible."""
    _project_or_raise(project_id)
    try:
        return scene_direction.reuse_scene(project_id, segment_id)
    except LookupError as exc:
        raise MCPError("resource_not_found", str(exc))
    except ValueError as exc:
        raise MCPError("invalid_parameter", str(exc), retryable=True)


def _run_async(coro):
    """Ejecuta una corrutina desde una tool síncrona. En el hilo del pool del MCP no hay loop
    (asyncio.run); si lo hubiera, corre en un hilo aparte con su propio loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    box: dict = {}
    def worker():
        loop = asyncio.new_event_loop()
        try:
            box["v"] = loop.run_until_complete(coro)
        finally:
            loop.close()
    t = threading.Thread(target=worker)
    t.start()
    t.join()
    return box["v"]


async def _drain(agen) -> list[dict]:
    return [ev async for ev in agen]


def _last(events: list[dict], type_: str) -> dict | None:
    return next((e for e in reversed(events) if e.get("type") == type_), None)


def _raise_scene_error(events: list[dict]) -> None:
    err = _last(events, "error")
    if err:
        msg = err.get("message") or "Error de Generar Escena."
        low = msg.lower()
        if any(k in low for k in ("api key", "modelo", "proveedor", "configur")):
            raise MCPError("configuration_error", msg,
                           hint="Configura un proveedor de IA en Ajustes.")
        raise MCPError("processing_error", msg, retryable=True)


def _scene_ctx(proj, body: dict):
    """(ctx, brief, rango) de un tramo para Generar Escena. Con ``direction_id`` usa el tramo
    de la escaleta e inyecta su PACK; si no, usa start/end. Espejo de `main._scene_request`."""
    from ..motion import segment_context
    seg = doc = None
    if body.get("direction_id"):
        try:
            seg, doc = scene_direction.get_segment(proj, str(body["direction_id"]))
        except LookupError as exc:
            raise MCPError("resource_not_found", str(exc))
        body = {**body, "start": seg["start"], "end": seg["end"]}
    ctx = segment_context.build_segment_context(proj, body.get("start"), body.get("end"),
                                                body.get("playhead"), body.get("clip_id"))
    sel = ctx.get("selection") or {}
    if sel.get("start") is None or sel.get("end") is None:
        raise MCPError("invalid_parameter", "Falta el rango: pasa 'direction_id' o start/end.",
                       retryable=True)
    rng = {"start": float(sel["start"]), "end": float(sel["end"])}
    brief = motion_scene.normalize_brief(body.get("brief"), duration=rng["end"] - rng["start"])
    if seg is not None:
        pack = scene_direction.build_pack(proj, seg, doc)
        ctx["directionPack"] = scene_direction.pack_text(pack)
        ctx["skeleton"] = scene_direction.skeleton_beats(pack, pace=motion_scene.PACES[brief["pace"]])
        known = {str(a.get("id")) for a in ctx.get("availableAssets") or []}
        for m in pack["materials"] + pack["candidates"]:
            if m["kind"] == "images" and m["id"] not in known:
                ctx.setdefault("availableAssets", []).append({"kind": "image", "id": m["id"], "label": m["title"]})
    return ctx, brief, rng


def motion_scene_directions(project_id: str) -> dict:
    """Catálogo de las 16 DIRECCIONES CREATIVAS (whiteboard, kinetic, cinematic…) + la por
    defecto + las opciones del brief (intención, ritmo, densidad de texto…). Elige una
    direction_id antes de generar para fijar el estilo de la escena."""
    _project_or_raise(project_id)
    from ..motion import directions
    return {"directions": directions.list_directions(), "default": directions.DEFAULT_DIRECTION,
            "options": motion_scene.options()}


def motion_scene_questions(project_id: str, direction_id: str | None = None, brief: dict | None = None,
                           start: float | None = None, end: float | None = None) -> dict:
    """(Bloqueante) La IA pregunta lo que le falta para diseñar la escena: 0–4 preguntas.
    Pasa ``direction_id`` (tramo de la escaleta) o ``start``/``end`` + ``brief``. Responde con
    motion_plan_scene(answers=...)."""
    proj = _project_or_raise(project_id)
    from ..motion import scene_ai
    ctx, brief_n, _ = _scene_ctx(proj, {"direction_id": direction_id, "brief": brief,
                                        "start": start, "end": end})
    events = _run_async(_drain(scene_ai.questions_stream(ctx=ctx, brief=brief_n)))
    _raise_scene_error(events)
    q = _last(events, "questions") or {}
    return {"questions": q.get("questions", [])}


def motion_plan_scene(project_id: str, direction_id: str | None = None, brief: dict | None = None,
                      answers: list | None = None, start: float | None = None,
                      end: float | None = None) -> dict:
    """(Bloqueante) Devuelve el PLAN de la escena: título, logline, rationale y los BEATS
    editables (cada uno con su kind: stick/graphic/text/image). No guarda nada. Revísalo/edítalo
    y pásalo a motion_build_scene."""
    proj = _project_or_raise(project_id)
    from ..motion import scene_ai
    ctx, brief_n, _ = _scene_ctx(proj, {"direction_id": direction_id, "brief": brief,
                                        "start": start, "end": end})
    ans = motion_scene.normalize_answers(answers)
    events = _run_async(_drain(scene_ai.plan_stream(ctx=ctx, brief=brief_n, answers=ans)))
    _raise_scene_error(events)
    p = _last(events, "plan")
    if not p:
        raise MCPError("processing_error", "La IA no devolvió un plan válido. Reintenta.", retryable=True)
    return {"plan": p["plan"]}


def motion_build_scene(project_id: str, plan: dict, direction_id: str | None = None,
                       brief: dict | None = None, answers: list | None = None,
                       start: float | None = None, end: float | None = None) -> dict:
    """(Bloqueante) Construye la escena (MotionComposition) beat a beat a partir del ``plan`` y
    guarda el BORRADOR. Con ``direction_id`` enlaza el borrador al tramo (status 'generated').
    Devuelve composition_id + preview_url. Insértalo en la timeline con motion_add_to_timeline."""
    proj = _project_or_raise(project_id)
    from ..motion import scene_ai
    from ..motion import service as motion_service
    from .tools_motion import _project_format
    ctx, brief_n, rng = _scene_ctx(proj, {"direction_id": direction_id, "brief": brief,
                                          "start": start, "end": end})
    raw_plan = plan if isinstance(plan, dict) else {}
    plan_n = motion_scene.normalize_beats_edit(raw_plan.get("beats"), brief_n, image_ids=scene_ai.image_ids(ctx))
    plan_n.update({k: str(raw_plan.get(k) or "")[:800] for k in ("title", "logline", "rationale")})
    motion_service.cleanup_generate_drafts(project_id)
    stream = scene_ai.build_stream(project_id, ctx=ctx, brief=brief_n,
                                   answers=motion_scene.normalize_answers(answers),
                                   plan=plan_n, fmt=_project_format(proj), for_range=rng)
    events = _run_async(_drain(stream))
    _raise_scene_error(events)
    created = _last(events, "created")
    if not created or not created.get("composition_id"):
        raise MCPError("processing_error", "No se pudo crear la escena.", retryable=True)
    cid = created["composition_id"]
    if direction_id:
        try:
            scene_direction.update_segment(project_id, str(direction_id),
                                           {"composition_id": cid, "status": "generated"})
        except LookupError:
            pass
    return {"composition_id": cid, "version": created.get("version"),
            "title": plan_n.get("title") or "",
            "preview_url": f"/api/projects/{project_id}/motion/{cid}/preview.html"}


# --- Verificar el montaje (Fase 4): ver el frame real + validar la composición ----------

def scene_validate_segment(project_id: str, segment_id: str | None = None,
                           start: float | None = None, end: float | None = None) -> dict:
    """Valida la composición de un tramo SIN renderizar (§3.14): detecta colisiones con la zona
    de subtítulos, elementos fuera de pantalla, solapes fuertes entre overlays y lienzo vacío.
    Pasa ``segment_id`` o ``start``+``end``. Devuelve ``issues`` con sugerencias accionables
    (recolocar/reducir/cambiar material) y ``ok``. Úsalo tras montar un tramo y corrige con
    scene_place_material antes de darlo por bueno."""
    proj = _project_or_raise(project_id)
    if segment_id:
        try:
            seg, _ = scene_direction.get_segment(proj, str(segment_id))
        except LookupError as exc:
            raise MCPError("resource_not_found", str(exc))
        s, e = seg["start"], seg["end"]
    elif start is not None and end is not None:
        s, e = float(start), float(end)
    else:
        raise MCPError("invalid_parameter", "Pasa 'segment_id' o 'start'+'end'.",
                       retryable=True, param="segment_id")
    return scene_direction.validate_segment(proj, s, e)


def render_timeline_frame(project_id: str, at_time: float) -> dict:
    """Renderiza y devuelve el FOTOGRAMA REAL del compuesto de la timeline en ``at_time`` (s):
    vídeo + overlays + subtítulos + formas, tal como saldrá. Son los 'ojos' para verificar un
    montaje (lo que scene_validate_segment razona por geometría, esto lo muestra de verdad).
    Más lento que un preview; úsalo puntualmente."""
    import base64
    import tempfile
    from pathlib import Path
    from .. import compose
    proj = _project_or_raise(project_id)
    tl = getattr(proj, "timeline", None)
    if tl is None or not getattr(tl, "clips", None):
        raise MCPError("invalid_parameter", "La timeline está vacía: no hay nada que renderizar.",
                       retryable=True)
    with tempfile.TemporaryDirectory(prefix="vy-mcpframe-") as td:
        out = Path(td) / "frame.png"
        try:
            compose.render_frame(proj, tl, out, float(at_time))
            data = out.read_bytes()
        except (RuntimeError, ValueError, OSError) as exc:
            raise MCPError("processing_error", f"No se pudo renderizar el frame: {exc}", retryable=True)
    return {"at_time": round(float(at_time), 3), "width": int(getattr(tl, "width", 720) or 720),
            "height": int(getattr(tl, "height", 1280) or 1280), "mime": "image/png",
            # El agente detecta image_b64 y adjunta la imagen al modelo multimodal.
            "image_b64": base64.b64encode(data).decode("ascii"),
            "note": f"fotograma REAL del compuesto de la timeline en t={float(at_time):.2f}s (imagen adjunta)."}


def register(mcp) -> None:
    tool(mcp, access="read")(scene_direction_get)
    tool(mcp, access="read")(scene_direction_status)
    tool(mcp, access="read")(scene_direction_pack)
    tool(mcp, access="read")(scene_rank_materials)
    tool(mcp, access="read")(scene_direction_auto_split)
    tool(mcp, access="write")(scene_direction_update_segment)
    tool(mcp, access="write")(scene_direction_set)
    tool(mcp, access="write")(scene_set_material_meta)
    tool(mcp, access="write")(scene_place_material)
    tool(mcp, access="write")(scene_reuse_reference)
    tool(mcp, access="read")(motion_scene_directions)
    tool(mcp, access="read")(motion_scene_questions)
    tool(mcp, access="read")(motion_plan_scene)
    tool(mcp, access="write")(motion_build_scene)
    tool(mcp, access="read")(scene_validate_segment)
    tool(mcp, access="read")(render_timeline_frame)
