import QtQuick
import Quickshell.Io
import "backend.js" as Wire

// The opt-in daemon backend: one bin/agent-desktopd for the shell session,
// spoken to in NDJSON as docs/DESKTOP-PROTOCOL.md describes. Main.qml loads
// this only when the plugin setting `backend` is "daemon", and assigns what
// it reports onto its own properties. This file owns the process, the
// handshake, the pending requests and the restarts; the pure parts are in
// backend.js.
Item {
  id: backend
  visible: false

  // Set by Main.qml before start().
  property string helper: ""
  property var environment: ({})

  // True from the hello answer until the process goes away.
  property bool ready: false
  // True once the daemon failed too often: the shell uses the legacy path
  // for the rest of the session.
  property bool gaveUp: false
  property var hello: null
  property var session: Wire.newSession()
  property var failures: []
  property bool stopping: false
  // Whether the current run's end has been handled, so a run is counted
  // once however it ends.
  property bool down: true
  property string lastReason: ""

  signal connected()
  // The daemon was ready and is gone (it exited or broke the protocol).
  signal lost(string reason)
  signal gaveUpForSession(string reason)
  signal stateEvent(var snapshot)
  signal deltaEvent(var params)
  signal effectEvent(var params)

  function helperOk() {
    var path = String(backend.helper || "")
    return path.indexOf("/") === 0 && /\/bin\/agent-desktopd$/.test(path) && path.indexOf("..") < 0
  }

  function start() {
    if (backend.gaveUp || proc.running) return
    if (!backend.helperOk()) {
      backend.giveUp("the daemon helper is not the bundled script")
      return
    }
    backend.session = Wire.newSession()
    backend.ready = false
    backend.stopping = false
    backend.down = false
    proc.command = ["/usr/bin/setpriv", "--pdeathsig", "TERM", "/usr/bin/python3", "-I", backend.helper]
    proc.environment = backend.environment
    // Also covers a process that never starts.
    helloTimer.restart()
    proc.running = true
  }

  // Ends the daemon on purpose (shell shutdown): no restart, no events.
  function stop() {
    backend.stopping = true
    backend.down = true
    restartTimer.stop()
    helloTimer.stop()
    backend.ready = false
    if (proc.running) proc.running = false
  }

  // Sends a request; `callback(result, error)` runs with the response, or
  // with a "lost" error if the daemon goes away first. Returns whether the
  // request was written.
  function call(method, params, callback) {
    if (!proc.running || backend.stopping) {
      if (typeof callback === "function") callback(null, { code: "lost", message: "The daemon is not running.", retryable: true })
      return false
    }
    var line = Wire.request(backend.session, method, params, callback)
    if (line === "") return false
    proc.write(line)
    return true
  }

  function pending(method) {
    return Wire.pendingCount(backend.session, method)
  }

  function receive(line) {
    var frame = Wire.receive(backend.session, line)
    if (frame.type === "ignore") return
    if (frame.type === "fatal") {
      backend.broken(frame.reason)
      return
    }
    if (frame.type === "response") {
      if (frame.callback) frame.callback(frame.result, frame.error)
      return
    }
    if (!backend.ready) return
    if (frame.event === "state") backend.stateEvent(frame.params)
    else if (frame.event === "ask.delta") backend.deltaEvent(frame.params)
    else if (frame.event === "effect") backend.effectEvent(frame.params)
  }

  // A protocol break: stop the process; its exit is counted as a failure.
  function broken(reason) {
    backend.lastReason = reason
    console.warn("Grok Bot desktop: agent daemon broke the protocol (" + reason + "); stopping it")
    if (proc.running) proc.running = false
    else backend.exitedUnexpectedly(-1)
  }

  function giveUp(reason) {
    if (backend.gaveUp) return
    backend.gaveUp = true
    restartTimer.stop()
    console.warn("Grok Bot desktop: agent daemon " + reason + "; using the standard ask path for this session")
    backend.gaveUpForSession(reason)
  }

  function exitedUnexpectedly(code) {
    if (backend.down) return
    backend.down = true
    helloTimer.stop()
    var wasReady = backend.ready
    backend.ready = false
    var callbacks = Wire.dropPending(backend.session)
    var i
    for (i = 0; i < callbacks.length; i++) callbacks[i](null, { code: "lost", message: "The daemon stopped.", retryable: true })
    var reason = backend.lastReason !== "" ? backend.lastReason : "exited with code " + code
    backend.lastReason = ""
    backend.failures = Wire.recordFailure(backend.failures, Date.now())
    if (wasReady) backend.lost(reason)
    if (Wire.shouldGiveUp(backend.failures)) {
      backend.giveUp("failed " + backend.failures.length + " times in a minute (last: " + reason + ")")
      return
    }
    restartTimer.interval = Wire.restartDelay(backend.failures.length)
    console.warn("Grok Bot desktop: agent daemon " + reason + "; restarting in " + restartTimer.interval + " ms")
    restartTimer.restart()
  }

  Process {
    id: proc
    clearEnvironment: true
    stdinEnabled: true
    stdout: SplitParser { onRead: function (line) { backend.receive(line) } }
    // The daemon's diagnostics are single lines without private text.
    stderr: SplitParser { onRead: function (line) { console.warn("Grok Bot desktop: agent daemon: " + String(line).slice(0, 400)) } }
    onStarted: {
      backend.call("hello", {}, function (result, error) {
        helloTimer.stop()
        // The process ended first; its exit is already being handled.
        if (error && error.code === "lost") return
        if (error || !Wire.helloOk(result)) {
          backend.broken(error ? "hello refused: " + error.code : "incompatible hello")
          return
        }
        backend.hello = result
        backend.ready = true
        console.info("Grok Bot desktop: agent daemon " + String(result.version || "") + " connected; control socket "
          + (result.ctlSocket === true ? "on" : "off"))
        backend.connected()
      })
    }
    onExited: function (code) {
      if (backend.stopping) return
      backend.exitedUnexpectedly(code)
    }
  }

  Timer {
    id: helloTimer
    interval: Wire.HELLO_TIMEOUT_MS
    onTriggered: backend.broken("no hello answer")
  }

  Timer {
    id: restartTimer
    onTriggered: backend.start()
  }

  Component.onDestruction: backend.stop()
}
