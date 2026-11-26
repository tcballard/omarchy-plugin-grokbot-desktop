"""Hermes gateway internals adapted from Yani3rt/omarchy-plugin-hermes-blob.
Source: 3cc1649084efb98989a7cd335c009f30c44e426f, MIT; see CREDITS.md.
This private module is not the Agent Desktop adapter protocol.
"""


from __future__ import annotations

import asyncio
import re
import sqlite3
from pathlib import Path

RETRY_MIN, RETRY_MAX = 2, 30

# Completed admissions remembered so a replayed message.complete is not shown twice.
COMPLETED_LIMIT = 4096

PROFILE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


BOT_CHAT = "Bot Chat"


TEXT_LIMIT = 16000


NOTE = "[via Omarchy desktop bubble: plain text only, a few short sentences]"


HISTORY_EXCHANGES = 20


SILENCE = re.compile(r"^\s*\[?(SILENT|NO_REPLY|NO REPLY)\]?\s*$", re.I)


HIDDEN_KINDS = {"process_complete", "internal_notification", "hidden", "compaction", "delivery"}


TOOL_LABELS = {
    "terminal": "Running a command", "process": "Checking a command", "execute_code": "Running code",
    "web_search": "Searching the web", "web_extract": "Reading a web page", "browser_exec": "Using the browser",
    "read_file": "Reading a file", "write_file": "Writing a file", "patch": "Editing a file",
    "search_files": "Searching files", "delegate_task": "Handing off to a helper",
    "clarify": "Asking you", "memory": "Checking memory", "skill_view": "Loading a skill",
    "skill_manage": "Updating a skill", "vision_analyze": "Looking at an image", "todo": "Planning",
    "cronjob": "Scheduling", "send_message": "Sending a message", "text_to_speech": "Recording audio",
}


TEAMMATE = re.compile(r"^Message from \S+ (.+?) \(@[^)]+\):\s*", re.S)


def strip_note(text: str) -> str:
    """What was asked, as the bubble shows it: without the companion's own note, and a
    teammate's DM labelled as theirs rather than looking like something you typed."""
    text = str(text or "")
    if text.startswith(NOTE):
        text = text[len(NOTE):]
    text = text.strip()
    match = TEAMMATE.match(text)
    if match:
        text = f"From {match.group(1)}: " + text[match.end():]
    return text


def tool_label(payload: dict) -> str:
    name = str(payload.get("tool_name") or payload.get("name") or "")
    args = payload.get("args") if isinstance(payload.get("args"), dict) else {}
    if name == "message_agent":
        target = str(args.get("target") or "").lstrip("@")[:40]
        return f"Messaging {target}…" if target else "Messaging a teammate…"
    if name.startswith("browser"):
        return "Using the browser…"
    if name.startswith("mnemosyne") or name.startswith("memory"):
        return "Checking memory…"
    label = TOOL_LABELS.get(name)
    return f"{label}…" if label else (f"Using {name[:48]}…" if name else "Working…")


def history_items(messages, limit=HISTORY_EXCHANGES):
    """The Bot Chat as the bubble shows it: what was asked and the final reply, oldest first.

    Tool rows, tool-call scaffolding and empty or silent replies are dropped; a turn Hermes
    started itself (a background result, a teammate's delivery) shows as the bot speaking.
    Each exchange carries a ``key`` (its first row's message id) so earlier pages can be asked
    for by position. ``limit=None`` returns them all."""
    items: list[dict] = []
    current = None
    for index, row in enumerate(messages or []):
        if not isinstance(row, dict):
            continue
        role, content = row.get("role"), row.get("content")
        if not isinstance(content, str):
            continue
        key = str(row.get("message_uid") or row.get("message_id") or f"row-{index}")
        if role == "user":
            if current and current["body"]:
                items.append(current)
            asked = "" if row.get("display_kind") in HIDDEN_KINDS else strip_note(content)
            current = {"asked": clip(asked)[:4000], "body": "", "key": key}
        elif role == "assistant" and content.strip() and not SILENCE.match(content):
            if current is None:
                current = {"asked": "", "body": "", "key": key}
            current["body"] = clip(content).strip()[:4000]
    if current and current["body"]:
        items.append(current)
    return items if limit is None else items[-limit:]


