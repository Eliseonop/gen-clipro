"""Biblioteca de plantillas VISUALES + selector de recursos ("Generar recurso").

Cubre lo que tiene que aguantar la capa: toda plantilla instancia y valida con
parámetros vacíos y con contenido de la IA, los PNG del material acaban dentro
del markup, y el selector nunca deja pasar una plantilla inventada.
"""
import unittest

from app.motion import resource_ai
from app.motion import templates as motion_templates
from app.motion.generator import generate_html
from app.motion.templates import base, visual
from app.motion.validator import validate

# stick_scene necesita un storyboard aparte (tiene su propia suite).
KEYS = [r["key"] for r in motion_templates.list_templates() if r["key"] != "stick_scene"]
VISUAL_KEYS = [t.key for t in visual.TEMPLATES]


class TemplateLibraryTest(unittest.TestCase):
    def test_todas_instancian_y_validan_sin_params(self):
        for key in KEYS:
            with self.subTest(key=key):
                comp = motion_templates.instantiate(key, f"c_{key}", {})
                self.assertEqual(validate(comp), [], f"{key} no valida")
                self.assertTrue(comp.layers, f"{key} sin capas")

    def test_todas_compilan_a_html(self):
        for key in KEYS:
            with self.subTest(key=key):
                html = generate_html(motion_templates.instantiate(key, "c", {}))
                self.assertIn("__COMP", html)

    def test_formato_vertical_del_proyecto(self):
        for key in VISUAL_KEYS:
            with self.subTest(key=key):
                comp = motion_templates.instantiate(key, "c", {"width": 720, "height": 1280})
                self.assertEqual((comp.width, comp.height), (720, 1280))
                # La capa html llena el lienzo desde arriba-izquierda: centrarla
                # empujaría el contenido fuera de cuadro.
                layer = comp.layers[0]
                self.assertEqual((layer.x, layer.y), (0, 0))
                self.assertEqual((layer.width, layer.height), (720, 1280))

    def test_bloques_js_sin_from_ni_indeterminismo(self):
        """tl.from() rompe el rebobinado del preview; random/Date rompen el render."""
        for key in KEYS:
            comp = motion_templates.instantiate(key, "c", {})
            for layer in comp.layers:
                js = layer.js or ""
                with self.subTest(key=key):
                    self.assertNotIn("tl.from(", js)
                    self.assertNotIn("Math.random", js)
                    self.assertNotIn("Date.now", js)
                    self.assertNotIn("<script", (layer.html or "").lower())

    def test_catalogo_para_la_ia_trae_pistas_de_seleccion(self):
        rows = {r["key"]: r for r in motion_templates.catalog()}
        for key in VISUAL_KEYS:
            with self.subTest(key=key):
                self.assertTrue(rows[key]["best_for"], f"{key} sin best_for")
                self.assertTrue(rows[key]["tags"], f"{key} sin tags")
        # El catálogo compacto no arrastra el JSON de parámetros por defecto.
        self.assertNotIn("parameters", rows["stack_list"])

    def test_catalogo_visual_only(self):
        keys = {r["key"] for r in motion_templates.catalog(visual_only=True)}
        self.assertEqual(keys, set(VISUAL_KEYS))
        self.assertNotIn("subscribe", keys)

    def test_template_desconocido(self):
        self.assertIsNone(motion_templates.get("no_existe"))
        with self.assertRaises(KeyError):
            motion_templates.instantiate("no_existe", "c", {})


