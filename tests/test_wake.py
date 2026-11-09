#!/usr/bin/env python3
"""Dictation routing, voice watcher and toggle helper, driven as real processes."""
from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop import wake  # noqa: E402

ROUTE = ROOT / "bin" / "grokbot-dictation-route"
WATCH = ROOT / "bin" / "grokbot-voice-watch"
DICTATE = ROOT / "bin" / "grokbot-dictate"
FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "wake-phrases.json").read_text(encoding="utf-8"))
BOB = FIXTURE["primaryId"]
CUSTOM = "7a1c0e55-1111-4c2a-9e0f-000000000001"


def load_script(path: Path, name: str):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class Sandbox(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.home = self.dir / "home"
        self.config = self.dir / "config"
        self.data = self.dir / "data"
        self.bin = self.dir / "bin"
        for path in (self.home, self.config / "omarchy", self.data, self.bin):
            path.mkdir(parents=True)
        self.sink = self.dir / "sink.jsonl"
        self.env = {
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "HOME": str(self.home),
            "XDG_CONFIG_HOME": str(self.config),
            "XDG_DATA_HOME": str(self.data),
            "XDG_RUNTIME_DIR": str(self.dir / "run"),
            "GROKBOT_DICTATE_SINK": str(self.sink),
        }

    def tearDown(self):
        self._tmp.cleanup()

    def run_script(self, script, args=(), data=b"", env=None, timeout=20):
        merged = dict(self.env, **(env or {}))
        return subprocess.run([sys.executable, str(script), *args], input=data, capture_output=True,
                              env=merged, timeout=timeout)

    def delivered(self):
        if not self.sink.exists():
            return []
        return [json.loads(line) for line in self.sink.read_text(encoding="utf-8").splitlines()]

    def write_roster(self, path: Path, bots):
        path.write_text(json.dumps({"bots": bots}), encoding="utf-8")

    def tool(self, name, body):
        path = self.bin / name
        path.write_text(body, encoding="utf-8")
        path.chmod(0o755)
        return path

    def assertClean(self, result):
        self.assertNotIn(b"Traceback", result.stderr, result.stderr.decode("utf-8", "replace"))


class SharedFixture(Sandbox):
    def test_module_matches_fixture(self):
        for case in FIXTURE["cases"]:
            got = wake.route(case["text"], FIXTURE["roster"], FIXTURE["primaryId"])
            self.assertEqual({k: got[k] for k in ("matched", "botId", "prompt")}, case["expected"],
                             repr(case["text"]))

    def test_route_script_matches_fixture(self):
        roster = self.dir / "fixture-roster.json"
        self.write_roster(roster, FIXTURE["roster"])
        for case in FIXTURE["cases"]:
            result = self.run_script(ROUTE, data=case["text"].encode("utf-8"), env={"GROKBOT_BOTS": str(roster)})
            self.assertClean(result)
            got = json.loads(result.stdout)
            self.assertEqual(result.returncode, 0 if case["expected"]["matched"] else 1)
            self.assertEqual({k: got[k] for k in ("matched", "botId", "prompt")}, case["expected"],
                             repr(case["text"]))


class RosterSource(Sandbox):
    custom = [{"id": CUSTOM, "name": "Zephyr Research Desk", "shortName": "Zephyr"}]

    def route_json(self, text, env=None):
        result = self.run_script(ROUTE, data=text.encode("utf-8"), env=env)
        self.assertClean(result)
        return json.loads(result.stdout)

    def test_synced_roster_is_the_default(self):
        self.write_roster(self.config / "omarchy" / "grokbot-bots.json", self.custom)
        self.assertEqual(self.route_json("Hey Zephyr, summarise")["botId"], CUSTOM)
        # The filter routes it instead of handing it back to be typed.
        result = self.run_script(ROUTE, ["--filter"], "Hey Zephyr, summarise".encode())
        self.assertEqual(result.stdout, b"")
        self.assertEqual(self.delivered()[0]["text"], "Hey Zephyr, summarise")

    def test_roster_synced_by_the_shell_under_home_is_found(self):
        # Main.qml writes ~/.config/omarchy/grokbot-bots.json even when XDG_CONFIG_HOME points elsewhere.
        target = self.home / ".config" / "omarchy"
        target.mkdir(parents=True)
        self.write_roster(target / "grokbot-bots.json", self.custom)
        self.assertEqual(self.route_json("Hey Zephyr hi")["botId"], CUSTOM)

    def test_bundled_roster_when_synced_is_missing_unsafe_or_empty(self):
        synced = self.config / "omarchy" / "grokbot-bots.json"
        self.assertTrue(self.route_json("Hey OmaBot hi")["matched"])
        real = self.dir / "elsewhere.json"
        self.write_roster(real, self.custom)
        synced.symlink_to(real)
        self.assertFalse(self.route_json("Hey Zephyr hi")["matched"], "a symlinked roster is not followed")
        self.assertTrue(self.route_json("Hey OmaBot hi")["matched"])
        synced.unlink()
        synced.write_text(json.dumps({"bots": self.custom, "pad": "x" * (1024 * 1024)}), encoding="utf-8")
        self.assertFalse(self.route_json("Hey Zephyr hi")["matched"], "an oversized roster is ignored")
        self.write_roster(synced, [])
        self.assertTrue(self.route_json("Hey OmaBot hi")["matched"])

    def test_fifo_roster_does_not_block(self):
        os.mkfifo(self.config / "omarchy" / "grokbot-bots.json")
        started = time.monotonic()
        self.assertTrue(self.route_json("Hey OmaBot hi")["matched"])
        self.assertLess(time.monotonic() - started, 5)

    def test_env_override_wins(self):
        self.write_roster(self.config / "omarchy" / "grokbot-bots.json", self.custom)
        other = self.dir / "other.json"
        self.write_roster(other, [{"id": "x1", "name": "Quill", "shortName": "Quill"}])
        self.assertEqual(self.route_json("Hey Quill hi", {"GROKBOT_BOTS": str(other)})["botId"], "x1")
        self.assertFalse(self.route_json("Hey Zephyr hi", {"GROKBOT_BOTS": str(other)})["matched"])


class FilterPassThrough(Sandbox):
    def test_long_non_wake_text_is_returned_byte_for_byte(self):
        body = ("plain words café 日本語\r\n".encode("utf-8") * 120000) + b"\xff\xfe tail"
        self.assertGreater(len(body), 2 * 1024 * 1024)
        result = self.run_script(ROUTE, ["--filter"], body)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, body)
        self.assertEqual(self.delivered(), [])

    def test_long_non_wake_text_is_typed_whole(self):
        typed = self.dir / "typed"
        wtype = self.tool("fake-wtype", "#!/usr/bin/python3\nimport os, sys\n"
                          "open(os.environ['TYPED'], 'wb').write(sys.stdin.buffer.read())\n"
                          "sys.exit(0 if sys.argv[1:] == ['-'] else 9)\n")
        body = "x" * 5000 + "\nend"
        result = self.run_script(ROUTE, ["--wtype"], body.encode(), {"GROKBOT_WTYPE": str(wtype), "TYPED": str(typed)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(typed.read_bytes(), body.encode())

    def test_long_wake_line_routes_its_first_4000_characters(self):
        text = "Hey Bot, " + "é" * 6000
        result = self.run_script(ROUTE, ["--filter"], text.encode())
        self.assertEqual(result.stdout, b"")
        self.assertEqual(self.delivered()[0]["text"], text[:4000])

    def test_backend_without_value_is_a_usage_error(self):
        result = self.run_script(ROUTE, ["--filter", "--backend"], b"Hey Bot hi")
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"--backend", result.stderr)
        self.assertClean(result)
        self.assertEqual(self.delivered(), [])


class VoiceWatch(Sandbox):
    def watch(self, *args, env=None, timeout=20):
        result = self.run_script(WATCH, ["--enable", *args], env=env, timeout=timeout)
        self.assertClean(result)
        return result

    def test_large_json_transcript_is_parsed_whole(self):
        path = self.dir / "t.json"
        path.write_text(json.dumps({"meta": "m" * 20000, "text": "Hey Writer draft a note"}), encoding="utf-8")
        result = self.watch("--check-file", str(path), "--backend", "voxtype")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.delivered(), [{"backend": "voxtype", "text": "Hey Writer draft a note"}])

    def test_symlink_fifo_and_oversized_transcripts_are_skipped(self):
        real = self.dir / "real.txt"
        real.write_text("Hey Bot hi", encoding="utf-8")
        link = self.dir / "link.txt"
        link.symlink_to(real)
        fifo = self.dir / "pipe.txt"
        os.mkfifo(fifo)
        huge = self.dir / "huge.json"
        huge.write_text(json.dumps({"text": "Hey Bot hi", "pad": "p" * (1024 * 1024)}), encoding="utf-8")
        bad = self.dir / "bad.txt"
        bad.write_bytes(b"Hey Bot \xff\xfe hi")
        for path in (link, fifo, huge):
            result = self.watch("--check-file", str(path), timeout=5)
            self.assertEqual(result.returncode, 1, path.name)
            self.assertFalse(json.loads(result.stdout)["matched"], path.name)
        result = self.watch("--check-file", str(bad))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["prompt"], "�� hi")
        self.assertEqual(len(self.delivered()), 1)

    def test_backend_without_value_is_a_usage_error(self):
        path = self.dir / "t.txt"
        path.write_text("Hey Bot hi", encoding="utf-8")
        for args in (["--check-file", str(path), "--backend"], ["--check-file"], ["--once", "--backend", "--x"]):
            result = self.watch(*args)
            self.assertEqual(result.returncode, 2, args)
            self.assertIn(b"needs a value", result.stderr)
        self.assertEqual(self.delivered(), [])

    def test_once_routes_a_transcript_written_just_before(self):
        folder = self.data / "superwhisper" / "recordings"
        folder.mkdir(parents=True)
        (folder / "new.json").write_text(json.dumps({"text": "Hey Zephyr? no, Hey Bot first"}), encoding="utf-8")
        (folder / "fresh.txt").write_text("Hey Inbox Admin, triage", encoding="utf-8")
        old = folder / "old.txt"
        old.write_text("Hey Writer, stale", encoding="utf-8")
        hour_ago = time.time() - 3600
        os.utime(old, (hour_ago, hour_ago))
        real = self.dir / "outside.txt"
        real.write_text("Hey Bob, via link", encoding="utf-8")
        (folder / "linked.txt").symlink_to(real)
        os.mkfifo(folder / "pipe.txt")
        result = self.watch("--once", timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), b"routed 1")
        self.assertEqual(self.delivered(), [{"backend": "superwhisper", "text": "Hey Inbox Admin, triage"}])

    def test_clipboard_read_is_bounded_and_never_raises(self):
        watch = load_script(WATCH, "voice_watch_under_test")
        saved = os.environ.get("PATH")
        os.environ["PATH"] = str(self.bin)
        try:
            self.tool("wl-paste", "#!/bin/sh\nprintf 'Hey Bot \\377\\376 hi'\n")
            self.assertEqual(watch.read_clipboard(), "Hey Bot �� hi")
            self.tool("wl-paste", "#!/bin/sh\nexec /bin/sleep 30\n")
            started = time.monotonic()
            self.assertEqual(watch.read_clipboard(), "")
            self.assertLess(time.monotonic() - started, 5)
            self.tool("wl-paste", "#!/bin/sh\nexec /usr/bin/yes 'Hey Bot'\n")
            self.assertEqual(watch.read_clipboard(), "")
            self.tool("wl-paste", "#!/bin/sh\nexit 1\n")
            self.assertEqual(watch.read_clipboard(), "")
        finally:
            os.environ["PATH"] = saved or ""