def history_page(items, before, limit=HISTORY_EXCHANGES):
    """(the ``limit`` exchanges before the one keyed ``before``, whether older ones remain)."""
    at = next((i for i, item in enumerate(items) if item.get("key") == before), None)
    if at is None:
        return [], False
    start = max(0, at - limit)
    return items[start:at], start > 0


def bot_chat_id(home: Path) -> str:
    """The profile's canonical Bot Chat: the newest unarchived session titled exactly "Bot Chat"."""
    path = home / "state.db"
    if not path.is_file():
        return ""
    try:
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
        try:
            row = db.execute(
                "select id from sessions where title = ? and coalesce(archived, 0) = 0 "
                "order by coalesce(last_activity_at, started_at) desc limit 1", (BOT_CHAT,)).fetchone()
        finally:
            db.close()
    except sqlite3.Error:
        return ""
    return str(row[0]) if row else ""


def clip(text) -> str:
    return str(text or "")[:TEXT_LIMIT]


class BotState:
    """Event bookkeeping for one bot's Bot Chat, independent of the transport (unit-tested)."""

    def __init__(self, bot: str, emit):
        self.bot = bot
        self.emit = emit
        self.session_id = ""
        self.generation = 0
        self.completed: dict[str, None] = {}  # insertion-ordered; the oldest is forgotten first
        self.mine: dict[str, str] = {}        # admission id -> askId
        self.streams: dict[str, str] = {}     # admission id -> text so far
        self.held: list[dict] = []            # events seen while a submit's receipt is in flight
        self.submitting = 0
        self.asked: dict[str, str] = {}       # admission id -> the question, for turns started elsewhere
        self.transcript: list[dict] = []      # every exchange of the Bot Chat as of the last attach
        self.prompts: dict[str, dict] = {}    # open approvals / questions by prompt id
        self.asks_by_prompt: dict[str, str] = {}

    def prompt(self, payload: dict, ask=None) -> None:
        """An approval or clarifying question the gateway is waiting on."""
        prompt_id = str(payload.get("prompt_id") or "")
        if not prompt_id:
            return
        kind = "clarify" if payload.get("kind") == "clarify" or "question" in payload else "approval"
        raw_choices = payload.get("choices") or []
        command = str(payload.get("command") or "")
        safe = (isinstance(raw_choices, list) and len(raw_choices) <= 32
                and all(isinstance(c, str) and 0 < len(c) <= 4000 for c in raw_choices)
                and len(command) <= TEXT_LIMIT and not payload.get("multi_select")
                and len(str(payload.get("description") or payload.get("question") or "")) <= TEXT_LIMIT)
        if kind == "approval" and not raw_choices:
            safe = False
        self.prompts[prompt_id] = {"kind": kind, "generation": payload.get("execution_generation", self.generation),
                                  "choices": raw_choices if safe else [], "answerable": safe}
        extra = {"askId": ask} if ask else {}
        if ask:
            self.asks_by_prompt[prompt_id] = ask
        choices = raw_choices if safe else []
        event = dict(ev="prompt", bot=self.bot, promptId=prompt_id, kind=kind, choices=choices,
                     multiSelect=bool(payload.get("multi_select")), answerable=safe, **extra)
        if kind == "approval":
            event["text"] = clip(payload.get("description") or "Run this command?")
            if payload.get("command"):
                event["command"] = command if safe else "[Open Hermes to review the full command]"
        else:
            event["text"] = clip(payload.get("question") or "")
        self.emit(**event)

    def settled(self, prompt_id: str) -> None:
        if self.prompts.pop(prompt_id, None) is not None:
            self.asks_by_prompt.pop(prompt_id, None)
            self.emit(ev="settled", bot=self.bot, promptId=prompt_id)

    def attached(self, snapshot: dict) -> None:
        """The recent conversation, then any prompts already open when this viewer attached."""
        self.transcript = history_items(snapshot.get("messages"), limit=None)
        recent = self.transcript[-HISTORY_EXCHANGES:]
        self.emit(ev="history", bot=self.bot, items=recent, more=len(self.transcript) > len(recent))
        open_now = {str(p.get("prompt_id")): p for p in snapshot.get("prompts") or [] if isinstance(p, dict)}
        for prompt_id in list(self.prompts):
            if prompt_id not in open_now:
                self.settled(prompt_id)
        for prompt_id, payload in open_now.items():
            if prompt_id not in self.prompts:
                self.prompt(payload)

    def own(self, admission: str, ask_id: str) -> None:
        """A submit's receipt arrived: replay what the owner published before it."""
        self.mine[admission] = ask_id
        self.submitting = max(0, self.submitting - 1)
        held, self.held = self.held, []
        for params in held:
            self.handle(params)

    def submit_failed(self) -> None:
        self.submitting = max(0, self.submitting - 1)
        held, self.held = self.held, []
        for params in held:
            self.handle(params)

    def handle(self, params: dict) -> bool:
        """Apply one event frame's params. Returns False when the session must be re-attached."""
        if params.get("session_id") != self.session_id:
            return True
        kind = params.get("type")
        payload = params.get("payload") or {}
        if isinstance(params.get("execution_generation"), int):
            self.generation = params["execution_generation"]
        if kind == "session.replay_gap":
            return False
        if kind == "session.info":
            if isinstance(payload.get("execution_generation"), int):
                self.generation = payload["execution_generation"]
            for row in payload.get("pending") or []:
                if isinstance(row, dict) and row.get("admission_id") and isinstance(row.get("text"), str):
                    self.asked.setdefault(row["admission_id"], strip_note(row["text"])[:4000])
            return True
        if kind in ("approval.settled", "clarify.settled"):
            self.settled(str(payload.get("prompt_id") or ""))
            return True
        admission = params.get("admission_id") or payload.get("admission_id") or ""
        if not admission and kind in ("approval.request", "clarify.request"):
            self.prompt({**payload, "kind": "clarify" if kind == "clarify.request" else "approval"})
            return True
        if not admission:
            return True
        if admission not in self.mine and self.submitting:
            self.held.append(params)
            if len(self.held) > 128:
                raise RuntimeError("gateway event buffer full")
            return True
        if admission in self.completed:
            return True
        ask = self.mine.get(admission)
        extra = {"askId": ask} if ask else {}
        if kind == "message.start":
            self.streams[admission] = ""
        elif kind == "message.delta":
            text = payload.get("text") or payload.get("delta") or payload.get("content") or ""
            if isinstance(text, str) and text:
                self.streams[admission] = clip(self.streams.get(admission, "") + text)
                self.emit(ev="delta", bot=self.bot, text=self.streams[admission].strip(), **extra)
        elif kind == "tool.start":
            # Text streamed before a tool call is commentary the final reply does not repeat.
            self.streams[admission] = ""
            self.emit(ev="progress", bot=self.bot, text=tool_label(payload), **extra)
        elif kind == "tool.complete":
            self.emit(ev="progress", bot=self.bot, text="Thinking…", **extra)
        elif kind == "thinking.delta":
            status = str(payload.get("text") or "").strip()
            if status and not self.streams.get(admission):
                self.emit(ev="progress", bot=self.bot, text=status[:120], **extra)
        elif kind in ("approval.request", "clarify.request"):
            self.prompt({**payload, "kind": "clarify" if kind == "clarify.request" else "approval"}, ask)
        elif kind == "message.complete":
            self.completed[admission] = None
            while len(self.completed) > COMPLETED_LIMIT:
                del self.completed[next(iter(self.completed))]
            text = payload.get("text") or payload.get("content") or self.streams.get(admission, "")
            self.streams.pop(admission, None)
            self.mine.pop(admission, None)
            asked = self.asked.pop(admission, "")
            status = str(payload.get("status") or payload.get("outcome") or "complete")
            text = clip(text).strip()
            if SILENCE.match(text):
                text = ""
            if not text and ask is None:
                return True  # an empty turn nobody here asked for (a [SILENT] wake): nothing to show
            if ask is None and asked:
                extra = {"asked": asked}
            self.emit(ev="complete", bot=self.bot, text=text, status=status, **extra)
        return True


