"""Dirección de escena: la escaleta de TRAMOS del guion y lo que la IA debe hacer en cada uno.

Etapa entre "tengo audio + subtítulos" y "genero escenas". El usuario recorre el guion
tramo a tramo e indica la intención visual (explicar, representar, reforzar, usar un
material, seguir el guion estrictamente o "necesita propuesta").

Diseño para CUALQUIER modelo, incluso pequeño: la aplicación hace el trabajo
determinista y la IA solo recibe un PAQUETE de contexto pequeño y ya decidido:

1. ``script_units``   el guion en frases con tiempos (subtítulos → transcripción del
                      material → texto del audio estimado → nada). Nunca se asume que
                      hay subtítulos.
2. ``auto_segments``  propone tramos agrupando frases (sin pisar lo ya dirigido).
3. ``build_pack``     SOLO lo necesario de UN tramo: sus subtítulos exactos, una frase
                      antes/después, la dirección, los materiales elegidos (o 5 candidatos
                      por relevancia), el tramo de referencia y los vecinos.
4. ``pack_text``      el texto EXACTO que recibe la IA, con presupuesto de caracteres
                      (la UI lo muestra: nada oculto).
5. ``skeleton_beats`` si hay que seguir el guion, los beats salen de las frases: la IA
                      solo rellena qué se ve en cada uno (tarea pequeña y verificable).
"""
from __future__ import annotations

import re
import time
import uuid
from typing import Any

from . import projects
from .clip_speed import clip_timeline_duration
from .motion import segment_context as sc
from .text_role import resolve_text_role

VERSION = 1
MODES: dict[str, dict[str, str]] = {
    "propose": {"label": "Necesita propuesta",
                "ai": "Propón la mejor representación visual para este tramo; decides tú el enfoque."},
    "explain": {"label": "Explicar lo narrado",
                "ai": "Haz ENTENDER lo que dice la voz: el mecanismo, la causa o el dato. Claridad antes que estética."},
    "represent": {"label": "Representar la idea",
                  "ai": "Traduce la idea a una imagen o metáfora visual potente; no la expliques con texto."},
    "reinforce": {"label": "Repetir / reforzar",
                  "ai": "Vuelve a la escena del tramo de referencia (mismo lenguaje, personajes y elementos) "
                        "para reforzar la idea; varía lo mínimo."},
    "material": {"label": "Usar material",
                 "ai": "El protagonista visual es el material indicado; el resto solo lo acompaña."},
}
STATUSES = ("empty", "ready", "generated", "placed")

SENTENCE_END = re.compile(r"[.!?…:;]$|[.!?…][\"»”)]?$")
PAUSE_SPLIT = 0.6          # s de silencio entre palabras que cortan frase
TARGET_SEG = 6.0           # s objetivo por tramo en la división automática
MIN_SEG = 2.0
MAX_SEG = 10.0
MAX_CANDIDATES = 5
BUDGET = {"current": 900, "side": 220, "instruction": 600, "material_desc": 220, "neighbor": 120}


def _r(x: float) -> float:
    return round(float(x), 3)


def _clean(text: Any, limit: int) -> str:
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    return t if len(t) <= limit else t[: limit - 1].rstrip() + "…"


# --- Documento ---------------------------------------------------------------------

def _new_id() -> str:
    return "sd_" + uuid.uuid4().hex[:8]


