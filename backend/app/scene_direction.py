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
# Presupuesto de complejidad visual del tramo (§3.10): evita que "cada segundo
# parezca que explotó After Effects". La IA lo asigna según el papel del tramo.
COMPLEXITY_LABELS = {1: "simple", 2: "simple + apoyo", 3: "composición",
                     4: "explicación compleja", 5: "clímax visual"}

# Rol visual de un material/componente en la composición (§3.4): un material NO es
# solo "clip a pantalla completa", puede ser overlay, PiP, panel lateral, fondo…
MATERIAL_ROLES = ("full", "broll", "overlay", "pip", "side_panel", "circular",
                  "background", "reference", "motion_element", "transition", "supporting")
# Origen de un componente de la composición HÍBRIDA (§3.5): un tramo puede combinar
# b-roll + motion + stickman, no elegir uno solo. "keep" = mantener el plano (§3.11).
COMPONENT_SOURCES = ("material", "motion", "stickman", "text", "graphic", "keep")

# Dirección visual GLOBAL del proyecto (Fase 5, §5.1): la identidad + reglas que valen
# para TODO el vídeo, para que el montaje sea coherente tramo a tramo y la IA decida con
# criterio antes de bajar a cada tramo. Vocabulario = lenguaje visual sugerido (no cerrado).
BLUEPRINT_VERSION = 1
VOCABULARY = ("movie_footage", "paper_animation", "stickman", "motion_graphic",
              "diagram", "handwritten_word", "generated_image", "text", "chart")

SENTENCE_END = re.compile(r"[.!?…:;]$|[.!?…][\"»”)]?$")
PAUSE_SPLIT = 0.6          # s de silencio entre palabras que cortan frase
TARGET_SEG = 6.0           # s objetivo por tramo en la división automática
MIN_SEG = 2.0
MAX_SEG = 10.0
MAX_CANDIDATES = 5
BUDGET = {"current": 900, "side": 220, "instruction": 600, "material_desc": 220, "neighbor": 120,
          "composition_intent": 700}


def _r(x: float) -> float:
    return round(float(x), 3)


def _clean(text: Any, limit: int) -> str:
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    return t if len(t) <= limit else t[: limit - 1].rstrip() + "…"


def _complexity(v: Any) -> int | None:
    """Presupuesto de complejidad visual 1–5 (§3.10), o None si no se indica/ inválido."""
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 5 else None


# --- Documento ---------------------------------------------------------------------

def _new_id() -> str:
    return "sd_" + uuid.uuid4().hex[:8]


def _material_ref(raw: Any) -> dict | None:
    if isinstance(raw, dict) and raw.get("kind") in ("clips", "images") and raw.get("id") is not None:
        return {"kind": raw["kind"], "id": str(raw["id"]),
                "scope": "library" if raw.get("scope") == "library" else "project"}
    return None


def normalize_component(raw: Any) -> dict | None:
    """Un componente de la composición híbrida del tramo (§3.5): de dónde sale y qué rol
    juega. ``source='material'`` referencia un clip/imagen (con fragmento y layout opcionales);
    'motion'/'stickman'/'text'/'graphic' se generan; 'keep' = mantener el plano."""
    if not isinstance(raw, dict):
        return None
    mat = _material_ref(raw.get("material"))
    src = raw.get("source")
    if src not in COMPONENT_SOURCES:
        src = "material" if mat else None
    if src is None:
        return None
    comp: dict[str, Any] = {"source": src,
                            "role": raw.get("role") if raw.get("role") in MATERIAL_ROLES else None,
                            "note": _clean(raw.get("note"), 200)}
    if src == "material":
        if mat is None:
            return None
        comp["material"] = mat
        rng = raw.get("source_range")
        if isinstance(rng, dict):
            try:
                comp["source_range"] = {"in": _r(max(0.0, float(rng["in"]))), "out": _r(float(rng["out"]))}
            except (KeyError, TypeError, ValueError):
                pass
    return comp


def normalize_components(raw: Any) -> list[dict]:
    out = []
    for c in (raw or []):
        n = normalize_component(c)
        if n:
            out.append(n)
    return out[:8]


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
    comp_intent = _clean(raw.get("composition_intent"), 1000)
    no_visual = bool(raw.get("no_visual"))
    status = raw.get("status") if raw.get("status") in STATUSES else "empty"
    if status == "empty" and (mode or _clean(raw.get("instruction"), 10) or comp_intent or no_visual):
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
        # Plan editorial del tramo (§3.10-3.12, §4.3): intención de composición en lenguaje
        # natural, presupuesto de complejidad visual 1-5, y "no hace falta visual nuevo".
        "composition_intent": comp_intent,
        "complexity": _complexity(raw.get("complexity")),
        "no_visual": no_visual,
        # Composición HÍBRIDA (§3.4-3.5): lista de componentes (material/motion/stickman/…)
        # con su rol. Es el SCENE PLAN; la ejecución (place_material/generar) lo lee.
        "components": normalize_components(raw.get("components")),
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