class ContentInjectionTest(unittest.TestCase):
    """§12: la plantilla recibe contenido dinámico y decide cómo presentarlo."""

    def test_items_con_png_del_material(self):
        comp = motion_templates.instantiate("stack_list", "c", {
            "items": [{"label": "ChatGPT", "image": "img_7"},
                      {"label": "Claude", "image": "asset:image/img_9"}],
        })
        html = comp.layers[0].html
        # El id suelto se normaliza a la referencia que el generador sustituye.
        self.assertIn("asset:image/img_7", html)
        self.assertIn("asset:image/img_9", html)
        self.assertIn("ChatGPT", html)

    def test_item_sin_imagen_usa_monograma_no_un_logo_falso(self):
        comp = motion_templates.instantiate("stack_list", "c", {"items": [{"label": "Gemini"}]})
        html = comp.layers[0].html
        self.assertIn("is-mono", html)
        self.assertIn("<b>G</b>", html)
        self.assertNotIn("<img", html)

    def test_items_admite_lista_de_strings(self):
        comp = motion_templates.instantiate("card_grid", "c", {"items": ["Uno", "Dos", "Tres"]})
        html = comp.layers[0].html
        for t in ("Uno", "Dos", "Tres"):
            self.assertIn(t, html)

    def test_contenido_se_escapa(self):
        comp = motion_templates.instantiate("stack_list", "c",
                                            {"items": [{"label": "<script>x</script>"}]})
        self.assertNotIn("<script>", comp.layers[0].html)
        self.assertIn("&lt;script&gt;", comp.layers[0].html)
        self.assertEqual(validate(comp), [])

    def test_items_vacios_caen_al_ejemplo(self):
        """Un params={} de la IA no puede reventar la plantilla."""
        for key in VISUAL_KEYS:
            with self.subTest(key=key):
                comp = motion_templates.instantiate(key, "c", {"items": [], "steps": [],
                                                               "events": [], "data": []})
                self.assertEqual(validate(comp), [])

    def test_timeline_recibe_fechas(self):
        comp = motion_templates.instantiate("timeline_track", "c", {
            "events": [{"label": "1822", "sublabel": "Navier"},
                       {"label": "1845", "sublabel": "Stokes"}]})
        html = comp.layers[0].html
        self.assertIn("1822", html)
        self.assertIn("Stokes", html)

    def test_line_graph_calcula_el_trazo(self):
        comp = motion_templates.instantiate("line_graph", "c", {
            "data": [{"label": "a", "value": 10}, {"label": "b", "value": 90}], "unit": "%"})
        html = comp.layers[0].html
        self.assertIn('class="lg-line"', html)
        self.assertIn('data-value="90"', html)

    def test_tema_oscuro_disponible_y_claro_por_defecto(self):
        claro = motion_templates.instantiate("stack_list", "c", {})
        oscuro = motion_templates.instantiate("stack_list", "c", {"theme": "dark"})
        self.assertEqual(claro.metadata["theme"]["bg"], "#f8fafc")
        self.assertEqual(oscuro.metadata["theme"]["bg"], "#0f172a")
        # Ninguno de los dos recurre a neón/glow.
        self.assertNotIn("glow", (oscuro.layers[0].css or "").lower())

    def test_acento_del_proyecto_manda(self):
        comp = motion_templates.instantiate("versus", "c", {"accent": "#ff7a1a"})
        self.assertIn("#ff7a1a", comp.layers[0].css)

    def test_acento_claro_se_lee_sobre_tarjeta_clara(self):
        """En vivo: el acento del proyecto era el amarillo de los subtítulos
        (#ffe566) y el texto en acento no se leía sobre blanco."""
        from app.motion import themes
        th = themes.resolve_theme("light", accent="#ffe566")
        self.assertEqual(th["accent"], "#ffe566")                   # los rellenos lo conservan
        self.assertGreaterEqual(themes.contrast(th["accent_ink"], th["surface"]), 3.0)
        self.assertEqual(th["accent_text"], "#0f172a")              # texto oscuro SOBRE amarillo
        css = motion_templates.instantiate("stack_list", "c", {
            "accent": "#ffe566", "kicker": "K"}).layers[0].css
        self.assertIn(f"color:{th['accent_ink']}", css)

    def test_acento_por_defecto_no_cambia(self):
        from app.motion import themes
        for name in ("light", "dark", "editorial"):
            th = themes.resolve_theme(name)
            with self.subTest(theme=name):
                self.assertEqual(th["accent_ink"], th["accent"])
                self.assertEqual(th["accent_text"], themes.THEMES[name]["accent_text"])

    def test_overlay_transparente_no_pinta_fondo(self):
        comp = motion_templates.instantiate("annotate", "c", {})
        self.assertEqual(comp.background, "transparent")


