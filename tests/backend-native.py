"""Optional native check: QT_QPA_PLATFORM=offscreen python3 tests/backend-native.py.

Requires PySide6. Loads qml/Backend.qml in a real QML engine and lets it
start, greet and drive the real bin/agent-desktopd. Quickshell is not
available, so Quickshell.Io's Process and SplitParser are stood in for by the
small QProcess-based types below; this checks that Backend.qml is valid,
runnable QML with working signals and callbacks, not how Quickshell's own
Process behaves inside omarchy-shell.
"""
import json
import os
from pathlib import Path
import tempfile
import time

from PySide6.QtCore import QObject, QProcess, QProcessEnvironment, Property, Signal, Slot, QUrl, qInstallMessageHandler
from PySide6.QtGui import QGuiApplication
from PySide6.QtQml import QQmlComponent, QQmlEngine, qmlRegisterType

ROOT = Path(__file__).resolve().parent.parent


class SplitParser(QObject):
    read = Signal(str, arguments=["data"])

    def feed(self, chunk, buffer):
        buffer += chunk
        *lines, rest = buffer.split("\n")
        for line in lines:
            self.read.emit(line)
        return rest


class Process(QObject):
    started = Signal()
    exited = Signal(int, int, arguments=["exitCode", "exitStatus"])
    runningChanged = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._command, self._environment, self._clear, self._stdin = [], {}, False, True
        self._stdout = self._stderr = None
        self._buffers = ["", ""]
        self._proc = None

    def _get_command(self): return self._command
    def _set_command(self, value): self._command = [str(item) for item in value]
    command = Property("QVariantList", _get_command, _set_command)

    def _get_environment(self): return self._environment
    def _set_environment(self, value): self._environment = dict(value or {})
    environment = Property("QVariantMap", _get_environment, _set_environment)

    def _get_clear(self): return self._clear
    def _set_clear(self, value): self._clear = bool(value)
    clearEnvironment = Property(bool, _get_clear, _set_clear)

    def _get_stdin(self): return self._stdin
    def _set_stdin(self, value): self._stdin = bool(value)
    stdinEnabled = Property(bool, _get_stdin, _set_stdin)

    def _get_stdout(self): return self._stdout
    def _set_stdout(self, value): self._stdout = value
    stdout = Property(QObject, _get_stdout, _set_stdout)

    def _get_stderr(self): return self._stderr
    def _set_stderr(self, value): self._stderr = value
    stderr = Property(QObject, _get_stderr, _set_stderr)

    def _get_running(self):
        return self._proc is not None and self._proc.state() != QProcess.NotRunning

    def _set_running(self, value):
        if value and not self._get_running():
            proc = QProcess(self)
            env = QProcessEnvironment() if self._clear else QProcessEnvironment.systemEnvironment()
            for key, item in self._environment.items():
                env.insert(key, str(item))
            proc.setProcessEnvironment(env)
            proc.readyReadStandardOutput.connect(lambda: self._read(0))
            proc.readyReadStandardError.connect(lambda: self._read(1))
            proc.started.connect(self.started)
            proc.finished.connect(self._finished)
            self._proc = proc
            proc.start(self._command[0], self._command[1:])
            self.runningChanged.emit()
        elif not value and self._get_running():
            self._proc.terminate()
    running = Property(bool, _get_running, _set_running, notify=runningChanged)

    def _read(self, which):
        data = (self._proc.readAllStandardOutput() if which == 0 else self._proc.readAllStandardError()).data().decode()
        parser = self._stdout if which == 0 else self._stderr
        self._buffers[which] = parser.feed(data, self._buffers[which])

    def _finished(self, code, status):
        self._proc = None
        self.runningChanged.emit()
        self.exited.emit(code, int(status.value) if hasattr(status, "value") else int(status))

    @Slot(str)
    def write(self, data):
        self._proc.write(data.encode())


def plain(value):
    return value.toVariant() if hasattr(value, "toVariant") else value


