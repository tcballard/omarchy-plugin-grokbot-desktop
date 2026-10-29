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
  // While an ask runs: eyes wide, looking around (Main's work loop).
  work: { tilt: 0, height: 1, open: 1 },
  alert: { tilt: -6, height: 1.12, open: 1 },
  happy: { tilt: 5, height: 0.72, open: 1 },
  celebrate: { tilt: 5, height: 0.72, open: 1 }
}

function pose(name) {
  return Object.prototype.hasOwnProperty.call(POSES, String(name || "")) ? POSES[name] : POSES.idle
}

// Clearance, in shape units, an eye keeps from the edge of the shape.
var GAZE_MARGIN = 0.04

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

// Grok Bot moves an avatar like a head rather than sliding its eyes: the
// eyes travel across the face, shrink and narrow as it turns away, and the
// whole face rolls with the turn. Measured from a 60fps recording of Bob in
// the app's chat header, in units of the body radius:
// - facing you, the eyes are upright and centred, 0.56 apart, 0.72 long and
//   0.36 wide;
// - looking to a side, the pair moves 0.41 across, the eyes shrink to about
//   two thirds of that length and three fifths of that width, and the pair
//   closes to 0.43 apart; looking up or down moves it 0.31 and 0.29 and
//   barely shrinks it;
// - the face rolls by up to 25 degrees with the turn, and the eyes roll with
//   it.
// Bob's picker pose is that face looking up and to the right, rolled -25
// degrees; the picker outlines are taken to carry that roll. Other shapes
// use the same proportions, scaled by their measured eye size, with the face
// placed where the eyes have room (shapeLook below).
var LOOK_X = 0.41
var LOOK_UP = 0.31
var LOOK_DOWN = 0.29
// The app's header draws a small avatar, and its eyes are larger in
// proportion there (0.72 long and 0.36 wide facing you); at desktop size that
// read as staring, so facing you the eyes are about a fifth larger than the
// picker's rather than half again, and shrink less as the face turns, which
// keeps the look up and to the right at the picker's size.
var FRONT_SEP = 0.5
var FRONT_LENGTH = 0.6
var FRONT_WIDTH = 0.29
var PICKER_GAZE = [1, -1]
var PICKER_ROLL = -25
// The mean eye length of the picker's teardrop, which the recording is of.
var PICKER_LENGTH = 0.493

// The roll for a look, in degrees, from the app's tip angles relative to
// facing you: about -25 looking up and to either side, -5 straight up, -10
// to the right, +3 to the left, and none looking down.
function lookRoll(gx, gy) {
  var up = Math.max(0, -gy)
  var side = gx > 0 ? -10 * gx : gx < 0 ? -3 * gx : 0
  return -5 * up - 20 * up * Math.abs(gx) + side * (1 - up)
}

function rotate(x, y, deg) {
  var r = deg * Math.PI / 180
  var c = Math.cos(r)
  var s = Math.sin(r)
  return [x * c - y * s, x * s + y * c]
}

// Area centroid of a closed outline.
function centroid(points) {
  var area = 0
  var cx = 0
  var cy = 0
  var i
  for (i = 0; i < points.length; i++) {
    var a = points[i]
    var b = points[(i + 1) % points.length]
    var cross = a[0] * b[1] - b[0] * a[1]
    area += cross
    cx += (a[0] + b[0]) * cross
    cy += (a[1] + b[1]) * cross
  }
  if (Math.abs(area) < 1e-9) return [0, 0]
  return [cx / (3 * area), cy / (3 * area)]
}

function rotatePoints(points, deg, centre) {
  if (Math.abs(deg) < 1e-6) return points
  var out = []
  var i
  for (i = 0; i < points.length; i++) {
    var p = rotate(points[i][0] - centre[0], points[i][1] - centre[1], deg)
    out.push([centre[0] + p[0], centre[1] + p[1]])
  }
  return out
}

// Grid the per-shape fit tables sample gaze on, from -1 to 1 on each axis.
var FIT_STEPS = 9

// Per-shape look parameters, in shape units of the unrolled (facing) frame:
// `face` is where the eye pair sits when facing you, relative to the body's
// centroid; `size` scales the measured eye proportions to the shape; `fit`
// is a FIT_STEPS x FIT_STEPS grid of how much of each gaze the eyes can take
// before they come within GAZE_MARGIN of the edge.
function shapeLook(points, pickerEyes) {
  var c = centroid(points)
  var facing = rotatePoints(points, -PICKER_ROLL, c)
  var size = (pickerEyes[0].length + pickerEyes[1].length) / 2 / PICKER_LENGTH
  // Where the face must sit for its look up and to the right to be the
  // picker's pose. That is used when the eyes have room there facing you;
  // otherwise the face goes where they have the most room.
  var px = (pickerEyes[0].x + pickerEyes[1].x) / 2
  var py = (pickerEyes[0].y + pickerEyes[1].y) / 2
  var back = rotate(px - c[0], py - c[1], -PICKER_ROLL)
  var pickerFace = [back[0] - size * LOOK_X * PICKER_GAZE[0], back[1] - size * LOOK_UP * PICKER_GAZE[1]]
  // The picker-consistent face is kept only if it leaves the eyes room to
  // look most of the way in every direction.
  if (clearance(facing, frontEyes(c, pickerFace, size), 0, 0) >= GAZE_MARGIN * 2) {
    var kept = lookParams(points, facing, c, pickerFace, size)
    if (Math.min(fitAt(kept.fit, -1, 0), fitAt(kept.fit, 1, 0), fitAt(kept.fit, 0, -1), fitAt(kept.fit, 0, 1)) >= 0.75) return kept
  }
  var best = null
  var x
  var y
  for (y = -0.6; y <= 0.6001; y += 0.02) {
    for (x = -0.3; x <= 0.3001; x += 0.02) {
      var room = clearance(facing, frontEyes(c, [x, y], size), 0, 0) - 0.15 * Math.abs(x) - 0.1 * Math.max(0, y)
      if (!best || room > best.room) best = { room: room, face: [x, y] }
    }
  }
  return lookParams(points, facing, c, best.face, size)
}