class ItemsNormalizationTest(unittest.TestCase):
    def test_claves_alternativas(self):
        rows = base.items_of([{"text": "A", "sub": "a", "asset_id": "img1"},
                              {"name": "B", "caption": "b"}])
        self.assertEqual(rows[0]["label"], "A")
        self.assertEqual(rows[0]["sublabel"], "a")
        self.assertEqual(rows[0]["image"], "img1")
        self.assertEqual(rows[1]["label"], "B")

    def test_descarta_basura_y_respeta_el_limite(self):
        rows = base.items_of(["A", 3, None, {"nada": 1}, "B", "C"], limit=2)
        self.assertEqual([r["label"] for r in rows], ["A", "B"])

    def test_fallback_tambien_se_normaliza(self):
        """Si el fallback no pasara por aquí, una plantilla reventaría al leer
        'sublabel' de un dict incompleto."""
        rows = base.items_of(None, fallback=[{"label": "X"}])
        self.assertEqual(rows[0]["sublabel"], "")
        self.assertEqual(rows[0]["image"], "")
        self.assertIn("value", rows[0])

    def test_img_src(self):
        self.assertEqual(base.img_src("img_1"), "asset:image/img_1")
        self.assertEqual(base.img_src("asset:image/x"), "asset:image/x")
        self.assertEqual(base.img_src("https://a/b.png"), "https://a/b.png")
        self.assertEqual(base.img_src("data:image/png;base64,AA"), "data:image/png;base64,AA")
        self.assertEqual(base.img_src(None), "")


def _ctx(current="", *, previous="", terms=None, images=(), elements=()):
    return {
        "selection": {"start": 10.0, "end": 15.0, "duration": 5.0},
        "scriptContext": {"previous": previous, "current": current, "next": "",
                          "keyTerms": list(terms or [])},
        "timelineContext": {"existingElements": list(elements), "motionInRange": []},
        "availableAssets": list(images),
        "style": {"format": {"width": 720, "height": 1280, "fps": 30}},
    }


