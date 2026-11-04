import asyncio
import json
import math
import re
import sys
import uuid

VERSION = 1
MAX_FRAME = 1024 * 1024
MAX_TEXT = 65536
MAX_PROMPT = 4000
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
METHODS = {"hello", "agents.list", "message.send", "request.cancel", "prompt.answer",
           "history.list", "session.compact", "message.reply", "shutdown"}


class Fault(Exception):
    def __init__(self, code, message, retryable=False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable

    def data(self):
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


def identifier(value, field="id"):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise Fault("invalid_request", f"Invalid {field}.")
    return value


def text(value, limit=MAX_TEXT, field="text", empty=False):
    if not isinstance(value, str) or len(value) > limit or "\x00" in value or (not empty and not value.strip()):
        raise Fault("invalid_request", f"Invalid or oversized {field}.")
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise Fault("invalid_request", f"Invalid UTF-8 {field}.") from None
    return value


def decode(raw):
    if len(raw) > MAX_FRAME:
        raise Fault("limit_exceeded", "Protocol frame exceeds 1 MiB.")
    try:
        def pairs(items):
            result = {}
            for k, v in items:
                if k in result:
                    raise ValueError("duplicate key")
                result[k] = v
            return result
        def finite(value):
            number = float(value)
            if not math.isfinite(number):
                raise ValueError("nonfinite")
            return number
        value = json.loads(raw, object_pairs_hook=pairs, parse_float=finite,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")))
    except (ValueError, UnicodeError, RecursionError):
        raise Fault("invalid_request", "Invalid UTF-8 JSON object.") from None
    if not isinstance(value, dict):
        raise Fault("invalid_request", "Expected a JSON object.")
    return value


def encode(value):
    try:
        raw = (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode()
    except (ValueError, UnicodeError, RecursionError):
        raise Fault("invalid_request", "Cannot encode protocol frame.") from None
    if len(raw) > MAX_FRAME:
        raise Fault("limit_exceeded", "Protocol frame exceeds 1 MiB.")
    return raw


async def lines(stream):
    while True:
        try:
            raw = await stream.readline()
        except (ValueError, asyncio.LimitOverrunError):
            raise Fault("limit_exceeded", "Protocol frame exceeds 1 MiB.") from None
        if not raw:
            return
        if not raw.endswith(b"\n"):
            raise Fault("invalid_request", "Protocol frame must end with a newline.")
        yield decode(raw)


async def stdio():
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=MAX_FRAME)
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin.buffer)
    transport, protocol = await loop.connect_write_pipe(asyncio.streams.FlowControlMixin, sys.stdout.buffer)
    writer = asyncio.StreamWriter(transport, protocol, None, loop)
    return reader, writer


class Output:
    def __init__(self, writer):
        self.writer = writer
        self.queue = asyncio.Queue(maxsize=32)
        self.failure = asyncio.get_running_loop().create_future()
        self.task = asyncio.create_task(self.run())

    def put(self, value):
        try:
            self.queue.put_nowait(encode(value))
        except asyncio.QueueFull:
            if not self.failure.done():
                self.failure.set_result(Fault("limit_exceeded", "Protocol consumer is too slow."))

    async def run(self):
        while True:
            raw = await self.queue.get()
            try:
                self.writer.write(raw)
                await asyncio.wait_for(self.writer.drain(), 5)
            finally:
                self.queue.task_done()

    async def close(self):
        try:
            await asyncio.wait_for(self.queue.join(), 2)
        except TimeoutError:
            pass
        finally:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
            self.writer.close()


class Server:
    def __init__(self, backend, output):
        self.backend, self.output = backend, output
        self.epoch = uuid.uuid4().hex
        self.sequence = 0
        self.ready = False
        self.ids = set()
        backend.emit = self.event

    def event(self, name, params):
        self.sequence += 1
        self.output.put({"v": VERSION, "epoch": self.epoch, "seq": self.sequence,
                         "event": name, "params": params})

    def reply(self, op, result=None, fault=None):
        frame = {"v": VERSION, "epoch": self.epoch, "id": op}
        frame["error" if fault else "result"] = fault.data() if fault else result
        self.output.put(frame)

    async def dispatch(self, frame):
        op = frame.get("id")
        try:
            identifier(op)
            if any(key in frame for key in ("event", "result", "error")):
                raise Fault("invalid_request", "Expected a request envelope.")
            if type(frame.get("v")) is not int or frame["v"] != VERSION:
                raise Fault("incompatible_version", "Agent Desktop protocol major 1 is required.")
            if op in self.ids:
                raise Fault("duplicate_id", "Operation IDs cannot be reused on a connection.")
            if len(self.ids) >= 4096:
                raise Fault("limit_exceeded", "Reconnect after 4096 operations; do not replay accepted work.")
            self.ids.add(op)
            method, params = frame.get("method"), frame.get("params", {})
            if not isinstance(params, dict):
                raise Fault("invalid_request", "params must be an object.")
            if not isinstance(method, str) or method not in METHODS:
                raise Fault("unsupported", "Unknown protocol method.")
            if method == "hello":
                if self.ready:
                    raise Fault("invalid_request", "Handshake already completed.")
                self.ready = True
                self.reply(op, {"protocol": {"major": 1, "minor": 1}, "provider": self.backend.name,
                                "adapterVersion": "0.1.0", "maxFrameBytes": MAX_FRAME,
                                "capabilities": self.backend.capabilities})
                return True
            if not self.ready:
                raise Fault("handshake_required", "Send hello before other operations.")
            if method == "shutdown":
                await self.backend.close()
                self.reply(op, {"stopped": True})
                return False
            result = await self.backend.call(method, params)
            self.reply(op, result)
        except Fault as exc:
            self.reply(op if isinstance(op, str) and IDENTIFIER.fullmatch(op) else None, fault=exc)
        except Exception:
            self.reply(op, fault=Fault("internal_error", "Adapter operation failed; inspect local prerequisites."))
        return True

    async def serve(self, reader):
        async def consume():
            async for frame in lines(reader):
                if not await self.dispatch(frame):
                    return
        task = asyncio.create_task(consume())
        try:
            done, _ = await asyncio.wait([task, self.output.task, self.output.failure], return_when=asyncio.FIRST_COMPLETED)
            for item in done:
                if item is self.output.failure:
                    return  # Close the connection; an overloaded stream cannot carry a reliable terminal.
                await item
        except Fault as exc:
            self.reply(None, fault=exc)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await self.backend.close()
            await self.output.close()
