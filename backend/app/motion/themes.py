"""Temas (design tokens) para motion graphics.

Un tema es un conjunto pequeño de tokens (paleta, fuentes, easings, radios,
sombras) que las PLANTILLAS y la generación por IA usan para que todo tenga un
aspecto coherente y profesional, en vez de colores/fuentes sueltos.

Dirección visual: minimalista y moderno tipo Tailwind UI — superficies limpias,
paleta neutra (slate/gris), UN acento sobrio, mucho espacio, tipografía Inter,
sombras suaves y NADA de neón/glow. El tema por defecto es claro.
"""
from __future__ import annotations

# Pilas de fuentes (las familias se cargan por CDN en generator._FONTS_LINK).
# Inter es la fuente de UI moderna por excelencia (la que usa Tailwind UI).
FONT_DISPLAY = "'Inter', system-ui, 'Segoe UI', Arial, sans-serif"
FONT_CONDENSED = "'Oswald', 'Inter', system-ui, sans-serif"
FONT_BODY = "'Inter', system-ui, 'Segoe UI', Arial, sans-serif"

# ease permitidos por el validador (models.EASES): usa solo estos en tweens del modelo.
# Movimiento sutil y elegante: nada de rebotes exagerados ni elástico.
EASE_OUT = "power3.out"
EASE_INOUT = "power2.inOut"
EASE_POP = "power2.out"      # antes back.out (rebote) → ahora un remate limpio

THEMES: dict[str, dict] = {
    # Claro y limpio (por defecto): superficies blancas, texto slate, un acento sobrio.
    "light": {
        "label": "Claro",
        "bg": "#f8fafc", "surface": "#ffffff", "text": "#0f172a",
        "muted": "#64748b", "accent": "#4f46e5", "accent_text": "#ffffff",
        "border": "#e2e8f0", "line": "#94a3b8", "shadow": "0 12px 32px rgba(15,23,42,.10)",
        "font_display": FONT_DISPLAY, "font_body": FONT_BODY, "radius": 16,
    },
    # Oscuro elegante y neutro (slate), sin neón. Para vídeo oscuro o look premium.
    "dark": {
        "label": "Oscuro",
        "bg": "#0f172a", "surface": "#1e293b", "text": "#f8fafc",
        "muted": "#94a3b8", "accent": "#818cf8", "accent_text": "#0f172a",
        "border": "#334155", "line": "#64748b", "shadow": "0 16px 40px rgba(2,6,23,.55)",
        "font_display": FONT_DISPLAY, "font_body": FONT_BODY, "radius": 16,
    },
    # Editorial claro: condensado tipo prensa/documental, acento casi negro.
    "editorial": {
        "label": "Editorial",
        "bg": "#faf9f7", "surface": "#ffffff", "text": "#1c1917",
        "muted": "#78716c", "accent": "#111827", "accent_text": "#ffffff",
        "border": "#e7e5e4", "line": "#a8a29e", "shadow": "0 10px 30px rgba(28,25,23,.10)",
        "font_display": FONT_CONDENSED, "font_body": FONT_BODY, "radius": 6,
    },
}

DEFAULT_THEME = "light"


def list_themes() -> list[dict]:
    return [{"key": k, "label": v.get("label", k.title()),
             "accent": v["accent"], "bg": v["bg"], "surface": v["surface"]}
            for k, v in THEMES.items()]


def _rgb(hex_color: str) -> tuple[int, int, int] | None:
    h = (hex_color or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return None
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def _luminance(rgb: tuple[int, int, int]) -> float:
    def ch(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    """Contraste WCAG entre dos colores #rrggbb (1 = ninguno, 21 = máximo)."""
    ra, rb = _rgb(a), _rgb(b)
    if not ra or not rb:
        return 21.0
    la, lb = sorted((_luminance(ra), _luminance(rb)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _mix(a: str, b: str, t: float) -> str:
    ra, rb = _rgb(a), _rgb(b)
    if not ra or not rb:
        return a
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ra, rb))


def _readable_on(color: str, surface: str, toward: str, minimum: float = 3.0) -> str:
    """``color`` acercado a ``toward`` hasta leerse sobre ``surface``."""
    for step in range(0, 11):
        cand = _mix(color, toward, step / 10)
        if contrast(cand, surface) >= minimum:
            return cand
    return toward


def resolve_theme(name: str | None = None, *, accent: str | None = None) -> dict:
    """Tokens del tema pedido (o el por defecto), con ``accent`` opcional del proyecto.

    El acento del proyecto suele venir del resaltado de los subtítulos (pensado
    para ir sobre vídeo, p.ej. amarillo). Sobre una tarjeta clara no se lee, así
    que se derivan dos tokens: ``accent_ink`` (acento como TEXTO, oscurecido si
    hace falta) y ``accent_text`` (texto SOBRE el acento, claro u oscuro).
    """
    t = dict(THEMES.get((name or "").strip().lower(), THEMES[DEFAULT_THEME]))
    if accent and isinstance(accent, str) and _rgb(accent):
        t["accent"] = accent.strip()
    t["accent_ink"] = _readable_on(t["accent"], t["surface"], t["text"])
    t["accent_text"] = max(("#ffffff", "#0f172a"), key=lambda c: contrast(c, t["accent"]))
    return t