def normalize_segment(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    try:
        s, e = float(raw.get("start")), float(raw.get("end"))
    except (TypeError, ValueError):
        return None
    if e - s < 0.2:
        return None
    mats = []
    for m in raw.get("materials") or []:
        if isinstance(m, dict) and m.get("kind") in ("clips", "images") and m.get("id") is not None:
            mats.append({"kind": m["kind"], "id": str(m["id"]),
                         "scope": "library" if m.get("scope") == "library" else "project"})
    mode = raw.get("mode") if raw.get("mode") in MODES else None
    status = raw.get("status") if raw.get("status") in STATUSES else "empty"
    if status == "empty" and (mode or _clean(raw.get("instruction"), 10)):
        status = "ready"
    sid = str(raw.get("id") or "")
    return {
        "id": sid if re.match(r"^[A-Za-z0-9_-]{3,40}$", sid) else _new_id(),
        "start": _r(max(0.0, s)), "end": _r(e),
        "text": _clean(raw.get("text"), 2000), "text_source": str(raw.get("text_source") or "none")[:30],
        "mode": mode, "instruction": _clean(raw.get("instruction"), 2000),
        "strict": bool(raw.get("strict")), "materials": mats[:8],
        "reference_id": str(raw["reference_id"]) if raw.get("reference_id") else None,
        "status": status, "composition_id": raw.get("composition_id") or None,
        "placed_clip_id": raw.get("placed_clip_id") or None,
        "updated_at": raw.get("updated_at") or time.time(),
    }


def normalize_doc(raw: Any) -> dict[str, Any]:
    segs = []
    for s in ((raw or {}).get("segments") or []) if isinstance(raw, dict) else []:
        n = normalize_segment(s)
        if n and all(x["id"] != n["id"] for x in segs):
            segs.append(n)
    segs.sort(key=lambda x: (x["start"], x["end"]))
    ids = {x["id"] for x in segs}
    for x in segs:   # referencias rotas fuera
        if x["reference_id"] not in ids or x["reference_id"] == x["id"]:
            x["reference_id"] = None
    return {"version": VERSION, "segments": segs}


def load(proj) -> dict[str, Any]:
    return normalize_doc(getattr(proj, "scene_directions", None) or {})


def save(project_id: str, raw: Any) -> dict[str, Any]:
    doc = normalize_doc(raw)
    if not projects.save_scene_directions(project_id, doc):
        raise LookupError("Proyecto no encontrado.")
    return doc


def update_segment(project_id: str, segment_id: str, patch: dict) -> dict[str, Any]:
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    doc = load(proj)
    for i, s in enumerate(doc["segments"]):
        if s["id"] == segment_id:
            doc["segments"][i] = {**s, **patch, "id": segment_id, "updated_at": time.time()}
            return save(project_id, doc)
    raise LookupError("Tramo no encontrado.")


def get_segment(proj, segment_id: str) -> tuple[dict, dict]:
    doc = load(proj)
    seg = next((s for s in doc["segments"] if s["id"] == segment_id), None)
    if seg is None:
        raise LookupError("Tramo no encontrado.")
    return seg, doc


# --- Guion en frases con tiempos ------------------------------------------------------

def _group_words(words: list[tuple[str, float, float]]) -> list[dict]:
    units: list[dict] = []
    cur: list[tuple[str, float, float]] = []
    for w in words:
        if cur and (w[1] - cur[-1][2] > PAUSE_SPLIT):
            units.append(cur)
            cur = []
        cur.append(w)
        if SENTENCE_END.search(w[0].strip()):
            units.append(cur)
            cur = []
    if cur:
        units.append(cur)
    return [{"start": _r(u[0][1]), "end": _r(u[-1][2]), "text": _clean(" ".join(x[0] for x in u), 600)}
            for u in units if u]


def _audio_units(proj, tl) -> list[dict]:
    """Sin tiempos por palabra: frases del texto del audio con tiempos proporcionales."""
    audios = {a.id: a for a in (proj.audios or [])}
    for c in tl.clips:
        if c.kind != "audio":
            continue
        info = audios.get(str(c.asset_id))
        text = (getattr(info, "text", None) or "").strip()
        src_dur = float(c.source_duration or 0.0) or float(getattr(info, "duration", 0.0) or 0.0)
        if not text or src_dur <= 0:
            continue
        c0 = float(c.start or 0.0)
        speed = float(c.speed or 1.0) or 1.0
        inp = float(c.in_point or 0.0)
        out, pos = [], 0
        for m in re.finditer(r"[^.!?…\n]+[.!?…]*", text):
            chunk = m.group(0).strip()
            if not chunk:
                continue
            a0 = m.start() / len(text) * src_dur
            a1 = m.end() / len(text) * src_dur
            t0, t1 = c0 + (a0 - inp) / speed, c0 + (a1 - inp) / speed
            if t1 <= c0 or t0 >= c0 + clip_timeline_duration(c):
                continue
            out.append({"start": _r(max(c0, t0)), "end": _r(t1), "text": _clean(chunk, 600)})
            pos = m.end()
        if out:
            return out
    return []


def script_units(proj) -> tuple[list[dict], str]:
    """Frases del guion con tiempos de timeline y la fuente usada."""
    tl = proj.timeline
    if tl is None:
        return [], "none"
    for source, words in (("captions", sc._caption_words(tl)), ("transcript", sc._material_words(proj, tl))):
        if words:
            return _group_words(words), source
    units = _audio_units(proj, tl)
    return (units, "audio_text_estimate") if units else ([], "none")


def text_in_range(units: list[dict], start: float, end: float) -> str:
    return " ".join(u["text"] for u in units if start - 1e-3 <= (u["start"] + u["end"]) / 2 < end)


def auto_segments(proj, *, keep: list[dict] | None = None) -> list[dict]:
    """Propone tramos agrupando frases (≈TARGET_SEG s). Los tramos existentes que ya
    tienen dirección se conservan y las frases que caen dentro no se reasignan."""
    units, source = script_units(proj)
    keep = [s for s in (keep or []) if s.get("mode") or s.get("instruction") or s.get("composition_id")]
    covered = [(s["start"], s["end"]) for s in keep]

    def is_covered(u: dict) -> bool:
        mid = (u["start"] + u["end"]) / 2
        return any(a - 1e-3 <= mid < b for a, b in covered)

    out: list[dict] = list(keep)
    group: list[dict] = []

    def flush() -> None:
        if not group:
            return
        out.append({"id": _new_id(), "start": group[0]["start"], "end": group[-1]["end"],
                    "text": " ".join(g["text"] for g in group), "text_source": source,
                    "mode": None, "instruction": "", "strict": False, "materials": [],
                    "reference_id": None, "status": "empty"})
        group.clear()

    for u in units:
        if is_covered(u):
            flush()
            continue
        span = u["end"] - (group[0]["start"] if group else u["start"])
        if group and span > MAX_SEG:
            flush()
        group.append(u)
        if group[-1]["end"] - group[0]["start"] >= TARGET_SEG:
            flush()
    flush()

    # Tramos demasiado cortos se unen al anterior si es contiguo y sin dirección.
    out.sort(key=lambda s: s["start"])
    merged: list[dict] = []
    for s in out:
        prev = merged[-1] if merged else None
        if (prev and s["end"] - s["start"] < MIN_SEG and not (s.get("mode") or s.get("instruction"))
                and not (prev.get("mode") or prev.get("instruction")) and s["start"] - prev["end"] < 1.0):
            prev["end"] = s["end"]
            prev["text"] = (prev["text"] + " " + s["text"]).strip()
            continue
        merged.append(s)
    # Sin huecos pequeños: los silencios entre frases pertenecen al tramo anterior (una
    # escena por tramo no deja 0,4 s en negro). El primero empieza en 0 si está cerca.
    if merged and merged[0]["start"] < 1.0 and not merged[0].get("mode"):
        merged[0]["start"] = 0.0
    for a, b in zip(merged, merged[1:]):
        if 0 < b["start"] - a["end"] <= 1.5 and not a.get("composition_id"):
            a["end"] = b["start"]
    return normalize_doc({"segments": merged})["segments"]


# --- Materiales ------------------------------------------------------------------------

def material_catalog(proj) -> list[dict]:
    """Materiales visuales (vídeo e imagen) del proyecto y guardados, con título y descripción."""
    out: list[dict] = []
    for c in proj.clips or []:
        dur = (float(c.out_point) - float(c.in_point)) if (c.in_point is not None and c.out_point is not None) \
            else float(c.end or 0) - float(c.start or 0)
        out.append({"kind": "clips", "id": str(c.index), "scope": "project", "title": c.label or c.filename,
                    "description": c.description or c.description_ai or "", "duration": _r(dur), "url": c.url})
    for im in proj.images or []:
        out.append({"kind": "images", "id": str(im.id), "scope": "project", "title": im.label or im.filename,
                    "description": im.description or "", "duration": None, "url": im.url})
    try:
        from . import library
        lib = library.list_library()
    except Exception:  # noqa: BLE001
        lib = {}
    for c in lib.get("clips") or []:
        out.append({"kind": "clips", "id": str(c["id"]), "scope": "library", "title": c.get("label") or c.get("filename"),
                    "description": c.get("description") or "", "duration": c.get("duration"), "url": c.get("url")})
    for im in lib.get("images") or []:
        out.append({"kind": "images", "id": str(im["id"]), "scope": "library", "title": im.get("label") or im.get("filename"),
                    "description": im.get("description") or "", "duration": None, "url": im.get("url")})
    return out


def _find_material(catalog: list[dict], ref: dict) -> dict | None:
    return next((m for m in catalog if m["kind"] == ref["kind"] and m["id"] == ref["id"]
                 and m["scope"] == ref.get("scope", "project")), None)


def rank_materials(catalog: list[dict], text: str, *, limit: int = MAX_CANDIDATES) -> list[dict]:
    terms = [sc._strip_accents(t.lower()) for t in sc.key_terms(text, limit=10)]
    rows = []
    for i, m in enumerate(catalog):
        blob = sc._strip_accents(f"{m['title']} {m['description']}".lower())
        score = sum(1 for t in terms if t and t in blob)
        rows.append((-score, 0 if m["description"] else 1, i, score, m))
    rows.sort()
    return [{**m, "match": score} for _, _, _, score, m in rows[:limit]]


# --- Paquete de contexto (lo único que ve la IA) ----------------------------------------

def caption_lines(proj, start: float, end: float) -> list[dict]:
    """Líneas de subtítulo DEL TRAMO (tiempos relativos al tramo). Con palabras con tiempo
    solo entran las que caen dentro: una línea que cruza el borde no arrastra texto ajeno."""
    tl = proj.timeline
    if tl is None:
        return []
    out = []
    for c in sorted(tl.clips, key=lambda c: float(c.start or 0.0)):
        if c.kind != "text" or resolve_text_role(c) != "caption":
            continue
        c0 = float(c.start or 0.0)
        c1 = c0 + clip_timeline_duration(c)
        if min(c1, end) - max(c0, start) <= 0.05:
            continue
        if c.words:
            inside = [(w.text, c0 + float(w.start), c0 + float(w.end)) for w in c.words
                      if start - 1e-3 <= c0 + (float(w.start) + float(w.end)) / 2 < end]
            if not inside:
                continue
            out.append({"start": _r(max(0.0, inside[0][1] - start)), "end": _r(min(end, inside[-1][2]) - start),
                        "text": _clean(" ".join(w[0] for w in inside), 200)})
        else:
            out.append({"start": _r(max(c0, start) - start), "end": _r(min(c1, end) - start),
                        "text": _clean(c.text, 200)})
    return out


def range_words(proj, start: float, end: float) -> list[dict]:
    """Palabras con tiempo (subtítulos o transcripción) que caen en el tramo, relativas a él."""
    tl = proj.timeline
    if tl is None:
        return []
    for words in (sc._caption_words(tl), sc._material_words(proj, tl)):
        inside = [{"text": w[0], "start": _r(max(0.0, w[1] - start)), "end": _r(min(end, w[2]) - start)}
                  for w in words if start - 1e-3 <= (w[1] + w[2]) / 2 < end]
        if inside:
            return inside
    return []


def build_pack(proj, segment: dict, doc: dict | None = None) -> dict[str, Any]:
    doc = doc or load(proj)
    start, end = float(segment["start"]), float(segment["end"])
    units, source = script_units(proj)
    current = text_in_range(units, start, end) or segment.get("text") or ""
    before = [u["text"] for u in units if (u["start"] + u["end"]) / 2 < start][-1:]
    after = [u["text"] for u in units if (u["start"] + u["end"]) / 2 >= end][:1]
    lines = caption_lines(proj, start, end)
    words = range_words(proj, start, end)
    catalog = material_catalog(proj)
    chosen = [m for m in (_find_material(catalog, r) for r in segment.get("materials") or []) if m]
    segs = doc["segments"]
    idx = next((i for i, s in enumerate(segs) if s["id"] == segment["id"]), -1)
    ref = next((s for s in segs if s["id"] == segment.get("reference_id")), None)

    def neighbor(s: dict | None) -> dict | None:
        if not s:
            return None
        return {"start": s["start"], "end": s["end"], "mode": s.get("mode"),
                "text": _clean(s.get("text"), BUDGET["neighbor"]),
                "instruction": _clean(s.get("instruction"), BUDGET["neighbor"]),
                "composition_id": s.get("composition_id")}

    fmt = sc.style_context(proj, start, end)
    return {
        "segment_id": segment["id"],
        "range": {"start": _r(start), "end": _r(end), "duration": _r(end - start)},
        "script": {"source": source, "has_captions": bool(lines), "current": _clean(current, BUDGET["current"]),
                   "before": _clean(" ".join(before), BUDGET["side"]), "after": _clean(" ".join(after), BUDGET["side"])},
        "captions": lines,
        "words": words,
        "direction": {"mode": segment.get("mode") or "propose",
                      "instruction": _clean(segment.get("instruction"), BUDGET["instruction"]),
                      "strict": bool(segment.get("strict"))},
        "materials": chosen,
        "candidates": [] if chosen else rank_materials(catalog, current + " " + (segment.get("instruction") or "")),
        "reference": neighbor(ref),
        "previous": neighbor(segs[idx - 1] if idx > 0 else None),
        "next": neighbor(segs[idx + 1] if 0 <= idx < len(segs) - 1 else None),
        "style": fmt,
    }


_SOURCE_TXT = {"captions": "subtítulos", "transcript": "transcripción del material",
               "audio_text_estimate": "texto del audio (tiempos estimados)", "none": "sin guion"}


def pack_text(pack: dict) -> str:
    """Texto compacto y ordenado que recibe la IA (misma información que ve el usuario)."""
    r, s, d = pack["range"], pack["script"], pack["direction"]
    mode = MODES.get(d["mode"], MODES["propose"])
    lines = [f"TRAMO: {r['start']:.2f}s – {r['end']:.2f}s (dura {r['duration']:.2f}s)"]
    if s["current"]:
        lines.append(f"LO QUE DICE LA VOZ ({_SOURCE_TXT.get(s['source'], s['source'])}):\n«{s['current']}»")
    else:
        lines.append("LO QUE DICE LA VOZ: (nadie habla en este tramo; guíate por la dirección)")
    if pack["captions"]:
        lines.append("SUBTÍTULOS DEL TRAMO (segundos desde el inicio del tramo):\n" + "\n".join(
            f"  {c['start']:.1f}–{c['end']:.1f}  {c['text']}" for c in pack["captions"]))
    else:
        lines.append("SUBTÍTULOS DEL TRAMO: ninguno")
    if s["before"]:
        lines.append(f"Frase anterior: «{s['before']}»")
    if s["after"]:
        lines.append(f"Frase siguiente: «{s['after']}»")
    lines.append(f"DIRECCIÓN: {mode['label']} → {mode['ai']}")
    if d["instruction"]:
        lines.append(f"INSTRUCCIÓN DEL DIRECTOR: {d['instruction']}")
    if d["strict"]:
        lines.append("SEGUIR EL GUION ESTRICTAMENTE: lo que se ve acompaña cada frase en orden; no añadas ideas nuevas.")
    if pack["reference"]:
        ref = pack["reference"]
        lines.append(f"TRAMO DE REFERENCIA ({ref['start']:.1f}–{ref['end']:.1f}s): «{ref['text']}»"
                     + (f" · dirección: {ref['instruction']}" if ref["instruction"] else ""))
    if pack["materials"]:
        lines.append("MATERIAL ELEGIDO (los vídeos van como clip real en la timeline; las imágenes pueden ser beats):\n" + "\n".join(
            f"  · [{_mat_kind(m)} {m['id']}] {m['title']}: {_clean(m['description'], BUDGET['material_desc']) or '(sin descripción)'}"
            for m in pack["materials"]))
    elif pack["candidates"]:
        lines.append("MATERIALES QUE PODRÍAN SERVIR (opcional):\n" + "\n".join(
            f"  · [{_mat_kind(m)} {m['id']}] {m['title']}: {_clean(m['description'], BUDGET['material_desc']) or '(sin descripción)'}"
            for m in pack["candidates"]))
    for key, label in (("previous", "Tramo anterior"), ("next", "Tramo siguiente")):
        n = pack[key]
        if n and (n["mode"] or n["instruction"]):
            lines.append(f"{label}: {MODES.get(n['mode'], MODES['propose'])['label']}"
                         + (f" — {n['instruction']}" if n["instruction"] else ""))
    return "\n".join(lines)


def _mat_kind(m: dict) -> str:
    return "vídeo" if m["kind"] == "clips" else "imagen"


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 3.6))


