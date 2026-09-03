"""Agente del Chat IA: loop provider↔MCP in-process, reload y auditoría ai_chat."""
import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import config, projects, timeline_store
from app.ai import agent, conversations
from app.mcp_server import audit
from app.schemas import Timeline, TimelineClip, TimelineTrack


def _timeline():
    return Timeline(
        tracks=[TimelineTrack(id="V1", kind="video", name="V1")],
        clips=[TimelineClip(id="v", track_id="V1", kind="video", asset_kind="clips",
                            asset_id="0", filename="a.mp4", start=0.0, in_point=0.0,
                            out_point=10.0, source_duration=10.0)],
    )


def _collect(gen):
    async def run():
        out = []
        async for ev in gen:
            out.append(ev)
        return out
    return asyncio.run(run())


class FakeProvider:
    """Proveedor scripted: pide una tool real y termina. Ejercita el camino MCP."""

    def __init__(self, pid, tool, args):
        self.pid, self.tool, self.args = pid, tool, args

    def unavailable_reason(self):
        return None

    async def stream(self, *, system, history, user_message, tools, call_tool, max_iters):
        yield {"type": "text", "delta": "Vale."}
        yield {"type": "tool_start", "tool": self.tool, "args": self.args}
        res = await call_tool(self.tool, self.args)
        yield {"type": "tool_result", "tool": self.tool, "ok": res["ok"], "result": res}
        yield {"type": "final", "text": "Hecho."}


class UnavailableProvider:
    def unavailable_reason(self):
        return "Falta la API key de Gemini."

    async def stream(self, **_):
        yield {"type": "final", "text": ""}


class AgentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, _timeline().model_dump())
        conversations.reset()

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        conversations.reset()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_mutating_tool_runs_and_reloads_and_audits(self):
        fake = FakeProvider(self.pid, "set_project_format",
                            {"project_id": self.pid, "aspect": "1:1"})
        with patch("app.ai.agent.get_provider", return_value=fake):
            events = _collect(agent.run_chat(self.pid, "ponlo cuadrado",
                                             context={"selected_clip_id": "v"}))
        types = [e["type"] for e in events]
        self.assertIn("tool_result", types)
        self.assertIn("reload", types)     # hubo edición → recargar el editor
        self.assertEqual(types[-1], "done")
        # la edición se aplicó de verdad (fuente única timeline_store)
        tl = projects.get_project(self.pid).timeline
        self.assertEqual((tl.width, tl.height), (1080, 1080))
        # auditada como ai_chat
        entries = [e for e in audit.read_all() if e.get("tool") == "set_project_format"]
        self.assertTrue(entries)
        self.assertEqual(entries[-1]["source"], "ai_chat")

    def test_read_only_tool_does_not_reload(self):
        fake = FakeProvider(self.pid, "get_timeline", {"project_id": self.pid})
        with patch("app.ai.agent.get_provider", return_value=fake):
            events = _collect(agent.run_chat(self.pid, "qué tengo"))
        self.assertNotIn("reload", [e["type"] for e in events])

    def test_unavailable_provider_emits_error(self):
        with patch("app.ai.agent.get_provider", return_value=UnavailableProvider()):
            events = _collect(agent.run_chat(self.pid, "hola"))
        self.assertEqual(events[0]["type"], "error")

    def test_empty_message_errors(self):
        events = _collect(agent.run_chat(self.pid, "   "))
        self.assertEqual(events[0]["type"], "error")

    def test_conversation_id_stable(self):
        fake = FakeProvider(self.pid, "get_timeline", {"project_id": self.pid})
        with patch("app.ai.agent.get_provider", return_value=fake):
            ev1 = _collect(agent.run_chat(self.pid, "hola"))
            cid = next(e["conversation_id"] for e in ev1 if e["type"] == "start")
            ev2 = _collect(agent.run_chat(self.pid, "otra", conversation_id=cid))
        cid2 = next(e["conversation_id"] for e in ev2 if e["type"] == "start")
        self.assertEqual(cid, cid2)


class McpClientTest(unittest.TestCase):
    def test_in_process_discovers_tools(self):
        from app.ai.mcp_client import McpToolset

        async def run():
            async with McpToolset.open() as ts:
                specs = await ts.tool_specs()
                res = await ts.call("search_sfx", {"query": ""})
                return specs, res
        specs, res = asyncio.run(run())
        self.assertGreaterEqual(len(specs), 40)
        self.assertTrue(all("name" in s and "parameters" in s for s in specs))
        self.assertTrue(res["ok"])


if __name__ == "__main__":
    unittest.main()
