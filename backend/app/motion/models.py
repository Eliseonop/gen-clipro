"""Modelo de composición de Motion Studio.

Una ``MotionComposition`` es la fuente de verdad editable de un motion graphic:
IA y editor visual modifican el MISMO JSON. NO es un vídeo cerrado. Se compila a
HTML/CSS/GSAP (ver ``generator.py``) tanto para el preview en navegador como para
el render determinista (ver ``renderer/``), garantizando paridad.

El modelo es extensible: el MVP soporta ``type="text"`` y animaciones
fade/slide/scale/rotate; imágenes, formas, svg, vídeo y lottie llegan después sin
romper el esquema.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

# Tipos de capa soportados. text + shape (círculo/línea) permiten nodos y
# conexiones (p.ej. redes neuronales). image/svg/video/lottie: extensión futura.
LAYER_TYPES = ("text", "image", "shape", "svg", "video", "lottie")
MVP_LAYER_TYPES = ("text", "shape")

# Figuras vectoriales de una capa shape.
SHAPE_KINDS = ("circle", "line", "rect")

# Animaciones declarativas soportadas por el generador.
# "draw" revela una línea/borde progresivamente (de origen a destino).
ENTRANCE_TYPES = ("none", "fade", "slide", "scale", "zoom", "rotate", "draw")
EXIT_TYPES = ("none", "fade", "slide", "scale", "zoom", "rotate", "draw")
SLIDE_DIRECTIONS = ("left", "right", "up", "down")

# Efectos CONTINUOS que corren durante la vida de la capa (loop). Ideales para
# nodos que laten (pulse), conexiones con puntos de luz viajando (flow) o glow.
EFFECT_TYPES = ("none", "pulse", "flow", "glow")

# Eases GSAP permitidos (lista blanca; el validador rechaza otros para evitar
# inyección de código en el generador).
EASES = (
    "none", "power1.in", "power1.out", "power1.inOut",
    "power2.in", "power2.out", "power2.inOut",
    "power3.in", "power3.out", "power3.inOut",
    "power4.in", "power4.out", "power4.inOut",
    "back.in", "back.out", "back.inOut",
    "elastic.in", "elastic.out", "elastic.inOut",
    "bounce.in", "bounce.out", "bounce.inOut",
    "sine.in", "sine.out", "sine.inOut", "expo.out", "circ.out",
)


class MotionTween(BaseModel):
    """Un tramo de animación (entrada o salida) de una capa."""
    type: str = "none"                      # fade | slide | scale | zoom | rotate | none
    direction: str = "right"                # solo slide: left|right|up|down
    duration: float = 0.6                   # segundos
    delay: float = 0.0                      # retardo desde start (entrada) o antes de end (salida)
    ease: str = "power3.out"
    # Amplitud opcional por tipo (px para slide si no se infiere; grados para rotate).
    distance: Optional[float] = None
    degrees: Optional[float] = None
    from_scale: Optional[float] = None      # scale/zoom: escala inicial (entrada) o final (salida)


class MotionAnimation(BaseModel):
    entrance: Optional[MotionTween] = None
    exit: Optional[MotionTween] = None


class MotionEffect(BaseModel):
    """Efecto continuo (loop) durante la vida de la capa."""
    type: str = "none"          # pulse | flow | glow | none
    duration: float = 1.0       # periodo del ciclo (s)
    delay: float = 0.0          # desfase inicial (para escalonar nodos/conexiones)
    amount: Optional[float] = None   # intensidad (pulse: +escala; glow: opacidad mín)


class MotionShape(BaseModel):
    """Figura vectorial. circle/rect se dibujan en (x,y) con size; line va de
    (x,y) a (x2,y2). ``glow`` añade halo luminoso (motion graphics tecnológico)."""
    kind: str = "circle"                 # circle | line | rect
    radius: float = 40.0                 # circle: radio (px)
    width: Optional[float] = None        # rect: ancho
    height: Optional[float] = None       # rect: alto
    x2: Optional[float] = None           # line: punto final
    y2: Optional[float] = None
    thickness: float = 3.0               # line/rect: grosor de línea/borde
    fill: str = "#39d0ff"                # relleno (circle/rect); "none" = sin relleno
    stroke: str = "none"                 # borde/color de línea
    glow: float = 0.0                    # 0 = sin glow; >0 = radio del halo (px)


class MotionLayer(BaseModel):
    """Un elemento de la composición, posicionado en el lienzo de salida.

    ``x``/``y`` son el CENTRO de la capa en píxeles del lienzo (anchor central),
    consistente con el resto del editor. ``start``/``end`` acotan su visibilidad en
    la línea de tiempo local de la composición (segundos).
    """
    id: str
    type: str = "text"
    content: str = ""                       # texto (type=text) / ruta o url (image/video)
    x: float = 0.0
    y: float = 0.0
    width: Optional[float] = None
    height: Optional[float] = None
    scale: float = 1.0
    rotation: float = 0.0                   # grados
    opacity: float = 1.0
    anchor: str = "center"                  # reservado; MVP centra siempre
    z_index: int = 0
    start: float = 0.0
    end: Optional[float] = None             # None = hasta el final de la composición
    visible: bool = True
    style: dict[str, Any] = Field(default_factory=dict)   # font, color, fontSize, fontWeight, align, bg, padding…
    shape: Optional[MotionShape] = None                    # (type=shape) figura vectorial
    animation: MotionAnimation = Field(default_factory=MotionAnimation)
    effect: MotionEffect = Field(default_factory=MotionEffect)   # efecto continuo (loop)


class MotionComposition(BaseModel):
    """Composición completa. ``id`` es estable dentro del proyecto."""
    id: str
    name: str = "Motion Graphic"
    width: int = 1080
    height: int = 1920
    fps: int = 30
    duration: float = 4.0                   # segundos
    background: str = "transparent"         # "transparent" | color CSS (#rrggbb)
    layers: list[MotionLayer] = Field(default_factory=list)
    version: int = 1                        # cache-busting: se incrementa al editar
    metadata: dict[str, Any] = Field(default_factory=dict)  # {template, prompt, created_at…}
