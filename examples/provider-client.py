#!/usr/bin/env python3
"""Minimal hook client. Prompt on stdin; protocol events on stdout; no retries."""
import argparse
import asyncio
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop.protocol import Fault, MAX_FRAME, MAX_PROMPT, decode, encode, text


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['example', 'hermes'], default='example')
    parser.add_argument('--agent', default=None)
    parser.add_argument('--python', default=sys.executable, help='Hermes virtualenv Python for its dependencies')
    parser.add_argument('--root', default=str(Path.home()/'.hermes'))
    parser.add_argument('--agent-dir', default=str(Path.home()/'.hermes/hermes-agent'))
    args = parser.parse_args()
    prompt = text(sys.stdin.read(MAX_PROMPT + 1), MAX_PROMPT)
    proc = await asyncio.create_subprocess_exec(args.python, '-I', str(ROOT/'bin/agent-desktop-provider'),
        '--provider', args.provider, '--root', args.root, '--agent-dir', args.agent_dir,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, limit=MAX_FRAME)
    epoch, sequence = None, 0
    async def read():
        nonlocal epoch, sequence
        raw = await proc.stdout.readline()
        if not raw or not raw.endswith(b'\n'):
            raise Fault('delivery_unknown', 'Adapter disconnected; do not automatically replay the request.')
        frame = decode(raw)
        if frame.get('v') != 1 or not isinstance(frame.get('epoch'), str):
            raise Fault('invalid_response', 'Invalid adapter version or epoch.')
        if epoch is None:
            epoch = frame['epoch']
        if frame['epoch'] != epoch:
            raise Fault('invalid_response', 'Adapter epoch changed on an open connection.')
        if 'event' in frame:
            if type(frame.get('seq')) is not int or frame['seq'] != sequence + 1:
                raise Fault('invalid_response', 'Adapter event sequence has a gap or duplicate.')
            sequence = frame['seq']
        return frame
    async def send(op, method, params=None):
        proc.stdin.write(encode(dict(v=1, id=op, method=method, params=params or {})))
        await proc.stdin.drain()
    async def response(op):
        frame = await read()
        if frame.get('id') != op or 'error' in frame or 'result' not in frame:
            raise Fault('adapter_error', 'Adapter operation failed; inspect the protocol error with a full client.')
        return frame['result']
    try:
        async with asyncio.timeout(650):
            await send('hello', 'hello')
            await response('hello')
            await send('list', 'agents.list')
            roster = await response('list')
            agent = args.agent or ('echo' if args.provider == 'example' else 'default')
            if agent not in [a['id'] for a in roster['agents']]:
                raise Fault('unavailable', 'Requested agent was not advertised.')
            request = uuid.uuid4().hex
            await send('send', 'message.send', dict(agentId=agent, requestId=request, text=prompt, timeoutSeconds=600))
            accepted, terminal = False, None
            while not accepted or terminal is None:
                frame = await read()
                if frame.get('id') == 'send':
                    if frame.get('result', {}).get('accepted') is not True:
                        raise Fault('adapter_error', 'Send was not confirmed; inspect Hermes before retrying.')
                    accepted = True
                elif 'event' in frame:
                    params = frame.get('params', {})
                    # Background events must never complete this hook's foreground request.
                    if params.get('requestId') == request and params.get('agentId') == agent:
                        print(json.dumps(frame, ensure_ascii=False), flush=True)
                        if frame['event'] == 'message.finished':
                            terminal = params
                    elif frame['event'] == 'prompt.required':
                        print(json.dumps(frame, ensure_ascii=False), flush=True)
            await send('shutdown', 'shutdown')
            # Shutdown may be interleaved with unrelated background events.
            while True:
                frame = await read()
                if frame.get('id') == 'shutdown':
                    break
            return 0 if terminal['status'] == 'completed' else 1
    finally:
        if proc.stdin:
            proc.stdin.close()
        try:
            await asyncio.wait_for(proc.wait(), 3)
        except TimeoutError:
            proc.kill()
            await proc.wait()


if __name__ == '__main__':
    try:
        sys.exit(asyncio.run(main()))
    except (Fault, TimeoutError, OSError, ValueError, KeyboardInterrupt):
        print('Hook did not complete. Check the agent before retrying; remote work may continue.', file=sys.stderr)
        sys.exit(1)
