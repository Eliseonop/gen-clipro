"""IA de Generar Escena: preguntas → plan por beats → construcción beat a beat.

Todas las llamadas usan el proveedor configurado, sin historial y con la
DIRECCIÓN CREATIVA BLOQUEADA inyectada. La construcción es por beat (llamadas
pequeñas): los modelos fallan emitiendo una escena entera en un solo JSON.

- graphic/text → bloque html/css/js en formato de ETIQUETAS (no JSON: escapar HTML
  dentro de JSON es la primera causa de respuestas rotas).
- stick → storyboard JSON con el vocabulario cerrado de ``stick_ai``.
- image → tratamiento determinista de la dirección (sin IA).
Un beat que no valida tras reintentar cae a una tarjeta tipográfica (``fallback``).
"""
from __future__ import annotations

import asyncio
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, AsyncIterator

from ..ai.providers import get_provider
from . import directions, scene, stick, stick_ai
from .generate import _extract_json
from .models import MotionComposition
from .validator import validate

BLOCK_ATTEMPTS = 2
JSON_ATTEMPTS = 2

KIND_GUIDE = {
    "stick": "STICKMAN — personas, acciones, situaciones, emociones, causa-efecto humano, un personaje "
             "que vive el problema. Motor procedural con poses/expresiones/cámara (no dibuja objetos complejos).",
    "graphic": "GRÁFICO — diagramas, procesos, mecanismos, comparaciones, escalas, mapas simples, datos, "
               "flechas y formas que se construyen. Es el recurso para EXPLICAR cómo funciona algo.",
    "text": "TEXTO ANIMADO — la idea clave, una definición, una pregunta, una cifra o una frase potente. "
            "Pocas palabras con intención tipográfica.",
    "image": "IMAGEN — referencia real (foto, ilustración, asset del proyecto) cuando ver la cosa real aporta. "
             "Solo con asset_id de la lista de imágenes disponibles.",
}


# --- Utilidades ---------------------------------------------------------------------

async def _complete(system: str, user: str) -> str:
    """Una llamada sin herramientas; devuelve el texto del modelo."""
    provider = get_provider()
    captured = {"text": ""}

    async def emit(ev: dict) -> None:
        if ev.get("type") == "text":
            captured["text"] += ev.get("delta", "")

    async def no_tools(name: str, args: dict) -> dict:
        return {"ok": False, "text": "Sin herramientas: responde en el formato pedido."}

    await provider.run(system=system, history=[], user_message=user, tools=[],
                       call_tool=no_tools, emit=emit, max_iters=1)
    return captured["text"]


def _unavailable() -> str | None:
    return get_provider().unavailable_reason()


def _script_block(ctx: dict, brief: dict) -> str:
    # Dirección de escena: el paquete ya trae guion exacto, subtítulos, dirección y materiales.
    if (ctx or {}).get("directionPack"):
        return ctx["directionPack"]
    sc = (ctx or {}).get("scriptContext") or {}
    script = brief.get("script") or sc.get("current") or ""
    parts = []
    if sc.get("previous"):
        parts.append(f"  · justo antes: {sc['previous']}")
    parts.append(f"  · ESTE TRAMO: {script or '(sin guion: usa la idea)'}")
    if sc.get("next"):
        parts.append(f"  · justo después: {sc['next']}")
    return "\n".join(parts)


def _images(ctx: dict) -> list[dict]:
    return [a for a in ((ctx or {}).get("availableAssets") or []) if a.get("kind") == "image"]


def image_ids(ctx: dict) -> set[str]:
    return {str(a["id"]) for a in _images(ctx) if a.get("id")}


def _brief_block(brief: dict, d: dict) -> str:
    res = brief["resources"]
    mode_txt = {"auto": "la IA decide si lo usa", "required": "OBLIGATORIO (al menos un beat)", "off": "PROHIBIDO"}
    lines = [
        f"Idea: {brief['idea'] or '—'}",
        f"Duración total: {brief['duration']:g} s",
        f"Intención: {brief['intent']} → {scene.INTENTS[brief['intent']]}",
        f"Dirección creativa: {d['label']} — {d['summary']}",
        "Recursos:",
        *[f"  · {scene.RESOURCE_LABELS[k]}: {mode_txt[res[k]]}" for k in scene.RESOURCES],
        f"Ritmo: {brief['pace']} (≈{scene.PACES[brief['pace']]:g} s por beat)",
        f"Densidad de texto en pantalla: {brief['text_density']}",
        f"Fondo: {'escena opaca (tapa el vídeo)' if brief['background'] == 'opaque' else 'overlay transparente sobre el vídeo'}",
        f"Libertad creativa de la IA: {brief['ai_freedom']}",
    ]
    if brief["must_include"]:
        lines.append("Elementos OBLIGATORIOS: " + "; ".join(brief["must_include"]))
    if brief["notes"]:
        lines.append("Notas del usuario: " + brief["notes"])
    return "\n".join(lines)


