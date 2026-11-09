#!/usr/bin/env python3
"""bin/grokbot-connect: check settings first, save where asks read, never half-save."""
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parent.parent
OK = b'{"success":true,"runUuid":"ac049e46-d399-485d-8a8e-b6e8954202c8"}'


class Hook(http.server.BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        type(self).seen.append({k.lower(): v for k, v in self.headers.items()})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(OK)))
        self.end_headers()
        self.wfile.write(OK)

    def log_message(self, *args):
        pass


class Connect(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.config = self.home/'.config/omarchy'
        self.config.mkdir(parents=True)
        self.settings_file = self.config/'grokbot-desktop.json'
        self.default_key = self.config/'grokbot-webhook.key'
        self.default_header = self.config/'grokbot-webhook-header.key'
        Hook.seen = []
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Hook)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (server.shutdown(), server.server_close()))
        self.url = f'http://127.0.0.1:{server.server_address[1]}/hook'
        self.env = {'PATH': '/usr/bin:/bin', 'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.home/'.config'),
                    'GROKBOT_WEBHOOK_TIMEOUT': '5'}

    def tearDown(self):
        self.temp.cleanup()

    def connect(self, lines, *args):
        done = subprocess.run(['/usr/bin/python3', str(ROOT/'bin/grokbot-connect'), *args],
                              input='\n'.join(lines) + '\n', capture_output=True, text=True, env=self.env, timeout=60)
        return done.returncode, done.stdout, done.stderr

    def test_invalid_settings_stop_it_before_asking_or_sending(self):
        self.settings_file.write_text('{not json')
        code, out, err = self.connect([self.url, 'crsr_new'])
        self.assertNotEqual(code, 0)
        self.assertIn("isn't valid JSON", err)
        self.assertNotIn('Webhook URL', out)
        self.assertEqual(Hook.seen, [])
        self.assertFalse(self.default_key.exists())
        self.assertEqual(self.settings_file.read_text(), '{not json')

    def test_keys_go_where_the_desktop_file_says_asks_read_them(self):
        key_file = self.home/'secrets/routine.key'
        header_file = self.home/'secrets/routine-header.key'
        self.settings_file.write_text(json.dumps({'webhookKeyFile': str(key_file),
                                                  'webhookHeaderFile': str(header_file), 'agentsDir': '/srv/agents'}))
        code, out, err = self.connect([self.url, 'crsr_new', 'hv_new'], '--header', 'X-Routine-Token')
        self.assertEqual(code, 0, err)
        self.assertEqual(key_file.read_text(), 'crsr_new\n')
        self.assertEqual(header_file.read_text(), 'hv_new\n')
        self.assertEqual(key_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(header_file.stat().st_mode & 0o777, 0o600)
        self.assertFalse(self.default_key.exists())
        self.assertFalse(self.default_header.exists())
        saved = json.loads(self.settings_file.read_text())
        self.assertEqual(saved['webhookKeyFile'], str(key_file))
        self.assertEqual(saved['agentsDir'], '/srv/agents')
        # A real ask, through the worker, reads what was saved.
        status = subprocess.run(['/usr/bin/python3', str(ROOT/'bin/grokbot-connect'), '--status'],
                                capture_output=True, text=True, env=self.env, timeout=30)
        self.assertIn('Sender key: saved.', status.stdout)
        self.assertIn('Extra header X-Routine-Token: value saved.', status.stdout)
        ask = subprocess.run(['/usr/bin/python3', '-I', str(ROOT/'bin/grokbot-ask')],
                             input=json.dumps({'botId': 'bob', 'botName': 'Bob', 'prompt': 'hi'}),
                             capture_output=True, text=True, env=self.env, timeout=30)
        self.assertEqual(ask.returncode, 10, ask.stderr)
        self.assertEqual(Hook.seen[-1]['x-automation-key'], 'crsr_new')
        self.assertEqual(Hook.seen[-1]['x-routine-token'], 'hv_new')

    def test_a_failed_key_write_puts_settings_and_keys_back(self):
        original = json.dumps({'dispatch': 'agent', 'webhookUrl': 'https://old.example/hook',
                               'webhookHeaderFile': '/proc/self/grokbot-none/header.key'})
        self.settings_file.write_text(original)
        self.default_key.write_text('crsr_old\n')
        self.default_key.chmod(0o600)
        code, _, err = self.connect([self.url, 'crsr_new', 'hv_new'], '--header', 'X-Routine-Token')
        self.assertEqual(code, 1)
        self.assertIn('Not saved', err)
        self.assertEqual(len(Hook.seen), 1)  # the test ask ran; the save then failed
        self.assertEqual(self.settings_file.read_text(), original)
        self.assertEqual(self.default_key.read_text(), 'crsr_old\n')
        self.assertEqual(self.default_key.stat().st_mode & 0o777, 0o600)
        leftovers = [name for name in os.listdir(self.config) if name.startswith('.grokbot-')]
        self.assertEqual(leftovers, [])


if __name__ == '__main__':
    unittest.main()