class HeuristicSuggestionTest(unittest.TestCase):
    """Las sugerencias por señales del guion: el modal nunca aparece vacío."""

    def _templates(self, ctx):
        return [s["template"] for s in resource_ai.heuristic_suggestions(ctx)]

    def test_fechas_proponen_timeline(self):
        ctx = _ctx("En 1822 Navier empezó, y en 1845 Stokes lo completó.")
        sug = resource_ai.heuristic_suggestions(ctx)
        timeline = next(s for s in sug if s["template"] == "timeline_track")
        labels = [e["label"] for e in timeline["params"]["events"]]
        self.assertEqual(labels, ["1822", "1845"])

    def test_comparacion_propone_versus_con_nombres_propios(self):
        ctx = _ctx("La idea de Navier frente a la de Stokes.")
        sug = resource_ai.heuristic_suggestions(ctx)
        vs = next(s for s in sug if s["template"] == "versus")
        self.assertEqual(vs["params"]["left"]["label"], "Navier")
        self.assertEqual(vs["params"]["right"]["label"], "Stokes")
        self.assertEqual(vs["label"], "Navier frente a Stokes")

    def test_palabras_sueltas_no_son_contenido(self):
        """Regresión con guion real: los keyTerms son palabras largas, no entidades.
        Antes salía «realmente vs siente» y una lista con «ocurre»."""
        ctx = _ctx("¿cómo sabes que realmente lo siente? Con ChatGPT ocurre",
                   terms=["realmente", "siente", "ChatGPT", "ocurre"],
                   elements=[{"id": "v", "kind": "video", "name": "trailer"}])
        sug = resource_ai.heuristic_suggestions(ctx)
        templates = [s["template"] for s in sug]
        self.assertNotIn("versus", templates)
        self.assertNotIn("stack_list", templates)
        blob = repr([s["params"] for s in sug])
        for junk in ("realmente", "siente", "ocurre"):
            self.assertNotIn(junk, blob)
        ann = next(s for s in sug if s["template"] == "annotate")
        self.assertEqual(ann["params"]["label"], "ChatGPT")

    def test_enumeracion_de_nombres_propone_pila_con_sus_imagenes(self):
        imgs = [{"kind": "image", "id": "img_claude", "label": "Logo de Claude"}]
        ctx = _ctx("Hoy compiten ChatGPT, Claude, Gemini y Grok.", images=imgs)
        stack = next(s for s in resource_ai.heuristic_suggestions(ctx)
                     if s["template"] == "stack_list")
        labels = [i["label"] for i in stack["params"]["items"]]
        self.assertEqual(labels, ["ChatGPT", "Claude", "Gemini", "Grok"])
        self.assertEqual(stack["params"]["items"][1]["image"], "img_claude")
        self.assertTrue(stack["strong"])

    def test_proceso_propone_flujo(self):
        self.assertIn("flow_steps", self._templates(_ctx("Primero se mide, luego se calcula.")))

    def test_porcentaje_propone_cifra(self):
        sug = resource_ai.heuristic_suggestions(_ctx("Creció un 87% en un año."))
        stat = next(s for s in sug if s["template"] == "stat")
        self.assertEqual(stat["params"]["value"], 87.0)
        self.assertEqual(stat["label"], "Cifra: 87%")

    def test_imagenes_relacionadas_proponen_showcase(self):
        imgs = [{"kind": "image", "id": "img_1", "label": "Navier", "match": 1}]
        sug = resource_ai.heuristic_suggestions(_ctx("Navier", images=imgs))
        show = next(s for s in sug if s["template"] == "asset_showcase")
        self.assertEqual(show["params"]["items"][0]["image"], "img_1")

    def test_video_en_pantalla_propone_anotacion(self):
        els = [{"id": "c1", "kind": "video", "name": "toma.mp4"}]
        self.assertIn("annotate", self._templates(_ctx("Mira esto", elements=els)))

    def test_sin_senales_no_inventa_relleno(self):
        """Sin guion ni nombres no hay nada que proponer con contenido real: mejor
        una lista vacía (el modal ofrece tipos y texto libre) que «Idea A, Idea B»."""
        self.assertEqual(resource_ai.heuristic_suggestions(_ctx("")), [])
        one_name = resource_ai.heuristic_suggestions(_ctx("hablamos de Ava"))
        self.assertNotIn("concept_map", [s["template"] for s in one_name])

    def test_mapa_conceptual_solo_con_nombres_reales(self):
        sug = resource_ai.heuristic_suggestions(_ctx("hoy hablamos de Navier, Stokes y Euler"))
        cmap = next(s for s in sug if s["template"] == "concept_map")
        self.assertEqual(cmap["params"]["center"], "Navier")
        self.assertEqual([i["label"] for i in cmap["params"]["items"]], ["Stokes", "Euler"])

    def test_propuestas_bien_formadas(self):
        ctx = _ctx("En 1822 y 1845 Navier, Stokes y Euler", elements=[{"id": "v", "kind": "video"}])
        sug = resource_ai.heuristic_suggestions(ctx)
        self.assertTrue(sug)
        for s in sug:
            self.assertIsNotNone(motion_templates.get(s["template"]))
            self.assertTrue(s["id"] and s["label"])

    def test_las_propuestas_se_pueden_construir(self):
        """Lo que sugiere la heurística tiene que instanciar de verdad."""
        ctx = _ctx("En 1822 la idea de Navier frente a Stokes creció un 87%. Primero mide, luego calcula.",
                   terms=["Navier", "Stokes", "presión"],
                   images=[{"kind": "image", "id": "img_1", "label": "Navier", "match": 1}],
                   elements=[{"id": "c1", "kind": "video", "name": "toma.mp4"}])
        for s in resource_ai.heuristic_suggestions(ctx):
            with self.subTest(template=s["template"]):
                comp = motion_templates.instantiate(s["template"], "c", s["params"])
                self.assertEqual(validate(comp), [])


class EntitiesTest(unittest.TestCase):
    def test_nombres_marcas_y_siglas(self):
        self.assertEqual(
            resource_ai.entities("En 1822 Navier empezó y Stokes siguió. La IA de OpenAI compite."),
            ["Navier", "Stokes", "IA", "OpenAI"])

    def test_inicio_de_frase_no_es_nombre_salvo_mayusculas_internas(self):
        self.assertEqual(resource_ai.entities("Intenta descubrir si Ava piensa"), ["Ava"])
        self.assertEqual(resource_ai.entities("ChatGPT responde. iPhone también"),
                         ["ChatGPT", "iPhone"])

    def test_sin_repetidos_y_con_limite(self):
        self.assertEqual(resource_ai.entities("ya ves: Ana y Ana y Luis y Eva", limit=2),
                         ["Ana", "Luis"])
        self.assertEqual(resource_ai.entities(""), [])


