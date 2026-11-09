.pragma library

// Pure helpers for the opt-in daemon backend (docs/DESKTOP-PROTOCOL.md):
// request framing, response and event decoding, the restart schedule, and the
// mapping from the daemon's `state` snapshot and `effect` events onto what
// Main.qml already uses. Nothing here touches QML objects or processes, so
// tests/backend.test.mjs drives the real bin/agent-desktopd through it.

var PROTOCOL_MAJOR = 1
var MAX_FRAME_BYTES = 1048576
// Longer strings are cut before they are sent. The daemon cleans and limits
// every text to at most 4000 units itself; this only keeps a pasted
// megabyte from overrunning the frame cap and ending the daemon.
var TEXT_SEND_LIMIT = 65536
var ROSTER_LIMIT = 1024
var FILE_LIMIT = 4
var HELLO_TIMEOUT_MS = 10000
// A failure is a daemon that exits, does not answer hello in time, or
// breaks the protocol. This many inside the window end the daemon for the
// rest of the shell session.
var FAILURE_LIMIT = 3
var FAILURE_WINDOW_MS = 60000
var RESTART_DELAYS_MS = [1000, 4000, 10000]

var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
var EPOCH_PATTERN = /^[0-9a-f]{32}$/

function newSession() {
  return { next: 1, pending: {}, epoch: "", seq: 0 }
}

function utf8Length(text) {
  var s = String(text)
  var bytes = 0
  var i
  for (i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) { bytes += 4; i++ }
      else bytes += 3
    } else bytes += 3
  }
  return bytes
}

function clipText(value) {
  var text = String(value === undefined || value === null ? "" : value)
  return text.length > TEXT_SEND_LIMIT ? text.slice(0, TEXT_SEND_LIMIT) : text
}

function requestId(session) {
  var id = "ui" + session.next
  session.next += 1
  return id
}

// Registers `callback(result, error)` and returns the line to write, or ""
// when the frame would be over the cap (the callback then gets an error at
// once and nothing is sent).
function request(session, method, params, callback) {
  var id = requestId(session)
  var frame = { v: PROTOCOL_MAJOR, id: id, method: String(method), params: params || {} }
  var line = JSON.stringify(frame) + "\n"
  if (utf8Length(line) > MAX_FRAME_BYTES) {
    if (typeof callback === "function")
      callback(null, { code: "limit_exceeded", message: "Request too large to send.", retryable: false })
    return ""
  }
  session.pending[id] = { method: String(method), callback: typeof callback === "function" ? callback : null }
  return line
}

function pendingCount(session, method) {
  var n = 0
  var key
  for (key in session.pending) if (method === undefined || session.pending[key].method === method) n++
  return n
}