function lookParams(points, facing, c, face, size) {
  // Eyes too big for a narrow shape are scaled down until they fit.
  while (size > 0.4 && clearance(facing, frontEyes(c, face, size), 0, 0) < GAZE_MARGIN * 2) size *= 0.95
  var params = { face: [round3(face[0]), round3(face[1])], size: round3(size), fit: [] }
  var front = clearance(facing, frontEyes(c, params.face, params.size), 0, 0)
  var need = Math.min(GAZE_MARGIN, front)
  var i
  var j
  for (j = 0; j < FIT_STEPS; j++) {
    for (i = 0; i < FIT_STEPS; i++) {
      var gx = -1 + 2 * i / (FIT_STEPS - 1)
      var gy = -1 + 2 * j / (FIT_STEPS - 1)
      params.fit.push(round3(fitAlong(points, params, gx, gy, need)))
    }
  }
  return params
}

function round3(v) {
  return Math.round(v * 1000) / 1000
}

function frontEyes(c, face, size) {
  return look(null, { face: face, size: size }, 0, 0, c).eyes
}

function fitAlong(points, params, gx, gy, need) {
  function ok(f) {
    var turned = look(points, params, gx * f, gy * f)
    return clearance(rotatePoints(points, turned.turn, turned.centre), turned.eyes, 0, 0) >= need
  }
  if (ok(1)) return 1
  var lo = 0
  var hi = 1
  var step
  for (step = 0; step < 8; step++) {
    var mid = (lo + hi) / 2
    if (ok(mid)) lo = mid
    else hi = mid
  }
  return lo
}

// Share of the gaze (gx, gy) a shape's eyes can take, read from its fit grid.
function fitAt(fit, gx, gy) {
  if (!fit || fit.length !== FIT_STEPS * FIT_STEPS) return 1
  var n = FIT_STEPS - 1
  var fx = (Math.max(-1, Math.min(1, gx)) + 1) / 2 * n
  var fy = (Math.max(-1, Math.min(1, gy)) + 1) / 2 * n
  var i = Math.min(n - 1, Math.floor(fx))
  var j = Math.min(n - 1, Math.floor(fy))
  var u = fx - i
  var v = fy - j
  function at(a, b) { return fit[b * FIT_STEPS + a] }
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v
}

// The face turned toward a gaze of (gx, gy), each -1..1 with +y down:
// { roll, turn, centre, eyes }. `turn` is the rotation to give the picker
// outline about `centre`, and `eyes` are in the picker's frame. `centre` may
// be passed when the outline is not.
function look(points, params, gx, gy, centre) {
  var fit = fitAt(params.fit, Number(gx) || 0, Number(gy) || 0)
  var x = Math.max(-1, Math.min(1, (Number(gx) || 0) * fit))
  var y = Math.max(-1, Math.min(1, (Number(gy) || 0) * fit))
  var c = centre || centroid(points)
  var k = params.size
  var roll = lookRoll(x, y)
  var o = [k * LOOK_X * x, k * (y < 0 ? LOOK_UP : LOOK_DOWN) * y]
  var pair = rotate(params.face[0] + o[0], params.face[1] + o[1], roll)
  var sep = k * (FRONT_SEP - 0.07 * Math.abs(x))
  var half = rotate(sep / 2, 0, roll)
  var length = k * FRONT_LENGTH * (1 - 0.12 * Math.abs(x)) * (1 - 0.07 * Math.abs(y))
  var width = k * FRONT_WIDTH * (1 - 0.3 * Math.abs(x))
  var angle = 90 + 1.05 * roll
  var eyes = []
  var side
  for (side = -1; side <= 1; side += 2) {
    eyes.push({
      x: c[0] + pair[0] + side * half[0],
      y: c[1] + pair[1] + side * half[1],
      length: length,
      // The eye on the far side of the turn is the narrower one.
      width: width * (1 - 0.18 * x * side),
      angle: angle
    })
  }
  return { roll: roll, turn: roll - PICKER_ROLL, centre: c, eyes: eyes }
}

// Blend two shapes' look parameters through a morph.
function mixLook(a, b, t) {
  if (!a || !b) return a || b
  var u = t < 0 ? 0 : t > 1 ? 1 : t
  if (u <= 0) return a
  if (u >= 1) return b
  var fit = []
  var i
  for (i = 0; i < a.fit.length; i++) fit.push(a.fit[i] + (b.fit[i] - a.fit[i]) * u)
  return {
    face: [a.face[0] + (b.face[0] - a.face[0]) * u, a.face[1] + (b.face[1] - a.face[1]) * u],
    size: a.size + (b.size - a.size) * u,
    fit: fit
  }
}
