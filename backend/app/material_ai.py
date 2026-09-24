"""Analizar el material con IA de visión (Microsoft Foundry).

Por cada clip de vídeo o imagen del proyecto saca 1-3 fotogramas, se los enseña al
deployment multimodal de Foundry (p. ej. ``gpt-5-mini``) junto con el guion y guarda:

  - ``description_ai``: qué se VE (quién, acción, plano, cómo cambia). Campo aparte:
    nunca pisa la descripción del usuario.
  - ``description``: SOLO si estaba vacía o repetía el título (p. ej. GIPHY rellena
    la descripción con el título); así Dirección de escena tiene con qué trabajar.
  - ``semantic``: metadata para dirigir escenas (``scene_direction.normalize_semantic``).
  - ``label``: SOLO si el título es genérico (vacío, nombre de archivo, "image"…, o el
    mismo título repetido en varios materiales, como el del tráiler de YouTube).

La parte pura (prompt, parseo, qué campos se escriben) está separada del I/O
(fotogramas, Foundry, persistencia) para poder testearla sin red.
"""
from __future__ import annotations

import base64
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable, Optional

from . import foundry, frame_grab, projects, scene_direction, storage

log = logging.getLogger("videoyt.material_ai")

KINDS = ("clips", "images")
FRAME_PX = 512            # "detail: low" de la API = 512 px; más no aporta
MAX_SCRIPT_CHARS = 1800
WORKERS = 3               # peticiones a Foundry en paralelo

_GENERIC_LABEL = re.compile(
    r"^(image|images|imagen|imagenes|imágenes|img|photo|foto|picture|video|vídeo|clip|gif"
    r"|untitled|sin t[ií]tulo)?[\s_\-\.\d()]*$", re.IGNORECASE)


# --- Selección --------------------------------------------------------------------