class SuggestStreamTest(unittest.TestCase):
    """El stream: seed inmediato, y tras la IA solo sobreviven las heurísticas fuertes."""

    def _run(self, reply: str | None, ctx: dict) -> list[dict]:
        import asyncio
        from unittest import mock

        class FakeProvider:
            def unavailable_reason(self):
                return None if reply is not None else "Sin proveedor configurado."

            async def run(self, *, emit, **_):
                await emit({"type": "text", "delta": reply})

        with mock.patch.object(resource_ai, "get_provider", return_value=FakeProvider()):
            async def collect():
                return [ev async for ev in resource_ai.suggest_stream("p", ctx=ctx)]
            return asyncio.run(collect())

    def test_sin_proveedor_quedan_las_heuristicas(self):
        evs = self._run(None, _ctx("En 1822 y en 1845."))
        self.assertEqual([e["type"] for e in evs], ["start", "seed", "suggestions", "done"])
        final = evs[2]
        self.assertIn("proveedor", final["degraded"])
        self.assertEqual(final["suggestions"][0]["template"], "timeline_track")

    def test_la_ia_va_primero_y_solo_se_suman_heuristicas_fuertes(self):
        reply = ('{"suggestions": [{"label": "Mapa de ideas", "template": "concept_map", '
                 '"params": {"center": "Conciencia"}, "why": "relaciona"}]}')
        ctx = _ctx("En 1822 y 1845 se discutió.",
                   elements=[{"id": "v", "kind": "video", "name": "trailer"}])
        final = next(e for e in self._run(reply, ctx) if e["type"] == "suggestions")
        rows = final["suggestions"]
        self.assertEqual(rows[0]["source"], "ai")
        self.assertEqual(rows[0]["template"], "concept_map")
        extra = [r["template"] for r in rows[1:]]
        self.assertIn("timeline_track", extra)     # fuerte: hay dos años
        self.assertNotIn("annotate", extra)        # débil: no se añade tras la IA
        self.assertNotIn("degraded", final)

    def test_proveedor_colgado_no_bloquea_el_modal(self):
        """Visto en vivo: OpenRouter respondió 200 y el stream no terminó nunca."""
        import asyncio
        from unittest import mock

        class HungProvider:
            def unavailable_reason(self):
                return None

            async def run(self, **_):
                await asyncio.sleep(30)

        async def collect():
            return [ev async for ev in resource_ai.suggest_stream("p", ctx=_ctx("En 1822 y 1845."))]

        with mock.patch.object(resource_ai, "get_provider", return_value=HungProvider()), \
                mock.patch.object(resource_ai, "AI_TIMEOUT", 0.05):
            evs = asyncio.run(collect())
        final = next(e for e in evs if e["type"] == "suggestions")
        self.assertIn("tardó", final["degraded"])
        self.assertEqual(final["suggestions"][0]["template"], "timeline_track")
        self.assertEqual(evs[-1]["type"], "done")

    def test_respuesta_rota_cae_a_heuristicas(self):
        final = next(e for e in self._run("no es json", _ctx("En 1822 y 1845."))
                     if e["type"] == "suggestions")
        self.assertIn("degraded", final)
        self.assertEqual(final["suggestions"][0]["source"], "heuristic")


