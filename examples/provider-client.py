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
from agent_desktop.client import Client
from agent_desktop.protocol import Fault, MAX_PROMPT, text


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=['example', 'hermes', 'grokbot'], default='example')
    parser.add_argument('--agent', default=None)
    parser.add_argument('--python', default='/usr/bin/python3', help='Hermes virtualenv Python for its dependencies')
    parser.add_argument('--root', default=str(Path.home()/'.hermes'))
    parser.add_argument('--agent-dir', default=str(Path.home()/'.hermes/hermes-agent'))
    args = parser.parse_args()
    prompt = text(sys.stdin.read(MAX_PROMPT + 1), MAX_PROMPT)
    client = Client(args.provider, args.python, ['--root', args.root, '--agent-dir', args.agent_dir])
    try:
        async with asyncio.timeout(650):
            await client.start()
            await client.send('list', 'agents.list')
            frame = await client.read()
            if frame.get('id') != 'list' or 'error' in frame:
                raise Fault('unavailable', 'Could not discover agents.')
            agents = frame['result']['agents']
            agent = args.agent or ('default' if args.provider == 'hermes' else agents[0]['id'] if agents else '')
            if agent not in [a['id'] for a in agents]:
                raise Fault('unavailable', 'Requested agent was not advertised.')
            def show(frame):
                print(json.dumps(frame, ensure_ascii=False), flush=True)
            event, terminal = await client.exchange(dict(agentId=agent, requestId=uuid.uuid4().hex,
                text=prompt, timeoutSeconds=600), deferred=True, on_event=show)
            if event == 'message.deferred':
                print('Accepted for a later desktop reply; no completed answer yet.', file=sys.stderr)
                return 10
            return 0 if terminal['status'] == 'completed' else 1
    finally:
        await client.close()


if __name__ == '__main__':
    try:
        sys.exit(asyncio.run(main()))
    except (Fault, TimeoutError, OSError, ValueError, KeyboardInterrupt):
        print('Hook did not complete. Check the agent before retrying; remote work may continue.', file=sys.stderr)
        sys.exit(1)
