"""Wake-phrase routing shared by the dictation filter and the voice watcher.

"Hey Bot", "Hey Bob", "Hey Grok" and "Hey Grok Bot" pick the primary bot;
"Hey <short name>" or "Hey <full name>" picks that roster bot. The rules are
the same as qml/dictation.js; tests/fixtures/wake-phrases.json is run against
both so they cannot drift. Matching, whitespace and the word boundary are
deliberately ASCII/JavaScript-shaped so the two agree character for character.
"""
from __future__ import annotations

import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIMARY_ID = "e0195a7d-f804-4688-9191-e2cf3574a6d1"
CLIP_WINDOW = 3.0
DEDUP_SECONDS = 10.0
# What is routed (and what the control helper accepts) is capped here.
TEXT_LIMIT = 4000
ROSTER_LIMIT = 1024 * 1024
ROSTER_ROWS = 512

CONTROLS = re.compile(r"[\x00-\x1f]+")
# JavaScript's \s after control characters are replaced, so Python agrees with qml/dictation.js.
TRIM = ("\t\n\v\f\r   " + "".join(map(chr, range(0x2000, 0x200B)))
        + "    　﻿")
SPACES = re.compile("[" + re.escape(TRIM) + "]+")
LEAD = re.compile("^[" + re.escape(TRIM) + ",;:.!?\\-–—]+")
WORD = re.compile(r"[A-Za-z0-9]")


def normalize(text: str) -> str:
    return SPACES.sub(" ", CONTROLS.sub(" ", text or "")).strip(TRIM)


def boundary(rest: str, length: int) -> bool:
    if len(rest) <= length:
        return True
    return WORD.fullmatch(rest[length]) is None


def strip_lead(value: str) -> str:
    return LEAD.sub("", value or "").strip(TRIM)


def route(text: str, bots: list, primary_id: str = PRIMARY_ID) -> dict:
    raw = normalize(text)[:TEXT_LIMIT]
    folded = raw.lower()
    missed = {"matched": False, "botId": "", "prompt": raw, "wake": ""}
    if not folded.startswith("hey "):
        return missed
    rest = raw[4:]
    rest_fold = folded[4:]
    primary = primary_id or PRIMARY_ID

    if rest_fold.startswith("grok bot") and boundary(rest_fold, len("grok bot")):
        return {"matched": True, "botId": primary,
                "prompt": strip_lead(rest[len("grok bot"):]), "wake": "hey grok bot"}

    best = None
    best_len = 0
    for bot in bots or []:
        for label in (bot.get("shortName") or "", bot.get("name") or ""):
            cleaned = normalize(str(label)).lower()
            if not cleaned or len(cleaned) <= best_len:
                continue
            if not rest_fold.startswith(cleaned) or not boundary(rest_fold, len(cleaned)):
                continue
            best = bot
            best_len = len(cleaned)
    if best is not None:
        who = normalize(str(best.get("shortName") or best.get("name") or ""))
        return {"matched": True, "botId": str(best.get("id") or ""),
                "prompt": strip_lead(rest[best_len:]), "wake": f"hey {who}" if who else "hey"}

    for tail in ("bot", "bob", "grok"):
        if rest_fold.startswith(tail) and boundary(rest_fold, len(tail)):
            return {"matched": True, "botId": primary,
                    "prompt": strip_lead(rest[len(tail):]), "wake": f"hey {tail}"}
    return missed


def read_regular(path, limit: int, head: bool = False) -> bytes | None:
    """Bytes of a regular file, or None.

    Symlinks are refused, FIFOs and devices are refused without blocking, and
    nothing larger than ``limit`` is read. With ``head`` a larger file yields
    its first ``limit`` bytes instead of None.
    """
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | getattr(os, "O_CLOEXEC", 0)
    try:
        fd = os.open(os.fspath(path), flags)
    except (OSError, ValueError):
        return None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            return None
        if info.st_size > limit and not head:
            return None
        chunks = []
        left = limit + 1
        while left > 0:
            chunk = os.read(fd, min(left, 65536))
            if not chunk:
                break
            chunks.append(chunk)
            left -= len(chunk)
        data = b"".join(chunks)
    except OSError:
        return None
    finally:
        os.close(fd)
    if len(data) > limit:
        return data[:limit] if head else None
    return data


def config_home() -> Path:
    raw = os.environ.get("XDG_CONFIG_HOME")
    return Path(raw) if raw else Path.home() / ".config"


def synced_roster_paths() -> list[Path]:
    # Main.qml syncs to ~/.config whatever XDG_CONFIG_HOME says; grokbot-sync defaults to XDG.
    paths = [config_home() / "omarchy" / "grokbot-bots.json",
             Path.home() / ".config" / "omarchy" / "grokbot-bots.json"]
    return paths if paths[0] != paths[1] else paths[:1]


def bundled_roster_path() -> Path:
    return ROOT / "data" / "bots.json"


def parse_roster(path) -> list:
    raw = read_regular(path, ROSTER_LIMIT)
    if raw is None:
        return []
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return []
    rows = data.get("bots") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return []
    clean = []
    for bot in rows[:ROSTER_ROWS]:
        if not isinstance(bot, dict) or not bot.get("id"):
            continue
        clean.append({
            "id": str(bot.get("id") or ""),
            "name": str(bot.get("name") or ""),
            "shortName": str(bot.get("shortName") or ""),
        })
    return clean


def load_bots(path=None) -> list:
    """The roster wake phrases are matched against.

    An explicit path, then $GROKBOT_BOTS when set (an override for tests and
    unusual installs), then the synced roster the companion shows
    ($XDG_CONFIG_HOME/omarchy/grokbot-bots.json, then ~/.config/omarchy/
    grokbot-bots.json), then the bundled data/bots.json when no synced roster
    yields bots, as Main.qml falls back.
    """
    chosen = path or os.environ.get("GROKBOT_BOTS")
    if chosen:
        return parse_roster(chosen)
    for synced in synced_roster_paths():
        bots = parse_roster(synced)
        if bots:
            return bots
    return parse_roster(bundled_roster_path())


def recording_finished(previous: str, current: str) -> bool:
    prev = (previous or "").strip().lower()
    cur = (current or "").strip().lower()
    return prev in {"recording", "transcribing"} and cur in {"idle", ""}


def should_deliver(text: str, source: str, recording_age, now: float, memory: dict, bots: list):
    decided = route(text, bots)
    if not decided["matched"]:
        return False, decided
    if source != "transcript":
        return False, decided
    key = normalize(text).lower()
    last = memory.get(key)
    if last is not None and now - last < DEDUP_SECONDS:
        return False, decided
    memory[key] = now
    return True, decided


def deliver(text: str, backend: str = "") -> bool:
    """Hand a wake line to the companion. The text travels on stdin only."""
    payload = normalize(text)[:TEXT_LIMIT]
    if payload == "":
        return False
    sink = os.environ.get("GROKBOT_DICTATE_SINK", "")
    if sink:
        with open(sink, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"backend": backend, "text": payload}, ensure_ascii=False) + "\n")
        return True
    ctl = ROOT / "bin" / "grokbot-desktop-ctl"
    if not ctl.is_file():
        return False
    try:
        proc = subprocess.run(
            [sys.executable, str(ctl), "dictate"],
            input=payload.encode("utf-8"),
            stdout=subprocess.DEVNULL,
            check=False,
            env=os.environ.copy(),
        )
    except OSError:
        return False
    return proc.returncode == 0