DRIVER = """
import QtQuick
Item {
  id: t
  property var events: []
  property string phase: "starting"
  property var results: ({})
  Loader {
    id: loader
    source: %(backend)s
    onLoaded: { item.helper = %(helper)s; item.environment = %(env)s; item.start() }
  }
  function note(name, value) { var next = Object.assign({}, t.results); next[name] = value; t.results = next }
  Connections {
    target: loader.item
    function onConnected() {
      t.phase = "connected"
      var b = loader.item
      b.call("roster.set", { bots: [{ id: "example:echo", agentId: "echo", provider: "example", name: "Example Agent", shortName: "Echo" }] },
        function (result, error) { t.note("roster.set", result) })
      b.call("view.set", { botId: "example:echo", bubbleOpen: false }, function (result) { t.note("view.set", result) })
      b.call("ask.send", { text: "Hello" }, function (result) { t.note("ask.send", result) })
      b.call("no.such.method", {}, function (result, error) { t.note("unknown", error ? error.code : result) })
    }
    function onStateEvent(snapshot) { t.events = t.events.concat([{ kind: "state", body: snapshot.body, asking: snapshot.asking }]) }
    function onDeltaEvent(params) { t.events = t.events.concat([{ kind: "delta", text: params.text }]) }
    function onEffectEvent(params) {
      t.events = t.events.concat([{ kind: params.kind }])
      if (params.kind === "landed") { t.phase = "landed"; loader.item.stop() }
    }
  }
}
"""


def main():
    messages = []
    qInstallMessageHandler(lambda kind, context, message: messages.append(message))
    app = QGuiApplication([])
    qmlRegisterType(Process, "Quickshell.Io", 1, 0, "Process")
    qmlRegisterType(SplitParser, "Quickshell.Io", 1, 0, "SplitParser")
    with tempfile.TemporaryDirectory() as temp:
        home = Path(temp) / "home"
        (home / ".config/omarchy").mkdir(parents=True)
        (home / ".config/omarchy/agent-desktop.json").write_text(json.dumps({"providers": {"example": {}}}))
        runtime = Path(temp) / "run"
        runtime.mkdir(mode=0o700)
        env = {"HOME": str(home), "XDG_RUNTIME_DIR": str(runtime), "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
               "PYTHONSAFEPATH": "1", "PYTHONNOUSERSITE": "1"}
        source = DRIVER % {"backend": json.dumps(QUrl.fromLocalFile(str(ROOT / "qml/Backend.qml")).toString()),
                           "helper": json.dumps(str(ROOT / "bin/agent-desktopd")), "env": json.dumps(env)}
        engine = QQmlEngine()
        component = QQmlComponent(engine)
        component.setData(source.encode(), QUrl.fromLocalFile(str(Path(temp) / "driver.qml")))
        driver = component.create()
        assert driver is not None, component.errorString()
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            app.processEvents()
            if driver.property("phase") == "landed":
                break
            time.sleep(0.01)
        for _ in range(50):  # let stop() reap the process
            app.processEvents()
            time.sleep(0.01)
        events, results = (plain(driver.property(name)) for name in ("events", "results"))
        assert driver.property("phase") == "landed", (driver.property("phase"), events, messages)
        kinds = [event["kind"] for event in events]
        assert results == {"roster.set": "ok", "view.set": "ok", "ask.send": "ok", "unknown": "unsupported"}, results
        assert kinds[:5] == ["state", "state", "draft-clear", "open", "ask-started"], kinds
        assert {"kind": "delta", "text": "Example:"} in events, events
        assert events[-3:] == [{"kind": "state", "body": "Example: Hello", "asking": False}, {"kind": "cue-active"}, {"kind": "landed"}], events
        print("Backend.qml events:", " ".join(kinds))
        connected = [m for m in messages if "connected" in m]
        assert connected and "agent daemon" in connected[0], messages
        unexpected = [m for m in messages if "connected" not in m]
        assert not unexpected, unexpected
        driver.deleteLater()
        app.processEvents()
    print("PASS Backend.qml drove bin/agent-desktopd in a real QML engine")
    os._exit(0)


if __name__ == "__main__":
    main()
