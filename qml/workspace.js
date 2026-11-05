.pragma library

// Hyprland layer surfaces are bound to a monitor, not a workspace. Layer
// rules match a namespace only (hl.layer_rule / layerrule); a workspace
// match is a window-rule prop and does not map this surface. The companion
// therefore unmaps its PanelWindow unless the monitor it sits on is showing
// the chosen workspace. An unknown id (0, missing) stays mapped so a
// Hyprland socket that has not reported yet cannot hide the companion.
// A drag stays mapped so a drop can finish on another monitor.

var MIN_WORKSPACE = 1
var MAX_WORKSPACE = 10

function normalizeMode(value) {
  return value === "selected" ? "selected" : "all"
}

function normalizeWorkspace(value) {
  var n = Math.round(Number(value))
  if (!isFinite(n)) return MIN_WORKSPACE
  if (n < MIN_WORKSPACE) return MIN_WORKSPACE
  if (n > MAX_WORKSPACE) return MAX_WORKSPACE
  return n
}

// monitors: [{ name, activeWorkspace: { id } | null }]
// focused: { name, id } for the focused monitor, used only when that
// monitor's active workspace has not been reported.
function workspaceIdOn(monitors, name, focused) {
  var wanted = String(name || "")
  var list = monitors || []
  var i
  for (i = 0; i < list.length; i++) {
    var mon = list[i]
    if (!mon || String(mon.name || "") !== wanted) continue
    var ws = mon.activeWorkspace
    var id = ws ? Number(ws.id) : NaN
    if (isFinite(id) && id !== 0) return id
    break
  }
  if (focused && String(focused.name || "") === wanted) {
    var fid = Number(focused.id)
    if (isFinite(fid) && fid !== 0) return fid
  }
  return 0
}

// activeId is the monitor's active workspace id. Negative ids are special
// workspaces and do not match a chosen desktop workspace. dragging keeps
// the surface mapped for the drop.
function layerMapped(mode, selected, activeId, dragging) {
  if (dragging) return true
  if (normalizeMode(mode) !== "selected") return true
  if (activeId === null || activeId === undefined || activeId === "") return true
  var id = Number(activeId)
  if (!isFinite(id) || id === 0) return true
  return id === normalizeWorkspace(selected)
}