# --- Brief y beats derivados -------------------------------------------------------------

_INTENT_BY_MODE = {"propose": "explicativa", "explain": "explicativa", "represent": "grafica",
                   "reinforce": "narrativa", "material": "cinematografica"}


def brief_defaults(pack: dict) -> dict[str, Any]:
    """Valores iniciales del brief de Generar Escena para este tramo (todo editable)."""
    d = pack["direction"]
    images = [m for m in pack["materials"] if m["kind"] == "images"]
    videos = [m for m in pack["materials"] if m["kind"] == "clips"]
    notes = []
    if d["strict"]:
        notes.append("Sigue el guion estrictamente, frase a frase.")
    if videos:
        # Un clip de vídeo no es un beat de la escena (fase 2): se coloca aparte en la timeline.
        notes.append("Vídeo elegido para este tramo (irá como clip real en la timeline; la escena lo "
                     "acompaña): " + "; ".join(_material_name(m) for m in videos) + ".")
    return {
        "idea": d["instruction"] or pack["script"]["current"][:200],
        "script": pack["script"]["current"],
        "intent": _INTENT_BY_MODE.get(d["mode"], "explicativa"),
        "must_include": [_material_name(m) for m in images][:6],
        "resources": {"image": "required"} if images else {},
        "structure": "script" if (d["strict"] or pack["captions"]) else "free",
        "notes": " ".join(notes),
    }


