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
from agent_desktop.grokbot import legacy_module

class DesktopIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.config = self.home/'.config/omarchy'
        self.config.mkdir(parents=True)
        self.env = {**os.environ, 'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.home/'.config')}
    def run_helper(self, name, payload=None):
        return subprocess.run(['/usr/bin/python3','-I',str(ROOT/'bin'/name)], env=self.env,
            input=json.dumps(payload) if payload is not None else '', text=True, capture_output=True, timeout=20)
    def test_example_discovery_and_desktop_send_share_native_identity(self):
        (self.config/'agent-desktop.json').write_text(json.dumps({'providers':{'example':{}}}))
        result=self.run_helper('agent-desktop-roster')
        self.assertEqual(result.returncode,0,result.stderr)
        roster=json.loads(result.stdout)
        self.assertEqual(roster['errors'],[])
        row=roster['bots'][0]
        self.assertEqual(row['id'],'example:echo')
        answer=self.run_helper('agent-desktop-ask',dict(provider=row['provider'],botId=row['agentId'],askId='abcdef123456',prompt='Private test'))
        self.assertEqual(answer.returncode,0,answer.stderr)
        self.assertEqual(answer.stdout.strip(),'Example: Private test')
    def test_broken_hermes_does_not_remove_working_example(self):
        (self.config/'agent-desktop.json').write_text(json.dumps({'providers':{'example':{},'hermes':{'root':str(self.home/'missing')}}}))
        result=self.run_helper('agent-desktop-roster')
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(result.stdout)
        self.assertEqual(data['bots'][0]['id'],'example:echo')
        self.assertTrue(data['errors'][0].startswith('hermes:'))
    def test_invalid_config_is_not_silently_replaced(self):
        file=self.config/'agent-desktop.json';file.write_text('{broken')
        result=self.run_helper('agent-desktop-roster')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(file.read_text(),'{broken')
    def test_timeouts_obey_existing_shell_precedence_and_bounds(self):
        transport=legacy_module()
        self.assertEqual(transport.ask_timeout({}, {}, 180),180)
        self.assertEqual(transport.ask_timeout({}, {'askTimeoutSeconds':900},180),900)
        self.assertEqual(transport.ask_timeout({'askTimeoutSeconds':600},{'askTimeoutSeconds':900},180),600)
        self.assertEqual(transport.ask_timeout({'askTimeoutSeconds':1},{},180),30)
        self.assertEqual(transport.ask_timeout({'askTimeoutSeconds':9000},{},180),1800)

if __name__=='__main__': unittest.main()
