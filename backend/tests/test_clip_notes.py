"""Notas de contexto de los clips (§5-§8).

La nota dice QUÉ REPRESENTA un fragmento dentro de la historia. Se guarda como
una propiedad más del clip (deshacible) y viaja al contexto que recibe la IA al
generar recursos.
"""
import unittest

from app import clip_notes
from app import timeline_ops as ops
from app.motion import segment_context as sc
from app.schemas import ClipInfo, Project, Timeline, TimelineClip, TimelineTrack


def _tl():
    return Timeline(
        width=720, height=1280, fps=30,
        tracks=[TimelineTrack(id="V1", kind="video", name="V1"),
                TimelineTrack(id="T1", kind="text", name="Subtítulos")],
        clips=[
            TimelineClip(id="c1", track_id="V1", kind="video", asset_kind="clips",
                         asset_id="0", filename="pizarra.mp4", name="pizarra",
                         start=0.0, in_point=12.0, out_point=17.0, source_duration=30.0),
            TimelineClip(id="c2", track_id="V1", kind="video", asset_kind="clips",
                         asset_id="1", filename="retrato.mp4", name="retrato",
                         start=5.0, in_point=0.0, out_point=4.0, source_duration=4.0),
        ],
    )


def _project():
    return Project(
        id="p1", name="Proy", created_at="2026-09-16T00:00:00+00:00", timeline=_tl(),
        clips=[ClipInfo(index=0, filename="pizarra.mp4", url="c/pizarra.mp4", label="pizarra",
                        start=0.0, end=30.0, description="Un científico en una pizarra"),
               ClipInfo(index=1, filename="retrato.mp4", url="c/retrato.mp4", label="retrato",
                        start=0.0, end=4.0)],
    )


class SetClipNoteTest(unittest.TestCase):
    def test_guarda_nota_y_origen(self):
        r = ops.set_clip_note(_tl(), "c1", "El científico escribe la ecuación.")
        c = next(x for x in r.timeline.clips if x.id == "c1")
        self.assertEqual(c.note, "El científico escribe la ecuación.")
        self.assertEqual(c.note_source, "user")
        self.assertEqual(r.changed, ["c1"])
        self.assertEqual(ops.validate_timeline(r.timeline), [])

    def test_no_muta_la_entrada(self):
        tl = _tl()
        ops.set_clip_note(tl, "c1", "algo")
        self.assertIsNone(next(x for x in tl.clips if x.id == "c1").note)

    def test_vacio_o_none_borra(self):
        tl = ops.set_clip_note(_tl(), "c1", "algo").timeline
        for empty in ("", "   ", None):
            c = next(x for x in ops.set_clip_note(tl, "c1", empty).timeline.clips if x.id == "c1")
            self.assertIsNone(c.note)
            self.assertIsNone(c.note_source)

    def test_marca_de_ia(self):
        c = next(x for x in ops.set_clip_note(_tl(), "c1", "propuesta", source="ai").timeline.clips
                 if x.id == "c1")
        self.assertEqual(c.note_source, "ai")

    def test_origen_invalido_no_se_guarda(self):
        c = next(x for x in ops.set_clip_note(_tl(), "c1", "x", source="pirata").timeline.clips
                 if x.id == "c1")
        self.assertIsNone(c.note_source)

    def test_recorta_notas_larguisimas(self):
        c = next(x for x in ops.set_clip_note(_tl(), "c1", "x" * 900).timeline.clips if x.id == "c1")
        self.assertEqual(len(c.note), 400)
        self.assertTrue(c.note.endswith("…"))

    def test_clip_inexistente(self):
        with self.assertRaises(ValueError):
            ops.set_clip_note(_tl(), "nope", "x")


class UpdateClipNoteTest(unittest.TestCase):
    """La nota entra por el patch consolidado: un solo snapshot de undo."""

    def test_note_en_el_patch(self):
        r = ops.update_clip(_tl(), "c1", {"note": "Aquí se introduce el problema."})
        c = next(x for x in r.timeline.clips if x.id == "c1")
        self.assertEqual(c.note, "Aquí se introduce el problema.")

    def test_junto_a_otras_propiedades(self):
        r = ops.update_clip(_tl(), "c1", {"note": "contexto", "opacity": 0.5})
        c = next(x for x in r.timeline.clips if x.id == "c1")
        self.assertEqual(c.note, "contexto")
        self.assertEqual(c.opacity, 0.5)

    def test_clave_desconocida_sigue_fallando(self):
        with self.assertRaises(ValueError):
            ops.update_clip(_tl(), "c1", {"nota": "typo"})


class NoteInSegmentContextTest(unittest.TestCase):
    """§7: la nota es parte de lo que la IA lee del tramo."""

    def test_la_nota_llega_al_contexto(self):
        proj = _project()
        proj.timeline = ops.set_clip_note(proj.timeline, "c1", "El científico escribe.").timeline
        ctx = sc.build_segment_context(proj, 0.0, 5.0)
        el = next(e for e in ctx["timelineContext"]["existingElements"] if e["id"] == "c1")
        self.assertEqual(el["note"], "El científico escribe.")

    def test_sin_nota_no_ensucia_el_contexto(self):
        ctx = sc.build_segment_context(_project(), 0.0, 5.0)
        el = next(e for e in ctx["timelineContext"]["existingElements"] if e["id"] == "c1")
        self.assertNotIn("note", el)

    def test_nota_y_descripcion_son_cosas_distintas(self):
        """La descripción dice qué es el archivo; la nota, qué significa aquí."""
        proj = _project()
        proj.timeline = ops.set_clip_note(proj.timeline, "c1", "Se introduce el problema.").timeline
        el = next(e for e in sc.build_segment_context(proj, 0.0, 5.0)["timelineContext"]
                  ["existingElements"] if e["id"] == "c1")
        self.assertEqual(el["description"], "Un científico en una pizarra")
        self.assertEqual(el["note"], "Se introduce el problema.")


