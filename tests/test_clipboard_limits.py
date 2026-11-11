import runpy
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent_desktop import wake

attach = runpy.run_path(str(ROOT / 'bin/grokbot-attach'))
connect = runpy.run_path(str(ROOT / 'bin/grokbot-connect'))


class ClipboardTests(unittest.TestCase):
    def capture(self, code, limit=128, timeout=1):
        return attach['bounded_capture']([sys.executable, '-c', code], limit, timeout)

    def test_exact_limit(self):
        self.assertEqual(self.capture('print("x" * 127)'), b'x' * 127 + b'\n')

    def test_overflow(self):
        with self.assertRaises(OSError):
            self.capture('import os; os.write(1, b"x" * 1000000)')

    def test_deadline(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            self.capture('import time; time.sleep(10)', timeout=0.05)

    def test_stderr_is_discarded(self):
        self.assertEqual(self.capture('import os; os.write(2, b"x" * 1000000); print("ok")'), b'ok\n')

    def test_terminal_controls(self):
        cleaned = connect['terminal_text']('hello é\x1b[2K\x9b31m\x07')
        self.assertEqual(cleaned, 'hello é[2K31m')

    def test_clipboard_never_submits(self):
        delivered, _ = wake.should_deliver('Hey Bot hello', 'clipboard', 0, 1, {}, [])
        self.assertFalse(delivered)


if __name__ == '__main__':
    unittest.main()