// Removes every pending request and returns their callbacks, for a daemon
// that went away: each is called with a "lost" error by the caller.
function dropPending(session) {
  var out = []
  var key
  for (key in session.pending) if (session.pending[key].callback) out.push(session.pending[key].callback)
  session.pending = {}
  return out
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// One line from the daemon. Returns one of
//   { type: "response", id, method, result, error, callback }
//   { type: "event", event, params, seq }
//   { type: "fatal", reason }  -- restart the daemon (protocol says so)
//   { type: "ignore" }         -- a blank line
function receive(session, line) {
  var text = String(line === undefined || line === null ? "" : line)
  if (text.trim() === "") return { type: "ignore" }
  var frame
  try { frame = JSON.parse(text) } catch (e) { return { type: "fatal", reason: "unreadable frame" } }
  if (!isObject(frame)) return { type: "fatal", reason: "frame is not an object" }
  if (frame.v !== PROTOCOL_MAJOR) return { type: "fatal", reason: "wrong protocol version" }
  if (typeof frame.epoch !== "string" || !EPOCH_PATTERN.test(frame.epoch)) return { type: "fatal", reason: "missing epoch" }
  if (session.epoch === "") session.epoch = frame.epoch
  else if (session.epoch !== frame.epoch) return { type: "fatal", reason: "epoch changed" }
  if (typeof frame.event === "string") {
    if (typeof frame.seq !== "number" || frame.seq !== session.seq + 1) return { type: "fatal", reason: "event out of sequence" }
    session.seq = frame.seq
    return { type: "event", event: frame.event, params: isObject(frame.params) ? frame.params : {}, seq: frame.seq }
  }
  if (frame.id === null) return { type: "fatal", reason: "daemon refused a frame" }
  if (typeof frame.id !== "string" || !ID_PATTERN.test(frame.id)) return { type: "fatal", reason: "response without an id" }
  var entry = session.pending[frame.id]
  if (!entry) return { type: "fatal", reason: "response to an unknown request" }
  delete session.pending[frame.id]
  var hasResult = Object.prototype.hasOwnProperty.call(frame, "result")
  var hasError = Object.prototype.hasOwnProperty.call(frame, "error")
  if (hasResult === hasError) return { type: "fatal", reason: "response needs one of result or error" }
  var error = null
  if (hasError) {
    var raw = isObject(frame.error) ? frame.error : {}
    error = { code: String(raw.code || "error"), message: String(raw.message || ""), retryable: raw.retryable === true }
  }
  return { type: "response", id: frame.id, method: entry.method, result: hasResult ? frame.result : null,
    error: error, callback: entry.callback }
}

function helloOk(result) {
  return isObject(result) && isObject(result.protocol) && result.protocol.major === PROTOCOL_MAJOR
    && result.server === "agent-desktopd"
}

// The failures still inside the window, with `now` added.
function recordFailure(failures, now) {
  var list = (Array.isArray(failures) ? failures : []).filter(function (at) { return now - at < FAILURE_WINDOW_MS })
  list.push(now)
  return list
}

function shouldGiveUp(failures) {
  return Array.isArray(failures) && failures.length >= FAILURE_LIMIT
}

// Delay before the next start after `count` failures inside the window.
function restartDelay(count) {
  var n = Math.max(1, Math.floor(Number(count) || 1))
  return RESTART_DELAYS_MS[Math.min(n, RESTART_DELAYS_MS.length) - 1]
}

function stringList(value, limit) {
  if (!Array.isArray(value)) return []
  var out = []
  var i
  for (i = 0; i < value.length && out.length < limit; i++) if (typeof value[i] === "string") out.push(value[i])
  return out
}

function links(value) {
  if (!Array.isArray(value)) return []
  var out = []
  var i
  for (i = 0; i < value.length && out.length < 2; i++) {
    var item = value[i]
    if (isObject(item) && typeof item.label === "string" && typeof item.url === "string")
      out.push({ label: item.label, url: item.url })
  }
  return out
}

function str(value) {
  return typeof value === "string" ? value : ""
}

function exchange(item) {
  var row = isObject(item) ? item : {}
  return { asked: str(row.asked), files: stringList(row.files, FILE_LIMIT), body: str(row.body),
    links: links(row.links), wait: str(row.wait) }
}

// The snapshot as the Main.qml properties it is assigned to. `bubbleBody` is
// the streamed text while the bot on screen is asking, else the reply.
function snapshotProps(snapshot) {
  var s = isObject(snapshot) ? snapshot : {}
  var partial = str(s.partial)
  return {
    botId: str(s.botId),
    history: (Array.isArray(s.history) ? s.history : []).map(exchange),
    askedText: str(s.asked),
    askedFiles: stringList(s.files, FILE_LIMIT),
    pendingFiles: stringList(s.pending, FILE_LIMIT),
    bubbleBody: partial !== "" ? partial : str(s.body),
    noticeLinks: links(s.links),
    awaitingId: str(s.wait),
    asking: s.asking === true,
    askBotId: str(s.askBotId),
    askId: str(s.askId),
    unreadBots: stringList(s.unreadBots, ROSTER_LIMIT),
    awaitingBots: stringList(s.awaitingBots, ROSTER_LIMIT),
    undo: s.undo === true
  }
}

// The latest reply text for an `ask.delta`, or null when it is not for the
// conversation on screen.
function deltaBody(props, params, threadBotId) {
  var p = isObject(params) ? params : {}
  if (!props || typeof p.text !== "string") return null
  if (p.botId !== threadBotId || props.botId !== threadBotId) return null
  if (props.askId === "" || p.askId !== props.askId) return null
  return p.text
}

// What Main.qml does for each effect kind, in order (the protocol's effects
// table). Unknown kinds do nothing.
var EFFECT_STEPS = {
  "open": ["openBubble"],
  "select": ["selectBot"],
  "draft-clear": ["clearDraft"],
  "dictation-ended": ["endDictation"],
  "ask-started": ["work"],
  "idle": ["idle"],
  "rest": ["rest"],
  "landed": ["flashHappy", "syllables", "replyLanded"],
  "failed": ["idle", "replyLanded"],
  "unread": ["unread"],
  "cue-active": ["activeCue"],
  "cue-peek": ["peekCue"],
  "alert": ["summon", "flashAlert", "syllables"]
}

function effectSteps(kind) {
  return Object.prototype.hasOwnProperty.call(EFFECT_STEPS, kind) ? EFFECT_STEPS[kind].slice() : []
}

// Main.qml's bots as roster.set rows. Rows the daemon would refuse (and with
// them the whole roster) are left out: a missing or over-long id, a repeated
// id, no name, an agent id or short name over 512 characters.
function rosterParams(bots) {
  var list = Array.isArray(bots) ? bots : []
  var out = []
  var seen = {}
  var i
  for (i = 0; i < list.length && out.length < ROSTER_LIMIT; i++) {
    var bot = list[i]
    if (!isObject(bot)) continue
    var id = str(bot.id)
    var name = str(bot.name)
    var agentId = str(bot.agentId)
    var shortName = str(bot.shortName)
    if (id === "" || id.length > 256 || seen[id] || name === "") continue
    if (agentId.length > 512 || shortName.length > 512) continue
    var provider = bot.provider === "hermes" || bot.provider === "example" ? bot.provider : "grokbot"
    seen[id] = true
    out.push({ id: id, name: name, agentId: agentId, shortName: shortName, provider: provider })
  }
  return out
}

function fileList(files) {
  return stringList(files, ROSTER_LIMIT).filter(function (path) {
    return path !== "" && path.length <= 4096 && path.indexOf("\u0000") < 0
  }).slice(0, FILE_LIMIT)
}
