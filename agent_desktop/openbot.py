import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
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


# Companion silhouettes (qml/shapes.js) plus the aliases that file already accepts.
DESKTOP_SHAPES = ("blob", "cloud", "squircle", "sparkle", "clover", "heart", "flower",
                  "teardrop", "tablet", "wedge", "gem", "burst", "hex", "pebble")
DESKTOP_SHAPE_ALIASES = {
    "circle": "blob", "dome": "blob", "crescent": "blob",
    "pumpkin": "pebble",
    "drop": "teardrop", "egg": "teardrop",
    "bean": "heart", "leaf": "heart", "sprout": "clover",
    "pill": "tablet", "capsule": "tablet", "cylinder": "tablet", "peanut": "tablet",
    "triangle": "wedge", "bolt": "wedge",
    "pentagon": "gem", "shield": "gem", "crystal": "gem",
    "hexagon": "hex", "heptagon": "hex", "octagon": "hex",
    "square": "squircle", "diamond": "squircle", "arch": "squircle", "ghost": "squircle",
    "spark": "sparkle", "star": "burst",
    "group": "cloud",
}
# Bloub 0.6.4 SHAPES order, which OpenBot hashes a seed against. `goutte` is not drawn.
BLOUB_SHAPES = ("cercle", "galet", "squircle", "capsule", "triangle", "hexagone",
                "nuage", "goutte", "carre", "losange", "pentagone")
BLOUB_SHAPE_NAMES = {
    "cercle": "blob", "galet": "pebble", "squircle": "squircle", "capsule": "tablet",
    "triangle": "wedge", "hexagone": "hex", "nuage": "cloud", "goutte": "teardrop",
    "carre": "squircle", "losange": "squircle", "pentagone": "gem",
}
AUTOMATIC_COLORS = ("rouge", "orange", "ambre", "vert", "turquoise", "bleu", "violet", "rose")
# Companion fills (qml/palette.js). An unknown hex snaps in OKLab; the earlier name wins a tie.
PALETTE_HEX = (
    ("black", "#000000"), ("brown", "#936439"), ("red", "#ff263c"), ("orange", "#ff6700"),
    ("yellow", "#ff9800"), ("green", "#00c972"), ("cyan", "#00bca6"), ("blue", "#1084fe"),
    ("violet", "#9159fe"), ("magenta", "#ff309b"), ("gray", "#777777"),
)
PALETTE_ALIASES = {"purple": "violet", "grey": "gray", "teal": "cyan", "pink": "magenta", "amber": "yellow"}
# OpenBot's names for the ten released hues (bloub-avatar.ts AVATAR_HUE_CHOICES).
# Lime has no companion name, so it uses green. Indigo is nearer blue than violet.
HUE_NAMES = {
    0: "red", 30: "orange", 55: "yellow", 100: "green", 150: "green",
    185: "cyan", 215: "blue", 245: "blue", 280: "violet", 320: "magenta",
}
AUTOMATIC_NAMES = {
    "rouge": "red", "orange": "orange", "ambre": "yellow", "vert": "green",
    "turquoise": "cyan", "bleu": "blue", "violet": "violet", "rose": "magenta",
}
# Exact swatches OpenBot draws: Bloub colours, the two extra hue fills, and the presets.
KNOWN_HEX = {
    "#0a0a0c": "black", "#8b5e3c": "brown", "#e8483f": "red", "#f08a24": "orange",
    "#f0b429": "yellow", "#8ece34": "green", "#3ecf8e": "green", "#2fbfa0": "cyan",
    "#3b93f0": "blue", "#5d67ee": "blue", "#8b5cf6": "violet", "#e152b0": "magenta",
    "#a3a3a3": "gray", "#f1efe9": "gray", "#f27ba5": "magenta", "#38bdf8": "cyan",
    "#34479c": "blue", "#a8324e": "red", "#d6b98c": "yellow",
}
# Same cutoff OpenBot uses before it will name a hue (nearestAvatarHue).
NEUTRAL_SATURATION = 0.15
SEED = re.compile(r"^[a-z0-9:-]{1,128}$")
HEX_COLOR = re.compile(r"^#[0-9a-f]{6}$")


def _fnv_index(value, length):
    """OpenBot's `stableIndex`: FNV-1a, then modulo, matching JS `Math.imul` low 32 bits."""
    digest = 0x811C9DC5
    for ch in value:
        digest ^= ord(ch)
        digest = (digest * 0x01000193) & 0xFFFFFFFF
    return digest % length


def _rgb(hex_color):
    number = int(hex_color[1:], 16)
    return (number >> 16) & 255, (number >> 8) & 255, number & 255


def _linear(channel):
    channel /= 255
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def _cube_root(value):
    if value < 0:
        return -((-value) ** (1 / 3))
    return value ** (1 / 3)


