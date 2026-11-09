#!/usr/bin/env python3
"""Failures reach the desktop with the worker's own reason.

Each ask goes through bin/agent-desktop-ask, the path QML runs, which starts
the provider, whose adapter spawns bin/grokbot-ask.
"""
import http.server
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop import transport  # noqa: E402
from agent_desktop.grokbot import legacy_module, worker_detail, worker_fault  # noqa: E402

BOB = 'e0195a7d-f804-4688-9191-e2cf3574a6d1'
RELEASE = (ROOT/'VERSION').read_text().strip()


class Hook(http.server.BaseHTTPRequestHandler):
    seen = []
    answer = (401, b'{"code":"error","message":"Invalid API key"}')

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        type(self).seen.append(({k.lower(): v for k, v in self.headers.items()}, json.loads(body)))
        status, payload = type(self).answer
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class DesktopAskErrors(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.config = self.home/'.config/omarchy'
        self.config.mkdir(parents=True)
        self.env = {'PATH': '/usr/bin:/bin', 'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.home/'.config'),
                    'GROKBOT_WEBHOOK_TIMEOUT': '5'}

    def tearDown(self):
        self.temp.cleanup()

    def settings(self, **values):
        (self.config/'grokbot-desktop.json').write_text(json.dumps(values))

    def ask(self):
        request = json.dumps({'botId': BOB, 'askId': '0a1b2c3d4e5f6a7b', 'prompt': 'hello'})
        done = subprocess.run(['/usr/bin/python3', '-I', str(ROOT/'bin/agent-desktop-ask')], input=request.encode(),
                              capture_output=True, env=self.env, timeout=60)
        return done.returncode, done.stdout.decode(), done.stderr.decode().strip()

    def serve(self, answer):
        Hook.seen = []
        Hook.answer = answer
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Hook)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (server.shutdown(), server.server_close()))
        return f'http://127.0.0.1:{server.server_address[1]}/hook'

    def webhook(self, answer):
        url = self.serve(answer)
        self.settings(dispatch='webhook', webhookUrl=url)
        key = self.config/'grokbot-webhook.key'
        key.write_text('crsr_test\n')
        key.chmod(0o600)

    def test_webhook_401_names_the_webhooks_reason(self):
        self.webhook((401, b'{"code":"error","message":"Invalid API key"}'))
        code, out, err = self.ask()
        self.assertEqual((code, out), (1, ''))
        self.assertEqual(err, 'webhook status 401: Invalid API key')

    def test_webhook_sends_release_user_agent_and_reply_command(self):
        self.webhook((200, b'{"reply":"hi there"}'))
        code, out, err = self.ask()
        self.assertEqual(code, 0, err)
        self.assertEqual(out.strip(), 'hi there')
        headers, body = Hook.seen[0]
        self.assertEqual(headers['user-agent'], f'grokbot-desktop/{RELEASE}')
        self.assertEqual(body['replyWith'], [str(ROOT/'bin/grokbot-desktop-ctl'), 'reply', '0a1b2c3d4e5f6a7b'])

    def test_missing_key_keeps_its_specific_message(self):
        self.settings(dispatch='webhook', webhookUrl=self.serve((200, b'{}')))
        code, _, err = self.ask()
        self.assertEqual(code, 1)
        self.assertEqual(err, 'webhook key is missing or readable by other users')
        self.assertEqual(Hook.seen, [])

    def test_missing_agent_says_how_to_install_it(self):
        dirs = transport.launcher_dirs()
        missing = next((name for name in ('claude', 'crush', 'omp', 'pi', 'copilot')
                        if not transport.resolve_launcher(transport.AGENT_ARGV[name][0], dirs)), None)
        if missing is None:
            self.skipTest('every candidate agent is installed here')
        self.settings(dispatch='agent', agent=missing)
        code, _, err = self.ask()
        self.assertEqual(code, 1)
        self.assertEqual(err, f"{missing} isn't installed. Install it with: omarchy default agent {missing}")

    def test_unsupported_agent_is_named(self):
        self.settings(dispatch='agent', agent='nosuchagent')
        code, _, err = self.ask()
        self.assertEqual(code, 1)
        self.assertEqual(err, 'The companion can\'t ask nosuchagent yet. Set "agent" or "command", '
                              'or use webhook dispatch, in grokbot-desktop.json.')

    def test_failing_agent_shows_what_it_printed(self):
        self.settings(dispatch='agent', command=['/usr/bin/python3', '-c',
                      'import sys; sys.stderr.write("please sign in\\x07 again"); sys.exit(3)'])
        code, _, err = self.ask()
        self.assertEqual(code, 1)
        self.assertEqual(err, 'agent command: please sign in again')

    def test_adapter_reports_the_release_version(self):
        script = ('import asyncio,sys\nsys.path.insert(0, sys.argv[1])\nfrom agent_desktop.client import Client\n'
                  'async def main():\n c=Client("example")\n try: print((await c.start())["adapterVersion"])\n'
                  ' finally: await c.close()\nasyncio.run(main())\n')
        done = subprocess.run(['/usr/bin/python3', '-I', '-c', script, str(ROOT)], capture_output=True, text=True,
                              env=self.env, timeout=20)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(done.stdout.strip(), RELEASE)


class WorkerReasons(unittest.TestCase):
    def test_reason_is_bounded_and_control_free(self):
        detail = worker_detail(b'line one\n\x1b[31mred\x00' + b'z' * 2000)
        self.assertTrue(detail.startswith('line one [31mred z'))
        self.assertLessEqual(len(detail), 400)
        self.assertNotRegex(detail, r'[\x00-\x1f\x7f]')

    def test_codes_stay_and_generic_text_only_when_silent(self):
        self.assertEqual(worker_fault(4, b'').data()['message'],
                         'Grok Bot did not confirm completion; inspect it before retrying.')
        self.assertEqual(worker_fault(4, b'').code, 'delivery_unknown')
        self.assertEqual(worker_fault(127, b'').message, 'The configured local agent is unavailable.')
        self.assertEqual(worker_fault(127, b'x isn\'t installed').code, 'unavailable')
        self.assertEqual(worker_fault(3, b'webhook key is missing').message, 'webhook key is missing')
        self.assertEqual(worker_fault(124, b'agent timed out').code, 'deadline_exceeded')
        self.assertEqual(worker_fault(1, b'Traceback (most recent call last):\n boom').message,
                         'Grok Bot did not confirm completion; inspect it before retrying.')

    def test_legacy_module_is_the_transport(self):
        self.assertIs(legacy_module(), transport)
        self.assertTrue(callable(legacy_module().run_agent))


if __name__ == '__main__':
    unittest.main()
