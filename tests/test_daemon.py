"""Integration tests for bin/agent-desktopd and its control socket.

The process tests run the real daemon with the bundled example provider. The
in-process tests drive agent_desktop.daemon.Daemon with stand-in adapters for
behaviour the example cannot show (a deferred webhook reply, a child process
to reap) while still using the real control socket and bin/grokbot-desktop-ctl.
"""
import asyncio
import contextlib
import hashlib
import json
import os
from pathlib import Path
import queue
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop import daemon as daemon_module  # noqa: E402
from agent_desktop import state as conv  # noqa: E402
from agent_desktop.protocol import decode  # noqa: E402

DAEMON = ROOT / "bin/agent-desktopd"
CTL = ROOT / "bin/grokbot-desktop-ctl"
ECHO = {"id": "example:echo", "agentId": "echo", "provider": "example", "name": "Example Agent", "shortName": "Echo"}


def unix_listen_works():
    with tempfile.TemporaryDirectory() as directory:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.bind(os.path.join(directory, "probe"))
                sock.listen(1)
            return True
        except OSError:
            return False


SOCKETS = unix_listen_works()
NO_SOCKETS = "this sandbox refuses Unix-socket listen, so the control socket cannot be exercised"


class Home:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name) / "home"
        self.runtime = Path(self.temp.name) / "runtime"
        (self.home / ".config/omarchy").mkdir(parents=True)
        self.runtime.mkdir(mode=0o700)
        self.env = {"HOME": str(self.home), "XDG_CONFIG_HOME": str(self.home / ".config"),
                    "XDG_RUNTIME_DIR": str(self.runtime), "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}

    def ctl(self, *args, text="", env=None):
        return subprocess.run(["/usr/bin/python3", "-I", str(CTL), *args], input=text, text=True,
                              capture_output=True, env={**self.env, **(env or {})}, timeout=10)


class Process:
    def __init__(self, env):
        self.proc = subprocess.Popen(["/usr/bin/python3", "-I", str(DAEMON)], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        self.frames = queue.Queue()
        self.seen = []
        self.count = 0
        threading.Thread(target=self.pump, daemon=True).start()

    def pump(self):
        for raw in self.proc.stdout:
            self.frames.put(decode(raw))
        self.frames.put(None)

    def send(self, method, params=None):
        self.count += 1
        op = f"op{self.count}"
        self.proc.stdin.write((json.dumps({"v": 1, "id": op, "method": method, "params": params or {}}) + "\n").encode())
        self.proc.stdin.flush()
        return op

    def wait(self, test, timeout=5):
        deadline = time.monotonic() + timeout
        while True:
            for frame in self.seen:
                if test(frame):
                    return frame
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError(f"no matching frame; saw {self.seen[-6:]}")
            try:
                frame = self.frames.get(timeout=remaining)
            except queue.Empty:
                continue
            if frame is None:
                raise AssertionError(f"daemon exited; saw {self.seen[-6:]}")
            self.seen.append(frame)

    def call(self, method, params=None, timeout=5):
        op = self.send(method, params)
        frame = self.wait(lambda f: f.get("id") == op, timeout)
        return frame.get("result", frame.get("error")), self.seen.index(frame)

    def after(self, index):
        return self.seen[index + 1:]

    def close(self):
        if self.proc.poll() is None:
            self.proc.kill()
        self.proc.wait()
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            with contextlib.suppress(OSError):
                stream.close()


def states(frames):
    return [f["params"] for f in frames if f.get("event") == "state"]


def effects(frames):
    return [f["params"]["kind"] for f in frames if f.get("event") == "effect"]


class DaemonProcess(unittest.TestCase):
    def setUp(self):
        self.box = Home()
        self.addCleanup(self.box.temp.cleanup)
        self.d = Process(self.box.env)
        self.addCleanup(self.d.close)
        hello, _ = self.d.call("hello")
        self.hello = hello
        self.assertEqual(self.d.call("roster.set", {"bots": [ECHO]})[0], "ok")
        self.assertEqual(self.d.call("view.set", {"botId": ECHO["id"], "bubbleOpen": False})[0], "ok")

    def body_is(self, text):
        return self.d.wait(lambda f: f.get("event") == "state" and f["params"]["body"] == text)

    def test_handshake_and_request_errors(self):
        self.assertEqual(self.hello["protocol"], {"major": 1, "minor": 0})
        self.assertEqual(self.hello["maxFrameBytes"], 1024 * 1024)
        self.assertEqual(self.d.call("hello")[0]["code"], "invalid_request")
        self.assertEqual(self.d.call("nope")[0]["code"], "unsupported")
        self.assertEqual(self.d.call("view.set", {"botId": 3})[0]["code"], "invalid_request")
        self.assertEqual(self.d.call("roster.set", {"bots": [{"id": "x"}]})[0]["code"], "invalid_request")
        self.d.proc.stdin.write(b'{"v":1,"id":"op1","method":"state.get"}\nnot json\n')
        self.d.proc.stdin.flush()
        self.d.wait(lambda f: f.get("id") == "op1" and f.get("error", {}).get("code") == "duplicate_id")
        self.d.wait(lambda f: f.get("id") is None and "error" in f)
        snap, _ = self.d.call("state.get")
        self.assertEqual(snap["botId"], ECHO["id"])

    def test_streamed_ask_lands_before_its_response_is_stale(self):
        result, at = self.d.call("ask.send", {"text": "Private words"})
        self.assertEqual(result, "ok")
        before = self.d.seen[:at]
        self.assertTrue(states(before)[-1]["asking"])
        self.assertEqual(effects(before)[-3:], ["draft-clear", "open", "ask-started"])
        delta = self.d.wait(lambda f: f.get("event") == "ask.delta")
        self.assertEqual(delta["params"]["text"], "Example:")
        self.assertEqual(delta["params"]["botId"], ECHO["id"])
        final = self.body_is("Example: Private words")
        self.assertFalse(final["params"]["asking"])
        self.d.wait(lambda f: f.get("event") == "effect" and f["params"]["kind"] == "landed")
        seqs = [f["seq"] for f in self.d.seen if "seq" in f]
        self.assertEqual(seqs, list(range(1, len(seqs) + 1)))
        self.assertEqual(self.d.call("ask.send", {"text": "  ", "mode": "line"})[0], "empty")

    def test_cancel_stops_the_ask_and_ignores_its_late_answer(self):
        start = time.monotonic()
        self.d.send("ask.send", {"text": "slow"})
        result, at = self.d.call("ask.cancel")
        self.assertEqual(result, "ok")
        self.assertLess(time.monotonic() - start, 1)
        self.assertEqual(states(self.d.seen[:at])[-1]["body"], conv.STOPPED_TEXT)
        time.sleep(0.3)
        snap, _ = self.d.call("state.get")
        self.assertEqual((snap["body"], snap["asking"]), (conv.STOPPED_TEXT, False))
        self.assertFalse(any("Example: slow" in json.dumps(f) for f in self.d.seen))
        self.assertEqual(self.d.call("ask.cancel")[0], "nothing")
        self.assertEqual(self.d.call("ask.send", {"text": "again"})[0], "ok")
        self.body_is("Example: again")

    def test_clear_undo_and_notice(self):
        self.assertEqual(self.d.call("thread.clear")[0], "nothing to clear")
        self.assertEqual(self.d.call("notice.say", {"title": "Build", "text": "done",
                                                    "links": [{"label": "Log", "url": "http://example.com"}]})[0], "invalid link")
        self.assertEqual(self.d.call("notice.say", {"title": "Build", "text": "done",
                                                    "links": [{"label": "Log", "url": "https://example.com"}]})[0], "ok")
        self.assertEqual(self.d.call("thread.clear")[0], "ok")
        self.assertTrue(states(self.d.seen)[-1]["undo"])
        self.assertEqual(self.d.call("thread.undo")[0], "ok")
        snap = states(self.d.seen)[-1]
        self.assertEqual((snap["body"], snap["links"], snap["undo"]), ("Build\ndone", [{"label": "Log", "url": "https://example.com"}], False))

    def test_eof_and_sigterm_shut_down(self):
        self.d.proc.stdin.close()
        self.assertEqual(self.d.proc.wait(5), 0)
        other = Process(self.box.env)
        self.addCleanup(other.close)
        other.call("hello")
        other.send("roster.set", {"bots": [ECHO]})
        other.send("view.set", {"botId": ECHO["id"]})
        other.call("ask.send", {"text": "x"})
        other.proc.send_signal(signal.SIGTERM)
        self.assertEqual(other.proc.wait(5), 0)

    @unittest.skipUnless(SOCKETS, NO_SOCKETS)
    def test_control_socket_reply_dictate_and_cleanup(self):
        self.assertTrue(self.hello["ctlSocket"])
        directory = self.box.runtime / "agent-desktop"
        sock = directory / "ctl.sock"
        self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.lstat(sock).st_mode), 0o600)
        done = self.box.ctl("reply", "Echo", text="private answer\n")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.body_is("private answer")
        refused = self.box.ctl("reply", "nobody", text="lost")
        self.assertEqual(refused.returncode, 1)
        self.assertIn("did not accept", refused.stderr)
        self.assertNotIn("lost", refused.stderr)
        ignored = self.box.ctl("dictate", text="buy milk\n")
        self.assertEqual(ignored.returncode, 1)
        spoken = self.box.ctl("dictate", text="hey echo dictated words\n")
        self.assertEqual(spoken.returncode, 0, spoken.stderr)
        self.body_is("Example: dictated words")
        self.d.proc.stdin.close()
        self.assertEqual(self.d.proc.wait(5), 0)
        self.assertFalse(os.path.lexists(sock))

    @unittest.skipUnless(SOCKETS, NO_SOCKETS)
    def test_unsafe_control_directory_disables_the_socket(self):
        self.d.proc.stdin.close()
        self.d.proc.wait(5)
        directory = self.box.runtime / "agent-desktop"
        directory.mkdir(exist_ok=True)
        directory.chmod(0o755)
        other = Process(self.box.env)
        self.addCleanup(other.close)
        self.assertFalse(other.call("hello")[0]["ctlSocket"])
        result = self.box.ctl("reply", "Echo", text="x")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Delivery was not confirmed", result.stderr)