class BotLink:
    """Keeps one profile's Bot Chat attached, reconnecting with backoff."""

    def __init__(self, bridge, bot: str, home: Path):
        self.bridge = bridge
        self.bot = bot
        self.home = home
        self.state = BotState(bot, bridge.emit)
        self.client = None
        self.up = asyncio.Event()
        self.task = asyncio.create_task(self.run())

    async def run(self) -> None:
        delay = RETRY_MIN
        while True:
            was_up = False
            try:
                await self.attach_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # any transport failure: report, back off, retry
                self.bridge.emit(ev="status", bot=self.bot, state="down", detail=type(exc).__name__)
            finally:
                was_up = self.up.is_set()
                self.client = None
                self.up.clear()
            if was_up:
                # attach_once only returns by raising; a link that came up starts the backoff over.
                delay = RETRY_MIN
            await self.pause(delay)
            delay = min(RETRY_MAX, delay * 2)

    async def pause(self, seconds: float) -> None:
        await asyncio.sleep(seconds)

    async def attach_once(self) -> None:
        from websockets.asyncio.client import connect
        from hermes_cli.gateway_client import (GATEWAY_WS_PROTOCOL, GatewayClient, _session_ticket,
                                               gateway_ws_target)
        from hermes_cli.gateway_runtime import attachable, ensure_gateway_runtime

        session_id = await asyncio.to_thread(bot_chat_id, self.home)
        if not session_id:
            raise RuntimeError("no Bot Chat yet: open this bot once in Hermes Desktop or the CLI")
        # Hermes 0.23 keeps one gateway per host for every profile. ensure resolves
        # this profile's home to that owner (its served_profiles list) and does not
        # start a second gateway while the host one is up. History re-reads and asks
        # both come through this same attach.
        result = await asyncio.to_thread(ensure_gateway_runtime, self.home, idle_exit=True)
        if not attachable(result):
            raise RuntimeError(f"gateway {result.state}: {result.reason_code or 'not ready'}")
        ticket = await asyncio.to_thread(_session_ticket, self.home, result.endpoint)
        url, protocols = gateway_ws_target(result.endpoint, ticket)
        async with connect(url, subprotocols=protocols, open_timeout=10, max_size=8 * 1024 * 1024,
                           proxy=None) as ws:
            if ws.subprotocol != GATEWAY_WS_PROTOCOL:
                raise RuntimeError("gateway protocol mismatch; update or restart Hermes")
            async with GatewayClient(ws) as client:
                try:
                    snapshot = await client.rpc("session.resume", session_id=session_id)
                except Exception as exc:
                    data = getattr(exc, "data", None) or {}
                    if "cwd" in (data.get("fields") or [data.get("field")]):
                        raise RuntimeError("its Bot Chat's saved working folder no longer exists; "
                                           "reopen the Bot Chat in Hermes to repair it") from None
                    raise
                new_session = snapshot.get("stored_session_id") or session_id
                if new_session != self.state.session_id:
                    self.state = BotState(self.bot, self.bridge.emit)
                self.state.session_id = new_session
                self.state.generation = snapshot.get("execution_generation") or 0
                self.client = client
                self.state.attached(snapshot)
                self.up.set()
                self.bridge.emit(ev="status", bot=self.bot, state="up")
                while True:
                    event = await client.events.get()
                    if isinstance(event, Exception):
                        raise RuntimeError("gateway disconnected")
                    if not self.state.handle(event.get("params") or {}):
                        raise RuntimeError("replay gap; re-attaching")
