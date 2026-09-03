"""Palabras clave para Explorar: locales (sin muletillas) o IA si hay API key."""
from __future__ import annotations

import json
import re
import urllib.request

from . import settings

CLASSIC_SUGGESTIONS = [
    "ciencia",
    "películas",
    "cine",
    "épico",
    "futuro",
    "motion",
]

STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "u",
    "que", "qué", "cual", "cuál", "cuales", "cuáles", "como", "cómo", "cuando", "cuándo",
    "donde", "dónde", "porque", "porqué", "por", "para", "con", "sin", "sobre", "entre",
    "hasta", "desde", "hacia", "segun", "según", "durante", "mediante", "contra",
    "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "aquel", "aquella",
    "aqui", "aquí", "alli", "allí", "ahi", "ahí", "muy", "mas", "más", "pero", "si", "sí",
    "no", "ni", "ya", "tan", "tambien", "también", "entonces", "pues", "bueno", "vale",
    "ok", "okay", "hola", "gracias", "favor", "porfavor", "please", "just", "really",
    "esto", "eso", "aquello", "algo", "nada", "todo", "todos", "todas",
    "me", "te", "se", "nos", "os", "le", "les", "lo", "mi", "mis", "tu", "tú", "tus",
    "su", "sus", "yo", "él", "ella", "ellos", "ellas", "usted", "ustedes",
    "ser", "soy", "es", "son", "era", "fue", "estar", "está", "estan", "están", "estoy",
    "haber", "hay", "ha", "han", "he", "hacer", "hace", "hacen", "tener", "tiene", "tienen",
    "poder", "puede", "pueden", "puedo", "decir", "dice", "ir", "va", "van", "voy",
    "ver", "ve", "ves", "veo", "veas", "vea", "vemos", "dar", "da", "saber", "sé", "quiere", "quiero", "quieren",
    "querer", "vamos", "the", "a", "an", "and", "or", "but", "of", "to", "in", "on",
    "for", "with", "at", "from", "by", "is", "are", "was", "were", "be", "been",
    "this", "that", "it", "as", "if", "not", "so", "can", "will", "would", "could",
    "should", "you", "we", "they", "he", "she", "i", "my", "your", "our",
}

_TOKEN = re.compile(r"[a-záéíóúüñ0-9]+", re.I)
_LLM_ORDER = ("gemini", "openai", "openrouter", "anthropic")

_PROMPT = (
    "Extrae entre 6 y 10 palabras clave visuales para buscar fotos, vídeos o GIFs de stock "
    "(Pexels/GIPHY) a partir de este guion o descripción de audio.\n"
    "Deben ser temas concretos (objetos, lugares, épocas, géneros, emociones), no muletillas "
    "como que, por favor, entonces, quiero.\n"
    "Frases cortas de 1 a 3 palabras. Prefiere inglés si el stock se busca mejor así, "
    "salvo nombres propios.\n"
    "Responde SOLO un JSON array de strings. Nada más.\n\n"
    "Texto:\n"
)


def _tokens(text: str) -> list[str]:
    return [m.group(0).lower() for m in _TOKEN.finditer(text or "")]


def extract_keywords(text: str, max_n: int = 8) -> list[str]:
    words = [w for w in _tokens(text) if len(w) >= 3 and w not in STOPWORDS]
    if not words:
        return []
    freq: dict[str, float] = {}

    def bump(key: str, n: float) -> None:
        freq[key] = freq.get(key, 0) + n

    for w in words:
        bump(w, 1)
    for i in range(len(words) - 1):
        bump(f"{words[i]} {words[i + 1]}", 2.2)
    for i in range(len(words) - 2):
        bump(f"{words[i]} {words[i + 1]} {words[i + 2]}", 2.6)

    ranked = sorted(freq.items(), key=lambda kv: (-kv[1], len(kv[0])))
    out: list[str] = []
    for key, _ in ranked:
        if any(key != p and (p.find(key) >= 0 or (key.find(p) >= 0 and p.count(" ") > key.count(" "))) for p in out):
            continue
        out.append(key)
        if len(out) >= max_n:
            break
    return out


