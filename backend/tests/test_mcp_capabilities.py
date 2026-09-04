"""Fase 2 del rediseño: descubrimiento (describe_capabilities, resources) +
entrada-por-proyecto (list_projects, resolve_project) + meta/annotations."""
import asyncio
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from app import config, projects, timeline_store
from app.mcp_server import capabilities, server, tools_capabilities


def _call(name, args=None):
    return asyncio.run(server.mcp.call_tool(name, args or {}))


def _read(uri):
    return asyncio.run(server.mcp.read_resource(uri))


def _text(res):
    # read_resource → list[ReadResourceContents(content=str)];
    # call_tool → CallToolResult con .content[0].text
    if isinstance(res, list):
        return res[0].content
    return res.content[0].text


class CapabilitiesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old_data = config.DATA_DIR
        self._old_file = projects._FILE
        self._old_hist = timeline_store.HISTORY_DIR
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"

    def tearDown(self):
        config.DATA_DIR = self._old_data
        projects._FILE = self._old_file
        timeline_store.HISTORY_DIR = self._old_hist
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- describe_capabilities ---------------------------------------------
    def test_overview_lists_domains_and_verbs(self):
        ov = tools_capabilities.describe_capabilities()
        domains = {d["domain"] for d in ov["domains"]}
        self.assertIn("discovery", domains)
        self.assertIn("clips", domains)
        self.assertIn("transcription", domains)
        # verbos agrupados: un verbo conocido está en su dominio
        clips = next(d for d in ov["domains"] if d["domain"] == "clips")
        self.assertIn("animate_clip", clips["verbs"])
        self.assertIn("transcribe_model", ov["defaults"])

    def test_describe_domain_has_values_and_guide(self):
        d = tools_capabilities.describe_capabilities("clips")
        self.assertEqual(d["domain"], "clips")
        self.assertIn("motions", d["values"])
        self.assertIn("zoom_in", d["values"]["motions"])
        self.assertTrue(d["guide"])  # guía presente

    def test_describe_transcription_models_have_default(self):
        d = tools_capabilities.describe_capabilities("transcription")
        models = d["values"]["models"]
        self.assertTrue(any(m.get("default") for m in models))
        self.assertTrue(all("id" in m for m in models))

    def test_describe_unknown_domain_raises(self):
        with self.assertRaises(ValueError):
            tools_capabilities.describe_capabilities("noexiste")

    # --- list_projects / resolve_project -----------------------------------
    def test_list_projects_compact(self):
        p = projects.create_project("Editor Demo")
        out = tools_capabilities.list_projects()
        self.assertEqual(out["count"], 1)
        row = out["projects"][0]
        self.assertEqual(row["project_id"], p.id)
        self.assertEqual(row["name"], "Editor Demo")
        self.assertIn("aspect", row)

    def test_resolve_by_id_exact(self):
        p = projects.create_project("X")
        res = tools_capabilities.resolve_project(p.id)
        self.assertEqual(res["project_id"], p.id)
        self.assertEqual(res["match"], "id")

    def test_resolve_by_name(self):
        p = projects.create_project("Mi Corto")
        res = tools_capabilities.resolve_project("mi corto")
        self.assertEqual(res["project_id"], p.id)

    def test_resolve_ambiguous_returns_candidates(self):
        projects.create_project("Editor")
        projects.create_project("Editor")
        res = tools_capabilities.resolve_project("Editor")
        self.assertTrue(res.get("ambiguous"))
        self.assertEqual(len(res["candidates"]), 2)

    def test_resolve_no_match_raises(self):
        projects.create_project("Algo")
        with self.assertRaises(ValueError):
            tools_capabilities.resolve_project("zzz-inexistente")

    # --- meta / annotations en el registro vivo ----------------------------
    def test_tools_have_domain_meta_and_hints(self):
        tools = asyncio.run(server.mcp.list_tools())
        bn = {t.name: t for t in tools}
        self.assertEqual(bn["remove_clip"].meta["domain"], "clips")
        self.assertEqual(bn["remove_clip"].meta["access"], "destructive")
        self.assertTrue(bn["remove_clip"].annotations.destructive_hint)
        self.assertTrue(bn["get_timeline"].annotations.read_only_hint)
        self.assertEqual(bn["describe_capabilities"].meta["domain"], "discovery")

    # --- resources ----------------------------------------------------------
    def test_resource_capabilities_index(self):
        data = json.loads(_text(_read("capabilities://index")))
        self.assertIn("domains", data)

    def test_resource_help_domain(self):
        txt = _text(_read("help://clips"))
        self.assertIn("animate_clip", txt)

    def test_resource_help_unknown_raises(self):
        with self.assertRaises(Exception):
            _read("help://noexiste")

    def test_resource_project_summary(self):
        p = projects.create_project("Res Demo")
        data = json.loads(_text(_read(f"project://{p.id}")))
        self.assertEqual(data["project"]["id"], p.id)
        self.assertNotIn("capabilities", data)  # Fase 1: fuera del contexto

    def test_resource_project_timeline_and_media(self):
        p = projects.create_project("Res Demo 2")
        tl = json.loads(_text(_read(f"project://{p.id}/timeline")))
        self.assertIn("clips", tl)
        media = json.loads(_text(_read(f"project://{p.id}/media")))
        self.assertIn("clips", media)


if __name__ == "__main__":
    unittest.main()
