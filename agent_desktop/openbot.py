import asyncio
import hashlib
import json
import os
from pathlib import Path
import signal

from .protocol import Fault, identifier, text, MAX_PROMPT, IDENTIFIER

ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT/"bin/openbot-local-scripts"
PALETTE = ("black", "brown", "red", "orange", "yellow", "green",
           "cyan", "blue", "violet", "magenta", "gray")
TERMINAL = {"completed", "failed", "interrupted", "cancelled"}
ACTIVE = {"queued", "starting", "running"}
KNOWN_STATUS = TERMINAL | ACTIVE
PROGRESS = {"queued": "Queued in OpenBot", "starting": "Starting in OpenBot",
            "running": "OpenBot is working"}
STDOUT_LIMIT = 64 * 1024 + 1
STDERR_LIMIT = 4096
HANDOFF = {
    "question": "OpenBot is waiting for an answer. This desktop cannot answer it.",
    "secret": "OpenBot has a question that must be answered in OpenBot.",
    "approval": "OpenBot is waiting for an approval. This desktop cannot accept or decline it.",
    "browser": "OpenBot needs a browser takeover. This desktop cannot do that.",
}
RETRYABLE = {"unavailable", "delivery_unknown"}


def avatar_color(agent, name):
    digest = hashlib.sha256((agent + "\x00" + name).encode()).digest()
    return PALETTE[digest[0] % len(PALETTE)]


def validate_timeout(seconds, code, message):
    if type(seconds) not in (int, float) or not 1 <= seconds <= 1800:
        raise Fault(code, message)
    return seconds


def openbot_entry(config=None):
    if config is None:
        from .config import configuration
        config = configuration()
    providers = config.get("providers", {}) if isinstance(config, dict) else None
    if not isinstance(providers, dict):
        raise Fault("invalid_config", "providers must be an object.")
    entry = providers.get("openbot", {})
    if not isinstance(entry, dict):
        raise Fault("invalid_config", "OpenBot provider configuration must be an object.")
    return entry


def delivery_budget(entry, shared, requested=None):
    """Wait budget: explicit request, then providers.openbot.timeoutSeconds, then the shared desktop timeout."""
    if requested is not None:
        return validate_timeout(requested, "invalid_request", "timeoutSeconds must be between 1 and 1800.")
    seconds = entry.get("timeoutSeconds") if isinstance(entry, dict) else None
    if seconds is None:
        return validate_timeout(shared, "invalid_config", "The desktop ask timeout is invalid.")
    return validate_timeout(seconds, "invalid_config", "OpenBot timeoutSeconds must be between 1 and 1800.")


def ask_timeout(provider, payload, shared, entry):
    """Return ``(seconds, pass_to_provider)``.

    OpenBot does not receive the shared desktop timeout unless its own
    ``timeoutSeconds`` is unset. An explicit request timeout still wins.
    Other providers keep the previous behaviour and always receive ``shared``.
    """
    if provider != "openbot":
        return shared, True
    requested = None
    if isinstance(payload, dict) and "timeoutSeconds" in payload:
        requested = payload.get("timeoutSeconds")
    return delivery_budget(entry if isinstance(entry, dict) else {}, shared, requested), requested is not None


def descendant_pids(pid):
    found = []
    stack = [pid]
    seen = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        try:
            raw = Path(f"/proc/{current}/task/{current}/children").read_bytes()
        except OSError:
            continue
        for part in raw.split():
            try:
                child = int(part)
            except ValueError:
                continue
            found.append(child)
            stack.append(child)
    return found


def _signal(pid, sig):
    try:
        os.kill(pid, sig)
        return True
    except ProcessLookupError:
        return False


async def reap_process(process):
    """Stop a helper and the hop children it started, then collect the exit."""
    if process.returncode is not None:
        return
    descendants = descendant_pids(process.pid)
    if not _signal(process.pid, signal.SIGTERM):
        return
    try:
        await asyncio.wait_for(process.wait(), 1)
    except TimeoutError:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(process.wait(), 2)
        except TimeoutError:
            pass
    for pid in descendants:
        try:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            _signal(pid, signal.SIGKILL)
    for pid in descendants:
        try:
            os.waitpid(pid, os.WNOHANG)
        except (ChildProcessError, OSError):
            pass


