.pragma library

// Normalized closed contours for the Grok Bot avatar marks.
// Every shape is resampled to POINT_COUNT so morphing is point-to-point.
// Coordinates are centered, y grows downward, and each contour fits in [-1, 1].

var POINT_COUNT = 80

var NAMES = [
  "blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule", "cylinder",
  "hex", "gem", "crystal", "wedge", "shield", "dome", "arch", "cloud",
  "teardrop", "leaf", "square", "sparkle", "clover", "flower", "heart",
  "house", "star"
]

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

function superellipse(n, rx, ry) {
  var pts = []
  var count = 180
  var i
  for (i = 0; i < count; i++) {
    var t = (Math.PI * 2 * i) / count
    var c = Math.cos(t)
    var s = Math.sin(t)
    var x = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n) * rx
    var y = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n) * ry
    pts.push([x, y])
  }
  return pts
}

function roundedRect(hw, hh, radius) {
  var r = Math.min(radius, hw, hh)
  var pts = []
  function corner(cx, cy, a0, a1) {
    var steps = 14
    var i
    for (i = 0; i <= steps; i++) {
      var a = a0 + (a1 - a0) * (i / steps)
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  corner(hw - r, -hh + r, -Math.PI / 2, 0)
  corner(hw - r, hh - r, 0, Math.PI / 2)
  corner(-hw + r, hh - r, Math.PI / 2, Math.PI)
  corner(-hw + r, -hh + r, Math.PI, Math.PI * 1.5)
  return pts
}

function regular(sides, radius, rotation) {
  var pts = []
  var i
  for (i = 0; i < sides; i++) {
    var a = rotation + (Math.PI * 2 * i) / sides
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius])
  }
  return pts
}

function star(points, outer, inner, rotation) {
  var pts = []
  var i
  for (i = 0; i < points * 2; i++) {
    var a = rotation + (Math.PI * i) / points
    var r = i % 2 === 0 ? outer : inner
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

function polar(fn, count) {
  var pts = []
  var n = count || 200
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var r = fn(t)
    pts.push([Math.cos(t) * r, Math.sin(t) * r])
  }
  return pts
}

function blob() {
  return polar(function (t) {
    return 0.8 + 0.09 * Math.sin(3 * t) + 0.05 * Math.cos(5 * t + 0.5) + 0.03 * Math.sin(2 * t + 1.1)
  })
}

function pebble() {
  var pts = []
  var n = 180
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var r = 0.9 + 0.045 * Math.sin(2 * t + 0.4) + 0.03 * Math.cos(3 * t)
    pts.push([Math.cos(t) * r * 1.08, Math.sin(t) * r * 0.7])
  }
  return pts
}

function bean() {
  var pts = []
  var n = 220
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var dent = Math.pow(Math.max(0, Math.cos(t - 0.55)), 8)
    var r = 0.86 * (1 - 0.36 * dent)
    pts.push([Math.cos(t) * r * 0.7 + 0.04, Math.sin(t) * r])
  }
  return pts
}

function egg() {
  var pts = []
  var n = 180
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var widen = 0.62 + 0.28 * (1 + Math.sin(t)) / 2
    pts.push([Math.cos(t) * 0.66, Math.sin(t) * widen])
  }
  return pts
}

function cloud() {
  var pts = []
  var n = 240
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var r = 0.58
      + 0.2 * Math.pow(Math.max(0, Math.cos(t * 3 - 0.3)), 1.15)
      + 0.12 * Math.pow(Math.max(0, Math.cos(t * 2 + 1.1)), 1.3)
      + 0.05 * Math.cos(t + 0.4)
    pts.push([Math.cos(t) * r * 1.2, Math.sin(t) * r * 0.7])
  }
  return pts
}

function dome() {
  var pts = []
  var steps = 48
  var i
  for (i = 0; i <= steps; i++) {
    var a = Math.PI + (Math.PI * i) / steps
    pts.push([Math.cos(a) * 0.9, Math.sin(a) * 0.72 + 0.12])
  }
  pts.push([0.9, 0.8])
  pts.push([-0.9, 0.8])
  return pts
}

function arch() {
  var pts = []
  var steps = 40
  var i
  pts.push([-0.58, 0.92])
  pts.push([-0.58, 0.02])
  for (i = 0; i <= steps; i++) {
    var a = Math.PI + (Math.PI * i) / steps
    pts.push([Math.cos(a) * 0.58, Math.sin(a) * 0.82 + 0.02])
  }
  pts.push([0.58, 0.92])
  return pts
}

function teardrop() {
  var pts = []
  var steps = 42
  var i
  for (i = 0; i <= steps; i++) {
    var a = Math.PI + (Math.PI * i) / steps
    pts.push([Math.cos(a) * 0.72, Math.sin(a) * 0.58 - 0.22])
  }
  pts.push([0, 0.98])
  return pts
}

function leaf() {
  var pts = []
  var n = 180
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var x = Math.sin(t) * 0.38 * (0.45 + 0.55 * Math.cos(t) * Math.cos(t))
    var y = -Math.cos(t) * 0.92
    var c = Math.cos(0.55)
    var s = Math.sin(0.55)
    pts.push([x * c - y * s, x * s + y * c])
  }
  return pts
}

