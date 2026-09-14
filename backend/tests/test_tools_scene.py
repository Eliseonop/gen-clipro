"""Tools MCP de Dirección de escena (envolturas de app/scene_direction.py).

Cubre las envolturas de Fase 1 (leer/dirigir la escaleta y pedir el pack) y la
corrección de la safe-area: ``pack_text`` ahora imprime la ZONA DE SUBTÍTULOS que
antes solo iba en el JSON.
"""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects, scene_direction as sd
from app.mcp_server import tools_scene
from app.mcp_server.registry import MCPError
from app.schemas import ClipInfo, Timeline, TimelineClip, TimelineTrack, Word


class QueueProvider:
    """Proveedor de IA falso: devuelve textos en cola (para Generar Escena)."""
    def __init__(self, texts):
        self.texts = list(texts)

    def unavailable_reason(self):
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        text = self.texts.pop(0) if self.texts else ""
        await emit({"type": "text", "delta": text})
        return text

W, H = 720, 1280
NO_LIBRARY = patch("app.library.list_library", return_value={"clips": [], "audios": [], "images": []})


def caption(cid, start, words, *, y=None):
    ws, t = [], 0.0
    for w in words.split():
        ws.append(Word(text=w, start=round(t, 2), end=round(t + 0.4, 2)))
        t += 0.45
    return TimelineClip(id=cid, track_id="T1", kind="text", asset_kind="text", asset_id="t" + cid,
                        filename="", text=words, words=ws, start=start, in_point=0.0,
                        out_point=round(t, 2), source_duration=round(t, 2), text_role="caption",
                        style=({"y": y} if y is not None else None))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, config.OUTPUT_DIR, projects._FILE)
        config.DATA_DIR = self.tmp
        config.OUTPUT_DIR = self.tmp / "out"
        projects._FILE = self.tmp / "projects.json"
        self.pid = projects.create_project("Marte").id
        NO_LIBRARY.start()
        projects.add_clips(self.pid, [
            ClipInfo(index=5, filename="huerto.mp4", url="/h.mp4", start=0, end=6,
                     label="Huerto", description="Watney planta papas en la cápsula marciana"),
            ClipInfo(index=6, filename="cielo.mp4", url="/c.mp4", start=0, end=3,
                     label="Cielo", description="paneo de estrellas"),
        ])
        projects.save_timeline(self.pid, Timeline(
            width=W, height=H, fps=30,
            tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                    TimelineTrack(id="T1", kind="text", name="T1")],
            clips=[caption("c1", 0.0, "¿Podrías sobrevivir solo en Marte?", y=0.86),
                   caption("c2", 3.0, "Cultiva papas con suelo marciano.", y=0.86)],
        ).model_dump())

    def tearDown(self):
        NO_LIBRARY.stop()
        config.DATA_DIR, config.OUTPUT_DIR, projects._FILE = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)


class SafeAreaTest(Base):
    def test_pack_text_now_prints_canvas_and_subtitle_zone(self):
        seg = sd.normalize_segment({"id": "sd_1", "start": 0.0, "end": 3.0, "mode": "explain"})
        pack = sd.build_pack(projects.get_project(self.pid), seg, {"segments": [seg]})
        # La safe-area estaba en el JSON pero no en el texto: ahora sí.
        self.assertIn("avoidY", pack["style"])
        text = sd.pack_text(pack)
        self.assertIn("LIENZO: 720x1280", text)
        self.assertIn("ZONA DE SUBTÍTULOS", text)

    def test_no_caption_no_zone_but_still_canvas(self):
        projects.save_timeline(self.pid, Timeline(width=W, height=H, fps=30,
                                                  tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                                                  clips=[]).model_dump())
        seg = sd.normalize_segment({"id": "s", "start": 0.0, "end": 3.0})
        text = sd.pack_text(sd.build_pack(projects.get_project(self.pid), seg, {"segments": [seg]}))
        self.assertIn("LIENZO:", text)
        self.assertNotIn("ZONA DE SUBTÍTULOS", text)


def video_clip(cid, asset_id, start, dur, track="V1"):
    return TimelineClip(id=cid, track_id=track, kind="video", asset_kind="clips", asset_id=str(asset_id),
                        filename="m.mp4", start=start, in_point=0.0, out_point=dur, source_duration=dur)