class BuildNoteContextTest(unittest.TestCase):
    def test_incluye_fragmento_material_y_vecinos(self):
        ctx = clip_notes.build_context(_project(), "c1")
        self.assertEqual(ctx["timeline"], {"start": 0.0, "end": 5.0, "duration": 5.0})
        self.assertEqual(ctx["fragment"], {"in": 12.0, "out": 17.0, "sourceDuration": 30.0})
        self.assertEqual(ctx["material"]["label"], "pizarra")
        self.assertEqual(ctx["material"]["description"], "Un científico en una pizarra")
        self.assertEqual([c["name"] for c in ctx["neighbours"]["after"]], ["retrato"])
        self.assertEqual(ctx["neighbours"]["before"], [])

    def test_arrastra_las_notas_de_los_vecinos(self):
        proj = _project()
        proj.timeline = ops.set_clip_note(proj.timeline, "c1", "Se escribe la ecuación.").timeline
        ctx = clip_notes.build_context(proj, "c2")
        self.assertEqual(ctx["neighbours"]["before"][0]["note"], "Se escribe la ecuación.")

    def test_clip_inexistente(self):
        with self.assertRaises(ValueError):
            clip_notes.build_context(_project(), "nope")

    def test_prompt_no_filtra_tiempos_como_contenido(self):
        prompt = clip_notes.user_prompt(clip_notes.build_context(_project(), "c1"))
        self.assertIn("00:12", prompt)      # el fragmento usado, como dato
        self.assertIn("pizarra", prompt)
        self.assertIn("GUION EN ESE MOMENTO", prompt)


class SuggestNoteTest(unittest.TestCase):
    def _suggest(self, provider, **patches):
        import asyncio
        from unittest import mock
        with mock.patch.object(clip_notes, "get_provider", return_value=provider), \
                mock.patch.multiple(clip_notes, **patches) if patches else _nullctx():
            return asyncio.run(clip_notes.suggest(_project(), "c1"))

    def test_propone_y_limpia_la_frase(self):
        class P:
            def unavailable_reason(self):
                return None

            async def run(self, *, emit, **_):
                await emit({"type": "text", "delta": 'Nota: "El científico escribe la ecuación."'})

        out = self._suggest(P())
        self.assertEqual(out["note"], "El científico escribe la ecuación.")
        self.assertNotIn("degraded", out)

    def test_veredicto_de_moderacion_no_es_una_nota(self):
        """Visto en vivo con OpenRouter: devolvió «User Safety: safe»."""
        for junk in ("User Safety: safe", "safe", "unsafe", "OK", "Ava"):
            class P:
                reply = junk

                def unavailable_reason(self):
                    return None

                async def run(self, *, emit, **_):
                    await emit({"type": "text", "delta": self.reply})

            with self.subTest(junk=junk):
                out = self._suggest(P())
                self.assertEqual(out["note"], "")
                self.assertIn("útil", out["degraded"])

    def test_usable(self):
        self.assertTrue(clip_notes.usable("Se introduce el problema."))
        self.assertFalse(clip_notes.usable("Safety: unsafe content"))
        self.assertFalse(clip_notes.usable("dos palabras"))

    def test_sin_proveedor_no_falla(self):
        class P:
            def unavailable_reason(self):
                return "Sin clave de API."

        out = self._suggest(P())
        self.assertEqual(out["note"], "")
        self.assertEqual(out["degraded"], "Sin clave de API.")

    def test_proveedor_colgado_devuelve_aviso(self):
        import asyncio

        class P:
            def unavailable_reason(self):
                return None

            async def run(self, **_):
                await asyncio.sleep(30)

        out = self._suggest(P(), AI_TIMEOUT=0.05)
        self.assertEqual(out["note"], "")
        self.assertIn("tardó", out["degraded"])


def _nullctx():
    import contextlib
    return contextlib.nullcontext()


class CleanNoteTest(unittest.TestCase):
    def test_quita_prefijos_y_comillas(self):
        self.assertEqual(clip_notes._clean('Nota: "El científico escribe."'),
                         "El científico escribe.")
        self.assertEqual(clip_notes._clean("«Se introduce el problema»"),
                         "Se introduce el problema")

    def test_colapsa_espacios(self):
        self.assertEqual(clip_notes._clean("  El   científico\n escribe  "),
                         "El científico escribe")

    def test_recorta_por_palabra(self):
        out = clip_notes._clean(" ".join(["palabra"] * 60))
        self.assertLessEqual(len(out), clip_notes.MAX_NOTE_CHARS + 1)
        self.assertTrue(out.endswith("…"))
        self.assertFalse(out.endswith("pala…"))   # no parte una palabra por la mitad

    def test_vacio(self):
        self.assertEqual(clip_notes._clean(""), "")
        self.assertEqual(clip_notes._clean(None), "")


if __name__ == "__main__":
    unittest.main()
