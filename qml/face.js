.pragma library

// Eye geometry for the marks. Each shape carries its own resting eyes,
// measured from Grok Bot's picker: two capsules with a centre, a length, a
// width, and the angle of the long axis. An eye is drawn as a rounded
// rectangle whose corner radius is half its shorter side: open, it is that
// capsule; closing, it flattens into a short lid line instead of shrinking
// to a dot. `rad` is the size of one shape unit in pixels, `open` runs 0
// (shut) to 1, and `heightScale` is the expression's squint.

function eye(spec, rad, open, heightScale) {
  var o = Math.max(0, Math.min(1, Number(open) || 0))
  var baseW = Math.max(1.6, spec.width * rad)
  var fullH = spec.length * rad * (heightScale > 0 ? heightScale : 1)
  var lid = Math.max(1.4, rad * 0.04)
  var h = Math.max(lid, fullH * o)
  // A closing lid reads wider than the open slit.
  var w = baseW * (o < 0.3 ? 1 + (0.3 - o) * 0.6 : 1)
  return { w: w, h: h, r: Math.min(w, h) / 2 }
}

// Rotation for an upright rectangle so its long axis lies along `angle`
// (degrees from +x toward +y, the way shapes.js records it).
function rotation(spec, extraTilt) {
  return spec.angle - 90 + (Number(extraTilt) || 0)
}

// Expressions change the resting eyes: extra tilt in degrees, squint as a
// height scale, and the most the eyes may open. The mark eases between them.
var POSES = {
  idle: { tilt: 0, height: 1, open: 1 },
  sleep: { tilt: 0, height: 1, open: 0.04 },
  think: { tilt: 8, height: 0.62, open: 0.45 },
  alert: { tilt: -6, height: 1.12, open: 1 },
  happy: { tilt: 5, height: 0.72, open: 1 },
  celebrate: { tilt: 5, height: 0.72, open: 1 }
}

function pose(name) {
  return Object.prototype.hasOwnProperty.call(POSES, String(name || "")) ? POSES[name] : POSES.idle
}

// How far the gaze moves the eyes, in shape units, at full deflection.
var GAZE_X = 0.24
var GAZE_Y = 0.18
// Clearance, in shape units, an eye keeps from the edge of the shape.
var GAZE_MARGIN = 0.05

// Signed distance from (px, py) to the outline: positive inside.
function edgeDistance(points, px, py) {
  var n = points.length
  var inside = false
  var best = Infinity
  var i
  for (i = 0; i < n; i++) {
    var a = points[i]
    var b = points[(i + 1) % n]
    if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
    var ex = b[0] - a[0]
    var ey = b[1] - a[1]
    var len = ex * ex + ey * ey
    var t = len > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / len)) : 0
    var dx = px - (a[0] + ex * t)
    var dy = py - (a[1] + ey * t)
    best = Math.min(best, dx * dx + dy * dy)
  }
  best = Math.sqrt(best)
  return inside ? best : -best
}

// The least room any eye has, after shifting both by (sx, sy): the distance
// from the centre line of each capsule to the outline, less its half width.
function clearance(points, eyes, sx, sy) {
  var least = Infinity
  var i
  for (i = 0; i < eyes.length; i++) {
    var e = eyes[i]
    var a = e.angle * Math.PI / 180
    var reach = Math.max(0, e.length - e.width) / 2
    var ux = Math.cos(a) * reach
    var uy = Math.sin(a) * reach
    var cx = e.x + sx
    var cy = e.y + sy
    var room = Math.min(edgeDistance(points, cx - ux, cy - uy),
      edgeDistance(points, cx, cy),
      edgeDistance(points, cx + ux, cy + uy))
    least = Math.min(least, room - e.width / 2)
  }
  return least
}

// Directions the room table samples, evenly around the circle from +x
// toward +y, and the furthest it looks.
var ROOM_DIRECTIONS = 32
var ROOM_LIMIT = 0.4

// How far, in shape units, both eyes can move along `angle` (radians) before
// one of them comes within GAZE_MARGIN of the edge. Eyes that already sit
// closer than that at rest are held to their resting clearance rather than
// frozen.
function roomAlong(points, eyes, angle) {
  var need = Math.min(GAZE_MARGIN, clearance(points, eyes, 0, 0))
  var dx = Math.cos(angle)
  var dy = Math.sin(angle)
  if (clearance(points, eyes, dx * ROOM_LIMIT, dy * ROOM_LIMIT) >= need) return ROOM_LIMIT
  var lo = 0
  var hi = ROOM_LIMIT
  var step
  for (step = 0; step < 9; step++) {
    var mid = (lo + hi) / 2
    if (clearance(points, eyes, dx * mid, dy * mid) >= need) lo = mid
    else hi = mid
  }
  return lo
}

function roomTable(points, eyes) {
  var out = []
  var i
  for (i = 0; i < ROOM_DIRECTIONS; i++) out.push(Math.round(roomAlong(points, eyes, i * 2 * Math.PI / ROOM_DIRECTIONS) * 1000) / 1000)
  return out
}

function roomAt(table, sx, sy) {
  var n = table.length
  var at = Math.atan2(sy, sx) / (2 * Math.PI) * n
  if (at < 0) at += n
  var i = Math.floor(at) % n
  var f = at - Math.floor(at)
  return table[i] + (table[(i + 1) % n] - table[i]) * f
}

function clampShift(table, sx, sy) {
  var len = Math.sqrt(sx * sx + sy * sy)
  if (len < 1e-6) return { x: 0, y: 0 }
  var room = roomAt(table, sx, sy)
  var k = len > room ? room / len : 1
  return { x: sx * k, y: sy * k }
}

// The eye shift, in shape units, for a gaze of (gx, gy) in -1..1: GAZE_X and
// GAZE_Y at full deflection, shortened to the room the table allows. Where
// the edge blocks the straight path (eyes that sit high and to the right,
// as most of Grok Bot's do), the eyes slide along it on whichever axis gets
// them furthest toward the pointer.
function gazeShift(table, gx, gy) {
  var sx = (Number(gx) || 0) * GAZE_X
  var sy = (Number(gy) || 0) * GAZE_Y
  if (!table || table.length === 0) return { x: sx, y: sy }
  var options = [clampShift(table, sx, sy), clampShift(table, sx, 0), clampShift(table, 0, sy)]
  var best = options[0]
  var bestScore = best.x * sx + best.y * sy
  var i
  for (i = 1; i < options.length; i++) {
    var score = options[i].x * sx + options[i].y * sy
    if (score > bestScore + 1e-9) {
      best = options[i]
      bestScore = score
    }
  }
  return best
}
