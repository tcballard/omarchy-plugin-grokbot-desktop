#!/usr/bin/env python3
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop.client import Client
from agent_desktop.grokbot import GrokBot
from agent_desktop.protocol import Fault


class GrokBotTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.config = self.home/'.config/omarchy'
        self.config.mkdir(parents=True)
        self.env = patch.dict(os.environ, {'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.home/'.config')})
        self.env.start()
        self.settings(command=['/usr/bin/python3', '-c', 'import sys; print(sys.stdin.read())'])
        self.adapter = GrokBot()
        self.events = []
        self.adapter.emit = lambda name, params: self.events.append((name, params))
        self.agent = next(iter(self.adapter.agents()))
    async def asyncTearDown(self):
        await self.adapter.close()
        self.env.stop()
        self.temp.cleanup()
    def settings(self, **values):
        (self.config/'grokbot-desktop.json').write_text(json.dumps({'dispatch': 'agent', **values}))
    async def send(self, request='turn', **params):
        return await self.adapter.call('message.send', dict(agentId=self.agent, requestId=request, text='sentinel-private', **params))
    async def finish(self):
        tasks = [row['task'] for row in self.adapter.active.values()]
        await asyncio.wait_for(asyncio.gather(*tasks), 5)
    async def test_real_worker_reads_private_stdin_and_collects_multiple_chunks(self):
        self.settings(command=['/usr/bin/python3', '-c', 'import sys,time; data=sys.stdin.read(); print(data,flush=True); time.sleep(.1); print("last chunk")'])
        response = await self.send()
        self.assertTrue(response['accepted'])
        await self.finish()
        terminal = self.events[-1][1]
        self.assertEqual(terminal['status'], 'completed')
        self.assertIn('sentinel-private', terminal['text'])
        self.assertTrue(terminal['text'].endswith('last chunk'))
    async def test_real_api_and_desktop_bridge(self):
        client = Client('grokbot')
        try:
            hello = await client.start()
            self.assertEqual(hello['provider'], 'grokbot')
            name, payload = await asyncio.wait_for(client.exchange(dict(agentId=self.agent, requestId='turn', text='API prompt')), 5)
            self.assertEqual(name, 'message.finished')
            self.assertIn('API prompt', payload['text'])
        finally:
            await client.close()
        proc = await asyncio.create_subprocess_exec('/usr/bin/python3', '-I', str(ROOT/'bin/agent-desktop-ask'),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(json.dumps(dict(botId=self.agent, askId='a'*16, prompt='Desktop prompt')).encode()), 8)
        self.assertEqual(proc.returncode, 0, err)
        self.assertIn(b'Desktop prompt', out)
        self.assertEqual(err, b'')
    async def test_desktop_bridge_is_provider_agnostic(self):
        proc = await asyncio.create_subprocess_exec('/usr/bin/python3', '-I', str(ROOT/'bin/agent-desktop-ask'), '--provider', 'example',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(json.dumps(dict(botId='echo', askId='a'*16, prompt='same API')).encode()), 5)
        self.assertEqual(proc.returncode, 0, err)
        self.assertEqual(out.strip(), b'Example: same API')
    async def test_duplicate_unknown_and_invalid_attachment_rejected(self):
        with self.assertRaises(Fault):
            await self.send(attachments=['/etc/passwd'])
        await self.send()
        with self.assertRaises(Fault) as caught:
            await self.send()
        self.assertEqual(caught.exception.code, 'duplicate_id')
        with self.assertRaises(Fault):
            await self.adapter.call('message.send', dict(agentId='missing', requestId='other', text='hi'))
    async def test_bad_roster_does_not_silently_fallback(self):
        (self.config/'grokbot-bots.json').write_text('{broken')
        with self.assertRaises(Fault) as caught:
            self.adapter.agents()
        self.assertEqual(caught.exception.code, 'invalid_config')
    async def test_overflow_and_errors_do_not_leak_diagnostics(self):
        self.settings(command=['/usr/bin/python3', '-c', 'print("x"*200000)'])
        await self.send()
        await self.finish()
        self.assertEqual(self.events[-1][1]['error']['code'], 'limit_exceeded')
        self.settings(command=['/usr/bin/python3', '-c', 'import sys; sys.stderr.write("private-token"); sys.exit(1)'])
        await self.send('other')
        await self.finish()
        self.assertNotIn('private-token', json.dumps(self.events))
    async def test_webhook_capabilities_and_callback_correlation(self):
        self.settings(dispatch='webhook', webhookUrl='https://example.invalid/hook')
        self.assertFalse(self.adapter.capabilities['attachments'])
        self.assertTrue(self.adapter.capabilities['deferredReplies'])
        # Model receipt-only transport output without opening a socket.
        class Process:
            returncode = 10
            stdin = type('Sink', (), {'write': lambda *_: None, 'close': lambda *_: None, 'drain': lambda *_: asyncio.sleep(0)})()
            stdout = asyncio.StreamReader()
            stderr = asyncio.StreamReader()
            async def wait(self): return 10
        proc = Process()
        proc.stdout.feed_data(b'Sent.\n'); proc.stdout.feed_eof(); proc.stderr.feed_eof()
        async def spawn(*args, **kwargs): return proc
        with patch('agent_desktop.grokbot.asyncio.create_subprocess_exec', spawn):
            result = await self.send()
            for _ in range(20):
                if self.events: break
                await asyncio.sleep(.01)
            self.assertEqual(self.events[-1][0], 'message.deferred')
            self.assertFalse(any(e[0] == 'message.finished' for e in self.events))
            with self.assertRaises(Fault):
                await self.adapter.call('message.reply', dict(requestId='turn', deliveryId='wrong', text='wrong'))
            await self.adapter.call('message.reply', dict(requestId='turn', deliveryId=result['deliveryId'], text='answer'))
            self.assertEqual(self.events[-1][1]['text'], 'answer')
            with self.assertRaises(Fault):
                await self.adapter.call('message.reply', dict(requestId='turn', deliveryId=result['deliveryId'], text='late'))
            self.assertEqual(len([e for e in self.events if e[0] == 'message.finished']), 1)
    async def test_deadline_emits_one_terminal_and_reaps_worker(self):
        self.settings(command=['/usr/bin/python3', '-c', 'import time; time.sleep(30)'])
        await self.send(timeoutSeconds=1)
        await self.finish()
        self.assertEqual(self.events[-1][1]['error']['code'], 'deadline_exceeded')
        self.assertFalse(self.adapter.active)
        self.assertEqual(len(self.events), 1)
    async def test_desktop_termination_reaps_agent_through_api_chain(self):
        code = "import os,time; open(os.environ['HOME']+'/worker','w').write(str(os.getpid())); time.sleep(30)"
        self.settings(command=['/usr/bin/python3', '-c', code])
        proc = await asyncio.create_subprocess_exec('/usr/bin/python3', '-I', str(ROOT/'bin/agent-desktop-ask'),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            proc.stdin.write(json.dumps(dict(botId=self.agent, askId='a'*16, prompt='private')).encode())
            await proc.stdin.drain()
            proc.stdin.close()
            marker = self.home/'worker'
            for _ in range(200):
                if marker.exists(): break
                await asyncio.sleep(.01)
            self.assertTrue(marker.exists())
            pid = int(marker.read_text())
            proc.terminate()
            await asyncio.wait_for(proc.wait(), 8)
            self.assertEqual(proc.returncode, 130)
            stat = Path(f'/proc/{pid}/stat')
            self.assertTrue(not stat.exists() or stat.read_text().split()[2] == 'Z')
            self.assertEqual(await proc.stderr.read(), b'')
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
    async def test_cancellation_stops_stubborn_descendant_and_ignores_late_work(self):
        code = '''import os,signal,time
pid=os.fork()
if pid==0:
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 while True: time.sleep(.1)
open(os.environ['HOME']+'/descendant','w').write(str(pid))
while True: time.sleep(.1)
'''
        self.settings(command=['/usr/bin/python3', '-c', code])
        await self.send()
        marker = self.home/'descendant'
        for _ in range(200):
            if marker.exists(): break
            await asyncio.sleep(.01)
        self.assertTrue(marker.exists())
        pid = int(marker.read_text())
        result = await asyncio.wait_for(self.adapter.call('request.cancel', dict(requestId='turn')), 5)
        self.assertEqual(result['scope'], 'local')
        for _ in range(100):
            stat = Path(f'/proc/{pid}/stat')
            if not stat.exists() or stat.read_text().split()[2] == 'Z': break
            await asyncio.sleep(.01)
        else:
            self.fail('agent descendant survived cancellation')
        self.assertFalse(self.adapter.active)
        self.assertEqual(len([e for e in self.events if e[0] == 'message.finished']), 1)


if __name__ == '__main__':
    unittest.main()