# --- 0) Dirección visual GLOBAL (Fase 5) --------------------------------------------
# Una sola llamada barata que mira el VÍDEO ENTERO (guion + material) y decide el lenguaje
# visual del proyecto: dirección creativa dominante, identidad, vocabulario y reglas. Da
# coherencia al montaje antes de bajar tramo a tramo. Ver docs/DIRECCION_ESCENA §5.

def blueprint_system() -> str:
    return "\n\n".join([
        "Eres director de arte de un canal de vídeo divulgativo vertical. Tu tarea: definir la DIRECCIÓN "
        "VISUAL GLOBAL de UN vídeo entero (no de un tramo): el estilo único, el vocabulario visual permitido "
        "y las reglas de montaje que darán COHERENCIA a todo el vídeo. Decides el LENGUAJE, no escenas.",
        "Cómo decidir:\n"
        "1. Lee el guion completo y el material disponible; capta el tema, el tono y qué se puede contar.\n"
        "2. Elige UNA dirección creativa dominante de la lista (su 'key' EXACTA), la que mejor encaje.\n"
        "3. Escribe la identidad visual en 1-2 frases (el mundo visual del vídeo).\n"
        "4. Elige el vocabulario visual: SOLO los recursos que de verdad usarás (menos es más).\n"
        "5. Escribe 3-6 reglas duras de montaje, coherentes con: 'recurso corto y fuerte > escena larga "
        "mediocre', 'preferir material existente', 'una idea dominante por plano', 'subtítulos protegidos'.\n"
        "6. Describe la curva de intensidad del vídeo (hook → desarrollo → clímax → cierre) en 1 frase.",
        "RESPONDE EXCLUSIVAMENTE con JSON (sin ```), en el idioma del guion:\n"
        "{\n"
        '  "direction": "una key EXACTA de la lista",\n'
        '  "identity": "1-2 frases del mundo visual",\n'
        '  "vocabulary": ["recurso", "recurso"],\n'
        '  "rules": ["regla", "regla"],\n'
        '  "intensity_curve": "cómo sube y baja la intensidad, 1 frase"\n'
        "}",
    ])


def blueprint_user(project_name: str, script: str, materials: list[dict],
                   directions_list: list[dict], vocabulary: list[str]) -> str:
    dirs = "\n".join(f"  · {d['key']}: {d['label']} — {d['summary']}" for d in directions_list)
    mats = "\n".join(f"  · {m.get('title') or m.get('id')}: {(m.get('description') or '')[:100]}"
                     for m in materials[:15]) or "  (sin material todavía)"
    return "\n\n".join([
        f"PROYECTO: {project_name}",
        "GUION COMPLETO DEL VÍDEO:\n" + (script or "(sin guion transcrito; guíate por el proyecto y el material)"),
        "MATERIAL DISPONIBLE (para decidir qué vocabulario es realista):\n" + mats,
        "DIRECCIONES CREATIVAS (elige UNA key EXACTA):\n" + dirs,
        "VOCABULARIO VISUAL sugerido (elige de aquí; añade otro solo si de verdad hace falta): "
        + ", ".join(vocabulary),
        "Define la dirección visual GLOBAL del vídeo. Devuelve SOLO el JSON.",
    ])


async def blueprint_stream(*, project_name: str, script: str, materials: list[dict],
                           directions_list: list[dict], vocabulary: list[str]) -> AsyncIterator[dict]:
    reason = _unavailable()
    if reason:
        yield {"type": "error", "message": reason}
        return
    yield {"type": "start"}
    yield {"type": "status", "message": "Leyendo el vídeo entero…"}
    user = blueprint_user(project_name, script, materials, directions_list, vocabulary)
    for _ in range(JSON_ATTEMPTS):
        try:
            text = await _complete(blueprint_system(), user)
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"Error del modelo: {exc}"}
            return
        obj = _extract_json(text)
        if isinstance(obj, dict) and (obj.get("direction") or obj.get("identity")
                                      or obj.get("vocabulary") or obj.get("rules")):
            yield {"type": "blueprint", "blueprint": obj}
            yield {"type": "done"}
            return
        user += "\n\nTu respuesta no era un JSON válido. Devuelve SOLO el objeto JSON pedido."
    yield {"type": "error", "message": "La IA no devolvió un blueprint válido. Reintenta."}


# Plan editorial de TODA la escaleta en una pasada (§5.2): guiada por el blueprint, decide el
# plan de cada tramo (mode/composition_intent/complexity/no_visual) sin componer ni elegir
# material. Barato: la IA solo ve voz+tiempos por tramo, no el pack completo de cada uno.