# --- Dirección visual global (Fase 5, §5.1) ------------------------------------------

def normalize_blueprint(raw: Any) -> dict[str, Any]:
    """Normaliza la dirección visual GLOBAL del proyecto. Solo incluye claves con contenido;
    devuelve ``{}`` si no hay nada útil (así "sin dirección global" es representable). ``direction``
    se valida contra el catálogo de direcciones creativas; el resto es texto/listas acotadas."""
    if not isinstance(raw, dict):
        return {}
    from .motion import directions
    out: dict[str, Any] = {}
    direction = str(raw.get("direction") or "").strip()
    if direction in directions.DIRECTIONS:
        out["direction"] = direction
    ov = raw.get("direction_overrides")
    if isinstance(ov, dict):
        clean_ov: dict[str, Any] = {}
        for k in ("accent", "bg", "surface", "ink", "secondary", "notes"):
            v = ov.get(k)
            if isinstance(v, str) and v.strip():
                clean_ov[k] = v.strip()[:200]
        forb = ov.get("forbidden")
        if isinstance(forb, list):
            items = [_clean(x, 80) for x in forb if str(x or "").strip()][:12]
            if items:
                clean_ov["forbidden"] = items
        if clean_ov:
            out["direction_overrides"] = clean_ov
    identity = _clean(raw.get("identity"), 400)
    if identity:
        out["identity"] = identity
    vocab = raw.get("vocabulary")
    if isinstance(vocab, str):
        vocab = re.split(r"[,;]", vocab)
    if isinstance(vocab, (list, tuple)):
        items = [_clean(x, 40) for x in vocab if str(x or "").strip()]
        if items:
            out["vocabulary"] = items[:12]
    rules = raw.get("rules")
    if isinstance(rules, str):
        rules = [rules]
    if isinstance(rules, (list, tuple)):
        items = [_clean(x, 160) for x in rules if str(x or "").strip()]
        if items:
            out["rules"] = items[:10]
    curve = _clean(raw.get("intensity_curve"), 300)
    if curve:
        out["intensity_curve"] = curve
    if not out:
        return {}
    out["version"] = BLUEPRINT_VERSION
    out["source"] = "ai" if str(raw.get("source")) == "ai" else "manual"
    out["updated_at"] = raw.get("updated_at") or time.time()
    return out


def load_blueprint(proj) -> dict[str, Any]:
    return normalize_blueprint(getattr(proj, "visual_blueprint", None) or {})


def save_blueprint(project_id: str, raw: Any) -> dict[str, Any]:
    bp = normalize_blueprint(raw)
    if not projects.save_visual_blueprint(project_id, bp):
        raise LookupError("Proyecto no encontrado.")
    return bp


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


# Campos del PLAN editorial que rellena la pasada global (§5.2). Solo estos: la pasada
# decide QUÉ y con cuánta intensidad, no compone ni elige material.
_PLAN_ALL_KEYS = ("mode", "composition_intent", "complexity", "no_visual")


def apply_plan_all(project_id: str, patches: Any) -> dict[str, Any]:
    """Aplica un patch editorial por tramo (emparejado por ``id``) a toda la escaleta y guarda de
    una vez (§5.2). Solo toca campos del PLAN (mode/composition_intent/complexity/no_visual); ignora
    ids desconocidos y deja intactos los tramos no mencionados. Devuelve la escaleta + ``changed``."""
    proj = projects.get_project(project_id)
    if proj is None:
        raise LookupError("Proyecto no encontrado.")
    doc = load(proj)
    by_id: dict[str, dict] = {}
    for p in patches or []:
        if isinstance(p, dict) and p.get("id"):
            by_id[str(p["id"])] = p
    changed = 0
    for i, s in enumerate(doc["segments"]):
        p = by_id.get(s["id"])
        if not p:
            continue
        patch = {k: p[k] for k in _PLAN_ALL_KEYS if k in p}
        if patch:
            doc["segments"][i] = {**s, **patch, "updated_at": time.time()}
            changed += 1
    saved = save(project_id, doc)   # normaliza (descarta mode/complexity inválidos)
    return {**saved, "changed": changed}


def get_segment(proj, segment_id: str) -> tuple[dict, dict]:
    doc = load(proj)
    seg = next((s for s in doc["segments"] if s["id"] == segment_id), None)
    if seg is None:
        raise LookupError("Tramo no encontrado.")
    return seg, doc


def timeline_duration(proj) -> float:
    """Duración total de la timeline (fin del último clip). 0 si no hay timeline."""
    tl = getattr(proj, "timeline", None)
    if tl is None:
        return 0.0
    return _r(max((float(c.start or 0) + clip_timeline_duration(c) for c in tl.clips), default=0.0))