class OccupancyUsageTest(Base):
    def _timeline_with(self, clips):
        projects.save_timeline(self.pid, Timeline(
            width=W, height=H, fps=30,
            tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                    TimelineTrack(id="V2", kind="video", name="V2"),
                    TimelineTrack(id="T1", kind="text", name="T1")],
            clips=[caption("c1", 0.0, "hola marte", y=0.86)] + clips,
        ).model_dump())
        return projects.get_project(self.pid)

    def test_material_usage_maps_ranges(self):
        proj = self._timeline_with([video_clip("v1", 5, 0.0, 3.0), video_clip("v2", 5, 10.0, 2.0, "V2")])
        usage = sd.material_usage(proj)
        self.assertEqual(usage["clips:5"], [{"start": 0.0, "end": 3.0}, {"start": 10.0, "end": 12.0}])

    def test_pack_reports_existing_occupancy_and_used_material(self):
        proj = self._timeline_with([video_clip("v1", 5, 0.0, 3.0)])
        seg = sd.normalize_segment({"id": "s", "start": 1.0, "end": 3.0, "mode": "material",
                                    "materials": [{"kind": "clips", "id": "5"}]})
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        self.assertTrue(pack["timeline"]["existing"])                      # el vídeo ocupa el tramo
        self.assertEqual(pack["materials"][0]["used"], [{"start": 0.0, "end": 3.0}])
        text = sd.pack_text(pack)
        self.assertIn("YA EN LA TIMELINE EN ESTE TRAMO", text)
        self.assertIn("YA USADO", text)

    def test_pack_reports_recent_materials_before_segment(self):
        proj = self._timeline_with([video_clip("v1", 5, 0.0, 3.0)])       # termina en 3
        seg = sd.normalize_segment({"id": "s", "start": 10.0, "end": 13.0})  # 7 s después → reciente
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        self.assertFalse(pack["timeline"]["existing"])                    # nada ocupa [10,13]
        self.assertEqual([r["id"] for r in pack["recent_materials"]], ["5"])
        self.assertAlmostEqual(pack["recent_materials"][0]["ago"], 7.0, places=3)
        text = sd.pack_text(pack)
        self.assertIn("lienzo libre", text)
        self.assertIn("USADO HACE POCO", text)

    def test_far_usage_is_not_recent(self):
        proj = self._timeline_with([video_clip("v1", 5, 0.0, 3.0)])
        seg = sd.normalize_segment({"id": "s", "start": 40.0, "end": 43.0})  # >20 s → no reciente
        pack = sd.build_pack(proj, seg, {"segments": [seg]})
        self.assertEqual(pack["recent_materials"], [])


class SemanticTest(Base):
    def test_normalize_semantic(self):
        n = sd.normalize_semantic({"subjects": "astronauta; Marte", "actions": ["caminar"],
                                   "mood": "  épico ", "visual_priority": "protagonista",
                                   "bogus": 1, "visual_content": "x" * 300})
        self.assertEqual(n["subjects"], ["astronauta", "Marte"])
        self.assertEqual(n["actions"], ["caminar"])
        self.assertEqual(n["mood"], "épico")
        self.assertEqual(n["visual_priority"], "protagonista")
        self.assertNotIn("bogus", n)
        self.assertLessEqual(len(n["visual_content"]), 200)
        self.assertEqual(sd.normalize_semantic("nope"), {})
        self.assertNotIn("visual_priority", sd.normalize_semantic({"visual_priority": "raro"}))

    def test_set_meta_persists_and_ranks(self):
        out = tools_scene.scene_set_material_meta(
            self.pid, "clips", "6",
            {"subjects": ["galaxia", "estrellas"], "suggested_usage": "b-roll", "visual_priority": "fondo"})
        self.assertEqual(out["scope"], "project")
        self.assertEqual(out["semantic"]["subjects"], ["galaxia", "estrellas"])
        cat = sd.material_catalog(projects.get_project(self.pid))
        m6 = next(m for m in cat if m["id"] == "6")
        self.assertEqual(m6["semantic"]["suggested_usage"], "b-roll")
        # 'galaxia' no está en la descripción de clip 6, pero sí en su metadata → gana el ranking.
        self.assertEqual(sd.rank_materials(cat, "galaxia")[0]["id"], "6")

    def test_meta_shows_in_pack_text(self):
        tools_scene.scene_set_material_meta(
            self.pid, "clips", "5", {"suggested_usage": "establishing", "subjects": ["huerto"]})
        seg = sd.normalize_segment({"id": "s", "start": 0.0, "end": 3.0, "mode": "material",
                                    "materials": [{"kind": "clips", "id": "5"}]})
        text = sd.pack_text(sd.build_pack(projects.get_project(self.pid), seg, {"segments": [seg]}))
        self.assertIn("uso: establishing", text)

    def test_tool_errors(self):
        with self.assertRaises(MCPError) as c1:
            tools_scene.scene_set_material_meta(self.pid, "audios", "5", {})
        self.assertEqual(c1.exception.code, "invalid_parameter")
        with self.assertRaises(MCPError) as c2:
            tools_scene.scene_set_material_meta(self.pid, "clips", "999", {"mood": "x"})
        self.assertEqual(c2.exception.code, "resource_not_found")

    def test_library_scope_routes_to_library(self):
        with patch("app.library.set_semantic", return_value={}) as m:
            out = tools_scene.scene_set_material_meta(self.pid, "clips", "lib_1", {"mood": "tenso"}, scope="library")
        m.assert_called_once()
        self.assertEqual(out["scope"], "library")