def _material_name(m: dict) -> str:
    """Nombre útil para la IA: la descripción manda (los títulos suelen ser genéricos)."""
    desc = _clean(m.get("description"), 90)
    return f"{m['title']} — {desc}" if desc and desc.lower() not in (m["title"] or "").lower() else (m["title"] or desc)


def skeleton_beats(pack: dict, *, pace: float) -> list[dict]:
    """Beats deterministas del tramo (tiempos relativos al tramo).

    Con palabras con tiempo: se agrupan cortando en fin de frase (si el grupo dura ≥0,8 s),
    en coma cuando ya se alcanzó el ritmo, o si el grupo se alarga demasiado. Sin palabras
    pero con líneas de subtítulo, agrupa líneas. Sin nada, partes iguales. La IA solo
    tiene que decidir QUÉ se ve en cada beat."""
    dur = float(pack["range"]["duration"])
    items = pack.get("words") or pack.get("captions") or []
    if not items:
        n = max(1, min(6, round(dur / max(0.8, pace))))
        step = dur / n
        return [{"text": "", "start": _r(i * step), "end": _r(dur if i + 1 == n else (i + 1) * step)}
                for i in range(n)]
    groups: list[list[dict]] = []
    cur: list[dict] = []
    for i, it in enumerate(items):
        cur.append(it)
        span = cur[-1]["end"] - cur[0]["start"]
        txt = it["text"].strip()
        last = i + 1 == len(items)
        if last:
            break
        if (SENTENCE_END.search(txt) and span >= 0.8) or (txt.endswith(",") and span >= pace * 0.8) \
                or span >= pace * 1.4:
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    beats = []
    for i, g in enumerate(groups):
        start = 0.0 if i == 0 else g[0]["start"]
        end = dur if i + 1 == len(groups) else groups[i + 1][0]["start"]
        beats.append({"text": " ".join(x["text"] for x in g), "start": _r(start), "end": _r(end)})
    # Ningún beat por debajo de 0,8 s: se funde con el anterior.
    out: list[dict] = []
    for bt in beats:
        if out and (bt["end"] - bt["start"] < 0.8 or out[-1]["end"] - out[-1]["start"] < 0.8):
            out[-1]["end"] = bt["end"]
            out[-1]["text"] = (out[-1]["text"] + " " + bt["text"]).strip()
        else:
            out.append(bt)
    return out