function heart() {
  var pts = []
  var n = 220
  var i
  for (i = 0; i < n; i++) {
    var t = (Math.PI * 2 * i) / n
    var x = 16 * Math.pow(Math.sin(t), 3)
    var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    pts.push([x, y])
  }
  return pts
}

function shield() {
  var pts = []
  var i
  pts.push([-0.78, -0.72])
  pts.push([0.78, -0.72])
  for (i = 0; i <= 28; i++) {
    var t = i / 28
    pts.push([0.78 * (1 - Math.pow(t, 1.45)), -0.72 + t * 1.66])
  }
  for (i = 1; i <= 28; i++) {
    var u = i / 28
    pts.push([-0.78 * Math.pow(u, 1.45), 0.94 - u * 1.66])
  }
  return pts
}

function crystal() {
  return [
    [0, -1],
    [0.42, -0.28],
    [0.55, 0.42],
    [0.18, 0.96],
    [-0.18, 0.96],
    [-0.55, 0.42],
    [-0.42, -0.28]
  ]
}

function gem() {
  return [
    [0, -0.98],
    [0.62, -0.42],
    [0.78, 0.18],
    [0.28, 0.92],
    [-0.28, 0.92],
    [-0.78, 0.18],
    [-0.62, -0.42]
  ]
}

function wedge() {
  var pts = []
  var n = 24
  var i
  pts.push([-0.82, -0.62])
  for (i = 0; i <= n; i++) {
    var t = i / n
    var y = -0.62 + t * 1.24
    var bulge = Math.sin(t * Math.PI) * 0.08
    pts.push([-0.82 - bulge, y])
  }
  pts.push([0.98, 0])
  return pts
}

function house() {
  return [
    [-0.78, 0.82],
    [0.78, 0.82],
    [0.78, -0.02],
    [0, -0.9],
    [-0.78, -0.02]
  ]
}

function clover() {
  return polar(function (t) {
    return 0.28 + 0.62 * Math.pow((Math.cos(2 * t) + 1) / 2, 1.35)
  }, 240)
}

function flower() {
  return polar(function (t) {
    return 0.32 + 0.58 * Math.pow(Math.max(0, Math.cos(3 * t)), 0.55)
  }, 240)
}

var BUILDERS = {
  blob: function () { return finish(blob(), -0.08, 0.34) },
  pebble: function () { return finish(pebble(), -0.02, 0.32) },
  bean: function () { return finish(bean(), -0.08, 0.28) },
  egg: function () { return finish(egg(), -0.18, 0.28) },
  squircle: function () { return finish(superellipse(4, 0.9, 0.9), -0.06, 0.32) },
  tablet: function () { return finish(roundedRect(0.96, 0.64, 0.24), -0.04, 0.4) },
  capsule: function () { return finish(roundedRect(0.98, 0.5, 0.5), 0.0, 0.42) },
  cylinder: function () { return finish(roundedRect(0.5, 0.96, 0.2), -0.12, 0.26) },
  hex: function () { return finish(regular(6, 0.92, -Math.PI / 2), -0.04, 0.3) },
  gem: function () { return finish(gem(), -0.1, 0.26) },
  crystal: function () { return finish(crystal(), -0.2, 0.24) },
  wedge: function () { return finish(wedge(), 0.0, 0.26) },
  shield: function () { return finish(shield(), -0.16, 0.3) },
  dome: function () { return finish(dome(), -0.22, 0.34) },
  arch: function () { return finish(arch(), -0.28, 0.26) },
  cloud: function () { return finish(cloud(), -0.06, 0.36) },
  teardrop: function () { return finish(teardrop(), -0.32, 0.28) },
  leaf: function () { return finish(leaf(), -0.08, 0.2) },
  square: function () { return finish(superellipse(18, 0.86, 0.86), -0.04, 0.32) },
  sparkle: function () { return finish(star(4, 0.98, 0.18, -Math.PI / 2), 0.0, 0.16) },
  clover: function () { return finish(clover(), 0.0, 0.18) },
  flower: function () { return finish(flower(), 0.0, 0.16) },
  heart: function () { return finish(heart(), 0.05, 0.26) },
  house: function () { return finish(house(), 0.12, 0.3) },
  star: function () { return finish(star(5, 0.98, 0.4, -Math.PI / 2), -0.02, 0.18) }
}

var SHAPES = {}
var i
for (i = 0; i < NAMES.length; i++) SHAPES[NAMES[i]] = BUILDERS[NAMES[i]]()

function known(name) {
  return Object.prototype.hasOwnProperty.call(SHAPES, String(name || ""))
}

function get(name) {
  return known(name) ? SHAPES[name] : SHAPES.blob
}

function blend(nameA, nameB, t) {
  var a = get(nameA)
  var b = get(nameB)
  var u = t < 0 ? 0 : t > 1 ? 1 : t
  var pts = []
  var n = POINT_COUNT
  var k
  for (k = 0; k < n; k++) {
    pts.push([
      a.points[k][0] + (b.points[k][0] - a.points[k][0]) * u,
      a.points[k][1] + (b.points[k][1] - a.points[k][1]) * u
    ])
  }
  return {
    points: pts,
    eyeY: a.eyeY + (b.eyeY - a.eyeY) * u,
    spread: a.spread + (b.spread - a.spread) * u
  }
}
