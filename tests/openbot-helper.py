#!/usr/bin/env python3
"""Helper-level OpenBot transport tests. No OpenBot host or network."""
import asyncio
import contextlib
from contextlib import redirect_stderr
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop.openbot import HANDOFF, OpenBot
from agent_desktop.protocol import Fault

HELPER_PATH = ROOT/"bin/openbot-local-scripts"
SECRET = "SUPERSECRET"
PROMPT = "Summarise the build without leaking the token"


def load_helper():
    loader = importlib.machinery.SourceFileLoader("openbot_local_scripts", str(HELPER_PATH))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


@contextlib.contextmanager
def env(**updates):
    previous = {}
    for key, value in updates.items():
        previous[key] = os.environ.get(key)
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def wait_dead(pid, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not alive(pid):
            return True
        time.sleep(0.05)
    return not alive(pid)


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.helper = load_helper()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.helper.CONFIG = self.root/"missing.json"

    def test_ssh_basename_quotes_the_remote_script(self):
        script = self.helper.remote_script("GET", "/v1/agents/agent-1/pending",
                                           directory="/data/.config/OpenBot/automation")
        self.assertNotIn(SECRET, script)
        self.assertNotIn("OPENBOT_AUTOMATION_DIR", script)
        self.assertIn('-H @"$directory/headers"', script)
        self.assertIn("http://127.0.0.1:", script)
        with env(OPENBOT_LOCAL_SCRIPTS_HOP="/usr/bin/ssh -o BatchMode=yes user@host docker exec -i openbot bash -lc"):
            command = self.helper.transport_command(script)
        self.assertEqual(command[0], "/usr/bin/ssh")
        self.assertEqual(shlex.split(command[-1])[-1], script)
        self.assertEqual(command[-2], "user@host")
        with env(OPENBOT_LOCAL_SCRIPTS_HOP="sudo -u openbot /usr/local/bin/ssh -o BatchMode=yes user@host bash -lc"):
            command = self.helper.transport_command("printf hi")
        self.assertEqual(command[0], "sudo")
        self.assertEqual(os.path.basename(command[3]), "ssh")
        self.assertEqual(shlex.split(command[-1])[-1], "printf hi")
        with env(OPENBOT_LOCAL_SCRIPTS_HOP="bash -lc"):
            command = self.helper.transport_command(script)
        self.assertEqual(command, ["bash", "-lc", script])
        with env(OPENBOT_LOCAL_SCRIPTS_HOP="ssh-keygen -lf /dev/null"):
            command = self.helper.transport_command("echo")
        self.assertEqual(command[0], "ssh-keygen")
        self.assertEqual(command[-1], "echo")

    def test_automation_directory_is_explicit_and_not_the_local_env(self):
        with env(OPENBOT_AUTOMATION_DIR="/tmp/local-only", OPENBOT_REMOTE_AUTOMATION_DIR=None):
            self.assertEqual(self.helper.automation_dir(), self.helper.DEFAULT_AUTOMATION)
            script = self.helper.remote_script("GET", "/v1/agents")
        self.assertIn("/data/.config/OpenBot/automation", script)
        self.assertNotIn("/tmp/local-only", script)
        config = self.root/"agent-desktop.json"
        config.write_text(json.dumps({"providers": {"openbot": {"automationDir": "/opt/openbot/automation"}}}))
        self.helper.CONFIG = config
        with env(OPENBOT_AUTOMATION_DIR="/tmp/local-only", OPENBOT_REMOTE_AUTOMATION_DIR=None):
            self.assertEqual(self.helper.automation_dir(), "/opt/openbot/automation")
        with env(OPENBOT_REMOTE_AUTOMATION_DIR="/srv/openbot/automation"):
            self.assertEqual(self.helper.automation_dir(), "/srv/openbot/automation")
        with env(OPENBOT_REMOTE_AUTOMATION_DIR="/tmp/bad\ndir"):
            with self.assertRaises(self.helper.HelperError):
                self.helper.automation_dir()

    def test_automation_directory_is_quoted_before_the_remote_shell_runs(self):
        marker = self.root/"pwned"
        directory = "/tmp/$(touch %s)" % marker
        script = self.helper.remote_script("GET", "/v1/agents", directory=directory, timeout=5)
        proc = subprocess.run(["bash", "-lc", script], capture_output=True, timeout=5)
        self.assertFalse(marker.exists())
        self.assertEqual(proc.returncode, 2)
        self.assertEqual(proc.stdout.strip(), b"missing_automation")

    def test_destination_must_be_loopback_http(self):
        auto = self.root/"automation"
        auto.mkdir()
        (auto/"headers").write_text("Authorization: Bearer %s\n" % SECRET)
        called = self.root/"curl-called"
        bindir = self.root/"bin"
        bindir.mkdir()
        curl = bindir/"curl"
        curl.write_text("#!/bin/sh\ntouch '%s'\nprintf 200\n" % called)
        curl.chmod(0o755)
        path = "%s:%s" % (bindir, os.environ.get("PATH", ""))
        for url in ("https://127.0.0.1:9", "http://localhost:9", "http://127.0.0.1:9/extra",
                    "http://evil.example", "http://127.0.0.1:65536", "http://127.0.0.1:007",
                    "http://user:pass@127.0.0.1:9"):
            called.unlink(missing_ok=True)
            (auto/"url").write_text(url + "\n")
            script = self.helper.remote_script("GET", "/v1/agents", directory=str(auto), timeout=5)
            proc = subprocess.run(["bash", "-lc", script], capture_output=True, timeout=5,
                                  env={**os.environ, "PATH": path})
            self.assertEqual(proc.returncode, 3, url)
            self.assertEqual(proc.stdout.strip(), b"invalid_url")
            self.assertFalse(called.exists(), url)
            self.assertNotIn(SECRET.encode(), proc.stdout + proc.stderr)
        (auto/"url").write_text("http://127.0.0.1:9\n")
        script = self.helper.remote_script("GET", "/v1/agents", directory=str(auto), timeout=5)
        proc = subprocess.run(["bash", "-lc", script], capture_output=True, timeout=5,
                              env={**os.environ, "PATH": path})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(called.exists())

    def test_raw_hop_stderr_is_not_forwarded(self):
        bad = self.root/"bad.py"
        bad.write_text(textwrap.dedent("""\
            import sys
            sys.stderr.write(%r)
            sys.stdout.write("also %s\\n")
            raise SystemExit(3)
        """) % (SECRET + " from ssh\n", SECRET))
        with env(OPENBOT_LOCAL_SCRIPTS_HOP="%s %s" % (sys.executable, bad),
                 OPENBOT_REMOTE_AUTOMATION_DIR=None):
            proc = subprocess.run([sys.executable, "-I", str(HELPER_PATH), "agents"],
                                  capture_output=True, timeout=10)
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stderr.strip(), b"hop_failed")
        self.assertNotIn(SECRET.encode(), proc.stdout + proc.stderr)

    def test_output_limit_stops_before_forwarding_the_body(self):
        writer = self.root/"writer.py"
        writer.write_text("import sys\nsys.stdout.buffer.write(b'A'*200000)\nsys.stderr.write(%r)\n" % SECRET)
        with env(OPENBOT_LOCAL_SCRIPTS_HOP="%s %s" % (sys.executable, writer)):
            proc = subprocess.run([sys.executable, "-I", str(HELPER_PATH), "agents"],
                                  capture_output=True, timeout=10)
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stderr.strip(), b"output_limit")
        self.assertNotIn(b"A"*64, proc.stdout)
        self.assertNotIn(SECRET.encode(), proc.stdout + proc.stderr)

    def test_timeout_reaps_helper_children(self):
        hop_pid = self.root/"hop"
        child_pid = self.root/"child"
        sleeper = self.root/"sleeper.py"
        sleeper.write_text(textwrap.dedent("""\
            import os, time
            from pathlib import Path
            Path(os.environ["HOP_PID"]).write_text(str(os.getpid()))
            child = os.fork()
            if child == 0:
                Path(os.environ["CHILD_PID"]).write_text(str(os.getpid()))
                time.sleep(120)
                raise SystemExit(0)
            Path(os.environ["CHILD_PID"]).write_text(str(child))
            time.sleep(120)
        """))
        with env(HOP_PID=str(hop_pid), CHILD_PID=str(child_pid)):
            err = io.StringIO()
            with redirect_stderr(err):
                code = self.helper.execute([sys.executable, str(sleeper)], timeout=2)
        self.assertEqual(code, 1)
        self.assertEqual(err.getvalue().strip(), "hop_timeout")
        self.assertTrue(hop_pid.exists() and child_pid.exists())
        hop = int(hop_pid.read_text())
        child = int(child_pid.read_text())
        self.addCleanup(lambda: os.kill(hop, 9) if alive(hop) else None)
        self.addCleanup(lambda: os.kill(child, 9) if alive(child) else None)
        self.assertTrue(wait_dead(hop))
        self.assertTrue(wait_dead(child))

    def test_prompt_and_token_stay_out_of_argv(self):
        auto = self.root/"automation"
        auto.mkdir()
        (auto/"url").write_text("http://127.0.0.1:9\n")
        (auto/"headers").write_text("Authorization: Bearer %s\n" % SECRET)
        (auto/"token").write_text(SECRET + "\n")
        log = self.root/"curl-log"
        log.write_text("")
        bindir = self.root/"bin"
        bindir.mkdir()
        curl = bindir/"curl"
        curl.write_text(textwrap.dedent("""\
            #!/usr/bin/env python3
            import os, sys
            from pathlib import Path
            args = sys.argv[1:]
            secret = os.environ["SECRET"].encode()
            output = None
            data = None
            url = None
            i = 0
            leaked = []
            while i < len(args):
                item = args[i]
                if secret.decode() in item:
                    leaked.append("argv")
                if item == "--output":
                    output = args[i + 1]; i += 2; continue
                if item == "--data-binary":
                    data = args[i + 1]; i += 2; continue
                if item in {"--connect-timeout", "--max-time", "--request", "-H"}:
                    i += 2; continue
                if item.startswith("-"):
                    i += 1; continue
                url = item
                i += 1
            stdin = sys.stdin.buffer.read() if data == "@-" else b""
            if secret in stdin:
                leaked.append("stdin")
            Path(os.environ["CURL_LOG"]).write_text("URL %s\\nSTDIN %s\\nLEAK %s\\n" % (
                url or "", stdin.decode("utf-8", "replace"), ",".join(leaked)))
            body = b'{"messageId":"m-1","deliveries":[{"id":"delivery-1","recipientAgentId":"agent-1"}]}'
            fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            os.write(fd, body)
            os.close(fd)
            sys.stderr.write(secret.decode() + " from curl\\n")
            sys.stdout.write("202")
        """))
        curl.chmod(0o755)
        env_values = {**os.environ,
                      "OPENBOT_LOCAL_SCRIPTS_HOP": "bash -c",
                      "OPENBOT_REMOTE_AUTOMATION_DIR": str(auto),
                      "OPENBOT_AUTOMATION_DIR": "/tmp/not-forwarded",
                      "PATH": "%s:%s" % (bindir, os.environ.get("PATH", "")),
                      "CURL_LOG": str(log), "SECRET": SECRET}
        proc = subprocess.run([sys.executable, "-I", str(HELPER_PATH), "send", "agent-1"],
                              input=PROMPT.encode(), capture_output=True, timeout=15, env=env_values)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertNotIn(SECRET.encode(), proc.stdout + proc.stderr)
        self.assertNotIn(PROMPT.encode(), proc.stderr)
        recorded = log.read_text()
        self.assertIn("/v1/agents/agent-1/messages", recorded)
        self.assertIn(PROMPT, recorded)
        self.assertIn("LEAK \n", recorded)
        self.assertNotIn(SECRET, recorded.split("STDIN", 1)[0])
        script = self.helper.remote_script("POST", "/v1/agents/agent-1/messages", self.helper.POST_EXTRA,
                                           directory=str(auto))
        self.assertNotIn(PROMPT, script)
        self.assertNotIn(SECRET, script)


class AdapterHelperTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.events = []

    async def asyncTearDown(self):
        self.temp.cleanup()

    async def test_pending_handoff_through_the_helper(self):
        auto = self.root/"automation"
        auto.mkdir()
        (auto/"url").write_text("http://127.0.0.1:9\n")
        (auto/"headers").write_text("Authorization: Bearer %s\n" % SECRET)
        log = self.root/"curl-log"
        count = self.root/"count"
        log.write_text("")
        count.write_text("0")
        bindir = self.root/"bin"
        bindir.mkdir()
        curl = bindir/"curl"
        curl.write_text(textwrap.dedent("""\
            #!/usr/bin/env python3
            import os, sys
            from pathlib import Path
            args = sys.argv[1:]
            secret = os.environ["SECRET"]
            if any(secret in item for item in args):
                Path(os.environ["CURL_LOG"]).write_text("LEAK\\n")
                raise SystemExit(9)
            output = None
            data = None
            url = None
            i = 0
            while i < len(args):
                item = args[i]
                if item == "--output":
                    output = args[i + 1]; i += 2; continue
                if item == "--data-binary":
                    data = args[i + 1]; i += 2; continue
                if item in {"--connect-timeout", "--max-time", "--request", "-H"}:
                    i += 2; continue
                if item.startswith("-"):
                    i += 1; continue
                url = item
                i += 1
            stdin = sys.stdin.buffer.read() if data == "@-" else b""
            path = url or ""
            if path.endswith("/messages"):
                body = b'{"messageId":"m-1","deliveries":[{"id":"delivery-1","recipientAgentId":"agent-1"}]}'
                code = "202"
            elif "/deliveries/" in path:
                counter = Path(os.environ["COUNT"])
                seen = int(counter.read_text() or "0") + 1
                counter.write_text(str(seen))
                if seen == 1:
                    body = b'{"id":"delivery-1","status":"running","answer":null,"error":null}'
                else:
                    body = b'{"id":"delivery-1","status":"completed","answer":"done","error":null}'
                code = "200"
            elif path.endswith("/pending"):
                body = b'{"prompts":[{"requestId":"req-1","requiresOpenBot":true,"questions":[],"leak":"SECRET-QUESTION"}],"approvals":[],"browserTakeovers":[{"requestId":"br-1","requiresOpenBot":true}]}'
                code = "200"
            else:
                body = b'[{"id":"agent-1","name":"Ada"}]'
                code = "200"
            with Path(os.environ["CURL_LOG"]).open("a") as handle:
                handle.write("URL %s\\nSTDIN %s\\n" % (path, stdin.decode("utf-8", "replace")))
            fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            os.write(fd, body)
            os.close(fd)
            sys.stderr.write(secret + "\\n")
            sys.stdout.write(code)
        """))
        curl.chmod(0o755)
        updates = dict(OPENBOT_LOCAL_SCRIPTS_HOP="bash -c",
                       OPENBOT_REMOTE_AUTOMATION_DIR=str(auto),
                       OPENBOT_AUTOMATION_DIR="/tmp/not-forwarded",
                       PATH="%s:%s" % (bindir, os.environ.get("PATH", "")),
                       CURL_LOG=str(log), COUNT=str(count), SECRET=SECRET)
        with env(**updates):
            adapter = OpenBot(hop="bash -c", poll_interval=0, timeout=30)
            adapter.configured = True
            adapter.emit = lambda name, params: self.events.append((name, params))
            try:
                reply = await adapter.call("message.send", {"agentId": "agent-1", "requestId": "turn-1",
                                                            "text": PROMPT})
                self.assertTrue(reply["accepted"])
                self.assertEqual(reply["deliveryId"], "delivery-1")
                for _ in range(100):
                    if any(name == "message.finished" for name, _ in self.events):
                        break
                    await asyncio.sleep(0.05)
            finally:
                await adapter.close()
        finished = [params for name, params in self.events if name == "message.finished"]
        prompts = [params for name, params in self.events if name == "prompt.required"]
        self.assertEqual(len(finished), 1)
        self.assertEqual(finished[0]["status"], "completed")
        self.assertEqual(finished[0]["text"], "done")
        self.assertTrue(prompts)
        self.assertTrue(all(item["answerable"] is False for item in prompts))
        self.assertTrue(any(item["text"] == HANDOFF["secret"] for item in prompts))
        self.assertTrue(any(item["text"] == HANDOFF["browser"] for item in prompts))
        blob = json.dumps(self.events)
        self.assertNotIn("SECRET-QUESTION", blob)
        self.assertNotIn(SECRET, blob)
        recorded = log.read_text()
        self.assertIn(PROMPT, recorded)
        self.assertIn("/pending", recorded)
        self.assertNotIn("/answer", recorded)
        self.assertNotIn("/respond", recorded)
        self.assertNotIn("LEAK", recorded)
        self.assertNotIn(SECRET, recorded)

    async def test_adapter_reaps_the_hop_when_the_helper_is_stopped(self):
        hop_pid = self.root/"hop"
        child_pid = self.root/"child"
        sleeper = self.root/"sleeper.py"
        sleeper.write_text(textwrap.dedent("""\
            import os, time
            from pathlib import Path
            Path(os.environ["HOP_PID"]).write_text(str(os.getpid()))
            child = os.fork()
            if child == 0:
                Path(os.environ["CHILD_PID"]).write_text(str(os.getpid()))
                time.sleep(120)
                raise SystemExit(0)
            Path(os.environ["CHILD_PID"]).write_text(str(child))
            time.sleep(120)
        """))
        hop = "%s %s" % (sys.executable, sleeper)
        with env(OPENBOT_LOCAL_SCRIPTS_HOP=hop, HOP_PID=str(hop_pid), CHILD_PID=str(child_pid)):
            adapter = OpenBot(hop=hop, timeout=5)
            adapter.configured = True
            with self.assertRaises(Fault) as caught:
                await adapter._run(["agents"], timeout=2)
            await adapter.close()
        self.assertEqual(caught.exception.code, "delivery_unknown")
        self.assertNotIn(SECRET, caught.exception.message)
        self.assertTrue(hop_pid.exists() and child_pid.exists())
        hop_id = int(hop_pid.read_text())
        child = int(child_pid.read_text())
        self.addCleanup(lambda: os.kill(hop_id, 9) if alive(hop_id) else None)
        self.addCleanup(lambda: os.kill(child, 9) if alive(child) else None)
        self.assertTrue(wait_dead(hop_id))
        self.assertTrue(wait_dead(child))

    def test_desktop_ask_does_not_force_the_shared_timeout(self):
        source = (ROOT/"bin/agent-desktop-ask").read_text()
        self.assertIn("ask_timeout", source)
        self.assertIn("if pass_timeout:", source)
        qml = (ROOT/"Main.qml").read_text()
        self.assertIn('provider === "openbot" ? "OpenBot" : "Hermes"', qml)
        self.assertNotIn("Open Hermes to review and answer this one.", qml)


if __name__ == "__main__":
    unittest.main()