def category_token(err):
    try:
        text_value = err.decode("utf-8")
    except UnicodeError:
        return "hop_failed"
    if text_value.count("\n") > 1:
        return "hop_failed"
    token = text_value.strip()
    if token in {"hop_invalid", "hop_start", "hop_timeout", "hop_failed", "output_limit",
                 "unreachable", "missing_automation", "invalid_url", "invalid_message", "invalid_id"}:
        return token
    if len(token) == 8 and token.startswith("http_") and token[5:].isdigit():
        return token
    return "hop_failed"


def prompt_id(kind, request_id):
    prefix = {"approval": "a", "question": "q", "secret": "s", "browser": "b"}.get(kind, "p")
    if isinstance(request_id, str) and IDENTIFIER.fullmatch(request_id) and len(request_id) <= 120:
        return f"{prefix}-{request_id}"
    digest = hashlib.sha256(json.dumps([kind, request_id], default=str).encode()).hexdigest()[:24]
    return f"pending-{digest}"


def pending_notes(data):
    if not isinstance(data, dict):
        raise Fault("invalid_response", "OpenBot returned an invalid pending list.")
    for key in ("prompts", "approvals", "browserTakeovers"):
        if key in data and data.get(key) is not None and not isinstance(data.get(key), list):
            raise Fault("invalid_response", "OpenBot returned an invalid pending list.")
    notes = {}

    def add(kind, request_id, message):
        notes[prompt_id(kind, request_id)] = (kind, message)

    for item in data.get("prompts") or []:
        if not isinstance(item, dict):
            raise Fault("invalid_response", "OpenBot returned an invalid pending question.")
        questions = item.get("questions")
        secret = item.get("requiresOpenBot") is True or not questions
        add("secret" if secret else "question", item.get("requestId"),
            HANDOFF["secret" if secret else "question"])
    for item in data.get("approvals") or []:
        if not isinstance(item, dict):
            raise Fault("invalid_response", "OpenBot returned an invalid pending approval.")
        add("approval", item.get("requestId"), HANDOFF["approval"])
    for item in data.get("browserTakeovers") or []:
        if not isinstance(item, dict):
            raise Fault("invalid_response", "OpenBot returned an invalid browser takeover.")
        add("browser", item.get("requestId"), HANDOFF["browser"])
    return notes


