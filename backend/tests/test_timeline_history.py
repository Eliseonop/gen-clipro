"""Core de historial: snapshot / undo / redo / checkpoints (puro, sobre dicts)."""
import unittest

from app import timeline_history as h


def tl(n):
    return {"marker": n, "clips": []}


class UndoRedoTest(unittest.TestCase):
    def test_snapshot_y_undo_devuelve_el_estado_previo(self):
        hist = h.empty_history()
        hist = h.snapshot(hist, tl(1))          # guardo v1 antes de pasar a v2
        hist, restored = h.undo(hist, tl(2))    # estoy en v2, deshago
        self.assertEqual(restored, tl(1))
        self.assertTrue(h.can_redo(hist))

    def test_redo_reaplica(self):
        hist = h.snapshot(h.empty_history(), tl(1))
        hist, _ = h.undo(hist, tl(2))
        hist, redone = h.redo(hist, tl(1))
        self.assertEqual(redone, tl(2))

    def test_snapshot_limpia_redo(self):
        hist = h.snapshot(h.empty_history(), tl(1))
        hist, _ = h.undo(hist, tl(2))
        self.assertTrue(h.can_redo(hist))
        hist = h.snapshot(hist, tl(1))          # una edición nueva descarta el redo
        self.assertFalse(h.can_redo(hist))

    def test_undo_vacio_devuelve_none(self):
        hist, restored = h.undo(h.empty_history(), tl(1))
        self.assertIsNone(restored)

    def test_limite_del_stack(self):
        hist = h.empty_history()
        for i in range(60):
            hist = h.snapshot(hist, tl(i), limit=50)
        self.assertEqual(len(hist["undo"]), 50)
        self.assertEqual(hist["undo"][0], tl(10))   # se descartaron los 10 más viejos

    def test_clona_no_referencia(self):
        cur = tl(1)
        hist = h.snapshot(h.empty_history(), cur)
        cur["marker"] = 999                          # mutar el original no afecta lo guardado
        _, restored = h.undo(hist, tl(2))
        self.assertEqual(restored["marker"], 1)


class CheckpointTest(unittest.TestCase):
    def test_checkpoint_y_restore(self):
        hist = h.checkpoint(h.empty_history(), "antes-del-short", tl(7))
        self.assertIn("antes-del-short", h.list_checkpoints(hist))
        self.assertEqual(h.restore_checkpoint(hist, "antes-del-short"), tl(7))

    def test_restore_inexistente(self):
        self.assertIsNone(h.restore_checkpoint(h.empty_history(), "nope"))

    def test_acepta_modelos_pydantic(self):
        from app.schemas import Timeline
        hist = h.snapshot(h.empty_history(), Timeline(fps=24))
        _, restored = h.undo(hist, Timeline(fps=30))
        self.assertEqual(restored["fps"], 24)        # se guarda como dict


if __name__ == "__main__":
    unittest.main()
