"""Capa de contexto de "Generar Motion": resume SOLO el tramo pedido de la timeline.

La IA no recibe el proyecto entero. Para un rango ``[start, end]`` (o el cursor +
una duración por defecto) se construye un objeto compacto (~2 KB) con:

- ``scriptContext``: el guion de ese momento (anterior / actual / siguiente) y
  unos términos clave. Fuente por prioridad: subtítulos de la timeline (tiempos
  reales por palabra) → transcripción del material de los vídeos que cubren el
  tramo → texto del audio (posición estimada).
- ``timelineContext``: el clip activo y los elementos que ya ocupan el tramo
  (para no duplicar y saber qué hay en pantalla).
- ``availableAssets``: material del proyecto relevante para ese guion.
- ``style``: formato de salida y estilo de subtítulos (fuente, color, zona que
  no conviene tapar).

Además guarda el "foco" del editor (último rango marcado) para que un cliente
MCP pueda pedir el contexto sin conocer los tiempos.
"""
from __future__ import annotations

import re
import threading
import time
import unicodedata

from ..clip_speed import clip_speed, clip_timeline_duration
from ..text_role import resolve_text_role

DEFAULT_DURATION = 5.0
PAD = 4.0                 # segundos de guion antes/después del tramo
MAX_CURRENT_CHARS = 700
MAX_SIDE_CHARS = 280
MAX_ASSETS = 12
MAX_ELEMENTS = 20
MAX_KEY_TERMS = 6

VISUAL_KINDS = ("video", "image", "shape", "motion")

_STOPWORDS = {
    # es
    "para", "porque", "cuando", "donde", "desde", "hasta", "sobre", "entre", "durante",
    "tiene", "tienen", "puede", "pueden", "estos", "estas", "aquel", "aquella", "otras",
    "otros", "mucho", "muchos", "muchas", "siempre", "nunca", "también", "tambien",
    "ahora", "después", "despues", "antes", "quedó", "quedo", "haber", "haberlo",
    "forma", "manera", "cosas", "hacer", "había", "habia", "sería", "seria", "mismo",
    "misma", "todos", "todas", "nuestra", "nuestro", "vuelve", "acaba", "afirma",
    "pero", "este", "esta", "esto", "cada", "solo", "sólo", "nada", "algo",
    # en
    "about", "their", "there", "which", "would", "could", "should", "these", "those",
    "because", "through", "between",
}


# --- Foco del editor (para MCP) ---------------------------------------------

_focus: dict[str, dict] = {}
_focus_lock = threading.Lock()


def set_focus(project_id: str, *, start: float, end: float | None = None,
              playhead: float | None = None, clip_id: str | None = None) -> dict:
    """Guarda en memoria el último tramo que marcó el usuario en el editor."""
    focus = {
        "start": round(max(0.0, float(start)), 3),
        "end": round(float(end), 3) if end is not None else None,
        "playhead": round(float(playhead), 3) if playhead is not None else None,
        "clip_id": clip_id or None,
        "updated_at": time.time(),
    }
    with _focus_lock:
        _focus[project_id] = focus
    return dict(focus)


def get_focus(project_id: str) -> dict | None:
    with _focus_lock:
        f = _focus.get(project_id)
        return dict(f) if f else None


# --- Utilidades ---------------------------------------------------------------

def _r(x: float) -> float:
    return round(float(x), 3)


def _clip_end(c) -> float:
    return float(c.start or 0.0) + clip_timeline_duration(c)


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def _clip_text(text: str | None, limit: int) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    return t if len(t) <= limit else t[: limit - 1].rstrip() + "…"


def _tail(text: str, limit: int) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    return t if len(t) <= limit else "…" + t[-(limit - 1):].lstrip()


def resolve_range(start: float | None, end: float | None, playhead: float | None,
                  default_duration: float = DEFAULT_DURATION) -> tuple[float, float]:
    """Rango efectivo: [start, end] si viene; si no, cursor → cursor + duración."""
    s = start if start is not None else (playhead if playhead is not None else 0.0)
    s = max(0.0, float(s))
    e = float(end) if end is not None else s + max(0.1, float(default_duration))
    if e <= s:
        e = s + max(0.1, float(default_duration))
    return _r(s), _r(e)


# --- Guion ----------------------------------------------------------------------

