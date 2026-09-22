"""«Generar recurso»: del contexto del tramo a una propuesta de RECURSO VISUAL.

Flujo (§3/§13/§16): tomar contexto → analizar → sugerir recursos → el usuario
elige → generar. La IA no escribe HTML: ELIGE una plantilla de la biblioteca
(``templates.catalog``) y rellena sus huecos con el contenido real del tramo,
incluidos los PNG del material. Solo si ninguna encaja propone una composición
libre, que se delega en ``generate.create_stream``.

Antes de que conteste el modelo ya hay sugerencias: ``heuristic_suggestions``
lee el guion y el material y propone plantillas por señales (fechas → timeline,
"frente a" con dos nombres → comparación, varios nombres → lista apilada…). Solo
usa contenido que puede leer con seguridad; sin señales no propone nada antes que
rellenar con "Idea A". También cubren al proveedor cuando falla, tarda o se
cuelga (``AI_TIMEOUT``): con ``openrouter/free`` pasa, porque cada petición va a un
modelo gratuito distinto.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, AsyncIterator

from ..ai.providers import get_provider
from . import templates as motion_templates
from .generate import _extract_json

MAX_SUGGESTIONS = 6
MAX_ATTEMPTS = 2
# s por intento. Medido con openrouter/free: 14–51 s, con hasta 44 s sin emitir nada
# (modelos que razonan en silencio); pasado el límite se quedan las heurísticas.
AI_TIMEOUT = 90.0

# Icono del chip en el modal (nombre de Material Symbols).
KIND_ICONS = {
    "timeline": "timeline", "compare": "compare_arrows", "list": "format_list_bulleted",
    "grid": "grid_view", "diagram": "account_tree", "flow": "linear_scale",
    "data": "show_chart", "stat": "tag", "image": "image", "annotate": "my_location",
    "concept": "bubble_chart", "text": "title", "custom": "auto_awesome",
}
# Plantilla → etiqueta de tipo (para el icono y el agrupado en la UI).
_KIND_BY_TEMPLATE = {
    "timeline_track": "timeline", "versus": "compare", "before_after": "compare",
    "stack_list": "list", "sequence_rows": "list", "card_grid": "grid",
    "flow_steps": "flow", "decision_tree": "diagram", "concept_map": "diagram",
    "neural_network": "diagram", "line_graph": "data", "bar_chart": "data",
    "stat": "stat", "asset_showcase": "image", "annotate": "annotate",
    "assemble": "concept", "stick_scene": "concept",
    "bullet_list": "text", "quote": "text", "title": "text", "pro_title": "text",
    "lower-third": "text", "subscribe": "text",
}


def kind_of(template: str | None) -> str:
    return _KIND_BY_TEMPLATE.get(template or "", "custom")


# --- Sugerencias por señales del guion (instantáneas, sin IA) -------------------

_YEAR_RE = re.compile(r"\b(1[5-9]\d{2}|20\d{2})\b")
_PCT_RE = re.compile(r"\b\d+([.,]\d+)?\s?%")
_COMPARE_RE = re.compile(
    r"\b(vs|versus|frente a|en cambio|mientras que|a diferencia|por un lado|"
    r"en lugar de|comparad[oa]|contrast)\w*", re.I)
_PROCESS_RE = re.compile(
    r"\b(como funciona|cómo funciona|proceso|primero|luego|despues|después|"
    r"a continuacion|a continuación|paso|etapa|fase|entonces|finalmente)\w*", re.I)
_LIST_RE = re.compile(
    r"\b(varios|varias|algunos|algunas|muchos|muchas|existen|hay (?:tres|cuatro|"
    r"cinco|varios|varias)|entre ellos|por ejemplo|tales como|como \w+, \w+)", re.I)
# "si" suelto no vale: en español casi siempre es "whether" ("descubrir si Ava…").
_CAUSE_RE = re.compile(r"\b(depende de|o bien|dos caminos|dos opciones|se divide|"
                       r"se bifurca|en caso de que)", re.I)


def _script_of(ctx: dict) -> str:
    sc = ctx.get("scriptContext") or {}
    return " ".join(str(sc.get(k) or "") for k in ("previous", "current", "next")).strip()


# Palabras que van en mayúscula sin ser nombres (inicio de frase ya se descarta).
_NOT_ENTITY = {
    "el", "la", "los", "las", "un", "una", "y", "o", "pero", "con", "sin", "en", "de",
    "del", "al", "que", "como", "cómo", "qué", "por", "para", "si", "no", "sí", "es",
    "este", "esta", "eso", "esto", "ahora", "aquí", "así", "entonces", "también", "the",
    "and", "but", "yo", "tú", "él", "ella", "nosotros", "ellos", "usted",
}
_TOKEN_RE = re.compile(r"[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\w'\-]*")
_SENTENCE_RE = re.compile(r"[.!?¿¡:;\n]+")


def entities(text: str, limit: int = 6) -> list[str]:
    """Nombres propios, marcas y siglas del guion ("ChatGPT", "Navier", "IA").

    Es lo único que la heurística se atreve a poner como CONTENIDO: los
    ``keyTerms`` son solo palabras largas ("realmente", "descubrir") y montar una
    comparación con ellas da "realmente vs siente". Se descarta la primera palabra
    de cada frase (su mayúscula es gramatical) salvo que tenga mayúsculas internas.
    """
    out: list[str] = []
    seen: set[str] = set()
    for sentence in _SENTENCE_RE.split(text or ""):
        for i, tok in enumerate(_TOKEN_RE.findall(sentence)):
            inner_caps = any(c.isupper() for c in tok[1:])
            if not (tok[0].isupper() or inner_caps) or tok[0].isdigit():
                continue
            if i == 0 and not inner_caps:
                continue
            key = tok.lower()
            if key in _NOT_ENTITY or len(tok) < 2 or key in seen:
                continue
            seen.add(key)
            out.append(tok)
            if len(out) >= limit:
                return out
    return out


def _sug(label: str, template: str | None, params: dict, why: str, *, strong: bool) -> dict:
    """``strong`` = la señal del guion es inequívoca (años, cifra, "frente a" con dos
    nombres, imágenes que encajan). Solo esas sobreviven junto a las de la IA."""
    return {"label": label, "kind": kind_of(template), "template": template,
            "params": params, "why": why, "source": "heuristic", "strong": strong}


def heuristic_suggestions(ctx: dict, limit: int = MAX_SUGGESTIONS) -> list[dict]:
    """Propuestas deterministas leyendo el guion y el material del tramo.

    Nunca inventa contenido: rellena lo que puede leer con seguridad (años,
    nombres propios, etiquetas e ids de materiales) y deja el resto a los valores
    por defecto de la plantilla, que el usuario ajusta en Motion Studio.
    """
    sc = ctx.get("scriptContext") or {}
    current = str(sc.get("current") or "")
    blob = _script_of(ctx)
    names = entities(current) or entities(blob)
    images = [a for a in (ctx.get("availableAssets") or []) if a.get("kind") == "image"]
    matched = [a for a in images if a.get("match")]
    out: list[dict] = []

    def image_for(name: str) -> str:
        low = name.lower()
        return next((a["id"] for a in images if low in str(a.get("label", "")).lower()), "")

    years = sorted({int(y) for y in _YEAR_RE.findall(blob)})
    if len(years) >= 2:
        out.append(_sug(
            "Timeline histórico", "timeline_track",
            {"events": [{"label": str(y), "sublabel": ""} for y in years[:5]]},
            f"El guion recorre fechas ({years[0]}–{years[-1]}).", strong=True))

    if _COMPARE_RE.search(blob) and len(names) >= 2:
        out.append(_sug(f"{names[0]} frente a {names[1]}", "versus",
                        {"left": {"label": names[0], "image": image_for(names[0])},
                         "right": {"label": names[1], "image": image_for(names[1])}},
                        "Se contraponen dos cosas con nombre propio.", strong=True))

    pct = _PCT_RE.search(current)
    if pct:
        value = float(re.sub(r"[^0-9.]", "", pct.group(0).replace(",", ".")) or 0)
        out.append(_sug(f"Cifra: {pct.group(0).strip()}", "stat",
                        {"label": names[0].upper() if names else "", "value": value,
                         "suffix": "%", "sub": ""},
                        "Hay un porcentaje en lo que se dice ahora.", strong=True))

    if matched:
        out.append(_sug("Mostrar los materiales", "asset_showcase",
                        {"items": [{"label": a.get("label") or "", "image": a.get("id")}
                                   for a in matched[:3]]},
                        f"{len(matched)} imagen(es) del material encajan con el guion.",
                        strong=True))

    if len(names) >= 3 or (_LIST_RE.search(blob) and len(names) >= 2):
        out.append(_sug("Lista apilada", "stack_list",
                        {"items": [{"label": n, "image": image_for(n)} for n in names[:5]]},
                        f"Se nombran varias cosas: {', '.join(names[:3])}…", strong=len(names) >= 3))

    if _PROCESS_RE.search(blob):
        out.append(_sug("Proceso paso a paso", "flow_steps", {},
                        "Se describe una secuencia o un mecanismo.", strong=False))

    if _CAUSE_RE.search(blob):
        out.append(_sug("Árbol de decisión", "decision_tree", {},
                        "Aparece una bifurcación o una condición.", strong=False))

    on_screen = [e for e in ((ctx.get("timelineContext") or {}).get("existingElements") or [])
                 if e.get("kind") == "video"]
    if on_screen:
        out.append(_sug("Señalar en el vídeo", "annotate",
                        {"label": names[0] if names else "Aquí"},
                        "Hay vídeo en pantalla: se puede anotar sin taparlo.", strong=False))

    # Solo con nombres reales para los satélites: sin ellos la plantilla pondría su
    # relleno de ejemplo ("Idea A, Idea B"), que es justo inventar contenido.
    if len(out) < 2 and len(names) >= 3:
        out.append(_sug("Mapa conceptual", "concept_map",
                        {"center": names[0], "items": [{"label": n} for n in names[1:6]]},
                        f"Relaciona {', '.join(names[:3])}…", strong=False))
    for i, s in enumerate(out):
        s["id"] = f"h{i + 1}"
    return out[:limit]


# --- Sugerencias de la IA --------------------------------------------------------

def _catalog_block() -> str:
    rows = motion_templates.catalog()
    lines = []
    for r in rows:
        slots = ", ".join(f"{k} ({v})" for k, v in (r.get("slots") or {}).items())
        line = f"- {r['key']} [{r.get('category', '')}]: {r.get('best_for', r['name'])}"
        if slots:
            line += f"\n    huecos: {slots}"
        if r.get("accepts_images"):
            line += "\n    admite PNG del material en 'image'."
        lines.append(line)
    return "PLANTILLAS DISPONIBLES (elige una por sugerencia):\n" + "\n".join(lines)


def _system_prompt() -> str:
    return "\n\n".join([
        "Eres un DIRECTOR DE MOTION GRAPHICS para vídeo educativo/documental. Te dan el "
        "contexto de un tramo de la timeline y propones qué RECURSO VISUAL ayudaría a "
        "contar mejor esa parte. Piensas en imágenes, no en frases.",
        "REGLAS DE FONDO:\n"
        "1. El recurso es una COMPOSICIÓN VISUAL: diagramas, comparaciones, timelines, "
        "procesos, gráficos, iconos, ilustraciones, flechas, composiciones con imágenes. "
        "NO propongas carteles de texto ni letras animadas salvo que el guion sea "
        "literalmente una cita, una cifra o un título.\n"
        "2. REUTILIZA una plantilla siempre que encaje; inventar desde cero es el último "
        "recurso (template: null) y hay que justificarlo.\n"
        "3. Rellena los huecos con el CONTENIDO REAL del guion (nombres, fechas, cifras, "
        "términos), no con ejemplos genéricos. Texto mínimo y concreto.\n"
        "4. Si hay imágenes del material relacionadas, ÚSALAS: pon su id en el campo "
        "'image' del item. Nunca inventes un logo o un retrato que ya existe como asset.\n"
        "5. Estética minimalista y editorial, fondo claro. Nada de neón, cyberpunk, "
        "glow ni interfaces falsas.\n"
        "6. Propuestas DISTINTAS entre sí: cada una debe resolver el tramo de otra manera.\n"
        "7. Escribe TODAS las etiquetas y textos en el MISMO idioma que el guion.\n"
        "8. timeline_track SOLO si el guion menciona fechas, años o momentos concretos; "
        "«antes/ahora» es before_after.",
        _catalog_block(),
        "RESPONDE EXCLUSIVAMENTE con este JSON (sin texto alrededor, sin ```):\n"
        "{\n"
        '  "suggestions": [\n'
        '    {\n'
        '      "label": "nombre corto del recurso (máx 4 palabras, se ve en un botón)",\n'
        '      "template": "clave de la plantilla, o null para componer desde cero",\n'
        '      "params": { …huecos de la plantilla ya rellenos… },\n'
        '      "concept": "solo si template es null: qué dibujar y cómo se anima",\n'
        '      "why": "una frase: por qué encaja con este tramo"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        f"Entre 3 y {MAX_SUGGESTIONS} sugerencias, la mejor primero.",
    ])


def _user_prompt(ctx: dict, hint: str) -> str:
    sc = ctx.get("scriptContext") or {}
    tl = ctx.get("timelineContext") or {}
    sel = ctx.get("selection") or {}
    style = ctx.get("style") or {}
    fmt = style.get("format") or {}
    parts = [
        f"TRAMO: {sel.get('start')}s – {sel.get('end')}s (duración {sel.get('duration')}s).",
        f"Formato de salida: {fmt.get('width')}x{fmt.get('height')} @ {fmt.get('fps')}fps.",
        "GUION EN ESTE MOMENTO:",
        f"  · antes: {sc.get('previous') or '—'}",
        f"  · AHORA: {sc.get('current') or '(nadie habla)'}",
        f"  · después: {sc.get('next') or '—'}",
    ]
    if sc.get("keyTerms"):
        parts.append("Términos clave: " + ", ".join(sc["keyTerms"]))

    # Notas de contexto de los materiales: lo que el usuario dice que SIGNIFICA
    # cada fragmento (§7). Es la señal más fiable que tenemos sobre la escena.
    notes = [e for e in (tl.get("existingElements") or []) if e.get("note")]
    if notes:
        parts.append("QUÉ REPRESENTA LO QUE YA HAY EN PANTALLA (notas del editor):")
        parts += [f"  · {e.get('name') or e.get('kind')}: {e['note']}" for e in notes[:6]]
    on = [e for e in (tl.get("existingElements") or []) if not e.get("note")]
    if on:
        parts.append("También en pantalla: " + "; ".join(
            f"{e.get('name') or e.get('kind')} ({e.get('kind')})" for e in on[:6]))
    if tl.get("motionInRange"):
        parts.append("Ya hay motion en el tramo (no lo repitas): " + ", ".join(
            m.get("name", "?") for m in tl["motionInRange"]))

    assets = ctx.get("availableAssets") or []
    imgs = [a for a in assets if a.get("kind") == "image"]
    if imgs:
        parts.append("IMÁGENES DEL MATERIAL (pon el id tal cual en 'image', sin prefijos):")
        parts += [f"  · {a['id']}: {a.get('label') or ''}"
                  + ("  ← encaja con el guion" if a.get("match") else "")
                  for a in imgs[:10]]
    else:
        parts.append("No hay imágenes en el material: no uses el campo 'image'.")

    if style.get("accent"):
        parts.append(f"Color de acento del proyecto: {style['accent']} (pásalo en params.accent).")
    if style.get("avoidY"):
        parts.append(f"No tapes la franja vertical y∈{style['avoidY']} (subtítulos).")
    if (hint or "").strip():
        parts.append("PETICIÓN DEL USUARIO (mándala sobre el resto): " + hint.strip())
    # Al final a propósito: los modelos pequeños obedecen más a lo último que leen.
    lang = script_language(_script_of(ctx))
    parts.append(f"IDIOMA: escribe TODAS las etiquetas (label, sublabel, textos) en {lang}.")
    parts.append("Propón los recursos visuales. Devuelve SOLO el JSON.")
    return "\n".join(parts)


_ES_WORDS = {"el", "la", "que", "de", "y", "en", "los", "las", "es", "por", "con", "una",
             "un", "para", "lo", "se", "no", "como", "pero", "su", "del", "al"}
_EN_WORDS = {"the", "and", "is", "of", "to", "in", "that", "it", "you", "for", "with",
             "this", "not", "are", "was", "but", "on", "be", "have"}


def script_language(text: str) -> str:
    """Idioma del guion para fijarlo en la respuesta (español salvo evidencia clara)."""
    words = re.findall(r"[a-záéíóúñü]+", (text or "").lower())
    es = sum(w in _ES_WORDS for w in words)
    en = sum(w in _EN_WORDS for w in words)
    return "inglés" if en > es and en >= 2 else "español"


_IMAGE_KEYS = ("image", "asset", "asset_id")
_IMAGE_PREFIX_RE = re.compile(r"^(id\s*[=:]\s*|asset:image/)", re.I)


def _clean_images(value: Any, valid: set[str]) -> Any:
    """Sanea las referencias a imágenes que escribe el modelo, a cualquier profundidad.

    Los modelos copian el formato del prompt ("id=abc", "asset:image/abc") o se
    inventan ids; una referencia que no resuelve sería una imagen ROTA en el
    recurso, así que se vacía y la plantilla pone su monograma.
    """
    if isinstance(value, list):
        return [_clean_images(v, valid) for v in value]
    if not isinstance(value, dict):
        return value
    out = {}
    for k, v in value.items():
        if k in _IMAGE_KEYS and isinstance(v, (str, int)):
            ref = _IMAGE_PREFIX_RE.sub("", str(v).strip())
            out[k] = ref if ref in valid else ""
        elif isinstance(v, str) and _IMAGE_PREFIX_RE.sub("", v.strip()) in valid:
            out[k] = ""        # un id colado en un texto ("sublabel": "e959…") no se muestra
        else:
            out[k] = _clean_images(v, valid)
    return out


# Tope de caracteres por hueco de texto (§2: el recurso es visual, el texto mínimo).
# Los modelos tienden a copiar la frase entera del guion en una etiqueta.
_TEXT_LIMITS = {"label": 42, "sublabel": 60, "title": 38, "kicker": 22, "center": 32,
                "root": 44, "caption": 64, "result": 60, "divider": 8,
                "before_label": 14, "after_label": 14}


def _shorten(text: str, limit: int) -> str:
    t = " ".join(text.split())
    if len(t) <= limit:
        return t
    cut = t[:limit - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(",;:.-") + "…"


def _trim_texts(value: Any) -> Any:
    if isinstance(value, list):
        return [_trim_texts(v) for v in value]
    if not isinstance(value, dict):
        return value
    return {k: (_shorten(v, _TEXT_LIMITS[k]) if k in _TEXT_LIMITS and isinstance(v, str)
                else _trim_texts(v))
            for k, v in value.items()}


def normalize_suggestions(raw: Any, ctx: dict, *, limit: int = MAX_SUGGESTIONS) -> list[dict]:
    """Filtra y sanea lo que devuelve el modelo: plantilla conocida, params dict,
    textos acotados. Descarta lo que no se pueda construir."""
    rows = raw.get("suggestions") if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        return []
    dur = float((ctx.get("selection") or {}).get("duration") or 5.0)
    accent = (ctx.get("style") or {}).get("accent")
    valid_images = {str(a.get("id")) for a in (ctx.get("availableAssets") or [])
                    if a.get("kind") == "image" and a.get("id")}
    out: list[dict] = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        key = row.get("template")
        key = str(key).strip() if key else None
        if key and motion_templates.get(key) is None:
            continue                       # plantilla inventada → fuera
        params = row.get("params")
        params = (_trim_texts(_clean_images(dict(params), valid_images))
                  if isinstance(params, dict) else {})
        params.setdefault("duration", round(dur, 2))
        if accent and not params.get("accent"):
            params["accent"] = accent
        concept = str(row.get("concept") or "").strip()[:400]
        if not key and not concept:
            continue                       # sin plantilla NI concepto no hay nada que construir
        label = str(row.get("label") or "").strip()[:48]
        if not label:
            tpl = motion_templates.get(key) if key else None
            label = tpl.name if tpl else "Composición a medida"
        out.append({
            "id": f"a{i + 1}", "label": label, "kind": kind_of(key),
            "template": key, "params": params, "concept": concept,
            "why": str(row.get("why") or "").strip()[:180], "source": "ai",
        })
        if len(out) >= limit:
            break
    return out


async def suggest_stream(project_id: str, *, ctx: dict, hint: str = "",
                         limit: int = MAX_SUGGESTIONS) -> AsyncIterator[dict]:
    """Emite SSE: start / seed / status / text / suggestions / error / done.

    ``seed`` llega de inmediato con las heurísticas para que el modal pinte algo
    en el primer frame; ``suggestions`` lo sustituye cuando contesta la IA.
    """
    seed = heuristic_suggestions(ctx, limit=limit)
    yield {"type": "start"}
    yield {"type": "seed", "suggestions": seed}

    provider = get_provider()
    reason = provider.unavailable_reason()
    if reason:
        # Sin proveedor el modal sigue siendo usable: las heurísticas mandan.
        yield {"type": "suggestions", "suggestions": seed, "degraded": reason}
        yield {"type": "done"}
        return

    user_msg = _user_prompt(ctx, hint)
    captured = {"text": ""}

    async def emit(ev: dict) -> None:
        if ev.get("type") == "text":
            captured["text"] += ev.get("delta", "")

    async def no_tools(name: str, args: dict) -> dict:
        return {"ok": False, "text": "Sin herramientas: responde solo con el JSON pedido."}

    rows: list[dict] = []
    for attempt in range(MAX_ATTEMPTS):
        captured["text"] = ""
        try:
            await asyncio.wait_for(
                provider.run(system=_system_prompt(), history=[], user_message=user_msg,
                             tools=[], call_tool=no_tools, emit=emit, max_iters=1),
                timeout=AI_TIMEOUT)
        except asyncio.TimeoutError:
            # Visto en vivo: el proveedor responde 200 y el stream no termina nunca.
            # El modal no puede quedarse "afinando" para siempre.
            yield {"type": "suggestions", "suggestions": seed,
                   "degraded": "La IA tardó demasiado; estas propuestas salen del guion."}
            yield {"type": "done"}
            return
        except Exception as exc:  # noqa: BLE001
            yield {"type": "suggestions", "suggestions": seed,
                   "degraded": f"Error del modelo: {exc}"}
            yield {"type": "done"}
            return
        rows = normalize_suggestions(_extract_json(captured["text"]), ctx, limit=limit)
        if rows:
            break
        user_msg = (_user_prompt(ctx, hint)
                    + "\n\nTu respuesta anterior no era un JSON válido o usaba plantillas "
                      "inexistentes. Devuelve SOLO el objeto JSON, con claves de la lista.")

    if not rows:
        yield {"type": "suggestions", "suggestions": seed,
               "degraded": "La IA no devolvió propuestas utilizables; estas salen del guion."}
    else:
        # Las heurísticas que la IA no cubrió se quedan al final como alternativas.
        used = {r["template"] for r in rows if r["template"]}
        extra = [s for s in seed if s.get("strong") and s["template"] not in used]
        yield {"type": "suggestions", "suggestions": (rows + extra)[:limit + 2]}
    yield {"type": "done"}


async def sse(project_id: str, **kwargs) -> AsyncIterator[str]:
    async for ev in suggest_stream(project_id, **kwargs):
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"


# --- Construcción -----------------------------------------------------------------

def build_from_template(project_id: str, *, template: str, params: dict | None,
                        for_range: dict) -> dict:
    """Instancia la plantilla como BORRADOR del tramo. Sin IA: instantáneo y
    determinista (§16 — reutilizar estructura en vez de generar desde cero)."""
    from ..mcp_server import tools_motion
    return tools_motion.motion_create_composition(
        project_id, template=template, params=params or {}, for_range=for_range)
