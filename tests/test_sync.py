#!/usr/bin/env python3
"""bin/grokbot-sync writes safely and fails with one line, in every mode."""
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
HELPER = ROOT / "bin" / "grokbot-sync"
BOTS = {"bots": [{"id": "bob", "name": "Bob", "shortName": "Bob"}]}


class SyncWriteTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.dir = pathlib.Path(temp.name)
        self.seed = self.dir / "seed.json"
        self.seed.write_text(json.dumps(BOTS))

    def sync(self, *args, cwd=None):
        env = {"HOME": str(self.dir), "XDG_CONFIG_HOME": str(self.dir / ".config"), "PATH": "/usr/bin:/bin"}
        return subprocess.run(["/usr/bin/python3", "-I", str(HELPER), *args], cwd=cwd or self.dir,
                              env=env, capture_output=True, text=True, timeout=10)

    def assert_one_line_failure(self, result):
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(len(result.stderr.strip().splitlines()), 1, result.stderr)

    def test_planted_symlink_at_old_temporary_name_is_not_followed(self):
        victim = self.dir / "victim"
        victim.write_text("keep me")
        output = self.dir / "out.json"
        os.symlink(victim, str(output) + ".tmp")
        result = self.sync("--seed", str(self.seed), "--output", str(output))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(victim.read_text(), "keep me")
        self.assertEqual(json.loads(output.read_text()), BOTS)
        self.assertEqual(output.stat().st_mode & 0o777, 0o644)
        leftovers = [p.name for p in self.dir.iterdir() if p.name.endswith(".tmp") and not p.is_symlink()]
        self.assertEqual(leftovers, [])

    def test_bare_output_name_writes_in_the_current_directory(self):
        result = self.sync("--seed", str(self.seed), "--output", "out.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.dir / "out.json").read_text()), BOTS)

    def test_unwritable_output_is_one_line_in_seed_and_from_modes(self):
        blocker = self.dir / "file"
        blocker.write_text("")
        output = str(blocker / "roster.json")
        self.assert_one_line_failure(self.sync("--seed", str(self.seed), "--output", output))
        agents = self.dir / "agents" / "bob"
        agents.mkdir(parents=True)
        (agents / "profile.json").write_text(json.dumps({"id": "bob", "name": "Bob"}))
        self.assert_one_line_failure(self.sync("--from", str(self.dir / "agents"), "--output", output))

    def test_unwritable_output_is_one_line_in_app_mode(self):
        import base64
        from urllib.parse import quote
        cache = self.dir / ".config" / "Grok Bot" / "sand-client-persistence"
        cache.mkdir(parents=True)

        def put(key, schema, value):
            name = base64.b32encode(key.encode()).decode().lower().rstrip("=") + ".blob"
            (cache / name).write_text(json.dumps({"schemaVersion": schema, "value": value}))

        put("sand.client.slice.client-meta.account-slot", 1, "acct")
        put("sand.client.slice.account." + quote("acct", safe="~()*!.'-_") + ".roster.last-roster", 4,
            {"rows": [{"id": "bob", "name": "Bob"}]})
        blocker = self.dir / "file"
        blocker.write_text("")
        result = self.sync("--app", "--output", str(blocker / "roster.json"))
        self.assert_one_line_failure(result)
        self.assertIn("kept", result.stderr)

    def test_seed_through_symlink_or_fifo_is_refused_without_blocking(self):
        link = self.dir / "link.json"
        os.symlink(self.seed, link)
        output = self.dir / "out.json"
        result = self.sync("--seed", str(link), "--output", str(output))
        self.assertEqual(result.returncode, 2)
        self.assertFalse(output.exists())
        fifo = self.dir / "fifo.json"
        os.mkfifo(fifo)
        result = self.sync("--seed", str(fifo), "--output", str(output))
        self.assertEqual(result.returncode, 2)
        self.assertFalse(output.exists())

    def test_oversized_seed_is_refused(self):
        big = self.dir / "big.json"
        big.write_text(json.dumps({"bots": [{"id": "x" * 64, "name": "y" * 64}] * 20000}))
        result = self.sync("--seed", str(big), "--output", str(self.dir / "out.json"))
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
