#!/usr/bin/env python3
"""bin/agent-desktop-roster and bin/agent-desktop-config under bad input."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop.protocol import Fault  # noqa: E402

UNKNOWN_USER = '~nosuchuser-agent-desktop/hermes'


def load_roster():
    loader = importlib.machinery.SourceFileLoader('agent_desktop_roster', str(ROOT / 'bin' / 'agent-desktop-roster'))
    spec = importlib.util.spec_from_loader('agent_desktop_roster', loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class Helpers(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        self.config = self.home / '.config/omarchy'
        self.config.mkdir(parents=True)
        self.env = {'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.home / '.config'), 'PATH': '/usr/bin:/bin'}

    def run_helper(self, name, payload=None):
        return subprocess.run(['/usr/bin/python3', '-I', str(ROOT / 'bin' / name)], env=self.env,
                              input=json.dumps(payload) if payload is not None else '',
                              text=True, capture_output=True, timeout=30)

    def test_rows_that_are_not_agents_are_skipped(self):
        roster = load_roster()
        reply = {'result': {'agents': ['text', None, {'id': '../bad'}, {'name': 'no id'},
                                       {'id': 'good', 'name': 'Good'}]}}
        bots, skipped = roster.roster_rows('example', reply)
        self.assertEqual([b['id'] for b in bots], ['example:good'])
        self.assertEqual(skipped, 4)
        for bad in [None, [], {'result': []}, {'result': {'agents': {}}}]:
            with self.assertRaises(Fault):
                roster.roster_rows('example', bad)
        with self.assertRaises(Fault) as caught:
            roster.roster_rows('example', {'error': 'not an object'})
        self.assertEqual(caught.exception.message, 'Provider unavailable.')

    def test_unexpandable_hermes_path_does_not_hide_the_example(self):
        (self.config / 'agent-desktop.json').write_text(json.dumps(
            {'providers': {'example': {}, 'hermes': {'root': UNKNOWN_USER}}}))
        result = self.run_helper('agent-desktop-roster')
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual([b['id'] for b in data['bots']], ['example:echo'])
        self.assertEqual(len(data['errors']), 1)
        self.assertTrue(data['errors'][0].startswith('hermes:'))
        self.assertNotIn('Traceback', result.stderr)

    def test_config_save_with_unknown_user_path_is_one_line(self):
        file = self.config / 'agent-desktop.json'
        file.write_text(json.dumps({'providers': {'hermes': {'root': str(self.home)}}}))
        original = file.read_bytes()
        result = self.run_helper('agent-desktop-config', {'action': 'save', 'root': UNKNOWN_USER,
                                                          'agentDir': str(self.home), 'python': '/usr/bin/python3'})
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('Traceback', result.stderr)
        self.assertEqual(result.stderr.strip(), 'Enter absolute paths or paths beginning with ~/.')
        self.assertEqual(file.read_bytes(), original)
        self.assertEqual(sorted(os.listdir(self.config)), ['agent-desktop.json'])


if __name__ == '__main__':
    unittest.main()
