"""Agent Desktop daemon: the shell's long-lived conversation and ask backend.

One process per desktop session, started by the shell, speaking NDJSON on
stdin/stdout (docs/DESKTOP-PROTOCOL.md). It owns every bot's conversation
(agent_desktop/state.py), runs asks through the provider adapters in process,
and accepts `reply` and `dictate` from bin/grokbot-desktop-ctl on a private
Unix socket. Nothing is written to disk.
"""
import asyncio
import collections
import os
from pathlib import Path
import socket
import stat
import struct
import sys
import time
import uuid

from .protocol import Fault, IDENTIFIER, MAX_FRAME, MAX_PROMPT, decode, encode, identifier, text
from . import state as conv

VERSION = 1
MINOR = 0
ROOT = Path(__file__).resolve().parent.parent
PROVIDERS = ("grokbot", "hermes", "example")
METHODS = {"hello", "roster.set", "view.set", "attachments.set", "ask.send", "ask.cancel", "thread.clear",
           "thread.undo", "notice.say", "reply.deliver", "dictate", "state.get", "shutdown"}
INTENTS = METHODS - {"hello", "roster.set", "state.get", "shutdown"}
ROSTER_LIMIT = 1024
ID_MEMORY = 4096
OUTPUT_FRAMES = 1024
CTL_MAGIC = b"agent-desktop/1"
CTL_LIMIT = 65536
CTL_TIMEOUT = 2.0
APPROVAL_TEXT = ("Hermes asked for approval, which the desktop cannot show yet. "
                 "The request was stopped; run it in Hermes.")
CONNECTION_TEXT = "Provider connection failed; inspect the agent before retrying."
ADAPTER_TEXT = "Adapter operation failed; inspect local prerequisites."
LOST_TEXT = "Provider disconnected; inspect the agent before retrying."


def version_text():
    try:
        return (ROOT / "VERSION").read_text(encoding="utf-8").strip()[:32]
    except OSError:
        return ""


def runtime_dir():
    """$XDG_RUNTIME_DIR, accepted only as a private directory owned by this user."""
    runtime = Path(os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}")
    info = os.lstat(runtime)
    if (not runtime.is_absolute() or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise ValueError("XDG_RUNTIME_DIR must be a private directory owned by you")
    return runtime


def ctl_path():
    return runtime_dir() / "agent-desktop" / "ctl.sock"


def peer_uid(sock):
    raw = sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
    return struct.unpack("3i", raw)[1]


def bind_ctl(path):
    """Create the private directory and a 0600 listening socket at path.

    Refuses a directory or file it does not own. A stale socket (nothing
    accepting) is replaced; a live one belongs to another daemon and is kept.
    """
    directory = path.parent
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        pass
    info = os.lstat(directory)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError(f"{directory} must be a private directory owned by you")
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        info = None
    if info is not None:
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
            raise ValueError(f"{path} is not a socket owned by you")
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            probe.settimeout(0.5)
            probe.connect(str(path))
        except (ConnectionRefusedError, FileNotFoundError):
            os.unlink(path)
        else:
            raise ValueError("another agent-desktopd is serving the control socket")
        finally:
            probe.close()
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    old = os.umask(0o177)
    try:
        sock.bind(str(path))
    except OSError:
        sock.close()
        raise
    finally:
        os.umask(old)
    os.chmod(path, 0o600)
    sock.listen(16)
    sock.setblocking(False)
    stamp = os.lstat(path)
    return sock, (stamp.st_dev, stamp.st_ino)


class Output:
    """Bounded, ordered frame writer. A stalled reader fails the session."""

    def __init__(self, writer, frames=OUTPUT_FRAMES):
        self.writer = writer
        self.queue = asyncio.Queue(maxsize=frames)
        self.failed = asyncio.Event()
        self.task = asyncio.create_task(self.run())

    def put(self, raw):
        if self.failed.is_set():
            return
        try:
            self.queue.put_nowait(raw)
        except asyncio.QueueFull:
            self.failed.set()

    async def run(self):
        while True:
            raw = await self.queue.get()
            try:
                self.writer.write(raw)
                await asyncio.wait_for(self.writer.drain(), 5)
            except (OSError, TimeoutError, RuntimeError):
                self.failed.set()
                return
            finally:
                self.queue.task_done()

    async def close(self):
        if not self.failed.is_set():
            try:
                await asyncio.wait_for(self.queue.join(), 2)
            except TimeoutError:
                pass
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)
        try:
            self.writer.close()
        except (OSError, RuntimeError):
            pass


