"""Session-only conversation state for the daemon backend.

A branch-for-branch port of the conversation logic in Main.qml (threads,
history, unread bots, waiting webhook asks, clear/undo, notices and replies)
and its text cleaners. It performs no I/O: time and ask identities are
injected, and everything the shell must animate is queued in `effects`.
See docs/DESKTOP-PROTOCOL.md for how each effect maps to QML.
"""
import re
import secrets

from .wake import route as _route_wake

DEFAULT_BOT_ID = "e0195a7d-f804-4688-9191-e2cf3574a6d1"
HISTORY_LIMIT = 40
REPLY_WAIT_MS = 600000
UNDO_MS = 8000
EXPIRY_TICK_MS = 30000
ASK_TIMEOUT_MS = 1830000
FILE_LIMIT = 4

UNAVAILABLE_TEXT = "Selected agent is unavailable. Refresh providers or select another agent."
STOPPED_TEXT = "Stopped waiting. Remote work may continue; check the provider."
TIMED_OUT_TEXT = "That took too long, so I stopped waiting."
NO_REPLY_TEXT = "The ask didn't return a reply."
ATTACHMENT_ONLY_TEXT = "Have a look at this."

# JavaScript's WhiteSpace and LineTerminator set, which String.prototype.trim
# and the regex class \s use. Python's own sets differ (\x1c-\x1f, \x85, ﻿).
_JS_SPACE = "\t\n\x0b\x0c\r    -     　﻿"
_TRIM = re.compile(f"^[{_JS_SPACE}]+|[{_JS_SPACE}]+$")
_SPACES = re.compile(f"[{_JS_SPACE}]+")
_LINE_CONTROLS = re.compile("[\u0000-\u001f\u007f-\u009f]+")
_PROMPT_CONTROLS = re.compile("[\u0000-\u0009\u000b-\u001f\u007f-\u009f]+")
_ANSI = re.compile("\u001b\\[[0-9;]*[A-Za-z]")
_TEXT_CONTROLS = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]")
_URL_BAD = re.compile(f"[{_JS_SPACE}\u0000-\u001f\u007f-\u009f<>\"'`\\\\]")
_URL = re.compile(r"^(https?)://([^/?#]*)", re.IGNORECASE)
_SURROGATE = re.compile("[\ud800-\udfff]")


def js_trim(value):
    return _TRIM.sub("", value)


def js_length(value):
    """String length in UTF-16 code units, as JavaScript counts it."""
    return len(value) + sum(1 for ch in value if ord(ch) > 0xFFFF)


def js_slice(value, limit):
    """value.slice(0, limit) in UTF-16 units, never ending on half a pair."""
    if len(value) * 2 <= limit:
        return value
    units = 0
    for index, ch in enumerate(value):
        units += 2 if ord(ch) > 0xFFFF else 1
        if units > limit:
            return value[:index]
    return value


def js_string(value):
    """String(value || "") for the JSON values a client can send."""
    if value is None or value is False or value == "" or value == 0:
        return ""
    if value is True:
        return "true"
    if isinstance(value, str):
        return _SURROGATE.sub("�", value)
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def plain_line(value, limit):
    return js_slice(js_trim(_LINE_CONTROLS.sub(" ", js_string(value))), limit)


def plain_prompt(value, limit):
    text = re.sub("\r\n?", "\n", js_string(value))
    text = _PROMPT_CONTROLS.sub(" ", text)
    text = re.sub("\n{3,}", "\n\n", re.sub("[ ]+\n", "\n", text))
    return js_slice(js_trim(text), limit)


def clean_text(value, limit):
    text = _TEXT_CONTROLS.sub("", _ANSI.sub("", js_string(value)))
    return js_slice(js_trim(text), limit)


def safe_url(value):
    url = js_string(value)
    if not url or js_length(url) > 2048:
        return ""
    if _URL_BAD.search(url):
        return ""
    match = _URL.match(url)
    if not match or "@" in match.group(2):
        return ""
    host = re.sub(r":\d{1,5}$", "", match.group(2))
    host = re.sub(r"^\[|\]$", "", host).lower()
    if host == "":
        return ""
    if match.group(1).lower() == "http" and host not in ("localhost", "127.0.0.1", "::1"):
        return ""
    return url