class NormalizeSuggestionsTest(unittest.TestCase):
    def test_descarta_plantillas_inventadas(self):
        raw = {"suggestions": [{"label": "X", "template": "no_existe", "params": {}},
                               {"label": "Y", "template": "versus", "params": {}}]}
        rows = resource_ai.normalize_suggestions(raw, _ctx())
        self.assertEqual([r["template"] for r in rows], ["versus"])

    def test_sin_plantilla_necesita_concepto(self):
        raw = {"suggestions": [{"label": "Vacía", "template": None},
                               {"label": "Libre", "template": None, "concept": "dibuja X"}]}
        rows = resource_ai.normalize_suggestions(raw, _ctx())
        self.assertEqual([r["label"] for r in rows], ["Libre"])
        self.assertEqual(rows[0]["concept"], "dibuja X")

    def test_fuerza_duracion_y_acento_del_tramo(self):
        ctx = _ctx()
        ctx["style"]["accent"] = "#ff7a1a"
        rows = resource_ai.normalize_suggestions(
            {"suggestions": [{"label": "A", "template": "versus", "params": {}}]}, ctx)
        self.assertEqual(rows[0]["params"]["duration"], 5.0)
        self.assertEqual(rows[0]["params"]["accent"], "#ff7a1a")

    def test_no_pisa_la_duracion_que_pide_la_ia(self):
        rows = resource_ai.normalize_suggestions(
            {"suggestions": [{"label": "A", "template": "versus", "params": {"duration": 3}}]}, _ctx())
        self.assertEqual(rows[0]["params"]["duration"], 3)

    def test_etiqueta_por_defecto_y_kind(self):
        rows = resource_ai.normalize_suggestions(
            {"suggestions": [{"template": "timeline_track", "params": {}}]}, _ctx())
        self.assertEqual(rows[0]["label"], "Timeline histórico")
        self.assertEqual(rows[0]["kind"], "timeline")

    def test_ids_de_imagen_saneados(self):
        """Regresión en vivo: el modelo copió el prefijo del prompt ("id=…").
        Un id que no existe en el material sería una imagen rota → se vacía."""
        ctx = _ctx(images=[{"kind": "image", "id": "e959", "label": "Ava"},
                           {"kind": "image", "id": "f12b", "label": "Caleb"}])
        raw = {"suggestions": [{"label": "X", "template": "versus", "params": {
            "left": {"label": "Ava", "image": "id=e959"},
            "right": {"label": "Caleb", "image": "asset:image/f12b"},
            "items": [{"label": "Inventada", "image": "no_existe"},
                      {"label": "Bien", "image": "e959"}]}}]}
        params = resource_ai.normalize_suggestions(raw, ctx)[0]["params"]
        self.assertEqual(params["left"]["image"], "e959")
        self.assertEqual(params["right"]["image"], "f12b")
        self.assertEqual(params["items"][0]["image"], "")
        self.assertEqual(params["items"][1]["image"], "e959")

    def test_id_colado_en_un_texto_no_se_muestra(self):
        ctx = _ctx(images=[{"kind": "image", "id": "e959", "label": "Ava"}])
        raw = {"suggestions": [{"label": "X", "template": "versus", "params": {
            "left": {"label": "Ava", "sublabel": "e959", "image": "e959"}}}]}
        left = resource_ai.normalize_suggestions(raw, ctx)[0]["params"]["left"]
        self.assertEqual(left["sublabel"], "")
        self.assertEqual(left["image"], "e959")
        self.assertEqual(left["label"], "Ava")

    def test_idioma_del_guion_va_al_final_del_prompt(self):
        es = resource_ai._user_prompt(_ctx("¿cómo sabes que realmente lo siente? Con ChatGPT"), "")
        self.assertIn("en español", es.splitlines()[-2])
        en = resource_ai._user_prompt(_ctx("How do you know that it is real and not a trick?"), "")
        self.assertIn("en inglés", en)
        self.assertEqual(resource_ai.script_language(""), "español")

    def test_recorta_textos_largos_por_palabra(self):
        """En vivo la IA copió la frase entera del guion en una etiqueta."""
        long = "IA dice que tiene miedo, que está triste o que quiere escapar de aquí"
        raw = {"suggestions": [{"label": "X", "template": "before_after", "params": {
            "before": {"label": long, "sublabel": "corto"},
            "title": "Un título que se alarga muchísimo más de la cuenta"}}]}
        params = resource_ai.normalize_suggestions(raw, _ctx())[0]["params"]
        label = params["before"]["label"]
        self.assertLessEqual(len(label), 42)
        self.assertTrue(label.endswith("…"))
        self.assertTrue(long.startswith(label[:-1]))     # corta por palabra, sin inventar
        self.assertEqual(params["before"]["sublabel"], "corto")
        self.assertLessEqual(len(params["title"]), 38)

    def test_si_suelto_no_es_una_bifurcacion(self):
        sug = resource_ai.heuristic_suggestions(_ctx("Caleb intenta descubrir si Ava piensa"))
        self.assertNotIn("decision_tree", [s["template"] for s in sug])
        sug = resource_ai.heuristic_suggestions(_ctx("Todo depende de la presión"))
        self.assertIn("decision_tree", [s["template"] for s in sug])

    def test_basura_no_revienta(self):
        for raw in (None, {}, [], "texto", {"suggestions": "x"}, {"suggestions": [1, None]}):
            self.assertEqual(resource_ai.normalize_suggestions(raw, _ctx()), [])

    def test_kind_conocido_para_cada_plantilla(self):
        """Si una plantilla no tiene kind, el modal la pinta con el icono genérico."""
        for key in VISUAL_KEYS:
            with self.subTest(key=key):
                self.assertNotEqual(resource_ai.kind_of(key), "custom")
                self.assertIn(resource_ai.kind_of(key), resource_ai.KIND_ICONS)


