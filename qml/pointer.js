.pragma library

// Small pure helpers for Hyprland window events, the scroll wheel and the
// cursor helper's button reports. Nothing here touches QML objects.

// Hyprland's socket events name a window "55d1c0a2b3f0", while
// `hyprctl -j clients` gives "0x55d1c0a2b3f0". One spelling for both.
function windowAddress(value) {
  var text = String(value === undefined || value === null ? "" : value).trim().toLowerCase()
  if (text.indexOf("0x") === 0) text = text.slice(2)
  return /^[0-9a-f]{1,32}$/.test(text) ? text : ""
}

// One roster step per notch: 120 units of angleDelta. A touchpad sends many
// small deltas, so they add up first. A change of direction, or a pause
// longer than WHEEL_IDLE_MS, starts the count again.
var WHEEL_NOTCH = 120
var WHEEL_IDLE_MS = 400

function wheelStart() {
  return { acc: 0, at: 0 }
}

// Returns { state, steps }. Positive delta (scrolling up) steps back through
// the roster, so steps is negative for it, as the mark has always done.
function wheelStep(state, delta, now) {
  var acc = state ? Number(state.acc) || 0 : 0
  var at = state ? Number(state.at) || 0 : 0
  var d = Number(delta) || 0
  var t = Number(now) || 0
  if (d === 0) return { state: { acc: acc, at: at }, steps: 0 }
  if (t - at > WHEEL_IDLE_MS || t < at || (acc > 0 && d < 0) || (acc < 0 && d > 0)) acc = 0
  acc += d
  var notches = acc > 0 ? Math.floor(acc / WHEEL_NOTCH) : -Math.floor(-acc / WHEEL_NOTCH)
  acc -= notches * WHEEL_NOTCH
  return { state: { acc: acc, at: t }, steps: notches === 0 ? 0 : -notches }
}

// The cursor helper says once whether it could open a mouse event node:
// "buttons 1" or "buttons 0". A "down" or "up" also proves it can see the
// button. Returns true or false for those lines and null for anything else.
function buttonsReport(line) {
  var text = String(line === undefined || line === null ? "" : line).trim()
  if (text === "buttons 1" || text === "down" || text === "up") return true
  if (text === "buttons 0") return false
  return null
}

// A press cancelled at the output edge ends the drag unless the helper can
// see the button and says it is still held. An older helper that never
// reported counts as unable to see it, since no "up" would ever come.
function cancelEndsDrag(pointerHeld, buttonsVisible) {
  return buttonsVisible !== true || pointerHeld !== true
}