def gather_theme_text(proj) -> str:
    parts: list[str] = []

    def push(v) -> None:
        s = str(v or "").strip()
        if s:
            parts.append(s)

    for a in getattr(proj, "audios", None) or []:
        push(getattr(a, "description", None))
        push(getattr(a, "text", None))
    for c in getattr(proj, "clips", None) or []:
        push(getattr(c, "description", None))
        tr = getattr(c, "transcript", None)
        segs = getattr(tr, "segments", None) if tr is not None else None
        for s in segs or []:
            push(getattr(s, "text", None) if not isinstance(s, dict) else s.get("text"))
    for t in getattr(proj, "transcripts", None) or []:
        for s in getattr(t, "segments", None) or []:
            push(getattr(s, "text", None) if not isinstance(s, dict) else s.get("text"))
    tl = getattr(proj, "timeline", None)
    clips = getattr(tl, "clips", None) if tl is not None else None
    for c in clips or []:
        kind = getattr(c, "kind", None) if not isinstance(c, dict) else c.get("kind")
        if kind not in ("audio", "text"):
            continue
        if isinstance(c, dict):
            push(c.get("description"))
            push(c.get("text"))
        else:
            push(getattr(c, "description", None))
            push(getattr(c, "text", None))
    return "\n".join(parts)


def parse_keyword_list(raw: str) -> list[str]:
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.I).strip()
    data = None
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", s, re.S)
        if m:
            try:
                data = json.loads(m.group(0))
            except json.JSONDecodeError:
                data = None
    if not isinstance(data, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in data:
        key = " ".join(str(item).split())[:48].strip()
        low = key.lower()
        if len(key) < 2 or low in seen or low in STOPWORDS:
            continue
        seen.add(low)
        out.append(key)
        if len(out) >= 10:
            break
    return out


def _first_llm() -> tuple[str, str]:
    for name in _LLM_ORDER:
        key = settings.api_key(name)
        if key:
            return name, key
    return "", ""


def _post_json(url: str, payload: dict, headers: dict, timeout: int = 12) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8") or "{}")


def _llm_keywords(text: str) -> list[str]:
    name, key = _first_llm()
    if not name or not key:
        return []
    prompt = _PROMPT + text[:6000]
    try:
        if name == "gemini":
            return _gemini_keywords(key, prompt)
        if name == "openai":
            return _openai_keywords(
                "https://api.openai.com/v1/chat/completions",
                key,
                "gpt-4o-mini",
                prompt,
            )
        if name == "openrouter":
            return _openai_keywords(
                "https://openrouter.ai/api/v1/chat/completions",
                key,
                "openai/gpt-4o-mini",
                prompt,
            )
        if name == "anthropic":
            return _anthropic_keywords(key, prompt)
    except Exception:  # noqa: BLE001
        return []
    return []


def _gemini_keywords(key: str, prompt: str) -> list[str]:
    from google import genai

    from .ai.providers import ai_config

    model = (ai_config().get("model") or "gemini-2.0-flash").strip()
    client = genai.Client(api_key=key)
    try:
        resp = client.models.generate_content(model=model, contents=prompt)
    except Exception:  # noqa: BLE001
        if model == "gemini-2.0-flash":
            raise
        resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
    raw = getattr(resp, "text", None) or ""
    return parse_keyword_list(raw)


def _openai_keywords(url: str, key: str, model: str, prompt: str) -> list[str]:
    data = _post_json(
        url,
        {
            "model": model,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt}],
        },
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    msg = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    return parse_keyword_list(msg)


def _anthropic_keywords(key: str, prompt: str) -> list[str]:
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        {
            "model": "claude-3-5-haiku-latest",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": prompt}],
        },
        {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    bits = []
    for part in data.get("content") or []:
        if isinstance(part, dict) and part.get("type") == "text":
            bits.append(part.get("text") or "")
    return parse_keyword_list("\n".join(bits))


def suggest_keywords(text: str) -> dict:
    blob = (text or "").strip()
    local = extract_keywords(blob) if blob else []
    if blob:
        ai = _llm_keywords(blob)
        if ai:
            return {"keywords": ai, "source": "ai"}
    if local:
        return {"keywords": local, "source": "local"}
    return {"keywords": list(CLASSIC_SUGGESTIONS), "source": "classic"}
