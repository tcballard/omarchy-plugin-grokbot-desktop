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