def _norm(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


# Sufijo que pone el extractor a los segmentos por referencia: "<título> · 0:13–0:14".
_RANGE_SUFFIX = re.compile(r"\s*·\s*\d+:\d{2}\s*[–-]\s*\d+:\d{2}\s*$")


def _base_label(text: Optional[str]) -> str:
    return _norm(_RANGE_SUFFIX.sub("", text or ""))


def is_analyzed(item) -> bool:
    return bool(getattr(item, "description_ai", None) and getattr(item, "semantic", None))


def select_items(proj, *, only_missing: bool = True,
                 refs: Optional[list[dict]] = None) -> list[tuple[str, object]]:
    """[(kind, item)] a analizar. ``refs`` = [{kind, id}] limita a esos materiales."""
    wanted = {(r.get("kind"), str(r.get("id"))) for r in (refs or []) if isinstance(r, dict)}
    out = []
    for kind in KINDS:
        for item in getattr(proj, kind, None) or []:
            ident = material_id(kind, item)
            if wanted and (kind, ident) not in wanted:
                continue
            if only_missing and not wanted and is_analyzed(item):
                continue
            out.append((kind, item))
    return out


def material_id(kind: str, item) -> str:
    return str(item.index if kind == "clips" else item.id)


def duplicate_labels(proj) -> set[str]:
    """Títulos (normalizados, sin el sufijo de rango de los segmentos) que se repiten en
    2+ materiales del mismo tipo."""
    dups: set[str] = set()
    for kind in KINDS:
        seen: set[str] = set()
        for item in getattr(proj, kind, None) or []:
            key = _base_label(getattr(item, "label", None))
            if not key:
                continue
            if key in seen:
                dups.add(key)
            seen.add(key)
    return dups


def source_ids(proj) -> set[str]:
    """ids de los vídeos de los que salieron segmentos por referencia: son el original
    (el tráiler entero) y conservan su título."""
    return {str(c.parent_id) for c in (getattr(proj, "clips", None) or []) if getattr(c, "parent_id", None)}


def is_generic_label(label: Optional[str], filename: Optional[str], dups: set[str]) -> bool:
    key = _norm(label)
    if not key or _base_label(label) in dups or _GENERIC_LABEL.match(key):
        return True
    if filename:
        name = _norm(filename)
        if key in (name, _norm(Path(filename).stem)):
            return True
    return False


# --- Fotogramas ---------------------------------------------------------------------

def clip_span(clip) -> tuple[float, float]:
    """(offset, duración) del clip DENTRO de su archivo. Un segmento por referencia usa
    [in_point, out_point] del original; si no, el archivo ES el clip (0..end-start)."""
    if clip.in_point is not None and clip.out_point is not None:
        return float(clip.in_point), max(0.0, float(clip.out_point) - float(clip.in_point))
    return 0.0, max(0.0, float(clip.end or 0.0) - float(clip.start or 0.0))


def frame_times(duration: float, n: int = 3) -> list[float]:
    """Instantes repartidos (sin tocar los bordes, donde suele haber fundidos)."""
    if duration <= 1.5 or n <= 1:
        return [max(0.0, duration / 2)]
    return [round(duration * f, 2) for f in ((0.15, 0.5, 0.85) if n == 3 else
                                             [(i + 1) / (n + 1) for i in range(n)])]


def _media_path(proj, kind: str, item) -> Path:
    path = storage.resolve_media(proj, "video" if kind == "clips" else "image", item.filename)
    if path is None or not path.exists():
        raise ValueError(f"No se encuentra el archivo: {item.filename}")
    return path


def grab_frames(proj, kind: str, item) -> tuple[list[bytes], list[float]]:
    """JPEGs (≤512 px) del material + sus instantes (relativos al material)."""
    path = _media_path(proj, kind, item)
    if kind == "clips":
        offset, dur = clip_span(item)
        times = frame_times(dur)
    else:
        offset = 0.0
        dur = float(getattr(item, "duration", None) or 0.0)   # GIF/imagen animada
        times = frame_times(dur, 2) if getattr(item, "animated", None) and dur > 1.5 else [0.0]
    frames = [frame_grab.extract_frame(path, offset + t, max_px=FRAME_PX) for t in times]
    return frames, times


# --- Prompt y parseo (puros) ----------------------------------------------------------

SYSTEM = (
    "Eres el asistente de montaje de un editor de vídeo vertical (Shorts/Reels). Miras "
    "fotogramas de un material (clip de vídeo o imagen) y lo catalogas para que un "
    "director de escena decida en qué frase del guion usarlo. Respondes SOLO con JSON válido."
)


def script_text(proj) -> str:
    """Guion del proyecto: subtítulos/transcripción de la timeline o, si no hay, el
    texto del audio del narrador (TTS)."""
    try:
        units, _ = scene_direction.script_units(proj)
    except Exception:  # noqa: BLE001 - el guion es contexto opcional
        units = []
    text = " ".join(u["text"] for u in units).strip()
    if not text:
        texts = [a.text for a in (proj.audios or []) if getattr(a, "text", None)]
        text = max(texts, key=len) if texts else ""
    return text[:MAX_SCRIPT_CHARS]


def build_prompt(*, project_name: str, script: str, kind: str, item, times: list[float]) -> str:
    what = "clip de vídeo" if kind == "clips" else (
        "GIF/imagen animada" if getattr(item, "animated", None) else "imagen")
    dur = ""
    if kind == "clips":
        dur = f" · {clip_span(item)[1]:.1f} s"
    frames = ("fotogramas en orden temporal, en los segundos " + ", ".join(f"{t:g}" for t in times)
              if len(times) > 1 else "un fotograma")
    label = (getattr(item, "label", None) or "").strip()
    note = (getattr(item, "description", None) or "").strip()
    lines = [f"Proyecto: {project_name}"]
    if script:
        lines.append(f'Guion del vídeo (para saber qué conceptos importan):\n"""{script}"""')
    lines.append(f"Material: {what}{dur}. Te paso {frames}.")
    if label:
        lines.append(f'Título actual: "{label[:120]}"')
    if note and _norm(note) != _norm(label):
        lines.append(f'Nota del usuario: "{note[:300]}"')
    lines.append(
        "Devuelve este JSON:\n"
        "{\n"
        '  "label": "título corto de lo que se ve (3-7 palabras)",\n'
        '  "description": "máx. 2 frases (≤ 35 palabras): qué se ve, quién (por su papel o '
        'aspecto), la acción, el plano/cámara y cómo cambia",\n'
        '  "subjects": ["2-4 sujetos u objetos principales"],\n'
        '  "actions": ["2-4 acciones que ocurren"],\n'
        '  "environment": "dónde ocurre",\n'
        '  "mood": "tono o emoción",\n'
        '  "composition": "tipo de plano y dónde está el sujeto en el encuadre",\n'
        '  "visual_content": "detalles visuales útiles y el texto visible si lo hay (≤ 20 palabras)",\n'
        '  "suggested_usage": "para qué frase o concepto del guion sirve (usa palabras del guion)",\n'
        '  "visual_priority": "protagonista | apoyo | fondo"\n'
        "}\n"
        "Reglas: todo en español y conciso (elementos de lista cortos). No menciones números "
        "de fotograma ni segundos. No reconozcas a personas reales por su cara: descríbelas por "
        "su papel o aspecto (si el título o la nota nombran al personaje, puedes usar ese "
        "nombre). No inventes lo que no se ve."
    )
    return "\n\n".join(lines)


def build_messages(prompt: str, frames: list[bytes]) -> list[dict]:
    content: list[dict] = [{"type": "text", "text": prompt}]
    for jpg in frames:
        b64 = base64.b64encode(jpg).decode("ascii")
        content.append({"type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"}})
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}]


