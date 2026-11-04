import asyncio
import importlib
from pathlib import Path
import sys
from types import SimpleNamespace

from .protocol import Fault, identifier, text, MAX_PROMPT
from .hermes_gateway import BotLink, PROFILE, NOTE, history_page


class Hermes:
    name = "hermes"
    capabilities = {"streaming": True, "cancellation": "session", "attachments": False,
                    "history": True, "prompts": True, "multiSelect": False, "compaction": True}

    def __init__(self, root, agent_dir):
        self.root = Path(root).expanduser().absolute()
        self.agent_dir = Path(agent_dir).expanduser().absolute()
        self.emit = None
        self.links = {}
        self.active = {}
        self.used = set()
        self.deadlines = {}
        self.loaded = False
        self.gateway = SimpleNamespace(emit=self.on_gateway)

    def profiles(self):
        try:
            import yaml
        except ImportError:
            raise Fault("unavailable", "Install PyYAML in the adapter's Python environment.") from None
        if not self.root.is_dir():
            raise Fault("unavailable", "Hermes root is unavailable.")
        candidates = [("default", self.root)]
        directory = self.root / "profiles"
        try:
            if directory.exists():
                candidates += [(p.name, p) for p in sorted(directory.iterdir()) if not p.is_symlink() and p.is_dir()]
        except OSError:
            raise Fault("unavailable", "Cannot read Hermes profiles.") from None
        if len(candidates) > 128:
            raise Fault("limit_exceeded", "At most 128 Hermes profiles are supported.")
        result = {}
        for name, home in candidates:
            if not PROFILE.fullmatch(name) or not (home / "config.yaml").is_file():
                continue
            meta = {}
            path = home / "profile.yaml"
            try:
                if path.is_symlink():
                    raise ValueError("symlink")
                if path.exists():
                    with path.open("rb") as handle:
                        raw = handle.read(65537)
                    if len(raw) > 65536:
                        raise ValueError("large profile")
                    meta = yaml.safe_load(raw) or {}
                    if not isinstance(meta, dict):
                        raise ValueError("profile not an object")
            except (OSError, ValueError, yaml.YAMLError):
                raise Fault("invalid_config", "Cannot safely read Hermes profile metadata; roster retained.") from None
            ui = meta.get("ui_meta", {})
            look = ui.get("hermes-bots", {}) if isinstance(ui, dict) else {}
            if not isinstance(look, dict):
                raise Fault("invalid_config", "Invalid Hermes profile appearance metadata.")
            if look.get("hidden") is True:
                continue
            label = str(look.get("title") or meta.get("display_name") or name)[:160]
            result[name] = {"id": name, "name": label, "availability": "unknown",
                            "capabilities": self.capabilities, "home": home,
                            "avatarShape": str(look.get("shape") or "blob")[:40],
                            "avatarColor": str(look.get("color") or "blue")[:40]}
        return result

    def load_runtime(self):
        if self.loaded:
            return
        if not (self.agent_dir / "hermes_cli/gateway_client.py").is_file():
            raise Fault("unavailable", "Hermes source not found; configure --agent-dir.")
        sys.path.insert(0, str(self.agent_dir))
        try:
            client = importlib.import_module("hermes_cli.gateway_client")
            runtime = importlib.import_module("hermes_cli.gateway_runtime")
            importlib.import_module("websockets.asyncio.client")
            for obj, names in [(client, ["GatewayClient", "GATEWAY_WS_PROTOCOL", "_session_ticket", "gateway_ws_target"]),
                               (runtime, ["attachable", "ensure_gateway_runtime"])]:
                if any(not hasattr(obj, name) for name in names):
                    raise ImportError("unsupported gateway")
        except (ImportError, AttributeError):
            raise Fault("incompatible_version", "Hermes gateway dependencies are unavailable or incompatible; use its Python environment.") from None
        self.loaded = True

    async def link(self, agent):
        profiles = self.profiles()
        if agent not in profiles:
            raise Fault("unavailable", "Unknown or hidden Hermes profile.")
        self.load_runtime()
        if agent not in self.links:
            self.links[agent] = BotLink(self.gateway, agent, profiles[agent]["home"])
        link = self.links[agent]
        try:
            await asyncio.wait_for(link.up.wait(), 10)
        except TimeoutError:
            raise Fault("offline", "Hermes Bot Chat is unavailable; open it in Hermes and check its gateway.", True) from None
        return link

    def on_gateway(self, **event):
        if self.emit is None:
            return
        agent = event.get("bot", "")
        link = self.links.get(agent)
        params = {"agentId": agent, "sessionId": link.state.session_id if link else ""}
        request = event.get("askId")
        if request:
            if self.active.get(request) != agent:
                return
            params["requestId"] = request
        kind = event.get("ev")
        if kind == "status":
            self.emit("agent.status", {**params, "availability": "ready" if event.get("state") == "up" else "offline"})
        elif kind == "delta":
            self.emit("message.delta", {**params, "text": event.get("text", "")})
        elif kind == "progress":
            self.emit("message.progress", {**params, "text": event.get("text", "")})
        elif kind == "complete":
            status = event.get("status", "complete")
            status = "cancelled" if status in ("cancelled", "interrupted") else "failed" if status in ("failed", "error") else "completed"
            self.emit("message.finished", {**params, "status": status, "text": event.get("text", ""),
                                           "background": not bool(request)})
            self.finish(request)
        elif kind == "prompt":
            self.emit("prompt.required", {**params, "promptId": event.get("promptId"),
                "kind": event.get("kind"), "text": event.get("text", ""),
                "command": event.get("command", ""), "choices": event.get("choices", []),
                "answerable": event.get("answerable", False), "multiSelect": event.get("multiSelect", False)})
        elif kind == "settled":
            self.emit("prompt.settled", {**params, "promptId": event.get("promptId")})

    def finish(self, request):
        self.active.pop(request, None)
        task = self.deadlines.pop(request, None)
        if task and task is not asyncio.current_task():
            task.cancel()

    async def expire(self, request, seconds):
        await asyncio.sleep(seconds)
        agent = self.active.get(request)
        if not agent:
            return
        link = self.links.get(agent)
        confirmed = False
        if link and link.client and request in link.state.mine.values():
            try:
                await asyncio.wait_for(link.client.rpc("session.interrupt", session_id=link.state.session_id,
                                                       execution_generation=link.state.generation), 5)
                confirmed = True
            except Exception:
                pass
        if request not in self.active:
            return
        self.finish(request)
        self.emit("message.finished", {"agentId": agent, "requestId": request,
            "sessionId": link.state.session_id if link else "", "status": "failed", "text": "",
            "error": {"code": "deadline_exceeded", "message": "Request deadline exceeded.", "retryable": False},
            "remoteMayContinue": not confirmed})

    async def call(self, method, params):
        if method == "agents.list":
            profiles = self.profiles()
            return {"complete": True, "agents": [{k: v for k, v in p.items() if k != "home"} for p in profiles.values()]}
        if method == "request.cancel":
            request = identifier(params.get("requestId"), "requestId")
            agent = self.active.get(request)
            if not agent:
                raise Fault("unavailable", "No active request with that ID.")
            link = self.links[agent]
            if not link.client or request not in link.state.mine.values():
                raise Fault("delivery_unknown", "Cannot confirm which Hermes turn is active; no interruption sent.")
            try:
                await asyncio.wait_for(link.client.rpc("session.interrupt", session_id=link.state.session_id,
                                                       execution_generation=link.state.generation), 5)
            except Exception:
                raise Fault("delivery_unknown", "Hermes did not confirm the interruption; the turn may continue.") from None
            if request in self.active:
                self.finish(request)
                self.emit("message.finished", {"agentId": agent, "requestId": request,
                    "sessionId": link.state.session_id, "status": "cancelled", "text": ""})
            return {"requestId": request, "status": "confirmed", "scope": "session"}
        if method not in {"message.send", "history.list", "prompt.answer", "session.compact"}:
            raise Fault("unsupported", "Unsupported Hermes operation.")
        agent = identifier(params.get("agentId"), "agentId")
        if method == "message.send":
            request = identifier(params.get("requestId"), "requestId")
            prompt = text(params.get("text"), MAX_PROMPT)
            if params.get("attachments"):
                raise Fault("unsupported", "Hermes protocol adapter attachments are not implemented yet.")
            if request in self.used:
                raise Fault("duplicate_id", "Request ID has already been used; never replay uncertain work.")
            if agent in self.active.values():
                raise Fault("busy", "This Hermes profile already has an active request.")
            if len(self.used) >= 4096 or len(self.active) >= 16:
                raise Fault("limit_exceeded", "Adapter request limit reached.")
            seconds = params.get("timeoutSeconds", 600)
            if type(seconds) not in (int, float) or not 1 <= seconds <= 1800:
                raise Fault("invalid_request", "timeoutSeconds must be between 1 and 1800.")
            self.used.add(request)
            self.active[request] = agent
            try:
                link = await asyncio.wait_for(self.link(agent), min(seconds, 11))
                if request not in self.active:
                    raise Fault("deadline_exceeded", "Request expired before submission.")
                link.state.submitting += 1
                try:
                    receipt = await asyncio.wait_for(link.client.rpc("prompt.submit", session_id=link.state.session_id,
                        input_id=request, text=prompt), min(seconds, 30))
                except Exception:
                    link.state.submit_failed()
                    raise Fault("delivery_unknown", "Submission was not confirmed; inspect Hermes before retrying.") from None
                admission = (receipt or {}).get("admission_id")
                if not admission:
                    link.state.submit_failed()
                    raise Fault("delivery_unknown", "Hermes returned no admission ID; do not replay automatically.")
                link.state.own(admission, request)
                if request in self.active:
                    self.deadlines[request] = asyncio.create_task(self.expire(request, seconds))
                return {"requestId": request, "sessionId": link.state.session_id, "accepted": True}
            except Exception:
                self.finish(request)
                raise
        link = await self.link(agent)
        session = params.get("sessionId")
        if (method != "history.list" or session is not None) and session != link.state.session_id:
            raise Fault("stale_session", "Session identity has changed.")
        if method == "history.list":
            cursor = params.get("cursor")
            if cursor is not None:
                text(cursor, 256, "cursor")
                items, more = history_page(link.state.transcript, cursor)
            else:
                items = link.state.transcript[-20:]
                more = len(link.state.transcript) > len(items)
            return {"sessionId": link.state.session_id, "items": items,
                    "nextCursor": items[0]["key"] if more and items else None,
                    "historyBoundary": "last_compaction", "snapshot": True}
        if method == "prompt.answer":
            prompt_id = text(params.get("promptId"), 128, "promptId")
            prompt = link.state.prompts.get(prompt_id)
            if prompt is None:
                raise Fault("stale_prompt", "That prompt is no longer waiting.")
            value = text(params.get("answer"), MAX_PROMPT, "answer")
            kind = prompt["kind"]
            if not prompt.get("answerable"):
                raise Fault("unsupported", "Review and answer this prompt in Hermes.")
            if prompt["generation"] != link.state.generation:
                raise Fault("stale_prompt", "Prompt execution generation has changed.")
            if prompt["choices"] and value not in prompt["choices"]:
                raise Fault("invalid_request", "Answer must be one of the advertised choices.")
            try:
                await asyncio.wait_for(link.client.rpc(f"{kind}.respond", session_id=link.state.session_id,
                    execution_generation=prompt["generation"], prompt_id=prompt_id,
                    **({"choice": value} if kind == "approval" else {"answer": value})), 10)
            except Exception:
                raise Fault("delivery_unknown", "Answer was not confirmed; the prompt remains pending.") from None
            link.state.settled(prompt_id)
            return {"promptId": prompt_id, "accepted": True}
        if agent in self.active.values():
            raise Fault("busy", "Wait for the current request before compacting.")
        try:
            from hermes_cli.gateway_mutations import PreparedMutations
            result = await asyncio.wait_for(PreparedMutations().apply(link.client, link.state.session_id, "compress", {}), 180)
        except ImportError:
            raise Fault("unsupported", "This Hermes version does not expose compaction.") from None
        except Exception:
            raise Fault("delivery_unknown", "Compaction was not confirmed; inspect Hermes before retrying.") from None
        return {"sessionId": link.state.session_id, "status": str((result or {}).get("status", "done"))}

    async def close(self):
        async def interrupt(request):
            try:
                await asyncio.wait_for(self.call("request.cancel", {"requestId": request}), 2)
            except (Fault, TimeoutError):
                pass
        await asyncio.gather(*(interrupt(request) for request in list(self.active)), return_exceptions=True)
        tasks = list(self.deadlines.values()) + [link.task for link in self.links.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.links.clear()
        self.deadlines.clear()
        self.active.clear()
