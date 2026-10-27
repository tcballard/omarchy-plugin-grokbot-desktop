.pragma library

// Closed Grok Bot contours. Every mark is resampled to POINT_COUNT so morphs
// stay point-to-point. Coordinates are centered, y grows downward, and each
// contour fits in [-1, 1].
//
// Square, triangle, diamond, pentagon, hexagon, heptagon, and octagon blend
// 70% of the polygon radius with 30% of a circle. Diamond is that rounded
// square turned onto a point. Bean is the asymmetric organic contour.
// Official avatarShape strings resolve through ALIASES.

var POINT_COUNT = 80

var NAMES = [
  "circle", "square", "triangle", "diamond", "pentagon",
  "hexagon", "octagon", "heptagon", "pill", "cloud",
  "heart", "crescent", "star", "spark", "burst",
  "flower", "clover", "sprout", "drop", "bean",
  "peanut", "pebble", "shield", "ghost", "bolt"
]

var ALIASES = {
  blob: "bean",
  teardrop: "drop",
  hex: "hexagon",
  tablet: "pill",
  wedge: "bolt",
  squircle: "square",
  sparkle: "spark",
  leaf: "sprout",
  egg: "drop",
  capsule: "pill",
  cylinder: "pill",
  gem: "diamond",
  crystal: "diamond",
  dome: "circle",
  arch: "ghost",
  house: "shield"
}

var SIDES = {
  triangle: 3,
  diamond: 4,
  pentagon: 5,
  hexagon: 6,
  heptagon: 7,
  octagon: 8
}

function hypot(dx, dy) {
  return Math.sqrt(dx * dx + dy * dy)
}

function normalize(points, fit) {
  var limit = fit || 0.94
  var max = 0
  var i
  for (i = 0; i < points.length; i++) {
    max = Math.max(max, Math.abs(points[i][0]), Math.abs(points[i][1]))
  }
  if (!(max > 0)) return points.slice()
  var scale = limit / max
  var out = []
  for (i = 0; i < points.length; i++) out.push([points[i][0] * scale, points[i][1] * scale])
  return out
}

function alignTop(points) {
  var best = 0
  var bestY = 1e9
  var bestX = 1e9
  var i
  for (i = 0; i < points.length; i++) {
    var y = points[i][1]
    var x = points[i][0]
    if (y < bestY - 1e-6 || (Math.abs(y - bestY) < 1e-6 && x < bestX)) {
      best = i
      bestY = y
      bestX = x
    }
  }
  if (best === 0) return points.slice()
  return points.slice(best).concat(points.slice(0, best))
}

function resample(points, count) {
  var n = points.length
  var target = count || POINT_COUNT
  if (n < 3) return []
  var lengths = []
  var total = 0
  var i
  for (i = 0; i < n; i++) {
    var a = points[i]
    var b = points[(i + 1) % n]
    var len = hypot(b[0] - a[0], b[1] - a[1])
    lengths.push(len)
    total += len
  }
  if (!(total > 0)) return []
  var out = []
  var cursor = 0
  var acc = 0
  var k
  for (k = 0; k < target; k++) {
    var dist = (total * k) / target
    while (cursor < n - 1 && acc + lengths[cursor] < dist - 1e-9) {
      acc += lengths[cursor]
      cursor++
    }
    var span = lengths[cursor] || 1
    var t = (dist - acc) / span
    if (t < 0) t = 0
    if (t > 1) t = 1
    var p = points[cursor]
    var q = points[(cursor + 1) % n]
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
  }
  return out
}

function finish(raw, eyeY, spread) {
  var shifted = alignTop(normalize(raw, 0.94))
  return {
    points: resample(shifted, POINT_COUNT),
    eyeY: eyeY,
    spread: spread
  }
}

function signedPow(value, exp) {
  return (value < 0 ? -1 : 1) * Math.pow(Math.abs(value), exp)
}