def plan_all_system() -> str:
    return "\n\n".join([
        "Eres director de escena. Tienes el vídeo entero dividido en TRAMOS (con su voz y tiempos) y una "
        "DIRECCIÓN VISUAL GLOBAL ya decidida. Tu tarea: para CADA tramo decide el PLAN editorial —qué se "
        "cuenta y con cuánta intensidad—, coherente con la dirección global. NO generes escenas ni elijas "
        "material todavía: SOLO el plan.",
        "Para cada tramo decide:\n"
        "- mode: propose | explain | represent | reinforce | material (el enfoque del tramo).\n"
        "- composition_intent: 1 frase en lenguaje natural (qué es lo principal, qué acompaña, qué zonas "
        "dejar libres). Recuerda: recurso corto y fuerte > escena larga mediocre; una idea dominante por plano.\n"
        "- complexity: 1-5 (1 simple … 5 clímax). Reparte la intensidad según la curva; NO todo a 4-5.\n"
        "- no_visual: true si el tramo NO necesita nada nuevo (basta mantener el plano + subtítulos).",
        "RESPONDE EXCLUSIVAMENTE con JSON (sin ```), en el idioma del guion, con TODOS los tramos por su id:\n"
        '{"segments": [{"id": "…", "mode": "explain", "composition_intent": "…", "complexity": 3, '
        '"no_visual": false}]}',
    ])


def plan_all_user(blueprint_text: str, escaleta: list[dict], materials: list[dict]) -> str:
    segs = "\n".join(f"  · {s['id']} [{float(s['start']):.1f}–{float(s['end']):.1f}s] "
                     f"«{(s.get('text') or '(sin voz)')[:160]}»" for s in escaleta)
    mats = "\n".join(f"  · {m.get('title') or m.get('id')}: {(m.get('description') or '')[:100]}"
                     for m in materials[:15]) or "  (sin material todavía)"
    parts = []
    if blueprint_text.strip():
        parts.append(blueprint_text)
    parts += [
        "TRAMOS DEL VÍDEO (decide el plan de CADA uno, por su id):\n" + segs,
        "MATERIAL DISPONIBLE (para saber qué es realista contar con lo que hay):\n" + mats,
        "Devuelve SOLO el JSON con TODOS los tramos por su id.",
    ]
    return "\n\n".join(parts)


async def plan_all_stream(*, blueprint_text: str, escaleta: list[dict],
                          materials: list[dict]) -> AsyncIterator[dict]:
    reason = _unavailable()
    if reason:
        yield {"type": "error", "message": reason}
        return
    yield {"type": "start"}
    yield {"type": "status", "message": f"Planificando {len(escaleta)} tramos…"}
    user = plan_all_user(blueprint_text, escaleta, materials)
    for _ in range(JSON_ATTEMPTS):
        try:
            text = await _complete(plan_all_system(), user)
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"Error del modelo: {exc}"}
            return
        obj = _extract_json(text)
        if isinstance(obj, dict) and isinstance(obj.get("segments"), list) and obj["segments"]:
            yield {"type": "plan_all", "segments": obj["segments"]}
            yield {"type": "done"}
            return
        user += "\n\nTu respuesta no era un JSON válido con 'segments'. Devuelve SOLO el objeto JSON."
    yield {"type": "error", "message": "La IA no devolvió un plan válido. Reintenta."}


# --- 1) Preguntas --------------------------------------------------------------------

def questions_system() -> str:
    return "\n\n".join([
        "Eres un director de escena de vídeo divulgativo. Antes de diseñar una escena haces SOLO las "
        "preguntas que de verdad cambian el resultado. Lee el brief y el guion; si algo importante es "
        "ambiguo (qué debe verse, el tono, qué elemento es el protagonista, un dato que falta, si hay un "
        "personaje), pregúntalo con opciones concretas. Si el brief ya responde algo, NO lo preguntes. "
        "Nunca preguntes por la duración, la dirección creativa ni los recursos: ya están en el brief.",
        "Máximo 4 preguntas, cada una con 2-5 opciones cortas y específicas del contenido (no genéricas). "
        "Si no hace falta preguntar nada, devuelve una lista vacía.",
        "RESPONDE EXCLUSIVAMENTE con JSON (sin ```):\n"
        '{"questions": [{"id": "q1", "question": "…", "why": "por qué importa (1 frase)", '
        '"options": ["…", "…"], "multi": false}]}',
    ])


def questions_user(ctx: dict, brief: dict, d: dict) -> str:
    return "\n\n".join([
        "BRIEF DE LA ESCENA:\n" + _brief_block(brief, d),
        "GUION:\n" + _script_block(ctx, brief),
        "Haz tus preguntas (o ninguna). Devuelve SOLO el JSON.",
    ])


async def questions_stream(*, ctx: dict, brief: dict) -> AsyncIterator[dict]:
    reason = _unavailable()
    if reason:
        yield {"type": "error", "message": reason}
        return
    d = scene.resolved_direction(brief)
    yield {"type": "start"}
    yield {"type": "status", "message": "Leyendo el guion…"}
    user = questions_user(ctx, brief, d)
    for _ in range(JSON_ATTEMPTS):
        try:
            text = await _complete(questions_system(), user)
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"Error del modelo: {exc}"}
            return
        obj = _extract_json(text)
        if obj is not None or text.strip().startswith("[]"):
            yield {"type": "questions", "questions": scene.normalize_questions(obj or [])}
            yield {"type": "done"}
            return
        user += "\n\nTu respuesta no era JSON válido. Devuelve SOLO el objeto JSON."
    yield {"type": "questions", "questions": []}
    yield {"type": "done"}


