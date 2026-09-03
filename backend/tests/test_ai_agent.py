"""Agente del Chat IA: loop provider↔MCP, jobs, persistencia y auditoría."""
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
    """Provider scripted (modelo emit): pide una tool real y termina."""

    def __init__(self, tool, args):
        self.tool, self.args = tool, args

    def unavailable_reason(self):
        return None

    async def run(self, *, system, history, user_message, tools, call_tool, emit, max_iters):
        await emit({"type": "text", "delta": "Vale."})
        await emit({"type": "tool_start", "tool": self.tool, "args": self.args})
        res = await call_tool(self.tool, self.args)
        await emit({"type": "tool_result", "tool": self.tool, "ok": res["ok"], "result": res})
        await emit({"type": "final", "text": "Hecho."})
        return "Hecho."


class UnavailableProvider:
    def unavailable_reason(self):
        return "Falta la API key de Gemini."

    async def run(self, **_):
        return ""


class AgentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = (config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR)
        config.DATA_DIR = self.tmp
        projects._FILE = self.tmp / "projects.json"
        timeline_store.HISTORY_DIR = self.tmp / "history"
        self.pid = projects.create_project("Demo").id
        projects.save_timeline(self.pid, _timeline().model_dump())

    def tearDown(self):
        config.DATA_DIR, projects._FILE, timeline_store.HISTORY_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_mutating_tool_runs_reloads_audits_persists(self):
        fake = FakeProvider("set_project_format", {"project_id": self.pid, "aspect": "1:1"})
        with patch("app.ai.agent.get_provider", return_value=fake):
            events = _collect(agent.run_chat(self.pid, "ponlo cuadrado"))
        types = [e["type"] for e in events]
        self.assertIn("reload", types)
        self.assertEqual(types[-1], "done")
        tl = projects.get_project(self.pid).timeline
        self.assertEqual((tl.width, tl.height), (1080, 1080))
        entries = [e for e in audit.read_all() if e.get("tool") == "set_project_format"]
        self.assertEqual(entries[-1]["source"], "ai_chat")
        # persistencia: la conversación se guardó en disco
        cid = next(e["conversation_id"] for e in events if e["type"] == "start")
        msgs = conversations.get_messages(self.pid, cid)
        roles = [m["role"] for m in msgs]
        self.assertEqual(roles, ["user", "assistant"])

    def test_read_only_tool_does_not_reload(self):
        fake = FakeProvider("get_timeline", {"project_id": self.pid})
        with patch("app.ai.agent.get_provider", return_value=fake):
            events = _collect(agent.run_chat(self.pid, "qué tengo"))
        self.assertNotIn("reload", [e["type"] for e in events])

    def test_unavailable_provider_emits_error(self):
        with patch("app.ai.agent.get_provider", return_value=UnavailableProvider()):
            events = _collect(agent.run_chat(self.pid, "hola"))
        self.assertEqual(events[0]["type"], "error")

    def test_conversation_persists_across_turns(self):
        fake = FakeProvider("get_timeline", {"project_id": self.pid})
        with patch("app.ai.agent.get_provider", return_value=fake):
            ev1 = _collect(agent.run_chat(self.pid, "hola"))
            cid = next(e["conversation_id"] for e in ev1 if e["type"] == "start")
            _collect(agent.run_chat(self.pid, "otra", conversation_id=cid))
        self.assertEqual(len(conversations.get_messages(self.pid, cid)), 4)
        listed = conversations.list_conversations(self.pid)
        self.assertEqual(listed[0]["id"], cid)
        self.assertEqual(listed[0]["title"], "hola")


class WaitJobTest(unittest.TestCase):
    def test_polls_until_done_and_emits_progress(self):
        class FakeTools:
            def __init__(self):
                self.n = 0

            async def call(self, name, args):
                self.n += 1
                status = "running" if self.n == 1 else "done"
                return {"ok": True, "data": {"id": "j", "status": status,
                                             "progress": 0.5 if self.n == 1 else 1.0,
                                             "message": "…"}}

        events = []

        async def emit(ev):
            events.append(ev)

        async def run():
            with patch("app.ai.agent.JOB_POLL_SECONDS", 0):
                return await agent._wait_job(FakeTools(), "create_clips_from_segments",
                                             {"id": "j", "status": "pending", "progress": 0}, emit)
        res = asyncio.run(run())
        self.assertEqual(res["data"]["status"], "done")
        self.assertTrue(res["ok"])
        self.assertTrue(any(e["type"] == "job" for e in events))


class ConversationsStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._old = config.DATA_DIR
        config.DATA_DIR = self.tmp

    def tearDown(self):
        config.DATA_DIR = self._old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_crud(self):
        cid = conversations.get_or_create(None, "p1")
        conversations.append("p1", cid, "user", "Hola IA")
        conversations.append("p1", cid, "assistant", "Hola humano")
        msgs = conversations.get_messages("p1", cid)
        self.assertEqual([m["role"] for m in msgs], ["user", "assistant"])
        self.assertEqual(conversations.list_conversations("p1")[0]["title"], "Hola IA")
        self.assertTrue(conversations.delete("p1", cid))
        self.assertEqual(conversations.list_conversations("p1"), [])

    def test_isolated_per_project(self):
        c1 = conversations.get_or_create(None, "p1")
        conversations.get_or_create(None, "p2")
        self.assertEqual(len(conversations.list_conversations("p1")), 1)
        self.assertEqual(conversations.list_conversations("p1")[0]["id"], c1)


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
        self.assertTrue(res["ok"])


if __name__ == "__main__":
    unittest.main()
