#!/usr/bin/env python3
"""Portable contract tests: no Hermes install, network, or desktop required."""
import asyncio
import json
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop.protocol import Fault, MAX_FRAME, Server, Output, decode, encode, lines
from agent_desktop.example import Example
from agent_desktop.hermes import Hermes
from agent_desktop.hermes_gateway import BotState, history_items, history_page


class Capture:
    def __init__(self):
        self.frames = []
    def put(self, value):
        self.frames.append(decode(encode(value)))


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.output = Capture()
        self.backend = Example()
        self.server = Server(self.backend, self.output)
        self.counter = 0
    async def asyncTearDown(self):
        await self.backend.close()
    async def call(self, method, params=None, **overrides):
        self.counter += 1
        frame = dict(v=1, id=str(self.counter), method=method, params=params or {})
        frame.update(overrides)
        await self.server.dispatch(frame)
        return self.output.frames[-1]
    async def test_handshake_required_and_major_version(self):
        self.assertEqual((await self.call('agents.list'))['error']['code'], 'handshake_required')
        self.assertEqual((await self.call('hello', result={}))['error']['code'], 'invalid_request')
        self.assertEqual((await self.call('hello', v=2))['error']['code'], 'incompatible_version')
        self.assertEqual((await self.call('hello', v=True))['error']['code'], 'incompatible_version')
        self.assertEqual((await self.call('hello'))['result']['protocol'], {'major': 1, 'minor': 1})
        self.assertIn('error', await self.call('hello'))
    async def test_unique_operation_ids_and_unknown_method(self):
        await self.call('hello', id='same')
        self.assertEqual((await self.call('agents.list', id='same'))['error']['code'], 'duplicate_id')
        self.assertEqual((await self.call('invented'))['error']['code'], 'unsupported')
    async def test_roster_stream_and_terminal(self):
        await self.call('hello')
        self.assertEqual((await self.call('agents.list'))['result']['agents'][0]['id'], 'echo')
        result = await self.call('message.send', dict(agentId='echo', requestId='turn-1', text='Hello'))
        self.assertTrue(result['result']['accepted'])
        await asyncio.sleep(.15)
        events = [f for f in self.output.frames if 'event' in f]
        self.assertEqual([f['event'] for f in events], ['message.delta', 'message.finished'])
        self.assertEqual([f['seq'] for f in events], [1, 2])
        self.assertTrue(all(f['epoch'] == result['epoch'] for f in events))
        self.assertEqual(events[-1]['params']['text'], 'Example: Hello')
    async def test_cancel_is_terminal_and_ids_never_replayed(self):
        await self.call('hello')
        params = dict(agentId='echo', requestId='turn', text='hello')
        await self.call('message.send', params)
        self.assertEqual((await self.call('request.cancel', {'requestId': 'turn'}))['result']['status'], 'confirmed')
        await asyncio.sleep(.15)
        events = [f for f in self.output.frames if f.get('event') == 'message.finished']
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['params']['status'], 'cancelled')
        self.assertEqual((await self.call('message.send', params))['error']['code'], 'duplicate_id')
    async def test_busy_attachments_and_input_limit(self):
        await self.call('hello')
        params = dict(agentId='echo', requestId='turn', text='hello')
        self.assertEqual((await self.call('message.send', {**params, 'attachments': ['x']}))['error']['code'], 'unsupported')
        self.assertEqual((await self.call('message.send', {**params, 'text': 'x'*4001}))['error']['code'], 'invalid_request')
        await self.call('message.send', params)
        self.assertEqual((await self.call('message.send', {**params, 'requestId': 'other'}))['error']['code'], 'busy')
    async def test_malformed_frames(self):
        for raw in [b'[]', b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":1e999}', b'\xff', b'{']:
            with self.subTest(raw=raw), self.assertRaises(Fault):
                decode(raw)
        with self.assertRaises(Fault):
            encode({'text': 'x'*MAX_FRAME})
        reader = asyncio.StreamReader()
        reader.feed_data(b'{"v":1}')
        reader.feed_eof()
        with self.assertRaises(Fault):
            async for _ in lines(reader):
                pass
    async def test_output_backpressure_closes_instead_of_losing_terminal_silently(self):
        writer = SimpleNamespace(write=lambda _: None, drain=AsyncMock(), close=lambda: None)
        output = Output(writer)
        for i in range(33):
            output.put({'n': i})
        self.assertEqual(output.failure.result().code, 'limit_exceeded')
        self.assertEqual(output.queue.qsize(), 32)
        await output.close()
    async def test_partial_lines(self):
        reader = asyncio.StreamReader()
        reader.feed_data(b'{"id":')
        async def remainder():
            await asyncio.sleep(.01)
            reader.feed_data(b'"one"}\n')
            reader.feed_eof()
        task = asyncio.create_task(remainder())
        self.assertEqual([v async for v in lines(reader)], [{'id': 'one'}])
        await task
    async def test_private_exception_text(self):
        await self.call('hello')
        self.backend.call = AsyncMock(side_effect=ValueError('secret-token'))
        reply = await self.call('agents.list')
        self.assertNotIn('secret-token', json.dumps(reply))
        self.assertEqual(reply['error']['code'], 'internal_error')
    async def test_real_stdio_lifecycle(self):
        proc = await asyncio.create_subprocess_exec(sys.executable, '-I', str(ROOT/'bin/agent-desktop-provider'),
            '--provider', 'example', stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        async def operation(i, method, params=None):
            proc.stdin.write(encode(dict(v=1, id=i, method=method, params=params or {})))
            await proc.stdin.drain()
            return decode(await asyncio.wait_for(proc.stdout.readline(), 3))
        try:
            self.assertEqual((await operation('1', 'hello'))['result']['provider'], 'example')
            await operation('2', 'message.send', dict(agentId='echo', requestId='turn', text='private prompt'))
            first = decode(await asyncio.wait_for(proc.stdout.readline(), 3))
            final = decode(await asyncio.wait_for(proc.stdout.readline(), 3))
            self.assertEqual(first['event'], 'message.delta')
            self.assertEqual(final['params']['text'], 'Example: private prompt')
            await operation('3', 'shutdown')
            await asyncio.wait_for(proc.wait(), 3)
            self.assertEqual(proc.returncode, 0)
            self.assertEqual(await proc.stderr.read(), b'')
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()


class HermesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.adapter = Hermes('/nonexistent', '/nonexistent')
        self.events = []
        self.adapter.emit = lambda name, params: self.events.append((name, params))
        state = BotState('default', self.adapter.on_gateway)
        state.session_id = 'session-1'
        state.generation = 3
        self.client = SimpleNamespace(rpc=AsyncMock(return_value={'admission_id': 'admission-1'}))
        self.link = SimpleNamespace(state=state, client=self.client, task=asyncio.create_task(asyncio.sleep(100)))
        self.adapter.links['default'] = self.link
        self.adapter.link = AsyncMock(return_value=self.link)
    async def asyncTearDown(self):
        await self.adapter.close()
    async def send(self):
        return await self.adapter.call('message.send', dict(agentId='default', requestId='turn', text='hello'))
    async def test_submission_receipt_and_early_events(self):
        async def rpc(*args, **kwargs):
            self.link.state.handle(dict(session_id='session-1', type='message.complete', admission_id='admission-1', payload={'text': 'done'}))
            return {'admission_id': 'admission-1'}
        self.client.rpc.side_effect = rpc
        self.assertTrue((await self.send())['accepted'])
        self.assertEqual(self.events[-1][1]['requestId'], 'turn')
        self.assertEqual(self.events[-1][1]['text'], 'done')
        self.assertFalse(self.adapter.active)
        self.assertFalse(self.adapter.deadlines)
    async def test_prompt_reaches_hermes_exactly_as_typed(self):
        await self.send()
        submit = [c for c in self.client.rpc.await_args_list if c.args and c.args[0] == 'prompt.submit']
        self.assertEqual(len(submit), 1)
        self.assertEqual(submit[0].kwargs['text'], 'hello')
    async def test_uncertain_submission_never_retried(self):
        self.client.rpc.side_effect = TimeoutError('secret')
        with self.assertRaises(Fault) as caught:
            await self.send()
        self.assertEqual(caught.exception.code, 'delivery_unknown')
        self.assertNotIn('secret', str(caught.exception))
        self.assertFalse(self.adapter.active)
        with self.assertRaises(Fault) as caught:
            await self.send()
        self.assertEqual(caught.exception.code, 'duplicate_id')
        self.assertEqual(self.client.rpc.await_count, 1)
    async def test_session_cancel_and_no_duplicate_terminal(self):
        await self.send()
        reply = await self.adapter.call('request.cancel', {'requestId': 'turn'})
        self.assertEqual(reply['scope'], 'session')
        self.link.state.handle(dict(session_id='session-1', type='message.complete', admission_id='admission-1', payload={'text': 'late'}))
        self.assertEqual(len([e for e in self.events if e[0] == 'message.finished']), 1)
    async def test_deadline_and_unknown_interruption(self):
        await self.send()
        self.client.rpc.side_effect = TimeoutError()
        await self.adapter.expire('turn', 0)
        final = self.events[-1][1]
        self.assertEqual(final['error']['code'], 'deadline_exceeded')
        self.assertTrue(final['remoteMayContinue'])
        self.assertFalse(self.adapter.active)
    async def test_approval_is_bound_to_session_generation_and_choices(self):
        self.link.state.prompt(dict(prompt_id='p', command='echo hello', choices=['once', 'deny']))
        params = dict(agentId='default', sessionId='session-1', promptId='p', answer='once')
        for override, code in [({'sessionId': 'old'}, 'stale_session'), ({'answer': 'invented'}, 'invalid_request')]:
            with self.assertRaises(Fault) as caught:
                await self.adapter.call('prompt.answer', {**params, **override})
            self.assertEqual(caught.exception.code, code)
        self.client.rpc.side_effect = TimeoutError()
        with self.assertRaises(Fault):
            await self.adapter.call('prompt.answer', params)
        self.assertIn('p', self.link.state.prompts)
        self.client.rpc.side_effect = None
        self.assertTrue((await self.adapter.call('prompt.answer', params))['accepted'])
        self.assertNotIn('p', self.link.state.prompts)
    async def test_oversized_and_multiselect_prompts_cannot_be_approved(self):
        for payload in [{'command': 'x'*16001}, {'multi_select': True}]:
            self.link.state.prompt(dict(prompt_id='p', choices=['yes'], **payload))
            self.assertFalse(self.events[-1][1]['answerable'])
            with self.assertRaises(Fault) as caught:
                await self.adapter.call('prompt.answer', dict(agentId='default', sessionId='session-1', promptId='p', answer='yes'))
            self.assertEqual(caught.exception.code, 'unsupported')
        self.client.rpc.assert_not_awaited()
    @unittest.skipUnless(importlib.util.find_spec("yaml"), "Hermes profile parsing requires PyYAML")
    async def test_profile_metadata_hidden_and_bad_config(self):
        with tempfile.TemporaryDirectory() as folder:
            self.adapter.root = Path(folder)
            (Path(folder)/'config.yaml').write_text('api_key: do-not-read')
            meta = Path(folder)/'profile.yaml'
            meta.write_text('ui_meta:\n  hermes-bots:\n    hidden: true\n')
            self.assertEqual(self.adapter.profiles(), {})
            meta.write_text('[broken')
            with self.assertRaises(Fault) as caught:
                self.adapter.profiles()
            self.assertEqual(caught.exception.code, 'invalid_config')
    async def test_disconnect_interrupts_only_our_admitted_turn(self):
        await self.send()
        await self.adapter.close()
        calls = [call for call in self.client.rpc.call_args_list if call.args[0] == 'session.interrupt']
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].kwargs['session_id'], 'session-1')
        self.assertEqual(calls[0].kwargs['execution_generation'], 3)
        self.assertFalse(self.adapter.active)

    async def test_runtime_probe_fails_closed(self):
        with self.assertRaises(Fault) as caught:
            self.adapter.load_runtime()
        self.assertEqual(caught.exception.code, 'unavailable')
    async def test_history_and_session_isolation(self):
        rows = [{'role': 'user', 'content': 'question', 'message_id': 'q'}, {'role': 'assistant', 'content': 'answer'}]
        items = history_items(rows)
        self.assertEqual(items, [{'asked': 'question', 'body': 'answer', 'key': 'q'}])
        self.assertEqual(history_page(items, 'missing'), ([], False))
        self.link.state.handle(dict(session_id='someone-else', type='approval.request', payload={'prompt_id': 'p'}))
        self.assertFalse(self.events)


if __name__ == '__main__':
    unittest.main()