@unittest.skipUnless(SOCKETS, NO_SOCKETS)
class ControlFallback(unittest.TestCase):
    """bin/grokbot-desktop-ctl uses the shell socket only when nothing listens on the daemon's."""

    def test_stale_daemon_socket_falls_back_to_the_shell_socket(self):
        box = Home()
        self.addCleanup(box.temp.cleanup)
        omarchy = Path(box.temp.name) / "omarchy"
        (omarchy / "shell").mkdir(parents=True)
        (omarchy / "shell/shell.qml").write_text("")
        display = box.runtime / "wayland-1"
        with socket.socket(socket.AF_UNIX) as wayland:
            wayland.bind(str(display))
        identity = hashlib.md5(f"{omarchy}/shell\nwayland-1".encode()).hexdigest()[:16]
        shell = socket.socket(socket.AF_UNIX)
        self.addCleanup(shell.close)
        shell.bind(str(box.runtime / f"omarchy-shell-{identity}.sock"))
        shell.listen(1)
        stale_dir = box.runtime / "agent-desktop"
        stale_dir.mkdir(mode=0o700)
        with socket.socket(socket.AF_UNIX) as stale:
            stale.bind(str(stale_dir / "ctl.sock"))
        received = []

        def serve():
            conn, _ = shell.accept()
            with conn:
                data = b""
                while not data.endswith(b"\x1e"):
                    data += conn.recv(4096)
                received.append(data)
                conn.sendall(b"OK\x1fok\x1e")
        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        result = box.ctl("reply", "abcdef123456", text="via shell",
                         env={"OMARCHY_PATH": str(omarchy), "WAYLAND_DISPLAY": "wayland-1"})
        thread.join(5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(received, [b"io.github.tcballard.grokbot-desktop\x1freply\x1fabcdef123456\x1fvia shell\x1e"])

    def test_insecure_daemon_directory_fails_closed(self):
        box = Home()
        self.addCleanup(box.temp.cleanup)
        (box.runtime / "agent-desktop").mkdir(mode=0o755)
        (box.runtime / "agent-desktop").chmod(0o755)
        result = box.ctl("dictate", text="hey bob hi")
        self.assertEqual(result.returncode, 1)
        self.assertIn("Delivery was not confirmed", result.stderr)


class Writer:
    def __init__(self):
        self.frames = []
        self.changed = asyncio.Event()

    def write(self, raw):
        self.frames.append(decode(raw))
        self.changed.set()

    async def drain(self):
        pass

    def close(self):
        pass


class Deferring:
    """A webhook-like adapter: acknowledges the ask and answers later through `reply`."""
    name = "fake"
    capabilities = {}

    def __init__(self, log):
        self.emit = None
        self.log = log

    async def call(self, method, params):
        self.log.append(("call", method, params["text"], params["attachments"]))
        asyncio.get_running_loop().call_soon(self.emit, "message.deferred", {
            "agentId": params["agentId"], "requestId": params["requestId"], "deliveryId": params["requestId"],
            "remoteMayContinue": True})
        return {"accepted": True, "requestId": params["requestId"]}

    async def close(self):
        self.log.append(("close",))


class Child:
    """An adapter whose ask is a child process that must be reaped on cancel."""
    name = "child"
    capabilities = {}

    def __init__(self, log):
        self.emit = None
        self.log = log
        self.proc = None

    async def call(self, method, params):
        self.proc = await asyncio.create_subprocess_exec("/usr/bin/sleep", "30")
        self.log.append(self.proc)
        return {"accepted": True}

    async def close(self):
        if self.proc and self.proc.returncode is None:
            self.proc.terminate()
            await self.proc.wait()


class InProcess(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.box = Home()
        self.addCleanup(self.box.temp.cleanup)
        patcher = mock.patch.dict(os.environ, {"XDG_RUNTIME_DIR": str(self.box.runtime)})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.log = []
        self.kind = Deferring
        self.writer = Writer()
        self.now = [5_000_000]
        self.d = daemon_module.Daemon(daemon_module.Output(self.writer), adapter_factory=lambda p: self.kind(self.log),
                                      timeout=lambda: 30, clock=lambda: self.now[0], tick_seconds=0.05,
                                      ctl=SOCKETS)
        self.reader = asyncio.StreamReader()
        self.task = asyncio.create_task(self.d.serve(self.reader))
        self.count = 0
        await self.call("hello")
        await self.call("roster.set", {"bots": [ECHO]})
        await self.call("view.set", {"botId": ECHO["id"]})

    async def asyncTearDown(self):
        self.reader.feed_eof()
        self.assertEqual(await asyncio.wait_for(self.task, 10), 0)

    async def wait(self, test, timeout=5):
        async with asyncio.timeout(timeout):
            while True:
                for frame in self.writer.frames:
                    if test(frame):
                        return frame
                self.writer.changed.clear()
                await self.writer.changed.wait()

    async def call(self, method, params=None):
        self.count += 1
        op = f"t{self.count}"
        self.reader.feed_data((json.dumps({"v": 1, "id": op, "method": method, "params": params or {}}) + "\n").encode())
        frame = await self.wait(lambda f: f.get("id") == op)
        return frame.get("result", frame.get("error"))

    def last_state(self):
        return [f["params"] for f in self.writer.frames if f.get("event") == "state"][-1]

    async def ctl(self, *args, text=""):
        proc = await asyncio.create_subprocess_exec("/usr/bin/python3", "-I", str(CTL), *args, env=self.box.env,
                                                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                                                    stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(text.encode()), 10)
        return proc.returncode, err.decode()

    async def test_deferred_ask_is_answered_through_the_control_socket(self):
        if not SOCKETS:
            self.skipTest(NO_SOCKETS)
        self.assertEqual(await self.call("attachments.set", {"files": ["/run/x.png"]}), "ok")
        self.assertEqual(await self.call("ask.send", {"text": "Deploy it"}), "ok")
        waiting = await self.wait(lambda f: f.get("event") == "state" and f["params"]["wait"])
        ask_id = waiting["params"]["wait"]
        self.assertEqual(waiting["params"]["awaitingBots"], [ECHO["id"]])
        self.assertEqual(self.log[:2], [("call", "message.send", "Deploy it", ["/run/x.png"]), ("close",)])
        code, err = await self.ctl("reply", ask_id, text="Deployed.\n")
        self.assertEqual(code, 0, err)
        landed = await self.wait(lambda f: f.get("event") == "state" and f["params"]["body"] == "Deployed.")
        self.assertEqual((landed["params"]["wait"], landed["params"]["awaitingBots"]), ("", []))
        await self.wait(lambda f: f.get("event") == "effect" and f["params"]["kind"] == "landed")
        code, _ = await self.ctl("reply", ask_id, text="twice")
        self.assertEqual(code, 1)

    async def test_waiting_question_expires_after_ten_minutes(self):
        await self.call("ask.send", {"text": "Deploy it"})
        await self.wait(lambda f: f.get("event") == "state" and f["params"]["wait"])
        self.now[0] += conv.REPLY_WAIT_MS
        expired = await self.wait(lambda f: f.get("event") == "state" and f["params"]["body"].startswith("No answer yet."))
        self.assertEqual(expired["params"]["body"], "No answer yet. Echo's reply will be in Grok Bot.")
        await self.wait(lambda f: f.get("event") == "effect" and f["params"]["kind"] == "rest")
        await asyncio.sleep(0.15)
        self.assertIsNone(self.d.ticker)

    async def test_cancel_reaps_the_child_quickly(self):
        self.kind = Child
        self.assertEqual(await self.call("ask.send", {"text": "work"}), "ok")
        async with asyncio.timeout(5):
            while not self.log:
                await asyncio.sleep(0.01)
        child = self.log[0]
        start = time.monotonic()
        self.assertEqual(await self.call("ask.cancel"), "ok")
        await asyncio.wait_for(child.wait(), 1)
        self.assertLess(time.monotonic() - start, 1)
        self.assertEqual(self.last_state()["body"], conv.STOPPED_TEXT)

    async def test_shutdown_reaps_an_ask_in_flight(self):
        self.kind = Child
        await self.call("ask.send", {"text": "work"})
        async with asyncio.timeout(5):
            while not self.log:
                await asyncio.sleep(0.01)
        self.assertEqual(await self.call("shutdown"), "ok")
        self.assertEqual(await asyncio.wait_for(self.task, 5), 0)
        self.assertIsNotNone(self.log[0].returncode)
        self.reader = asyncio.StreamReader()
        self.task = asyncio.create_task(asyncio.sleep(0, 0))

    async def test_undo_expiry_emits_state(self):
        await self.call("notice.say", {"title": "X", "text": "y"})
        self.d.undo_seconds = 0.05
        self.assertEqual(await self.call("thread.clear"), "ok")
        self.assertTrue(self.last_state()["undo"])
        await self.wait(lambda f: f.get("event") == "state" and not f["params"]["undo"] and f["params"]["body"] == "")

    async def test_snapshot_stays_under_the_frame_cap(self):
        wide = "一" * 4000
        for n in range(conv.HISTORY_LIMIT + 1):
            self.d.state.archive_exchange()
            self.d.state.cur.update(asked=wide, body=wide, files=["/" + "a" * 4095] * 4)
        snap = await self.call("state.get")
        self.assertGreater(snap["historyOmitted"], 0)
        self.assertEqual(len(snap["history"]) + snap["historyOmitted"], conv.HISTORY_LIMIT)


if __name__ == "__main__":
    unittest.main()
