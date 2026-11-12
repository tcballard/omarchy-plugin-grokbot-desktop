import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest


HELPER = Path(__file__).resolve().parents[1] / "bin" / "agent-desktop-hyprland"


class HyprlandTests(unittest.TestCase):
    def setUp(self):
        runtime = self.enterContext(tempfile.TemporaryDirectory())
        directory = Path(runtime, "hypr", "test-session")
        directory.mkdir(parents=True)
        self.server = self.enterContext(socket.socket(socket.AF_UNIX, socket.SOCK_STREAM))
        self.server.bind(str(directory / ".socket.sock"))
        self.server.listen()
        self.server.settimeout(2)
        self.env = {"XDG_RUNTIME_DIR": runtime, "HYPRLAND_INSTANCE_SIGNATURE": directory.name}

    def start(self, operation):
        proc = self.enterContext(subprocess.Popen(
            ["/usr/bin/python3", "-I", str(HELPER), operation],
            stdout=subprocess.PIPE, env=self.env,
        ))
        self.addCleanup(self.stop, proc)
        return proc

    @staticmethod
    def stop(proc):
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=2)

    def accept(self, command=None):
        connection, _ = self.server.accept()
        self.enterContext(connection)
        connection.settimeout(4)
        received = connection.recv(4096)
        if command is not None:
            self.assertEqual(received, command)
        return connection, received

    def reply(self, command, body):
        connection, _ = self.accept(command)
        with connection:
            connection.sendall(body)

    def test_layer_rule_and_client_snapshot(self):
        proc = self.start("layer-rule")
        connection, command = self.accept()
        with connection:
            self.assertTrue(command.startswith(b"/eval "))
            self.assertIn(b'"^grokbot-desktop$"', command)
            connection.sendall(b"ok")
        self.assertEqual(proc.wait(timeout=2), 0)

        proc = self.start("clients")
        self.reply(b"j/clients", b'[{"address":"0xabc","class":"grok-bot"}]')
        output, _ = proc.communicate(timeout=2)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(json.loads(output), [{"address": "0xabc", "class": "grok-bot"}])

    def test_combined_poll_returns_both_responses(self):
        proc = self.start("screensaver")
        self.reply(b"j/clients", b"[]")
        self.reply(b"j/layers", b'{"Virtual-1":{"levels":{"3":[]}}}')
        output, _ = proc.communicate(timeout=2)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(json.loads(output), {
            "clients": [], "layers": {"Virtual-1": {"levels": {"3": []}}},
        })

    def test_combined_poll_shares_one_deadline_and_closes_connection(self):
        proc = self.start("screensaver")
        connection, _ = self.accept(b"j/clients")
        with connection:
            time.sleep(1.5)
            connection.sendall(b"[]")
        connection, _ = self.accept(b"j/layers")
        with connection:
            output, _ = proc.communicate(timeout=2.5)
            self.assertEqual(proc.returncode, 1)
            self.assertEqual(output, b"")
            self.assertEqual(connection.recv(1), b"")

    def test_stalled_layer_rule_exits_and_closes_connection(self):
        proc = self.start("layer-rule")
        connection, _ = self.accept()
        with connection:
            self.assertEqual(proc.wait(timeout=2.5), 1)
            self.assertEqual(connection.recv(1), b"")

    def test_killing_the_owned_process_closes_the_inflight_socket(self):
        proc = self.start("screensaver")
        connection, _ = self.accept(b"j/clients")
        with connection:
            self.assertEqual(Path(f"/proc/{proc.pid}/task/{proc.pid}/children").read_text(), "")
            proc.kill()
            proc.wait(timeout=2)
            self.assertEqual(connection.recv(1), b"")

    def test_oversized_response_fails_without_waiting_for_eof(self):
        proc = self.start("clients")
        connection, _ = self.accept(b"j/clients")
        with connection:
            connection.sendall(b" " * (1024 * 1024 + 1))
            output, _ = proc.communicate(timeout=2)
            self.assertEqual(proc.returncode, 1)
            self.assertEqual(output, b"")


if __name__ == "__main__":
    unittest.main()