class DictateToggle(Sandbox):
    def dictate(self, timeout_seconds=None):
        if timeout_seconds is None:
            return self.run_script(DICTATE)
        code = ("import importlib.machinery, importlib.util, sys\n"
                f"loader = importlib.machinery.SourceFileLoader('d', {str(DICTATE)!r})\n"
                "spec = importlib.util.spec_from_loader('d', loader)\n"
                "m = importlib.util.module_from_spec(spec); loader.exec_module(m)\n"
                f"m.TIMEOUT = m.TRANSCRIBE_TIMEOUT = {timeout_seconds}\n"
                "sys.exit(m.main())\n")
        return subprocess.run([sys.executable, "-c", code], capture_output=True, env=self.env, timeout=20)

    def logger(self, name, exit_code=0, extra=""):
        self.tool(name, f"#!/bin/sh\necho \"{name} $*\" >> \"$LOG\"\n{extra}exit {exit_code}\n")

    def calls(self):
        log = self.dir / "log"
        return log.read_text(encoding="utf-8").split("\n")[:-1] if log.exists() else []

    def setUp(self):
        super().setUp()
        self.env["LOG"] = str(self.dir / "log")
        self.env["PATH"] = str(self.bin)

    def test_failed_backend_does_not_fall_through(self):
        self.logger("superwhisper", 1)
        self.logger("voxtype")
        result = self.dictate()
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"Superwhisper did not take", result.stderr)
        self.assertEqual(self.calls(), ["superwhisper record"])

    def test_timed_out_backend_does_not_fall_through(self):
        self.logger("superwhisper", 0, "/bin/sleep 5\n")
        self.logger("voxtype")
        started = time.monotonic()
        result = self.dictate(timeout_seconds=0.5)
        self.assertLess(time.monotonic() - started, 4)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"Superwhisper did not take", result.stderr)
        self.assertEqual(self.calls(), ["superwhisper record"])

    def test_a_daemon_holding_the_pipe_does_not_turn_success_into_a_timeout(self):
        # `superwhisper record` exits at once but leaves a background child on stdout.
        self.logger("superwhisper", 0, "/bin/sleep 5 &\n")
        self.logger("voxtype")
        started = time.monotonic()
        result = self.dictate(timeout_seconds=3)
        self.assertLess(time.monotonic() - started, 2.5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), ["superwhisper record"])

    def test_omarchy_failure_other_than_unknown_command_stops(self):
        self.logger("omarchy", 1, "echo 'voxtype is not configured' >&2\n")
        self.logger("superwhisper")
        self.assertEqual(self.dictate().returncode, 1)
        self.assertEqual(self.calls(), ["omarchy dictation toggle"])

    def test_missing_or_unknown_moves_on(self):
        self.logger("omarchy", 1, "echo 'Unknown Omarchy command: dictation' >&2\n")
        self.logger("voxtype")
        result = self.dictate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), ["omarchy dictation toggle", "voxtype record toggle"])

    def test_hex_transcript_with_invalid_utf8_is_replaced(self):
        self.tool("hex", "#!/bin/sh\ncase \"$*\" in\n"
                  "  'status --json') printf '{\"capture\":{\"state\":\"recording\"}}'; exit 0 ;;\n"
                  "  'dictation stop --print') printf 'caf\\351 ok\\n'; exit 0 ;;\n"
                  "esac\nexit 2\n")
        (self.config / "omarchy" / "defaults").mkdir(parents=True)
        (self.config / "omarchy" / "defaults" / "dictation").write_bytes(b"hex\n\xff")
        result = self.dictate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode("utf-8"), "caf� ok")


if __name__ == "__main__":
    unittest.main()