def link_button(label, url):
    clean_label = plain_line(label, 24)
    clean_url = safe_url(url)
    return {"label": clean_label, "url": clean_url} if clean_label and clean_url else None


def preview_snippet(text):
    return plain_line(text, 160)


# Wake phrases share one implementation with the dictation router and watcher.


def _thread(value=None):
    value = value or {}
    return {"history": list(value.get("history") or []), "asked": value.get("asked") or "",
            "files": list(value.get("files") or []), "body": value.get("body") or "",
            "links": list(value.get("links") or []), "wait": value.get("wait") or "",
            "pending": list(value.get("pending") or [])}


def _exchange(thread):
    return {"asked": thread["asked"], "files": list(thread["files"]), "body": thread["body"],
            "links": list(thread["links"]), "wait": thread["wait"]}


class Conversations:
    """Every bot's conversation for one desktop session.

    `view` is the bot on screen (Main.qml's threadBotId) and `cur` its
    conversation (history, askedText, askedFiles, bubbleBody, noticeLinks,
    awaitingId and pendingFiles). Other bots' conversations live in `threads`.
    """

    def __init__(self, clock, new_id=None):
        self.clock = clock
        self.new_id = new_id or (lambda: secrets.token_hex(6))
        self.bots = []
        self.view = DEFAULT_BOT_ID
        self.bubble_open = False
        self.cur = _thread()
        self.threads = {}
        self.unread = []
        self.awaiting = {}
        self.cleared = None
        self.asking = False
        self.ask_bot = ""
        self.ask_id = ""
        self.partial = ""
        self.launch = None
        self.effects = []

    # -- effects -----------------------------------------------------------
    def effect(self, kind, bot_id="", text=""):
        self.effects.append({"kind": kind, "botId": bot_id, "text": text})

    def take_effects(self):
        effects, self.effects = self.effects, []
        return effects

    def take_launch(self):
        launch, self.launch = self.launch, None
        return launch

    # -- roster ------------------------------------------------------------
    def set_roster(self, bots):
        self.bots = [dict(bot) for bot in bots]

    def find_bot(self, bot_id):
        for bot in self.bots:
            if bot["id"] == bot_id:
                return bot
        return None

    @staticmethod
    def label_of(bot):
        if not bot:
            return "Bob"
        short = js_string(bot.get("shortName"))
        if short:
            return short
        name = js_string(bot.get("name")) or "Bob"
        split = name.find(" · ")
        return name[:split] if split > 0 else name

    def match_bot(self, query):
        q = js_trim(js_string(query))
        lower = q.lower()
        if q == "":
            return None
        for bot in self.bots:
            if bot["id"] == q:
                return bot
        matched = None
        for bot in self.bots:
            if js_string(bot.get("name")).lower() == lower or js_string(bot.get("shortName")).lower() == lower:
                if matched:
                    return None
                matched = bot
        return matched

    # -- switching bots ------------------------------------------------------
    def stash(self, bot_id):
        self.threads[bot_id] = _thread(self.cur)

    def load(self, bot_id):
        self.cur = _thread(self.threads.get(bot_id))
        self.unread = [other for other in self.unread if other != bot_id]

    def set_view(self, bot_id, bubble_open=None):
        if bubble_open is not None:
            self.bubble_open = bubble_open
        if bot_id != self.view:
            self.cleared = None
            self.stash(self.view)
            self.view = bot_id
            self.load(bot_id)
        return "ok"

    def select_bot(self, bot_id):
        """selectBot(id) as wake routing calls it; the shell is told to follow."""
        if not self.find_bot(bot_id):
            return "unknown bot"
        self.set_view(bot_id)
        self.effect("select", bot_id)
        return "ok"

    def set_pending(self, files):
        self.cur["pending"] = list(files)
        return "ok"

    # -- delivering replies ----------------------------------------------------
    def thread_of(self, bot_id):
        return _thread(self.threads.get(bot_id))

    def announce_reply(self, bot_id, text):
        preview = preview_snippet(text)
        if preview == "":
            return
        if bot_id == "" or bot_id == self.view:
            self.effect("cue-active", bot_id or self.view, preview)
        else:
            self.effect("cue-peek", bot_id, preview)

    def mark_unread(self, bot_id):
        if bot_id not in self.unread:
            self.unread = self.unread + [bot_id]
        self.effect("unread", bot_id)

    def deliver(self, bot_id, body):
        target = self.view if bot_id == "" else bot_id
        if bot_id == "" or bot_id == self.view:
            self.cur["body"] = body
            self.announce_reply(target, body)
            return True
        thread = self.thread_of(bot_id)
        thread["body"] = body
        self.threads[bot_id] = thread
        self.mark_unread(bot_id)
        self.announce_reply(target, body)
        return False

    def archive_exchange(self):
        self.cleared = None
        cur = self.cur
        if cur["asked"] == "" and cur["body"] == "" and not cur["links"]:
            return
        cur["history"] = (cur["history"] + [_exchange(cur)])[-HISTORY_LIMIT:]
        cur.update(asked="", files=[], body="", links=[], wait="")

    def start_waiting(self, ask_id, bot_id):
        if ask_id == "":
            return
        self.awaiting[ask_id] = {"botId": bot_id, "since": self.clock()}
        if bot_id == self.view:
            self.cur["wait"] = ask_id
            return
        thread = self.thread_of(bot_id)
        thread["wait"] = ask_id
        self.threads[bot_id] = thread

    @staticmethod
    def index_waiting(items, ask_id):
        for index in range(len(items) - 1, -1, -1):
            if items[index].get("wait") == ask_id:
                return index
        return -1

    def oldest_waiting(self, bot_id):
        best, since = "", float("inf")
        for ask_id, info in self.awaiting.items():
            if info["botId"] == bot_id and info["since"] < since:
                best, since = ask_id, info["since"]
        return best

    def append_reply(self, bot_id, text, links=None):
        if bot_id == self.view:
            self.archive_exchange()
            self.cur["links"] = list(links or [])
            self.cur["body"] = text
            self.announce_reply(bot_id, text)
            return True
        thread = self.thread_of(bot_id)
        past = list(thread["history"])
        if thread["asked"] != "" or thread["body"] != "" or thread["links"]:
            past = (past + [_exchange(thread)])[-HISTORY_LIMIT:]
        thread.update(history=past, asked="", files=[], links=list(links or []), wait="", body=text)
        self.threads[bot_id] = thread
        self.mark_unread(bot_id)
        self.announce_reply(bot_id, text)
        return False

    def answer_waiting(self, ask_id, text):
        info = self.awaiting.pop(ask_id, None)
        if not info:
            return False
        bot_id = info["botId"]
        if bot_id == self.view:
            if self.cur["wait"] == ask_id:
                self.cur["body"] = text
                self.cur["wait"] = ""
                self.announce_reply(bot_id, text)
                return True
            index = self.index_waiting(self.cur["history"], ask_id)
            if index < 0:
                return self.append_reply(bot_id, text)
            history = list(self.cur["history"])
            history[index] = dict(history[index], body=text, wait="")
            self.cur["history"] = history
            self.announce_reply(bot_id, text)
            return True
        thread = self.thread_of(bot_id)
        if thread["wait"] == ask_id:
            thread["body"] = text
            thread["wait"] = ""
        else:
            past = list(thread["history"])
            at = self.index_waiting(past, ask_id)
            if at < 0:
                return self.append_reply(bot_id, text)
            past[at] = dict(past[at], body=text, wait="")
            thread["history"] = past
        self.threads[bot_id] = thread
        self.mark_unread(bot_id)
        self.announce_reply(bot_id, text)
        return False

    def land_reply(self, here, text=""):
        if here:
            self.effect("landed", self.view, text)

    def receive_reply(self, target, text):
        body = clean_text(text, 4000)
        if body == "":
            return "empty text"
        key = js_trim(js_string(target))
        if key in self.awaiting:
            self.land_reply(self.answer_waiting(key, body), body)
            return "ok"
        bot = self.match_bot(key)
        if not bot:
            return "unknown ask or bot"
        waiting = self.oldest_waiting(bot["id"])
        here = self.answer_waiting(waiting, body) if waiting else self.append_reply(bot["id"], body)
        self.land_reply(here, body)
        return "ok"

    def expire_waiting(self):
        now = self.clock()
        expired = False
        for ask_id in list(self.awaiting):
            info = self.awaiting.get(ask_id)
            if not info or now - info["since"] < REPLY_WAIT_MS:
                continue
            label = self.label_of(self.find_bot(info["botId"]))
            self.answer_waiting(ask_id, "No answer yet. " + label + "'s reply will be in Grok Bot.")
            expired = True
        self.effect("rest")
        return expired

    def say_notice(self, title, text, links):
        body = plain_line(text, 300)
        if body == "":
            return "empty text"
        who = plain_line(title, 80)
        bot = self.match_bot(who)
        if bot:
            words = clean_text(text, 4000)
            waiting = self.oldest_waiting(bot["id"]) if not links else ""
            if waiting != "":
                self.land_reply(self.answer_waiting(waiting, words), words)
                return "ok"
            if bot["id"] != self.view:
                self.append_reply(bot["id"], words, links)
                return "ok"
            self.effect("alert", self.view)
            self.archive_exchange()
            self.cur["links"] = list(links or [])
            self.cur["body"] = words
            return "ok"
        self.effect("alert", self.view)
        self.archive_exchange()
        self.cur["links"] = list(links or [])
        self.cur["body"] = (who + "\n" if who != "" else "") + body
        return "ok"

    # -- clear and undo --------------------------------------------------------
    def undo_live(self):
        return self.cleared is not None and self.clock() - self.cleared["at"] < UNDO_MS

    @property
    def can_clear(self):
        cur = self.cur
        asking_here = self.asking and self.ask_bot == self.view
        return not asking_here and bool(cur["history"] or cur["asked"] or cur["body"] or cur["links"])

    def clear_conversation(self):
        if not self.can_clear:
            return "nothing to clear"
        cur = self.cur
        self.cleared = dict(_exchange(cur), botId=self.view, history=list(cur["history"]), at=self.clock())
        cur.update(history=[], asked="", files=[], body="", links=[], wait="")
        self.effect("open", self.view)
        return "ok"

    def undo_clear(self):
        cleared = self.cleared
        if not self.undo_live() or cleared["botId"] != self.view:
            return "nothing"
        self.cur.update(history=cleared["history"], asked=cleared["asked"], files=cleared["files"],
                        body=cleared["body"], links=cleared["links"], wait=cleared["wait"] or "")
        self.cleared = None
        return "ok"

    def expire_undo(self, record=None):
        """The 8-second undo timer fired for `record` (the cleared conversation it was
        started for), or a clock check without one. Returns whether anything changed."""
        if self.cleared is not None and (self.cleared is record or not self.undo_live()):
            self.cleared = None
            return True
        return False

    # -- asking --------------------------------------------------------------
    def fail_ask(self, message):
        self.asking = False
        self.cur["body"] = message
        self.effect("idle", self.view)
        self.effect("open", self.view)

    def launch_ask(self, prompt):
        if self.asking:
            return "busy"
        bot = self.find_bot(self.view)
        if not bot:
            self.fail_ask(UNAVAILABLE_TEXT)
            return "error"
        self.effect("open", self.view)
        self.archive_exchange()
        self.cur["asked"] = js_string(prompt)
        self.cur["files"] = list(self.cur["pending"])
        self.cur["pending"] = []
        self.ask_id = self.new_id()
        self.ask_bot = self.view
        self.asking = True
        self.partial = ""
        self.effect("ask-started", self.view)
        self.launch = {"askId": self.ask_id, "botId": self.view,
                       "agentId": js_string(bot.get("agentId")) or bot["id"],
                       "provider": js_string(bot.get("provider")) or "grokbot",
                       "prompt": self.cur["asked"], "attachments": list(self.cur["files"])}
        return "ok"

    def submit_prompt(self, value):
        prompt = plain_prompt(value, 4000)
        if prompt == "" and self.cur["pending"]:
            prompt = ATTACHMENT_ONLY_TEXT
        if prompt == "":
            return "empty"
        if self.asking:
            return "busy"
        route = _route_wake(prompt, self.bots, DEFAULT_BOT_ID)
        if route["matched"]:
            if route["botId"]:
                self.select_bot(route["botId"])
            prompt = plain_prompt(route["prompt"], 4000)
            self.effect("draft-clear", self.view)
            if prompt == "":
                self.effect("open", self.view)
                return "opened"
        else:
            self.effect("draft-clear", self.view)
        return self.launch_ask(prompt)

    def ask_line(self, value):
        text = plain_line(value, 4000)
        if text == "":
            return "empty"
        return self.launch_ask(text)

    def dictate_text(self, value):
        self.effect("dictation-ended")
        raw = plain_line(value, 4000)
        if raw == "":
            return "empty"
        route = _route_wake(raw, self.bots, DEFAULT_BOT_ID)
        if not route["matched"]:
            return "ignored"
        if self.asking:
            return "busy"
        if route["botId"]:
            self.select_bot(route["botId"])
        self.effect("draft-clear", self.view)
        self.effect("open", self.view)
        if not route["prompt"]:
            return "opened"
        return self.launch_ask(route["prompt"])

    def ask_delta(self, ask_id, text):
        if not self.asking or ask_id != self.ask_id:
            return False
        self.partial = clean_text(text, 4000)
        return True

    def ask_finished(self, ask_id, status, text="", error=""):
        """askProc.onExited: status is "completed", "failed" or "deferred"."""
        if not self.asking or ask_id != self.ask_id:
            return False
        self.asking = False
        self.partial = ""
        if status == "deferred":
            self.start_waiting(ask_id, self.ask_bot)
            return True
        out = clean_text(text, 4000) if status == "completed" else ""
        err = clean_text(error, 400)
        ok = out != ""
        message = out if ok else (err if err != "" else NO_REPLY_TEXT)
        here = self.deliver(self.ask_bot, message)
        if here and ok:
            self.effect("landed", self.ask_bot, message)
        elif here:
            self.effect("failed", self.ask_bot, message)
        else:
            self.effect("idle", self.ask_bot)
        return True

    def cancel_ask(self):
        """cancelAsk(): returns the ask id whose work must now be stopped."""
        ask_id = self.ask_id if self.asking else ""
        self.asking = False
        self.partial = ""
        return ask_id

    def stop_ask(self):
        if not self.asking:
            return "nothing", ""
        ask_id = self.cancel_ask()
        self.deliver(self.ask_bot, STOPPED_TEXT)
        self.effect("idle", self.view)
        return "ok", ask_id

    def ask_timed_out(self, ask_id):
        if not self.asking or ask_id != self.ask_id:
            return False
        self.cancel_ask()
        if self.deliver(self.ask_bot, TIMED_OUT_TEXT):
            self.effect("failed", self.ask_bot, TIMED_OUT_TEXT)
        else:
            self.effect("idle", self.ask_bot)
        return True

    # -- what the shell shows ----------------------------------------------------
    def awaiting_bots(self):
        seen = []
        for info in self.awaiting.values():
            if info["botId"] not in seen:
                seen.append(info["botId"])
        return seen

    def snapshot(self):
        cur = self.cur
        here = self.asking and self.ask_bot == self.view
        return {"botId": self.view, "history": [dict(item) for item in cur["history"]],
                "asked": cur["asked"], "files": list(cur["files"]), "pending": list(cur["pending"]),
                "body": cur["body"], "partial": self.partial if here else "", "links": list(cur["links"]),
                "wait": cur["wait"], "asking": self.asking, "askBotId": self.ask_bot,
                "askId": self.ask_id if self.asking else "", "unreadBots": list(self.unread),
                "awaitingBots": self.awaiting_bots(),
                "undo": self.undo_live() and self.cleared["botId"] == self.view}