# --- 2) Plan -------------------------------------------------------------------------

def plan_system(d: dict) -> str:
    kinds = "\n".join(f"- {k}: {v}" for k, v in KIND_GUIDE.items())
    return "\n\n".join([
        "Eres director de escena y director de arte. Diseñas UNA escena para un tramo de vídeo vertical "
        "combinando los recursos del estudio. NO ejecutas literalmente lo que se te pide: decides qué "
        "combinación de recursos EXPLICA o REPRESENTA mejor el contenido, dentro de los límites del brief.",
        "RECURSOS (tipos de beat):\n" + kinds,
        "CÓMO PENSAR LA ESCENA:\n"
        "1. Identifica la idea única que el espectador debe llevarse.\n"
        "2. Divide el tramo en beats que sigan el guion en orden (lo que se dice ≈ lo que se ve). Cada beat "
        "tiene UN propósito y UN protagonista visual.\n"
        "3. Elige para cada beat el recurso que mejor lo cuenta; varía cuando aporte, no por variar.\n"
        "4. Recursos OBLIGATORIOS deben aparecer al menos una vez; PROHIBIDOS nunca.\n"
        "5. Los elementos obligatorios del usuario deben verse en algún beat.\n"
        "6. El texto en pantalla complementa a la voz (no la transcribe). Respeta la densidad de texto.\n"
        "7. Libertad alta = propón la lectura visual más potente; baja = cíñete a la idea y al guion.\n"
        "8. Todo beat se describe en el lenguaje de la dirección creativa (materiales, composición, movimiento).",
        directions.compile_lock(d),
        "RESPONDE EXCLUSIVAMENTE con JSON (sin ```), en el idioma del guion:\n"
        "{\n"
        '  "title": "título corto de la escena",\n'
        '  "logline": "qué cuenta la escena en 1 frase",\n'
        '  "rationale": "por qué esta combinación de recursos (2-3 frases)",\n'
        '  "beats": [{\n'
        '    "kind": "stick" | "graphic" | "text" | "image",\n'
        '    "duration": segundos,\n'
        '    "purpose": "qué aporta este beat",\n'
        '    "content": "texto que se verá en pantalla (corto) o vacío",\n'
        '    "visual": "qué se ve, dónde está y cómo se mueve, en el lenguaje de la dirección",\n'
        '    "asset_id": "id de imagen (solo kind=image)",\n'
        '    "action": "qué hace el/los stickman (solo kind=stick)"\n'
        "  }]\n"
        "}\n"
        "La suma de duraciones = duración total. Cada beat ≥ 0.8 s.",
    ])


def plan_user(ctx: dict, brief: dict, d: dict, answers: list[dict]) -> str:
    parts = ["BRIEF:\n" + _brief_block(brief, d), "GUION:\n" + _script_block(ctx, brief)]
    kt = ((ctx or {}).get("scriptContext") or {}).get("keyTerms") or []
    if kt:
        parts.append("Términos clave: " + ", ".join(kt))
    imgs = _images(ctx)
    if imgs and brief["resources"].get("image") != "off":
        parts.append("IMÁGENES DISPONIBLES (usa su id en asset_id):\n" + "\n".join(
            f"  · {a['id']}: {a.get('label')}" + (" ← relacionada con el guion" if a.get("match") else "")
            for a in imgs[:12]))
    elif brief["resources"].get("image") != "off":
        parts.append("No hay imágenes en el proyecto: no uses beats de tipo image.")
    if answers:
        parts.append("RESPUESTAS DEL USUARIO:\n" + "\n".join(f"  · {a['question']} → {a['answer']}" for a in answers))
    parts.append("Diseña la escena. Devuelve SOLO el JSON.")
    return "\n\n".join(parts)


def skeleton_system(d: dict, n: int) -> str:
    kinds = "\n".join(f"- {k}: {v}" for k, v in KIND_GUIDE.items())
    return "\n\n".join([
        "Eres director de escena. El tramo YA está dividido en beats, uno por frase del guion y con sus "
        f"tiempos. Tu única tarea: para cada uno de los {n} beats decide QUÉ SE VE. No cambies el número "
        "ni el orden de los beats.",
        "TIPOS DE BEAT:\n" + kinds,
        "Reglas: sigue la DIRECCIÓN del tramo; recursos PROHIBIDOS nunca, OBLIGATORIOS al menos una vez; "
        "si hay MATERIAL OBLIGATORIO úsalo; el texto en pantalla es corto y no repite la frase entera.",
        directions.compile_lock(d),
        "RESPONDE SOLO con JSON (sin ```), en el idioma del guion:\n"
        '{"title": "…", "logline": "…", "rationale": "1-2 frases", "beats": [\n'
        '  {"n": 1, "kind": "stick|graphic|text|image", "content": "texto corto en pantalla o vacío", '
        '"visual": "qué se ve y cómo se mueve", "asset_id": "solo image", "action": "solo stick"}\n]}',
    ])