class OpenBot:
    name = "openbot"
    capabilities = {"streaming": False, "cancellation": "none", "attachments": False,
                    "history": False, "prompts": False, "compaction": False,
                    "deferredReplies": False}

    def __init__(self, hop=None, timeout=180, poll_interval=1):
        self.hop = hop
        self.timeout = timeout
        self.fallback = timeout
        self.entry = {}
        self.poll_interval = poll_interval
        self.emit = None
        self.tasks = {}
        self.active = {}
        self.deliveries = {}
        self.used = set()
        self.settled = set()
        self.configured = False

    def configure(self):
        if self.configured:
            return
        from .config import configuration
        config = configuration()
        entry = openbot_entry(config)
        hop = os.environ.get("OPENBOT_LOCAL_SCRIPTS_HOP") or entry.get("hop")
        if hop is not None:
            if not isinstance(hop, str) or not hop or "\x00" in hop or len(hop) > 4096:
                raise Fault("invalid_config", "OpenBot hop must be a command under 4096 characters.")
            self.hop = hop
        if entry.get("timeoutSeconds") is None:
            from .config import timeout_seconds
            self.fallback = timeout_seconds()
        else:
            self.fallback = self.timeout
        self.entry = entry
        self.timeout = delivery_budget(entry, self.fallback, None)
        self.configured = True

    def fault_for_helper(self, args, token):
        send = bool(args) and args[0] == "send"
        if token.startswith("http_") and token[5:].isdigit() and len(token) == 8 and token != "http_000":
            status = token[5:]
            if send:
                return Fault("delivery_unknown", f"OpenBot rejected the message (HTTP {status}).", True)
            return Fault("unavailable", f"OpenBot rejected the request (HTTP {status}).")
        if token == "hop_timeout":
            return Fault("delivery_unknown", "OpenBot did not answer in time; inspect OpenBot before retrying.", True)
        if token == "output_limit":
            return Fault("limit_exceeded", "OpenBot transport output exceeded its limit.")
        if token == "missing_automation":
            return Fault("unavailable", "OpenBot automation files are unavailable on the host.")
        if token == "invalid_url":
            return Fault("invalid_config", "OpenBot automation URL must be http://127.0.0.1:<port>.")
        if token == "hop_invalid":
            return Fault("invalid_config", "The OpenBot hop command is invalid.")
        if token == "hop_start":
            return Fault("unavailable", "Could not start the OpenBot hop.")
        if token == "invalid_message":
            return Fault("invalid_request", "The OpenBot message was rejected before it was sent.")
        if token == "invalid_id":
            return Fault("invalid_request", "The OpenBot id was rejected.")
        if token == "unreachable":
            if send:
                return Fault("delivery_unknown",
                             "OpenBot did not confirm the message; inspect OpenBot before retrying.", True)
            return Fault("unavailable", "OpenBot host is unreachable.")
        if send:
            return Fault("delivery_unknown",
                         "OpenBot did not confirm the message; inspect OpenBot before retrying.", True)
        return Fault("unavailable", "OpenBot transport failed.")

    async def _read_limited(self, stream, limit):
        chunks = []
        total = 0
        while True:
            chunk = await stream.read(4096)
            if not chunk:
                return b"".join(chunks)
            total += len(chunk)
            if total > limit:
                raise Fault("limit_exceeded", "OpenBot transport output exceeded its limit.")
            chunks.append(chunk)

    async def _run(self, args, payload=None, timeout=45):
        self.configure()
        env = dict(os.environ)
        if self.hop is not None:
            env["OPENBOT_LOCAL_SCRIPTS_HOP"] = self.hop
        try:
            process = await asyncio.create_subprocess_exec(
                "/usr/bin/python3", "-I", str(HELPER), *args,
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE, env=env, start_new_session=True)
        except OSError:
            raise Fault("unavailable", "Could not start the OpenBot transport helper.") from None
        try:
            try:
                if payload:
                    process.stdin.write(payload)
                    await process.stdin.drain()
                process.stdin.close()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            try:
                out, err = await asyncio.wait_for(asyncio.gather(
                    self._read_limited(process.stdout, STDOUT_LIMIT),
                    self._read_limited(process.stderr, STDERR_LIMIT)), timeout)
            except TimeoutError:
                await reap_process(process)
                raise Fault("delivery_unknown",
                            "OpenBot did not answer in time; inspect OpenBot before retrying.", True) from None
            try:
                await asyncio.wait_for(process.wait(), 5)
            except TimeoutError:
                await reap_process(process)
                raise Fault("delivery_unknown",
                            "OpenBot did not answer in time; inspect OpenBot before retrying.", True) from None
        except Fault:
            await reap_process(process)
            raise
        except asyncio.CancelledError:
            await reap_process(process)
            raise
        if process.returncode != 0:
            raise self.fault_for_helper(args, category_token(err))
        return out

    def _json(self, raw):
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeError):
            raise Fault("invalid_response", "OpenBot returned invalid JSON.") from None
        return value

    async def agents(self):
        rows = self._json(await self._run(["agents"], timeout=45))
        if not isinstance(rows, list) or len(rows) > 128:
            raise Fault("invalid_response", "OpenBot returned an invalid agent roster.")
        result = {}
        for row in rows:
            if not isinstance(row, dict):
                raise Fault("invalid_response", "OpenBot returned an invalid agent.")
            agent = identifier(row.get("id"), "agentId")
            if agent in result:
                raise Fault("invalid_response", "OpenBot returned a duplicate agent identity.")
            name = text(row.get("name"), 160, "name")
            result[agent] = {"id": agent, "name": name, "availability": "ready",
                             "capabilities": self.capabilities, "avatarShape": "blob",
                             "avatarColor": avatar_color(agent, name)}
        return {"complete": True, "agents": list(result.values())}

    def _receipt_delivery(self, receipt, agent):
        if not isinstance(receipt, dict):
            raise Fault("delivery_unknown",
                        "OpenBot returned no delivery; inspect OpenBot before retrying.", True)
        deliveries = receipt.get("deliveries")
        if not isinstance(deliveries, list) or not deliveries:
            raise Fault("delivery_unknown",
                        "OpenBot returned no delivery; inspect OpenBot before retrying.", True)
        chosen = None
        for item in deliveries:
            if not isinstance(item, dict):
                raise Fault("invalid_response", "OpenBot returned an invalid delivery receipt.")
            if item.get("recipientAgentId") != agent:
                continue
            if chosen is not None:
                raise Fault("invalid_response", "OpenBot returned multiple deliveries for this agent.")
            chosen = item
        if chosen is None:
            raise Fault("invalid_response",
                        "OpenBot delivery recipient did not match the agent; inspect OpenBot before retrying.", True)
        try:
            return identifier(chosen.get("id"), "deliveryId")
        except Fault:
            raise Fault("invalid_response", "OpenBot returned an invalid delivery id.") from None

    def _delivery(self, data, agent, delivery):
        if not isinstance(data, dict):
            raise Fault("invalid_response", "OpenBot returned an invalid delivery.")
        if data.get("id") != delivery:
            raise Fault("invalid_response", "OpenBot delivery identity did not match the request.")
        recipient = data.get("recipientAgentId", None)
        if recipient is not None and recipient != agent:
            raise Fault("invalid_response", "OpenBot delivery recipient did not match the agent.")
        status = data.get("status")
        if not isinstance(status, str) or status not in KNOWN_STATUS:
            raise Fault("invalid_response", "OpenBot returned an invalid delivery status.")
        answer = data.get("answer", None)
        if answer is not None and not isinstance(answer, str):
            raise Fault("invalid_response", "OpenBot returned an invalid delivery answer.")
        error = data.get("error", None)
        if error is not None and not isinstance(error, str):
            raise Fault("invalid_response", "OpenBot returned an invalid delivery error.")
        return status, (answer or "")[:65536], error

    async def call(self, method, params):
        self.configure()
        if method == "agents.list":
            return await self.agents()
        if method == "request.cancel":
            request = identifier(params.get("requestId"), "requestId")
            if request not in self.active:
                raise Fault("unavailable", "No active request with that ID.")
            # The Local scripts API documents no cancellation route. Stopping the
            # desktop wait does not confirm that OpenBot stopped its turn.
            return {"requestId": request, "status": "unsupported", "remoteMayContinue": True}
        if method == "prompt.answer":
            raise Fault("unsupported",
                        "Answer this in OpenBot. This desktop cannot answer questions, approvals, secret questions, or browser takeovers.")
        if method != "message.send":
            raise Fault("unsupported", "OpenBot supports agents, messages and deliveries only.")
        request = identifier(params.get("requestId"), "requestId")
        agent = identifier(params.get("agentId"), "agentId")
        prompt = text(params.get("text"), MAX_PROMPT)
        if params.get("attachments"):
            raise Fault("unsupported", "OpenBot Local scripts does not accept attachments.")
        if request in self.used:
            raise Fault("duplicate_id", "Request ID has already been used; never replay uncertain work.")
        if agent in self.active.values():
            raise Fault("busy", "This OpenBot agent already has an active request.")
        if len(self.used) >= 4096 or len(self.active) >= 16:
            raise Fault("limit_exceeded", "Adapter request limit reached.")
        requested = params.get("timeoutSeconds") if "timeoutSeconds" in params else None
        seconds = delivery_budget(self.entry, self.fallback, requested)
        self.used.add(request)
        self.active[request] = agent
        try:
            receipt = self._json(await self._run(["send", agent], prompt.encode("utf-8"),
                                                 timeout=min(seconds, 60)))
            delivery = self._receipt_delivery(receipt, agent)
            self.deliveries[request] = delivery
            self.tasks[request] = asyncio.create_task(self.poll(request, agent, delivery, seconds))
            return {"requestId": request, "sessionId": agent, "accepted": True,
                    "deliveryId": delivery}
        except Exception:
            self.active.pop(request, None)
            self.deliveries.pop(request, None)
            task = self.tasks.pop(request, None)
            if task is not None:
                task.cancel()
            raise

    def finish(self, request, agent, status, answer="", error=None, remote=False):
        if request in self.settled:
            return
        self.settled.add(request)
        self.active.pop(request, None)
        self.tasks.pop(request, None)
        self.deliveries.pop(request, None)
        params = {"agentId": agent, "requestId": request, "sessionId": agent,
                  "status": status, "text": answer}
        if error is not None:
            params["error"] = error
        if remote:
            params["remoteMayContinue"] = True
        if self.emit is not None:
            self.emit("message.finished", params)

    def _handoff(self, request, agent, notes, seen):
        for prompt, (kind, message) in notes.items():
            if prompt in seen:
                continue
            kind_name = "approval" if kind == "approval" else "clarify"
            self.emit("prompt.required", {
                "agentId": agent, "requestId": request, "sessionId": agent,
                "promptId": prompt, "kind": kind_name, "text": message, "command": "",
                "choices": [], "answerable": False, "multiSelect": False})
        for prompt in list(seen):
            if prompt not in notes:
                self.emit("prompt.settled", {"agentId": agent, "requestId": request,
                                              "sessionId": agent, "promptId": prompt})
        seen.clear()
        seen.update(notes)

    async def _pending(self, request, agent, seen, failures, timeout):
        try:
            notes = pending_notes(self._json(await self._run(["pending", agent], timeout=timeout)))
        except asyncio.CancelledError:
            raise
        except Exception:
            return failures + 1
        if self.emit is not None:
            self._handoff(request, agent, notes, seen)
        else:
            seen.clear()
            seen.update(notes)
        return 0

    async def poll(self, request, agent, delivery, seconds):
        loop = asyncio.get_running_loop()
        deadline = loop.time() + seconds
        last = None
        failures = 0
        pending_failures = 0
        seen = set()
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                try:
                    data = self._json(await self._run(
                        ["delivery", agent, delivery], timeout=max(1, min(remaining, 45))))
                    status, answer, error = self._delivery(data, agent, delivery)
                    failures = 0
                except asyncio.CancelledError:
                    raise
                except Fault as exc:
                    if exc.code not in RETRYABLE:
                        self.finish(request, agent, "failed", "",
                                    {"code": exc.code, "message": exc.message, "retryable": exc.retryable},
                                    remote=True)
                        return
                    failures += 1
                    if failures >= 3:
                        self.finish(request, agent, "failed", "",
                                    {"code": exc.code, "message": exc.message, "retryable": exc.retryable},
                                    remote=True)
                        return
                    await asyncio.sleep(min(self.poll_interval, max(0, deadline - loop.time())))
                    continue
                except Exception:
                    self.finish(request, agent, "failed", "",
                                {"code": "internal_error", "message": "OpenBot polling failed.",
                                 "retryable": False}, remote=True)
                    return
                if status in ACTIVE and pending_failures < 3:
                    pending_failures = await self._pending(
                        request, agent, seen, pending_failures, max(1, min(remaining, 45)))
                if status in TERMINAL:
                    for prompt in list(seen):
                        if self.emit is not None:
                            self.emit("prompt.settled", {"agentId": agent, "requestId": request,
                                                          "sessionId": agent, "promptId": prompt})
                    if status == "completed":
                        self.finish(request, agent, "completed", answer)
                    elif status in ("cancelled", "interrupted"):
                        self.finish(request, agent, "cancelled", answer)
                    else:
                        message = error if isinstance(error, str) and error.strip() else "OpenBot reported a failed delivery."
                        self.finish(request, agent, "failed", answer,
                                    {"code": "failed", "message": message[:400], "retryable": False})
                    return
                label = PROGRESS.get(status)
                if label and label != last and self.emit is not None:
                    self.emit("message.progress", {"agentId": agent, "requestId": request,
                                                   "sessionId": agent, "text": label})
                    last = label
                await asyncio.sleep(min(self.poll_interval, max(0, deadline - loop.time())))
            self.finish(request, agent, "failed", "",
                        {"code": "deadline_exceeded", "message": "OpenBot delivery deadline exceeded.",
                         "retryable": False}, remote=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            self.finish(request, agent, "failed", "",
                        {"code": "internal_error", "message": "OpenBot polling failed.", "retryable": False},
                        remote=True)
        finally:
            self.active.pop(request, None)
            self.tasks.pop(request, None)
            self.deliveries.pop(request, None)

    async def close(self):
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.tasks.clear()
        self.active.clear()
        self.deliveries.clear()