def status_summary(proj) -> dict[str, Any]:
    """Mapa del montaje para una IA autónoma: qué tramos hay y cuáles faltan por resolver.

    Es el 'estás aquí' del §2.2 E: por cada tramo su estado
    (empty→ready→generated→placed), su modo y si ya tiene material/escena; más un
    recuento y la lista de los que aún necesitan visual (``pending``)."""
    doc = load(proj)
    segs = doc["segments"]
    counts = {k: 0 for k in STATUSES}
    rows, pending = [], []
    no_visual = 0
    for s in segs:
        counts[s["status"]] = counts.get(s["status"], 0) + 1
        if s.get("no_visual"):
            no_visual += 1
        row = {"id": s["id"], "start": s["start"], "end": s["end"],
               "mode": s["mode"], "status": s["status"],
               "has_materials": bool(s["materials"]), "has_components": bool(s.get("components")),
               "complexity": s.get("complexity"), "no_visual": bool(s.get("no_visual")),
               "composition_id": s["composition_id"], "placed_clip_id": s["placed_clip_id"]}
        rows.append(row)
        # Un tramo marcado "sin visual nuevo" no queda pendiente: ya está decidido.
        if s["status"] in ("empty", "ready") and not s.get("no_visual"):
            pending.append(s["id"])
    return {
        "project_id": proj.id,
        "duration": timeline_duration(proj),
        "script_source": script_units(proj)[1],
        "total": len(segs),
        "counts": {**counts, "total": len(segs), "no_visual": no_visual},
        "pending": pending,
        "segments": rows,
    }


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

# Metadata semántica de un material (§3.3): más allá de título+descripción, para que la
# IA elija por concepto/acción/uso y no solo por coincidencia de palabras. Todo opcional.
_SEMANTIC_LIST_KEYS = ("subjects", "actions")                      # listas cortas
_SEMANTIC_STR_KEYS = ("visual_content", "environment", "mood", "composition", "suggested_usage")
VISUAL_PRIORITIES = ("protagonista", "apoyo", "fondo")            # rol visual sugerido