def skeleton_user(ctx: dict, brief: dict, d: dict, answers: list[dict], skeleton: list[dict]) -> str:
    beats = "\n".join(f"  {i + 1}. {b['start']:.1f}–{b['end']:.1f}s  «{b['text'] or '(sin voz)'}»"
                      for i, b in enumerate(skeleton))
    parts = ["CONTEXTO DEL TRAMO:\n" + _script_block(ctx, brief), "BRIEF:\n" + _brief_block(brief, d),
             "BEATS (fijos):\n" + beats]
    if answers:
        parts.append("RESPUESTAS DEL USUARIO:\n" + "\n".join(f"  · {a['question']} → {a['answer']}" for a in answers))
    parts.append(f"Devuelve SOLO el JSON con exactamente {len(skeleton)} beats.")
    return "\n\n".join(parts)


def merge_skeleton(obj: dict | None, skeleton: list[dict], brief: dict) -> tuple[dict, int]:
    """Fusiona la respuesta de la IA con los beats fijos (por ``n`` o por orden). Lo que
    falte se rellena con un beat de texto: el plan SIEMPRE sale, aunque el modelo sea flojo."""
    got = obj.get("beats") if isinstance(obj, dict) and isinstance(obj.get("beats"), list) else []
    by_n = {}
    for i, b in enumerate(got):
        if isinstance(b, dict):
            try:
                by_n[int(b.get("n"))] = b
            except (TypeError, ValueError):
                by_n.setdefault(i + 1, b)
    beats = []
    missing = 0
    for i, sk in enumerate(skeleton):
        ai = by_n.get(i + 1) or (got[i] if i < len(got) and isinstance(got[i], dict) else None)
        if ai is None:
            missing += 1
            ai = {"kind": "text", "content": _short(sk["text"])}
        beats.append({**ai, "duration": sk["end"] - sk["start"],
                      "purpose": ai.get("purpose") or sk["text"] or "Acompañar el tramo"})
    raw = {**(obj if isinstance(obj, dict) else {}), "beats": beats}
    return raw, missing


def _short(text: str, words: int = 6) -> str:
    return " ".join((text or "").split()[:words])


async def plan_stream(*, ctx: dict, brief: dict, answers: list[dict]) -> AsyncIterator[dict]:
    reason = _unavailable()
    if reason:
        yield {"type": "error", "message": reason}
        return
    d = scene.resolved_direction(brief)
    yield {"type": "start"}
    skeleton = (ctx or {}).get("skeleton") if brief.get("structure") == "script" else None
    if skeleton:
        yield {"type": "status", "message": f"Decidiendo qué se ve en {len(skeleton)} beats del guion…"}
        user = skeleton_user(ctx, brief, d, answers, skeleton)
        obj = None
        for _ in range(JSON_ATTEMPTS):
            try:
                text = await _complete(skeleton_system(d, len(skeleton)), user)
            except Exception as exc:  # noqa: BLE001
                yield {"type": "error", "message": f"Error del modelo: {exc}"}
                return
            obj = _extract_json(text)
            if obj and isinstance(obj.get("beats"), list) and obj["beats"]:
                break
            user += "\n\nTu respuesta no era un JSON válido con 'beats'. Devuelve SOLO el objeto JSON."
        raw, missing = merge_skeleton(obj, skeleton, brief)
        plan = scene.normalize_plan(raw, brief, image_ids=image_ids(ctx))
        if missing:
            plan["warnings"].insert(0, f"La IA no decidió {missing} de {len(skeleton)} beats: se rellenaron con texto.")
        yield {"type": "plan", "plan": plan}
        yield {"type": "done"}
        return
    yield {"type": "status", "message": "Diseñando la escena…"}
    user = plan_user(ctx, brief, d, answers)
    for _ in range(JSON_ATTEMPTS):
        try:
            text = await _complete(plan_system(d), user)
        except Exception as exc:  # noqa: BLE001
            yield {"type": "error", "message": f"Error del modelo: {exc}"}
            return
        obj = _extract_json(text)
        if obj and isinstance(obj.get("beats"), list) and obj["beats"]:
            yield {"type": "plan", "plan": scene.normalize_plan(obj, brief, image_ids=image_ids(ctx))}
            yield {"type": "done"}
            return
        yield {"type": "status", "message": "Ajustando el plan…"}
        user += "\n\nTu respuesta no era un JSON válido con 'beats'. Devuelve SOLO el objeto JSON."
    yield {"type": "error", "message": "La IA no devolvió un plan válido. Reintenta."}


# --- 3) Construcción -----------------------------------------------------------------

