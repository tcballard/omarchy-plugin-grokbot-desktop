import contextlib
import io
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
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
    def test_streaming_ask_sends_json_lines_and_a_final_reply(self):
        (self.config/'agent-desktop.json').write_text(json.dumps({'providers':{'example':{}}}))
        answer=self.run_helper('agent-desktop-ask',dict(provider='example',botId='echo',askId='abcdef123457',prompt='Streamed test',stream=True))
        self.assertEqual(answer.returncode,0,answer.stderr)
        lines=[json.loads(line) for line in answer.stdout.splitlines()]
        self.assertTrue(lines and all(set(line)=={'ev','text'} for line in lines))
        self.assertEqual(lines[-1],{'ev':'final','text':'Example: Streamed test'})
        self.assertIn('delta',[line['ev'] for line in lines[:-1]])
        # Without stream, the reply stays the plain one-shot text the Grok path relies on.
        plain=self.run_helper('agent-desktop-ask',dict(provider='example',botId='echo',askId='abcdef123458',prompt='Plain test'))
        self.assertEqual(plain.stdout,'Example: Plain test\n')
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
    def test_hermes_settings_save_preserves_other_providers_and_private_keys(self):
        file = self.config/'agent-desktop.json'
        original = {'extra': True, 'providers': {'grokbot': {'custom': 'kept'}, 'hermes': {'private': 'not-returned'}}}
        file.write_text(json.dumps(original))
        payload = {'action':'save', 'root':str(self.home), 'agentDir':str(self.home), 'python':'/usr/bin/python3'}
        result = self.run_helper('agent-desktop-config', payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        saved = json.loads(file.read_text())
        self.assertEqual(saved['providers']['grokbot'], original['providers']['grokbot'])
        self.assertEqual(saved['providers']['hermes']['private'], 'not-returned')
        self.assertTrue(saved['extra'])
        self.assertNotIn('not-returned', result.stdout)
        self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        read = self.run_helper('agent-desktop-config', {'action':'read'})
        self.assertEqual(json.loads(read.stdout), {key:payload[key] for key in ('root','agentDir','python')})
    def test_invalid_hermes_paths_and_broken_config_are_kept(self):
        file = self.config/'agent-desktop.json'
        for initial in ('{broken', '{"providers":{"example":{}}}'):
            file.write_text(initial)
            result = self.run_helper('agent-desktop-config', {'action':'save', 'root':'relative', 'agentDir':str(self.home), 'python':'/usr/bin/python3'})
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(file.read_text(), initial)
    def test_hermes_settings_refuses_symlink_and_oversized_requests(self):
        target = self.home/'target.json'
        target.write_text('{}')
        (self.config/'agent-desktop.json').symlink_to(target)
        payload = {'action':'save', 'root':str(self.home), 'agentDir':str(self.home), 'python':'/usr/bin/python3'}
        self.assertNotEqual(self.run_helper('agent-desktop-config', payload).returncode, 0)
        self.assertEqual(target.read_text(), '{}')
        payload['extra'] = 'a' * 17000
        self.assertNotEqual(self.run_helper('agent-desktop-config', payload).returncode, 0)
    def avatar_default(self, name='codex', output=None):
        (self.config/'defaults').mkdir(exist_ok=True)
        (self.config/'defaults/agent').write_text(name)
        binary = self.home/'.local/bin'/name
        binary.parent.mkdir(parents=True, exist_ok=True)
        binary.write_text("#!/usr/bin/python3\nimport os,sys,json\nfrom pathlib import Path\ntext=sys.stdin.read()\nPath(os.environ['HOME'],'invocation.json').write_text(json.dumps({'argv':sys.argv,'prompt':text,'cwd':os.getcwd(),'account':os.environ.get('CODEX_HOME')}))\nprint(" + repr(output or (ROOT/'data/avatars/rocket.json').read_text()) + ")\n")
        binary.chmod(0o700)
        return binary
    def test_avatar_uses_default_agent_stdin_and_never_chat_overrides(self):
        self.avatar_default()
        (self.config/'grokbot-desktop.json').write_text(json.dumps({'agent':'claude', 'dispatch':'webhook', 'command':['/not/used']}))
        result = self.run_helper('agent-desktop-avatar', {'action':'generate','agent':'codex','description':'PRIVATE blue rocket'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['id'], 'rocket')
        invocation = json.loads((self.home/'invocation.json').read_text())
        self.assertIn('PRIVATE blue rocket', invocation['prompt'])
        self.assertNotIn('PRIVATE', str(invocation['argv']))
        self.assertIn('features.shell_tool=false', invocation['argv'])
        self.assertIn('model_reasoning_effort="low"', invocation['argv'])
        self.assertIn('mcp_servers={}', invocation['argv'])
        self.assertIn('read-only', invocation['argv'])
        self.assertFalse(Path(invocation['cwd']).exists())
        self.assertFalse((self.config/'shell.json').exists())
    def test_avatar_reports_missing_unsupported_and_changed_default(self):
        for name in ('', 'hermes', 'claude'):
            (self.config/'defaults').mkdir(exist_ok=True)
            (self.config/'defaults/agent').write_text(name)
            result = self.run_helper('agent-desktop-avatar', {'action':'generate','agent':'codex','description':'rocket'})
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((self.home/'invocation.json').exists())
    def test_avatar_rejects_bad_output_and_large_inputs(self):
        self.avatar_default(output='not json PRIVATE')
        payload = {'action':'generate','agent':'codex','description':'rocket'}
        result = self.run_helper('agent-desktop-avatar', payload)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('PRIVATE', result.stderr)
        payload['description'] = 'x' * 2001
        self.assertNotEqual(self.run_helper('agent-desktop-avatar', payload).returncode, 0)
    def test_avatar_info_does_not_launch_and_generation_uses_selected_account(self):
        self.avatar_default()
        for key in ('CODEX_HOME', 'OMARCHY_AGENT_CODEX_HOME'):
            self.env.pop(key, None)
        helper = self.home/'.local/share/omarchy/bin/omarchy-agent-account-home'
        helper.parent.mkdir(parents=True)
        helper.write_text('#!/bin/sh\nprintf "%s" "$HOME/account-two"\n')
        helper.chmod(0o700)
        result = self.run_helper('agent-desktop-avatar', {'action':'info'})
        self.assertTrue(json.loads(result.stdout)['supported'])
        self.assertFalse((self.home/'invocation.json').exists())
        result = self.run_helper('agent-desktop-avatar', {'action':'generate','agent':'codex','description':'rocket'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.home/'invocation.json').read_text())['account'], str(self.home/'account-two'))
    def test_avatar_claude_and_grok_use_their_restricted_headless_flags(self):
        for name, flag in [('claude','--strict-mcp-config'), ('grok','--deny')]:
            self.avatar_default(name)
            result = self.run_helper('agent-desktop-avatar', {'action':'generate','agent':name,'description':'rocket'})
            self.assertEqual(result.returncode, 0, result.stderr)
            args = json.loads((self.home/'invocation.json').read_text())['argv']
            self.assertIn(flag, args)
            self.assertIn('--tools', args)
            self.assertEqual(args[args.index('--tools')+1], '')
    def test_avatar_cancel_terminates_the_agent_process(self):
        binary = self.avatar_default()
        binary.write_text("#!/usr/bin/python3\nimport os,sys,time,signal\nfrom pathlib import Path\ndef stop(signum,frame):\n Path(os.environ['HOME'],'terminated').write_text('yes');sys.exit(0)\nsignal.signal(signal.SIGTERM,stop)\nsys.stdin.read()\nPath(os.environ['HOME'],'ready').write_text('ready')\ntime.sleep(60)\n")
        proc = subprocess.Popen(['/usr/bin/python3','-I',str(ROOT/'bin/agent-desktop-avatar')], env=self.env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            proc.stdin.write(json.dumps({'action':'generate','agent':'codex','description':'rocket'}))
            proc.stdin.close()
            ready = self.home/'ready'
            deadline = time.monotonic() + 5
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(ready.exists())
            proc.terminate()
            proc.wait(timeout=5)
            self.assertEqual((self.home/'terminated').read_text(), 'yes')
        finally:
            if proc.poll() is None:
                proc.terminate(); proc.wait(timeout=5)
            proc.stdout.close(); proc.stderr.close()
    def test_transport_drains_startup_output_while_sending_large_prompt(self):
        transport = legacy_module()
        code = "import sys;sys.stderr.write('x'*12000);sys.stderr.flush();data=sys.stdin.read();print(len(data))"
        output = io.StringIO()
        spawn = subprocess.Popen
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()), patch.object(
                transport.subprocess, 'Popen', side_effect=lambda *a, **kw: spawn(*a, pipesize=4096, **kw)):
            status = transport.run_agent(['/usr/bin/python3','-c',code], 'p'*50000, self.env, timeout=3)
        self.assertEqual(status, 0)
        self.assertEqual(output.getvalue().strip(), '50000')
    def test_transport_deadline_includes_an_agent_that_never_reads_stdin(self):
        transport = legacy_module()
        started = time.monotonic()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            status = transport.run_agent(['/usr/bin/python3','-c','import time;time.sleep(60)'], 'p'*500000, self.env, timeout=.3)
        self.assertEqual(status, 124)
        self.assertLess(time.monotonic()-started, 3)
    def test_timeouts_obey_existing_shell_precedence_and_bounds(self):
        transport=legacy_module()
        self.assertEqual(transport.ask_timeout({}, {}, 180),180)
        self.assertEqual(transport.ask_timeout({}, {'askTimeoutSeconds':900},180),900)
        self.assertEqual(transport.ask_timeout({'askTimeoutSeconds':600},{'askTimeoutSeconds':900},180),600)
        self.assertEqual(transport.ask_timeout({'askTimeoutSeconds':1},{},180),30)
        self.assertEqual(transport.ask_timeout({'askTimeoutSeconds':9000},{},180),1800)

if __name__=='__main__': unittest.main()