def normalize_semantic(raw: Any) -> dict:
    """Normaliza la metadata semántica de un material (dict). Descarta claves y valores
    inválidos; devuelve ``{}`` si no hay nada útil (nunca None, para poder limpiarla)."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for k in _SEMANTIC_LIST_KEYS:
        v = raw.get(k)
        if isinstance(v, str):
            v = [p for p in re.split(r"[,;]", v)]
        if isinstance(v, (list, tuple)):
            items = [_clean(x, 60) for x in v if str(x or "").strip()]
            if items:
                out[k] = items[:8]
    for k in _SEMANTIC_STR_KEYS:
        v = _clean(raw.get(k), 200)
        if v:
            out[k] = v
    if raw.get("visual_priority") in VISUAL_PRIORITIES:
        out["visual_priority"] = raw["visual_priority"]
    return out


def semantic_blob(sem: Any) -> str:
    """Texto plano de la metadata semántica, para el ranking y el pack."""
    if not isinstance(sem, dict) or not sem:
        return ""
    parts: list[str] = []
    for k in _SEMANTIC_LIST_KEYS:
        parts += sem.get(k) or []
    for k in _SEMANTIC_STR_KEYS:
        if sem.get(k):
            parts.append(sem[k])
    return " ".join(parts)


def set_material_meta(project_id: str, kind: str, ident: str, meta: Any, *, scope: str = "project") -> dict:
    """Guarda la metadata semántica de un material (clip de vídeo o imagen). Devuelve la
    metadata normalizada. ``scope`` 'project' (por defecto) o 'library'."""
    if kind not in ("clips", "images"):
        raise ValueError("kind debe ser 'clips' o 'images'.")
    semantic = normalize_semantic(meta)
    if scope == "library":
        from . import library
        library.set_semantic(str(ident), semantic)   # LookupError si no existe
        return {"kind": kind, "id": str(ident), "scope": "library", "semantic": semantic}
    item = projects.update_material(project_id, kind, str(ident), {"semantic": semantic})
    if item is None:
        raise LookupError("Material no encontrado.")
    return {"kind": kind, "id": str(ident), "scope": "project", "semantic": item.get("semantic")}


def material_catalog(proj) -> list[dict]:
    """Materiales visuales (vídeo e imagen) del proyecto y guardados, con título, descripción
    y metadata semántica (§3.3) si la tienen."""
    out: list[dict] = []
    for c in proj.clips or []:
        dur = (float(c.out_point) - float(c.in_point)) if (c.in_point is not None and c.out_point is not None) \
            else float(c.end or 0) - float(c.start or 0)
        out.append({"kind": "clips", "id": str(c.index), "scope": "project", "title": c.label or c.filename,
                    "description": c.description or c.description_ai or "", "duration": _r(dur), "url": c.url,
                    "semantic": getattr(c, "semantic", None) or None})
    for im in proj.images or []:
        out.append({"kind": "images", "id": str(im.id), "scope": "project", "title": im.label or im.filename,
                    "description": im.description or im.description_ai or "", "duration": None, "url": im.url,
                    "semantic": getattr(im, "semantic", None) or None})
    try:
        from . import library
        lib = library.list_library()
    except Exception:  # noqa: BLE001
        lib = {}
    for c in lib.get("clips") or []:
        out.append({"kind": "clips", "id": str(c["id"]), "scope": "library", "title": c.get("label") or c.get("filename"),
                    "description": c.get("description") or "", "duration": c.get("duration"), "url": c.get("url"),
                    "semantic": c.get("semantic") or None})
    for im in lib.get("images") or []:
        out.append({"kind": "images", "id": str(im["id"]), "scope": "library", "title": im.get("label") or im.get("filename"),
                    "description": im.get("description") or "", "duration": None, "url": im.get("url"),
                    "semantic": im.get("semantic") or None})
    return out


def _find_material(catalog: list[dict], ref: dict) -> dict | None:
    return next((m for m in catalog if m["kind"] == ref["kind"] and m["id"] == ref["id"]
                 and m["scope"] == ref.get("scope", "project")), None)


def rank_materials(catalog: list[dict], text: str, *, limit: int = MAX_CANDIDATES) -> list[dict]:
    terms = [sc._strip_accents(t.lower()) for t in sc.key_terms(text, limit=10)]
    rows = []
    for i, m in enumerate(catalog):
        blob = sc._strip_accents(f"{m['title']} {m['description']} {semantic_blob(m.get('semantic'))}".lower())
        score = sum(1 for t in terms if t and t in blob)
        # Un material con metadata semántica desempata por encima de uno sin ella.
        rows.append((-score, 0 if (m["description"] or m.get("semantic")) else 1, i, score, m))
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


RECENT_WINDOW = 20.0  # s antes del tramo que cuentan como "usado recientemente"


def material_usage(proj) -> dict[str, list[dict]]:
    """Rangos de timeline donde YA aparece cada material (clip de vídeo o imagen).

    Clave = ``"{kind}:{id}"`` (la misma del catálogo). Base de la reutilización
    inteligente (§3.8): saber si un material ya se usó y hace cuánto, para variarlo
    (otro crop/zoom/duración) o buscar otro en vez de repetir el mismo plano."""
    tl = getattr(proj, "timeline", None)
    if tl is None:
        return {}
    out: dict[str, list[dict]] = {}
    for c in sorted(tl.clips, key=lambda c: float(c.start or 0.0)):
        if c.kind == "video" and c.asset_kind == "clips":
            key = f"clips:{c.asset_id}"
        elif c.kind == "image" and c.asset_kind == "images":
            key = f"images:{c.asset_id}"
        else:
            continue
        c0 = float(c.start or 0.0)
        out.setdefault(key, []).append({"start": _r(c0), "end": _r(c0 + clip_timeline_duration(c))})
    return out


def _annotate_usage(materials: list[dict], usage: dict[str, list[dict]]) -> list[dict]:
    """Añade ``used`` (rangos de timeline) a cada material que ya esté colocado."""
    out = []
    for m in materials:
        u = usage.get(f"{m['kind']}:{m['id']}")
        out.append({**m, "used": u} if u else m)
    return out


def recent_materials(catalog: list[dict], usage: dict[str, list[dict]], start: float) -> list[dict]:
    """Materiales usados poco ANTES del tramo (para no repetir el mismo plano seguido)."""
    by_key = {f"{m['kind']}:{m['id']}": m for m in catalog}
    out = []
    for key, ranges in usage.items():
        last = max((r["end"] for r in ranges if r["end"] <= start + 1e-3), default=None)
        if last is None or start - last > RECENT_WINDOW:
            continue
        kind, _, ident = key.partition(":")
        out.append({"kind": kind, "id": ident, "ago": _r(start - last),
                    "title": (by_key.get(key) or {}).get("title") or ident})
    out.sort(key=lambda x: x["ago"])
    return out[:5]


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
    usage = material_usage(proj)
    occ = sc.timeline_context(proj, start, end, None, None)
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

    def enrich_component(c: dict) -> dict:
        out = {"source": c["source"], "role": c.get("role"), "note": c.get("note")}
        if c.get("material"):
            out["material"] = c["material"]
            m = _find_material(catalog, c["material"])
            if m:
                out["title"] = m["title"]
                out["description"] = _clean(m["description"], 90)
        if c.get("source_range"):
            out["source_range"] = c["source_range"]
        return out

    fmt = sc.style_context(proj, start, end)
    return {
        "segment_id": segment["id"],
        "blueprint": load_blueprint(proj),
        "range": {"start": _r(start), "end": _r(end), "duration": _r(end - start)},
        "script": {"source": source, "has_captions": bool(lines), "current": _clean(current, BUDGET["current"]),
                   "before": _clean(" ".join(before), BUDGET["side"]), "after": _clean(" ".join(after), BUDGET["side"])},
        "captions": lines,
        "words": words,
        "direction": {"mode": segment.get("mode") or "propose",
                      "instruction": _clean(segment.get("instruction"), BUDGET["instruction"]),
                      "strict": bool(segment.get("strict")),
                      "composition_intent": _clean(segment.get("composition_intent"), BUDGET["composition_intent"]),
                      "complexity": _complexity(segment.get("complexity")),
                      "no_visual": bool(segment.get("no_visual"))},
        "materials": _annotate_usage(chosen, usage),
        "candidates": [] if chosen else _annotate_usage(
            rank_materials(catalog, current + " " + (segment.get("instruction") or "")), usage),
        "reference": neighbor(ref),
        "previous": neighbor(segs[idx - 1] if idx > 0 else None),
        "next": neighbor(segs[idx + 1] if 0 <= idx < len(segs) - 1 else None),
        "timeline": {"existing": occ["existingElements"], "motion_in_range": occ["motionInRange"]},
        "recent_materials": recent_materials(catalog, usage, start),
        "components": [enrich_component(c) for c in segment.get("components") or []],
        "style": fmt,
    }


_SOURCE_TXT = {"captions": "subtítulos", "transcript": "transcripción del material",
               "audio_text_estimate": "texto del audio (tiempos estimados)", "none": "sin guion"}


def _safe_area_lines(style: dict | None) -> list[str]:
    """Lienzo + zona protegida de subtítulos, para que la IA NO tape lo esencial.

    ``style`` viene de ``segment_context.style_context``: siempre trae ``format``
    y, si hay subtítulos en el tramo, ``avoidY=[y0,y1]`` (banda a evitar, en
    fracción del alto: 0=arriba, 1=abajo). Antes esto se calculaba pero NO se
    imprimía → la IA recibía la safe-area en el JSON pero no la veía en el prompt.
    """
    if not isinstance(style, dict):
        return []
    fmt = style.get("format") or {}
    w, h = fmt.get("width"), fmt.get("height")
    out: list[str] = []
    if w and h:
        out.append(f"LIENZO: {int(w)}x{int(h)} (vertical 9:16; coordenadas en fracción 0–1, 0=arriba/izq)")
    avoid = style.get("avoidY")
    if isinstance(avoid, (list, tuple)) and len(avoid) == 2:
        out.append(
            f"ZONA DE SUBTÍTULOS (déjala libre de texto/gráficos/caras/sujeto principal/stickman): "
            f"y {float(avoid[0]):.2f}–{float(avoid[1]):.2f}. "
            "Compón el contenido esencial FUERA de esa banda; si algo importante cae dentro, "
            "reubícalo, redúcelo o recórtalo."
        )
    return out


def _blueprint_lines(bp: dict | None) -> list[str]:
    """Dirección visual GLOBAL del proyecto (Fase 5, §5.1): identidad, vocabulario permitido y
    reglas duras que valen para TODO el vídeo. Es lo que da coherencia al montaje (que el tramo
    3 y el 7 no tengan estilos distintos) y criterio a la IA antes de decidir este tramo."""
    if not isinstance(bp, dict) or not bp:
        return []
    from .motion import directions
    rows = ["DIRECCIÓN GLOBAL (vale para todo el vídeo; manténla coherente en este tramo):"]
    if bp.get("direction"):
        d = directions.get(bp["direction"])
        rows.append(f"  dirección creativa: {d.get('label') or bp['direction']}")
    if bp.get("identity"):
        rows.append(f"  identidad: {bp['identity']}")
    if bp.get("vocabulary"):
        rows.append("  vocabulario permitido: " + " · ".join(bp["vocabulary"]))
    if bp.get("rules"):
        rows.append("  reglas: " + " · ".join(bp["rules"]))
    if bp.get("intensity_curve"):
        rows.append(f"  curva de intensidad del vídeo: {bp['intensity_curve']}")
    return ["\n".join(rows)]


def _occupancy_lines(pack: dict) -> list[str]:
    """Qué ocupa YA la timeline en este tramo (§3.9): para no duplicar ni saturar."""
    existing = ((pack.get("timeline") or {}).get("existing")) or []
    if not existing:
        return ["YA EN LA TIMELINE EN ESTE TRAMO: nada (lienzo libre)"]
    rows = "\n".join(
        f"  · {e['kind']} «{e.get('name') or ''}» {e['start']:.1f}–{e['end']:.1f}s"
        + (f" · {e['description']}" if e.get("description") else "")
        for e in existing[:6])
    return ["YA EN LA TIMELINE EN ESTE TRAMO (compón encima o deja hueco; no lo dupliques):\n" + rows]


def _used_note(m: dict) -> str:
    """Anota si un material ya está colocado en la timeline (para variarlo o evitarlo)."""
    u = m.get("used")
    if not u:
        return ""
    spans = ", ".join(f"{r['start']:.1f}–{r['end']:.1f}s" for r in u[:3])
    return f"  [YA USADO en {spans}]"


def _component_lines(components: Any) -> list[str]:
    """Composición híbrida planificada del tramo (§3.4-3.5): componentes con su rol."""
    if not components:
        return []
    rows = []
    for c in components:
        if c.get("source") == "material":
            what = f"material [{c.get('title') or (c.get('material') or {}).get('id')}]"
            rng = c.get("source_range")
            if rng:
                what += f" (origen {rng['in']:.1f}–{rng['out']:.1f}s)"
        else:
            what = c["source"]
        role = f" · rol: {c['role']}" if c.get("role") else ""
        note = f" — {c['note']}" if c.get("note") else ""
        rows.append(f"  · {what}{role}{note}")
    return ["COMPOSICIÓN PLANIFICADA (combina lo que haga falta; cada componente con su rol):\n" + "\n".join(rows)]


def _sem_note(m: dict) -> str:
    """Pista semántica compacta de un material (uso sugerido, rol, sujetos/acción)."""
    sem = m.get("semantic")
    if not isinstance(sem, dict) or not sem:
        return ""
    bits = []
    if sem.get("suggested_usage"):
        bits.append(f"uso: {sem['suggested_usage']}")
    if sem.get("visual_priority"):
        bits.append(sem["visual_priority"])
    tags = (sem.get("subjects") or []) + (sem.get("actions") or [])
    if tags:
        bits.append(", ".join(tags[:4]))
    return f"  ({' · '.join(bits)})" if bits else ""


def pack_text(pack: dict) -> str:
    """Texto compacto y ordenado que recibe la IA (misma información que ve el usuario)."""
    r, s, d = pack["range"], pack["script"], pack["direction"]
    mode = MODES.get(d["mode"], MODES["propose"])
    lines = [f"TRAMO: {r['start']:.2f}s – {r['end']:.2f}s (dura {r['duration']:.2f}s)"]
    lines += _blueprint_lines(pack.get("blueprint"))
    lines += _safe_area_lines(pack.get("style"))
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
    lines += _occupancy_lines(pack)
    lines.append(f"DIRECCIÓN: {mode['label']} → {mode['ai']}")
    if d["instruction"]:
        lines.append(f"INSTRUCCIÓN DEL DIRECTOR: {d['instruction']}")
    if d.get("composition_intent"):
        lines.append(f"INTENCIÓN DE COMPOSICIÓN: {d['composition_intent']}")
    if d.get("complexity"):
        lvl = d["complexity"]
        lines.append(f"COMPLEJIDAD OBJETIVO: {lvl}/5 ({COMPLEXITY_LABELS.get(lvl, '')}); "
                     "no te pases de este presupuesto visual.")
    if d.get("no_visual"):
        lines.append("SIN VISUAL NUEVO: este tramo no necesita nada extra; basta mantener el plano "
                     "(pequeño zoom/transición) y los subtítulos. NO añadas elementos.")
    lines += _component_lines(pack.get("components"))
    if d["strict"]:
        lines.append("SEGUIR EL GUION ESTRICTAMENTE: lo que se ve acompaña cada frase en orden; no añadas ideas nuevas.")
    if pack["reference"]:
        ref = pack["reference"]
        lines.append(f"TRAMO DE REFERENCIA ({ref['start']:.1f}–{ref['end']:.1f}s): «{ref['text']}»"
                     + (f" · dirección: {ref['instruction']}" if ref["instruction"] else ""))
    if pack["materials"]:
        lines.append("MATERIAL ELEGIDO (los vídeos van como clip real en la timeline; las imágenes pueden ser beats):\n" + "\n".join(
            f"  · [{_mat_kind(m)} {m['id']}] {m['title']}: {_clean(m['description'], BUDGET['material_desc']) or '(sin descripción)'}{_sem_note(m)}{_used_note(m)}"
            for m in pack["materials"]))
    elif pack["candidates"]:
        lines.append("MATERIALES QUE PODRÍAN SERVIR (opcional):\n" + "\n".join(
            f"  · [{_mat_kind(m)} {m['id']}] {m['title']}: {_clean(m['description'], BUDGET['material_desc']) or '(sin descripción)'}{_sem_note(m)}{_used_note(m)}"
            for m in pack["candidates"]))
    recent = pack.get("recent_materials") or []
    if recent:
        lines.append("USADO HACE POCO (evita repetir el mismo plano seguido; varía crop/zoom/duración o usa otro): "
                     + "; ".join(f"{r['title']} (hace {r['ago']:.1f}s)" for r in recent[:4]))
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


# Roles que ocupan un área completa (sin transform): se colocan en modo "fill".
_FILL_ROLES = {"full", "broll", "background", "reference", "supporting", "motion_element", "transition"}
# Anclas de posición (centro, en fracción del lienzo de salida) para roles overlay.
# Todas por encima de la franja de subtítulos (~0.79) para no taparlos.
_POS_ANCHORS = {"center": (0.5, 0.45), "top": (0.5, 0.28), "top_left": (0.30, 0.28), "top_right": (0.70, 0.28),
                "left": (0.27, 0.45), "right": (0.73, 0.45),
                "bottom": (0.5, 0.60), "bottom_left": (0.30, 0.60), "bottom_right": (0.70, 0.60)}
_ROLE_DEFAULT_POS = {"side_panel": "right"}
_ROLE_DEFAULT_SIZE = {"side_panel": 0.5}


def _source_fragment(source: Any) -> tuple[float, float] | None:
    """(inicio, duración) del fragmento del material, o None. Ver §3.7."""
    if not isinstance(source, dict):
        return None
    try:
        i, o = float(source["in"]), float(source["out"])
    except (KeyError, TypeError, ValueError):
        return None
    return (max(0.0, i), o - i) if o - i > 0.05 else None


def _role_placement(role: str, size: Any, pos: Any, out_w: float, src_w: float | None) -> dict:
    """layout/frame/transform de un material según su ROL (§3.4). Los roles overlay se
    escalan a ``size`` (fracción del ancho de salida); la escala es px-fuente→px-salida, así
    que para vídeo (sin dimensiones guardadas) se asume fuente≈salida (exacto para clips ya
    a resolución de salida; el editor lo afina si no)."""
    if role not in MATERIAL_ROLES or role in _FILL_ROLES:
        return {"layout": "fill", "frame": "full"}
    f = min(0.95, max(0.1, float(size))) if size else _ROLE_DEFAULT_SIZE.get(role, 0.4)
    ax, ay = _POS_ANCHORS.get(pos or _ROLE_DEFAULT_POS.get(role, "bottom_right"), _POS_ANCHORS["bottom_right"])
    sw = float(src_w) if src_w else float(out_w)
    scale = round(f * float(out_w) / (sw or float(out_w)), 4)
    return {"layout": "overlay", "frame": "free",
            "reframe": {"crop_w": 1.0, "crop_h": 1.0, "zoom": 1.0},
            "transform": {"x": ax, "y": ay, "scale": scale, "rotation": 0.0}}


def place_material(project_id: str, segment_id: str, ref: dict | None = None, *, role: str = "full",
                   source: dict | None = None, size: float | None = None, pos: str | None = None,
                   opacity: float | None = None, transform: dict | None = None) -> dict[str, Any]:
    """Coloca el material del tramo (vídeo o imagen) en la timeline, justo en el tramo.

    Por defecto a pantalla completa. ``role`` (§3.4) lo coloca como overlay/pip/side_panel/
    background… ``source={in,out}`` elige el fragmento del material (§3.7); ``size`` (fracción
    del ancho, roles overlay), ``pos`` (ancla), ``opacity`` y ``transform`` explícito lo
    afinan. Va a una pista de vídeo libre en ese rango (o a una nueva). Deshacible con undo."""
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
    src_w = None
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
        src_w = item.get("width")
    else:
        from .mcp_server.tools_edit import _resolve_asset
        info = _resolve_asset(proj, ref["kind"], ref["id"])
        off = float(info.get("offset") or 0.0)
        src = float(info["source_duration"] or span)
        name, filename, asset_id, scope = info["name"], info["filename"], ref["id"], "project"
        if kind == "image":
            im = next((x for x in (proj.images or []) if str(x.id) == ref["id"]), None)
            src_w = getattr(im, "width", None)
    # Fragmento de origen (§3.7): por defecto desde el inicio.
    base_off, base_src = off, src
    frag = _source_fragment(source)
    if kind == "video" and frag:
        off = base_off + frag[0]
        src = max(0.1, min(base_src - frag[0], frag[1]))
    use = span if kind == "image" else max(0.1, min(span, src))
    track_id = _free_video_track(project_id, proj.timeline, start, start + use)
    out_w = int(getattr(proj.timeline, "width", 720) or 720)
    clip = {"track_id": track_id, "kind": kind, "asset_kind": ref["kind"], "asset_id": asset_id,
            "asset_scope": scope, "filename": filename, "name": name, "start": _r(start),
            "in_point": _r(off), "out_point": _r(off + use),
            "source_duration": _r(base_off + base_src) if kind == "video" else _r(off + use)}
    clip.update(_role_placement(role, size, pos, out_w, src_w))
    if transform:                       # override explícito de la IA
        t = {**clip.get("transform", {"x": 0.5, "y": 0.5, "scale": 1.0, "rotation": 0.0}), **transform}
        clip.update({"layout": "overlay", "frame": "free", "transform": t})
    if opacity is not None:
        clip["opacity"] = min(1.0, max(0.0, float(opacity)))
    res = timeline_store.apply_op(project_id, "add_clip", {"clip": clip})
    clip_id = res["changed"][0]
    update_segment(project_id, segment_id, {"status": "placed", "placed_clip_id": clip_id})
    return {"clip_id": clip_id, "track_id": track_id, "start": _r(start), "duration": _r(use),
            "role": role, "layout": clip["layout"],
            "shorter": kind == "video" and src < span - 0.05}


# --- Validación de composición (§3.14) ---------------------------------------------------
# Colisiones y encuadre a partir de la GEOMETRÍA (sin render): rectángulo de salida de cada
# elemento visual. Para overlays de vídeo se asume fuente≈salida (como en place_material);
# exacto para clips verticales/place_material e imágenes; aproximado para clips a mano.
_FRAME_SLOTS = {"full": (0.5, 0.5, 1.0, 1.0), "top": (0.5, 0.25, 1.0, 0.5),
                "bottom": (0.5, 0.75, 1.0, 0.5), "left": (0.25, 0.5, 0.5, 1.0),
                "right": (0.75, 0.5, 0.5, 1.0)}


def _clip_output_rect(clip) -> tuple[float, float, float, float]:
    """(cx, cy, w, h) del clip en el lienzo de salida (fracción 0–1)."""
    if getattr(clip, "layout", None) == "overlay":
        t = getattr(clip, "transform", None) or {}
        try:
            s = abs(float(t.get("scale", 1.0) or 1.0))
        except (TypeError, ValueError):
            s = 1.0
        cx = float(t.get("x", 0.5) or 0.5)
        cy = float(t.get("y", 0.5) or 0.5)
        wh = min(2.0, max(0.02, s))
        return (cx, cy, wh, wh)
    return _FRAME_SLOTS.get(getattr(clip, "frame", "full") or "full", _FRAME_SLOTS["full"])


def _band_overlap(rect, band) -> float:
    r0, r1 = rect[1] - rect[3] / 2, rect[1] + rect[3] / 2
    return max(0.0, min(r1, float(band[1])) - max(r0, float(band[0])))


def _rect_overlap_frac(a, b) -> float:
    def iv(c, s):
        return (c - s / 2, c + s / 2)
    ax0, ax1 = iv(a[0], a[2]); ay0, ay1 = iv(a[1], a[3])
    bx0, bx1 = iv(b[0], b[2]); by0, by1 = iv(b[1], b[3])
    inter = max(0.0, min(ax1, bx1) - max(ax0, bx0)) * max(0.0, min(ay1, by1) - max(ay0, by0))
    return inter / (min(a[2] * a[3], b[2] * b[3]) or 1e-6)


def validate_segment(proj, start: float, end: float) -> dict[str, Any]:
    """Comprueba la composición de un tramo (§3.14): colisión con la zona de subtítulos,
    elementos fuera de pantalla, solapes fuertes entre overlays y lienzo vacío. No renderiza:
    razona sobre la geometría de salida. Devuelve issues con sugerencias accionables."""
    tl = getattr(proj, "timeline", None)
    avoid = sc.style_context(proj, start, end).get("avoidY")
    els, issues = [], []
    for c in (tl.clips if tl else []):
        if c.kind not in ("video", "image"):
            continue
        c0 = float(c.start or 0.0)
        if min(c0 + clip_timeline_duration(c), end) - max(c0, start) <= 0.05:
            continue
        rect = _clip_output_rect(c)
        els.append({"id": c.id, "name": c.name or c.filename, "kind": c.kind,
                    "layout": getattr(c, "layout", "fill") or "fill",
                    "rect": {"cx": _r(rect[0]), "cy": _r(rect[1]), "w": _r(rect[2]), "h": _r(rect[3])},
                    "_r": rect})
    overlays = [e for e in els if e["layout"] == "overlay"]
    for e in els:
        cx, cy = e["_r"][0], e["_r"][1]
        if not (-0.02 <= cx <= 1.02 and -0.02 <= cy <= 1.02):
            issues.append({"type": "offscreen", "severity": "error", "element": e["id"],
                           "detail": f"«{e['name']}» está centrado en ({cx:.2f},{cy:.2f}), fuera del lienzo.",
                           "suggestion": "Recolócalo dentro de 0–1 (scene_place_material pos/transform)."})
    if avoid:
        for e in overlays:
            if _band_overlap(e["_r"], avoid) > 0.02:
                issues.append({"type": "subtitle_collision", "severity": "warning", "element": e["id"],
                               "detail": f"«{e['name']}» invade la zona de subtítulos "
                                         f"y {float(avoid[0]):.2f}–{float(avoid[1]):.2f}.",
                               "suggestion": "Súbelo (pos='top_*'/'center'), redúcelo (size menor) o recórtalo."})
    for i in range(len(overlays)):
        for j in range(i + 1, len(overlays)):
            if _rect_overlap_frac(overlays[i]["_r"], overlays[j]["_r"]) > 0.5:
                issues.append({"type": "overlap", "severity": "warning", "element": overlays[i]["id"],
                               "other": overlays[j]["id"],
                               "detail": f"«{overlays[i]['name']}» y «{overlays[j]['name']}» se solapan mucho.",
                               "suggestion": "Sepáralos (pos distinto) o reduce el tamaño de uno."})
    if not els:
        issues.append({"type": "empty", "severity": "info", "element": None,
                       "detail": "No hay vídeo ni imagen en este tramo (lienzo vacío).",
                       "suggestion": "Coloca un material o genera una escena; o marca no_visual si es a propósito."})
    for e in els:
        e.pop("_r", None)
    return {"range": {"start": _r(start), "end": _r(end)}, "safe_area": avoid,
            "elements": els, "issues": issues,
            "ok": not any(i["severity"] != "info" for i in issues)}


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