def block_system(d: dict, width: int, height: int) -> str:
    return "\n\n".join([
        "Eres un motion designer y director de arte. Construyes UN beat de una escena como un bloque "
        "HTML + CSS + GSAP que se renderiza frame a frame (determinista) en Chromium.",
        directions.compile_lock(d),
        directions.kit_reference(d),
        f"REGLAS TÉCNICAS (obligatorias):\n"
        f"- Lienzo {width}×{height} px. 'root' es el contenedor del beat (100% × 100%, position:relative). "
        "Posiciona con position:absolute y tamaños en var(--u).\n"
        "- 'js' es el CUERPO de function(tl, root, gsap, ctx). Añade tweens a 'tl'. Tiempo LOCAL: 0 = inicio "
        "del beat; ctx.life = duración del beat en segundos. Todo debe ocurrir dentro de [0, ctx.life].\n"
        "- Usa SIEMPRE tl.fromTo(el, {inicial}, {final, duration, ease}, t). NUNCA tl.from/tl.to/gsap.from/"
        "gsap.to. Si animas dos veces la misma propiedad, añade immediateRender:false al segundo fromTo.\n"
        "- PROHIBIDO: Date, Math.random, setTimeout, setInterval, requestAnimationFrame, fetch, URLs externas, "
        "<script>, <img> con src http. Imágenes del proyecto SOLO con src=\"asset:image/<id>\".\n"
        "- Selecciona dentro de root (root.querySelector/All). Prefija tus clases CSS con el id del beat.\n"
        "- Trazos dibujados: <svg> con paths class=\"sc-stroke\"; en js calcula L=path.getTotalLength() y "
        "anima strokeDasharray:L con fromTo strokeDashoffset L→0. Para contar un número anima un objeto proxy "
        "con onUpdate que escriba textContent.\n"
        "- Toda medida con --u va DENTRO de calc(): top:calc(var(--u)*3). `3*var(--u)` es CSS inválido y "
        "rompe el layout. Da width explícito a los contenedores de texto (si no, el texto se parte palabra a palabra).\n"
        "- Tipografía con las fuentes del kit (var(--sc-font-*)). Colores SOLO con var(--sc-*).\n"
        "- No hace falta animar la salida del beat: hay transición. Deja el estado final legible.\n"
        "- Texto corto, en el idioma del guion; el protagonista domina; respeta la composición de la dirección.",
        "FORMATO DE RESPUESTA (sin JSON, sin ```, sin explicaciones), exactamente:\n"
        "<html>\n…markup…\n</html>\n<css>\n…estilos…\n</css>\n<js>\n…cuerpo de la función…\n</js>",
    ])


def block_user(beat: dict, plan: dict, beats: list[dict], brief: dict, ctx: dict, width: int, height: int) -> str:
    idx = next((i for i, b in enumerate(beats) if b["id"] == beat["id"]), 0)
    prev_b = beats[idx - 1] if idx > 0 else None
    next_b = beats[idx + 1] if idx + 1 < len(beats) else None
    life = round(float(beat["end"]) - float(beat["start"]), 3)

    def brief_of(b: dict | None) -> str:
        return f"{b['kind']}: {b.get('purpose') or b.get('content')}" if b else "—"

    parts = [
        f"ESCENA: {plan.get('title') or ''} — {plan.get('logline') or ''}",
        f"BEAT {idx + 1}/{len(beats)} (id {beat['id']}, tipo {beat['kind']}, duración {life:g} s)",
        f"  · propósito: {beat.get('purpose') or '—'}",
        f"  · texto en pantalla: {beat.get('content') or '(ninguno)'}",
        f"  · cómo se ve y se mueve: {beat.get('visual') or '(decide tú en la dirección)'}",
        f"Beat anterior: {brief_of(prev_b)} · siguiente: {brief_of(next_b)}",
        "Guion del tramo:\n" + _script_block(ctx, brief),
        f"Densidad de texto: {brief['text_density']}.",
    ]
    if brief["background"] == "transparent":
        avoid = ((ctx or {}).get("style") or {}).get("avoidY")
        parts.append("Es un OVERLAY sobre vídeo: no pintes un fondo a pantalla completa"
                     + (f" y no pongas nada en la franja vertical y∈{avoid} (subtítulos)." if avoid else "."))
    if brief["must_include"]:
        parts.append("Elementos obligatorios de la escena (si encajan en ESTE beat): " + "; ".join(brief["must_include"]))
    imgs = _images(ctx)
    if imgs:
        parts.append("Imágenes del proyecto que puedes usar: " + "; ".join(f"{a['id']} ({a.get('label')})" for a in imgs[:8]))
    parts.append(f"Lienzo {width}×{height}. Construye el bloque ahora.")
    return "\n".join(parts)


_TAG_RE = {t: re.compile(rf"<{t}>\s*(.*?)\s*</{t}>", re.S | re.I) for t in ("html", "css", "js")}
_BANNED_JS = [
    (re.compile(r"\b(?:tl|gsap)\.(?:from|to)\s*\("), "usa tl.fromTo (no .from/.to)"),
    (re.compile(r"\bMath\.random\b|\bDate\b|\bsetTimeout\b|\bsetInterval\b|requestAnimationFrame|\bfetch\s*\("),
     "sin Date/Math.random/timers/fetch"),
    (re.compile(r"https?://"), "sin URLs externas"),
]


