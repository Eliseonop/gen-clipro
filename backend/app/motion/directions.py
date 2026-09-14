"""Creative Directions: direcciones artísticas BLOQUEADAS para Generar Escena.

Una dirección no es un nombre ni un tema de colores: define el mundo visual
completo (materiales, paleta, composición, tipografía, lenguaje de movimiento,
transiciones, textura, lo que es y lo que NO es) más un "motor" determinista
(fondo, tratamiento de imágenes, transición, estilo de stickman, fuentes).

- ``compile_lock`` produce el bloque CREATIVE DIRECTION LOCK que se inyecta en
  TODAS las llamadas de IA de una escena. Así la IA no cae en su comodín visual
  (dark + neón + HUD + sci-fi) ni en el "Tailwind UI" genérico.
- ``kit_css`` genera variables CSS + clases utilitarias (``.sc-*``) que los
  bloques html usan: la textura y la paleta salen del sistema, no de la IA.
- Todo es determinista (texturas SVG con semilla fija, sin azar en runtime).

Añadir una dirección = añadir un dict a ``_DIRECTIONS``.
"""
from __future__ import annotations

import copy
import re
from typing import Any
from urllib.parse import quote

# --- Prohibiciones globales (siempre activas) ----------------------------------
GLOBAL_FORBIDDEN = [
    "neon", "cyberpunk", "HUD / heads-up display", "mission control", "sci-fi dashboard",
    "hologram", "glassmorphism", "glowing outlines / glow", "futuristic interface",
    "floating UI cards", "digital grid backgrounds (salvo planos técnicos)",
    "purple-blue AI aesthetic", "generic tech presentation", "corporate SaaS motion graphics",
    "gradientes decorativos", "partículas y destellos genéricos",
]
GENERIC_MOTION_AVOID = [
    "fade-in genérico para todo", "revelados con glow", "escaneos HUD", "efectos holográficos",
    "rebotes/escala exagerados",
]
GENERIC_FEEL_NOT = [
    "la interfaz de una nave espacial", "un dashboard de mission control",
    "una interfaz de ciberseguridad", "una landing SaaS futurista",
    "motion graphics genéricos generados por IA",
]

# --- Tipografías (pilas CSS) y familias Google a cargar --------------------------
F = {
    "inter": "'Inter', system-ui, 'Segoe UI', Arial, sans-serif",
    "instrument": "'Instrument Serif', 'Libre Baskerville', Georgia, serif",
    "caveat": "'Caveat', 'Kalam', 'Comic Sans MS', cursive",
    "marker": "'Permanent Marker', 'Caveat', cursive",
    "kalam": "'Kalam', 'Caveat', cursive",
    "patrick": "'Patrick Hand', 'Kalam', cursive",
    "brush": "'Caveat Brush', 'Caveat', cursive",
    "dmserif": "'DM Serif Display', 'Playfair Display', Georgia, serif",
    "playfair": "'Playfair Display', Georgia, serif",
    "abril": "'Abril Fatface', 'Playfair Display', Georgia, serif",
    "baskerville": "'Libre Baskerville', Georgia, serif",
    "archivo": "'Archivo', 'Inter', Arial, sans-serif",
    "archivo_narrow": "'Archivo Narrow', 'Oswald', Arial, sans-serif",
    "plexmono": "'IBM Plex Mono', 'JetBrains Mono', Consolas, monospace",
    "plexcond": "'IBM Plex Sans Condensed', 'Archivo Narrow', Arial, sans-serif",
    "elite": "'Special Elite', 'Courier New', monospace",
    "jost": "'Jost', 'Futura', 'Inter', sans-serif",
    "fraunces": "'Fraunces', Georgia, serif",
    "bebas": "'Bebas Neue', 'Oswald', Arial, sans-serif",
}
# Familias extra por pila (las básicas ya están en generator._FONTS_LINK).
FONT_FAMILIES = {
    "instrument": "Instrument+Serif:ital@0;1",
    "marker": "Permanent+Marker",
    "patrick": "Patrick+Hand",
    "brush": "Caveat+Brush",
    "dmserif": "DM+Serif+Display:ital@0;1",
    "abril": "Abril+Fatface",
    "baskerville": "Libre+Baskerville:ital,wght@0,400;0,700;1,400",
    "archivo": "Archivo:wght@400;600;800;900",
    "archivo_narrow": "Archivo+Narrow:wght@500;700",
    "plexmono": "IBM+Plex+Mono:wght@400;600",
    "plexcond": "IBM+Plex+Sans+Condensed:wght@500;700",
    "elite": "Special+Elite",
    "jost": "Jost:wght@400;600;800",
    "fraunces": "Fraunces:opsz,wght@9..144,600;9..144,900",
}

BACKDROPS = ("paper_grid", "paper_plain", "ivory", "newsprint", "collage", "blueprint",
             "whiteboard", "film", "swiss", "cork", "rice", "poster", "manual", "documentary", "clean")
IMAGE_TREATMENTS = ("taped", "polaroid", "archive_card", "clipping", "blueprint_frame",
                    "pinned", "wash", "full_bleed", "card", "specimen")
TRANSITIONS = ("page_slide", "line_wipe", "ink_bloom", "dip", "film_flash", "cut")
STICK_STYLES = ("clean", "paper", "chalk", "transparent")


def _d(**kw: Any) -> dict[str, Any]:
    return kw