def _caption_words(tl) -> list[tuple[str, float, float]]:
    """Palabras de los subtítulos en tiempo ABSOLUTO de timeline."""
    out: list[tuple[str, float, float]] = []
    for c in tl.clips:
        if c.kind != "text" or resolve_text_role(c) != "caption":
            continue
        c0 = float(c.start or 0.0)
        if c.words:
            for w in c.words:
                out.append((w.text, c0 + float(w.start), c0 + float(w.end)))
        elif (c.text or "").strip():
            out.append((c.text.strip(), c0, _clip_end(c)))
    out.sort(key=lambda w: w[1])
    return out


def _material_words(proj, tl) -> list[tuple[str, float, float]]:
    """Palabras de la transcripción del material de los clips de vídeo, mapeadas a timeline."""
    by_index = {str(m.index): m for m in (proj.clips or [])}
    out: list[tuple[str, float, float]] = []
    for c in tl.clips:
        if c.kind != "video":
            continue
        mat = by_index.get(str(c.asset_id))
        tr = getattr(mat, "transcript", None) if mat else None
        if not tr:
            continue
        speed = clip_speed(c)
        inp, outp = float(c.in_point or 0.0), float(c.out_point or 0.0)

        def to_tl(s: float) -> float:
            return float(c.start or 0.0) + (s - inp) / speed

        for seg in tr.segments or []:
            items = [(w.text, w.start, w.end) for w in seg.words] if seg.words else [(seg.text, seg.start, seg.end)]
            for text, s0, s1 in items:
                if s1 <= inp or s0 >= outp:
                    continue
                out.append((text, to_tl(max(s0, inp)), to_tl(min(s1, outp))))
    out.sort(key=lambda w: w[1])
    return out


def _split_words(words, start: float, end: float, pad: float) -> dict:
    prev, cur, nxt = [], [], []
    for text, w0, w1 in words:
        mid = (w0 + w1) / 2
        if start - pad <= mid < start:
            prev.append(text)
        elif start <= mid < end:
            cur.append(text)
        elif end <= mid <= end + pad:
            nxt.append(text)
    return {
        "previous": _tail(" ".join(prev), MAX_SIDE_CHARS),
        "current": _clip_text(" ".join(cur), MAX_CURRENT_CHARS),
        "next": _clip_text(" ".join(nxt), MAX_SIDE_CHARS),
    }


def _audio_text_estimate(proj, tl, start: float, end: float, pad: float) -> dict | None:
    """Sin tiempos por palabra: estima la posición en el texto del audio (TTS)."""
    audios = {a.id: a for a in (proj.audios or [])}
    for c in tl.clips:
        if c.kind != "audio":
            continue
        c0, c1 = float(c.start or 0.0), _clip_end(c)
        if _overlap(start, end, c0, c1) <= 0:
            continue
        info = audios.get(str(c.asset_id))
        text = (getattr(info, "text", None) or getattr(info, "description", None) or c.description or "").strip()
        src_dur = float(c.source_duration or 0.0) or (float(getattr(info, "duration", 0.0) or 0.0))
        if not text or src_dur <= 0:
            continue
        speed = clip_speed(c)

        def char_at(t: float) -> int:
            src = float(c.in_point or 0.0) + (t - c0) * speed
            return max(0, min(len(text), int(round(src / src_dur * len(text)))))

        i0, i1 = char_at(start), char_at(end)
        p0, n1 = char_at(max(c0, start - pad)), char_at(min(c1, end + pad))
        return {
            "previous": _tail(text[p0:i0], MAX_SIDE_CHARS),
            "current": _clip_text(text[i0:i1], MAX_CURRENT_CHARS),
            "next": _clip_text(text[i1:n1], MAX_SIDE_CHARS),
        }
    return None