class EditorialFieldsTest(Base):
    def test_normalize_editorial_fields_and_readiness(self):
        n = sd.normalize_segment({"start": 0, "end": 3, "composition_intent": "  clip de fondo, texto arriba ",
                                  "complexity": 4, "no_visual": 1})
        self.assertEqual(n["composition_intent"], "clip de fondo, texto arriba")
        self.assertEqual(n["complexity"], 4)
        self.assertTrue(n["no_visual"])
        self.assertEqual(n["status"], "ready")            # intención/no_visual → deja de estar vacío
        self.assertIsNone(sd.normalize_segment({"start": 0, "end": 3, "complexity": 9})["complexity"])
        self.assertIsNone(sd.normalize_segment({"start": 0, "end": 3, "complexity": "x"})["complexity"])
        self.assertEqual(sd.normalize_segment({"start": 0, "end": 3, "no_visual": True})["status"], "ready")

    def test_pack_text_shows_plan(self):
        seg = sd.normalize_segment({"id": "s", "start": 0.0, "end": 3.0, "mode": "explain",
                                    "composition_intent": "clip principal + gráfico arriba", "complexity": 3})
        text = sd.pack_text(sd.build_pack(projects.get_project(self.pid), seg, {"segments": [seg]}))
        self.assertIn("INTENCIÓN DE COMPOSICIÓN: clip principal", text)
        self.assertIn("COMPLEJIDAD OBJETIVO: 3/5", text)
        no_vis = sd.normalize_segment({"id": "s2", "start": 3.0, "end": 5.0, "no_visual": True})
        self.assertIn("SIN VISUAL NUEVO",
                      sd.pack_text(sd.build_pack(projects.get_project(self.pid), no_vis, {"segments": [no_vis]})))

    def test_status_reports_plan_and_excludes_no_visual_from_pending(self):
        sd.save(self.pid, {"segments": [
            {"id": "sd_a", "start": 0, "end": 3, "complexity": 5},                    # ready, pendiente
            {"id": "sd_b", "start": 3, "end": 6, "no_visual": True},                  # decidido, no pendiente
        ]})
        st = tools_scene.scene_direction_status(self.pid)
        self.assertEqual(st["counts"]["no_visual"], 1)
        self.assertEqual(st["pending"], ["sd_a"])
        rows = {r["id"]: r for r in st["segments"]}
        self.assertEqual(rows["sd_a"]["complexity"], 5)
        self.assertTrue(rows["sd_b"]["no_visual"])

    def test_update_segment_accepts_editorial_fields(self):
        sd.save(self.pid, {"segments": [{"id": "sd_a", "start": 0, "end": 3}]})
        out = tools_scene.scene_direction_update_segment(
            self.pid, "sd_a", {"composition_intent": "pip a la derecha", "complexity": 2, "no_visual": False})
        seg = out["segments"][0]
        self.assertEqual(seg["composition_intent"], "pip a la derecha")
        self.assertEqual(seg["complexity"], 2)