class BuildWithRealAssetsTest(unittest.TestCase):
    """§15 de punta a punta: un PNG del material acaba INCRUSTADO en el recurso.

    Regresión: la vía de plantillas no marcaba ``metadata.project_id`` y el
    generador no podía resolver ``asset:image/<id>`` → imagen rota en el preview
    y en el render.
    """

    def setUp(self):
        import tempfile
        from pathlib import Path

        from app import config, projects, timeline_store
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"

    def tearDown(self):
        import shutil

        from app import config, projects, timeline_store
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _project_with_logo(self):
        from PIL import Image

        from app import projects, storage
        from app.schemas import ImageInfo
        proj = projects.create_project("Recursos")
        base = storage.ensure_dirs(storage.project_base(proj))
        Image.new("RGBA", (64, 64), (16, 163, 127, 255)).save(base / "image" / "chatgpt.png")
        projects.add_image(proj.id, ImageInfo(id="img_gpt", filename="chatgpt.png",
                                              url="/x", label="ChatGPT logo"))
        return proj

    def test_png_del_material_se_incrusta(self):
        from app.motion import service as motion_service
        proj = self._project_with_logo()
        out = resource_ai.build_from_template(
            proj.id, template="stack_list",
            params={"items": [{"label": "ChatGPT", "image": "img_gpt"}, {"label": "Claude"}]},
            for_range={"start": 2.0, "end": 7.0})
        comp = motion_service.get_composition(proj.id, out["composition_id"])
        self.assertEqual(comp.metadata["project_id"], proj.id)
        self.assertTrue(comp.metadata["draft"])
        self.assertEqual(comp.duration, 5.0)
        html = generate_html(comp)
        self.assertIn('"img_gpt": "data:image/png;base64,', html)

    def test_se_maqueta_con_el_formato_del_proyecto(self):
        """Regresión: se instanciaba a 1080x1920 y luego se forzaba 720x1280, con lo
        que la escala interna del lienzo de diseño quedaba mal y el contenido
        salía agrandado y recortado."""
        from app import projects
        from app.motion import service as motion_service
        proj = self._project_with_logo()
        projects.save_timeline(proj.id, {"width": 720, "height": 1280, "fps": 30,
                                         "tracks": [], "clips": []})
        out = resource_ai.build_from_template(proj.id, template="card_grid", params={},
                                              for_range={"start": 0.0, "end": 4.0})
        comp = motion_service.get_composition(proj.id, out["composition_id"])
        self.assertEqual((comp.width, comp.height), (720, 1280))
        css = comp.layers[0].css
        self.assertIn("width:720.00px;height:1280.00px", css)
        self.assertIn("transform:scale(1.00000)", css)

    def test_toda_composicion_guardada_conoce_su_proyecto(self):
        from app.motion import service as motion_service
        proj = self._project_with_logo()
        comp = motion_templates.instantiate("asset_showcase", "mg_manual", {})
        self.assertNotIn("project_id", comp.metadata)
        saved = motion_service.save_composition(proj.id, comp, bump=False)
        self.assertEqual(saved.metadata["project_id"], proj.id)


if __name__ == "__main__":
    unittest.main()
