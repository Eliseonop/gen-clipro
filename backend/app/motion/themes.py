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
        "border": "#e2e8f0", "shadow": "0 12px 32px rgba(15,23,42,.10)",
        "font_display": FONT_DISPLAY, "font_body": FONT_BODY, "radius": 16,
    },
    # Oscuro elegante y neutro (slate), sin neón. Para vídeo oscuro o look premium.
    "dark": {
        "label": "Oscuro",
        "bg": "#0f172a", "surface": "#1e293b", "text": "#f8fafc",
        "muted": "#94a3b8", "accent": "#818cf8", "accent_text": "#0f172a",
        "border": "#334155", "shadow": "0 16px 40px rgba(2,6,23,.55)",
        "font_display": FONT_DISPLAY, "font_body": FONT_BODY, "radius": 16,
    },
    # Editorial claro: condensado tipo prensa/documental, acento casi negro.
    "editorial": {
        "label": "Editorial",
        "bg": "#faf9f7", "surface": "#ffffff", "text": "#1c1917",
        "muted": "#78716c", "accent": "#111827", "accent_text": "#ffffff",
        "border": "#e7e5e4", "shadow": "0 10px 30px rgba(28,25,23,.10)",
        "font_display": FONT_CONDENSED, "font_body": FONT_BODY, "radius": 6,
    },
}

DEFAULT_THEME = "light"


def list_themes() -> list[dict]:
    return [{"key": k, "label": v.get("label", k.title()),
             "accent": v["accent"], "bg": v["bg"], "surface": v["surface"]}
            for k, v in THEMES.items()]


def resolve_theme(name: str | None = None, *, accent: str | None = None) -> dict:
    """Tokens del tema pedido (o el por defecto), con ``accent`` opcional del proyecto."""
    t = dict(THEMES.get((name or "").strip().lower(), THEMES[DEFAULT_THEME]))
    if accent and isinstance(accent, str) and accent.strip().startswith("#"):
        t["accent"] = accent.strip()
    return t