def parse_block(text: str) -> dict[str, str] | None:
    t = re.sub(r"```[a-zA-Z]*", "", text or "")
    out = {}
    for tag, rx in _TAG_RE.items():
        # Última coincidencia: el markup puede empezar con <html> dentro del propio bloque.
        found = rx.findall(t)
        out[tag] = found[-1].strip() if found else ""
    return repair_block(out) if (out["html"] or out["js"]) else None


# `3*var(--u)` / `var(--u)*3` fuera de calc() es CSS INVÁLIDO: el navegador descarta la
# declaración entera y los contenedores colapsan a 0 px (error típico de los modelos).
# Envolver en calc() es seguro también dentro de otro calc() (calc anidado es válido).
_BARE_U = re.compile(
    r"(?<![\w(])(-?\d*\.?\d+)\s*\*\s*var\(\s*--u\s*\)"
    r"|var\(\s*--u\s*\)\s*\*\s*(-?\d*\.?\d+)(?![\w.])")


def _wrap_bare_u(css: str) -> str:
    def sub(m: re.Match) -> str:
        n = m.group(1) if m.group(1) is not None else m.group(2)
        return f"calc({n} * var(--u))"
    return _BARE_U.sub(sub, css or "")


def repair_block(block: dict[str, str]) -> dict[str, str]:
    """Arreglos mecánicos y seguros del bloque (no cambian la intención)."""
    return {**block, "css": _wrap_bare_u(block.get("css") or ""), "html": _wrap_bare_u(block.get("html") or "")}


def _node_check(js: str) -> str | None:
    """Error de sintaxis del js del bloque (si hay node disponible)."""
    node = shutil.which("node")
    if not node:
        return None
    with tempfile.TemporaryDirectory(prefix="scene-js-") as td:
        f = Path(td) / "b.js"
        f.write_text("(function(tl, root, gsap, ctx){\n" + js + "\n});\n", encoding="utf-8")
        try:
            proc = subprocess.run([node, "--check", str(f)], capture_output=True, text=True, timeout=15)
        except (OSError, subprocess.TimeoutExpired):
            return None
    if proc.returncode == 0:
        return None
    lines = [ln for ln in (proc.stderr or "").splitlines() if "SyntaxError" in ln or ln.strip().startswith("^")]
    return "Error de sintaxis en js: " + (" ".join(lines)[:300] or proc.stderr[-300:])


def check_block(block: dict[str, str], beat: dict, width: int, height: int) -> list[str]:
    errs: list[str] = []
    for rx, msg in _BANNED_JS:
        if rx.search(block.get("js") or ""):
            errs.append(msg)
    if re.search(r"https?://", (block.get("html") or "") + (block.get("css") or "")):
        errs.append("sin URLs externas en html/css")
    life = max(0.1, float(beat["end"]) - float(beat["start"]))
    tmp = scene.beat_layer({**beat, "block": block, "kind": "graphic"}, directions.get(None), width, height)
    comp = MotionComposition(id="check", width=width, height=height, duration=max(life, float(beat["end"])),
                             layers=[tmp])
    errs += validate(comp)
    if not errs and block.get("js"):
        syn = _node_check(block["js"])
        if syn:
            errs.append(syn)
    return errs


async def _build_block(beat, plan, beats, brief, ctx, d, width, height, log) -> tuple[dict | None, list[str]]:
    system = block_system(d, width, height)
    user = block_user(beat, plan, beats, brief, ctx, width, height)
    errs: list[str] = []
    for attempt in range(BLOCK_ATTEMPTS):
        text = await _complete(system, user)
        block = parse_block(text)
        if block is None:
            errs = ["La respuesta no tenía <html>/<css>/<js>."]
        else:
            errs = check_block(block, beat, width, height)
            if not errs:
                return block, []
        await log(f"Corrigiendo beat {beat['id']}: {errs[0][:120]}")
        user = (block_user(beat, plan, beats, brief, ctx, width, height)
                + "\n\nTu bloque anterior falló: " + "; ".join(errs)[:600]
                + "\nCorrígelo y devuelve el bloque completo en el formato de etiquetas.")
    return None, errs


async def _build_stick(beat, brief, ctx, d, cast) -> dict | None:
    life = round(float(beat["end"]) - float(beat["start"]), 3)
    script = beat.get("action") or beat.get("visual") or beat.get("purpose") or beat.get("content") or ""
    sc = (ctx or {}).get("scriptContext") or {}
    script = (f"{script}\n\nContexto (lo que dice la voz): {brief.get('script') or sc.get('current') or ''}\n"
              f"Escena en la dirección creativa '{d['label']}': {d['summary']} "
              f"Usa 1-3 planos; texto en pantalla solo si ayuda: {beat.get('content') or 'ninguno'}.")
    user = stick_ai.user_prompt(script, duration=life, style=None, environment=None, cast=cast)
    for _ in range(JSON_ATTEMPTS):
        text = await _complete(stick_ai.system_prompt(), user)
        obj = _extract_json(text)
        if obj and isinstance(obj.get("shots"), list) and obj["shots"]:
            return scene.prepare_stick(stick_ai._merge_cast(obj, cast), beat, d, brief)
        user += "\n\nTu respuesta anterior no era un JSON válido con 'shots'. Devuelve SOLO el objeto JSON."
    return None