class CompositionTest(Base):
    def test_normalize_component_variants(self):
        c = sd.normalize_component({"source": "material", "material": {"kind": "clips", "id": 6},
                                    "role": "pip", "source_range": {"in": 1.0, "out": 3.0}, "note": "a la derecha"})
        self.assertEqual(c["material"], {"kind": "clips", "id": "6", "scope": "project"})
        self.assertEqual(c["role"], "pip")
        self.assertEqual(c["source_range"], {"in": 1.0, "out": 3.0})
        self.assertEqual(sd.normalize_component({"source": "motion", "role": "motion_element"})["source"], "motion")
        self.assertIsNone(sd.normalize_component({"source": "material"}))            # sin material
        self.assertIsNone(sd.normalize_component({"role": "pip"}))                   # sin source/material
        self.assertIsNone(sd.normalize_component({"source": "material", "material": {"kind": "clips", "id": 6},
                                                  "role": "raro"})["role"])          # rol inválido → None

    def test_components_in_segment_pack_and_status(self):
        sd.save(self.pid, {"segments": [{"id": "s", "start": 0.0, "end": 3.0, "components": [
            {"source": "material", "material": {"kind": "clips", "id": "5"}, "role": "pip"},
            {"source": "stickman", "role": "side_panel"}]}]})
        seg = sd.load(projects.get_project(self.pid))["segments"][0]
        self.assertEqual(len(seg["components"]), 2)
        pack = sd.build_pack(projects.get_project(self.pid), seg, {"segments": [seg]})
        self.assertEqual(pack["components"][0]["title"], "Huerto")
        text = sd.pack_text(pack)
        self.assertIn("COMPOSICIÓN PLANIFICADA", text)
        self.assertIn("rol: pip", text)
        self.assertTrue(tools_scene.scene_direction_status(self.pid)["segments"][0]["has_components"])

    def test_update_segment_accepts_components(self):
        sd.save(self.pid, {"segments": [{"id": "sd_a", "start": 0, "end": 3}]})
        out = tools_scene.scene_direction_update_segment(self.pid, "sd_a", {"components": [
            {"source": "material", "material": {"kind": "clips", "id": "6"}, "role": "overlay"}]})
        self.assertEqual(out["segments"][0]["components"][0]["role"], "overlay")


class PlaceRoleTest(Base):
    def setUp(self):
        super().setUp()
        sd.save(self.pid, {"segments": [{"id": "sd_m", "start": 0.0, "end": 2.0, "mode": "material",
                                         "materials": [{"kind": "clips", "id": "5"}]}]})

    def _clip(self, out):
        proj = projects.get_project(self.pid)
        return next(c for c in proj.timeline.clips if c.id == out["clip_id"])

    def test_full_default(self):
        out = tools_scene.scene_place_material(self.pid, "sd_m")
        c = self._clip(out)
        self.assertEqual((out["role"], c.layout, c.frame), ("full", "fill", "full"))

    def test_pip_overlay_transform_and_fragment(self):
        out = tools_scene.scene_place_material(self.pid, "sd_m", role="pip", size=0.4, pos="top_right",
                                               source={"in": 0.5, "out": 1.5}, opacity=0.9)
        c = self._clip(out)
        self.assertEqual((out["role"], c.layout), ("pip", "overlay"))
        self.assertAlmostEqual(c.transform["scale"], 0.4, places=3)   # vídeo: fuente≈salida → scale=size
        self.assertAlmostEqual(c.transform["x"], 0.70, places=2)
        self.assertEqual(c.in_point, 0.5)                             # fragmento del origen
        self.assertAlmostEqual(c.opacity, 0.9, places=3)

    def test_bad_role_raises(self):
        with self.assertRaises(MCPError) as ctx:
            tools_scene.scene_place_material(self.pid, "sd_m", role="nope")
        self.assertEqual(ctx.exception.code, "invalid_parameter")


