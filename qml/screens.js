.pragma library

// Which output the companion uses. Screens are plain
// { name, x, y, width, height } in the same logical pixels Hyprland's
// cursorpos uses. Ranges are half-open, so a shared edge belongs to the
// output that starts there.

function contains(screen, x, y) {
  if (!screen) return false
  var left = Number(screen.x) || 0
  var top = Number(screen.y) || 0
  var w = Number(screen.width) || 0
  var h = Number(screen.height) || 0
  return x >= left && y >= top && x < left + w && y < top + h
}

function atPoint(screens, x, y) {
  var list = screens || []
  var i
  for (i = 0; i < list.length; i++) if (contains(list[i], x, y)) return list[i]
  return null
}

function byName(screens, name) {
  if (!name) return null
  var list = screens || []
  var i
  for (i = 0; i < list.length; i++) if (list[i] && list[i].name === name) return list[i]
  return null
}

function snapshot(screen) {
  if (!screen) return null
  return {
    name: String(screen.name || ""),
    x: Number(screen.x) || 0,
    y: Number(screen.y) || 0,
    width: Number(screen.width) || 0,
    height: Number(screen.height) || 0
  }
}

// carry: screen the pointer is being dragged onto. It wins over pin so a
// drag can leave the output the mark was sitting on.
// pin: output name the mark stays on after a drop, or "".
// focused: { name, x, y } or null, used only when nothing is pinned.
function choose(screens, pin, carry, focused) {
  if (carry && carry.name) {
    var carried = byName(screens, carry.name)
    if (carried) return carried
  }
  var pinned = byName(screens, pin)
  if (pinned) return pinned
  if (focused) {
    var named = byName(screens, focused.name)
    if (named) return named
    var around = atPoint(screens, (Number(focused.x) || 0) + 1, (Number(focused.y) || 0) + 1)
    if (around) return around
  }
  return screens && screens.length > 0 ? screens[0] : null
}

// Margins from the anchor corner so the stage's top-left is (stageX, stageY)
// and the grab point inside the stage stays under the global pointer.
function place(screen, fromRight, fromBottom, stageW, stageH, grabX, grabY, gx, gy) {
  var maxX = Math.max(0, screen.width - stageW)
  var maxY = Math.max(0, screen.height - stageH)
  var stageX = Math.max(0, Math.min(maxX, gx - screen.x - grabX))
  var stageY = Math.max(0, Math.min(maxY, gy - screen.y - grabY))
  return {
    x: Math.round(fromRight ? screen.width - stageW - stageX : stageX),
    y: Math.round(fromBottom ? screen.height - stageH - stageY : stageY)
  }
}
