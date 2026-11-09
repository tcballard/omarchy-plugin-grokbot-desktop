"""Unit tests for agent_desktop/state.py, the daemon's port of Main.qml's conversation logic."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from agent_desktop import state as conv  # noqa: E402
from agent_desktop import wake  # noqa: E402

GROK = conv.DEFAULT_BOT_ID
BOTS = [
    {"id": GROK, "agentId": GROK, "provider": "grokbot", "name": "Bob · Main", "shortName": ""},
    {"id": "ada", "agentId": "ada", "provider": "grokbot", "name": "Ada Lovelace", "shortName": "Ada"},
    {"id": "example:echo", "agentId": "echo", "provider": "example", "name": "Example Agent", "shortName": "Echo"},
]


class Clock:
    def __init__(self):
        self.now = 1_000_000

    def __call__(self):
        return self.now


class Base(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        ids = iter(f"{n:012x}" for n in range(1, 1000))
        self.s = conv.Conversations(self.clock, lambda: next(ids))
        self.s.set_roster(BOTS)
        self.s.set_view(GROK)

    def kinds(self):
        return [item["kind"] for item in self.s.take_effects()]

    def ask(self, prompt="question", bot=None):
        if bot is not None:
            self.s.set_view(bot)
        self.assertEqual(self.s.ask_line(prompt), "ok")
        launch = self.s.take_launch()
        self.s.take_effects()
        return launch["askId"]

    def answer(self, ask_id, text="answer"):
        self.assertTrue(self.s.ask_finished(ask_id, "completed", text))


class Cleaners(unittest.TestCase):
    def test_plain_line_turns_controls_to_spaces_trims_and_limits(self):
        self.assertEqual(conv.plain_line("  a\x00\x01b\nc\x85d ﻿", 100), "a b c d")
        self.assertEqual(conv.plain_line("abcdef", 3), "abc")
        self.assertEqual(conv.plain_line(None, 10), "")

    def test_plain_prompt_keeps_line_breaks(self):
        self.assertEqual(conv.plain_prompt("a\r\nb\rc\td  \n\n\n\ne", 100), "a\nb\nc d\n\ne")

    def test_clean_text_strips_ansi_and_controls_but_keeps_tabs_and_newlines(self):
        self.assertEqual(conv.clean_text("\x1b[31mred\x1b[0m\x07\tx\ny\r", 100), "red\tx\ny")

    def test_limits_count_utf16_units_without_splitting_a_pair(self):
        self.assertEqual(conv.js_slice("a\U0001F600b", 2), "a")
        self.assertEqual(conv.js_slice("a\U0001F600b", 3), "a\U0001F600")
        self.assertEqual(conv.js_length("\U0001F600"), 2)
        self.assertEqual(conv.plain_line("\ud800x", 10), "�x")

    def test_safe_url(self):
        ok = ["https://example.com/a?b#c", "http://localhost:8080/x", "http://127.0.0.1/", "http://[::1]:3/",
              "HTTPS://Example.com"]
        bad = ["", "ftp://x", "http://example.com", "https://user@x.com", "https://x.com/a b",
               "https://x.com/\"", "https://", "javascript:alert(1)", "https://x.com/" + "a" * 2048,
               "https://x.com/ "]
        for url in ok:
            self.assertEqual(conv.safe_url(url), url, url)
        for url in bad:
            self.assertEqual(conv.safe_url(url), "", url)

    def test_link_button(self):
        self.assertEqual(conv.link_button("  Open the thing now please ok", "https://x.y"),
                         {"label": "Open the thing now pleas", "url": "https://x.y"})
        self.assertIsNone(conv.link_button("", "https://x.y"))
        self.assertIsNone(conv.link_button("Go", "http://x.y"))


class Wake(unittest.TestCase):
    def route(self, text):
        return conv._route_wake(text, BOTS, GROK)

    def test_primary_phrases(self):
        for phrase, prompt in [("Hey bot, what's up", "what's up"), ("hey Bob", ""),
                               ("HEY grok — open it", "open it"), ("hey grok bot: hi", "hi"),
                               ("hey grok botanist", "botanist")]:
            route = self.route(phrase)
            self.assertTrue(route["matched"], phrase)
            self.assertEqual((route["botId"], route["prompt"]), (GROK, prompt), phrase)

    def test_roster_names_take_the_longest_label(self):
        route = self.route("hey ada lovelace, compute")
        self.assertEqual((route["botId"], route["prompt"], route["wake"]), ("ada", "compute", "hey Ada"))
        self.assertEqual(self.route("hey echo  say\nthis")["prompt"], "say this")

    def test_misses(self):
        for phrase in ["hello bot", "hey adams", "they bot", "hey", "hey botty"]:
            route = self.route(phrase)
            self.assertFalse(route["matched"], phrase)
            self.assertEqual(route["prompt"], wake.normalize(phrase))


class Roster(Base):
    def test_match_bot(self):
        self.assertEqual(self.s.match_bot(" ada ")["id"], "ada")
        self.assertEqual(self.s.match_bot("EXAMPLE AGENT")["id"], "example:echo")
        self.assertEqual(self.s.match_bot("example:echo")["id"], "example:echo")
        self.assertIsNone(self.s.match_bot(""))
        self.assertIsNone(self.s.match_bot("nobody"))
        self.s.set_roster(BOTS + [{"id": "x", "name": "Ada", "shortName": ""}])
        self.assertIsNone(self.s.match_bot("Ada"))
        self.assertEqual(self.s.match_bot("ada")["id"], "ada")

    def test_label_of(self):
        self.assertEqual(self.s.label_of(None), "Bob")
        self.assertEqual(self.s.label_of(BOTS[0]), "Bob")
        self.assertEqual(self.s.label_of(BOTS[1]), "Ada")
        self.assertEqual(self.s.label_of({"name": " · x"}), " · x")


class Asking(Base):
    def test_launch_archives_the_latest_exchange_and_takes_pending_files(self):
        self.s.say_notice("Status", "Build done", [])
        self.s.set_pending(["/run/a.png"])
        self.assertEqual(self.s.ask_line(" what?\x01 "), "ok")
        self.assertEqual(self.kinds(), ["alert", "open", "ask-started"])
        snap = self.s.snapshot()
        self.assertEqual(snap["history"], [{"asked": "", "files": [], "body": "Status\nBuild done", "links": [], "wait": ""}])
        self.assertEqual((snap["asked"], snap["files"], snap["pending"], snap["asking"]), ("what?", ["/run/a.png"], [], True))
        launch = self.s.take_launch()
        self.assertEqual(launch, {"askId": "000000000001", "botId": GROK, "agentId": GROK, "provider": "grokbot",
                                  "prompt": "what?", "attachments": ["/run/a.png"]})
        self.assertEqual(self.s.ask_line("again"), "busy")
        self.assertEqual(self.s.ask_line(" \x02 "), "empty")

    def test_unavailable_agent_overwrites_the_body_without_archiving(self):
        self.s.say_notice("Status", "kept?", [])
        self.s.set_view("hermes:gone")
        self.s.say_notice("Status", "latest", [])
        self.s.take_effects()
        self.assertEqual(self.s.ask_line("hi"), "error")
        self.assertEqual(self.kinds(), ["idle", "open"])
        snap = self.s.snapshot()
        self.assertEqual((snap["body"], snap["asked"], snap["history"], snap["asking"]), (conv.UNAVAILABLE_TEXT, "", [], False))
        self.assertIsNone(self.s.take_launch())

    def test_reply_on_screen_lands(self):
        ask_id = self.ask()
        self.assertTrue(self.s.ask_delta(ask_id, "partial \x1b[1m"))
        self.assertEqual(self.s.snapshot()["partial"], "partial")
        self.answer(ask_id, "\x1b[1mhello\x1b[0m ")
        self.assertEqual(self.kinds(), ["cue-active", "landed"])
        snap = self.s.snapshot()
        self.assertEqual((snap["body"], snap["asking"], snap["askBotId"], snap["partial"]), ("hello", False, GROK, ""))
        self.assertFalse(self.s.ask_finished(ask_id, "completed", "late"))
        self.assertFalse(self.s.ask_delta(ask_id, "late"))

    def test_failure_on_screen_shows_the_error_or_a_fallback(self):
        ask_id = self.ask()
        self.s.ask_finished(ask_id, "failed", error="webhook status 401: " + "x" * 500)
        self.assertEqual(self.kinds(), ["cue-active", "failed"])
        self.assertEqual(len(self.s.snapshot()["body"]), 400)
        ask_id = self.ask()
        self.s.ask_finished(ask_id, "completed", "  \x1b[0m ")
        self.assertEqual(self.s.snapshot()["body"], conv.NO_REPLY_TEXT)

    def test_reply_for_a_bot_off_screen_is_kept_with_it_and_marked_unread(self):
        ask_id = self.ask(bot="ada")
        self.s.set_view(GROK)
        self.answer(ask_id, "for ada")
        effects = self.s.take_effects()
        self.assertEqual([e["kind"] for e in effects], ["unread", "cue-peek", "idle"])
        self.assertEqual(effects[1]["botId"], "ada")
        self.assertEqual(self.s.snapshot()["unreadBots"], ["ada"])
        self.assertEqual(self.s.snapshot()["body"], "")
        self.s.set_view("ada")
        snap = self.s.snapshot()
        self.assertEqual((snap["asked"], snap["body"], snap["unreadBots"]), ("question", "for ada", []))

    def test_deferred_ask_waits_on_its_exchange(self):
        ask_id = self.ask()
        self.assertTrue(self.s.ask_finished(ask_id, "deferred"))
        self.assertEqual(self.kinds(), [])
        snap = self.s.snapshot()
        self.assertEqual((snap["wait"], snap["awaitingBots"], snap["asking"]), (ask_id, [GROK], False))

    def test_stop_and_timeout(self):
        self.assertEqual(self.s.stop_ask(), ("nothing", ""))
        ask_id = self.ask()
        self.assertEqual(self.s.stop_ask(), ("ok", ask_id))
        self.assertEqual(self.kinds(), ["cue-active", "idle"])
        self.assertEqual(self.s.snapshot()["body"], conv.STOPPED_TEXT)
        self.assertFalse(self.s.ask_finished(ask_id, "completed", "too late"))
        ask_id = self.ask()
        self.assertEqual(self.s.cancel_ask(), ask_id)
        self.assertEqual((self.kinds(), self.s.snapshot()["body"]), ([], ""))
        ask_id = self.ask(bot="ada")
        self.s.set_view(GROK)
        self.assertTrue(self.s.ask_timed_out(ask_id))
        self.assertEqual(self.kinds(), ["unread", "cue-peek", "idle"])
        self.assertFalse(self.s.ask_timed_out(ask_id))
        ask_id = self.ask()
        self.s.ask_timed_out(ask_id)
        self.assertEqual(self.kinds(), ["cue-active", "failed"])
        self.assertEqual(self.s.snapshot()["body"], conv.TIMED_OUT_TEXT)

    def test_partial_shows_only_for_the_asking_bot(self):
        ask_id = self.ask(bot="ada")
        self.s.ask_delta(ask_id, "streaming")
        self.s.set_view(GROK)
        self.assertEqual(self.s.snapshot()["partial"], "")
        self.s.set_view("ada")
        self.assertEqual(self.s.snapshot()["partial"], "streaming")

    def test_history_keeps_forty_and_skips_empty_exchanges(self):
        for n in range(45):
            self.s.archive_exchange()
            self.s.cur["body"] = f"b{n}"
        self.s.archive_exchange()
        self.s.archive_exchange()
        history = self.s.snapshot()["history"]
        self.assertEqual(len(history), 40)
        self.assertEqual((history[0]["body"], history[-1]["body"]), ("b5", "b44"))


class Prompts(Base):
    def test_attachments_alone_get_a_default_prompt(self):
        self.s.set_pending(["/f"])
        self.assertEqual(self.s.submit_prompt("  "), "ok")
        self.assertEqual(self.s.take_launch()["prompt"], conv.ATTACHMENT_ONLY_TEXT)
        self.assertEqual(self.s.submit_prompt("x"), "busy")
        self.s.cancel_ask()
        self.assertEqual(self.s.submit_prompt("\n"), "empty")

    def test_wake_phrase_selects_the_bot_and_uses_its_pending_files(self):
        self.s.set_pending(["/for-grok"])
        self.s.set_view("ada")
        self.s.set_pending(["/for-ada"])
        self.s.set_view(GROK)
        self.assertEqual(self.s.submit_prompt("Hey Ada,\nwhat is 2+2?"), "ok")
        effects = self.s.take_effects()
        self.assertEqual([(e["kind"], e["botId"]) for e in effects],
                         [("select", "ada"), ("draft-clear", "ada"), ("open", "ada"), ("ask-started", "ada")])
        launch = self.s.take_launch()
        self.assertEqual((launch["botId"], launch["prompt"], launch["attachments"]), ("ada", "what is 2+2?", ["/for-ada"]))
        self.s.cancel_ask()
        self.s.set_view(GROK)
        self.assertEqual(self.s.snapshot()["pending"], ["/for-grok"])

    def test_bare_wake_phrase_opens(self):
        self.assertEqual(self.s.submit_prompt("hey echo"), "opened")
        self.assertEqual(self.kinds(), ["select", "draft-clear", "open"])
        self.assertEqual(self.s.view, "example:echo")

    def test_dictate(self):
        self.assertEqual(self.s.dictate_text("  "), "empty")
        self.assertEqual(self.kinds(), ["dictation-ended"])
        self.assertEqual(self.s.dictate_text("buy milk"), "ignored")
        self.assertEqual(self.kinds(), ["dictation-ended"])
        self.assertEqual(self.s.dictate_text("hey ada"), "opened")
        self.assertEqual(self.kinds(), ["dictation-ended", "select", "draft-clear", "open"])
        self.assertEqual(self.s.dictate_text("hey echo tell me"), "ok")
        self.assertEqual(self.s.take_launch()["prompt"], "tell me")
        self.assertEqual(self.s.dictate_text("hey ada hi"), "busy")
        self.assertEqual(self.s.view, "example:echo")

    def test_primary_wake_without_primary_in_roster_keeps_the_bot(self):
        self.s.set_roster(BOTS[1:])
        self.s.set_view("ada")
        self.assertEqual(self.s.dictate_text("hey bob hi"), "ok")
        self.assertEqual(self.s.take_launch()["botId"], "ada")
        self.assertNotIn("select", self.kinds())


class Replies(Base):
    def defer(self, bot=None):
        ask_id = self.ask(bot=bot)
        self.s.ask_finished(ask_id, "deferred")
        return ask_id

    def test_reply_fills_the_waiting_exchange_on_screen(self):
        ask_id = self.defer()
        self.assertEqual(self.s.receive_reply(ask_id, " done \x07"), "ok")
        self.assertEqual(self.kinds(), ["cue-active", "landed"])
        snap = self.s.snapshot()
        self.assertEqual((snap["body"], snap["wait"], snap["awaitingBots"]), ("done", "", []))
        self.assertEqual(self.s.receive_reply(ask_id, "again"), "unknown ask or bot")

    def test_reply_fills_a_waiting_exchange_moved_into_history(self):
        ask_id = self.defer()
        self.s.say_notice("Status", "newer", [])
        self.s.take_effects()
        self.s.receive_reply(ask_id, "answer")
        snap = self.s.snapshot()
        self.assertEqual(snap["history"][-1], {"asked": "question", "files": [], "body": "answer", "links": [], "wait": ""})
        self.assertEqual(snap["body"], "Status\nnewer")

    def test_reply_off_screen_marks_unread_without_landing(self):
        latest = self.defer(bot="ada")
        self.s.set_view(GROK)
        self.s.receive_reply(latest, "a1")
        self.assertEqual(self.kinds(), ["unread", "cue-peek"])
        older = self.defer(bot="ada")
        self.s.say_notice("Ada", "news", [{"label": "L", "url": "https://x.y"}])
        self.s.set_view(GROK)
        self.s.take_effects()
        self.s.receive_reply(older, "a2")
        self.s.set_view("ada")
        snap = self.s.snapshot()
        self.assertEqual(snap["history"][-1]["body"], "a2")
        self.assertEqual(snap["body"], "news")

    def test_waiting_exchange_that_was_cleared_gets_a_new_exchange(self):
        ask_id = self.defer()
        self.s.clear_conversation()
        self.s.cleared = None
        self.s.receive_reply(ask_id, "late answer")
        snap = self.s.snapshot()
        self.assertEqual((snap["history"], snap["body"]), ([], "late answer"))
        ask_id = self.defer(bot="ada")
        self.s.clear_conversation()
        self.s.set_view(GROK)
        self.s.receive_reply(ask_id, "for cleared ada")
        self.s.set_view("ada")
        self.assertEqual((self.s.snapshot()["body"], self.s.snapshot()["history"]), ("for cleared ada", []))

    def test_reply_by_bot_answers_its_oldest_waiting_question(self):
        first = self.defer()
        self.clock.now += 1
        second = self.defer()
        self.assertEqual(self.s.oldest_waiting(GROK), first)
        self.s.receive_reply("Bob · Main", "to first")
        self.assertEqual(list(self.s.awaiting), [second])
        self.assertEqual(self.s.snapshot()["history"][-1]["body"], "to first")

    def test_reply_by_bot_with_nothing_waiting_starts_an_exchange(self):
        self.s.say_notice("Status", "old", [])
        self.s.take_effects()
        self.assertEqual(self.s.receive_reply("ada", "hello"), "ok")
        self.assertEqual(self.kinds(), ["unread", "cue-peek"])
        self.assertEqual(self.s.receive_reply(GROK, "hi grok"), "ok")
        self.assertEqual(self.kinds(), ["cue-active", "landed"])
        self.assertEqual(self.s.snapshot()["history"][-1]["body"], "Status\nold")
        self.assertEqual(self.s.receive_reply("nobody", "x"), "unknown ask or bot")
        self.assertEqual(self.s.receive_reply("ada", " \x1b[0m "), "empty text")

    def test_expiry_after_ten_minutes(self):
        ask_id = self.defer(bot="ada")
        self.s.set_view(GROK)
        self.clock.now += conv.REPLY_WAIT_MS - 1
        self.assertFalse(self.s.expire_waiting())
        self.assertEqual(self.kinds(), ["rest"])
        self.clock.now += 1
        self.assertTrue(self.s.expire_waiting())
        self.assertEqual(self.kinds(), ["unread", "cue-peek", "rest"])
        self.assertNotIn(ask_id, self.s.awaiting)
        self.s.set_view("ada")
        self.assertEqual(self.s.snapshot()["body"], "No answer yet. Ada's reply will be in Grok Bot.")


class Notices(Base):
    def test_plain_notice_is_titled_and_limited(self):
        self.assertEqual(self.s.say_notice("Build", "a\nb" + "c" * 400, []), "ok")
        self.assertEqual(self.kinds(), ["alert"])
        body = self.s.snapshot()["body"]
        self.assertTrue(body.startswith("Build\na bc"))
        self.assertEqual(len(body), 6 + 300)
        self.s.say_notice("", "untitled", [{"label": "Go", "url": "https://x.y"}])
        snap = self.s.snapshot()
        self.assertEqual((snap["body"], snap["links"]), ("untitled", [{"label": "Go", "url": "https://x.y"}]))
        self.assertEqual(self.s.say_notice("Build", " \x01 ", []), "empty text")

    def test_bot_titled_notice_is_a_message_in_its_conversation(self):
        self.s.say_notice("Bob · Main", "line one\nline two", [])
        self.assertEqual(self.kinds(), ["alert"])
        self.assertEqual(self.s.snapshot()["body"], "line one\nline two")
        self.s.say_notice("Ada", "elsewhere", [])
        self.assertEqual(self.kinds(), ["unread", "cue-peek"])

    def test_bot_titled_notice_answers_a_waiting_question_only_without_links(self):
        ask_id = self.ask()
        self.s.ask_finished(ask_id, "deferred")
        self.s.say_notice("Bob · Main", "with link", [{"label": "Go", "url": "https://x.y"}])
        self.assertIn(ask_id, self.s.awaiting)
        self.s.take_effects()
        self.s.say_notice("Bob · Main", "the answer", [])
        self.assertEqual(self.kinds(), ["cue-active", "landed"])
        self.assertEqual(self.s.snapshot()["history"][-1]["body"], "the answer")


class ClearUndo(Base):
    def test_clear_and_undo(self):
        self.assertEqual(self.s.clear_conversation(), "nothing to clear")
        ask_id = self.ask()
        self.assertEqual(self.s.clear_conversation(), "nothing to clear")
        self.s.ask_finished(ask_id, "deferred")
        self.s.set_pending(["/kept"])
        self.assertEqual(self.s.clear_conversation(), "ok")
        self.assertEqual(self.kinds(), ["open"])
        snap = self.s.snapshot()
        self.assertEqual((snap["asked"], snap["wait"], snap["undo"], snap["pending"]), ("", "", True, ["/kept"]))
        self.clock.now += conv.UNDO_MS - 1
        self.assertEqual(self.s.undo_clear(), "ok")
        snap = self.s.snapshot()
        self.assertEqual((snap["asked"], snap["wait"], snap["undo"]), ("question", ask_id, False))
        self.assertEqual(self.s.undo_clear(), "nothing")

    def test_undo_expires_and_is_dropped_by_switching_or_a_new_exchange(self):
        self.s.say_notice("A", "x", [])
        self.s.clear_conversation()
        self.clock.now += conv.UNDO_MS
        self.assertFalse(self.s.snapshot()["undo"])
        self.assertTrue(self.s.expire_undo())
        self.assertEqual(self.s.undo_clear(), "nothing")
        self.s.say_notice("A", "x", [])
        self.s.clear_conversation()
        record = self.s.cleared
        self.assertFalse(self.s.expire_undo({"at": 0}))
        self.assertTrue(self.s.expire_undo(record))
        self.assertFalse(self.s.snapshot()["undo"])
        self.s.say_notice("A", "x", [])
        self.s.clear_conversation()
        self.s.set_view("ada")
        self.s.set_view(GROK)
        self.assertEqual(self.s.undo_clear(), "nothing")
        self.s.say_notice("A", "x", [])
        self.s.clear_conversation()
        self.s.receive_reply("ada", "off screen keeps the undo")
        self.assertTrue(self.s.snapshot()["undo"])
        self.s.receive_reply(GROK, "on screen archives and drops it")
        self.assertEqual(self.s.undo_clear(), "nothing")

    def test_clear_allowed_while_another_bot_asks(self):
        self.s.say_notice("A", "x", [])
        self.ask(bot="ada")
        self.s.set_view(GROK)
        self.assertEqual(self.s.clear_conversation(), "ok")


if __name__ == "__main__":
    unittest.main()