def parse_result(text: str) -> dict:
    """Respuesta del modelo → {label, description, semantic}. Tolerante a ```json``` y a
    un ``semantic`` anidado. Lanza ValueError si no hay nada aprovechable."""
    from .foundry_ops import _extract_json

    data = _extract_json(text)
    if not isinstance(data, dict):
        raise ValueError("La IA no devolvió JSON.")
    flat = {**(data.get("semantic") if isinstance(data.get("semantic"), dict) else {}), **data}
    priority = str(flat.get("visual_priority") or "").strip().lower()
    flat["visual_priority"] = priority if priority in scene_direction.VISUAL_PRIORITIES else None
    label = re.sub(r"\s+", " ", str(data.get("label") or "")).strip().strip('"')[:60]
    out = {
        "label": label[:1].upper() + label[1:],
        "description": re.sub(r"\s+", " ", str(data.get("description") or "")).strip()[:400],
        "semantic": scene_direction.normalize_semantic(flat),
    }
    if not out["description"] and not out["semantic"]:
        raise ValueError("La respuesta de la IA vino vacía.")
    return out


def fields_to_save(item, result: dict, *, rename_generic: bool, dups: set[str]) -> dict:
    """Qué se escribe en el material. Nunca pisa lo que escribió el usuario."""
    fields: dict = {"description_ai": result["description"] or None,
                    "semantic": result["semantic"] or None}
    label = getattr(item, "label", None)
    desc = getattr(item, "description", None)
    if result["description"] and (not _norm(desc) or _norm(desc) == _norm(label)):
        fields["description"] = result["description"]
    if (rename_generic and result["label"]
            and is_generic_label(label, getattr(item, "filename", None), dups)):
        fields["label"] = result["label"]
    return {k: v for k, v in fields.items() if v is not None}


# --- I/O -------------------------------------------------------------------------------

def analyze_item(proj, kind: str, item, *, script: str) -> dict:
    """Llama a Foundry con los fotogramas del material. No guarda nada."""
    frames, times = grab_frames(proj, kind, item)
    prompt = build_prompt(project_name=proj.name, script=script, kind=kind, item=item, times=times)
    res = foundry.chat(build_messages(prompt, frames), max_tokens=900, json_mode=True, timeout=90)
    out = parse_result(res["text"])
    out["usage"] = res.get("usage") or {}
    return out


def run(pid: str, *, only_missing: bool = True, rename_generic: bool = True,
        refs: Optional[list[dict]] = None,
        on_progress: Optional[Callable[[float, str], None]] = None) -> dict:
    """Analiza el material del proyecto y lo guarda. Devuelve un resumen:
    {total, analyzed, failed:[{kind,id,label,error}], items:[{kind,id,label,old_label,description_ai,renamed}]}."""
    reason = foundry.unavailable_reason()
    if reason:
        raise foundry.FoundryError(reason, "not_configured")
    proj = projects.get_project(pid)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    todo = select_items(proj, only_missing=only_missing, refs=refs)
    summary: dict = {"total": len(todo), "analyzed": 0, "failed": [], "items": [],
                     "tokens": 0}
    if not todo:
        if on_progress:
            on_progress(1.0, "Todo el material ya estaba analizado.")
        return summary

    script = script_text(proj)
    dups = duplicate_labels(proj)
    sources = source_ids(proj)
    lock = threading.Lock()
    done = 0

    def work(kind: str, item) -> dict:
        res = analyze_item(proj, kind, item, script=script)
        is_source = kind == "clips" and str(getattr(item, "id", None)) in sources
        fields = fields_to_save(item, res, rename_generic=rename_generic and not is_source, dups=dups)
        saved = projects.update_material(pid, kind, material_id(kind, item), fields)
        if saved is None:
            raise LookupError("El material ya no existe.")
        return {"kind": kind, "id": material_id(kind, item),
                "label": saved.get("label"), "old_label": getattr(item, "label", None),
                "description_ai": saved.get("description_ai"),
                "renamed": "label" in fields, "tokens": res["usage"].get("total_tokens") or 0}

    if on_progress:
        on_progress(0.02, f"Analizando {len(todo)} materiales con Foundry…")
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(work, kind, item): (kind, item) for kind, item in todo}
        for fut in as_completed(futures):
            kind, item = futures[fut]
            with lock:
                done += 1
                try:
                    row = fut.result()
                    summary["analyzed"] += 1
                    summary["tokens"] += row.pop("tokens")
                    summary["items"].append(row)
                except Exception as exc:  # noqa: BLE001 - un material roto no tumba el lote
                    log.warning("Análisis de %s %s falló: %s", kind, material_id(kind, item), exc)
                    summary["failed"].append({"kind": kind, "id": material_id(kind, item),
                                              "label": getattr(item, "label", None),
                                              "error": str(exc)[:200]})
                if on_progress:
                    try:
                        on_progress(0.02 + 0.98 * done / len(todo),
                                    f"Analizado {done}/{len(todo)}: {getattr(item, 'label', None) or item.filename}")
                    except Exception:
                        # Cancelación pedida: no lanzar más peticiones.
                        for f in futures:
                            f.cancel()
                        raise
    return summary
