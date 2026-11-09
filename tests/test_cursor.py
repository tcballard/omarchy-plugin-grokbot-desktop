#!/usr/bin/env python3
"""Behaviour of bin/grokbot-cursor's main loop with a pipe standing in for a mouse node."""
import importlib.machinery
import importlib.util
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
HELPER = ROOT / "bin" / "grokbot-cursor"


def load():
    loader = importlib.machinery.SourceFileLoader("grokbot_cursor", str(HELPER))
    spec = importlib.util.spec_from_loader("grokbot_cursor", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


cursor = load()


class FakeMouse:
    """A FIFO opened by LeftButton like an event node, fed by a writer thread."""

    def __init__(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "event0")
        os.mkfifo(self.path)
        self.buttons = cursor.LeftButton([self.path])
        self.writer = os.open(self.path, os.O_WRONLY | os.O_NONBLOCK)
        self.stop = threading.Event()
        self.thread = None

    def send(self, typ, code, value):
        try:
            os.write(self.writer, cursor.EVENT.pack(0, 0, typ, code, value))
        except BlockingIOError:
            pass

    def motion(self, rate):
        def feed():
            gap = 1.0 / rate
            due = time.monotonic()
            while not self.stop.is_set():
                self.send(2, 0, 1)  # EV_REL REL_X
                due += gap
                pause = due - time.monotonic()
                if pause > 0:
                    time.sleep(pause)
        self.thread = threading.Thread(target=feed, daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join()
        os.close(self.writer)
        self.buttons.close()
        self.dir.cleanup()


def drive(buttons, seconds, moving=True):
    lines = []
    calls = []

    def request():
        calls.append(time.monotonic())
        return (len(calls), 0) if moving else (5, 5)

    end = time.monotonic() + seconds
    status = cursor.run(request, buttons, lines.append, lambda: time.monotonic() < end)
    return status, lines, calls


class CursorLoopTest(unittest.TestCase):
    def test_fast_mouse_does_not_raise_request_rate(self):
        mouse = FakeMouse()
        try:
            mouse.motion(1000)
            status, lines, calls = drive(mouse.buttons, 1.5)
        finally:
            mouse.close()
        self.assertEqual(status, 0)
        self.assertEqual(lines[0], "buttons 1")
        rate = len(calls) / 1.5
        self.assertLessEqual(rate, 36, f"{rate:.0f} requests per second")
        self.assertGreaterEqual(rate, 15, f"{rate:.0f} requests per second")

    def test_button_edge_is_reported_without_waiting_out_the_interval(self):
        mouse = FakeMouse()
        try:
            now = time.monotonic()
            timer = threading.Timer(0.1, mouse.send, (cursor.EV_KEY, cursor.BTN_LEFT, 1))
            timer.start()
            edges = mouse.buttons.wait(now + 2.0, now + cursor.FAST)
            elapsed = time.monotonic() - now
            timer.join()
        finally:
            mouse.close()
        self.assertEqual(edges, ["down"])
        self.assertLess(elapsed, 0.5)

    def test_motion_wakes_a_resting_wait(self):
        mouse = FakeMouse()
        try:
            now = time.monotonic()
            timer = threading.Timer(0.2, mouse.send, (2, 0, 1))
            timer.start()
            edges = mouse.buttons.wait(now + cursor.IDLE, now + cursor.FAST)
            elapsed = time.monotonic() - now
            timer.join()
        finally:
            mouse.close()
        self.assertEqual(edges, [])
        self.assertLess(elapsed, 0.6)

    def test_resting_pointer_polls_slowly(self):
        mouse = FakeMouse()
        try:
            status, lines, calls = drive(mouse.buttons, 3.0, moving=False)
        finally:
            mouse.close()
        self.assertEqual(status, 0)
        self.assertEqual(lines, ["buttons 1", "5 5"])
        # ~2 s fast, then 5 Hz: well under a fast poll for the whole time.
        self.assertLess(len(calls), 30 * 3.0 * 0.85)

    def test_without_event_nodes_it_says_buttons_0(self):
        buttons = cursor.LeftButton(["/nonexistent/event99"])
        try:
            status, lines, calls = drive(buttons, 0.3)
        finally:
            buttons.close()
        self.assertEqual(status, 0)
        self.assertEqual(lines[0], "buttons 0")
        self.assertTrue(calls)
        self.assertLessEqual(len(calls) / 0.3, 36)
        self.assertEqual(cursor.poll_interval(60.0, False), cursor.SLOW)
        self.assertEqual(cursor.poll_interval(60.0, True), cursor.IDLE)

    def test_self_test_passes_isolated(self):
        result = subprocess.run(
            ["/usr/bin/python3", "-I", "-S", str(HELPER), "--self-test"],
            env={}, capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