# --- Acciones deterministas (sin IA) ------------------------------------------------------

def _free_video_track(project_id: str, tl, start: float, end: float) -> str:
    from . import timeline_store
    for t in tl.tracks if tl else []:
        if t.kind != "video" or t.locked:
            continue
        busy = any(c.track_id == t.id and min(end, float(c.start or 0) + clip_timeline_duration(c))
                   - max(start, float(c.start or 0)) > 0.01 for c in tl.clips)
        if not busy:
            return t.id
    res = timeline_store.apply_op(project_id, "add_track", {"kind": "video"})
    return res["changed"][0]


def place_material(project_id: str, segment_id: str, ref: dict | None = None) -> dict[str, Any]:
    """Coloca el material del tramo (vídeo o imagen) en la timeline, justo en el tramo.

    Vídeo: desde su inicio y recortado a la duración del tramo (si es más corto, dura lo
    que dura). Imagen: ocupa el tramo entero. Va a una pista de vídeo libre en ese rango
    (o a una nueva). Deshacible con undo."""
    from . import timeline_store
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    seg, _ = get_segment(proj, segment_id)
    ref = ref or next(iter(seg.get("materials") or []), None)
    if not ref:
        raise ValueError("Elige primero un material para este tramo.")
    start, end = float(seg["start"]), float(seg["end"])
    span = end - start
    kind = "video" if ref["kind"] == "clips" else "image"
    if ref.get("scope") == "library":
        from . import library
        lib = library.list_library()
        item = next((x for x in lib.get("clips" if kind == "video" else "images") or [] if str(x["id"]) == ref["id"]), None)
        if item is None:
            raise LookupError("Material guardado no encontrado.")
        has_seg = item.get("in_point") is not None and item.get("out_point") is not None
        off = float(item["in_point"]) if has_seg else 0.0
        src = float(item["out_point"]) - off if has_seg else float(item.get("duration") or span)
        name, filename, asset_id, scope = item.get("label") or item["filename"], item["filename"], str(item["id"]), "library"
    else:
        from .mcp_server.tools_edit import _resolve_asset
        info = _resolve_asset(proj, ref["kind"], ref["id"])
        off = float(info.get("offset") or 0.0)
        src = float(info["source_duration"] or span)
        name, filename, asset_id, scope = info["name"], info["filename"], ref["id"], "project"
    use = span if kind == "image" else min(span, src)
    track_id = _free_video_track(project_id, proj.timeline, start, start + use)
    clip = {"track_id": track_id, "kind": kind, "asset_kind": ref["kind"], "asset_id": asset_id,
            "asset_scope": scope, "filename": filename, "name": name, "start": _r(start),
            "in_point": _r(off), "out_point": _r(off + use),
            "source_duration": _r(off + (use if kind == "image" else src)),
            "layout": "fill", "frame": "full"}
    res = timeline_store.apply_op(project_id, "add_clip", {"clip": clip})
    clip_id = res["changed"][0]
    update_segment(project_id, segment_id, {"status": "placed", "placed_clip_id": clip_id})
    return {"clip_id": clip_id, "track_id": track_id, "start": _r(start), "duration": _r(use),
            "shorter": kind == "video" and src < span - 0.05}