class GenerateSceneTest(Base):
    def _seg(self):
        sd.save(self.pid, {"segments": [{"id": "sd_a", "start": 0.0, "end": 3.0, "mode": "explain"}]})
        return "sd_a"

    def test_directions_catalog(self):
        out = tools_scene.motion_scene_directions(self.pid)
        self.assertTrue(out["directions"])
        self.assertIn("default", out)

    def test_questions_blocking(self):
        did = self._seg()
        with patch("app.motion.scene_ai.get_provider", return_value=QueueProvider(["[]"])):
            out = tools_scene.motion_scene_questions(self.pid, direction_id=did)
        self.assertEqual(out["questions"], [])

    def test_plan_blocking_from_skeleton(self):
        did = self._seg()
        reply = json.dumps({"title": "Marte", "beats": [{"n": 1, "kind": "text", "content": "Hola"}]})
        with patch("app.motion.scene_ai.get_provider", return_value=QueueProvider([reply])):
            out = tools_scene.motion_plan_scene(self.pid, direction_id=did, brief={"structure": "script"})
        self.assertTrue(out["plan"]["beats"])

    def test_provider_unavailable_is_configuration_error(self):
        did = self._seg()

        class Down:
            def unavailable_reason(self):
                return "Falta la API key del proveedor"

        with patch("app.motion.scene_ai.get_provider", return_value=Down()):
            with self.assertRaises(MCPError) as ctx:
                tools_scene.motion_plan_scene(self.pid, direction_id=did)
        self.assertEqual(ctx.exception.code, "configuration_error")

    def test_build_links_direction_and_returns_cid(self):
        did = self._seg()

        async def fake_build(*a, **k):
            yield {"type": "start", "total": 1}
            yield {"type": "created", "composition_id": "mg_x", "version": 1}
            yield {"type": "done"}

        with patch("app.motion.scene_ai.build_stream", side_effect=lambda *a, **k: fake_build()):
            out = tools_scene.motion_build_scene(self.pid, {"beats": [{"kind": "text", "content": "A"}]},
                                                 direction_id=did, brief={"structure": "script"})
        self.assertEqual(out["composition_id"], "mg_x")
        seg = sd.load(projects.get_project(self.pid))["segments"][0]
        self.assertEqual((seg["status"], seg["composition_id"]), ("generated", "mg_x"))

    def test_reuse_reference_without_reference_errors(self):
        sd.save(self.pid, {"segments": [{"id": "sd_x", "start": 0, "end": 2, "mode": "reinforce"}]})
        with self.assertRaises(MCPError):
            tools_scene.scene_reuse_reference(self.pid, "sd_x")


class ValidationTest(Base):
    def _seg_material(self):
        sd.save(self.pid, {"segments": [{"id": "sd_m", "start": 0.0, "end": 2.0, "mode": "material",
                                         "materials": [{"kind": "clips", "id": "5"}]}]})
        return "sd_m"

    def test_full_placement_has_no_issues(self):
        sid = self._seg_material()
        tools_scene.scene_place_material(self.pid, sid, role="full")
        out = tools_scene.scene_validate_segment(self.pid, segment_id=sid)
        self.assertTrue(out["ok"])
        self.assertEqual(out["issues"], [])
        self.assertTrue(out["safe_area"])                       # captions con y → zona protegida

    def test_overlay_in_subtitle_band_is_flagged(self):
        sid = self._seg_material()
        tools_scene.scene_place_material(self.pid, sid, role="pip",
                                         transform={"x": 0.5, "y": 0.86, "scale": 0.4})
        out = tools_scene.scene_validate_segment(self.pid, segment_id=sid)
        self.assertIn("subtitle_collision", {i["type"] for i in out["issues"]})
        self.assertFalse(out["ok"])

    def test_offscreen_is_flagged(self):
        sid = self._seg_material()
        tools_scene.scene_place_material(self.pid, sid, role="pip",
                                         transform={"x": 1.6, "y": 0.3, "scale": 0.3})
        out = tools_scene.scene_validate_segment(self.pid, segment_id=sid)
        self.assertIn("offscreen", {i["type"] for i in out["issues"]})

    def test_empty_range_is_info_only(self):
        out = tools_scene.scene_validate_segment(self.pid, start=30.0, end=33.0)
        self.assertEqual(out["issues"][0]["type"], "empty")
        self.assertTrue(out["ok"])                              # info no invalida

    def test_validate_needs_a_range(self):
        with self.assertRaises(MCPError):
            tools_scene.scene_validate_segment(self.pid)