def _strip_accents(s: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")


def key_terms(text: str, limit: int = MAX_KEY_TERMS) -> list[str]:
    """Términos clave baratos: nombres propios y palabras largas que no son relleno."""
    out: list[str] = []
    seen: set[str] = set()
    tokens = re.findall(r"[\wÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ\-]*", text or "")
    for i, tok in enumerate(tokens):
        low = tok.lower().strip("-")
        norm = _strip_accents(low)
        if norm in seen or low in _STOPWORDS or norm in _STOPWORDS:
            continue
        # Mayúscula a mitad de frase (OpenAI, Navier-Stokes); ≥4 letras evita "Una", "Pero"…
        proper = tok[:1].isupper() and i > 0 and len(tok) >= 4
        if len(low) >= 6 or proper or any(ch.isdigit() for ch in tok):
            seen.add(norm)
            out.append(tok.strip("-"))
        if len(out) >= limit:
            break
    return out


def script_context(proj, start: float, end: float, pad: float = PAD) -> dict:
    tl = proj.timeline
    if tl is None:
        return {"previous": "", "current": "", "next": "", "keyTerms": [], "source": "none"}
    for source, words in (("captions", _caption_words(tl)), ("transcript", _material_words(proj, tl))):
        if not words:
            continue
        parts = _split_words(words, start, end, pad)
        if parts["current"] or parts["previous"] or parts["next"]:
            return {**parts, "keyTerms": key_terms(parts["current"]), "source": source}
    est = _audio_text_estimate(proj, tl, start, end, pad)
    if est:
        return {**est, "keyTerms": key_terms(est["current"]), "source": "audio_text_estimate"}
    return {"previous": "", "current": "", "next": "", "keyTerms": [], "source": "none"}


# --- Timeline -------------------------------------------------------------------

def _material_desc(proj, c) -> str:
    if c.kind in ("video", "image"):
        pool = proj.clips if c.kind == "video" else proj.images
        key = str(c.asset_id)
        for m in pool or []:
            if str(getattr(m, "index", getattr(m, "id", ""))) == key or str(getattr(m, "id", "")) == key:
                return _clip_text(getattr(m, "description", None) or getattr(m, "description_ai", None)
                                  or getattr(m, "label", None) or "", 120)
    return _clip_text(c.description or "", 120)


def _video_track_order(tl) -> dict[str, int]:
    return {t.id: i for i, t in enumerate(t for t in tl.tracks if t.kind == "video")}


def _element(proj, c, track_names: dict[str, str]) -> dict:
    el = {
        "id": c.id, "kind": c.kind, "track": track_names.get(c.track_id, c.track_id),
        "name": _clip_text(c.text if c.kind == "text" else (c.name or c.filename), 60),
        "start": _r(c.start or 0.0), "end": _r(_clip_end(c)),
    }
    if c.kind == "motion" and c.composition_id:
        el["composition_id"] = c.composition_id
    desc = _material_desc(proj, c)
    if desc and desc != el["name"]:
        el["description"] = desc
    # La nota dice qué SIGNIFICA este fragmento en la historia; la descripción solo
    # qué es el archivo. Para la IA la nota vale mucho más, así que va aparte.
    note = _clip_text(getattr(c, "note", None), 200)
    if note:
        el["note"] = note
    return el


def timeline_context(proj, start: float, end: float, playhead: float | None,
                     clip_id: str | None) -> dict:
    tl = proj.timeline
    if tl is None:
        return {"activeClip": None, "existingElements": [], "motionInRange": []}
    hidden = {t.id for t in tl.tracks if t.hidden}
    names = {t.id: t.name for t in tl.tracks}
    order = _video_track_order(tl)

    active = None
    if clip_id:
        active = next((c for c in tl.clips if c.id == clip_id), None)
    if active is None:
        head = playhead if playhead is not None else start
        on_screen = [c for c in tl.clips
                     if c.kind in VISUAL_KINDS and c.track_id not in hidden
                     and float(c.start or 0.0) - 1e-3 <= head < _clip_end(c)]
        on_screen.sort(key=lambda c: order.get(c.track_id, -1))
        active = on_screen[-1] if on_screen else None

    elements = []
    motion = []
    for c in sorted(tl.clips, key=lambda c: float(c.start or 0.0)):
        if c.kind == "audio" or (c.kind == "text" and resolve_text_role(c) == "caption"):
            continue
        c0, c1 = float(c.start or 0.0), _clip_end(c)
        ov = _overlap(start, end, c0, c1)
        if ov <= 0:
            continue
        el = _element(proj, c, names)
        elements.append(el)
        if c.kind == "motion":
            shorter = max(1e-3, min(end - start, c1 - c0))
            motion.append({**el, "overlap": _r(ov / shorter)})
    return {
        "activeClip": _element(proj, active, names) if active is not None else None,
        "existingElements": elements[:MAX_ELEMENTS],
        "motionInRange": motion,
    }


# --- Fotogramas de la fuente (para "Generar Motion" con visión) ----------------

def top_video_source_at(proj, t: float):
    """Clip de vídeo superior visible en el instante ``t`` (tiempo de timeline).

    Devuelve ``(material_clip, source_time)`` para extraer un fotograma de la
    FUENTE (sin overlays ni textos), o ``None`` si no hay vídeo en pantalla.
    """
    tl = proj.timeline
    if tl is None:
        return None
    hidden = {t_.id for t_ in tl.tracks if t_.hidden}
    order = _video_track_order(tl)
    by_index = {str(m.index): m for m in (proj.clips or [])}
    on_screen = [c for c in tl.clips
                 if c.kind == "video" and c.track_id not in hidden
                 and float(c.start or 0.0) - 1e-3 <= t < _clip_end(c)]
    if not on_screen:
        return None
    on_screen.sort(key=lambda c: order.get(c.track_id, -1))
    c = on_screen[-1]
    mat = by_index.get(str(c.asset_id))
    if mat is None:
        return None
    speed = clip_speed(c)
    src_t = float(c.in_point or 0.0) + max(0.0, t - float(c.start or 0.0)) * speed
    return mat, round(src_t, 3)


# --- Assets y estilo ------------------------------------------------------------

def available_assets(proj, terms: list[str]) -> list[dict]:
    norm_terms = [_strip_accents(t.lower()) for t in terms]
    rows: list[tuple[int, int, dict]] = []

    def score(*texts) -> int:
        blob = _strip_accents(" ".join(t or "" for t in texts).lower())
        return sum(1 for t in norm_terms if t and t in blob)

    for i, im in enumerate(proj.images or []):
        label = im.description or im.label or im.filename
        rows.append((score(im.label, im.description), i, {
            "kind": "image", "id": im.id, "label": _clip_text(label, 80),
            "size": [im.width, im.height] if im.width and im.height else None,
        }))
    for i, cl in enumerate(proj.clips or []):
        label = cl.description or cl.description_ai or cl.label or cl.filename
        rows.append((score(cl.label, cl.description, cl.description_ai), 1000 + i, {
            "kind": "video", "id": str(cl.index), "label": _clip_text(label, 80),
        }))
    for i, comp in enumerate(proj.motion_compositions or []):
        if (comp.get("metadata") or {}).get("draft"):
            continue
        rows.append((score(comp.get("name")), 2000 + i, {
            "kind": "motion", "id": comp.get("id"), "label": _clip_text(comp.get("name"), 80),
            "duration": comp.get("duration"),
        }))
    rows.sort(key=lambda r: (-r[0], r[1]))
    # Sin coincidencias con el guion, una muestra corta basta (no gastar tokens).
    limit = MAX_ASSETS if rows and rows[0][0] > 0 else MAX_ASSETS // 2
    out = []
    for s, _, item in rows[:limit]:
        item = {k: v for k, v in item.items() if v is not None}
        if s:
            item["match"] = s
        out.append(item)
    return out


def style_context(proj, start: float, end: float) -> dict:
    tl = proj.timeline
    fmt = {"width": getattr(tl, "width", 720), "height": getattr(tl, "height", 1280),
           "fps": getattr(tl, "fps", 30)} if tl else {"width": 720, "height": 1280, "fps": 30}
    style: dict = {"format": fmt}
    if tl is None:
        return style
    captions = [c for c in tl.clips if c.kind == "text" and resolve_text_role(c) == "caption"]
    if not captions:
        return style
    near = min(captions, key=lambda c: abs(float(c.start or 0.0) - start))
    track = next((t for t in tl.tracks if t.id == near.track_id), None)
    s = {**((track.style if track else None) or {}), **(near.style or {})}
    if s.get("font"):
        style["captionFont"] = s["font"]
    if s.get("color"):
        style["captionColor"] = s["color"]
    if s.get("highlight_color"):
        style["accent"] = s["highlight_color"]
    if isinstance(s.get("y"), (int, float)):
        y = float(s["y"])
        style["captionZoneY"] = _r(y)
        style["avoidY"] = [_r(max(0.0, y - 0.07)), _r(min(1.0, y + 0.07))]
    return style


# --- Punto de entrada -------------------------------------------------------------

def build_segment_context(proj, start: float | None = None, end: float | None = None,
                          playhead: float | None = None, clip_id: str | None = None,
                          *, pad: float = PAD, default_duration: float = DEFAULT_DURATION) -> dict:
    s, e = resolve_range(start, end, playhead, default_duration)
    script = script_context(proj, s, e, pad)
    return {
        "projectId": proj.id,
        "currentTime": _r(playhead if playhead is not None else s),
        "selection": {"start": s, "end": e, "duration": _r(e - s),
                      "explicit": start is not None and end is not None},
        "scriptContext": script,
        "timelineContext": timeline_context(proj, s, e, playhead, clip_id),
        "availableAssets": available_assets(proj, script.get("keyTerms") or []),
        "style": style_context(proj, s, e),
    }
