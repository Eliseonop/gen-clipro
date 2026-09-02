"""Tests de la migración del JSON del timeline (forward-only, idempotente)."""
import unittest

from app import migrations
from app.schemas import Timeline


class TimelineVersionTest(unittest.TestCase):
    def test_ausente_es_v1(self):
        self.assertEqual(migrations.timeline_version({"tracks": [], "clips": []}), 1)

    def test_lee_version_declarada(self):
        self.assertEqual(migrations.timeline_version({"schema_version": 2}), 2)

    def test_valor_invalido_cae_a_v1(self):
        self.assertEqual(migrations.timeline_version({"schema_version": "x"}), 1)


class MigrateTimelineTest(unittest.TestCase):
    def test_sella_v1_a_current_sin_perder_datos(self):
        legacy = {"fps": 30, "width": 720, "height": 1280,
                  "tracks": [{"id": "V1", "kind": "video", "name": "V1"}],
                  "clips": [{"id": "c1", "track_id": "V1", "kind": "video",
                             "asset_kind": "clips", "asset_id": "0", "filename": "a.mp4"}]}
        out = migrations.migrate_timeline(legacy)
        self.assertEqual(out["schema_version"], migrations.CURRENT_SCHEMA_VERSION)
        self.assertEqual(out["clips"], legacy["clips"])   # datos intactos
        self.assertEqual(out["tracks"], legacy["tracks"])

    def test_es_idempotente(self):
        once = migrations.migrate_timeline({"tracks": [], "clips": []})
        twice = migrations.migrate_timeline(once)
        self.assertEqual(once, twice)

    def test_no_toca_una_version_futura(self):
        future = {"schema_version": 999, "tracks": [], "clips": []}
        self.assertEqual(migrations.migrate_timeline(future), future)

    def test_vacio_o_none_pasa_tal_cual(self):
        self.assertEqual(migrations.migrate_timeline({}), {})
        self.assertIsNone(migrations.migrate_timeline(None))

    def test_no_muta_la_entrada(self):
        legacy = {"tracks": [], "clips": []}
        migrations.migrate_timeline(legacy)
        self.assertNotIn("schema_version", legacy)   # no side-effects


class SchemaConsistencyTest(unittest.TestCase):
    def test_default_del_modelo_coincide_con_current(self):
        self.assertEqual(Timeline().schema_version, migrations.CURRENT_SCHEMA_VERSION)

    def test_timeline_migrada_valida_como_modelo(self):
        legacy = {"tracks": [{"id": "T1", "kind": "text", "name": "T1"}],
                  "clips": [{"id": "t1", "track_id": "T1", "kind": "text",
                             "asset_kind": "text", "asset_id": "t", "filename": "",
                             "text": "hola", "style": {"word_fx": "glow"}}]}
        tl = Timeline(**migrations.migrate_timeline(legacy))
        self.assertEqual(tl.schema_version, migrations.CURRENT_SCHEMA_VERSION)
        self.assertEqual(tl.clips[0].text, "hola")
        self.assertEqual(tl.clips[0].text_role, "free")


class TextRoleMigrationTest(unittest.TestCase):
    def test_v2_sella_caption_y_free(self):
        tl = {
            "schema_version": 2,
            "tracks": [{"id": "T1", "kind": "text", "name": "T1"}],
            "clips": [
                {"id": "a", "track_id": "T1", "kind": "text", "asset_kind": "text",
                 "asset_id": "t", "filename": "", "text": "hola",
                 "origin": {"transcript_id": "tr1"}},
                {"id": "b", "track_id": "T1", "kind": "text", "asset_kind": "text",
                 "asset_id": "t", "filename": "", "text": "marca", "words": []},
                {"id": "c", "track_id": "T1", "kind": "text", "asset_kind": "text",
                 "asset_id": "t", "filename": "", "text": "con words",
                 "words": [{"text": "con", "start": 0, "end": 0.4}]},
            ],
        }
        out = migrations.migrate_timeline(tl)
        self.assertEqual(out["schema_version"], migrations.CURRENT_SCHEMA_VERSION)
        roles = {c["id"]: c["text_role"] for c in out["clips"]}
        self.assertEqual(roles, {"a": "caption", "b": "free", "c": "caption"})

    def test_respeta_text_role_ya_puesto(self):
        tl = {
            "schema_version": 2,
            "clips": [
                {"id": "x", "track_id": "T1", "kind": "text", "asset_kind": "text",
                 "asset_id": "t", "filename": "", "text": "hola",
                 "origin": {"transcript_id": "tr1"}, "text_role": "free"},
            ],
        }
        out = migrations.migrate_timeline(tl)
        self.assertEqual(out["clips"][0]["text_role"], "free")


class KeepPitchMigrationTest(unittest.TestCase):
    def test_v3_keep_pitch_false_pasa_a_true(self):
        tl = {
            "schema_version": 3,
            "clips": [
                {"id": "a", "kind": "audio", "keep_pitch": False, "speed": 2},
                {"id": "b", "kind": "video", "keep_pitch": True, "speed": 1},
                {"id": "c", "kind": "audio", "speed": 1.5},
            ],
        }
        out = migrations.migrate_timeline(tl)
        self.assertEqual(out["schema_version"], 4)
        by_id = {c["id"]: c for c in out["clips"]}
        self.assertTrue(by_id["a"]["keep_pitch"])
        self.assertTrue(by_id["b"]["keep_pitch"])
        self.assertNotIn("keep_pitch", by_id["c"])

    def test_v4_respeta_keep_pitch_false(self):
        tl = {
            "schema_version": 4,
            "clips": [{"id": "a", "kind": "audio", "keep_pitch": False, "speed": 2}],
        }
        out = migrations.migrate_timeline(tl)
        self.assertIs(out["clips"][0]["keep_pitch"], False)

    def test_payload_sin_version_migra_keep_pitch_false(self):
        tl = {"clips": [{"id": "a", "kind": "audio", "keep_pitch": False, "speed": 2}]}
        out = migrations.migrate_timeline(tl)
        self.assertTrue(out["clips"][0]["keep_pitch"])
        self.assertEqual(out["schema_version"], migrations.CURRENT_SCHEMA_VERSION)


if __name__ == "__main__":
    unittest.main()
