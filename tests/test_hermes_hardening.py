#!/usr/bin/env python3
"""Hermes adapter and gateway failure handling, with a mocked gateway (no Hermes install)."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop.protocol import Fault, Server, decode, encode  # noqa: E402
from agent_desktop.hermes import Hermes  # noqa: E402
from agent_desktop import hermes_gateway  # noqa: E402
from agent_desktop.hermes_gateway import BotLink, BotState  # noqa: E402


class Capture:
    """Encodes like the real Output, so an unframeable event raises here."""

    def __init__(self):
        self.frames = []

    def put(self, value):
        self.frames.append(decode(encode(value)))


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.adapter = Hermes('/nonexistent', '/nonexistent')
        self.output = Capture()
        self.server = Server(self.adapter, self.output)
        state = BotState('default', self.adapter.on_gateway)
        state.session_id = 'session-1'
        state.generation = 3
        self.client = SimpleNamespace(rpc=AsyncMock(return_value={'admission_id': 'admission-1'}))
        self.link = SimpleNamespace(state=state, client=self.client, task=asyncio.create_task(asyncio.sleep(100)))
        self.adapter.links['default'] = self.link
        self.adapter.link = AsyncMock(return_value=self.link)

    async def asyncTearDown(self):
        await self.adapter.close()

    def events(self, name=None):
        return [f for f in self.output.frames if 'event' in f and (name is None or f['event'] == name)]

    async def send(self, request='turn', **extra):
        return await self.adapter.call('message.send', dict(agentId='default', requestId=request, text='hello', **extra))

    def gateway(self, kind, admission='admission-1', **payload):
        return self.link.state.handle(dict(session_id='session-1', type=kind, admission_id=admission, payload=payload))

    async def test_link_wait_timeout_is_offline_and_retryable(self):
        async def never(agent):
            await asyncio.sleep(100)
        self.adapter.link = never
        with self.assertRaises(Fault) as caught:
            await self.send(timeoutSeconds=1)
        self.assertEqual(caught.exception.code, 'offline')
        self.assertTrue(caught.exception.retryable)
        self.assertFalse(self.adapter.active)

    async def test_unencodable_delta_fails_only_that_request(self):
        await self.send()
        # A lone surrogate cannot be framed as UTF-8. The link must survive it.
        self.assertTrue(self.gateway('message.delta', text='bad \ud800 text'))
        self.assertTrue(self.gateway('message.delta', text=' more'))
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        finished = self.events('message.finished')
        self.assertEqual(len(finished), 1)
        params = finished[0]['params']
        self.assertEqual((params['requestId'], params['status']), ('turn', 'failed'))
        self.assertEqual(params['error']['code'], 'internal_error')
        self.assertFalse(params['remoteMayContinue'])  # the interrupt was acknowledged
        interrupts = [c for c in self.client.rpc.call_args_list if c.args[0] == 'session.interrupt']
        self.assertEqual(len(interrupts), 1)
        self.assertFalse(self.adapter.active)
        # No sequence number was used by the dropped frame.
        self.assertEqual([f['seq'] for f in self.events()], list(range(1, len(self.events()) + 1)))
        # A later request on the same link works.
        self.client.rpc.return_value = {'admission_id': 'admission-2'}
        await self.send('turn-2')
        self.gateway('message.complete', 'admission-2', text='fine')
        last = self.events('message.finished')[-1]['params']
        self.assertEqual((last['requestId'], last['status'], last['text']), ('turn-2', 'completed', 'fine'))

    async def test_unencodable_background_event_is_dropped(self):
        self.assertTrue(self.gateway('message.complete', 'elsewhere', text='\udfff'))
        self.assertEqual(self.events(), [])

    async def test_root_expanduser_for_unknown_user_is_a_fault(self):
        with self.assertRaises(Fault) as caught:
            Hermes('~nosuchuser-agent-desktop/x', '/nonexistent')
        self.assertEqual(caught.exception.code, 'invalid_config')

    @unittest.skipUnless(importlib.util.find_spec('yaml'), 'Hermes profile parsing requires PyYAML')
    async def test_profiles_default_folder_does_not_replace_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'config.yaml').write_text('model: x\n')
            (root / 'profile.yaml').write_text('display_name: Root bot\n')
            shadow = root / 'profiles' / 'default'
            shadow.mkdir(parents=True)
            (shadow / 'config.yaml').write_text('model: y\n')
            (shadow / 'profile.yaml').write_text('display_name: Shadow\n')
            other = root / 'profiles' / 'coder'
            other.mkdir()
            (other / 'config.yaml').write_text('model: z\n')
            self.adapter.root = root
            profiles = self.adapter.profiles()
        self.assertEqual(sorted(profiles), ['coder', 'default'])
        self.assertEqual(profiles['default']['home'], root)
        self.assertEqual(profiles['default']['name'], 'Root bot')


class GatewayStateTests(unittest.TestCase):
    def test_completions_keep_working_past_the_history_limit(self):
        shown = []
        state = BotState('bot', lambda **event: shown.append(event))
        state.session_id = 's'
        total = hermes_gateway.COMPLETED_LIMIT + 50
        for n in range(total):
            self.assertTrue(state.handle(dict(session_id='s', type='message.complete', admission_id=f'a{n}',
                                              payload={'text': f'reply {n}'})))
        self.assertEqual(len(shown), total)
        self.assertLessEqual(len(state.completed), hermes_gateway.COMPLETED_LIMIT)
        # A recent duplicate is still suppressed.
        state.handle(dict(session_id='s', type='message.complete', admission_id=f'a{total - 1}', payload={'text': 'again'}))
        self.assertEqual(len(shown), total)


class BackoffTests(unittest.IsolatedAsyncioTestCase):
    async def test_backoff_resets_after_a_successful_attach(self):
        bridge = SimpleNamespace(events=[])
        bridge.emit = lambda **event: bridge.events.append(event)
        link = BotLink(bridge, 'bot', Path('/nonexistent'))
        outcomes = iter(['fail', 'fail', 'up', 'fail', 'up', 'up'])
        pauses = []
        done = asyncio.Event()

        async def attach_once():
            if next(outcomes) == 'up':
                link.up.set()
            raise RuntimeError('dropped')

        async def pause(seconds):
            pauses.append(seconds)
            if len(pauses) == 6:
                done.set()
                await asyncio.sleep(100)

        link.attach_once = attach_once
        link.pause = pause
        await asyncio.wait_for(done.wait(), 5)
        link.task.cancel()
        await asyncio.gather(link.task, return_exceptions=True)
        self.assertEqual(pauses, [2, 4, 2, 4, 2, 2])
        self.assertFalse(link.up.is_set())


if __name__ == '__main__':
    unittest.main()