async def build_stream(project_id: str, *, ctx: dict, brief: dict, answers: list[dict], plan: dict,
                       fmt: dict, for_range: dict, variant_of: str | None = None,
                       only_beats: list[str] | None = None,
                       previous: dict | None = None) -> AsyncIterator[dict]:
    """Construye la escena beat a beat y guarda el borrador. Eventos: start / status /
    beat_start / beat_done / created / error / done.

    ``only_beats`` + ``previous`` (scene previa) regeneran solo esos beats y conservan el resto."""
    reason = _unavailable()
    if reason:
        yield {"type": "error", "message": reason}
        return
    from ..mcp_server import tools_motion
    from . import service as motion_service

    d = scene.resolved_direction(brief)
    width, height, fps = int(fmt["width"]), int(fmt["height"]), int(fmt["fps"])
    beats = [dict(b) for b in plan["beats"]]
    prev_beats = {b.get("id"): b for b in ((previous or {}).get("beats") or []) if isinstance(b, dict)}
    cast = stick.project_cast(project_id)
    queue: asyncio.Queue = asyncio.Queue()

    async def log(msg: str) -> None:
        await queue.put({"type": "status", "message": msg})

    async def worker() -> None:
        nonlocal cast
        try:
            for i, beat in enumerate(beats):
                keep = prev_beats.get(beat["id"])
                if only_beats is not None and beat["id"] not in only_beats and keep \
                        and keep.get("kind") == beat["kind"]:
                    for k in ("block", "stick", "fallback"):
                        if k in keep:
                            beat[k] = keep[k]
                    continue
                await queue.put({"type": "beat_start", "beat_id": beat["id"], "index": i,
                                 "total": len(beats), "kind": beat["kind"]})
                fallback = False
                if beat["kind"] == "stick":
                    sb = await _build_stick(beat, brief, ctx, d, cast)
                    if sb:
                        beat["stick"] = sb
                        cast = _extend_cast(cast, sb)
                    else:
                        fallback = True
                elif beat["kind"] == "image" and beat.get("asset_id"):
                    pass   # determinista
                else:
                    block, errs = await _build_block(beat, plan, beats, brief, ctx, d, width, height, log)
                    if block:
                        beat["block"] = block
                    else:
                        fallback = True
                        await log(f"Beat {beat['id']}: se usa una tarjeta de respaldo ({(errs or [''])[0][:80]})")
                beat["fallback"] = fallback
                await queue.put({"type": "beat_done", "beat_id": beat["id"], "index": i, "fallback": fallback})
        except Exception as exc:  # noqa: BLE001
            await queue.put({"type": "error", "message": f"Error del modelo: {exc}"})
        finally:
            await queue.put(None)

    yield {"type": "start", "total": len(beats)}
    task = asyncio.create_task(worker())
    try:
        while True:
            ev = await queue.get()
            if ev is None:
                break
            yield ev
    finally:
        await task

    scene_data = {"brief": brief, "answers": answers,
                  "plan": {k: plan.get(k) for k in ("title", "logline", "rationale")},
                  "beats": beats}
    yield {"type": "status", "message": "Montando la escena…"}
    try:
        cid = variant_of if variant_of and motion_service.get_composition(project_id, variant_of) else None
        comp = scene.build_composition(cid or "pending", scene_data, width=width, height=height, fps=fps,
                                       project_id=project_id)
        if cid:
            data = tools_motion.motion_update_composition(project_id, cid, comp.model_dump(), for_range=for_range)
        else:
            data = tools_motion.motion_create_composition(project_id, composition=comp.model_dump(),
                                                          for_range=for_range)
            cid = data.get("composition_id")
    except Exception as exc:  # noqa: BLE001
        yield {"type": "error", "message": getattr(exc, "message", None) or str(exc)}
        return
    saved = motion_service.get_composition(project_id, cid)
    yield {"type": "created", "composition_id": cid, "version": saved.version if saved else None,
           "duration": saved.duration if saved else None,
           "fallbacks": [b["id"] for b in beats if b.get("fallback")]}
    yield {"type": "done"}


def _extend_cast(cast: list[dict], sb: dict) -> list[dict]:
    """Personajes creados en un beat stick → reparto para los siguientes (continuidad)."""
    ids = {c.get("id") for c in cast}
    return cast + [c for c in sb.get("characters") or [] if c.get("id") not in ids]


async def to_sse(stream: AsyncIterator[dict]) -> AsyncIterator[str]:
    async for ev in stream:
        yield "data: " + json.dumps(ev, ensure_ascii=False) + "\n\n"