class RemoteAdapter:
    """An adapter in its own process (bin/agent-desktop-provider), with the in-process surface.

    Used for Hermes, which needs the Python environment of its own install.
    """

    def __init__(self, client):
        self.client = client
        self.name = getattr(client, "command", ["?"])[-1]
        self.capabilities = {}
        self.emit = None
        self.on_lost = None
        self.pending = {}
        self.count = 0
        self.pump_task = None

    async def start(self):
        hello = await self.client.start()
        self.capabilities = hello.get("capabilities", {}) if isinstance(hello, dict) else {}
        self.pump_task = asyncio.create_task(self.pump())

    async def pump(self):
        try:
            while True:
                frame = await self.client.read()
                if "event" in frame:
                    if self.emit:
                        self.emit(frame.get("event"), frame.get("params", {}))
                    continue
                future = self.pending.pop(frame.get("id"), None)
                if future and not future.done():
                    future.set_result(frame)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            fault = exc if isinstance(exc, Fault) else Fault("delivery_unknown", LOST_TEXT)
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(fault)
            self.pending.clear()
            if self.on_lost:
                self.on_lost(fault)

    async def call(self, method, params):
        self.count += 1
        op = f"op{self.count}"
        future = asyncio.get_running_loop().create_future()
        self.pending[op] = future
        await self.client.send(op, method, params)
        frame = await future
        if "error" in frame or not isinstance(frame.get("result"), dict):
            error = frame.get("error") if isinstance(frame.get("error"), dict) else {}
            raise Fault(str(error.get("code", "adapter_error"))[:64],
                        str(error.get("message", "Provider refused the request."))[:400])
        return frame["result"]

    async def close(self):
        if self.pump_task:
            self.pump_task.cancel()
            await asyncio.gather(self.pump_task, return_exceptions=True)
        await self.client.close()


def default_adapter(provider):
    from . import config
    client = config.client_for(provider)  # validates agent-desktop.json as one-shot asks do
    if provider == "grokbot":
        from .grokbot import GrokBot
        return GrokBot()
    if provider == "example":
        from .example import Example
        return Example()
    return RemoteAdapter(client)


def default_timeout():
    try:
        from .config import timeout_seconds
        return timeout_seconds()
    except Exception:
        return 180


def _string(params, key, required=False, limit=MAX_FRAME):
    value = params.get(key, None)
    if value is None and not required:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise Fault("invalid_request", f"{key} must be a string.")
    return conv.js_string(value)


def _files(value):
    if value is None:
        return []
    if (not isinstance(value, list) or len(value) > conv.FILE_LIMIT
            or not all(isinstance(item, str) and 0 < len(item) <= 4096 and "\x00" not in item for item in value)):
        raise Fault("invalid_request", "attachments must be at most four path strings.")
    return list(value)


def _bots(value):
    if not isinstance(value, list) or len(value) > ROSTER_LIMIT:
        raise Fault("invalid_request", f"bots must be an array of at most {ROSTER_LIMIT} objects.")
    bots, seen = [], set()
    for row in value:
        if not isinstance(row, dict):
            raise Fault("invalid_request", "Each bot must be an object.")
        bot_id, name = row.get("id"), row.get("name")
        if not isinstance(bot_id, str) or not 0 < len(bot_id) <= 256 or bot_id in seen:
            raise Fault("invalid_request", "Each bot needs a unique id.")
        if not isinstance(name, str) or not name:
            raise Fault("invalid_request", "Each bot needs a name.")
        bot = {"id": bot_id, "name": name[:512]}
        for key in ("agentId", "shortName"):
            item = row.get(key, "")
            if not isinstance(item, str) or len(item) > 512:
                raise Fault("invalid_request", f"{key} must be a string.")
            bot[key] = item
        provider = row.get("provider", "grokbot")
        if provider not in PROVIDERS:
            raise Fault("invalid_request", "provider must be grokbot, hermes or example.")
        bot["provider"] = provider
        bot["agentId"] = bot["agentId"] or bot_id
        seen.add(bot_id)
        bots.append(bot)
    return bots