def _oklab(hex_color):
    red, green, blue = (_linear(channel) for channel in _rgb(hex_color))
    long = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
    medium = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
    short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
    long, medium, short = _cube_root(long), _cube_root(medium), _cube_root(short)
    lightness = 0.2104542553 * long + 0.7936177850 * medium - 0.0040720468 * short
    green_red = 1.9779984951 * long - 2.4285922050 * medium + 0.4505937099 * short
    blue_yellow = 0.0259040371 * long + 0.7827717662 * medium - 0.8086757660 * short
    return lightness, green_red, blue_yellow


def _saturation(hex_color):
    red, green, blue = (channel / 255 for channel in _rgb(hex_color))
    high, low = max(red, green, blue), min(red, green, blue)
    span = high - low
    if span == 0:
        return 0.0
    lightness = (high + low) / 2
    return span / (1 - abs(2 * lightness - 1))


def nearest_palette(hex_color):
    """Nearest companion colour. Neutrals stay black or gray; other hex uses OKLab."""
    known = KNOWN_HEX.get(hex_color)
    if known is not None:
        return known
    lightness = _oklab(hex_color)[0]
    if _saturation(hex_color) < NEUTRAL_SATURATION:
        black_distance = abs(lightness - _oklab("#000000")[0])
        gray_distance = abs(lightness - _oklab("#777777")[0])
        return "black" if black_distance < gray_distance else "gray"
    target = _oklab(hex_color)
    best_name = PALETTE_HEX[0][0]
    best_distance = None
    for name, swatch in PALETTE_HEX:
        other = _oklab(swatch)
        distance = sum((left - right) ** 2 for left, right in zip(target, other))
        if best_distance is None or distance < best_distance:
            best_name = name
            best_distance = distance
    return best_name


def canonical_shape(value):
    if not isinstance(value, str):
        return None
    token = value.strip()
    if not token or len(token) > 40 or any(ord(ch) < 32 for ch in token):
        return None
    if token in DESKTOP_SHAPES:
        return token
    if token in DESKTOP_SHAPE_ALIASES:
        return DESKTOP_SHAPE_ALIASES[token]
    return BLOUB_SHAPE_NAMES.get(token)


def shape_from_seed(seed):
    """The silhouette `bloubAvatarProfile` draws for `seed`. `goutte` is replaced."""
    chosen = BLOUB_SHAPES[_fnv_index(f"{seed}:shape", len(BLOUB_SHAPES))]
    if chosen == "goutte":
        supported = tuple(item for item in BLOUB_SHAPES if item != "goutte")
        chosen = supported[_fnv_index(f"{seed}:shape:replacement", len(supported))]
    return BLOUB_SHAPE_NAMES[chosen]


def _palette_name(value):
    if not isinstance(value, str):
        return None
    token = value.strip()
    if token in PALETTE:
        return token
    return PALETTE_ALIASES.get(token)


def _reported_color(row, seed):
    """OpenBot precedence: exact `avatarColor`, then `avatarHue`, then the seed's automatic colour."""
    named = _palette_name(row.get("avatarColor"))
    if named is not None:
        return named
    color = row.get("avatarColor")
    if isinstance(color, str) and HEX_COLOR.fullmatch(color.strip()):
        return nearest_palette(color.strip())
    hue = row.get("avatarHue")
    if type(hue) is int and hue in HUE_NAMES:
        return HUE_NAMES[hue]
    if seed is not None:
        color_id = AUTOMATIC_COLORS[_fnv_index(f"{seed}:color", len(AUTOMATIC_COLORS))]
        return AUTOMATIC_NAMES[color_id]
    return None


def reported_appearance(row, agent, name):
    """Shape and colour hints from a Local scripts agent row.

    Stock `GET /v1/agents` returns only id, name and routines, so those rows
    keep blob and `avatar_color`. `avatarSeed`, `avatarHue` and `avatarColor`
    are used when the row actually carries them. Photos are ignored.
    """
    shape = None
    seed = None
    if isinstance(row, dict):
        shape = canonical_shape(row.get("avatarShape"))
        if shape is None:
            shape = canonical_shape(row.get("shape"))
        raw_seed = row.get("avatarSeed")
        if isinstance(raw_seed, str) and SEED.fullmatch(raw_seed):
            seed = raw_seed
    if shape is None and seed is not None:
        shape = shape_from_seed(seed)
    color = _reported_color(row, seed) if isinstance(row, dict) else None
    return shape or "blob", color or avatar_color(agent, name)


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
            shape, color = reported_appearance(row, agent, name)
            result[agent] = {"id": agent, "name": name, "availability": "ready",
                             "capabilities": self.capabilities, "avatarShape": shape,
                             "avatarColor": color}
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