function contour(kind) {
  var pts = []
  var count = 180
  var s = String(kind || "")
  var i
  for (i = 0; i < count; i++) {
    var t = (Math.PI * 2 * i) / count
    var c = Math.cos(t)
    var sn = Math.sin(t)
    var x
    var y
    if (s === "circle") {
      x = c * 0.94
      y = sn * 0.94
    } else if (s === "pill") {
      var pill = 2 / 3.6
      x = signedPow(c, pill) * 0.98
      y = signedPow(sn, pill) * 0.76
    } else if (s === "bean") {
      var bean = 0.88 + 0.1 * Math.sin(t - 0.5) + 0.08 * Math.cos(2 * t - 0.7) - 0.06 * Math.sin(3 * t + 0.4)
      x = c * bean * 1.02
      y = sn * bean * 0.95
    } else if (s === "cloud") {
      var cloud = 0.84 + 0.13 * Math.cos(5 * t - 0.3) + 0.04 * Math.sin(2 * t)
      x = c * cloud
      y = sn * cloud * 0.92
    } else if (s === "flower") {
      var flower = 0.82 + 0.16 * Math.cos(6 * t)
      x = c * flower
      y = sn * flower
    } else if (s === "clover") {
      var clover = 0.81 + 0.18 * Math.cos(4 * t)
      x = c * clover
      y = sn * clover
    } else if (s === "star") {
      var star = 0.79 + 0.2 * Math.cos(5 * t - Math.PI / 2)
      x = c * star
      y = sn * star
    } else if (s === "spark") {
      var spark = 0.77 + 0.22 * Math.cos(4 * t)
      x = c * spark
      y = sn * spark
    } else if (s === "burst") {
      var burst = 0.83 + 0.15 * Math.cos(8 * t)
      x = c * burst
      y = sn * burst
    } else if (s === "peanut") {
      var peanut = 0.84 + 0.16 * Math.cos(2 * t - 0.4)
      x = c * peanut * 1.02
      y = sn * peanut * 0.94
    } else if (s === "pebble") {
      var pebble = 0.89 + 0.08 * Math.cos(2 * t + 0.6) + 0.04 * Math.sin(3 * t)
      x = c * pebble * 1.03
      y = sn * pebble * 0.91
    } else if (s === "drop") {
      var belly = 0.86 + 0.2 * sn - 0.05 * Math.cos(2 * t)
      x = c * belly * 0.96
      y = sn * 0.96 + 0.03 * (1 - sn * sn)
    } else if (s === "heart") {
      x = 0.88 * Math.pow(Math.sin(t), 3)
      y = -0.88 * (0.8125 * Math.cos(t) - 0.3125 * Math.cos(2 * t) - 0.125 * Math.cos(3 * t) - 0.0625 * Math.cos(4 * t)) - 0.04
    } else if (s === "ghost") {
      if (sn > 0.35) {
        x = c * 0.86
        y = sn * 0.91 + 0.07 * Math.cos(6 * t)
      } else {
        x = c * 0.88
        y = sn * 0.93
      }
    } else if (s === "shield") {
      var shield = 0.9 - 0.07 * Math.cos(4 * t) + 0.05 * sn
      x = c * shield * 0.91
      y = sn * shield * 0.95
    } else if (s === "crescent") {
      var crescent = 0.88 + 0.1 * Math.cos(t + 0.6)
      x = c * crescent
      y = sn * crescent
    } else if (s === "sprout") {
      var sprout = 0.85 + 0.12 * Math.sin(2 * t + 0.5) + 0.07 * Math.cos(3 * t)
      x = c * sprout
      y = sn * sprout
    } else if (s === "bolt") {
      var bolt = 0.85 + 0.14 * Math.cos(3 * t - 0.8)
      x = c * bolt * 0.92
      y = sn * bolt
    } else {
      var sides = s === "square" ? 4 : (SIDES[s] || 6)
      var phase = s === "diamond" ? Math.PI / 4 : 0
      var ang = t + Math.PI / 2 + phase
      var sector = (Math.PI * 2) / sides
      var wrapped = (ang + sector / 2) % sector
      if (wrapped < 0) wrapped += sector
      var local = wrapped - sector / 2
      var poly = Math.cos(sector / 2) / Math.cos(local)
      var rad = (0.7 * poly + 0.3) * 0.92
      x = c * rad
      y = sn * rad
    }
    pts.push([x, y])
  }
  return pts
}