class RenderFrameTest(Base):
    def _place_full(self):
        sd.save(self.pid, {"segments": [{"id": "sd_m", "start": 0, "end": 2, "mode": "material",
                                         "materials": [{"kind": "clips", "id": "5"}]}]})
        tools_scene.scene_place_material(self.pid, "sd_m", role="full")

    def test_render_frame_returns_image(self):
        self._place_full()
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 32

        def fake_render(project, timeline, out_path, at_time):
            Path(out_path).write_bytes(png)
            return out_path

        with patch("app.compose.render_frame", side_effect=fake_render):
            out = tools_scene.render_timeline_frame(self.pid, 1.0)
        self.assertEqual(out["mime"], "image/png")
        self.assertTrue(out["image_b64"])
        self.assertEqual(out["at_time"], 1.0)

    def test_render_error_maps_to_processing_error(self):
        self._place_full()
        with patch("app.compose.render_frame", side_effect=RuntimeError("ffmpeg boom")):
            with self.assertRaises(MCPError) as ctx:
                tools_scene.render_timeline_frame(self.pid, 1.0)
        self.assertEqual(ctx.exception.code, "processing_error")

    def test_render_empty_timeline_errors(self):
        projects.save_timeline(self.pid, Timeline(width=W, height=H, fps=30,
                                                  tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
                                                  clips=[]).model_dump())
        with self.assertRaises(MCPError) as ctx:
            tools_scene.render_timeline_frame(self.pid, 1.0)
        self.assertEqual(ctx.exception.code, "invalid_parameter")


class ToolsTest(Base):
    def test_get_returns_escaleta_units_modes_materials(self):
        sd.save(self.pid, {"segments": [{"id": "sd_a", "start": 0, "end": 3, "mode": "explain"}]})
        out = tools_scene.scene_direction_get(self.pid)
        self.assertEqual(out["script_source"], "captions")
        self.assertEqual(len(out["segments"]), 1)
        self.assertEqual({m["key"] for m in out["modes"]}, set(sd.MODES))
        self.assertIn("Huerto", [m["title"] for m in out["materials"]])
        self.assertGreater(out["duration"], 0)

    def test_status_counts_and_pending(self):
        sd.save(self.pid, {"segments": [
            {"id": "sd_a", "start": 0, "end": 3, "mode": "explain"},                  # ready
            {"id": "sd_b", "start": 3, "end": 6, "status": "placed"},
        ]})
        st = tools_scene.scene_direction_status(self.pid)
        self.assertEqual(st["counts"]["total"], 2)
        self.assertEqual(st["counts"]["ready"], 1)
        self.assertEqual(st["counts"]["placed"], 1)
        self.assertEqual(st["pending"], ["sd_a"])

    def test_pack_returns_text_skeleton_and_defaults(self):
        out = tools_scene.scene_direction_pack(
            self.pid, {"start": 0.0, "end": 3.0, "mode": "represent", "instruction": "el huerto"})
        self.assertIn("ZONA DE SUBTÍTULOS", out["text"])
        self.assertGreater(out["tokens"], 0)
        self.assertTrue(out["skeleton"])
        self.assertIn("brief_defaults", out)

    def test_pack_invalid_segment_raises(self):
        with self.assertRaises(MCPError) as ctx:
            tools_scene.scene_direction_pack(self.pid, {"start": 1.0})   # sin end
        self.assertEqual(ctx.exception.code, "invalid_parameter")

    def test_rank_materials_orders_by_relevance(self):
        out = tools_scene.scene_rank_materials(self.pid, "papas huerto marciano")
        self.assertEqual(out["materials"][0]["title"], "Huerto")
        self.assertIn("match", out["materials"][0])
        with self.assertRaises(MCPError):
            tools_scene.scene_rank_materials(self.pid, "   ")

    def test_update_segment_persists_and_validates(self):
        sd.save(self.pid, {"segments": [{"id": "sd_a", "start": 0, "end": 3}]})
        out = tools_scene.scene_direction_update_segment(self.pid, "sd_a", {"status": "placed", "bogus": 1})
        self.assertEqual(out["segments"][0]["status"], "placed")
        with self.assertRaises(MCPError) as ctx:
            tools_scene.scene_direction_update_segment(self.pid, "nope", {"status": "ready"})
        self.assertEqual(ctx.exception.code, "resource_not_found")
        with self.assertRaises(MCPError) as ctx2:
            tools_scene.scene_direction_update_segment(self.pid, "sd_a", {"bogus": 1})
        self.assertEqual(ctx2.exception.code, "invalid_parameter")

    def test_set_and_auto_split(self):
        saved = tools_scene.scene_direction_set(self.pid, [{"start": 0, "end": 3, "mode": "explain"}])
        self.assertEqual(len(saved["segments"]), 1)
        proposed = tools_scene.scene_direction_auto_split(self.pid)
        self.assertTrue(proposed["segments"])

    def test_unknown_project_raises(self):
        with self.assertRaises(MCPError) as ctx:
            tools_scene.scene_direction_get("nope")
        self.assertEqual(ctx.exception.code, "resource_not_found")


if __name__ == "__main__":
    unittest.main()