def reuse_scene(project_id: str, segment_id: str) -> dict[str, Any]:
    """"Repetir / reforzar": copia la escena del tramo de referencia a ESTE tramo (borrador),
    reescalando beats y planos a la nueva duración. Sin IA."""
    from .mcp_server.tools_motion import _apply_for_range
    from .motion import scene as scene_mod
    from .motion import service as motion_service
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    seg, doc = get_segment(proj, segment_id)
    ref = next((s for s in doc["segments"] if s["id"] == seg.get("reference_id")), None)
    if not ref or not ref.get("composition_id"):
        raise ValueError("El tramo de referencia no tiene escena generada.")
    src = motion_service.get_composition(project_id, ref["composition_id"])
    if src is None:
        raise LookupError("La escena de referencia ya no existe.")
    new_dur = float(seg["end"]) - float(seg["start"])
    k = new_dur / max(0.1, float(src.duration))
    cid = motion_service.new_id()
    meta = {key: v for key, v in (src.metadata or {}).items() if key not in ("draft", "range", "created_at")}
    if scene_mod.is_scene(src):
        sc_data = dict(meta["scene"])
        brief = {**sc_data["brief"], "duration": new_dur}
        d = scene_mod.resolved_direction(scene_mod.normalize_brief(brief))
        beats = []
        for b in sc_data.get("beats") or []:
            nb = {**b, "start": _r(float(b["start"]) * k), "end": _r(float(b["end"]) * k)}
            if isinstance(b.get("stick"), dict):
                nb["stick"] = scene_mod.prepare_stick(b["stick"], nb, d, scene_mod.normalize_brief(brief))
            beats.append(nb)
        if beats:
            beats[-1]["end"] = _r(new_dur)
        comp = scene_mod.build_composition(cid, {**sc_data, "brief": brief, "beats": beats},
                                           width=src.width, height=src.height, fps=src.fps,
                                           project_id=project_id, name=f"{src.name} (refuerzo)",
                                           metadata={x: y for x, y in meta.items() if x != "scene"})
    else:
        layers = [ly.model_copy(update={"start": _r(ly.start * k), "end": None if ly.end is None else _r(ly.end * k)})
                  for ly in src.layers]
        comp = src.model_copy(update={"id": cid, "name": f"{src.name} (refuerzo)", "layers": layers,
                                      "metadata": meta, "version": 1})
    comp = _apply_for_range(proj, comp, {"start": seg["start"], "end": seg["end"]})
    motion_service.save_composition(project_id, comp, bump=False)
    update_segment(project_id, segment_id, {"status": "generated", "composition_id": cid})
    return {"composition_id": cid, "duration": comp.duration}