function build(name) {
  var eyeY = -0.04
  var spread = 0.3
  if (name === "bean" || name === "drop" || name === "heart") eyeY = -0.1
  if (name === "star" || name === "spark" || name === "burst" || name === "flower") spread = 0.18
  return finish(contour(name), eyeY, spread)
}

var SHAPES = {}
var nameIndex
for (nameIndex = 0; nameIndex < NAMES.length; nameIndex++) SHAPES[NAMES[nameIndex]] = build(NAMES[nameIndex])

var aliasName
for (aliasName in ALIASES) {
  if (Object.prototype.hasOwnProperty.call(ALIASES, aliasName)) SHAPES[aliasName] = SHAPES[ALIASES[aliasName]]
}

function canonical(name) {
  var key = String(name || "")
  if (NAMES.indexOf(key) >= 0) return key
  if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key]
  return ""
}

function known(name) {
  return canonical(name) !== ""
}

function resolve(name) {
  var key = canonical(name)
  return key !== "" ? key : "bean"
}

function get(name) {
  return SHAPES[resolve(name)]
}

// Mean distance each point travels when contour b is read from index
// `offset`. Contours start at their top-most point, which can sit a quarter
// turn apart on two shapes, so pairing indices directly spins the morph.
function travel(a, b, offset) {
  var n = a.length
  var sum = 0
  var k
  for (k = 0; k < n; k++) {
    var q = b[(k + offset) % n]
    sum += hypot(q[0] - a[k][0], q[1] - a[k][1])
  }
  return sum / n
}

function bestOffset(a, b) {
  var best = 0
  var bestCost = Infinity
  var o
  for (o = 0; o < b.length; o++) {
    var cost = travel(a, b, o)
    if (cost < bestCost) {
      bestCost = cost
      best = o
    }
  }
  return best
}

// Contour b rotated so its points pair with a's at the least travel.
function align(a, b) {
  var offset = bestOffset(a, b)
  if (offset === 0) return b
  return b.slice(offset).concat(b.slice(0, offset))
}

var ALIGNED = {}

function alignedPoints(nameA, nameB) {
  var a = resolve(nameA)
  var b = resolve(nameB)
  var key = a + ">" + b
  if (!ALIGNED[key]) ALIGNED[key] = align(SHAPES[a].points, SHAPES[b].points)
  return ALIGNED[key]
}

function mix(a, b, t) {
  var u = t < 0 ? 0 : t > 1 ? 1 : t
  var pts = []
  var k
  for (k = 0; k < a.length; k++) {
    pts.push([
      a[k][0] + (b[k][0] - a[k][0]) * u,
      a[k][1] + (b[k][1] - a[k][1]) * u
    ])
  }
  return pts
}

function blend(nameA, nameB, t) {
  var a = get(nameA)
  var b = get(nameB)
  var u = t < 0 ? 0 : t > 1 ? 1 : t
  return {
    points: mix(a.points, alignedPoints(nameA, nameB), u),
    eyeY: a.eyeY + (b.eyeY - a.eyeY) * u,
    spread: a.spread + (b.spread - a.spread) * u
  }
}

// SVG path for a contour scaled to `rad` around (cx, cy). Each point is a
// quadratic control with the curve passing through the midpoints between
// neighbours, which gives a smooth closed outline.
function svgPath(points, rad, cx, cy) {
  var n = points ? points.length : 0
  if (n < 3) return ""
  function x(p) { return (cx + p[0] * rad).toFixed(2) }
  function y(p) { return (cy + p[1] * rad).toFixed(2) }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
  var start = mid(points[n - 1], points[0])
  var parts = ["M", x(start), y(start)]
  var i
  for (i = 0; i < n; i++) {
    var m = mid(points[i], points[(i + 1) % n])
    parts.push("Q", x(points[i]), y(points[i]), x(m), y(m))
  }
  parts.push("Z")
  return parts.join(" ")
}
