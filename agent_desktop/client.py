"""Bounded client for any bundled provider implementing the shared API."""
import asyncio
from pathlib import Path

from .protocol import Fault, MAX_FRAME, decode, encode

ROOT = Path(__file__).resolve().parent.parent


class Client:
    def __init__(self, provider, python='/usr/bin/python3', options=()):
        self.command = ['/usr/bin/setpriv', '--pdeathsig', 'TERM', python, '-I',
                        str(ROOT/'bin/agent-desktop-provider'), '--provider', provider, *options]
        self.process = None
        self.epoch = None
        self.sequence = 0

    async def start(self):
        spawn = asyncio.create_task(asyncio.create_subprocess_exec(*self.command, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=MAX_FRAME))
        try:
            self.process = await asyncio.shield(spawn)
        except asyncio.CancelledError:
            self.process = await spawn
            raise
        await self.send('hello', 'hello')
        response = await asyncio.wait_for(self.read(), 5)
        if response.get('id') != 'hello' or response.get('result', {}).get('protocol', {}).get('major') != 1:
            raise Fault('incompatible_version', 'Provider handshake failed.')
        return response['result']

    async def send(self, op, method, params=None):
        self.process.stdin.write(encode(dict(v=1, id=op, method=method, params=params or {})))
        await self.process.stdin.drain()

    async def read(self):
        raw = await self.process.stdout.readline()
        if not raw or not raw.endswith(b'\n'):
            raise Fault('delivery_unknown', 'Provider disconnected; inspect the agent before retrying.')
        frame = decode(raw)
        if type(frame.get('v')) is not int or frame['v'] != 1 or not isinstance(frame.get('epoch'), str):
            raise Fault('invalid_response', 'Invalid provider envelope.')
        if self.epoch is None:
            self.epoch = frame['epoch']
        if frame['epoch'] != self.epoch:
            raise Fault('invalid_response', 'Provider connection identity changed.')
        if 'event' in frame:
            if type(frame.get('seq')) is not int or frame['seq'] != self.sequence + 1:
                raise Fault('invalid_response', 'Provider event sequence has a gap or duplicate.')
            self.sequence = frame['seq']
        return frame

    async def exchange(self, params, deferred=False, on_event=None):
        await self.send('send', 'message.send', params)
        accepted, result = False, None
        for _ in range(4096):
            frame = await self.read()
            if frame.get('id') == 'send':
                if frame.get('result', {}).get('accepted') is not True:
                    error = frame.get('error', {})
                    raise Fault(str(error.get('code', 'adapter_error'))[:64],
                                str(error.get('message', 'Provider refused the request.'))[:400])
                accepted = True
            event = frame.get('event')
            payload = frame.get('params', {})
            if event and on_event and payload.get('requestId') == params['requestId'] and payload.get('agentId') == params['agentId']:
                on_event(frame)
            if (payload.get('requestId') == params['requestId'] and payload.get('agentId') == params['agentId']
                    and (event == 'message.finished' or (deferred and event == 'message.deferred'))):
                result = (event, payload)
            if accepted and result is not None:
                return result
        raise Fault('limit_exceeded', 'Provider event limit reached.')

    async def close(self):
        proc = self.process
        if proc is None:
            return
        if proc.stdin:
            proc.stdin.close()
        try:
            await asyncio.wait_for(proc.wait(), 3)
        except TimeoutError:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), 3)
            except TimeoutError:
                proc.kill()
                await proc.wait()