_DIRECTIONS: list[dict[str, Any]] = [
    _d(
        key="sketchbook", label="Sketchbook", group="Papel y mano",
        summary="El cuaderno de trabajo del creador: lápiz, tinta, flechas, tachones y notas al margen.",
        identity=("La animación debe sentirse como abrir el cuaderno privado de quien tuvo la idea. "
                  "NO es una presentación pulida ni una interfaz: es físico, imperfecto, espontáneo y humano. "
                  "Todo parece dibujado, escrito, pegado o marcado sobre la página."),
        materials_use=["grafito", "tinta negra", "trazos de rotulador imperfectos", "anotaciones manuscritas",
                       "círculos alrededor de ideas", "flechas que conectan conceptos", "notas tachadas",
                       "subrayados", "trazos de subrayador", "fragmentos de post-it", "diagramas rápidos",
                       "pequeños garabatos", "marcas de medida", "notas diminutas al margen"],
        materials_avoid=["superficies digitales limpias", "tarjetas con sombra", "iconos vectoriales de UI"],
        palette=dict(bg="#f4efe4", surface="#fbf8f1", ink="#1f1c18", secondary="#6b645a",
                     accent="#f2c230", extra=["#d9d2c3"]),
        accent_role="UN solo color de subrayador (amarillo) para lo importante",
        composition=("Composición de cuaderno editorial: elementos repartidos por la página, no centrados. "
                     "Solapamientos, zonas vacías intencionadas, escalas distintas; algunos diagramas "
                     "pueden salirse del cuadro. La página se siente descubierta, no maquetada."),
        composition_prefer=["asimetría", "anotaciones pequeñas junto a lo grande",
                            "ideas clave rodeadas varias veces", "flechas que guían la lectura"],
        composition_avoid=["todo centrado", "cuadrícula perfecta de tarjetas", "paneles"],
        typography=dict(display="instrument", body="caveat", hand="caveat", accent_font="marker"),
        typography_notes=("Anotaciones manuscritas (Caveat), rotulado de rotulador (Permanent Marker) y, "
                          "solo para títulos importantes, una serif editorial limpia (Instrument Serif). "
                          "El texto manuscrito debe parecer escrito, nunca una fuente futurista."),
        motion_feel="como si una persona real dibujara la página en directo",
        motion_examples=["líneas que se revelan con stroke-dashoffset", "flechas que se trazan de principio a fin",
                         "círculos dibujados de forma imperfecta", "texto que aparece como escrito a mano",
                         "papeles que se deslizan, giran un poco y se superponen"],
        motion_avoid=["animación de UI digital", "entradas simétricas"],
        transitions=["paso de página", "cámara que empuja sobre el papel", "hoja que se desliza debajo de otra",
                     "zona que se rodea con un círculo"],
        texture="papel hueso con cuadrícula de cuaderno sutil y grano; las imperfecciones son intencionadas.",
        feel_is=["un sketchbook hecho a mano", "un cuaderno de investigación", "un diario visual",
                 "un documento de proceso creativo"],
        feel_not=[],
        forbidden=["fuentes futuristas", "fondos de rejilla digital"],
        rule="ante la ambigüedad, prioriza lo manual e imperfecto sobre el espectáculo visual",
        test=("Si quitara todo el texto y congelara el frame, ¿seguiría pareciendo el cuaderno real de un "
              "creador? Si no, rediseña la composición."),
        keywords=["notebook", "graphite", "ink", "handwritten", "doodle", "margin notes"],
        engine=dict(backdrop="paper_grid", image_treatment="taped", transition="page_slide",
                    stick_style="paper", rough=True),
    ),
    _d(
        key="editorial_magazine", label="Editorial Magazine", group="Editorial",
        summary="Revista de alta gama: titulares enormes, fotos recortadas, columnas y líneas finas.",
        identity=("Diseño de revista impresa de alta gama. Grandes titulares tipográficos, fotografías "
                  "recortadas con intención, columnas, filetes finos, folios y números de página. "
                  "Elegante, segura y con mucho aire."),
        materials_use=["titulares serif de gran cuerpo", "fotografía recortada", "filetes de 1–2 px",
                       "folios y números de sección", "capitulares", "pies de foto en cursiva"],
        materials_avoid=["iconos", "tarjetas redondeadas", "sombras"],
        palette=dict(bg="#f3f0ea", surface="#ffffff", ink="#141414", secondary="#7a746c",
                     accent="#b3261e", extra=["#d8d2c8"]),
        accent_role="rojo editorial SOLO para un número, una palabra o un filete",
        composition=("Composición asimétrica sobre una retícula de columnas. Un titular domina; el resto "
                     "se ordena en columnas estrechas. El espacio negativo es parte del diseño."),
        composition_prefer=["retícula de 6 columnas", "titular que ocupa 2/3 del ancho",
                            "texto alineado a la izquierda", "folio pequeño en una esquina"],
        composition_avoid=["centrado simétrico", "dashboards", "tarjetas flotantes"],
        typography=dict(display="dmserif", body="archivo", hand=None, accent_font="baskerville"),
        typography_notes="Serif display de alto contraste para titulares, sans neutra pequeña para folios y pies.",
        motion_feel="como pasar páginas de una revista cara: tipográfico, preciso y sin prisa",
        motion_examples=["titulares que entran por máscara de línea", "filetes que se trazan",
                         "fotos que se descubren con un recorte que se abre", "columnas que se escalonan"],
        motion_avoid=["zoom brusco", "rotaciones"],
        transitions=["corte de página con filete", "máscara horizontal", "cambio de spread"],
        texture="papel estucado mate, casi liso; el lujo está en la tipografía, no en efectos.",
        feel_is=["una revista impresa de diseño", "un reportaje de fondo", "un spread de Kinfolk o Monocle"],
        feel_not=[],
        forbidden=["emoji", "iconografía de app"],
        rule="ante la ambigüedad, prioriza la jerarquía tipográfica sobre cualquier ornamento",
        test="¿Podría imprimirse este frame como una página de revista sin que desentone? Si no, rediseña.",
        keywords=["magazine", "editorial layout", "serif headline", "grid", "folio"],
        engine=dict(backdrop="paper_plain", image_treatment="card", transition="line_wipe",
                    stick_style="paper", rough=False),
    ),
    _d(
        key="field_notes", label="Scientific Field Notes", group="Ciencia",
        summary="Cuaderno de explorador: muestras, etiquetas, coordenadas, mediciones y círculos de observación.",
        identity=("El cuaderno de campo de un científico explorador. Observaciones anotadas a mano, "
                  "muestras etiquetadas, coordenadas, escalas y fotografías documentales pegadas. "
                  "Riguroso pero hecho sobre el terreno."),
        materials_use=["etiquetas de muestra", "coordenadas y fechas", "barras de escala", "círculos de observación",
                       "líneas de referencia con número", "fotos documentales pegadas", "tablas manuscritas"],
        materials_avoid=["gráficos corporativos", "iconos planos"],
        palette=dict(bg="#ece6d6", surface="#f7f2e5", ink="#23262b", secondary="#5d6b5a",
                     accent="#b5541c", extra=["#8a9a7b"]),
        accent_role="tinta óxido para marcar la observación clave",
        composition=("Página de cuaderno con observaciones repartidas: la muestra o el diagrama principal, "
                     "rodeado de etiquetas numeradas y medidas. Orden científico, trazo humano."),
        composition_prefer=["líneas de referencia numeradas", "barra de escala", "fecha/coordenadas en esquina"],
        composition_avoid=["centrado de presentación", "paneles de datos"],
        typography=dict(display="baskerville", body="kalam", hand="kalam", accent_font="plexmono"),
        typography_notes="Manuscrita legible para notas, mono pequeña para medidas, serif clásica para el título.",
        motion_feel="como un científico que va anotando lo que observa",
        motion_examples=["líneas de referencia que se trazan hacia la muestra", "números de etiqueta que aparecen",
                         "círculo de observación que se dibuja", "escala que se mide"],
        motion_avoid=["efectos de pantalla"],
        transitions=["hoja siguiente del cuaderno", "zoom de lupa sobre el papel"],
        texture="papel de cuaderno de campo, ligeramente amarillento, con grano.",
        feel_is=["el cuaderno de Darwin", "notas de una expedición", "un diario de laboratorio"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza la observación anotada sobre la estética",
        test="¿Parece una página real de un cuaderno de campo? Si no, rediseña.",
        keywords=["field notes", "specimen", "annotation", "scale bar", "expedition"],
        engine=dict(backdrop="paper_plain", image_treatment="specimen", transition="page_slide",
                    stick_style="paper", rough=True),
    ),
    _d(
        key="museum_archive", label="Museum Archive", group="Editorial",
        summary="Fichas de archivo, fotos antiguas, sellos y etiquetas curatoriales sobre fondo marfil.",
        identity=("Una exposición de museo o un archivo histórico. Fondo marfil, fichas catalográficas, "
                  "fotografías antiguas, sellos, etiquetas curatoriales y números de inventario. Sobrio y respetuoso."),
        materials_use=["fichas catalográficas", "números de inventario", "sellos de tinta", "etiquetas de vitrina",
                       "fotografías antiguas con borde", "texto mecanografiado"],
        materials_avoid=["colores vivos", "efectos digitales"],
        palette=dict(bg="#ece4d3", surface="#f8f3e8", ink="#2b2620", secondary="#7d7162",
                     accent="#8c2f23", extra=["#c9bba2"]),
        accent_role="rojo de sello de tinta, muy puntual",
        composition=("Composición de vitrina: un objeto o foto protagonista con su etiqueta curatorial; "
                     "fichas alineadas con márgenes generosos."),
        composition_prefer=["objeto + cartela", "márgenes amplios", "números de inventario"],
        composition_avoid=["aglomeración", "decoración"],
        typography=dict(display="baskerville", body="baskerville", hand=None, accent_font="elite"),
        typography_notes="Serif clásica para cartelas; mecanografiada para números de inventario y fechas.",
        motion_feel="como un conservador que coloca piezas con guantes: lento y cuidadoso",
        motion_examples=["fichas que se deslizan a su sitio", "sello que se estampa (escala leve)",
                         "cartela que aparece bajo la foto"],
        motion_avoid=["movimientos rápidos"],
        transitions=["fundido a marfil", "cambio de vitrina"],
        texture="cartulina marfil con grano y leve envejecimiento.",
        feel_is=["una exposición de museo", "un archivo histórico", "un catálogo razonado"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza la sobriedad curatorial sobre el impacto",
        test="¿Podría este frame colgar en la sala de un museo? Si no, rediseña.",
        keywords=["archive", "catalog card", "inventory", "museum label", "stamp"],
        engine=dict(backdrop="ivory", image_treatment="archive_card", transition="dip",
                    stick_style="paper", rough=False),
    ),
    _d(
        key="newspaper", label="Newspaper / Breaking Press", group="Editorial",
        summary="Periódico moderno: titulares gigantes, columnas, recortes y flechas editoriales.",
        identity=("Un periódico moderno contando una noticia. Titulares gigantes, columnas, recortes de "
                  "fotografía, subrayados y flechas editoriales; los bloques entran como páginas impresas."),
        materials_use=["titulares a toda anchura", "columnas justificadas", "recortes de foto en semitono",
                       "filetes gruesos y finos", "antetítulos en mayúsculas", "pies de foto"],
        materials_avoid=["tarjetas", "sombras suaves"],
        palette=dict(bg="#efece3", surface="#f7f5ee", ink="#111111", secondary="#555049",
                     accent="#c8102e", extra=["#bdb6a8"]),
        accent_role="rojo de portada para UNA palabra o flecha",
        composition=("Portada de periódico: titular dominante arriba, columnas de texto y recorte de foto. "
                     "Densidad informativa controlada."),
        composition_prefer=["cabecera + titular + columnas", "recortes superpuestos", "flechas editoriales"],
        composition_avoid=["espacio de landing page", "centrado"],
        typography=dict(display="playfair", body="baskerville", hand=None, accent_font="archivo_narrow"),
        typography_notes="Serif negra muy condensada para titulares; serif de lectura para columnas.",
        motion_feel="como una rotativa imprimiendo y un editor marcando la página",
        motion_examples=["titular que cae y se asienta", "columnas que se imprimen de arriba a abajo",
                         "subrayado de rotulador rojo", "recorte que se pega con leve giro"],
        motion_avoid=["transiciones de TV"],
        transitions=["nueva página que se desliza", "giro de periódico"],
        texture="papel prensa con semitono y grano.",
        feel_is=["una portada de periódico", "un recorte de prensa", "una noticia de última hora impresa"],
        feel_not=[],
        forbidden=["banners de TV", "tickers"],
        rule="ante la ambigüedad, prioriza el titular y la noticia sobre la decoración",
        test="¿Parece una página de periódico real? Si no, rediseña.",
        keywords=["newspaper", "headline", "columns", "halftone", "press"],
        engine=dict(backdrop="newsprint", image_treatment="clipping", transition="page_slide",
                    stick_style="paper", rough=False),
    ),
    _d(
        key="paper_collage", label="Paper Collage", group="Papel y mano",
        summary="Todo construido con recortes físicos: fotos, formas, cinta adhesiva y letras recortadas.",
        identity=("Una escena construida con recortes de papel reales: fotografías, formas geométricas "
                  "de cartulina, cinta adhesiva, etiquetas y letras recortadas de revistas."),
        materials_use=["cartulina de colores apagados", "fotos recortadas con borde blanco", "cinta adhesiva",
                       "letras recortadas", "sombras cortas de papel", "bordes rasgados"],
        materials_avoid=["vectores perfectos", "degradados"],
        palette=dict(bg="#e7dfcc", surface="#f6f1e4", ink="#22201c", secondary="#3e6e8e",
                     accent="#e0572b", extra=["#e8b93c", "#7a9a6b"]),
        accent_role="naranja de cartulina para la pieza principal",
        composition=("Collage con capas superpuestas y leves rotaciones; piezas grandes y pequeñas; "
                     "la sombra corta de cada papel da profundidad física."),
        composition_prefer=["superposición", "rotaciones de ±2–6°", "cinta en esquinas"],
        composition_avoid=["alineación perfecta", "UI"],
        typography=dict(display="abril", body="patrick", hand="patrick", accent_font="elite"),
        typography_notes="Titulares como letras recortadas (mezcla de pesos), notas en manuscrita.",
        motion_feel="piezas de papel colocadas a mano: desplazamientos y pequeños saltos",
        motion_examples=["recortes que caen y se asientan con leve giro", "cinta que aparece sobre la foto",
                         "letras que se colocan una a una"],
        motion_avoid=["morphing", "blur"],
        transitions=["papel que tapa la escena", "recorte que se retira"],
        texture="cartulina y papel con fibra, sombras cortas y duras.",
        feel_is=["un collage físico", "un fanzine", "un mural de recortes"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza la sensación de papel físico sobre la limpieza",
        test="¿Parece que podría fotografiarse este collage sobre una mesa? Si no, rediseña.",
        keywords=["collage", "cut paper", "tape", "ransom letters", "cardstock"],
        engine=dict(backdrop="collage", image_treatment="taped", transition="page_slide",
                    stick_style="paper", rough=True),
    ),
    _d(
        key="blueprint", label="Blueprint / Engineering", group="Técnico",
        summary="Planos técnicos: cotas, líneas de construcción, esquemas y anotaciones en azul y blanco.",
        identity=("Un plano de ingeniería. Líneas de construcción, cotas, vistas, esquemas y anotaciones "
                  "técnicas en tinta blanca sobre azul de plano. Preciso, funcional, nada de neón."),
        materials_use=["líneas de construcción finas", "cotas con flechas", "vistas superiores/laterales",
                       "cajetín con número de plano", "retícula técnica tenue", "rotulación técnica"],
        materials_avoid=["glow", "degradados", "superficies brillantes"],
        palette=dict(bg="#1d4f7a", surface="#22598a", ink="#f1f5f9", secondary="#9cc0dd",
                     accent="#f4d35e", extra=["#3f73a1"]),
        accent_role="amarillo de lápiz de revisión, solo para marcar la cota clave",
        composition=("Lámina técnica: pieza o esquema principal con cotas alrededor, cajetín en una esquina, "
                     "retícula tenue de fondo."),
        composition_prefer=["líneas finas de 2 px", "cotas", "cajetín", "numeración de piezas"],
        composition_avoid=["pantallas", "iconos brillantes"],
        typography=dict(display="plexcond", body="plexmono", hand=None, accent_font="plexmono"),
        typography_notes="Rotulación técnica en mayúsculas; mono para medidas.",
        motion_feel="como un delineante trazando el plano con regla",
        motion_examples=["líneas que se trazan con regla (stroke)", "cotas que se extienden", "piezas que se ensamblan"],
        motion_avoid=["pulsos luminosos", "escaneos"],
        transitions=["barrido de línea de construcción", "cambio de lámina"],
        texture="papel de plano con leve ruido y retícula técnica tenue.",
        feel_is=["un plano de ingeniería", "una lámina de patente", "un dibujo técnico"],
        feel_not=[],
        forbidden=["tron", "líneas luminosas"],
        rule="ante la ambigüedad, prioriza la precisión técnica sobre el efecto",
        test="¿Podría ser una lámina real de un despacho de ingeniería? Si no, rediseña.",
        keywords=["blueprint", "technical drawing", "dimension lines", "draftsman"],
        engine=dict(backdrop="blueprint", image_treatment="blueprint_frame", transition="line_wipe",
                    stick_style="chalk", rough=False),
    ),
    _d(
        key="whiteboard", label="Classroom / Whiteboard", group="Ciencia",
        summary="Pizarra blanca con rotulador: fórmulas, diagramas simples, círculos y flechas.",
        identity=("Una pizarra de clase donde alguien explica el concepto en directo: rotulador, fórmulas, "
                  "dibujos simples, flechas y círculos. Claridad didáctica por encima de todo."),
        materials_use=["rotulador negro, azul y rojo", "fórmulas", "diagramas simples", "flechas",
                       "círculos y recuadros", "borrones leves"],
        materials_avoid=["fotos brillantes", "UI"],
        palette=dict(bg="#f6f6f3", surface="#ffffff", ink="#1b1f24", secondary="#2c5ea8",
                     accent="#d63a2f", extra=["#9aa3ad"]),
        accent_role="rotulador rojo para lo que hay que recordar",
        composition=("Pizarra con el diagrama explicado en el centro-izquierda y notas alrededor; "
                     "flechas que conducen la explicación paso a paso."),
        composition_prefer=["un paso cada vez", "flechas numeradas", "resultado recuadrado"],
        composition_avoid=["tarjetas", "demasiado texto"],
        typography=dict(display="marker", body="patrick", hand="patrick", accent_font="marker"),
        typography_notes="Letra de rotulador legible; nada de tipografía de ordenador salvo fórmulas.",
        motion_feel="un profesor dibujando y explicando en la pizarra",
        motion_examples=["trazos de rotulador que se dibujan", "fórmula que se escribe", "círculo alrededor del resultado"],
        motion_avoid=["efectos de pantalla"],
        transitions=["borrado con borrador", "pizarra limpia"],
        texture="pizarra blanca con leves restos de borrado.",
        feel_is=["una clase de ciencias", "una explicación en pizarra", "un vídeo tipo Khan Academy hecho a mano"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza que se entienda el concepto",
        test="¿Un alumno entendería la idea mirando solo la pizarra? Si no, simplifica.",
        keywords=["whiteboard", "marker", "diagram", "formula", "teacher"],
        engine=dict(backdrop="whiteboard", image_treatment="taped", transition="dip",
                    stick_style="clean", rough=True),
    ),
    _d(
        key="retro_edu_film", label="Retro Educational Film", group="Cine",
        summary="Documental educativo de los 60–80: grano, tipografía retro, ilustración plana y diagramas.",
        identity=("Una película educativa de los años 60–80: grano de película, tipografía geométrica retro, "
                  "ilustraciones planas, diagramas animados y transiciones mecánicas."),
        materials_use=["ilustración plana de formas simples", "tipografía geométrica", "grano de película",
                       "viñeteado", "rótulos de capítulo", "diagramas con flechas gruesas"],
        materials_avoid=["colores digitales saturados", "glow"],
        palette=dict(bg="#e9dcbf", surface="#f3ead6", ink="#2d2a26", secondary="#2f6f73",
                     accent="#d9722b", extra=["#c8a74a", "#9b3d2e"]),
        accent_role="naranja retro para la forma protagonista",
        composition=("Encuadre de película: rótulo grande o ilustración central sencilla, formas planas "
                     "con pocos colores y mucho fondo."),
        composition_prefer=["formas planas", "rótulo de capítulo", "diagramas gruesos"],
        composition_avoid=["detalle excesivo"],
        typography=dict(display="jost", body="jost", hand=None, accent_font="fraunces"),
        typography_notes="Geométrica tipo Futura en mayúsculas espaciadas; serif blanda para rótulos.",
        motion_feel="animación de celuloide: mecánica, con pequeños saltos de fotograma",
        motion_examples=["formas que entran con movimiento lineal por pasos", "rótulo con leve jitter",
                         "diagrama que se construye pieza a pieza"],
        motion_avoid=["suavizados modernos exagerados"],
        transitions=["destello de proyector", "cortinilla mecánica"],
        texture="grano de película, viñeteado y leve desvanecimiento de color.",
        feel_is=["una película educativa vintage", "un documental escolar de 1970", "Charles & Ray Eames"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza el encanto retro y la sencillez",
        test="¿Parece un fotograma de una película educativa antigua? Si no, rediseña.",
        keywords=["retro educational", "film grain", "flat illustration", "70s"],
        engine=dict(backdrop="film", image_treatment="card", transition="film_flash",
                    stick_style="paper", rough=False),
    ),
    _d(
        key="swiss", label="Minimal Swiss Editorial", group="Editorial",
        summary="Diseño suizo: retícula estricta, sans-serif, espacio negativo y bloques geométricos.",
        identity=("Diseño gráfico suizo. Retícula estricta, tipografía sans-serif, mucho espacio negativo, "
                  "filetes y bloques geométricos. Limpio, racional y seguro."),
        materials_use=["retícula visible solo en la alineación", "bloques de color plano", "filetes",
                       "números grandes", "texto alineado a la izquierda"],
        materials_avoid=["sombras", "texturas", "esquinas redondeadas", "iconos"],
        palette=dict(bg="#f1efea", surface="#ffffff", ink="#111111", secondary="#8a8a8a",
                     accent="#e5352b", extra=["#1f3a93"]),
        accent_role="rojo suizo en UN bloque o número",
        composition=("Retícula de 12 columnas estricta, alineación a la izquierda, un bloque geométrico "
                     "grande y tipografía enorme; espacio negativo abundante."),
        composition_prefer=["asimetría racional", "tipografía enorme", "filete como estructura"],
        composition_avoid=["centrado decorativo", "tarjetas"],
        typography=dict(display="inter", body="inter", hand=None, accent_font="plexmono"),
        typography_notes="Sans grotesca muy pesada y apretada para titulares, pequeña y ligera para el resto.",
        motion_feel="precisión mecánica: bloques que se deslizan por la retícula",
        motion_examples=["bloques que crecen desde un borde", "texto que entra por máscara", "números que cuentan"],
        motion_avoid=["rotaciones", "rebotes"],
        transitions=["barrido de bloque de color", "corte seco en retícula"],
        texture="plana, sin textura.",
        feel_is=["un cartel de Müller-Brockmann", "un informe anual suizo", "diseño de Vignelli"],
        feel_not=[],
        forbidden=["sombras", "texturas decorativas"],
        rule="ante la ambigüedad, prioriza la retícula y el espacio negativo",
        test="¿Se sostiene el frame solo con tipografía y un bloque? Si necesita adornos, rediseña.",
        keywords=["swiss design", "grid", "grotesk", "negative space"],
        engine=dict(backdrop="swiss", image_treatment="card", transition="line_wipe",
                    stick_style="clean", rough=False),
    ),
    _d(
        key="infographic_news", label="Infographic Newspaper", group="Datos",
        summary="Infografía editorial animada: datos grandes, porcentajes, gráficos, flechas y pequeños iconos.",
        identity=("La escena se comporta como una infografía de periódico animada: la información primero, "
                  "la decoración después. Datos grandes, porcentajes, gráficos sobrios y leyendas."),
        materials_use=["cifras enormes", "gráficos de barras/áreas planos", "leyendas y fuentes",
                       "flechas finas", "pictogramas simples", "filetes"],
        materials_avoid=["gráficos 3D", "glow", "dashboards"],
        palette=dict(bg="#f2efe8", surface="#fbfaf6", ink="#1a1a1a", secondary="#6d6a64",
                     accent="#d1495b", extra=["#2e86ab", "#edae49"]),
        accent_role="un color de dato para destacar la serie importante",
        composition=("Página de infografía: cifra o gráfico protagonista, título-pregunta arriba, "
                     "leyenda y fuente abajo en pequeño."),
        composition_prefer=["un dato protagonista", "fuente citada", "anotaciones sobre el gráfico"],
        composition_avoid=["varios KPIs compitiendo", "paneles tipo dashboard"],
        typography=dict(display="archivo", body="archivo", hand=None, accent_font="baskerville"),
        typography_notes="Sans condensada muy negra para cifras, serif para el titular-pregunta.",
        motion_feel="un infografista revelando el dato con precisión",
        motion_examples=["barras que crecen desde la base", "cifra que cuenta", "anotación que señala el pico"],
        motion_avoid=["efectos de pantalla"],
        transitions=["barrido de filete", "cambio de gráfico"],
        texture="papel prensa suave.",
        feel_is=["una infografía del NYT o The Economist", "un gráfico explicativo de periódico"],
        feel_not=[],
        forbidden=["dashboards", "KPIs de SaaS"],
        rule="ante la ambigüedad, prioriza la claridad del dato",
        test="¿Se entiende el dato en 2 segundos y parece impreso? Si no, simplifica.",
        keywords=["infographic", "data journalism", "chart", "annotation"],
        engine=dict(backdrop="newsprint", image_treatment="card", transition="line_wipe",
                    stick_style="paper", rough=False),
    ),
    _d(
        key="investigation_board", label="Investigation Board", group="Papel y mano",
        summary="Tablón de investigación: fotos, documentos, post-its, chinchetas e hilos que conectan.",
        identity=("Un tablón de investigación sobre corcho: fotos, documentos, notas, post-its, clips, "
                  "cinta y conexiones con hilo rojo. Misterio, historia y teorías."),
        materials_use=["corcho", "fotos con chincheta", "documentos mecanografiados", "post-its",
                       "hilo rojo", "rotulador", "círculos y signos de interrogación"],
        materials_avoid=["pantallas", "UI"],
        palette=dict(bg="#b58d5f", surface="#f4eedf", ink="#1f1b16", secondary="#f1d36b",
                     accent="#b3202a", extra=["#e8e1cf"]),
        accent_role="hilo rojo que conecta las pistas",
        composition=("Tablón con piezas repartidas y conectadas por hilos; la pista principal en el centro "
                     "de la atención (no del cuadro)."),
        composition_prefer=["conexiones con hilo", "piezas rotadas", "post-its con preguntas"],
        composition_avoid=["orden perfecto"],
        typography=dict(display="elite", body="elite", hand="marker", accent_font="marker"),
        typography_notes="Mecanografiada para documentos; rotulador para notas.",
        motion_feel="un detective clavando pistas y tirando hilos",
        motion_examples=["foto que se clava (leve golpe)", "hilo que se tiende entre chinchetas", "círculo de rotulador"],
        motion_avoid=["transiciones digitales"],
        transitions=["cámara que se desplaza por el tablón"],
        texture="corcho con grano y papeles con sombra corta.",
        feel_is=["el tablón de un detective", "un true-crime documental", "una teoría conspirativa en pared"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza las conexiones entre pistas",
        test="¿Parece un tablón físico real? Si no, rediseña.",
        keywords=["corkboard", "red string", "evidence", "polaroid", "post-it"],
        engine=dict(backdrop="cork", image_treatment="pinned", transition="page_slide",
                    stick_style="paper", rough=True),
    ),
    _d(
        key="ink_wash", label="Ink & Wash", group="Papel y mano",
        summary="Tinta negra y manchas de acuarela: trazos imperfectos que aparecen progresivamente.",
        identity=("Tinta negra y aguadas de acuarela sobre papel de arroz. Dibujos imperfectos, pinceladas "
                  "y trazos que aparecen poco a poco. Poético, contemplativo."),
        materials_use=["pincelada de tinta", "manchas de aguada", "papel de arroz", "sello rojo pequeño",
                       "caligrafía de pincel", "mucho vacío"],
        materials_avoid=["vectores duros", "colores digitales"],
        palette=dict(bg="#f1ece1", surface="#f7f3ea", ink="#141414", secondary="#7b8a94",
                     accent="#b8322a", extra=["#c9c1b1"]),
        accent_role="sello rojo diminuto",
        composition=("Composición oriental con gran vacío: una figura o trazo protagonista desplazado, "
                     "texto vertical u horizontal breve."),
        composition_prefer=["vacío como protagonista", "trazo único", "sello en una esquina"],
        composition_avoid=["aglomeración", "cajas"],
        typography=dict(display="instrument", body="instrument", hand="brush", accent_font="brush"),
        typography_notes="Serif delicada y caligrafía de pincel para palabras sueltas.",
        motion_feel="tinta que se extiende en el papel mojado",
        motion_examples=["mancha que florece (escala + opacidad)", "trazo de pincel que se revela", "texto que se difumina"],
        motion_avoid=["movimientos rápidos", "rebotes"],
        transitions=["mancha de tinta que cubre y se retira"],
        texture="papel de arroz con fibra.",
        feel_is=["una pintura sumi-e", "un cuaderno de viaje a tinta", "un poema visual"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza el vacío y el trazo",
        test="¿Parece pintado a tinta? Si parece digital, rediseña.",
        keywords=["ink wash", "sumi-e", "brush stroke", "watercolor"],
        engine=dict(backdrop="rice", image_treatment="wash", transition="ink_bloom",
                    stick_style="paper", rough=True),
    ),
    _d(
        key="vintage_poster", label="Vintage Scientific Poster", group="Ciencia",
        summary="Cartel científico antiguo: tipografía clásica, grabados, diagramas y textura de impresión.",
        identity=("Un cartel científico antiguo, como una lámina de divulgación de principios del siglo XX: "
                  "tipografía clásica, ilustraciones de grabado, diagramas y marcos ornamentales sobrios."),
        materials_use=["titular clásico centrado en cartela", "ilustración de grabado", "diagramas con leyenda",
                       "marco de filete doble", "numeración romana"],
        materials_avoid=["fotografía moderna brillante", "UI"],
        palette=dict(bg="#eadfc4", surface="#f3ead3", ink="#2a211a", secondary="#445a4d",
                     accent="#9c3b25", extra=["#c29a4b"]),
        accent_role="rojo de imprenta para el título o una figura",
        composition=("Composición de póster: título en cartela, figura central con leyendas numeradas, "
                     "marco de filete."),
        composition_prefer=["simetría clásica", "leyendas numeradas", "marco"],
        composition_avoid=["asimetría moderna extrema"],
        typography=dict(display="abril", body="baskerville", hand=None, accent_font="baskerville"),
        typography_notes="Didona de cartel para títulos; serif clásica para leyendas.",
        motion_feel="una lámina que se imprime tinta a tinta",
        motion_examples=["capas de color que se superponen", "leyendas que aparecen numeradas", "marco que se traza"],
        motion_avoid=["movimientos modernos"],
        transitions=["fundido de tinta", "cambio de lámina"],
        texture="impresión con leve desregistro y grano de papel.",
        feel_is=["una lámina escolar antigua", "un cartel de divulgación de 1920"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza la elegancia clásica",
        test="¿Podría enmarcarse como lámina antigua? Si no, rediseña.",
        keywords=["vintage poster", "engraving", "scientific plate", "letterpress"],
        engine=dict(backdrop="poster", image_treatment="archive_card", transition="dip",
                    stick_style="paper", rough=False),
    ),
    _d(
        key="technical_manual", label="Technical Manual", group="Técnico",
        summary="Manual de instrucciones industrial: numeración, piezas despiezadas, llamadas y flechas.",
        identity=("Un manual de instrucciones industrial. Pasos numerados, piezas despiezadas, llamadas "
                  "técnicas, flechas de acción y advertencias. Todo funcional."),
        materials_use=["pasos numerados en círculo", "despiece", "llamadas con línea", "flechas de acción",
                       "iconos de advertencia simples", "tablas de piezas"],
        materials_avoid=["decoración", "fotos atmosféricas"],
        palette=dict(bg="#f3f3ee", surface="#ffffff", ink="#1c1c1c", secondary="#7a7a74",
                     accent="#f2a900", extra=["#2b6cb0"]),
        accent_role="amarillo de seguridad para el paso activo",
        composition=("Página de manual: ilustración funcional con llamadas numeradas; texto mínimo e "
                     "imperativo."),
        composition_prefer=["numeración", "llamadas", "secuencia paso a paso"],
        composition_avoid=["ambigüedad", "texto largo"],
        typography=dict(display="plexcond", body="plexcond", hand=None, accent_font="plexmono"),
        typography_notes="Sans condensada técnica; números grandes en círculos.",
        motion_feel="un montaje paso a paso",
        motion_examples=["pieza que se desplaza a su posición", "llamada que se extiende", "número de paso que aparece"],
        motion_avoid=["efectos"],
        transitions=["siguiente paso (barrido)"],
        texture="papel offset limpio.",
        feel_is=["un manual de IKEA o de maquinaria", "una guía de montaje"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza que la acción sea inequívoca",
        test="¿Alguien podría seguir las instrucciones solo con la imagen? Si no, rediseña.",
        keywords=["instruction manual", "exploded view", "callout", "step"],
        engine=dict(backdrop="manual", image_treatment="card", transition="line_wipe",
                    stick_style="clean", rough=False),
    ),
    _d(
        key="documentary", label="Modern Documentary", group="Cine",
        summary="Documental premium: fotografía, tipografía discreta, mapas, documentos y cortes cinematográficos.",
        identity=("Lenguaje de documental premium. Fotografía a pantalla completa con movimiento lento, "
                  "tipografía discreta, mapas, documentos y pequeñas animaciones. Cero interfaz futurista."),
        materials_use=["fotografía a sangre con Ken Burns lento", "rótulos discretos", "mapas sobrios",
                       "documentos", "letterbox opcional", "grano fino"],
        materials_avoid=["UI", "glow", "tarjetas"],
        palette=dict(bg="#141311", surface="#1d1b18", ink="#f2eee6", secondary="#a39d92",
                     accent="#d9a441", extra=["#5a5650"]),
        accent_role="ámbar cálido, casi imperceptible",
        composition=("Encuadre cinematográfico: imagen dominante, texto pequeño en tercio inferior o "
                     "lateral; aire y ritmo lento."),
        composition_prefer=["regla de tercios", "texto pequeño y elegante", "imagen a sangre"],
        composition_avoid=["texto grande sobre todo", "paneles"],
        typography=dict(display="instrument", body="inter", hand=None, accent_font="plexmono"),
        typography_notes="Serif fina para títulos; sans ligera espaciada para rótulos.",
        motion_feel="cámara lenta de documental",
        motion_examples=["Ken Burns lento", "texto que aparece con tracking", "fundidos largos"],
        motion_avoid=["cortes rápidos", "escalas bruscas"],
        transitions=["fundido a negro", "corte cinematográfico"],
        texture="grano fino de película.",
        feel_is=["un documental de Netflix premium", "un reportaje de National Geographic"],
        feel_not=[],
        forbidden=["lower thirds de TV genéricos"],
        rule="ante la ambigüedad, prioriza la imagen y el silencio",
        test="¿Parece un fotograma de un documental de autor? Si no, rediseña.",
        keywords=["documentary", "ken burns", "cinematic", "film grain"],
        engine=dict(backdrop="documentary", image_treatment="full_bleed", transition="dip",
                    stick_style="chalk", rough=False),
    ),
    _d(
        key="minimal_clean", label="Minimal Clean", group="Digital",
        summary="El estilo limpio actual (superficies claras, Inter, un acento). Para overlays neutros.",
        identity=("Minimalista y moderno: superficies claras, tipografía Inter con jerarquía, mucho espacio "
                  "y un solo acento sobrio. Sin neón ni glow."),
        materials_use=["superficies planas claras", "filetes finos", "tipografía con jerarquía"],
        materials_avoid=["glow", "neón"],
        palette=dict(bg="#f8fafc", surface="#ffffff", ink="#0f172a", secondary="#64748b",
                     accent="#4f46e5", extra=["#e2e8f0"]),
        accent_role="un acento sobrio",
        composition="Un protagonista, mucho espacio y jerarquía clara.",
        composition_prefer=["un protagonista", "espacio en blanco"],
        composition_avoid=["dashboards"],
        typography=dict(display="inter", body="inter", hand=None, accent_font="inter"),
        typography_notes="Inter 800 para titulares, 500 para cuerpo.",
        motion_feel="sutil y elegante",
        motion_examples=["fade + desplazamiento corto", "stagger 0.08–0.15 s"],
        motion_avoid=["rebotes"],
        transitions=["fundido"],
        texture="plana.",
        feel_is=["un producto de diseño cuidado"],
        feel_not=[],
        forbidden=[],
        rule="ante la ambigüedad, prioriza la claridad",
        test="¿Hay un único protagonista claro? Si no, simplifica.",
        keywords=["minimal", "clean"],
        engine=dict(backdrop="clean", image_treatment="card", transition="dip",
                    stick_style="clean", rough=False),
    ),
]

DIRECTIONS: dict[str, dict[str, Any]] = {d["key"]: d for d in _DIRECTIONS}
DEFAULT_DIRECTION = "sketchbook"

_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_PALETTE_KEYS = ("bg", "surface", "ink", "secondary", "accent")


def get(key: str | None) -> dict[str, Any]:
    return DIRECTIONS.get((key or "").strip(), DIRECTIONS[DEFAULT_DIRECTION])


def resolve(key: str | None, overrides: dict | None = None) -> dict[str, Any]:
    """Dirección con los overrides del usuario aplicados (paleta, notas, prohibiciones)."""
    d = copy.deepcopy(get(key))
    ov = overrides if isinstance(overrides, dict) else {}
    for k in _PALETTE_KEYS:
        v = ov.get(k)
        if isinstance(v, str) and _HEX.match(v.strip()):
            d["palette"][k] = v.strip()
    extra = ov.get("forbidden")
    if isinstance(extra, list):
        d["forbidden"] = d["forbidden"] + [str(x)[:80] for x in extra if str(x).strip()][:12]
    notes = ov.get("notes")
    d["user_notes"] = str(notes).strip()[:600] if isinstance(notes, str) else ""
    return d


def list_directions() -> list[dict[str, Any]]:
    """Resumen para la UI (selector con muestras de color y tipografías)."""
    out = []
    for d in _DIRECTIONS:
        t = d["typography"]
        out.append({
            "key": d["key"], "label": d["label"], "group": d["group"], "summary": d["summary"],
            "palette": d["palette"], "fonts": {"display": F[t["display"]], "body": F[t["body"]]},
            "font_families": font_families(d), "keywords": d["keywords"],
            "materials": d["materials_use"][:6], "motion": d["motion_feel"],
            "forbidden": d["forbidden"], "engine": d["engine"],
        })
    return out


def font_families(d: dict[str, Any]) -> list[str]:
    t = d["typography"]
    keys = [t.get("display"), t.get("body"), t.get("hand"), t.get("accent_font")]
    fams: list[str] = []
    for k in keys:
        fam = FONT_FAMILIES.get(k or "")
        if fam and fam not in fams:
            fams.append(fam)
    return fams


def theme_tokens(d: dict[str, Any]) -> dict[str, Any]:
    """Tokens compatibles con ``themes`` (para ctx.theme y plantillas)."""
    p, t = d["palette"], d["typography"]
    return {
        "label": d["label"], "bg": p["bg"], "surface": p["surface"], "text": p["ink"],
        "muted": p["secondary"], "accent": p["accent"], "accent_text": p["surface"],
        "border": p["extra"][0] if p.get("extra") else p["secondary"], "shadow": "none",
        "font_display": F[t["display"]], "font_body": F[t["body"]],
        "font_hand": F[t["hand"]] if t.get("hand") else F[t["body"]], "radius": 2,
    }


def stick_palette(d: dict[str, Any]) -> dict[str, str]:
    """Paleta para que el stickman viva en el mundo de la dirección (stick.js style.palette)."""
    p = d["palette"]
    return {
        "bg": p["bg"], "ink": p["ink"], "accent": p["accent"], "impact": p["accent"],
        "env": p["secondary"], "envFill": p["surface"],
        "floor": p["extra"][0] if p.get("extra") else p["secondary"], "glass": p["surface"],
        "cap": {"surface": p["surface"], "border": p["secondary"], "text": p["ink"]},
    }


def _is_dark(hexv: str) -> bool:
    h = hexv.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return False
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128


# --- CREATIVE DIRECTION LOCK (prompt) ------------------------------------------

def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {x}" for x in items if x)


def compile_lock(d: dict[str, Any]) -> str:
    """Bloque de dirección artística bloqueada para inyectar en el prompt."""
    p, t = d["palette"], d["typography"]
    fonts = [f"display: {F[t['display']]}", f"cuerpo: {F[t['body']]}"]
    if t.get("hand"):
        fonts.append(f"manuscrita: {F[t['hand']]}")
    if t.get("accent_font"):
        fonts.append(f"acento tipográfico: {F[t['accent_font']]}")
    parts = [
        f"CREATIVE DIRECTION LOCK: {d['label'].upper()}",
        "Toda la escena DEBE seguir este lenguaje visual. No es una sugerencia.",
        "IDENTIDAD VISUAL\n" + d["identity"],
        "MATERIALES\nUsa:\n" + _bullets(d["materials_use"]) + "\nEvita:\n"
        + _bullets(d["materials_avoid"] + GLOBAL_FORBIDDEN[:6]),
        "SISTEMA DE COLOR (usa SOLO estos valores)\n"
        f"- fondo: {p['bg']} · superficie: {p['surface']}\n"
        f"- tinta principal: {p['ink']} · secundaria: {p['secondary']}\n"
        f"- acento: {p['accent']} → {d['accent_role']}\n"
        + (f"- apoyo: {', '.join(p.get('extra') or [])}\n" if p.get("extra") else "")
        + "NO uses degradados salvo que el estilo lo pida (ninguno lo pide).",
        "COMPOSICIÓN\n" + d["composition"] + "\nPrefiere:\n" + _bullets(d["composition_prefer"])
        + "\nEvita:\n" + _bullets(d["composition_avoid"] + ["dashboards centrados y simétricos tipo sala de control",
                                                           "tarjetas flotantes", "paneles genéricos"]),
        "TIPOGRAFÍA\n" + d["typography_notes"] + "\n" + _bullets(fonts)
        + "\nEl texto forma parte de la composición, no son etiquetas de UI.",
        "LENGUAJE DE MOVIMIENTO\nLa animación debe sentirse " + d["motion_feel"] + ".\nEjemplos:\n"
        + _bullets(d["motion_examples"]) + "\nEvita:\n" + _bullets(d["motion_avoid"] + GENERIC_MOTION_AVOID),
        "TRANSICIONES\n" + _bullets(d["transitions"]),
        "TEXTURA\n" + d["texture"] + " Las imperfecciones propias del material son intencionadas.",
        "SENSACIÓN GENERAL\nDebe sentirse como:\n" + _bullets(d["feel_is"])
        + "\nNO debe sentirse como:\n" + _bullets(d["feel_not"] + GENERIC_FEEL_NOT),
        "RESTRICCIONES NEGATIVAS DURAS (absolutamente prohibido)\n"
        + ", ".join(GLOBAL_FORBIDDEN + d["forbidden"]),
        "REGLA CREATIVA\n" + d["rule"].capitalize() + ". Debe parecer diseñado por un director de arte con "
        "un punto de vista concreto, no sacado de una plantilla genérica de motion graphics 'cool futurista'.",
        "TEST DE DIRECCIÓN DE ARTE\n" + d["test"],
    ]
    if d.get("user_notes"):
        parts.append("NOTAS DEL USUARIO SOBRE EL ESTILO (prioritarias)\n" + d["user_notes"])
    return "\n\n".join(parts)


# --- Kit CSS (texturas deterministas + utilidades) ------------------------------

def _svg_uri(svg: str) -> str:
    return "url(\"data:image/svg+xml;utf8," + quote(svg, safe="=:/ ,;'()") + "\")"


def _grain(opacity: float, freq: float = 0.9, seed: int = 7) -> str:
    return _svg_uri(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'>"
        f"<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='{freq}' numOctaves='3' "
        f"seed='{seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  "
        f"0 0 0 {opacity} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")


def _backdrop_css(kind: str, p: dict[str, str]) -> str:
    bg, ink, sec = p["bg"], p["ink"], p["secondary"]
    extra = (p.get("extra") or [sec])[0]
    grain = _grain(0.07)
    if kind == "paper_grid":
        return (f"background-color:{bg};background-image:{grain},"
                f"linear-gradient(rgba(60,50,40,.07) 1px,transparent 1px),"
                f"linear-gradient(90deg,rgba(60,50,40,.07) 1px,transparent 1px);"
                "background-size:320px 320px,calc(var(--u)*5.2) calc(var(--u)*5.2),calc(var(--u)*5.2) calc(var(--u)*5.2);")
    if kind == "blueprint":
        return (f"background-color:{bg};background-image:{_grain(0.10)},"
                "linear-gradient(rgba(255,255,255,.14) 2px,transparent 2px),"
                "linear-gradient(90deg,rgba(255,255,255,.14) 2px,transparent 2px),"
                "linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),"
                "linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);"
                "background-size:320px 320px,calc(var(--u)*20) calc(var(--u)*20),calc(var(--u)*20) calc(var(--u)*20),"
                "calc(var(--u)*4) calc(var(--u)*4),calc(var(--u)*4) calc(var(--u)*4);")
    if kind == "newsprint":
        return (f"background-color:{bg};background-image:{_grain(0.09)},"
                "radial-gradient(rgba(0,0,0,.05) 1px,transparent 1.3px);"
                "background-size:320px 320px,6px 6px;")
    if kind == "cork":
        return (f"background-color:{bg};background-image:{_grain(0.22, 0.65, 11)},{_grain(0.12, 1.6, 3)};"
                "background-size:320px 320px,200px 200px;")
    if kind == "film":
        return (f"background-color:{bg};background-image:radial-gradient(ellipse at center,transparent 55%,rgba(40,25,10,.28) 100%),"
                f"{_grain(0.14, 1.1, 5)};background-size:100% 100%,320px 320px;")
    if kind == "documentary":
        return (f"background-color:{bg};background-image:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.45) 100%),"
                f"{_grain(0.10, 1.2, 9)};background-size:100% 100%,320px 320px;")
    if kind == "whiteboard":
        return (f"background-color:{bg};background-image:radial-gradient(ellipse at 20% 30%,rgba(120,130,140,.07),transparent 40%),"
                f"radial-gradient(ellipse at 75% 70%,rgba(120,130,140,.05),transparent 45%),{_grain(0.03)};"
                "background-size:100% 100%,100% 100%,320px 320px;")
    if kind in ("swiss", "clean", "manual"):
        return f"background-color:{bg};"
    if kind == "rice":
        return (f"background-color:{bg};background-image:{_grain(0.08, 0.55, 13)},{_grain(0.05, 1.4, 2)};"
                "background-size:320px 320px,240px 240px;")
    if kind == "collage":
        return (f"background-color:{bg};background-image:{_grain(0.11, 0.7, 4)};background-size:320px 320px;")
    if kind == "poster":
        return (f"background-color:{bg};background-image:radial-gradient(ellipse at center,transparent 60%,rgba(80,50,20,.18) 100%),"
                f"{_grain(0.12, 0.95, 6)};background-size:100% 100%,320px 320px;")
    # paper_plain / ivory
    return f"background-color:{bg};background-image:{grain};background-size:320px 320px;"


def kit_css(d: dict[str, Any], width: int, height: int) -> str:
    """CSS del kit de la dirección: variables, fondo, utilidades ``.sc-*``."""
    p, t = d["palette"], d["typography"]
    u = min(width, height) / 100.0   # 1 --u = 1% del lado corto
    hand = F[t["hand"]] if t.get("hand") else F[t["body"]]
    acc_font = F[t.get("accent_font") or t["display"]]
    eng = d["engine"]
    dark = _is_dark(p["bg"])
    paper_shadow = "0 2px 0 rgba(0,0,0,.08), 0 10px 18px -12px rgba(0,0,0,.35)"
    return f"""
:root{{--u:{u:.3f}px;--sc-bg:{p['bg']};--sc-surface:{p['surface']};--sc-ink:{p['ink']};
--sc-secondary:{p['secondary']};--sc-accent:{p['accent']};--sc-extra:{(p.get('extra') or [p['secondary']])[0]};
--sc-font-display:{F[t['display']]};--sc-font-body:{F[t['body']]};--sc-font-hand:{hand};--sc-font-accent:{acc_font};}}
.sc-backdrop{{position:absolute;inset:0;{_backdrop_css(eng['backdrop'], p)}}}
.sc-scene{{position:absolute;inset:0;color:var(--sc-ink);font-family:var(--sc-font-body);}}
.sc-display{{font-family:var(--sc-font-display);color:var(--sc-ink);line-height:1.02;letter-spacing:-0.01em;}}
.sc-body{{font-family:var(--sc-font-body);color:var(--sc-ink);line-height:1.3;}}
.sc-hand{{font-family:var(--sc-font-hand);color:var(--sc-ink);line-height:1.1;}}
.sc-label{{font-family:var(--sc-font-accent);color:var(--sc-secondary);font-size:calc(var(--u)*3.4);letter-spacing:.08em;text-transform:uppercase;}}
.sc-accent{{color:var(--sc-accent);}}
.sc-rule{{height:max(2px,calc(var(--u)*.3));background:var(--sc-ink);transform-origin:0 50%;}}
.sc-card{{position:absolute;background:var(--sc-surface);color:var(--sc-ink);padding:calc(var(--u)*3);
{"border:1px solid rgba(255,255,255,.18);" if dark else "box-shadow:" + paper_shadow + ";"}}}
.sc-highlight{{background:linear-gradient(transparent 55%, color-mix(in srgb, var(--sc-accent) 70%, transparent) 55%, color-mix(in srgb, var(--sc-accent) 70%, transparent) 92%, transparent 92%);padding:0 .12em;}}
.sc-tape{{position:absolute;width:calc(var(--u)*14);height:calc(var(--u)*4.2);background:rgba(235,225,190,.72);
box-shadow:0 1px 2px rgba(0,0,0,.12);}}
.sc-rough{{filter:url(#sc-rough);}}
.sc-stroke{{fill:none;stroke:var(--sc-ink);stroke-linecap:round;stroke-linejoin:round;}}
.sc-img{{position:absolute;overflow:hidden;}}
.sc-img > img{{display:block;width:100%;height:100%;object-fit:cover;}}
"""


ROUGH_SVG_DEFS = (
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    '<filter id="sc-rough" x="-5%" y="-5%" width="110%" height="110%">'
    '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="t"/>'
    '<feDisplacementMap in="SourceGraphic" in2="t" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>'
    '</filter></defs></svg>'
)


def kit_reference(d: dict[str, Any]) -> str:
    """Resumen del kit para el prompt del bloque (qué clases/variables existen)."""
    return (
        "KIT DE LA DIRECCIÓN (ya cargado en la página; ÚSALO):\n"
        "- Variables CSS: --u (1% del lado corto del lienzo, úsalo para TODOS los tamaños: "
        "font-size:calc(var(--u)*9)), --sc-bg --sc-surface --sc-ink --sc-secondary --sc-accent --sc-extra, "
        "--sc-font-display --sc-font-body --sc-font-hand --sc-font-accent.\n"
        "- Clases: .sc-scene (contenedor a pantalla completa), .sc-display (titular), .sc-body, .sc-hand "
        "(manuscrita), .sc-label (antetítulo/etiqueta), .sc-accent (color acento), .sc-rule (filete; anima "
        "scaleX), .sc-card (pieza/papel con sombra física, position:absolute), .sc-highlight (subrayador "
        "detrás del texto), .sc-tape (tira de cinta adhesiva, position:absolute), .sc-rough (trazo imperfecto "
        "para SVG o bordes), .sc-stroke (trazo SVG en tinta: anima stroke-dashoffset para dibujar), "
        ".sc-img (marco de imagen con <img> dentro).\n"
        f"- El fondo de la dirección ({d['engine']['backdrop']}) ya está pintado debajo: NO pintes otro "
        "fondo a pantalla completa salvo que el beat lo exija."
    )


def scene_font_link(families: list[str]) -> str:
    if not families:
        return ""
    q = "&".join(f"family={f}" for f in families)
    return f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{q}&display=block">'
