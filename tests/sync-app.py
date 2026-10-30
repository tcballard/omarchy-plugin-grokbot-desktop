import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from urllib.parse import quote

HELPER = Path(__file__).resolve().parents[1] / 'bin/grokbot-sync'


class AppSync(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.cache = self.home / '.config/Grok Bot/sand-client-persistence'
        self.cache.mkdir(parents=True)
        self.output = self.home / 'roster.json'
        self.output.write_text('{"bots": [{"id": "old"}]}')
        self.original = self.output.read_bytes()
        self.account = 'test|current'
        self.slot = 'sand.client.slice.client-meta.account-slot'
        self.write(self.slot, 1, self.account)

    def write(self, key, schema, value):
        name = base64.b32encode(key.encode()).decode().lower().rstrip('=') + '.blob'
        p = self.cache / name
        p.write_text(json.dumps({'schemaVersion': schema, 'value': value}))
        return p

    def roster(self, rows, account=None, schema=4):
        account = quote(account or self.account, safe="~()*!.'-_")
        return self.write('sand.client.slice.account.' + account + '.roster.last-roster', schema, {'rows': rows})

    def run_sync(self):
        return subprocess.run(['/usr/bin/python3', '-I', str(HELPER), '--app', '--output', str(self.output)],
                              env={**os.environ, 'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.home / '.config')},
                              capture_output=True, text=True, timeout=5)

    def assert_kept(self):
        result = self.run_sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.output.read_bytes(), self.original)

    def test_only_active_account_and_public_fields(self):
        self.roster([{'id': 'wrong', 'name': 'Wrong account'}], account='test|other')
        self.roster([{'id': 'current', 'name': '<b>Current</b>', 'description': 'Contact secret@example.org.',
                      'avatarShape': 'teardrop', 'avatarColor': 'orange', 'lastEntry': 'private message'},
                     {'id': 'group', 'name': 'Group', 'isGroup': True},
                     {'id': 'removed', 'name': 'Removed', 'isRemovedFromSidebar': True}])
        result = self.run_sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        bots = json.loads(self.output.read_text())['bots']
        self.assertEqual(len(bots), 1)
        self.assertEqual(bots[0]['id'], 'current')
        self.assertEqual(bots[0]['name'], '<b>Current</b>')
        self.assertEqual(bots[0]['avatarColor'], 'orange')
        self.assertNotIn('secret@example.org', self.output.read_text())
        self.assertNotIn('private message', self.output.read_text())

    def test_missing_active_roster_does_not_use_other_account(self):
        self.roster([{'id': 'other', 'name': 'Other'}], account='test|other')
        self.assert_kept()

    def test_unknown_schema_keeps_roster(self):
        self.roster([{'id': 'a', 'name': 'A'}], schema=99)
        self.assert_kept()

    def test_empty_invalid_duplicate_and_oversized_rosters_keep_previous(self):
        for rows in [[], [None], [{'id': 'a', 'name': 'A'}, {'id': 'a', 'name': 'Duplicate'}],
                     [{'id': 'a', 'name': 'A'}] * 501]:
            with self.subTest(rows=len(rows)):
                self.roster(rows)
                self.assert_kept()

    def test_partial_write_and_symlink_keep_roster(self):
        p = self.roster([{'id': 'a', 'name': 'A'}])
        p.write_text('{')
        self.assert_kept()
        p.unlink()
        p.symlink_to(self.output)
        self.assert_kept()


if __name__ == '__main__':
    unittest.main()
