import asyncio
import hashlib
import json
import os
from pathlib import Path

from .protocol import Fault, identifier, text, MAX_PROMPT

ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT/"bin/openbot-local-scripts"
PALETTE = ("black", "brown", "red", "orange", "yellow", "green",
           "cyan", "blue", "violet", "magenta", "gray")
TERMINAL = {"completed", "failed", "interrupted", "cancelled"}
PROGRESS = {"queued": "Queued in OpenBot", "starting": "Starting in OpenBot",
            "running": "OpenBot is working"}


def avatar_color(agent, name):
    digest = hashlib.sha256((agent + "\x00" + name).encode()).digest()
    return PALETTE[digest[0] % len(PALETTE)]


class OpenBot:
    name = "openbot"
    capabilities = {"streaming": False, "cancellation": "none", "attachments": False,
                    "history": False, "prompts": False, "compaction": False,
                    "deferredReplies": False}

    def __init__(self, hop=None, timeout=180, poll_interval=1):
        self.hop = hop
        self.timeout = timeout
        self.poll_interval = poll_interval
        self.emit = None
        self.tasks = {}
        self.active = {}
        self.deliveries = {}
        self.used = set()
        self.configured = False

    def configure(self):
        if self.configured:
            return
        from .config import configuration
        config = configuration()
        providers = config.get("providers", {})
        if not isinstance(providers, dict):
            raise Fault("invalid_config", "providers must be an object.")
        entry = providers.get("openbot", {})
        if not isinstance(entry, dict):
            raise Fault("invalid_config", "OpenBot provider configuration must be an object.")
        hop = os.environ.get("OPENBOT_LOCAL_SCRIPTS_HOP") or entry.get("hop")
        if hop is not None:
            if not isinstance(hop, str) or not hop or "\x00" in hop or len(hop) > 4096:
                raise Fault("invalid_config", "OpenBot hop must be a command under 4096 characters.")
            self.hop = hop
        seconds = entry.get("timeoutSeconds")
        if seconds is not None:
            if type(seconds) not in (int, float) or not 1 <= seconds <= 1800:
                raise Fault("invalid_config", "OpenBot timeoutSeconds must be between 1 and 1800.")
            self.timeout = seconds
        self.configured = True

    async def _run(self, args, payload=None, timeout=45):
        self.configure()
        env = dict(os.environ)
        if self.hop is not None:
            env["OPENBOT_LOCAL_SCRIPTS_HOP"] = self.hop
        try:
            process = await asyncio.create_subprocess_exec(
                "/usr/bin/python3", "-I", str(HELPER), *args,
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE, env=env)
        except OSError:
            raise Fault("unavailable", "Could not start the OpenBot transport helper.") from None
        try:
            out, err = await asyncio.wait_for(process.communicate(payload), timeout)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise Fault("delivery_unknown",
                        "OpenBot did not answer in time; inspect OpenBot before retrying.", True) from None
        except asyncio.CancelledError:
            process.kill()
            await process.wait()
            raise
        if len(out) > 65536 or len(err) > 4096:
            raise Fault("limit_exceeded", "OpenBot transport output exceeded its limit.")
        if process.returncode != 0:
            lines = err.decode("utf-8", "replace").strip().splitlines()
            message = (lines[0] if lines else "OpenBot transport failed.")[:240]
            code = "delivery_unknown" if args[0] == "send" else "unavailable"
            raise Fault(code, message, True)
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

    async def call(self, method, params):
        self.configure()
        if method == "agents.list":
            return await self.agents()
        if method == "request.cancel":
            request = identifier(params.get("requestId"), "requestId")
            if request not in self.active:
                raise Fault("unavailable", "No active request with that ID.")
            # The Local scripts API documents no cancellation route. Keep the
            # local wait alive and say plainly that the remote turn may continue.
            return {"requestId": request, "status": "unsupported", "remoteMayContinue": True}
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
        seconds = params.get("timeoutSeconds", self.timeout)
        if type(seconds) not in (int, float) or not 1 <= seconds <= 1800:
            raise Fault("invalid_request", "timeoutSeconds must be between 1 and 1800.")
        self.used.add(request)
        self.active[request] = agent
        try:
            receipt = self._json(await self._run(["send", agent], prompt.encode("utf-8"),
                                                 timeout=min(seconds, 60)))
            deliveries = receipt.get("deliveries") if isinstance(receipt, dict) else None
            if not isinstance(deliveries, list) or not deliveries or not isinstance(deliveries[0], dict):
                raise Fault("delivery_unknown",
                            "OpenBot returned no delivery; inspect OpenBot before retrying.", True)
            delivery = identifier(deliveries[0].get("id"), "deliveryId")
            self.deliveries[request] = delivery
            self.tasks[request] = asyncio.create_task(self.poll(request, agent, delivery, seconds))
            return {"requestId": request, "sessionId": agent, "accepted": True,
                    "deliveryId": delivery}
        except Exception:
            self.active.pop(request, None)
            self.deliveries.pop(request, None)
            raise

    def finish(self, request, agent, status, answer="", error=None, remote=False):
        self.active.pop(request, None)
        self.tasks.pop(request, None)
        self.deliveries.pop(request, None)
        params = {"agentId": agent, "requestId": request, "sessionId": agent,
                  "status": status, "text": answer}
        if error is not None:
            params["error"] = error
        if remote:
            params["remoteMayContinue"] = True
        self.emit("message.finished", params)

    async def poll(self, request, agent, delivery, seconds):
        loop = asyncio.get_running_loop()
        deadline = loop.time() + seconds
        last = None
        failures = 0
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                try:
                    data = self._json(await self._run(
                        ["delivery", agent, delivery], timeout=max(1, min(remaining, 45))))
                    if not isinstance(data, dict):
                        raise Fault("invalid_response", "OpenBot returned an invalid delivery.")
                    failures = 0
                except asyncio.CancelledError:
                    raise
                except Fault as exc:
                    failures += 1
                    if failures >= 3:
                        self.finish(request, agent, "failed", "",
                                    {"code": exc.code, "message": exc.message, "retryable": exc.retryable},
                                    remote=True)
                        return
                    await asyncio.sleep(min(self.poll_interval, max(0, deadline - loop.time())))
                    continue
                status = data.get("status")
                if status in TERMINAL:
                    answer = data.get("answer")
                    answer = answer[:65536] if isinstance(answer, str) else ""
                    if status == "completed":
                        self.finish(request, agent, "completed", answer)
                    elif status in ("cancelled", "interrupted"):
                        self.finish(request, agent, "cancelled", answer)
                    else:
                        detail = data.get("error")
                        message = detail if isinstance(detail, str) else "OpenBot reported a failed delivery."
                        self.finish(request, agent, "failed", answer,
                                    {"code": "failed", "message": message[:400], "retryable": False})
                    return
                label = PROGRESS.get(status)
                if label and label != last:
                    self.emit("message.progress", {"agentId": agent, "requestId": request,
                                                   "sessionId": agent, "text": label})
                    last = label
                await asyncio.sleep(min(self.poll_interval, max(0, deadline - loop.time())))
            self.finish(request, agent, "failed", "",
                        {"code": "deadline_exceeded", "message": "OpenBot delivery deadline exceeded.",
                         "retryable": False}, remote=True)
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