class Daemon:
    def __init__(self, output, adapter_factory=default_adapter, timeout=default_timeout,
                 clock=None, new_id=None, tick_seconds=conv.EXPIRY_TICK_MS / 1000,
                 undo_seconds=conv.UNDO_MS / 1000, ask_seconds=conv.ASK_TIMEOUT_MS / 1000, ctl=True):
        self.output = output
        self.adapter_factory = adapter_factory
        self.timeout = timeout
        self.state = conv.Conversations(clock or (lambda: time.monotonic() * 1000), new_id)
        self.epoch = uuid.uuid4().hex
        self.sequence = 0
        self.ready = False
        self.ids = set()
        self.id_order = collections.deque()
        self.tick_seconds, self.undo_seconds, self.ask_seconds = tick_seconds, undo_seconds, ask_seconds
        self.ctl_wanted = ctl
        self.ctl_server = None
        self.ctl_stamp = None
        self.ctl_file = None
        self.asks = {}
        self.reaping = set()
        self.ticker = None
        self.undo_handle = None
        self.stopping = asyncio.Event()
        self.exit_code = 0

    # -- frames --------------------------------------------------------------
    def event(self, name, params):
        self.sequence += 1
        self.output.put(encode({"v": VERSION, "epoch": self.epoch, "seq": self.sequence,
                                "event": name, "params": params}))

    def reply(self, op, result=None, fault=None):
        frame = {"v": VERSION, "epoch": self.epoch, "id": op}
        frame["error" if fault else "result"] = fault.data() if fault else result
        try:
            raw = encode(frame)
        except Fault as exc:
            raw = encode({"v": VERSION, "epoch": self.epoch, "id": op, "error": exc.data()})
        self.output.put(raw)

    def snapshot(self):
        snap = self.state.snapshot()
        snap["historyOmitted"] = 0
        while True:
            try:
                encode({"v": VERSION, "epoch": self.epoch, "seq": self.sequence + 1, "event": "state", "params": snap})
                return snap
            except Fault:
                if not snap["history"]:
                    raise
                snap["history"] = snap["history"][1:]
                snap["historyOmitted"] += 1

    def flush(self, with_state=True):
        """Emit the state snapshot, then the effects queued since the last flush."""
        if with_state:
            self.event("state", self.snapshot())
        for item in self.state.take_effects():
            self.event("effect", item)
        self.schedule()

    def after(self, with_state=True):
        launch = self.state.take_launch()
        if launch:
            self.start_ask(launch)
        self.flush(with_state)

    # -- timers --------------------------------------------------------------
    def schedule(self):
        current = asyncio.current_task()
        if self.state.awaiting and self.ticker is None:
            self.ticker = asyncio.create_task(self.tick())
        elif not self.state.awaiting and self.ticker is not None and self.ticker is not current:
            self.ticker.cancel()
            self.ticker = None

    async def tick(self):
        while True:
            await asyncio.sleep(self.tick_seconds)
            changed = self.state.expire_waiting()
            if not self.state.awaiting:
                self.ticker = None
                self.flush(changed)
                return
            self.flush(changed)

    def undo_fired(self, record):
        self.undo_handle = None
        if self.state.expire_undo(record):
            self.flush()

    def restart_undo(self):
        if self.undo_handle:
            self.undo_handle.cancel()
        # The loop may run a timer a clock tick early, so expire this record rather than re-reading the clock.
        self.undo_handle = asyncio.get_running_loop().call_later(self.undo_seconds, self.undo_fired, self.state.cleared)

    # -- asks ----------------------------------------------------------------
    def start_ask(self, launch):
        ask_id = launch["askId"]
        task = asyncio.create_task(self.run_ask(launch))
        timer = asyncio.get_running_loop().call_later(self.ask_seconds, self.ask_timed_out, ask_id)
        self.asks[ask_id] = (task, timer)

        def done(_):
            row = self.asks.pop(ask_id, None)
            if row:
                row[1].cancel()
            self.reaping.discard(task)
        task.add_done_callback(done)

    def abort(self, ask_id):
        row = self.asks.get(ask_id)
        if row and not row[0].done():
            row[0].cancel()
            self.reaping.add(row[0])

    def ask_timed_out(self, ask_id):
        if self.state.ask_timed_out(ask_id):
            self.abort(ask_id)
            self.flush()

    async def reap(self):
        """Wait (bounded) for cancelled asks to stop their adapters and children."""
        tasks = [task for task in self.reaping if not task.done()]
        if tasks:
            await asyncio.wait(tasks, timeout=15)

    async def run_ask(self, launch):
        ask_id, agent = launch["askId"], launch["agentId"]
        loop = asyncio.get_running_loop()
        terminal = loop.create_future()
        adapter = None
        status, answer, error = "failed", "", ""

        def settle(value=None, fault=None):
            if terminal.done():
                return
            if fault is not None:
                terminal.set_exception(fault)
            else:
                terminal.set_result(value)

        def emit(name, params):
            if not isinstance(params, dict) or params.get("requestId") != ask_id or params.get("agentId") != agent:
                return
            if terminal.done():
                return
            if name == "message.delta":
                if self.state.ask_delta(ask_id, params.get("text")):
                    self.event("ask.delta", {"botId": self.state.ask_bot, "askId": ask_id, "text": self.state.partial})
            elif name == "prompt.required":
                settle(fault=Fault("approval_required", APPROVAL_TEXT))
            elif name in ("message.finished", "message.deferred"):
                settle((name, params))

        try:
            try:
                seconds = self.timeout()
                params = {"agentId": identifier(agent), "requestId": identifier(ask_id),
                          "text": text(launch["prompt"], MAX_PROMPT), "attachments": launch["attachments"],
                          "timeoutSeconds": seconds}
                guard = (seconds if type(seconds) in (int, float) else 180) + 15
                async with asyncio.timeout(guard):
                    adapter = self.adapter_factory(launch["provider"])
                    adapter.emit = emit
                    if hasattr(adapter, "on_lost"):
                        adapter.on_lost = lambda fault: settle(fault=fault)
                    if hasattr(adapter, "start"):
                        await adapter.start()
                    result = await adapter.call("message.send", params)
                    if not isinstance(result, dict) or result.get("accepted") is not True:
                        raise Fault("adapter_error", "Provider refused the request.")
                    name, payload = await terminal
                if name == "message.deferred":
                    if payload.get("deliveryId") != ask_id:
                        raise Fault("invalid_response", "Reply identity changed; cannot route a deferred reply.")
                    status = "deferred"
                elif payload.get("status") != "completed":
                    detail = payload.get("error") if isinstance(payload.get("error"), dict) else {}
                    raise Fault(str(detail.get("code", "failed")), str(detail.get("message", "The request stopped."))[:400])
                else:
                    answer = text(payload.get("text"), 65536)
                    status = "completed"
            except Fault as exc:
                error = str(exc.message)[:400]
            except (OSError, TimeoutError, ValueError):
                error = CONNECTION_TEXT
            except asyncio.CancelledError:
                raise
            except Exception:
                error = ADAPTER_TEXT
        finally:
            if adapter is not None:
                try:
                    await adapter.close()
                except Exception:
                    pass
        if self.state.ask_finished(ask_id, status, answer, error):
            self.after()

    # -- requests ------------------------------------------------------------
    async def intent(self, method, params):
        st = self.state
        if method in ("ask.send", "dictate") and not st.asking:
            await self.reap()
        if method == "view.set":
            bot_id = _string(params, "botId", required=True, limit=256)
            if bot_id == "":
                raise Fault("invalid_request", "botId must not be empty.")
            bubble = params.get("bubbleOpen")
            if bubble is not None and not isinstance(bubble, bool):
                raise Fault("invalid_request", "bubbleOpen must be a boolean.")
            return st.set_view(bot_id, bubble)
        if method == "attachments.set":
            return st.set_pending(_files(params.get("files", [])))
        if method == "ask.send":
            mode = params.get("mode", "prompt")
            if mode not in ("prompt", "line"):
                raise Fault("invalid_request", "mode must be prompt or line.")
            value = _string(params, "text")
            if "attachments" in params:
                st.set_pending(_files(params["attachments"]))
            return st.submit_prompt(value) if mode == "prompt" else st.ask_line(value)
        if method == "ask.cancel":
            quiet = params.get("quiet", False)
            if not isinstance(quiet, bool):
                raise Fault("invalid_request", "quiet must be a boolean.")
            if quiet:
                ask_id = st.cancel_ask()
                result = "ok" if ask_id else "nothing"
            else:
                result, ask_id = st.stop_ask()
            if ask_id:
                self.abort(ask_id)
            return result
        if method == "thread.clear":
            result = st.clear_conversation()
            if result == "ok":
                self.restart_undo()
            return result
        if method == "thread.undo":
            return st.undo_clear()
        if method == "notice.say":
            title, body = _string(params, "title"), _string(params, "text")
            raw = params.get("links", [])
            if not isinstance(raw, list) or len(raw) > 2 or not all(isinstance(item, dict) for item in raw):
                raise Fault("invalid_request", "links must be an array of at most two objects.")
            links = []
            for item in raw:
                link = conv.link_button(_string(item, "label"), _string(item, "url"))
                if not link:
                    return "invalid link"
                links.append(link)
            return st.say_notice(title, body, links)
        if method == "reply.deliver":
            return st.receive_reply(_string(params, "target"), _string(params, "text"))
        if method == "dictate":
            return st.dictate_text(_string(params, "text"))
        raise Fault("unsupported", "Unknown method.")

    def remember(self, op):
        if op in self.ids:
            raise Fault("duplicate_id", "Operation IDs cannot be reused on a connection.")
        self.ids.add(op)
        self.id_order.append(op)
        if len(self.id_order) > ID_MEMORY:
            self.ids.discard(self.id_order.popleft())

    async def dispatch(self, frame):
        op = frame.get("id")
        try:
            identifier(op)
            if any(key in frame for key in ("event", "result", "error")):
                raise Fault("invalid_request", "Expected a request envelope.")
            if type(frame.get("v")) is not int or frame["v"] != VERSION:
                raise Fault("incompatible_version", "Agent Desktop daemon protocol major 1 is required.")
            self.remember(op)
            method, params = frame.get("method"), frame.get("params", {})
            if not isinstance(params, dict):
                raise Fault("invalid_request", "params must be an object.")
            if not isinstance(method, str) or method not in METHODS:
                raise Fault("unsupported", "Unknown method.")
            if method == "hello":
                if self.ready:
                    raise Fault("invalid_request", "Handshake already completed.")
                self.ready = True
                if self.ctl_wanted:
                    self.start_ctl()
                self.reply(op, {"protocol": {"major": VERSION, "minor": MINOR}, "server": "agent-desktopd",
                                "version": version_text(), "maxFrameBytes": MAX_FRAME,
                                "ctlSocket": self.ctl_server is not None, "historyLimit": conv.HISTORY_LIMIT,
                                "replyWaitMs": conv.REPLY_WAIT_MS, "undoMs": conv.UNDO_MS})
                return True
            if not self.ready:
                raise Fault("handshake_required", "Send hello before other operations.")
            if method == "shutdown":
                self.reply(op, "ok")
                return False
            if method == "state.get":
                self.reply(op, self.snapshot())
                return True
            if method == "roster.set":
                self.state.set_roster(_bots(params.get("bots")))
                self.reply(op, "ok")
                return True
            result = await self.intent(method, params)
            self.after()
            self.reply(op, result)
        except Fault as exc:
            self.state.take_effects()
            self.reply(op if isinstance(op, str) and IDENTIFIER.fullmatch(op) else None, fault=exc)
        except Exception as exc:
            self.state.take_effects()
            print(f"agent-desktopd: {type(exc).__name__} in a request", file=sys.stderr)
            self.reply(op, fault=Fault("internal_error", "Daemon operation failed."))
        return True

    async def read_loop(self, reader):
        while True:
            try:
                raw = await reader.readline()
            except (ValueError, asyncio.LimitOverrunError):
                self.reply(None, fault=Fault("limit_exceeded", "Protocol frame exceeds 1 MiB."))
                self.exit_code = 1
                return
            if not raw:
                return
            if not raw.endswith(b"\n"):
                self.reply(None, fault=Fault("invalid_request", "Protocol frame must end with a newline."))
                return
            try:
                frame = decode(raw)
            except Fault as exc:
                self.reply(None, fault=exc)
                continue
            if not await self.dispatch(frame):
                return

    # -- control socket -------------------------------------------------------
    def start_ctl(self):
        try:
            path = ctl_path()
            sock, stamp = bind_ctl(path)
        except (OSError, ValueError) as exc:
            print(f"agent-desktopd: control socket disabled: {exc}", file=sys.stderr)
            return
        self.ctl_file, self.ctl_stamp = path, stamp
        self.ctl_server = asyncio.get_running_loop().create_task(self.serve_ctl(sock))

    async def serve_ctl(self, sock):
        server = await asyncio.start_unix_server(self.ctl_client, sock=sock, limit=CTL_LIMIT)
        async with server:
            await server.serve_forever()

    async def ctl_client(self, reader, writer):
        try:
            sock = writer.get_extra_info("socket")
            if sock is None or peer_uid(sock) != os.getuid():
                return
            try:
                raw = await asyncio.wait_for(reader.readuntil(b"\x1e"), CTL_TIMEOUT)
            except (asyncio.LimitOverrunError, asyncio.IncompleteReadError, TimeoutError, ValueError):
                writer.write(b"ERR\x1finvalid_request\x1e")
                return
            result = await self.ctl_request(raw[:-1])
            writer.write(result)
            await asyncio.wait_for(writer.drain(), CTL_TIMEOUT)
        except (OSError, TimeoutError):
            pass
        finally:
            writer.close()

    async def ctl_request(self, raw):
        try:
            fields = raw.decode("utf-8").split("\x1f")
        except UnicodeError:
            return b"ERR\x1finvalid_request\x1e"
        if fields[0].encode() != CTL_MAGIC or len(fields) < 2 or any("\x00" in field for field in fields):
            return b"ERR\x1finvalid_request\x1e"
        method, args = fields[1], fields[2:]
        if method == "dictate" and len(args) == 1:
            params = {"text": args[0]}
        elif method == "reply" and len(args) == 2:
            method, params = "reply.deliver", {"target": args[0], "text": args[1]}
        else:
            return b"ERR\x1funsupported\x1e"
        try:
            result = await self.intent(method, params)
            self.after()
        except Fault as exc:
            self.state.take_effects()
            return b"ERR\x1f" + exc.code.encode() + b"\x1e"
        return b"OK\x1f" + result.encode() + b"\x1e"

    async def stop_ctl(self):
        if self.ctl_server is None:
            return
        self.ctl_server.cancel()
        await asyncio.gather(self.ctl_server, return_exceptions=True)
        self.ctl_server = None
        try:
            info = os.lstat(self.ctl_file)
            if (info.st_dev, info.st_ino) == self.ctl_stamp:
                os.unlink(self.ctl_file)
        except OSError:
            pass

    # -- lifecycle ------------------------------------------------------------
    async def serve(self, reader):
        reading = asyncio.create_task(self.read_loop(reader))
        stopping = asyncio.create_task(self.stopping.wait())
        failing = asyncio.create_task(self.output.failed.wait())
        try:
            await asyncio.wait({reading, stopping, failing}, return_when=asyncio.FIRST_COMPLETED)
            if failing.done():
                self.exit_code = 1
        finally:
            for task in (reading, stopping, failing):
                task.cancel()
            await asyncio.gather(reading, stopping, failing, return_exceptions=True)
            await self.shutdown()
        return self.exit_code

    async def shutdown(self):
        await self.stop_ctl()
        for handle in [self.undo_handle] + [row[1] for row in self.asks.values()]:
            if handle:
                handle.cancel()
        if self.ticker:
            self.ticker.cancel()
        tasks = [row[0] for row in self.asks.values()] + list(self.reaping)
        for task in tasks:
            if task not in self.reaping:  # a second cancel would interrupt its cleanup
                task.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=15)
        await self.output.close()


async def stdio_pair():
    """Protocol streams on private duplicates of fds 0 and 1.

    fds 0 and 1 are then pointed at /dev/null and stderr, so neither a stray
    print from adapter code nor a child process can reach the shell's pipes.
    """
    loop = asyncio.get_running_loop()
    proto_in, proto_out = os.dup(0), os.dup(1)
    null = os.open(os.devnull, os.O_RDONLY)
    os.dup2(null, 0)
    os.close(null)
    os.dup2(2, 1)
    reader = asyncio.StreamReader(limit=MAX_FRAME)
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), os.fdopen(proto_in, "rb", 0))
    transport, protocol = await loop.connect_write_pipe(asyncio.streams.FlowControlMixin,
                                                        os.fdopen(proto_out, "wb", 0))
    return reader, asyncio.StreamWriter(transport, protocol, None, loop)
